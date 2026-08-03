"use client";

import { useMfLanguage } from "./mf-language";

type MfLogoProps = {
  compact?: boolean;
};

export function MfLogo({ compact = false }: MfLogoProps) {
  const { language } = useMfLanguage();
  return (
    <div className="mf-logo" aria-label="Minerbo-Fuchs Engenharia">
      <svg aria-hidden="true" viewBox="0 0 124 46" className="mf-logo-mark">
        <path d="M2 39 20 5l14 23L49 5l19 34H54l-7-15-13 20-13-20-7 15H2Z" fill="currentColor" />
        <path d="M69 39 88 5h34l-7 12H92l-4 7h22l-7 12H82l-2 3H69Z" fill="currentColor" />
      </svg>
      {!compact ? (
        <span className="mf-logo-copy">
          <strong>minerbo–fuchs</strong>
          <span>engenharia s.a.</span>
        </span>
      ) : null}
      <span className="sr-only">{language === "pt" ? "Logo provisório" : "Placeholder logo"}</span>
    </div>
  );
}
