"use client";

// Carries the server-resolved locale to client components so they translate on
// the same toggle as the server-rendered chrome. The locale comes from the
// dashboard layout (the urso-lang cookie), so there's no hydration mismatch.

import { createContext, useContext, useEffect, type ReactNode } from "react";
import { translator, type Locale, type T } from "@/lib/i18n";

const Ctx = createContext<{ locale: Locale; t: T }>({ locale: "en", t: translator("en") });

export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  useEffect(() => {
    document.documentElement.setAttribute("lang", locale);
  }, [locale]);
  return <Ctx.Provider value={{ locale, t: translator(locale) }}>{children}</Ctx.Provider>;
}

export const useLocale = () => useContext(Ctx);
export const useT = (): T => useContext(Ctx).t;
