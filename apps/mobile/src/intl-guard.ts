import { fmtEt } from "@urso/types";

// Runtime proof that Intl timezone support actually works on this device.
//
// Every time in this system is America/New_York, rendered through fmtEt(),
// which is Intl.DateTimeFormat with { timeZone: "America/New_York" }. Hermes
// implements ECMA-402 by projecting the PLATFORM's internationalization
// facilities rather than bundling ICU, so its behaviour varies by OS and build
// — and a build without full timezone data does not throw. It silently falls
// back, and every job time in the app renders in the device's timezone instead
// of the shop's.
//
// That failure is invisible in a simulator set to Eastern. A technician in a
// different timezone would just see wrong arrival times and never know why.
// This project has already lost a full cron cycle to a timezone bug that was
// invisible for weeks, so the rule is: prove it at runtime, don't assume it.
//
// ── Why this asserts the HOUR NUMBER and not a formatted string ──────────────
//
// The first version compared fmtEt(...) against the literal "12:00 PM" and
// failed on the very first simulator boot — with a log line where expected and
// actual printed IDENTICALLY. The difference was invisible: Apple's formatter
// separates the time from the meridiem with U+202F (narrow no-break space),
// while Node's ICU uses a plain U+0020. Validating those literals against Node
// beforehand therefore proved nothing about iOS; it just happened to agree with
// the platform I checked on.
//
// So the guard now formats with hour12:false and compares a bare hour number.
// No separator, no meridiem, no locale punctuation — nothing a platform can
// render differently while still being correct. It tests the timezone, which is
// what actually matters, rather than presentation, which does not.

const CASES = [
  // 2026-01-15T17:00Z — EST (UTC-5) → hour 12
  { iso: "2026-01-15T17:00:00.000Z", hour: "12", label: "EST" },
  // 2026-07-15T17:00Z — EDT (UTC-4) → hour 13. The second case is what catches
  // a device with timezone data but no DST rules.
  { iso: "2026-07-15T17:00:00.000Z", hour: "13", label: "EDT" },
];

export type IntlCheck = { ok: boolean; detail: string };

export function checkEtSupport(): IntlCheck {
  try {
    for (const { iso, hour, label } of CASES) {
      const got = fmtEt(iso, { hour: "numeric", hour12: false });
      // Strip anything that isn't a digit: some locales pad or annotate the
      // hour, and none of that changes whether the timezone was applied.
      const gotHour = got.replace(/\D/g, "");
      if (gotHour !== hour) {
        const detail = `${label}: expected hour ${hour} for ${iso}, got ${gotHour || `"${got}"`}. This device is not applying the America/New_York timezone, so job times would be wrong.`;
        // The on-screen card is deliberately non-technical; whoever debugs this
        // needs the real values, and on a technician's phone the log is the only
        // place they survive.
        console.warn(`[urso intl-guard] ${detail}`);
        console.warn(
          `[urso intl-guard] device timeZone: ${
            Intl.DateTimeFormat().resolvedOptions().timeZone ?? "unknown"
          }`,
        );
        return { ok: false, detail };
      }
    }
    return { ok: true, detail: "Eastern time rendering verified." };
  } catch (e) {
    const detail = `Intl timezone formatting threw: ${e instanceof Error ? e.message : String(e)}`;
    console.warn(`[urso intl-guard] ${detail}`);
    return { ok: false, detail };
  }
}
