#!/usr/bin/env node
// One-time Markate -> Canes import.
//
//   node scripts/canes-markate-import.mjs --customers ~/Downloads/customers.csv
//   node scripts/canes-markate-import.mjs --customers ~/Downloads/customers.csv --apply
//   node scripts/canes-markate-import.mjs --services  ~/Downloads/services.csv  --apply
//
// Dry-run by default: prints exactly what it would write and changes nothing.
// Re-runnable. Contacts dedupe on phone (contacts.phone is UNIQUE), services
// dedupe on lowercased name, so a second pass updates instead of duplicating.

import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : null;
};
const APPLY = args.includes("--apply");
const ALLOW_NO_PHONE = args.includes("--allow-no-phone");
const customersCsv = flag("customers");
const servicesCsv = flag("services");
const catalogFrom = args.filter((a, i) => args[i - 1] === "--catalog-from");
const estimatesCsv = flag("estimates");
const workordersCsv = flag("workorders");
const invoicesCsv = flag("invoices");
const expensesCsv = flag("expenses");

const URL = process.env.NEXT_PUBLIC_CANES_SUPABASE_URL;
const KEY = process.env.CANES_SUPABASE_SECRET_KEY;
if (!URL || !KEY) {
  console.error("Set NEXT_PUBLIC_CANES_SUPABASE_URL and CANES_SUPABASE_SECRET_KEY (source .env.local).");
  process.exit(1);
}
const anyInput = customersCsv || servicesCsv || catalogFrom.length || estimatesCsv || workordersCsv || invoicesCsv || expensesCsv;
if (!anyInput) {
  console.error("Pass --customers / --services / --catalog-from / --estimates / --workorders / --invoices / --expenses.");
  process.exit(1);
}

async function db(path, init = {}) {
  const res = await fetch(`${URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path}: ${res.status} ${await res.text()}`);
  // PostgREST returns an empty body unless Prefer: return=representation.
  const body = await res.text();
  return body ? JSON.parse(body) : null;
}

// RFC4180-ish parser: handles quoted fields, embedded commas, doubled quotes.
function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  const s = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const header = rows.shift().map((h) => h.trim().toLowerCase());
  return rows
    .filter((r) => r.some((v) => v.trim()))
    .map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? "").trim()])));
}

// Markate's column names vary by export; accept the common spellings.
const pick = (row, ...names) => {
  for (const n of names) {
    const hit = Object.keys(row).find((k) => k === n || k.replace(/[^a-z]/g, "") === n.replace(/[^a-z]/g, ""));
    if (hit && row[hit]) return row[hit];
  }
  return "";
};

// Markate emits the service address in one of two column blocks: the bare
// "Address *" set, or the "Address-1 *" set. Which one is populated varies per
// row, so try the first and fall back to the second.
function addressLine(row) {
  const build = (p) =>
    [
      row[`${p}street`] ?? row[p === "address " ? "address street" : "address-1 street"],
      row[`${p}suite/unit`] ?? row[p === "address " ? "address suite/unit" : "address-1 suite/unit"],
      row[p === "address " ? "city" : "address-1 city"],
      row[p === "address " ? "state" : "address-1 state"],
      row[p === "address " ? "zip" : "address-1 zip"],
    ]
      .map((v) => (v ?? "").trim())
      .filter(Boolean)
      .join(", ");
  const primary = build("address ");
  if (primary && (row["address street"] ?? "").trim()) return primary;
  const secondary = build("address-1 ");
  return secondary || primary;
}

// contacts.source is CHECK-constrained to lead_vendor|website|referral|other.
// Preserving it keeps the Insights channel-attribution report honest instead of
// flattening every imported customer into "other".
function mapSource(raw) {
  const s = (raw || "").toLowerCase();
  if (s.includes("referral")) return "referral";
  if (s.includes("web") || s.includes("site")) return "website";
  if (s) return "lead_vendor"; // FlexConnect and other paid-lead products
  return "other";
}

// Mirrors toE164 in lib/canes/types.ts — same rules, so imported numbers match
// what the app writes and dedupe against existing rows.
function toE164(raw) {
  const digits = (raw || "").replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if ((raw || "").startsWith("+") && digits.length > 10) return `+${digits}`;
  return null;
}

const dollarsToCents = (raw) => {
  const n = Number(String(raw).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};

async function importCustomers(file) {
  const rows = parseCsv(readFileSync(file, "utf8"));
  console.log(`\n=== CUSTOMERS: ${rows.length} rows in ${file} ===`);
  console.log(`columns: ${Object.keys(rows[0] ?? {}).join(", ")}\n`);

  const existing = await db("contacts?select=id,phone,name");
  const byPhone = new Map(existing.filter((c) => c.phone).map((c) => [c.phone, c]));

  const create = [], update = [], skipped = [];
  const seen = new Set();

  for (const r of rows) {
    const first = pick(r, "first name", "firstname", "first");
    const last = pick(r, "last name", "lastname", "last");
    const name = pick(r, "customer name", "name", "full name", "display name") || `${first} ${last}`.trim();
    const phone = toE164(pick(r, "phone", "mobile", "mobile phone", "primary phone", "phone number", "cell"));
    const email = pick(r, "email", "email address", "primary email");
    const line = addressLine(r);
    const company = pick(r, "company");
    const extra = pick(r, "additional contacts");
    const notes = [
      pick(r, "notes", "note", "comments", "description"),
      company && company !== name ? `Company: ${company}` : "",
      extra ? `Additional contacts: ${extra.replace(/\s+/g, " ").trim()}` : "",
    ].filter(Boolean).join("\n") || null;
    const source = mapSource(pick(r, "source", "lead source"));

    // contacts.phone is the dedupe key and it is UNIQUE. Postgres allows many
    // NULLs there, so a phone-less customer CAN be stored -- it just can't be
    // deduped on a re-run, or texted/called. Opt in with --allow-no-phone.
    if (!phone && ALLOW_NO_PHONE && (name || email)) {
      // No phone means no dedupe key, so fall back to name to stay re-runnable.
      const dupe = existing.find((c) => !c.phone && (c.name || "").toLowerCase() === name.toLowerCase());
      if (dupe) { skipped.push({ name, email, why: "already imported (matched on name)" }); continue; }
      create.push({ name: name || null, phone: null, email: email || null, notes, line, source });
      continue;
    }
    if (!phone) { skipped.push({ name, email, why: "no valid phone" }); continue; }
    if (seen.has(phone)) { skipped.push({ name, phone, why: "duplicate within CSV" }); continue; }
    seen.add(phone);

    const rec = { name: name || null, phone, email: email || null, notes, line, source };
    (byPhone.has(phone) ? update : create).push(rec);
  }

  console.log(`  create : ${create.length}`);
  console.log(`  update : ${update.length}  (phone already in the system)`);
  console.log(`  skipped: ${skipped.length}`);
  for (const s of skipped.slice(0, 15)) console.log(`     - ${s.name || "(no name)"} ${s.phone ?? s.email ?? ""} :: ${s.why}`);
  if (skipped.length > 15) console.log(`     ... and ${skipped.length - 15} more`);
  console.log("\n  sample of what will be written:");
  for (const c of create) console.log(`     ${c.phone}  ${(c.name||"").padEnd(24)} ${(c.source).padEnd(11)} ${c.line || "(no address)"}`);

  if (!APPLY) return;

  let made = 0, linked = 0;
  for (const c of [...create, ...update]) {
    let contact = c.phone ? byPhone.get(c.phone) : null;
    if (!contact) {
      const [row] = await db("contacts", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          name: c.name, phone: c.phone, email: c.email, notes: c.notes, source: c.source,
        }),
      });
      contact = row; made++;
    } else {
      // Never blank out data the app already has; only fill the gaps.
      const patch = {};
      if (c.name && !contact.name) patch.name = c.name;
      if (c.email) patch.email = c.email;
      if (Object.keys(patch).length) {
        await db(`contacts?id=eq.${contact.id}`, { method: "PATCH", body: JSON.stringify(patch) });
      }
    }
    if (c.line) {
      const have = await db(`addresses?select=id&contact_id=eq.${contact.id}&line=eq.${encodeURIComponent(c.line)}`);
      if (!have.length) {
        const any = await db(`addresses?select=id&contact_id=eq.${contact.id}&limit=1`);
        await db("addresses", {
          method: "POST",
          body: JSON.stringify({ contact_id: contact.id, line: c.line, is_primary: any.length === 0 }),
        });
        linked++;
      }
    }
  }
  console.log(`\n  DONE: ${made} contacts created, ${linked} addresses added.`);
}

async function importServices(file) {
  const rows = parseCsv(readFileSync(file, "utf8"));
  console.log(`\n=== SERVICES: ${rows.length} rows in ${file} ===`);
  console.log(`columns: ${Object.keys(rows[0] ?? {}).join(", ")}\n`);

  const existing = await db("service_catalog?select=id,name");
  const byName = new Map(existing.map((s) => [s.name.toLowerCase(), s]));

  const items = [];
  for (const r of rows) {
    const name = pick(r, "name", "item name", "service name", "item", "service", "title");
    if (!name) continue;
    items.push({
      name,
      description: pick(r, "description", "details", "notes") || null,
      default_price_cents: dollarsToCents(pick(r, "price", "default price", "rate", "unit price", "amount")),
      kind: /product|material/i.test(pick(r, "type", "kind", "category")) ? "product" : "service",
      exists: byName.has(name.toLowerCase()),
    });
  }

  console.log(`  create : ${items.filter((i) => !i.exists).length}`);
  console.log(`  update : ${items.filter((i) => i.exists).length}`);
  for (const i of items.slice(0, 10)) {
    console.log(`     ${i.exists ? "upd" : "new"}  ${i.name}  $${(i.default_price_cents / 100).toFixed(2)}  ${i.kind}`);
  }
  if (items.length > 10) console.log(`     ... and ${items.length - 10} more`);

  if (!APPLY) return;

  let made = 0, upd = 0;
  for (const i of items) {
    const hit = byName.get(i.name.toLowerCase());
    const body = {
      name: i.name, description: i.description,
      default_price_cents: i.default_price_cents, kind: i.kind, active: true,
    };
    if (hit) { await db(`service_catalog?id=eq.${hit.id}`, { method: "PATCH", body: JSON.stringify(body) }); upd++; }
    else { await db("service_catalog", { method: "POST", body: JSON.stringify(body) }); made++; }
  }
  console.log(`\n  DONE: ${made} services created, ${upd} updated.`);
}

// Markate has no service-list export, but every estimate/invoice/work order
// carries its line items as "Name ($1,234.00)" lines in an Items column. The
// catalog is therefore derived from what Sebastian actually sold, priced at the
// median of each item's real history.
async function buildCatalog(files) {
  const prices = new Map();
  for (const file of files) {
    for (const r of parseCsv(readFileSync(file, "utf8"))) {
      for (const ln of (r.items ?? "").split("\n")) {
        const m = ln.trim().match(/^(.+?)\s*\(\$([\d,.]+)\)$/);
        if (!m) continue;
        const name = m[1].trim();
        const cents = dollarsToCents(m[2]);
        if (!name || cents <= 0) continue;
        const key = name.toLowerCase();
        if (!prices.has(key)) prices.set(key, { name, list: [] });
        prices.get(key).list.push(cents);
      }
    }
  }
  const existing = await db("service_catalog?select=id,name");
  const byName = new Map(existing.map((s) => [s.name.toLowerCase(), s]));

  const items = [...prices.values()]
    .map(({ name, list }) => {
      const sorted = [...list].sort((a, b) => a - b);
      return {
        name,
        median: sorted[Math.floor(sorted.length / 2)],
        uses: list.length,
        exists: byName.has(name.toLowerCase()),
      };
    })
    .sort((a, b) => b.uses - a.uses);

  console.log(`\n=== SERVICE CATALOG derived from ${files.length} files ===`);
  console.log(`  new: ${items.filter((i) => !i.exists).length}   already present: ${items.filter((i) => i.exists).length}\n`);
  for (const i of items) {
    console.log(`     ${i.exists ? "have" : "NEW "}  ${String(i.uses).padStart(2)}x  $${(i.median / 100).toFixed(2).padStart(9)}  ${i.name}`);
  }
  if (!APPLY) return;

  let made = 0;
  for (const i of items) {
    if (i.exists) continue;
    await db("service_catalog", {
      method: "POST",
      body: JSON.stringify({ name: i.name, default_price_cents: i.median, kind: "service", active: true }),
    });
    made++;
  }
  console.log(`\n  DONE: ${made} catalog items created.`);
}


// ── Historical records (estimates / work orders / invoices / expenses) ───────
//
// Every imported record is numbered with an "M-" prefix. Markate's INV-000001..3
// and EST-000001/2/4 already exist in the live system with different content and
// `number` is UNIQUE, so importing them unprefixed throws. The prefix also makes
// migrated history visibly distinct from anything the app generated itself.

const MONTHS = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12 };

// ET local wall-clock -> real instant. Mirrors etLocalToIso in lib/canes/types.ts:
// guess UTC, see what ET calls it, correct by the delta. DST-safe.
function etToIso(y, mo, d, hh = 12, mm = 0) {
  const guess = Date.UTC(y, mo - 1, d, hh, mm);
  const seen = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date(guess));
  const g = (t) => Number(seen.find((p) => p.type === t).value);
  const asUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour") % 24, g("minute"));
  return new Date(guess + (guess - asUtc)).toISOString();
}

// Handles "Jul 15, 2026", "15-Jul-2026", "08 Oct 2026", with optional "10:00 am".
function parseDate(raw, hh = 12, mm = 0) {
  if (!raw) return null;
  const t = raw.trim();
  let m = t.match(/^([A-Za-z]{3})[a-z]*\s+(\d{1,2}),?\s+(\d{4})/);       // Jul 15, 2026
  if (m) return etToIso(+m[3], MONTHS[m[1].toLowerCase()], +m[2], hh, mm);
  m = t.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})/);                        // 15-Jul-2026
  if (m) return etToIso(+m[3], MONTHS[m[2].toLowerCase()], +m[1], hh, mm);
  m = t.match(/^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})/);              // 08 Oct 2026
  if (m) return etToIso(+m[3], MONTHS[m[2].toLowerCase()], +m[1], hh, mm);
  return null;
}

const to24 = (h, min, ap) => [(ap || "").toLowerCase() === "pm" ? (h % 12) + 12 : h % 12 || (ap ? 0 : h), min];

// "08 Oct 2026, 10:00 am to 12:00 pm" -> { iso, minutes }
// "16 Sep 2026 5:00 am to Thursday, 17 Sep 2026 11:00 am" -> spans days.
function parseSchedule(raw) {
  if (!raw) return { iso: null, minutes: 120 };
  const times = [...raw.matchAll(/(\d{1,2}):(\d{2})\s*(am|pm)/gi)];
  const dates = [...raw.matchAll(/(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})/g)];
  if (!dates.length) return { iso: null, minutes: 120 };
  const start = times[0] ? to24(+times[0][1], +times[0][2], times[0][3]) : [9, 0];
  const d0 = dates[0];
  const iso = etToIso(+d0[3], MONTHS[d0[2].toLowerCase()], +d0[1], start[0], start[1]);
  let minutes = 120;
  if (times[1]) {
    const end = to24(+times[1][1], +times[1][2], times[1][3]);
    const d1 = dates[1] ?? d0;
    const endIso = etToIso(+d1[3], MONTHS[d1[2].toLowerCase()], +d1[1], end[0], end[1]);
    minutes = Math.max(15, Math.round((Date.parse(endIso) - Date.parse(iso)) / 60000));
  }
  return { iso, minutes };
}

// "Service\nPaver sealing ($6,800.00)\nRoof wash ($1,260.00)\n" -> line items.
// The bare "Service" / "Material" / "Product" lines are section headers, not items.
function parseItems(raw) {
  const out = [];
  for (const ln of (raw || "").split("\n")) {
    const m = ln.trim().match(/^(.+?)\s*\(\$([\d,.]+)\)$/);
    if (!m) continue;
    out.push({ name: m[1].trim(), cents: dollarsToCents(m[2]) });
  }
  return out;
}

// "$1,700.00 of $6,800.00" (partial) or "$520.00" (full).
function parseAmount(raw, status) {
  const m = (raw || "").match(/\$([\d,.]+)\s+of\s+\$([\d,.]+)/);
  if (m) return { paid: dollarsToCents(m[1]), total: dollarsToCents(m[2]) };
  const one = dollarsToCents(raw);
  return { paid: /paid/i.test(status || "") ? one : 0, total: one };
}

const token = (n) => `mk${n}${Math.abs([...n].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7))}`;

// Markate's own export reuses some document numbers (EST-000014 appears twice
// for two different customers). `number` is UNIQUE here, so suffix the repeats
// rather than letting the second insert throw.
function uniqueNumber(base, taken) {
  if (!taken.has(base)) { taken.add(base); return base; }
  for (let i = 2; ; i++) {
    const candidate = `${base}-${i}`;
    if (!taken.has(candidate)) { taken.add(candidate); return candidate; }
  }
}

const EST_STATUS = { accepted: "approved", invoiced: "approved", submitted: "sent",
                     "declined by customer": "declined", lost: "declined", draft: "draft" };
const JOB_STATUS = { new: "unscheduled", scheduled: "scheduled", invoiced: "invoiced",
                     completed: "completed", paid: "paid", canceled: "canceled" };
const PAY_METHOD = { "credit card": "card", cash: "cash", check: "other" };

async function contactIndex() {
  const rows = await db("contacts?select=id,phone,name");
  const byPhone = new Map(), byName = new Map();
  for (const c of rows) {
    if (c.phone) byPhone.set(c.phone, c.id);
    if (c.name) byName.set(c.name.toLowerCase().trim(), c.id);
  }
  return (phone, name) =>
    byPhone.get(toE164(phone) ?? "") ?? byName.get((name || "").toLowerCase().trim()) ?? null;
}

async function importEstimates(file) {
  const rows = parseCsv(readFileSync(file, "utf8"));
  const findContact = await contactIndex();
  const have = new Set((await db("estimates?select=number")).map((e) => e.number));
  console.log(`\n=== ESTIMATES: ${rows.length} rows ===`);

  let made = 0, skip = 0;
  for (const r of rows) {
    const base = `M-${r["estimate#"]}`;
    if (have.has(base) && !rows.some((o) => o !== r && o["estimate#"] === r["estimate#"])) { skip++; continue; }
    const number = uniqueNumber(base, have);
    const status = EST_STATUS[(r.status || "").toLowerCase()] ?? "sent";
    const items = parseItems(r.items);
    const total = dollarsToCents(r.amount);
    const created = parseDate(r.date) ?? new Date().toISOString();
    const address = [r["service address"], r["suite/unit"], r.city, r.state, r.zip]
      .filter(Boolean).join(", ");
    const rec = {
      number, status, created_at: created, updated_at: created,
      contact_id: findContact(r["customer phone"], r["customer name"]),
      customer_name: r["customer name"] || null,
      customer_phone: toE164(r["customer phone"] || ""),
      customer_email: r["customer email"] || null,
      job_address: address || null,
      job_name: r.job || null,
      subtotal_cents: total, total_cents: total,
      tax_cents: dollarsToCents(r.tax), adjustment_cents: dollarsToCents(r.adjustments),
      internal_notes: `Imported from Markate (${r["estimate#"]})${r.instructions ? `\n${r.instructions}` : ""}`,
      public_token: token(number),
      sent_at: created,
      approved_at: status === "approved" ? created : null,
      declined_at: status === "declined" ? created : null,
    };
    console.log(`  ${APPLY ? "+" : "·"} ${number}  ${status.padEnd(9)} $${(total / 100).toFixed(2).padStart(9)}  ${r["customer name"]}`);
    if (!APPLY) { made++; continue; }
    const [row] = await db("estimates", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(rec) });
    for (const [i, it] of items.entries()) {
      await db("estimate_items", { method: "POST", body: JSON.stringify({
        estimate_id: row.id, position: i, name: it.name,
        unit_price_cents: it.cents, line_total_cents: it.cents,
      })});
    }
    made++;
  }
  console.log(`  ${APPLY ? "created" : "would create"}: ${made}   already imported: ${skip}`);
}

async function importWorkOrders(file) {
  const rows = parseCsv(readFileSync(file, "utf8"));
  const findContact = await contactIndex();
  const estByNumber = new Map((await db("estimates?select=id,number")).map((e) => [e.number, e.id]));
  const have = new Set((await db("jobs?select=notes")).map((j) => j.notes).filter(Boolean));
  console.log(`\n=== WORK ORDERS -> JOBS: ${rows.length} rows ===`);

  const usedEstimate = new Set();
  let made = 0, skip = 0;
  for (const r of rows) {
    const wo = r["work order#"];
    const tag = `Imported from Markate (${wo})`;
    if ([...have].some((n) => n.includes(wo))) { skip++; continue; }
    const status = JOB_STATUS[(r.status || "").toLowerCase()] ?? "unscheduled";
    const { iso, minutes } = parseSchedule(r["date scheduled"]);
    const total = dollarsToCents(r.amount);
    // "Job for Estimate #EST-000016" -> link back to the imported estimate,
    // but jobs.estimate_id is UNIQUE so only the first work order may claim it.
    const em = (r.job || "").match(/EST-\d+/);
    let estimateId = em ? estByNumber.get(`M-${em[0]}`) ?? null : null;
    if (estimateId && usedEstimate.has(estimateId)) estimateId = null;
    if (estimateId) usedEstimate.add(estimateId);

    const rec = {
      status, estimate_id: estimateId,
      contact_id: findContact(r["customer phone"], r["customer name"]),
      created_at: parseDate(r["date issued"]) ?? new Date().toISOString(),
      customer_name: r["customer name"] || null,
      customer_phone: toE164(r["customer phone"] || ""),
      customer_email: r["customer email"] || null,
      job_address: r.location || null,
      job_name: r.job || null,
      total_cents: total,
      scheduled_at: iso, duration_minutes: minutes,
      ends_at: iso ? new Date(Date.parse(iso) + minutes * 60000).toISOString() : null,
      assigned_to: r.employees || null,
      site_notes: r.instructions || null,
      notes: tag,
    };
    console.log(`  ${APPLY ? "+" : "·"} ${wo}  ${status.padEnd(11)} $${(total / 100).toFixed(2).padStart(9)}  ${(r["customer name"] || "").padEnd(22)} ${iso ? iso.slice(0, 16) : "unscheduled"}`);
    if (!APPLY) { made++; continue; }
    const [row] = await db("jobs", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(rec) });
    for (const [i, it] of parseItems(r.items).entries()) {
      await db("job_items", { method: "POST", body: JSON.stringify({
        job_id: row.id, position: i, name: it.name, line_total_cents: it.cents,
      })});
    }
    made++;
  }
  console.log(`  ${APPLY ? "created" : "would create"}: ${made}   already imported: ${skip}`);
}

async function importInvoices(file) {
  const rows = parseCsv(readFileSync(file, "utf8"));
  const findContact = await contactIndex();
  const have = new Set((await db("invoices?select=number")).map((i) => i.number));
  const jobs = await db("jobs?select=id,notes,customer_name,total_cents");
  // Money already in the ledger must never be imported twice.
  const existingPayments = await db("payments?select=amount_cents,job_id,status");
  const paidAmounts = new Set(existingPayments.filter((p) => p.status === "completed").map((p) => p.amount_cents));
  console.log(`\n=== INVOICES: ${rows.length} rows ===`);

  const usedJob = new Set();
  let made = 0, skip = 0, dupMoney = 0, ledger = 0;
  const already = new Set(have);
  for (const r of rows) {
    const base = `M-${r["invoice#"]}`;
    if (already.has(base)) { skip++; continue; }
    const number = uniqueNumber(base, have);
    const { paid, total } = parseAmount(r.amount, r.status);
    const name = (r["job & customer"] || "").split(",").pop().replace(/^Job for /i, "").trim();
    const contactId = findContact(r["customer phone"], name);

    // The Mark Serraes deposit is in both systems. Detect any Markate invoice
    // whose collected amount already sits in our ledger and skip it whole,
    // rather than double-count the money.
    if (paid > 0 && paidAmounts.has(paid)) {
      console.log(`  ! SKIP ${number}  $${(paid / 100).toFixed(2)} already in our payments ledger (${name})`);
      dupMoney++; continue;
    }

    const issued = parseDate(r["date issued"]) ?? new Date().toISOString();
    const status = /^paid$/i.test(r.status) ? "paid" : "sent";
    // invoices.job_id is UNIQUE, so claim at most one matching imported job.
    const job = jobs.find((j) => !usedJob.has(j.id) && j.total_cents === total &&
      (j.customer_name || "").toLowerCase() === name.toLowerCase());
    if (job) usedJob.add(job.id);

    const rec = {
      number, status, created_at: issued, updated_at: issued,
      job_id: job?.id ?? null, contact_id: contactId,
      customer_name: name || null,
      customer_phone: toE164(r["customer phone"] || ""),
      customer_email: r["customer email"] || null,
      job_address: r["service address"] || null,
      job_name: r["job & customer"] || null,
      subtotal_cents: total, total_cents: total, amount_paid_cents: paid,
      tax_cents: dollarsToCents(r.tax), adjustment_cents: dollarsToCents(r.adjustments),
      internal_notes: `Imported from Markate (${r["invoice#"]})`,
      public_token: token(number),
      sent_at: issued,
      paid_at: status === "paid" ? (parseDate(r["payment date"]) ?? issued) : null,
    };
    console.log(`  ${APPLY ? "+" : "·"} ${number}  ${status.padEnd(5)} paid $${(paid / 100).toFixed(2).padStart(9)} of $${(total / 100).toFixed(2).padStart(9)}  ${name}`);
    if (!APPLY) { made++; if (paid > 0) ledger++; continue; }
    const [row] = await db("invoices", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(rec) });
    for (const [i, it] of parseItems(r.items).entries()) {
      await db("invoice_items", { method: "POST", body: JSON.stringify({
        invoice_id: row.id, position: i, name: it.name,
        unit_price_cents: it.cents, line_total_cents: it.cents,
      })});
    }
    if (paid > 0) {
      await db("payments", { method: "POST", body: JSON.stringify({
        invoice_id: row.id, job_id: job?.id ?? null, amount_cents: paid,
        method: PAY_METHOD[(r["payment method"] || "").toLowerCase()] ?? "other",
        source: "manual", status: "completed", kind: "balance",
        created_at: parseDate(r["payment date"]) ?? issued,
        recorded_by: "markate-import",
        note: `Markate ${r["invoice#"]} (${r["payment method"] || "unknown method"})`,
      })});
      ledger++;
    }
    made++;
  }
  console.log(`  ${APPLY ? "created" : "would create"}: ${made}   ledger rows: ${ledger}   already imported: ${skip}   skipped as duplicate money: ${dupMoney}`);
}

async function importExpenses(file) {
  // Markate writes each expense across TWO lines: the first carries date/name/
  // amount/work-order, the second only category and billable. Merge the pairs.
  const raw = parseCsv(readFileSync(file, "utf8"));
  const merged = [];
  for (const r of raw) {
    if (r.date || r.amount) merged.push({ ...r });
    else if (merged.length) Object.assign(merged.at(-1), Object.fromEntries(Object.entries(r).filter(([, v]) => v)));
  }
  const jobs = await db("jobs?select=id,notes,customer_name");
  const invoices = await db("invoices?select=id,job_id,number,customer_name,job_address,total_cents,paid_at,created_at");
  const have = await db("job_expenses?select=note");
  const seen = new Set(have.map((e) => e.note).filter(Boolean));
  console.log(`\n=== EXPENSES: ${raw.length} raw lines -> ${merged.length} expenses ===`);

  let made = 0, orphan = 0, skip = 0;
  for (const e of merged) {
    const wo = e["work order#"];
    const note = `${e["expense name"] || "Expense"} — Markate${wo ? ` ${wo}` : ""}`;
    if (seen.has(note)) { skip++; continue; }
    // Prefer the work-order id; some expenses reference work orders that were
    // not in the export, so fall back to the customer's most recent job.
    let job = wo ? jobs.find((j) => (j.notes || "").includes(wo)) : null;
    if (!job && e.customer) {
      const cand = jobs.filter((j) => (j.customer_name || "").toLowerCase() === e.customer.toLowerCase());
      job = cand.at(-1) ?? null;
      if (job) console.log(`    (matched ${wo || "expense"} to ${e.customer}'s job by name)`);
    }
    // Some work orders never made it into the export even though the job was
    // done and invoiced. Rebuild the job from its invoice so the material cost
    // has somewhere to live -- it feeds per-job margin, so dropping it skews pay.
    if (!job && e.customer) {
      const inv = invoices.find((i) => !i.job_id &&
        (i.customer_name || "").toLowerCase() === e.customer.toLowerCase());
      if (inv) {
        console.log(`    (rebuilding job for ${e.customer} from ${inv.number} -- work order missing from export)`);
        if (APPLY) {
          const [row] = await db("jobs", { method: "POST", headers: { Prefer: "return=representation" },
            body: JSON.stringify({
              status: "paid", customer_name: inv.customer_name, job_address: inv.job_address,
              total_cents: inv.total_cents, created_at: inv.created_at,
              scheduled_at: inv.paid_at ?? inv.created_at,
              notes: `Rebuilt from Markate ${inv.number} (work order ${wo || "unknown"} missing from export)`,
            })});
          await db(`invoices?id=eq.${inv.id}`, { method: "PATCH", body: JSON.stringify({ job_id: row.id }) });
          jobs.push(row); inv.job_id = row.id; job = row;
        } else { job = { id: "dry-run" }; }
      }
    }
    const cents = dollarsToCents(e.amount);
    if (!job) {
      console.log(`  ! no job for ${wo || "(no work order)"} — ${e["expense name"]} $${(cents / 100).toFixed(2)} (${e.customer || "?"})`);
      orphan++; continue;
    }
    console.log(`  ${APPLY ? "+" : "·"} $${(cents / 100).toFixed(2).padStart(9)}  ${(e.category || "Materials").padEnd(18)} ${e["expense name"]}`);
    if (APPLY) {
      await db("job_expenses", { method: "POST", body: JSON.stringify({
        job_id: job.id, amount_cents: cents,
        category: e.category || "Materials", note,
        created_at: parseDate(e.date) ?? new Date().toISOString(),
        created_by: "markate-import",
      })});
    }
    made++;
  }
  console.log(`  ${APPLY ? "created" : "would create"}: ${made}   no matching job: ${orphan}   already imported: ${skip}`);
}

console.log(APPLY ? "MODE: APPLY (writing to the live Canes database)" : "MODE: DRY RUN (nothing will be written)");
if (customersCsv) await importCustomers(customersCsv);
if (servicesCsv) await importServices(servicesCsv);
if (catalogFrom.length) await buildCatalog(catalogFrom);
if (estimatesCsv) await importEstimates(estimatesCsv);
if (workordersCsv) await importWorkOrders(workordersCsv);
if (invoicesCsv) await importInvoices(invoicesCsv);
if (expensesCsv) await importExpenses(expensesCsv);
if (!APPLY) console.log("\nRe-run with --apply to write.");
