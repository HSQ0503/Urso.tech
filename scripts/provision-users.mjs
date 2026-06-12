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

// The account directory — same people as the old mock identities.
const DIRECTORY = [
  { email: "han@urso.tech", name: "Han · Urso", role: "urso_admin", store: null },
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

  results.push({ ...person, password });
}

console.log("\n✓ Provisioned — auth users + app_users membership:\n");
for (const r of results) {
  const cred = r.password ? `password: ${r.password}` : "already existed — password unchanged";
  console.log(`  ${r.role.padEnd(10)} ${(r.store ?? "—").padEnd(3)} ${r.email.padEnd(36)} ${cred}`);
}
console.log("\n  Passwords above are shown ONCE — store them somewhere safe.");
console.log("  Reminder: disable public sign-ups in Supabase → Auth → Sign In/Up.\n");
