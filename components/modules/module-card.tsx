"use client";

import { useState, useRef, type ReactNode } from "react";
import { Icon } from "../ui/icon";

type ModuleCardProps = {
  tag:
    | "star"
    | "calendar"
    | "phone"
    | "pin"
    | "repeat"
    | "bot"
    | "layers"
    | "chart"
    | "dollar"
    | "check";
  title: string;
  body: string;
  bullets?: string[];
  illustration: (props: { hover: boolean }) => ReactNode;
  span?: 1 | 2;
  large?: boolean;
  className?: string;
};

export function ModuleCard({
  tag,
  title,
  body,
  bullets,
  illustration,
  span = 1,
  large = false,
  className = "",
}: ModuleCardProps) {
  const [hover, setHover] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - r.left}px`);
    el.style.setProperty("--my", `${e.clientY - r.top}px`);
  };

  return (
    <div
      ref={ref}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      onPointerMove={onMove}
      className={`group relative flex h-full cursor-pointer flex-col overflow-hidden ${
        span === 2 ? "md:col-span-2" : ""
      } ${large ? "px-9 py-9" : "px-8 py-7"} ${className}`}
      style={
        {
          "--mx": "50%",
          "--my": "50%",
        } as React.CSSProperties
      }
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 transition-opacity duration-300"
        style={{
          background:
            "radial-gradient(260px circle at var(--mx) var(--my), rgba(254,81,0,0.20), transparent 65%)",
          opacity: hover ? 1 : 0,
        }}
      />

      <div className="relative z-[1]">
        <div
          className="flex items-center gap-2.5 transition-colors duration-300"
          style={{ color: hover ? "#FE5100" : "#fff" }}
        >
          <Icon name={tag} size={16} />
          <h3
            className={`m-0 font-medium tracking-[-0.015em] ${
              large ? "text-[20px]" : "text-[17px]"
            }`}
          >
            {title}
          </h3>
        </div>
        <p
          className="mt-4 font-normal tracking-[-0.005em]"
          style={{
            fontSize: large ? 15 : 14,
            lineHeight: 1.55,
            maxWidth: large ? 420 : 300,
            color: "rgba(255,255,255,0.72)",
          }}
        >
          {body}
        </p>
        {bullets && (
          <ul className="mt-7 flex flex-col gap-3">
            {bullets.map((b) => (
              <li
                key={b}
                className="flex items-start gap-3 text-[13.5px] leading-[1.45] tracking-[-0.003em] text-white/85"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  className="mt-[3px] flex-none"
                  aria-hidden="true"
                >
                  <path
                    d="M3 7.2l2.6 2.6L11 4.4"
                    stroke="rgba(255,255,255,0.45)"
                    strokeWidth="1.4"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span>{b}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="relative z-[1] mt-4 flex flex-1 items-end justify-center">
        {illustration({ hover })}
      </div>
    </div>
  );
}
