import { createHmac, timingSafeEqual } from "node:crypto";
import { toE164 } from "@urso/types";

// Pure Instant Form helpers. The webhook route verifies HMAC over the raw body
// then maps Meta field_data onto Canes lead fields. No database here so the
// parser can be tested without PGlite or Graph.

export type InstantFormFields = {
  name: string;
  phone: string | null;
  email: string;
  address: string;
  service: string;
  notes: string;
};

const MAPPED = new Set([
  "full_name",
  "name",
  "first_name",
  "last_name",
  "email",
  "email_address",
  "phone_number",
  "phone",
  "mobile_number",
  "street_address",
  "address",
  "city",
  "state",
  "zip_code",
  "zip",
  "post_code",
  "country",
  "service",
  "services",
]);

function fieldName(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().toLowerCase().replace(/\s+/g, "_") : "";
}

function fieldValues(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function firstValue(fields: Map<string, string[]>, ...names: string[]): string {
  for (const name of names) {
    const value = fields.get(name)?.[0];
    if (value) return value;
  }
  return "";
}

export function parseInstantFormFields(fieldData: unknown): InstantFormFields {
  const fields = new Map<string, string[]>();
  if (Array.isArray(fieldData)) {
    for (const row of fieldData) {
      if (!row || typeof row !== "object") continue;
      const name = fieldName((row as { name?: unknown }).name);
      const values = fieldValues((row as { values?: unknown }).values);
      if (name && values.length > 0) fields.set(name, values);
    }
  }

  const first = firstValue(fields, "first_name");
  const last = firstValue(fields, "last_name");
  const name =
    firstValue(fields, "full_name", "name") || [first, last].filter(Boolean).join(" ");
  const phone = toE164(firstValue(fields, "phone_number", "phone", "mobile_number"));
  const email = firstValue(fields, "email", "email_address");
  const street = firstValue(fields, "street_address", "address");
  const city = firstValue(fields, "city");
  const region = firstValue(fields, "state");
  const zip = firstValue(fields, "zip_code", "zip", "post_code");
  const country = firstValue(fields, "country");
  const address = [street, [city, region].filter(Boolean).join(", "), zip, country]
    .filter(Boolean)
    .join(", ");
  const extras: string[] = [];
  for (const [key, values] of fields) {
    if (MAPPED.has(key)) continue;
    extras.push(`${key.replace(/_/g, " ")}: ${values.join(", ")}`);
  }
  return {
    name,
    phone,
    email,
    address,
    service: firstValue(fields, "service", "services"),
    notes: extras.join("\n"),
  };
}

export function leadgenIdsFromPayload(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") return [];
  const body = payload as { object?: unknown; entry?: unknown };
  if (body.object !== "page" || !Array.isArray(body.entry)) return [];
  const ids: string[] = [];
  for (const entry of body.entry) {
    if (!entry || typeof entry !== "object") continue;
    const changes = (entry as { changes?: unknown }).changes;
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      if (!change || typeof change !== "object") continue;
      const field = (change as { field?: unknown }).field;
      const value = (change as { value?: { leadgen_id?: unknown } }).value;
      if (field !== "leadgen") continue;
      const id = value && typeof value.leadgen_id === "string" ? value.leadgen_id.trim() : "";
      if (id) ids.push(id);
    }
  }
  return [...new Set(ids)];
}

// Meta signs POST bodies as sha256=<hex HMAC of the raw bytes with the App Secret>.
export function verifyMetaSignature(
  header: string | null,
  rawBody: string,
  secret: string | undefined,
): boolean {
  if (!secret || !header) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(rawBody, "utf8").digest("hex")}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(header);
  return a.length === b.length && timingSafeEqual(a, b);
}
