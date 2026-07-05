import { generateObject } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { etLocalToIso, toE164 } from "@/lib/canes/types";

// Vendor lead parsing, two tiers. The lead vendor's app sends a stable
// template (verified against real texts 2026-07-05 — see the vault handoff),
// so a strict pattern-match runs first: instant, free, deterministic, and
// immune to AI outages. Anything that deviates falls through to Gemini Flash,
// which handles free-form blobs. Strictness is the safety valve — on any
// ambiguity the structured parser returns null and the LLM takes over.
// Parsed fields stay editable in the UI and low confidence flags for review.

const LeadParse = z.object({
  is_lead: z
    .boolean()
    .describe("true if this message contains at least one customer lead; false for chit-chat"),
  leads: z.array(
    z.object({
      type: z
        .enum(["hot", "cold"])
        .describe("hot = an estimate appointment is already set; cold = virtual quote / price request only"),
      name: z.string().nullable(),
      phone: z.string().nullable().describe("the CUSTOMER's phone number as written"),
      address: z.string().nullable(),
      service: z.string().nullable().describe("what they want washed, verbatim-ish"),
      appointment_iso: z
        .string()
        .nullable()
        .describe("if hot: the appointment datetime as full ISO 8601 with -04:00/-05:00 offset, resolved from relative words"),
      notes: z.string().nullable(),
      confidence: z.number().min(0).max(1),
    }),
  ),
});

export type ParsedLead = z.infer<typeof LeadParse>["leads"][number] & { phone_e164: string | null };

// ── Tier 1: strict template match (no AI) ────────────────────────────────────
// The vendor's real format:
//   WANTS A VIRTUAL QUOTE ONLY - Root 2 Roof Exteriors      (cold)
//   NEW BOOKED APPOINTMENT - IN PERSON - Root 2 Roof ...    (hot)
//   <Name>
//   <(561) 719-0949>
//   <378 River Edge Rd Jupiter FL 33477>
//   <Friday, December 25, 2026 2:00 PM>                     (hot only)
//   Requested Service/s: <services>

const HEADER_COLD = /^wants a virtual quote/i;
const HEADER_HOT = /^new booked appointment/i;
const SERVICES_RE = /^requested service(?:\/?s)?\s*:\s*(.*)$/i;
const DATE_RE =
  /^(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday),?\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2}),?\s+(\d{4})[\s,]+(\d{1,2}):(\d{2})\s*(am|pm)$/i;

const MONTH_NUM: Record<string, string> = {
  january: "01", february: "02", march: "03", april: "04", may: "05", june: "06",
  july: "07", august: "08", september: "09", october: "10", november: "11", december: "12",
};

function parseTemplateDate(line: string): string | null {
  const m = line.match(DATE_RE);
  if (!m) return null;
  const [, month, day, year, hourRaw, minute, ampm] = m;
  let hour = Number(hourRaw) % 12;
  if (ampm.toLowerCase() === "pm") hour += 12;
  const naive = `${year}-${MONTH_NUM[month.toLowerCase()]}-${day.padStart(2, "0")}T${String(hour).padStart(2, "0")}:${minute}`;
  const iso = etLocalToIso(naive);
  return Number.isNaN(new Date(iso).getTime()) ? null : iso;
}

export function parseVendorStructured(body: string): ParsedLead | null {
  const lines = body.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 3) return null;

  const type = HEADER_COLD.test(lines[0]) ? "cold" : HEADER_HOT.test(lines[0]) ? "hot" : null;
  if (!type) return null;

  // Exactly one phone line, or this isn't the single-lead template — bail.
  // Date lines are excluded first: "Saturday, July 11, 2026 12:00 PM" happens
  // to contain exactly 10 digits and would otherwise read as a phone number.
  const rest = lines.slice(1);
  const isPhoneLine = (l: string) => !DATE_RE.test(l) && toE164(l) !== null;
  const phoneLines = rest.filter(isPhoneLine);
  if (phoneLines.length !== 1) return null;
  const phoneIdx = rest.findIndex(isPhoneLine);
  const phone = rest[phoneIdx];
  const phone_e164 = toE164(phone);

  // Everything above the phone is the customer's name; digits there mean
  // we're misreading the shape — let the LLM look instead.
  const name = rest.slice(0, phoneIdx).join(" ").trim();
  if (!name || /\d/.test(name)) return null;

  let appointment_iso: string | null = null;
  let service: string | null = null;
  let inServices = false;
  const addressLines: string[] = [];

  for (const line of rest.slice(phoneIdx + 1)) {
    const svc = line.match(SERVICES_RE);
    if (svc) {
      inServices = true;
      if (svc[1]) service = svc[1].trim();
      continue;
    }
    if (inServices) {
      service = service ? `${service}, ${line}` : line;
      continue;
    }
    const when = parseTemplateDate(line);
    if (when) {
      if (appointment_iso) return null; // two datetimes — not the template
      appointment_iso = when;
      continue;
    }
    addressLines.push(line);
  }

  // A "booked appointment" without a cleanly parsed time is exactly the case
  // the AI should judge.
  if (type === "hot" && !appointment_iso) return null;

  return {
    type,
    name,
    phone,
    phone_e164,
    address: addressLines.join(", ") || null,
    service: service || null,
    appointment_iso,
    notes: null,
    confidence: 1,
  };
}

// ── Tier 2: LLM fallback for anything off-template ───────────────────────────

export async function parseVendorMessage(body: string): Promise<ParsedLead[]> {
  const structured = parseVendorStructured(body);
  if (structured) {
    console.log("[canes] vendor text matched the structured template; LLM skipped");
    return [structured];
  }
  const nowEt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date());

  const model = process.env.CANES_PARSE_MODEL ?? "gemini-2.5-flash";
  const { object } = await generateObject({
    model: google(model),
    schema: LeadParse,
    prompt: [
      "You parse incoming lead texts for Canes Pressure Washing, a pressure-washing company in West Palm Beach, Florida.",
      `The current date and time in Eastern Time is: ${nowEt}.`,
      "A lead vendor texts leads in free form. Extract every distinct lead in the message.",
      "hot = the vendor already set an estimate appointment (words like 'appt set', 'confirmed', 'scheduled', a specific day/time for a visit).",
      "cold = a virtual quote / price-shopping request with no appointment.",
      "Resolve relative dates ('tomorrow 10am', 'Saturday morning') against the current Eastern time; morning = 10:00, afternoon = 14:00 if unstated.",
      "Never invent data: unknown fields are null. confidence reflects how sure you are about the extraction overall.",
      "Message:",
      body,
    ].join("\n"),
  });

  if (!object.is_lead) return [];
  return object.leads.map((l) => ({ ...l, phone_e164: l.phone ? toE164(l.phone) : null }));
}
