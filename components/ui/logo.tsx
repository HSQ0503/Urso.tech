"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, type CSSProperties } from "react";

const letters = ["U", "r", "s", "o"];

export function Logo() {
  const [pounced, setPounced] = useState(false);

  return (
    <Link
      href="/"
      className={`brand brand--nav${pounced ? " brand--pounced" : ""}`}
      aria-label="Urso home"
      onMouseEnter={() => setPounced(true)}
      onFocus={() => setPounced(true)}
    >
      <span className="brand-bear-wrap">
        <Image
          className="brand-bear"
          src="/assets/logo-orange.png"
          alt=""
          width={2000}
          height={2000}
          priority
        />
      </span>
      <span className="brand-word" aria-hidden="true">
        {letters.map((ch, i) => (
          <span
            key={i}
            className="bw-letter"
            style={{ "--bi": i } as CSSProperties}
          >
            {ch}
          </span>
        ))}
      </span>
    </Link>
  );
}
