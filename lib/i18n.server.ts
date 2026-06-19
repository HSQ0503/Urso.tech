import { cookies } from "next/headers";
import { DEFAULT_LOCALE, LANG_COOKIE, isLocale, translator, type Locale, type T } from "./i18n";

// Server-side locale resolution from the urso-lang cookie. Used by dashboard
// server components so their text translates on the same toggle as the chrome.
export async function getLocale(): Promise<Locale> {
  const v = (await cookies()).get(LANG_COOKIE)?.value;
  return isLocale(v) ? v : DEFAULT_LOCALE;
}

export async function getI18n(): Promise<{ locale: Locale; t: T }> {
  const locale = await getLocale();
  return { locale, t: translator(locale) };
}
