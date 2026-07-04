import { NextResponse } from "next/server";
import { sendContactSubmission } from "@/lib/email";

// Contact form (app/contact). There's no database row for these — the founder
// notification email IS the delivery — so a send failure is surfaced to the
// visitor (the form re-arms and shows the error) rather than silently dropping
// a lead. Routing + Resend live in lib/email.ts (sendContactSubmission).

type Payload = {
  name?: string;
  email?: string;
  company?: string;
  website?: string;
  businessType?: string;
  locations?: string;
  challenge?: string;
  stack?: string;
};

export async function POST(req: Request) {
  let body: Payload;
  try {
    body = (await req.json()) as Payload;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const name = body.name?.trim() ?? "";
  const email = body.email?.trim() ?? "";
  const company = body.company?.trim() ?? "";

  if (!name) return NextResponse.json({ error: "Name is required." }, { status: 400 });
  if (!email) return NextResponse.json({ error: "Email is required." }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "That email looks off." }, { status: 400 });
  }
  if (!company) return NextResponse.json({ error: "Company is required." }, { status: 400 });

  // Breadcrumb so a lead is recoverable from logs even if the transport blips.
  console.log("[contact]", { name, email, company, at: new Date().toISOString() });

  const { sent, error } = await sendContactSubmission({
    kind: "Contact form",
    name,
    email,
    org: company,
    facts: [
      { label: "Website", value: body.website?.trim() ?? "" },
      { label: "Business type", value: body.businessType?.trim() ?? "" },
      { label: "Locations", value: body.locations?.trim() ?? "" },
    ],
    answers: [
      { label: "What's getting harder as they grow", value: body.challenge?.trim() ?? "" },
      { label: "What runs the business today", value: body.stack?.trim() ?? "" },
    ],
  });

  if (!sent) {
    console.error("[contact] notification failed:", error);
    return NextResponse.json(
      { error: "We couldn't send that. Please try again, or email us at hello@urso.ws." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
