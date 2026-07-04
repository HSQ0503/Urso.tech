import { NextResponse } from "next/server";
import { sendContactSubmission } from "@/lib/email";

// Accepts both the homepage CTA (name/email/phone/about) and the
// book-a-diagnostic form (name/email/brand/clarity). Only name + email are
// required; the rest is captured opportunistically. No database row — the
// founder email is the delivery — so a send failure is surfaced to the visitor
// rather than dropped. Routing + Resend live in lib/email.ts.

type Payload = {
  name?: string;
  email?: string;
  brand?: string;
  clarity?: string;
  phone?: string;
  about?: string;
};

export async function POST(req: Request) {
  let body: Payload;
  try {
    body = (await req.json()) as Payload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = body.name?.trim() ?? "";
  const email = body.email?.trim() ?? "";

  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (!email) return NextResponse.json({ error: "Email is required" }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Email looks invalid" }, { status: 400 });
  }

  // Breadcrumb so a lead is recoverable from logs even if the transport blips.
  console.log("[diagnostic request]", { name, email, at: new Date().toISOString() });

  const { sent, error } = await sendContactSubmission({
    kind: "Diagnostic request",
    name,
    email,
    org: body.brand?.trim() || undefined,
    facts: [{ label: "Phone", value: body.phone?.trim() ?? "" }],
    answers: [
      { label: "Where they think they're leaking", value: body.clarity?.trim() ?? "" },
      { label: "About the business", value: body.about?.trim() ?? "" },
    ],
  });

  if (!sent) {
    console.error("[diagnostic request] notification failed:", error);
    return NextResponse.json(
      { error: "We couldn't send that. Please try again, or email us at hello@urso.ws." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
