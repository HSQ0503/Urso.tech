// The Canes design system, ported from app/CanesPressure/canes.css.
//
// The target is the CREW PORTAL specifically, not the owner console: a light
// bone/grey ground with a true-black chrome header, which is what the web crew
// portal renders (it deliberately sits outside the .theme-scope dark mapping).
// Values are copied literally from the .canes base block so the app and the web
// portal are the same colours, not similar ones.
//
// Design rules carried over: flat surfaces, hairline borders, radii 6/5/4, one
// easing curve, orange as the single accent. No gradients, washes, or pills.

export const color = {
  bg: "#eceef1",
  surface: "#ffffff",
  ink: "#14171c",
  muted: "rgba(20, 23, 28, 0.62)",
  faint: "rgba(20, 23, 28, 0.42)",
  line: "rgba(15, 18, 22, 0.10)",
  lineStrong: "rgba(15, 18, 22, 0.17)",
  hover: "rgba(15, 18, 22, 0.045)",

  brand: "#fe5100",
  // Solid fills use the deepened step so white button text keeps contrast —
  // raw orange is for accents and text moments only.
  brandFill: "#e84900",
  brandDown: "#c23e00",
  brandDeep: "#c23e00",
  brandSoft: "rgba(254, 81, 0, 0.10)",

  good: "#11935a",
  goodBg: "rgba(17, 147, 90, 0.12)",
  // Sold jobs are always green, independent of the assigned crew colour.
  job: "#15803d",
  quote: "#6d28d9",
  danger: "#b42318",
  dangerBg: "rgba(180, 35, 24, 0.10)",

  chrome: "#070707",
  chromeRaise: "rgba(255, 255, 255, 0.06)",
  chromeLine: "rgba(255, 255, 255, 0.08)",
  chromeInk: "#f4f5f6",
  chromeMuted: "rgba(244, 245, 246, 0.60)",
  chromeFaint: "rgba(244, 245, 246, 0.38)",
} as const;

export const radius = { lg: 6, md: 5, sm: 4 } as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

// Font family names as registered with expo-font in app/_layout.tsx.
export const font = {
  display: "Fraunces_600SemiBold",
  displayItalic: "Fraunces_600SemiBold_Italic",
  body: "IBMPlexSans_400Regular",
  bodyMedium: "IBMPlexSans_500Medium",
  bodySemi: "IBMPlexSans_600SemiBold",
  mono: "IBMPlexMono_400Regular",
} as const;

export const type = {
  display: { fontFamily: font.display, fontSize: 26, letterSpacing: -0.7 },
  title: { fontFamily: font.bodySemi, fontSize: 17 },
  body: { fontFamily: font.body, fontSize: 15, lineHeight: 21 },
  small: { fontFamily: font.body, fontSize: 13, lineHeight: 18 },
  // Micro-labels are mono, uppercase, tracked out — the .cp-mono treatment.
  micro: {
    fontFamily: font.mono,
    fontSize: 11,
    letterSpacing: 0.4,
    textTransform: "uppercase" as const,
  },

  // ── Ledger scale (2026-08-01 redesign) ────────────────────────────────────
  // The restyle runs on two mono sizes and a serif that gets bigger than
  // `display` ever went. Kept as named steps rather than inline numbers so a
  // section rule on Today and one on the lead sheet cannot drift apart.

  // Section rules, field labels, chips. 10.5px tracked to .16em.
  rule: {
    fontFamily: font.mono,
    fontSize: 10.5,
    letterSpacing: 1.7,
    textTransform: "uppercase" as const,
  },
  // The smaller sibling: row meta, sub-labels, the money strip's captions.
  ruleSm: {
    fontFamily: font.mono,
    fontSize: 9.5,
    letterSpacing: 1.4,
    textTransform: "uppercase" as const,
  },
  // Figures. Mono so a column of money lines up on the decimal; NOT uppercase
  // and NOT tracked — tracking a number is how you get $1 7,3 60.
  //
  // fontVariant is deliberately absent: this object is `as const`, which would
  // make the array a readonly tuple, and React Native's TextStyle wants a
  // mutable one — enough to widen every entry of any StyleSheet that spreads
  // one of these. Call sites add `fontVariant: ["tabular-nums"]` inline, which
  // is what the screens already did before this scale existed.
  figure: { fontFamily: font.bodyMedium, fontSize: 16 },
  figureSm: { fontFamily: font.mono, fontSize: 13 },
  figureLg: { fontFamily: font.mono, fontSize: 21 },
  // Fraunces, three steps. `display` (26) stays what it was; these are the
  // chrome title and the greeting either side of it.
  chromeTitle: { fontFamily: font.display, fontSize: 27, letterSpacing: -0.9 },
  wordmark: { fontFamily: font.display, fontSize: 19, letterSpacing: -0.5 },
} as const;

// The ghosted bear that bleeds off every black header, and the solid one in a
// lockup. One import point so a screen cannot invent its own opacity.
export const mark = {
  src: require("../assets/urso-mark.png") as number,
  // Bleeding off the top-right corner of a chrome header.
  bleed: {
    position: "absolute" as const,
    right: -32,
    top: -28,
    width: 166,
    height: 166,
    opacity: 0.09,
    resizeMode: "contain" as const,
  },
  // The 2px orange rule pinned to the chrome's bottom-left corner — the one
  // piece of brand that appears on every screen in the app.
  rail: {
    position: "absolute" as const,
    left: 0,
    bottom: 0,
    width: 44,
    height: 2,
  },
} as const;

// Minimum tap target. Field crews use this in gloves, in sunlight.
export const HIT = 48;
