import { generateObject } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { toE164 } from "@/lib/canes/types";

// LLM lead parsing — the lead vendor texts free-form blobs; this turns them
// into structured lead cards. Gemini Flash via the AI SDK (already the stack
// for urso.ai). Cheap, one call per vendor message. Parsed fields stay
// editable in the UI and low confidence flags the card for review.

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

export async function parseVendorMessage(body: string): Promise<ParsedLead[]> {
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
