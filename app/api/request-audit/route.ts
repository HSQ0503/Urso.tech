import { NextResponse } from "next/server";

// Stub. The form UX is complete; backend delivery is deferred until Han
// confirms destination (Resend domain, CRM webhook, etc).
//
// To wire Resend (the recommended path): set RESEND_API_KEY in env and
// uncomment the fetch block below. Once a verified sender is set up,
// change the `from` value from the Resend test sender to your domain.
//
// const res = await fetch("https://api.resend.com/emails", {
//   method: "POST",
//   headers: {
//     Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
//     "Content-Type": "application/json",
//   },
//   body: JSON.stringify({
//     from: "Urso Audit <onboarding@resend.dev>",
//     to: ["hsq0503@gmail.com"],
//     subject: `Audit request — ${name}`,
//     html: `<p><b>Name:</b> ${escapeHtml(name)}</p>
//            <p><b>Email:</b> ${escapeHtml(email)}</p>
//            <p><b>Phone:</b> ${escapeHtml(phone || "(not provided)")}</p>
//            <p><b>About:</b><br/>${escapeHtml(about || "(not provided)").replace(/\n/g, "<br/>")}</p>`,
//   }),
// });
// if (!res.ok) throw new Error("Resend rejected the message");

type Payload = {
  name: string;
  email: string;
  phone: string;
  about: string;
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

  console.log("[audit request]", {
    name,
    email,
    phone: body.phone,
    about: body.about,
    at: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true });
}
