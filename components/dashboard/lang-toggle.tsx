"use client";

// English / Portuguese switch. The locale lives in the urso-lang cookie; on
// change we update it, set <html lang>, and refresh so both server and client
// components re-render translated. Styled to match ThemeToggle.

import { useRouter } from "next/navigation";
import { LANG_COOKIE, LOCALES, type Locale } from "@/lib/i18n";
import { useLocale } from "./locale-provider";

const LABEL: Record<Locale, string> = { en: "EN", pt: "PT" };

// Module scope (like ThemeToggle's applyTheme) so the DOM/cookie writes aren't
// flagged by the react-hooks immutability rule.
function applyLang(l: Locale) {
  document.cookie = `${LANG_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
  document.documentElement.setAttribute("lang", l);
}

export function LangToggle() {
  const router = useRouter();
  const { locale } = useLocale();

  const set = (l: Locale) => {
    if (l === locale) return;
    applyLang(l);
    router.refresh();
  };

  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg border border-edge bg-raise p-0.5" role="group" aria-label="Language">
      {LOCALES.map((l) => {
        const active = locale === l;
        return (
          <button
            key={l}
            onClick={() => set(l)}
            aria-pressed={active}
            title={l === "en" ? "English" : "Português"}
            className={`cursor-pointer rounded-md px-2 py-1 font-mono text-2xs uppercase tracking-[0.1em] transition-colors ${
              active ? "bg-raise-strong text-ink" : "text-ink-dim hover:text-ink"
            }`}
          >
            {LABEL[l]}
          </button>
        );
      })}
    </div>
  );
}
