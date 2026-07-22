"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";

// Street-address input with search-as-you-type suggestions (Sebastian's
// Markate-parity ask). Suggestions come from Photon (photon.komoot.io), the
// OpenStreetMap typeahead geocoder — free, keyless, CORS-open. Results are
// biased to Palm Beach County and boxed to greater Florida; the field always
// accepts free text, so a network miss or an unmapped address costs nothing.
// Swap the fetch for Google Places if rooftop-perfect coverage is ever needed.

const BIAS = { lat: "26.71", lon: "-80.09" }; // West Palm Beach
const FL_BBOX = "-87.65,24.4,-79.8,31.1";
const STATE_ABBR: Record<string, string> = { Florida: "FL", Georgia: "GA", Alabama: "AL" };

type PhotonProps = {
  housenumber?: string;
  street?: string;
  name?: string;
  city?: string;
  town?: string;
  village?: string;
  district?: string;
  state?: string;
  postcode?: string;
  countrycode?: string;
};

// "390 Evergreen Ave, West Palm Beach, FL 33461". A street-only hit inherits
// the house number the owner already typed ("390 evergreen" → "390 Evergreen
// Avenue…") so picking it never loses the number.
function labelFor(p: PhotonProps, query: string): string | null {
  if (p.countrycode && p.countrycode !== "US") return null;
  const street = p.street ?? p.name;
  let house = p.housenumber;
  if (!house && street) house = /^\s*(\d+[a-zA-Z]?)\s+\S/.exec(query)?.[1];
  const line1 = house && street ? `${house} ${street}` : street;
  if (!line1) return null;
  const city = p.city ?? p.town ?? p.village ?? p.district;
  const state = p.state ? (STATE_ABBR[p.state] ?? p.state) : null;
  const tail = state && p.postcode ? `${state} ${p.postcode}` : (state ?? p.postcode);
  return [line1, city, tail].filter(Boolean).join(", ");
}

export function AddressInput({
  id,
  name,
  value,
  defaultValue,
  onChange,
  placeholder = "Street, city",
  required,
  disabled,
  className = "cp-input",
  "aria-label": ariaLabel,
}: {
  id?: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  const [inner, setInner] = useState(defaultValue ?? "");
  const text = value !== undefined ? value : inner;
  const [sugs, setSugs] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  // The last picked suggestion — typing it back shouldn't reopen the list.
  const picked = useRef<string | null>(null);

  function setText(v: string) {
    if (value === undefined) setInner(v);
    onChange?.(v);
  }

  function pick(label: string) {
    picked.current = label;
    setText(label);
    setOpen(false);
    setActive(-1);
  }

  useEffect(() => {
    const q = text.trim();
    if (q.length < 3 || q === picked.current) {
      setSugs([]);
      setOpen(false);
      return;
    }
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      // Only search while the owner is actually typing here — never on mount
      // over a pre-filled address.
      if (document.activeElement !== inputRef.current) return;
      try {
        const url = new URL("https://photon.komoot.io/api/");
        url.searchParams.set("q", q);
        url.searchParams.set("limit", "6");
        url.searchParams.set("lat", BIAS.lat);
        url.searchParams.set("lon", BIAS.lon);
        url.searchParams.set("bbox", FL_BBOX);
        url.searchParams.append("layer", "house");
        url.searchParams.append("layer", "street");
        const res = await fetch(url, { signal: ctl.signal });
        if (!res.ok) return;
        const json = (await res.json()) as { features?: { properties: PhotonProps }[] };
        const labels: string[] = [];
        for (const f of json.features ?? []) {
          const label = labelFor(f.properties, q);
          if (label && !labels.includes(label)) labels.push(label);
        }
        const top = labels.slice(0, 5);
        setSugs(top);
        setOpen(top.length > 0);
        setActive(-1);
      } catch {
        // Offline or aborted — the field is still a plain text input.
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [text]);

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % sugs.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a <= 0 ? sugs.length - 1 : a - 1));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault(); // pick, don't submit the wrapping form
      pick(sugs[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        id={id}
        name={name}
        className={className}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => setOpen(false)}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-label={ariaLabel}
        aria-activedescendant={active >= 0 && id ? `${id}-opt-${active}` : undefined}
      />
      {open && (
        <ul
          role="listbox"
          className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-md border border-[var(--cp-line)] bg-[var(--cp-surface)] py-1 shadow-[0_10px_28px_var(--cp-shadow)]"
        >
          {sugs.map((s, i) => (
            <li
              key={s}
              id={id ? `${id}-opt-${i}` : undefined}
              role="option"
              aria-selected={i === active}
              className={`flex cursor-pointer items-center gap-2 px-3 py-2 text-[13.5px] leading-snug ${
                i === active ? "bg-[var(--cp-hover)]" : ""
              }`}
              // pointerdown beats the input's blur, so the pick lands on
              // desktop and iOS alike.
              onPointerDown={(e) => {
                e.preventDefault();
                pick(s);
              }}
              onMouseEnter={() => setActive(i)}
            >
              <MapPin size={13} className="shrink-0 text-[var(--cp-faint)]" />
              <span className="truncate">{s}</span>
            </li>
          ))}
          <li aria-hidden className="px-3 pb-0.5 pt-1 text-[10.5px] text-[var(--cp-faint)]">
            Addresses © OpenStreetMap
          </li>
        </ul>
      )}
    </div>
  );
}
