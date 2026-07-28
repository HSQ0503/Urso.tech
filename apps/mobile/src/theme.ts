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
} as const;

// Minimum tap target. Field crews use this in gloves, in sunlight.
export const HIT = 48;
