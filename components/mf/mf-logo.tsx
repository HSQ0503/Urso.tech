"use client";

import Image from "next/image";
import { useMfLanguage } from "./mf-language";

type MfLogoProps = {
  compact?: boolean;
};

export function MfLogo({ compact = false }: MfLogoProps) {
  const { language } = useMfLanguage();
  return (
    <div className="mf-logo" aria-label="Minerbo-Fuchs Engenharia">
      <span aria-hidden="true" className="mf-logo-mark">
        <Image
          src="/brand/mf-logo.png"
          alt=""
          width={1024}
          height={1024}
          sizes="106px"
          className="mf-logo-image"
        />
      </span>
      {!compact ? (
        <span className="mf-logo-copy">
          <strong>minerbo–fuchs</strong>
          <span>engenharia s.a.</span>
        </span>
      ) : null}
      <span className="sr-only">
        {language === "pt" ? "Logo oficial da Minerbo-Fuchs" : "Official Minerbo-Fuchs logo"}
      </span>
    </div>
  );
}
