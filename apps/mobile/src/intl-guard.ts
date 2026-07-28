import { fmtEt } from "@urso/types";

// Runtime proof that Intl timezone support actually works on this device.
//
// Every time in this system is America/New_York, rendered through fmtEt(),
// which is Intl.DateTimeFormat with { timeZone: "America/New_York" }. Hermes
// implements ECMA-402 by projecting the PLATFORM's internationalization
// facilities rather than bundling ICU, so its behaviour varies by OS and build
// — and a Hermes build without full timezone data does not throw. It silently
// falls back, and every job time in the app renders in the device's timezone
// instead of the shop's.
//
// That failure is invisible in a simulator set to Eastern. A technician in a
// different timezone would just see wrong arrival times and never know why.
// This project has already lost a full cron cycle to a timezone bug that was
// invisible for weeks (day-before confirmations self-cancelling on a string
// comparison), so the rule here is: prove it at runtime, don't assume it.
//
// Two fixed instants, one on each side of the DST boundary. A device that
// ignores the timeZone option, or lacks the DST rules, fails at least one.

const CASES = [
  // 2026-01-15T17:00Z — EST (UTC-5) → 12:00 PM
  { iso: "2026-01-15T17:00:00.000Z", expect: "12:00 PM" },
  // 2026-07-15T17:00Z — EDT (UTC-4) → 1:00 PM
  { iso: "2026-07-15T17:00:00.000Z", expect: "1:00 PM" },
];

export type IntlCheck = { ok: boolean; detail: string };

export function checkEtSupport(): IntlCheck {
  try {
    for (const { iso, expect } of CASES) {
      const got = fmtEt(iso, { hour: "numeric", minute: "2-digit" });
      if (got !== expect) {
        return {
          ok: false,
          detail: `Expected ${expect} for ${iso}, got ${got}. This device is not applying the America/New_York timezone, so job times would be wrong.`,
        };
      }
    }
    return { ok: true, detail: "Eastern time rendering verified." };
  } catch (e) {
    return {
      ok: false,
      detail: `Intl timezone formatting threw: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}
