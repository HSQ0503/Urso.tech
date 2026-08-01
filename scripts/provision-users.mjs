// Provision the real dashboard accounts: Supabase Auth users + app_users
// membership rows (migration 0013). This is the ONLY way accounts get created —
// the app has no self-signup. Idempotent: existing auth users keep their
// password; membership rows are upserted to match the directory below.
//   Run:  node scripts/provision-users.mjs
// New accounts get a generated password, printed ONCE at the end — share it
// over a secure channel and have people change it later.
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

// Load .env.local with no dependency, so this works on any Node version.
try {
  const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error("✖ Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY in .env.local");
  process.exit(1);
}
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

// --brain-twins additionally mirrors the directory into the Urso HQ Brain as
// twin identities (org 'woof-gang'). Without the flag, behavior is unchanged.
const BRAIN_TWINS = process.argv.includes("--brain-twins");

// The account directory — same people as the old mock identities.
const DIRECTORY = [
  { email: "han@urso.tech", name: "Han · Urso", role: "urso_admin", store: null },
  { email: "guga@urso.ws", name: "Guga · Urso", role: "urso_admin", store: null },
  { email: "rubens@woofgangbakery.com", name: "Rubens Campos", role: "owner", store: null },
  { email: "winterpark@woofgangbakery.com", name: "Winter Park manager", role: "manager", store: "wp" },
  { email: "wintergarden@woofgangbakery.com", name: "Winter Garden manager", role: "manager", store: "wg" },
  { email: "lakeside@woofgangbakery.com", name: "Lakeside manager", role: "manager", store: "lv" },
  { email: "windermere@woofgangbakery.com", name: "Windermere manager", role: "manager", store: "wm" },
];

const { data: client, error: clientErr } = await admin.from("clients").select("id").eq("slug", "woof-gang").single();
if (clientErr) {
  console.error("✖ Could not read clients table:", clientErr.message, "\n  (run supabase/migrations/0001_tenancy.sql)");
  process.exit(1);
}

// One page covers us for years at 6 accounts; revisit if the platform grows.
const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (listErr) {
  console.error("✖ Could not list auth users:", listErr.message);
  process.exit(1);
}
const byEmail = new Map(list.users.map((u) => [u.email?.toLowerCase(), u]));

const results = [];
for (const person of DIRECTORY) {
  const existing = byEmail.get(person.email);
  let userId = existing?.id;
  let password = null;

  if (!userId) {
    password = randomBytes(12).toString("base64url");
    // email_confirm marks the address verified — these are accounts we hand
    // out ourselves, no confirmation email round-trip.
    const { data, error } = await admin.auth.admin.createUser({
      email: person.email,
      password,
      email_confirm: true,
    });
    if (error) {
      console.error(`✖ ${person.email}: createUser failed — ${error.message}`);
      process.exit(1);
    }
    userId = data.user.id;
  }

  const { error: upsertErr } = await admin.from("app_users").upsert(
    {
      user_id: userId,
      email: person.email,
      name: person.name,
      role: person.role,
      client_id: person.role === "urso_admin" ? null : client.id,
      store_id: person.store,
    },
    { onConflict: "user_id" },
  );
  if (upsertErr) {
    console.error(`✖ ${person.email}: membership upsert failed — ${upsertErr.message}\n  (run supabase/migrations/0013_app_users.sql)`);
    process.exit(1);
  }

  results.push({ ...person, password, userId });
}

console.log("\n✓ Provisioned — auth users + app_users membership:\n");
for (const r of results) {
  const cred = r.password ? `password: ${r.password}` : "already existed — password unchanged";
  console.log(`  ${r.role.padEnd(10)} ${(r.store ?? "—").padEnd(3)} ${r.email.padEnd(36)} ${cred}`);
}
console.log("\n  Passwords above are shown ONCE — store them somewhere safe.");
console.log("  Reminder: disable public sign-ups in Supabase → Auth → Sign In/Up.\n");

// ── Brain twins (--brain-twins) ──────────────────────────────────────────────
// Mirror each WG directory person into the Urso HQ Brain (org 'woof-gang') so
// they can use /brain?org=woof-gang with their dashboard identity.
//
// IMPORTANT: the `wg:${wgAuthUid}` namespaced ids are safe because
// brain_profiles and brain_memberships key on PLAIN TEXT user_id with NO
// foreign key to auth.users — verified in supabase/urso/0001_brain.sql
// (user_id text) and 0002_company_brain.sql (PK (organization_id, user_id)).
// The namespace also guarantees a WG dashboard uid can never collide with a
// real Urso HQ auth uid.
if (BRAIN_TWINS) {
  const hqUrl = process.env.NEXT_PUBLIC_URSO_SUPABASE_URL;
  const hqKey = process.env.URSO_SUPABASE_SECRET_KEY;
  if (!hqUrl || !hqKey) {
    console.error("✖ --brain-twins needs NEXT_PUBLIC_URSO_SUPABASE_URL / URSO_SUPABASE_SECRET_KEY in .env.local (the Urso HQ project).");
    process.exit(1);
  }
  const hq = createClient(hqUrl, hqKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const ORG = "woof-gang";

  // The org + department land via supabase/urso/0010 — probe at runtime
  // instead of hardcoding the department slug.
  const { data: depts, error: deptErr } = await hq
    .from("brain_departments").select("id").eq("organization_id", ORG).order("sort").limit(1);
  if (deptErr || !depts?.length) {
    console.error(
      `✖ Brain org '${ORG}' has no departments${deptErr ? ` (${deptErr.message})` : ""} — apply supabase/urso/0010 first.`,
    );
    process.exit(1);
  }
  const deptId = depts[0].id;

  // Dashboard roles map DOWN in the Brain: owners read+propose, managers only
  // read, and the urso_admin steward administers the org.
  const BRAIN_ROLE = { owner: "member", manager: "viewer", urso_admin: "org_admin" };
  const ROLE_LABEL = { owner: "Owner", manager: "Store manager", urso_admin: "Urso admin" };

  const twinRows = [];
  const upsertIdentity = async (userId, name, title, role) => {
    const { error: pErr } = await hq.from("brain_profiles").upsert(
      { organization_id: ORG, user_id: userId, name, title, department_id: deptId },
      { onConflict: "organization_id,user_id" },
    );
    if (pErr) {
      console.error(`✖ ${userId}: brain_profiles upsert failed — ${pErr.message}`);
      process.exit(1);
    }
    const { error: mErr } = await hq.from("brain_memberships").upsert(
      { organization_id: ORG, user_id: userId, role, department_id: deptId, active: true },
      { onConflict: "organization_id,user_id" },
    );
    if (mErr) {
      console.error(`✖ ${userId}: brain_memberships upsert failed — ${mErr.message}`);
      process.exit(1);
    }
  };

  for (const r of results) {
    const twinId = `wg:${r.userId}`;
    const role = BRAIN_ROLE[r.role];
    await upsertIdentity(twinId, r.name, ROLE_LABEL[r.role], role);
    twinRows.push({ role, userId: twinId, note: r.email });
  }

  // Steward mapping: Han reviews WG proposals with the REAL HQ account (the one
  // /brain signs in with), not a twin — so grant that uid org_admin here too.
  const { data: hqList, error: hqListErr } = await hq.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (hqListErr) {
    console.error("✖ Could not list Urso HQ auth users:", hqListErr.message);
    process.exit(1);
  }
  const steward = hqList.users.find((u) => u.email?.toLowerCase() === "han@urso.tech");
  if (steward) {
    await upsertIdentity(steward.id, "Han · Urso", "Urso admin", "org_admin");
    twinRows.push({ role: "org_admin", userId: steward.id, note: "han@urso.tech (real HQ account — steward)" });
  }

  console.log(`\n✓ Brain twins upserted — org '${ORG}', department '${deptId}':\n`);
  for (const t of twinRows) console.log(`  ${t.role.padEnd(10)} ${t.userId.padEnd(40)} ${t.note}`);
  if (!steward) {
    console.log("\n  ⚠ No Urso HQ auth user for han@urso.tech — steward review at /brain?org=woof-gang");
    console.log("    needs one. Create it in the HQ project's Auth dashboard, then re-run --brain-twins.");
  }
  console.log("");
}
