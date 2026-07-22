"use client";

import { useState } from "react";
import { AddressInput } from "./address-input";
import { PhoneInput } from "./phone-input";

// Public request-a-quote form. Posts to /api/canes/lead/intake, which creates a
// website lead and fires the speed-to-lead automation. The consent checkbox
// mirrors the compliant opt-in language on /CanesPressure/terms and /privacy
// and is deliberately OPTIONAL (A2P forbids making SMS consent a condition of
// submitting), and a hidden honeypot filters bots.

const SERVICES = [
  "Driveway",
  "House wash",
  "Roof wash",
  "Patio or lanai",
  "Pavers and sealing",
  "Commercial",
  "Something else",
];

type Errors = Partial<Record<"name" | "phone" | "consent" | "form", string>>;

export default function RequestForm() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [service, setService] = useState("");
  const [message, setMessage] = useState("");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState(""); // honeypot
  const [errors, setErrors] = useState<Errors>({});
  const [status, setStatus] = useState<"idle" | "sending" | "done">("idle");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const next: Errors = {};
    if (!name.trim()) next.name = "Please enter your name.";
    if (!phone.trim()) next.phone = "Please enter your phone number.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setStatus("sending");
    try {
      const res = await fetch("/api/canes/lead/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone, email, address, service, message, consent, website }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        errors?: Errors;
        error?: string;
      };
      if (res.ok && data.ok) {
        setStatus("done");
        return;
      }
      setErrors(data.errors ?? { form: data.error ?? "Something went wrong. Please try again." });
      setStatus("idle");
    } catch {
      setErrors({ form: "We could not reach the server. Please text us at (561) 652-6652." });
      setStatus("idle");
    }
  }

  if (status === "done") {
    return (
      <div className="mt-5 rounded-xl border border-[var(--cp-line)] bg-[var(--cp-surface)] p-6 text-center">
        <p className="cp-display text-[20px]">
          Thanks<span className="text-[var(--cp-brand)]">!</span>
        </p>
        <p className="mt-1.5 text-[14px] text-[var(--cp-muted)]">
          Sebastian will reach out shortly.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-5 space-y-3" noValidate>
      <div>
        <label className="cp-label" htmlFor="rq-name">
          Name
        </label>
        <input
          id="rq-name"
          className="cp-input"
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
        />
        {errors.name && <p className="mt-1 text-[12.5px] text-[var(--cp-danger)]">{errors.name}</p>}
      </div>

      <div>
        <label className="cp-label" htmlFor="rq-phone">
          Phone
        </label>
        <PhoneInput id="rq-phone" defaultValue={phone} onChange={setPhone} />
        {errors.phone && <p className="mt-1 text-[12.5px] text-[var(--cp-danger)]">{errors.phone}</p>}
      </div>

      <div>
        <label className="cp-label" htmlFor="rq-email">
          Email (optional)
        </label>
        <input
          id="rq-email"
          className="cp-input"
          type="email"
          placeholder="name@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
      </div>

      <div>
        <label className="cp-label" htmlFor="rq-address">
          Property address (optional)
        </label>
        <AddressInput id="rq-address" value={address} onChange={setAddress} />
      </div>

      <div>
        <label className="cp-label" htmlFor="rq-service">
          What needs washing? (optional)
        </label>
        <select
          id="rq-service"
          className="cp-select"
          value={service}
          onChange={(e) => setService(e.target.value)}
        >
          <option value="">Choose a service</option>
          {SERVICES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="cp-label" htmlFor="rq-message">
          Details (optional)
        </label>
        <textarea
          id="rq-message"
          className="cp-textarea"
          rows={3}
          placeholder="Tell us a bit about the job, gate codes, or timing."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
      </div>

      {/* Honeypot: hidden from people, tempting to bots. Kept out of the tab
          order and off assistive tech; a filled value gets a silent success. */}
      <div aria-hidden="true" className="absolute left-[-9999px] top-[-9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="rq-website">Website</label>
        <input
          id="rq-website"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </div>

      <label className="flex cursor-pointer items-start gap-2.5 pt-1 text-[12.5px] leading-relaxed text-[var(--cp-muted)]">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--cp-brand-fill)]"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
        />
        <span>
          I agree to receive text messages from Canes Pressure Washing about my request, including
          replies to my inquiry, quote follow-ups, and appointment confirmations and reminders.
          Consent is not a condition of purchase. Message frequency varies.
          Message and data rates may apply. Reply HELP for help or STOP to opt out. See our{" "}
          <a
            className="font-semibold text-[var(--cp-brand-deep)] hover:underline"
            href="/CanesPressure/terms"
            target="_blank"
            rel="noopener noreferrer"
          >
            SMS terms
          </a>{" "}
          and{" "}
          <a
            className="font-semibold text-[var(--cp-brand-deep)] hover:underline"
            href="/CanesPressure/privacy"
            target="_blank"
            rel="noopener noreferrer"
          >
            Privacy policy
          </a>
          .
        </span>
      </label>
      {errors.consent && (
        <p className="text-[12.5px] text-[var(--cp-danger)]">{errors.consent}</p>
      )}

      {errors.form && <p className="text-[12.5px] text-[var(--cp-danger)]">{errors.form}</p>}

      <button
        type="submit"
        className="cp-btn cp-btn-primary cp-btn-block"
        disabled={status === "sending"}
      >
        {status === "sending" ? "Sending..." : "Request my quote"}
      </button>
    </form>
  );
}
