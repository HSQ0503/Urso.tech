#!/usr/bin/env node

// /api/v1 acceptance — the regression net for the mobile API (Phase 6).
//
// The point of this script is the AUTO-DISCOVERY: it walks app/api/v1/**/route.ts
// and asserts the auth contract against every endpoint it finds. A route added
// later that forgets the apiRoute() wrapper — or hand-rolls its own auth — fails
// here without anyone remembering to add a test for it. That is the whole
// reason it enumerates the filesystem instead of listing paths.
//
// Usage:
//   node scripts/api-v1-acceptance.mjs                       # against :3220
//   node scripts/api-v1-acceptance.mjs --base=http://localhost:3200
//   node scripts/api-v1-acceptance.mjs --json
//
// The server must already be running (launch config "canes-api" on :3220 sets
// URSO_AUTH_SECRET to a known preview value so admin tokens can be minted).
// Nothing here mutates data: every request is unauthenticated or carries a
// token that must be rejected, so it is safe against a live deployment.

import { createHmac } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

for (const file of ["../.env", "../.env.local"]) {
  try {
    const env = readFileSync(new URL(file, import.meta.url), "utf8");
    for (const line of env.split("\n")) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
      if (!match || process.env[match[1]]) continue;
      process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2");
    }
  } catch {}
}

const args = process.argv.slice(2);
const jsonOutput = args.includes("--json");
const arg = (name, fallback) =>
  args.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=") || fallback;

const BASE = arg("base", "http://localhost:3220").replace(/\/$/, "");

// The admin-surface checks need tokens the TARGET deployment will actually
// verify, which means its own URSO_AUTH_SECRET. Locally that is the known
// preview value from the "canes-api" launch config. Against production we do
// not have it, and a token signed with the wrong key is indistinguishable from
// a token that is simply invalid — the server answers 401 either way, which is
// correct behaviour, not a defect.
//
// So those checks are SKIPPED unless the secret was supplied explicitly. A
// suite that reports ten red failures every time it runs against prod teaches
// people to ignore it, which costs more than the checks are worth.
const explicitSecret = args.some((a) => a.startsWith("--secret=")) || Boolean(process.env.URSO_AUTH_SECRET);
const PREVIEW_SECRET = "preview-only-secret-not-used-anywhere-real";
const SECRET = arg("secret", process.env.URSO_AUTH_SECRET || PREVIEW_SECRET);
const isLocal = /localhost|127\.0\.0\.1/.test(BASE);
const canMintAdmin = explicitSecret || isLocal;
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const V1_DIR = join(ROOT, "app/api/v1");

// A syntactically valid UUID that will never exist — dynamic segments need a
// well-formed value so a 401/403 proves the AUTH gate fired, not a parse error.
const NONEXISTENT = "00000000-0000-4000-8000-000000000000";

const checks = [];
const record = (status, name, detail) => checks.push({ status, name, detail });

// ── Discover every v1 route from the filesystem ──────────────────────────────

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry === "route.ts") out.push(full);
  }
  return out;
}

function discover() {
  let files;
  try {
    files = walk(V1_DIR);
  } catch {
    return [];
  }
  return files.map((file) => {
    const source = readFileSync(file, "utf8");
    const methods = [...source.matchAll(/export const (GET|POST|PATCH|PUT|DELETE)\b/g)].map((m) => m[1]);
    const segments = relative(join(ROOT, "app"), file).replace(/\/route\.ts$/, "");
    const urlPath = "/" + segments.replace(/\[([^\]]+)\]/g, NONEXISTENT);
    return {
      file: relative(ROOT, file),
      path: urlPath,
      methods: methods.length ? methods : ["GET"],
      // Routes under .../crew/... are the technician surface; an admin bearer
      // must be refused there (403) because an admin has no crew identity.
      isCrew: urlPath.includes("/crew/"),
      // Every route must go through a shared wrapper. crewRoute() is apiRoute()
      // plus an up-front technician assertion; anything else means a route is
      // hand-rolling its own auth, which is the failure this check exists for.
      usesWrapper: /\b(apiRoute|crewRoute)\s*[(<]/.test(source),
    };
  });
}

// ── Token minting ────────────────────────────────────────────────────────────

function mint(payload, secret = SECRET) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`;
}

const HOUR = 60 * 60 * 1000;
const TOKENS = {
  none: null,
  garbage: "not-a-token",
  forged: mint({ email: "han@urso.ws", exp: Date.now() + HOUR, k: "mobile" }, "wrong-secret"),
  expired: mint({ email: "han@urso.ws", exp: Date.now() - 1000, k: "mobile" }),
  notAdmin: mint({ email: "attacker@example.com", exp: Date.now() + HOUR, k: "mobile" }),
  wrongKindSession: mint({ email: "han@urso.ws", scope: "admin", exp: Date.now() + HOUR, k: "session" }),
  wrongKindMagic: mint({ email: "han@urso.ws", exp: Date.now() + HOUR, k: "magic" }),
  noExp: mint({ email: "han@urso.ws", k: "mobile" }),
};
const ADMIN_TOKEN = mint({ email: "han@urso.ws", exp: Date.now() + HOUR, k: "mobile" });

async function hit(path, method, token) {
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  // Bodies are intentionally omitted: a rejected request must never reach the
  // handler, so a missing body proves the gate fired before any parsing.
  const res = await fetch(`${BASE}${path}`, { method, headers });
  let body = null;
  try {
    body = await res.json();
  } catch {}
  return { status: res.status, body, version: res.headers.get("x-urso-api-version") };
}

// ── Run ──────────────────────────────────────────────────────────────────────

const routes = discover();

if (routes.length === 0) {
  console.error(`No routes found under ${V1_DIR}`);
  process.exit(2);
}

let reachable = true;
try {
  await fetch(`${BASE}/api/v1/canes/crew/me`);
} catch {
  reachable = false;
}
if (!reachable) {
  console.error(`Cannot reach ${BASE}. Start the "canes-api" launch config first.`);
  process.exit(2);
}

// Demo deployments short-circuit everything with 503 before authenticating.
const probe = await hit("/api/v1/canes/crew/me", "GET", null);
const DEMO = probe.status === 503;
if (DEMO) {
  record("info", "demo mode", "Server is in demo mode — asserting 503-before-auth on every route.");
}

for (const route of routes) {
  if (!route.usesWrapper) {
    record("fail", `${route.file} uses apiRoute()`, "Route does not call apiRoute() — auth is not enforced by the shared wrapper.");
  } else {
    record("pass", `${route.file} uses apiRoute()`, "wrapped");
  }

  for (const method of route.methods) {
    const label = `${method} ${route.path.replace(NONEXISTENT, ":id")}`;

    if (DEMO) {
      const res = await hit(route.path, method, ADMIN_TOKEN);
      record(res.status === 503 ? "pass" : "fail", `${label} — demo 503`, `got ${res.status}`);
      continue;
    }

    // Every rejection variant must be 401. Never 200, never 500.
    for (const [name, token] of Object.entries(TOKENS)) {
      const res = await hit(route.path, method, token);
      const ok = res.status === 401;
      record(
        ok ? "pass" : "fail",
        `${label} — rejects ${name}`,
        ok ? "401" : `expected 401, got ${res.status} ${JSON.stringify(res.body)}`,
      );
    }

    // Version header must be present even on rejections, so a client can detect
    // a major API change while signed out.
    const headerProbe = await hit(route.path, method, null);
    record(
      headerProbe.version === "1" ? "pass" : "fail",
      `${label} — sends X-Urso-Api-Version`,
      headerProbe.version ?? "absent",
    );

    // A valid ADMIN token on a crew endpoint must be refused: admins have no
    // crew identity. 403 (authenticated, wrong surface), never 200.
    if (route.isCrew && canMintAdmin) {
      const res = await hit(route.path, method, ADMIN_TOKEN);
      const ok = res.status === 403;
      record(
        ok ? "pass" : "fail",
        `${label} — admin bearer refused on crew surface`,
        ok ? "403" : `expected 403, got ${res.status} ${JSON.stringify(res.body)}`,
      );
    } else if (route.isCrew) {
      record(
        "skip",
        `${label} — admin bearer refused on crew surface`,
        "needs this deployment's URSO_AUTH_SECRET; pass --secret=… to enable",
      );
    }
  }
}

// ── Report ───────────────────────────────────────────────────────────────────

const failed = checks.filter((c) => c.status === "fail");
const passed = checks.filter((c) => c.status === "pass");
const skipped = checks.filter((c) => c.status === "skip");

if (jsonOutput) {
  console.log(JSON.stringify({ base: BASE, demo: DEMO, routes: routes.length, checks }, null, 2));
} else {
  console.log(`\n/api/v1 acceptance — ${BASE}${DEMO ? "  (DEMO MODE)" : ""}`);
  console.log(`${routes.length} route file(s) discovered\n`);
  for (const route of routes) console.log(`  · ${route.methods.join("/")} ${route.path.replace(NONEXISTENT, ":id")}`);
  console.log("");
  for (const c of failed) console.log(`  FAIL  ${c.name} — ${c.detail}`);
  if (skipped.length > 0) {
    console.log(`  ${skipped.length} check(s) skipped — ${skipped[0].detail}`);
  }
  if (failed.length === 0) console.log("  all checks passed");
  console.log(
    `\n${passed.length} passed, ${failed.length} failed${skipped.length ? `, ${skipped.length} skipped` : ""}\n`,
  );
}

process.exit(failed.length > 0 ? 1 : 0);
