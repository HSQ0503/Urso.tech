"use client";

import { useEffect, useRef, useState } from "react";
import { triggerWipe } from "@/components/wipe-transition";

/** Example questions the idle teaser types out, one after another. */
const PROMPTS = [
  "Where am I leaking revenue this month?",
  "Which location is underperforming?",
  "How many calls did we miss last week?",
  "Which customers stopped coming back?",
  "What should I fix first?",
];

/**
 * The hero's single CTA: a glassy ask field. When idle it types example
 * questions out and deletes them on a loop; focusing it hands control to the
 * visitor. Submitting routes into the conversation flow.
 */
export function HeroAsk() {
  const [value, setValue] = useState("");
  const [typed, setTyped] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let promptIndex = 0;
    let charIndex = 0;
    let deleting = false;
    let timer: ReturnType<typeof setTimeout>;

    const tick = () => {
      const current = PROMPTS[promptIndex];
      if (reduced) {
        setTyped(current);
        return;
      }
      if (!deleting) {
        charIndex += 1;
        setTyped(current.slice(0, charIndex));
        if (charIndex === current.length) {
          deleting = true;
          timer = setTimeout(tick, 1800);
          return;
        }
        timer = setTimeout(tick, 42);
      } else {
        charIndex -= 1;
        setTyped(current.slice(0, charIndex));
        if (charIndex === 0) {
          deleting = false;
          promptIndex = (promptIndex + 1) % PROMPTS.length;
          timer = setTimeout(tick, 360);
          return;
        }
        timer = setTimeout(tick, 24);
      }
    };
    timer = setTimeout(tick, reduced ? 0 : 600);
    return () => clearTimeout(timer);
  }, []);

  const showTeaser = !focused && value.length === 0;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        triggerWipe("/contact");
      }}
      onClick={() => inputRef.current?.focus()}
      className="relative mx-auto flex w-full max-w-[680px] items-center gap-2 rounded-full border border-edge bg-white/[0.04] py-2.5 pl-6 pr-2.5 backdrop-blur-xl transition-colors duration-200 focus-within:border-edge-strong"
    >
      {showTeaser && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-6 right-20 flex items-center truncate text-left text-[15px] text-ink-dim sm:text-[16px]"
        >
          {typed}
          <span
            className="ml-0.5 inline-block w-px animate-blink bg-ink-dim"
            style={{ height: "1.15em" }}
          />
        </span>
      )}
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        aria-label="Ask Urso a question about your business"
        className="min-w-0 flex-1 bg-transparent text-[15px] text-ink caret-orange focus:outline-none sm:text-[16px]"
      />
      <button
        type="submit"
        aria-label="Ask Urso"
        className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-orange text-[#070707] outline-none transition-colors duration-200 hover:bg-[#FF6A1F] focus-visible:ring-2 focus-visible:ring-orange/70 focus-visible:ring-offset-2 focus-visible:ring-offset-bg active:bg-[#E04800]"
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <path
            d="M9 14.5v-11M4.5 8 9 3.5 13.5 8"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </form>
  );
}
