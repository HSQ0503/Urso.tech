import { NextResponse } from "next/server";

// Stub. The form UX is complete; backend delivery is deferred until the
// destination is confirmed (Resend domain, CRM webhook, etc).
//
// To wire Resend: set RESEND_API_KEY in env and uncomment the fetch block.
// Once a verified sender is set up, change `from` to your domain.
//
// const res = await fetch("https://api.resend.com/emails", {
//   method: "POST",
//   headers: {
//     Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
//     "Content-Type": "application/json",
//   },
//   body: JSON.stringify({
//     from: "Urso <onboarding@resend.dev>",
//     to: ["hsq0503@gmail.com"],
//     subject: `New conversation — ${name} (${company || "—"})`,
//     html: `<p><b>Name:</b> ${name}</p><p><b>Email:</b> ${email}</p>...`,
//   }),
// });
// if (!res.ok) throw new Error("Resend rejected the message");

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

  console.log("[contact]", {
    name,
    email,
    company,
    website: body.website,
    businessType: body.businessType,
    locations: body.locations,
    challenge: body.challenge,
    stack: body.stack,
    at: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true });
}
