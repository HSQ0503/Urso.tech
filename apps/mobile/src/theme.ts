// The Canes mobile design system. app/CanesPressure/canes.css is the source of
// truth: native uses the same colors, Fraunces display face, Plex body/mono,
// inset grouped cards and orange-only accent as the responsive website.

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
  // The redesign's tinted-outline button: a soft fill inside a brand-tinted
  // edge. Three alphas because the mock uses a lighter edge on informational
  // strips than on things you press.
  brandWash: "rgba(254, 81, 0, 0.06)",
  brandEdgeSoft: "rgba(254, 81, 0, 0.30)",
  brandEdge: "rgba(254, 81, 0, 0.40)",
  brandEdgeStrong: "rgba(254, 81, 0, 0.45)",
  brandPressed: "rgba(254, 81, 0, 0.20)",

  good: "#11935a",
  goodBg: "rgba(17, 147, 90, 0.12)",
  // Sold jobs are always green, independent of the assigned crew colour.
  job: "#15803d",
  // The pale card behind a rail. Markate fills the whole event card with a wash
  // of its rail colour, which is what makes a day scannable by kind before you
  // read a word of it.
  jobBg: "rgba(21, 128, 61, 0.08)",
  quote: "#6d28d9",
  quoteBg: "rgba(109, 40, 217, 0.07)",
  danger: "#b42318",
  dangerBg: "rgba(180, 35, 24, 0.10)",
  dangerWash: "rgba(180, 35, 24, 0.06)",

  chrome: "#070707",
  chromeRaise: "rgba(255, 255, 255, 0.06)",
  chromeLine: "rgba(255, 255, 255, 0.08)",
  chromeEdge: "rgba(255, 255, 255, 0.14)",
  chromeInk: "#f4f5f6",
  chromeMuted: "rgba(244, 245, 246, 0.60)",
  chromeFaint: "rgba(244, 245, 246, 0.38)",
  // Scrim behind the bottom sheet and the biometric gate.
  scrim: "rgba(7, 7, 7, 0.50)",
  scrimHeavy: "rgba(7, 7, 7, 0.86)",
} as const;

export const radius = { sheet: 22, lg: 12, md: 12, sm: 9, chip: 6 } as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

// Font family names as registered with expo-font in app/_layout.tsx.
export const font = {
  display: "Fraunces_600SemiBold",
  displayMedium: "Fraunces_500Medium",
  body: "IBMPlexSans_400Regular",
  bodyMedium: "IBMPlexSans_500Medium",
  bodySemi: "IBMPlexSans_600SemiBold",
  mono: "IBMPlexMono_400Regular",
  monoMedium: "IBMPlexMono_500Medium",
} as const;

// The mock specifies tracking in em; React Native's letterSpacing is in points.
// Every value below is already converted (10.5px at .16em = 1.68pt).
export const type = {
  // ── Display ───────────────────────────────────────────────────────────────
  // The greeting on Today, and the auth lockup.
  display: { fontFamily: font.display, fontSize: 30, lineHeight: 34, letterSpacing: -0.9 },
  lockup: { fontFamily: font.display, fontSize: 31, letterSpacing: -0.9 },
  // The chrome title every non-Today screen carries.
  chromeTitle: { fontFamily: font.display, fontSize: 28, lineHeight: 31, letterSpacing: -0.8 },
  // "Canes." in the black bar.
  wordmark: { fontFamily: font.display, fontSize: 20, letterSpacing: -0.6 },
  // Card and sheet headings.
  heading: { fontFamily: font.display, fontSize: 21, lineHeight: 25, letterSpacing: -0.5 },

  // ── Body ──────────────────────────────────────────────────────────────────
  // A row's primary line — a customer, a lead, a document.
  title: { fontFamily: font.bodySemi, fontSize: 16, lineHeight: 19 },
  titleLg: { fontFamily: font.bodySemi, fontSize: 17, lineHeight: 20 },
  body: { fontFamily: font.body, fontSize: 15, lineHeight: 21 },
  small: { fontFamily: font.body, fontSize: 13, lineHeight: 18 },
  smaller: { fontFamily: font.body, fontSize: 12.5, lineHeight: 17 },

  // ── Mono rules ────────────────────────────────────────────────────────────
  // Section rules, field labels, eyebrows. 10.5px tracked to .16em.
  rule: {
    fontFamily: font.mono,
    fontSize: 10.5,
    letterSpacing: 1.7,
    textTransform: "uppercase" as const,
  },
  // The smaller sibling: row meta, chips, the money strip's captions.
  ruleSm: {
    fontFamily: font.mono,
    fontSize: 9.5,
    letterSpacing: 1.4,
    textTransform: "uppercase" as const,
  },
  // Kept for the handful of places that were already on it.
  micro: {
    fontFamily: font.mono,
    fontSize: 10.5,
    letterSpacing: 1.7,
    textTransform: "uppercase" as const,
  },

  // ── Figures ───────────────────────────────────────────────────────────────
  // Mono so a column of money lines up on the decimal; NOT uppercase and NOT
  // tracked — tracking a number is how you get $1 7,3 60.
  //
  // fontVariant is deliberately absent: this object is `as const`, which would
  // make the array a readonly tuple, and React Native's TextStyle wants a
  // mutable one — enough to widen every entry of any StyleSheet that spreads
  // one of these. Call sites add `fontVariant: ["tabular-nums"]` inline.
  figure: { fontFamily: font.monoMedium, fontSize: 16, letterSpacing: -0.3 },
  figureSm: { fontFamily: font.monoMedium, fontSize: 13.5 },
  figureMd: { fontFamily: font.monoMedium, fontSize: 15 },
  figureLg: { fontFamily: font.monoMedium, fontSize: 21 },
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
  // The taller bleed the auth screens use — their chrome is deeper.
  bleedTall: {
    position: "absolute" as const,
    right: -40,
    top: -16,
    width: 196,
    height: 196,
    opacity: 0.11,
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
  railWide: {
    position: "absolute" as const,
    left: 0,
    bottom: 0,
    width: 52,
    height: 2,
  },
} as const;

// CSS blur radius is roughly twice React Native's shadowRadius, so each `blur`
// below is already halved. Android takes elevation only and ignores the tint.
export const shadow = {
  // The auth card that overlaps the chrome.
  card: {
    shadowColor: "#070707",
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.14,
    shadowRadius: 20,
    elevation: 12,
  },
  // The toast that rises above the tab bar.
  toast: {
    shadowColor: "#070707",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 14,
  },
  // The glow on the orange rail. iOS only in practice — Android's elevation
  // cannot tint, so it renders as the flat 2px bar, which is fine.
  railGlow: {
    shadowColor: color.brand,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 7,
    elevation: 0,
  },
} as const;

// The one easing curve, and the two durations the mock specifies.
export const motion = {
  // cubic-bezier(.16, 1, .3, 1)
  easing: { x1: 0.16, y1: 1, x2: 0.3, y2: 1 },
  toast: 240,
  sheet: 300,
  pulse: 1300,
} as const;

// Minimum tap target. Field crews use this in gloves, in sunlight.
export const HIT = 48;
