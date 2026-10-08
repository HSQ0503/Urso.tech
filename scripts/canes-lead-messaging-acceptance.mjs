// Runs the real Canes migrations, actions, inbound handler, SMS wrapper and
// cron consumers locally. No environment files or external services are used.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const root = resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
const db = new PGlite({ extensions: { pgcrypto } });
const sent = [];
let smsFailure = false;
let allowed = true;
let parsedFallback = null;
let beforeMetaEligibility = null;
let checks = 0;
const vendor = "+15615550100";
const ownerPhone = "+15615550199";
const businessPhone = "+15615550198";
const day = (days, hour = 16) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  date.setUTCHours(hour, 0, 0, 0);
  return date.toISOString();
};
const scalar = async (sql, params = []) => Object.values((await db.query(sql, params)).rows[0])[0];
const check = async (name, fn) => {
  await fn();
  checks++;
  console.log(`  ✓ ${name}`);
};

// Thin PostgREST transport adapter. SQL constraints and RPC transactions still
// execute in Postgres; only the HTTP transport is replaced.
class Query {
  constructor(table) { this.table = table; this.filters = []; this.mode = "select"; this.returning = false; }
  select(columns = "*") { this.columns = columns; this.returning = true; return this; }
  insert(rows) { this.mode = "insert"; this.rows = Array.isArray(rows) ? rows : [rows]; return this; }
  upsert(rows, options = {}) { this.insert(rows); this.conflict = options; return this; }
  update(row) { this.mode = "update"; this.row = row; return this; }
  delete() { this.mode = "delete"; return this; }
  eq(k, v) { this.filters.push([k, "=", v]); return this; }
  neq(k, v) { this.filters.push([k, "<>", v]); return this; }
  lt(k, v) { this.filters.push([k, "<", v]); return this; }
  lte(k, v) { this.filters.push([k, "<=", v]); return this; }
  gt(k, v) { this.filters.push([k, ">", v]); return this; }
  gte(k, v) { this.filters.push([k, ">=", v]); return this; }
  is(k, v) { this.filters.push([k, "is", v]); return this; }
  in(k, v) { this.filters.push([k, "in", v]); return this; }
  not(k, op, v) { this.filters.push([k, op === "in" ? "not in" : "is not", op === "in" ? v.slice(1, -1).split(",") : v]); return this; }
  order(k, opts = {}) { this.orderBy = `${k} ${opts.ascending === false ? "desc" : "asc"}`; return this; }
  limit(n) { this.max = n; return this; }
  single() { this.one = true; this.required = true; return this; }
  maybeSingle() { this.one = true; return this; }
  then(ok, fail) { return this.execute().then(ok, fail); }
  async execute() {
    const params = [];
    const bind = (v) => { params.push(v); return `$${params.length}`; };
    const where = () => this.filters.length ? " where " + this.filters.map(([k, op, v]) => {
      if (op === "is" || op === "is not") return `${k} ${op} ${v === null ? "null" : v}`;
      if (op === "in" || op === "not in") return v.length ? `${k} ${op} (${v.map(bind).join(",")})` : "false";
      return `${k} ${op} ${bind(v)}`;
    }).join(" and ") : "";
    try {
      let sql;
      if (this.mode === "select") sql = `select ${this.columns ?? "*"} from ${this.table}${where()}`;
      else if (this.mode === "update") sql = `update ${this.table} set ${Object.entries(this.row).map(([k, v]) => `${k}=${bind(v)}`).join(",")}${where()}`;
      else if (this.mode === "delete") sql = `delete from ${this.table}${where()}`;
      else {
        const keys = [...new Set(this.rows.flatMap(Object.keys))];
        sql = `insert into ${this.table} (${keys.join(",")}) values ${this.rows.map(row => `(${keys.map(k => bind(row[k] ?? null)).join(",")})`).join(",")}`;
        if (this.conflict) {
          sql += ` on conflict (${this.conflict.onConflict ?? "id"}) `;
          sql += this.conflict.ignoreDuplicates ? "do nothing" : `do update set ${keys.map(k => `${k}=excluded.${k}`).join(",")}`;
        }
      }
      if (this.mode === "select") {
        if (this.orderBy) sql += ` order by ${this.orderBy}`;
        if (this.max) sql += ` limit ${this.max}`;
      } else if (this.returning) sql += ` returning ${this.columns ?? "*"}`;
      const result = await db.query(sql, params);
      const rows = JSON.parse(JSON.stringify(result.rows));
      if (this.one && (rows.length > 1 || (this.required && !rows.length))) throw new Error("Expected one row");
      return { data: this.one ? rows[0] ?? null : this.returning || this.mode === "select" ? rows : null, error: null };
    } catch (error) { return { data: null, error: { message: error.message, code: error.code } }; }
  }
}
const client = {
  from: (table) => new Query(table),
  async rpc(name, args) {
    try {
      if (name === "meta_intro_is_eligible" && beforeMetaEligibility) await beforeMetaEligibility();
      const keys = Object.keys(args);
      if (name === "claim_lead_message_task") {
        const result = await db.query("select * from claim_lead_message_task($1)", [args.p_task_id]);
        return { data: JSON.parse(JSON.stringify(result.rows)), error: null };
      }
      const result = await db.query(`select ${name}(${keys.map((k, i) => `${k} => $${i + 1}`).join(",")}) as result`, keys.map(k => args[k]));
      return { data: result.rows[0].result, error: null };
    } catch (error) { return { data: null, error: { message: error.message, code: error.code } }; }
  },
};
const harmless = new Proxy({}, { get: (_, name) => name === "__esModule" ? true : async () => ({ ok: true }) });
const cache = new Map();
const stubs = new Map([
  ["@/lib/canes/supabase", { canesDb: () => client, canesConfigured: () => true, twilioConfigured: () => true }],
  ["@/lib/canes/access", { denyUnlessPermitted: async () => allowed ? null : { ok: false, notice: "Denied" } }],
  ["@/lib/canes/push-events", harmless], ["@/lib/canes/notify", harmless],
  ["@/lib/canes/push", { sendCanesPush: async () => ({ ok: true, persisted: true }) }],
  ["@/lib/urso-auth", { readMobileToken: token => token === "owner-test-token" ? { email: "owner@example.test", scope: "canes" } : null }],
  ["@/lib/canes/crew-auth", { verifyCrewAccessToken: async () => null }],
  ["@/lib/canes/fixtures", {}], ["@/lib/canes/tour", { PRACTICE_PHONE: "+15555555555" }],
  ["next/cache", { revalidatePath() {} }], ["next/navigation", { redirect() { throw new Error("Unexpected redirect"); } }],
  ["next/server", { NextResponse: Response }],
  ["ai", { generateObject: async () => ({ object: { is_lead: true, leads: parsedFallback ? [parsedFallback] : [] } }) }],
  ["@ai-sdk/google", { google: () => null }],
]);
const realModules = new Set([
  "lib/canes/types.ts", "packages/types/src/index.ts", "packages/types/src/types.ts", "packages/types/src/crew-types.ts", "packages/types/src/wg-mobile.ts",
  "lib/canes/lead-messaging.ts", "lib/canes/automations.ts", "lib/canes/lead-contact.ts", "lib/canes/data.ts", "lib/canes/twilio.ts", "lib/twilio.ts", "lib/canes/parse.ts", "lib/canes/inbound.ts",
  "lib/canes/meta-leads.ts", "lib/canes/meta-form.ts", "app/api/canes/cron/meta-intro/route.ts",
  "app/CanesPressure/actions.ts", "app/api/canes/cron/route.ts",
  "lib/api/v1.ts", "app/api/v1/canes/leads/[id]/actions/route.ts",
]);
function load(file) {
  if (cache.has(file)) return cache.get(file).exports;
  const loadedModule = { exports: {} }; cache.set(file, loadedModule);
  const source = readFileSync(resolve(root, file), "utf8");
  let code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  if (file === "app/api/canes/cron/route.ts") code += "\nObject.assign(exports, { drainDueTasks, confirmationSafetyNet, noReplyEscalations });";
  const localRequire = (name) => {
    if (stubs.has(name)) return stubs.get(name);
    let target = name === "@urso/types" ? "packages/types/src/index.ts" : name.startsWith("@/") ? `${name.slice(2)}.ts` : null;
    if (name.startsWith(".")) target = resolve(root, file, "..", name).slice(root.length + 1) + ".ts";
    if (target) return realModules.has(target) ? load(target) : harmless;
    return require(name);
  };
  const quietConsole = { ...console, log() {}, warn() {} };
  const wrapped = runInNewContext(`(function(require,module,exports){${code}\n})`, {
    console: quietConsole, Date, Intl, URL, Response, Buffer, AbortSignal,
    setTimeout, clearTimeout,
    process: { env: { CANES_OWNER_PHONE: ownerPhone, CANES_TWILIO_NUMBER: businessPhone, NEXT_PUBLIC_APP_URL: "https://example.test", CRON_SECRET: "isolated-test-cron" } },
    fetch() { throw new Error("External network calls are forbidden in this suite"); },
  }, { filename: file });
  wrapped(localRequire, loadedModule, loadedModule.exports);
  return loadedModule.exports;
}

await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create table auth.users(id uuid primary key,email text);
create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
const migrationFiles = readdirSync(resolve(root, "supabase/canes")).filter(n => n.endsWith(".sql")).sort();
for (const name of migrationFiles) await db.exec(readFileSync(resolve(root, "supabase/canes", name), "utf8"));
const rawTwilio = load("lib/twilio.ts");
stubs.set("@/lib/twilio", { ...rawTwilio, sendSms: async (input) => {
  if (smsFailure) return { ok: false, error: "Mock carrier failure" };
  const sid = `SM${randomUUID().replaceAll("-", "")}`;
  sent.push({ ...input, sid }); return { ok: true, sid };
} });
const data = load("lib/canes/data.ts");
const messages = load("lib/canes/lead-messaging.ts");
const inbound = load("lib/canes/inbound.ts");
const actions = load("app/CanesPressure/actions.ts");
const cron = load("app/api/canes/cron/route.ts");
const parser = load("lib/canes/parse.ts");
const setting = async (key, value) => db.query(
  "insert into settings(key,value) values ($1,$2::jsonb) on conflict(key) do update set value=excluded.value",
  [key, JSON.stringify(value)],
);
await setting("lead_vendor_phones", [vendor]);
await setting("automations_enabled", true);
await setting("quiet_hours", { start: 0, end: 0, timezone: "America/New_York" });
const customerTexts = (phone) => sent.filter(s => s.to === phone);
const leadFor = (phone) => inbound.findLeadByPhone(phone);
const vendorText = (header, name, phone, when = null) => [header, name, phone, "123 Palm Beach Rd, FL", when ? new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(when)).replace(" at ", " ") : "", "Requested Service/s: Driveway"].filter(Boolean).join("\n");
const receive = (body, sid = `SM${randomUUID().replaceAll("-", "")}`) => inbound.processInboundSms({ from: vendor, body, messageSid: sid });
const drain = () => cron.drainDueTasks(Date.now() + 60_000);
const seed = async (phone, extra = {}) => {
  const result = await client.from("leads").insert({ name: "Jamie Test", phone, type: "cold", source: "referral", ...extra }).select("*").single();
  assert.equal(result.error, null); return result.data;
};

try {
  await check("all migrations apply; manual-booking RPC is private", async () => {
    for (const role of ["anon", "authenticated"]) assert.equal(await scalar("select has_function_privilege($1, 'book_lead_appointment_locked(uuid,timestamptz)', 'execute')", [role]), false);
    assert.equal(await scalar("select has_function_privilege('service_role', 'book_lead_appointment_locked(uuid,timestamptz)', 'execute')"), true);
  });
  await check("vendor booking sends correct name and Eastern time immediately", async () => {
    const phone = "+15615550101", when = day(3);
    await receive(vendorText("BOOKED APPOINTMENT", "Alex Customer", phone, when));
    const lead = await leadFor(phone);
    assert.equal(lead.status, "appointment_set");
    assert.equal(customerTexts(phone).length, 1);
    assert.match(customerTexts(phone)[0].body, /Hi Alex.*Reply YES/);
    assert.ok(customerTexts(phone)[0].body.includes(load("packages/types/src/types.ts").fmtEt(when)));
    assert.equal(customerTexts(vendor).length, 0);
  });
  await check("Twilio webhook retry and vendor resend do not duplicate the text", async () => {
    const phone = "+15615550102", text = vendorText("NEW BOOKED APPOINTMENT - IN PERSON", "Robin Customer", phone, day(3));
    const sid = `SM${randomUUID().replaceAll("-", "")}`;
    await receive(text, sid); await receive(text, sid); await receive(text); await drain();
    assert.equal(customerTexts(phone).length, 1);
  });
  await check("virtual quote asks what needs cleaning without promising a call", async () => {
    const phone = "+15615550103", text = vendorText("VIRTUAL QUOTE", "Taylor Customer", phone);
    await receive(text); await receive(text);
    assert.equal(customerTexts(phone).length, 1);
    assert.match(customerTexts(phone)[0].body, /Hi Taylor.*Sebastian.*What were you looking to get done/);
    assert.doesNotMatch(customerTexts(phone)[0].body, /call.*minutes|Reply YES/);
  });
  await check("manual booking confirms a vendor lead and removes all old nags", async () => {
    const lead = await leadFor("+15615550101");
    const result = await actions.setAppointment(lead.id, day(4));
    assert.equal(result.ok, true); assert.match(result.notice, /Booking text sent/);
    assert.equal((await data.getLead(lead.id)).status, "confirmed");
    assert.match(customerTexts(lead.phone).at(-1).body, /will see you/);
    assert.doesNotMatch(customerTexts(lead.phone).at(-1).body, /Reply YES|confirm your/);
    await cron.confirmationSafetyNet(Date.now() + 60_000);
    await cron.noReplyEscalations(Date.now() + 60_000); await drain();
    assert.equal(await scalar("select count(*)::int from tasks where lead_id=$1 and kind in ('confirmation','confirmation_final','no_reply_escalation') and status in ('pending','sending')", [lead.id]), 0);
    assert.equal(customerTexts(lead.phone).length, 2);
  });
  await check("repeated manual saves send once; rescheduling sends only the new time", async () => {
    const lead = await seed("+15615550104");
    await Promise.all([actions.setAppointment(lead.id, day(4)), actions.setAppointment(lead.id, day(4))]);
    assert.equal(customerTexts(lead.phone).length, 1);
    await actions.setAppointment(lead.id, day(5));
    await actions.setAppointment(lead.id, day(4));
    assert.equal(customerTexts(lead.phone).length, 3);
  });
  await check("quiet hours defer, then cron sends the current booking once", async () => {
    const lead = await seed("+15615550105");
    const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hourCycle: "h23" }).format(new Date()));
    await setting("quiet_hours", { start: hour, end: (hour + 2) % 24, timezone: "America/New_York" });
    assert.match((await actions.setAppointment(lead.id, day(4))).notice, /queued/);
    await actions.setAppointment(lead.id, day(5));
    assert.equal(customerTexts(lead.phone).length, 0);
    await setting("quiet_hours", { start: 0, end: 0, timezone: "America/New_York" });
    await db.query("update tasks set scheduled_for=now()-interval '1 minute' where lead_id=$1 and status='pending'", [lead.id]);
    await drain(); await drain();
    assert.equal(customerTexts(lead.phone).length, 1);
    assert.ok(customerTexts(lead.phone)[0].body.includes(load("packages/types/src/types.ts").fmtEt(day(5))));
  });
  await check("rapid reschedules always advance the message revision", async () => {
    const lead = await seed("+15615550118", {
      status: "confirmed", appointment_at: day(3), confirmed_at: new Date(Date.now() + 1000).toISOString(),
    });
    const first = await client.rpc("book_lead_appointment_locked", { p_lead_id: lead.id, p_appointment_at: day(4) });
    const second = await client.rpc("book_lead_appointment_locked", { p_lead_id: lead.id, p_appointment_at: day(3) });
    assert.notEqual(first.data.task_id, second.data.task_id);
    assert.equal(await scalar("select status from tasks where id=$1", [first.data.task_id]), "canceled");
    assert.equal(await scalar("select status from tasks where id=$1", [second.data.task_id]), "pending");
    await messages.sendLeadMessageTask(second.data.task_id, await data.getSettings());
    assert.equal(customerTexts(lead.phone).length, 1);
  });
  await check("opt-outs and missing phones still book successfully without SMS", async () => {
    for (const lead of [await seed("+15615550106", { opted_out: true }), await seed(null)]) {
      assert.equal((await actions.setAppointment(lead.id, day(4))).ok, true);
      assert.equal((await data.getLead(lead.id)).status, "confirmed");
      assert.equal(customerTexts(lead.phone).length, 0);
    }
  });
  await check("a late cron never texts an expired or superseded appointment", async () => {
    const lead = await leadFor("+15615550102"), count = customerTexts(lead.phone).length;
    await db.query("update leads set appointment_at=now()-interval '1 day' where id=$1", [lead.id]);
    await db.query("update tasks set scheduled_for=now()-interval '1 minute' where lead_id=$1 and status='pending'", [lead.id]);
    await drain(); await cron.noReplyEscalations(Date.now() + 60_000);
    assert.equal(customerTexts(lead.phone).length, count);
  });
  await check("delivery failure preserves confirmation and does not silently retry", async () => {
    const lead = await seed("+15615550107"); smsFailure = true;
    const result = await actions.setAppointment(lead.id, day(4)); smsFailure = false;
    assert.equal(result.ok, true); assert.match(result.notice, /could not be sent/);
    await actions.setAppointment(lead.id, day(4)); await drain();
    assert.equal(customerTexts(lead.phone).length, 0);
    assert.equal(await scalar("select count(*)::int from tasks where lead_id=$1 and kind='manual_booking' and status='failed'", [lead.id]), 1);
  });
  await check("a missing lead or denied caller cannot book or text", async () => {
    assert.equal((await actions.setAppointment(randomUUID(), day(3))).ok, false);
    const lead = await seed("+15615550108"); allowed = false;
    assert.equal((await actions.setAppointment(lead.id, day(3))).ok, false); allowed = true;
    assert.equal((await data.getLead(lead.id)).status, "new");
    assert.equal(customerTexts(lead.phone).length, 0);
  });
  await check("standalone quote booking accepts a phone and keeps old no-phone callers working", async () => {
    const input = { customerName: "Casey Test", jobName: "Driveway", address: "123 Test Rd", appointmentIso: day(3) };
    assert.equal((await actions.createQuoteVisit({ ...input, customerPhone: "5615550109" })).ok, true);
    assert.equal(customerTexts("+15615550109").length, 1);
    assert.equal((await actions.createQuoteVisit(input)).ok, true);
    assert.equal((await actions.createQuoteVisit({ ...input, customerPhone: "123" })).ok, false);
  });
  await check("customer YES cancels vendor follow-ups and sends one acknowledgement", async () => {
    const phone = "+15615550110";
    await receive(vendorText("BOOKED APPOINTMENT", "Morgan Customer", phone, day(4)));
    const sid = `SM${randomUUID().replaceAll("-", "")}`;
    await inbound.processInboundSms({ from: phone, body: "YES", messageSid: sid });
    await inbound.processInboundSms({ from: phone, body: "YES", messageSid: sid });
    assert.equal((await leadFor(phone)).status, "confirmed");
    assert.equal(customerTexts(phone).length, 2);
    await drain(); assert.equal(customerTexts(phone).length, 2);
  });
  await check("low-confidence and time-less vendor appointments do not auto-text", async () => {
    for (const [phone, confidence, body] of [["+15615550111", 0.4, "BOOKED APPOINTMENT tomorrow 12pm"], ["+15615550112", 1, "BOOKED APPOINTMENT tomorrow morning"]]) {
      parsedFallback = { type: "hot", name: "Uncertain", phone, address: null, service: "Driveway", appointment_iso: day(3), notes: null, confidence };
      await receive(body);
      assert.equal(customerTexts(phone).length, 0);
      assert.equal((await leadFor(phone)).appointment_at, null);
    }
    parsedFallback = null;
    assert.equal(parser.parseVendorStructured("BOOKED APPOINTMENT\nTest Person\n5615550113\nMonday, February 30, 2027 12:00 PM\nRequested Service/s: Roof"), null);
  });
  await check("resending a confirmed booking never asks for YES", async () => {
    const lead = await leadFor("+15615550104");
    const count = customerTexts(lead.phone).length;
    assert.equal((await actions.sendConfirmationNow(lead.id)).ok, true);
    assert.equal(customerTexts(lead.phone).length, count + 1);
    assert.match(customerTexts(lead.phone).at(-1).body, /will see you/);
    assert.doesNotMatch(customerTexts(lead.phone).at(-1).body, /Reply YES/);
  });
  await check("new opportunity for a past customer gets a fresh virtual introduction", async () => {
    const lead = await leadFor("+15615550103");
    await db.query("update leads set status='lost' where id=$1", [lead.id]);
    await receive(vendorText("WANTS A VIRTUAL QUOTE ONLY", "Taylor Customer", lead.phone));
    assert.equal(customerTexts(lead.phone).length, 2);
  });
  await check("failed outbox insert rolls the entire manual booking back", async () => {
    const lead = await seed("+15615550114", { status: "appointment_set", appointment_at: day(3) });
    await db.exec("create function fail_booking_test() returns trigger language plpgsql as $$ begin if new.kind='manual_booking' then raise exception 'Test failure'; end if; return new; end $$; create trigger fail_booking_test before insert on tasks for each row execute function fail_booking_test();");
    assert.equal((await actions.setAppointment(lead.id, day(4))).ok, false);
    const after = await data.getLead(lead.id);
    assert.equal(after.status, "appointment_set");
    assert.equal(Date.parse(after.appointment_at), Date.parse(day(3)));
    await db.exec("drop trigger fail_booking_test on tasks; drop function fail_booking_test();");
  });
  await check("a canceled task cannot be sent from a stale worker snapshot", async () => {
    const lead = await seed("+15615550115");
    const result = await client.rpc("book_lead_appointment_locked", { p_lead_id: lead.id, p_appointment_at: day(3) });
    await client.rpc("book_lead_appointment_locked", { p_lead_id: lead.id, p_appointment_at: day(4) });
    await messages.sendLeadMessageTask(result.data.task_id, await data.getSettings());
    assert.equal(customerTexts(lead.phone).length, 0);
    // Model the next cron tick, not a JS millisecond racing the DB timestamp.
    await db.query("update tasks set scheduled_for=now()-interval '1 minute' where lead_id=$1 and status='pending'", [lead.id]);
    const drained = await drain();
    assert.equal(customerTexts(lead.phone).length, 1, JSON.stringify({
      drained, lead: await data.getLead(lead.id),
      tasks: (await client.from("tasks").select("*").eq("lead_id", lead.id)).data,
    }));
  });
  await check("interrupted sends are flagged rather than replayed by cron", async () => {
    const lead = await seed("+15615550116");
    const result = await client.rpc("book_lead_appointment_locked", { p_lead_id: lead.id, p_appointment_at: day(3) });
    await db.query("update tasks set status='sending', scheduled_for=now()-interval '11 minutes' where id=$1", [result.data.task_id]);
    await drain();
    assert.equal(await scalar("select status from tasks where id=$1", [result.data.task_id]), "failed");
    assert.equal(customerTexts(lead.phone).length, 0);
  });
  await check("mobile API rejects unauthenticated and malformed bookings, then returns the saved notice", async () => {
    const route = load("app/api/v1/canes/leads/[id]/actions/route.ts");
    const lead = await seed("+15615550117");
    const call = (token, appointmentIso) => route.POST(new Request("https://example.test/api/v1/canes/leads/" + lead.id + "/actions", {
      method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}) },
      body: JSON.stringify({ action: "setAppointment", appointmentIso }),
    }), { params: Promise.resolve({ id: lead.id }) });
    assert.equal((await call(null, day(3))).status, 401);
    assert.equal((await call("owner-test-token", "tomorrow")).status, 422);
    assert.equal(customerTexts(lead.phone).length, 0);
    const response = await call("owner-test-token", day(3));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true); assert.match(body.data.notice, /Appointment confirmed/);
    assert.equal(customerTexts(lead.phone).length, 1);
  });
  await check("older settings clients preserve the new booking template", async () => {
    const before = (await data.getSettings()).templates.manual_booking;
    await actions.saveSettings({ templates: { confirmation: "Hi{name}, visit {when}. Reply YES." } });
    assert.equal((await data.getSettings()).templates.manual_booking, before);
  });
  await check("the migration can be reapplied without overwriting customized templates", async () => {
    await actions.saveSettings({ templates: { hold_text: "Custom virtual introduction" } });
    await db.exec(readFileSync(resolve(root, "supabase/canes", migrationFiles.at(-1)), "utf8"));
    assert.equal((await data.getSettings()).templates.hold_text, "Custom virtual introduction");
  });

  const meta = load("lib/canes/meta-leads.ts");
  await setting("meta_intro_enabled", true);
  await setting("meta_intro_enabled_since", new Date(Date.now() - 3_600_000).toISOString());
  let metaNumber = 200;
  const newMeta = async (extra = {}, submittedAt = new Date(Date.now() - 240_000).toISOString()) => {
    const leadgenId = randomUUID();
    const lead = await seed(`+15615550${++metaNumber}`, {
      source: "meta_ads", meta_leadgen_id: leadgenId, service: "house_wash", ...extra,
    });
    await client.rpc("claim_meta_leadgen", { p_leadgen_id: leadgenId });
    await messages.queueMetaIntro(lead.id, leadgenId, submittedAt);
    const task = (await client.from("tasks").select("*").eq("dedupe_key", `meta_intro:${leadgenId}`).maybeSingle()).data;
    return { lead, leadgenId, task, submittedAt };
  };
  const makeDue = async (task) => db.query("update tasks set scheduled_for=now()-interval '1 second' where id=$1", [task.id]);

  await check("Meta queues five minutes from form submission and never sends early", async () => {
    const { lead, task, submittedAt } = await newMeta();
    assert.ok(task);
    assert.equal(Date.parse(task.scheduled_for) - Date.parse(submittedAt), 300_000);
    assert.equal(await messages.sendLeadMessageTask(task.id, await data.getSettings()), "contested");
    assert.equal(customerTexts(lead.phone).length, 0);
    assert.equal(await scalar("select status from tasks where id=$1", [task.id]), "pending");
  });
  await check("Meta timestamp fallback uses the durable receipt time", async () => {
    for (const timestamp of ["invalid", null, new Date(Date.now() + 86_400_000).toISOString()]) {
      const { task, leadgenId } = await newMeta({}, timestamp);
      const received = await scalar("select created_at from meta_leadgen_receipts where leadgen_id=$1", [leadgenId]);
      assert.equal(Date.parse(task.scheduled_for) - new Date(received).getTime(), 300_000);
    }
  });
  await check("duplicate Meta queue attempts and overlapping workers send once", async () => {
    const { lead, leadgenId, task, submittedAt } = await newMeta();
    await Promise.all([messages.queueMetaIntro(lead.id, leadgenId, submittedAt), messages.queueMetaIntro(lead.id, leadgenId, submittedAt)]);
    assert.equal(await scalar("select count(*)::int from tasks where lead_id=$1 and kind='meta_intro'", [lead.id]), 1);
    await makeDue(task);
    const settings = await data.getSettings();
    const results = await Promise.all([messages.sendLeadMessageTask(task.id, settings), messages.sendLeadMessageTask(task.id, settings)]);
    assert.deepEqual(results.sort(), ["contested", "sent"]);
    assert.equal(customerTexts(lead.phone).length, 1);
    assert.match(customerTexts(lead.phone)[0].body, /^Hey Jamie, it's Sebastian from Canes Pressure Washing!/);
    assert.match(customerTexts(lead.phone)[0].body, /request for house wash/);
    assert.match(customerTexts(lead.phone)[0].body, /reply STOP anytime to opt out/);
  });
  await check("Meta copy has usable name and service fallbacks", async () => {
    const template = (await data.getSettings()).templates.meta_intro;
    const text = messages.metaIntroText(template, "   ", null);
    assert.match(text, /^Hey, /);
    assert.match(text, /Just saw your quote request/);
    assert.doesNotMatch(text, /\{\w+\}|undefined|null/);
    assert.match(messages.metaIntroText(template, "  Alex   Smith ", "window_cleaning"), /^Hey Alex, /);
  });
  await check("Meta skips existing contacts and sends no immediate introduction", async () => {
    const known = await seed(`+15615550${++metaNumber}`);
    for (const phone of [known.phone, `+15615550${++metaNumber}`]) {
      const id = randomUUID();
      const result = await meta.ingestMetaLeadgen(id, { fetchLead: async () => ({
        id, created_time: new Date().toISOString(), field_data: [
          { name: "full_name", values: ["Alex Test"] }, { name: "phone_number", values: [phone] },
          { name: "which_exterior_services_are_you_looking_to_get_done?", values: ["Window cleaning", "House wash"] },
        ],
      }) });
      assert.equal(result.handled, phone === known.phone ? "existing" : "created");
      assert.equal(customerTexts(phone).length, 0);
      if (phone !== known.phone) assert.equal((await data.getLead(result.leadId)).service, "Window cleaning, House wash");
      assert.equal(await scalar("select count(*)::int from tasks where dedupe_key=$1", [`meta_intro:${id}`]), phone === known.phone ? 0 : 1);
      assert.equal((await meta.ingestMetaLeadgen(id, { fetchLead: async () => { throw new Error("Duplicate fetched Graph"); } })).handled, "duplicate");
    }
  });
  await check("retry after creating the Meta lead recovers its introduction", async () => {
    const leadgenId = randomUUID();
    const lead = await seed(`+15615550${++metaNumber}`, { source: "meta_ads", meta_leadgen_id: leadgenId });
    await client.rpc("claim_meta_leadgen", { p_leadgen_id: leadgenId });
    await db.query("update meta_leadgen_receipts set updated_at=now()-interval '3 minutes' where leadgen_id=$1", [leadgenId]);
    const result = await meta.ingestMetaLeadgen(leadgenId, { fetchLead: async () => ({
      created_time: new Date().toISOString(), field_data: [{ name: "phone_number", values: [lead.phone] }],
    }) });
    assert.equal(result.handled, "created");
    assert.equal(await scalar("select count(*)::int from tasks where dedupe_key=$1", [`meta_intro:${leadgenId}`]), 1);
    assert.equal(customerTexts(lead.phone).length, 0);
  });
  await check("Meta cancels for human contact, replies, calls, opt-outs and changed opportunities", async () => {
    const changes = [
      async (lead) => client.rpc("record_manual_lead_contact", { p_phone: lead.phone }),
      async (lead) => client.from("messages").insert({ peer_phone: lead.phone, lead_id: lead.id, direction: "in", body: "Tomorrow please", automated: false }),
      async (lead) => client.from("calls").insert({ peer_phone: lead.phone, lead_id: lead.id, direction: "out" }),
      async (lead) => client.from("leads").update({ opted_out: true }).eq("id", lead.id),
      async (lead) => client.from("leads").update({ status: "estimated" }).eq("id", lead.id),
      async (lead) => client.from("leads").update({ opportunity_started_at: day(1) }).eq("id", lead.id),
      async (lead) => client.from("leads").update({ phone: `+15615550${++metaNumber}` }).eq("id", lead.id),
    ];
    for (const change of changes) {
      const { lead, task } = await newMeta();
      const changed = await change(lead); assert.equal(changed.error, null);
      await makeDue(task);
      assert.equal(await messages.sendLeadMessageTask(task.id, await data.getSettings()), "canceled");
      assert.equal(customerTexts(lead.phone).length, 0);
    }
  });
  await check("reply arriving during send preparation prevents provider delivery", async () => {
    const { lead, task } = await newMeta(); await makeDue(task);
    let reads = 0;
    beforeMetaEligibility = async () => {
      if (++reads === 2) await client.from("messages").insert({ peer_phone: lead.phone, direction: "in", body: "Call tomorrow", automated: false });
    };
    try { assert.equal(await messages.sendLeadMessageTask(task.id, await data.getSettings()), "canceled"); }
    finally { beforeMetaEligibility = null; }
    assert.equal(reads, 2); assert.equal(customerTexts(lead.phone).length, 0);
  });
  await check("Meta respects quiet hours and retains the scheduled task", async () => {
    const { lead, task } = await newMeta(); await makeDue(task);
    const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hourCycle: "h23" }).format(new Date()));
    await setting("quiet_hours", { start: hour, end: (hour + 2) % 24, timezone: "America/New_York" });
    assert.equal(await messages.sendLeadMessageTask(task.id, await data.getSettings()), "deferred");
    assert.equal(customerTexts(lead.phone).length, 0);
    assert.equal(await scalar("select status from tasks where id=$1", [task.id]), "pending");
    await setting("quiet_hours", { start: 0, end: 0, timezone: "America/New_York" });
    await makeDue(task);
    assert.equal((await messages.drainMetaIntros(Date.now() + 60_000)).sent, 1);
  });
  await check("Meta and global switches block queues and dispatch without enabling estimates", async () => {
    for (const key of ["meta_intro_enabled", "automations_enabled"]) {
      const { lead, task } = await newMeta(); await makeDue(task);
      await setting(key, false);
      assert.equal((await messages.drainMetaIntros(Date.now() + 60_000)).paused, true);
      assert.equal(await messages.sendLeadMessageTask(task.id, await data.getSettings()), "canceled");
      assert.equal((await newMeta()).task, null);
      assert.equal(customerTexts(lead.phone).length, 0);
      await setting(key, true);
    }
    await setting("estimate_automations_enabled", false);
    const { task } = await newMeta(); assert.ok(task);
  });
  await check("historical forms and leads are never backfilled", async () => {
    assert.equal((await newMeta({}, new Date(Date.now() - 7_200_000).toISOString())).task, null);
    assert.equal((await newMeta({ created_at: new Date(Date.now() - 7_200_000).toISOString() })).task, null);
  });
  await check("missing Meta settings fail closed and deleted leads cannot be texted", async () => {
    const { lead, task } = await newMeta(); await makeDue(task);
    await client.from("settings").delete().eq("key", "meta_intro_enabled");
    assert.equal((await messages.drainMetaIntros(Date.now() + 60_000)).paused, true);
    assert.equal((await newMeta()).task, null);
    await setting("meta_intro_enabled", true);
    await client.from("leads").delete().eq("id", lead.id);
    await messages.sendLeadMessageTask(task.id, await data.getSettings());
    assert.equal(customerTexts(lead.phone).length, 0);
  });
  await check("template edits retain STOP instructions and older clients preserve the Meta template", async () => {
    const before = (await data.getSettings()).templates.meta_intro;
    assert.equal((await actions.saveSettings({ templates: { meta_intro: "Hey, when can I call?" } })).ok, false);
    assert.equal((await data.getSettings()).templates.meta_intro, before);
    assert.equal((await actions.saveSettings({ templates: { confirmation_ack: "See you then. Reply STOP anytime to opt out." } })).ok, true);
    assert.equal((await data.getSettings()).templates.meta_intro, before);
  });
  await check("failed and interrupted Meta sends are not automatically replayed", async () => {
    const { lead, task } = await newMeta(); await makeDue(task);
    smsFailure = true;
    try { assert.equal(await messages.sendLeadMessageTask(task.id, await data.getSettings()), "failed"); }
    finally { smsFailure = false; }
    await messages.drainMetaIntros(Date.now() + 60_000);
    assert.equal(customerTexts(lead.phone).length, 0);
    const interrupted = await newMeta();
    await db.query("update tasks set status='sending',scheduled_for=now()-interval '11 minutes' where id=$1", [interrupted.task.id]);
    await drain();
    assert.equal(await scalar("select status from tasks where id=$1", [interrupted.task.id]), "failed");
    assert.equal(customerTexts(interrupted.lead.phone).length, 0);
  });
  await check("Meta RPCs remain private and the worker refuses callers without its secret", async () => {
    for (const fn of ["queue_meta_intro(uuid,text,timestamptz)", "meta_intro_is_eligible(uuid)", "claim_lead_message_task(uuid)"]) {
      for (const role of ["anon", "authenticated"]) assert.equal(await scalar("select has_function_privilege($1,$2,'execute')", [role,fn]), false);
      assert.equal(await scalar("select has_function_privilege('service_role',$1,'execute')", [fn]), true);
    }
    const route = load("app/api/canes/cron/meta-intro/route.ts");
    assert.equal((await route.GET(new Request("https://example.test/api/canes/cron/meta-intro"))).status, 401);
    assert.equal((await route.GET(new Request("https://example.test/api/canes/cron/meta-intro", { headers: { authorization: "Bearer wrong" } }))).status, 401);
    assert.equal((await route.GET(new Request("https://example.test/api/canes/cron/meta-intro", { headers: { authorization: "Bearer isolated-test-cron" } }))).status, 200);
  });
  console.log(`\n${checks} integration scenarios passed. No external messages sent.`);
} finally { await db.close(); }
