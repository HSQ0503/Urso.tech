// The ledger language.
//
// The app used to be floating cards on a grey ground — one rounded box per
// thing, each with its own border, stacked with gaps. It read like default iOS
// with an orange tint. This is the replacement vocabulary, and the whole
// redesign is these seven pieces applied consistently:
//
//   Mark          the Urso bear. Ghosted and bled off every black header,
//                 solid in a lockup, and the figure in every empty state.
//   ChromeHeader  the black header, in two shapes — Today's greeting and the
//                 back/title/action bar every other screen uses.
//   SectionRule   a mono label, a hairline that eats the remaining width, and
//                 the count pinned right. Replaces the free-floating heading.
//   LedgerBlock   ONE white surface per section, rows divided by hairlines,
//                 instead of one bordered card per row.
//   Row           a row inside that block. `first` suppresses the divider.
//   EmptyState    the mark at 11%, and a sentence. Never a bare "None".
//   Chip          the mono status pill.
//
// Everything here draws from src/theme.ts. The redesign introduced no new
// colours — every value in the mockup was already a token — so this file has
// no literals in it beyond opacity and geometry.

import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ImageStyle,
  type ViewStyle,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { color, font, HIT, mark, radius, space, type } from "@/theme";

// StyleSheet.create widens a heterogeneous sheet's entries to
// ViewStyle | TextStyle | ImageStyle, which an <Image> then refuses. The bleed
// is the one image style in this file, so it stays a plain annotated object.
const bleedStyle: ImageStyle = mark.bleed;
const railStyle: ViewStyle = { ...mark.rail, backgroundColor: color.brand };

// ── The bear ─────────────────────────────────────────────────────────────────

export function Mark({ size, opacity = 1 }: { size: number; opacity?: number }) {
  return (
    <Image
      source={mark.src}
      accessibilityIgnoresInvertColors
      style={{ width: size, height: size, opacity, resizeMode: "contain" }}
    />
  );
}

// The ghosted bleed + the orange rail. Both are absolutely positioned, so this
// renders INSIDE a chrome container that already has overflow hidden.
function ChromeFurniture() {
  return (
    <>
      <Image source={mark.src} accessibilityIgnoresInvertColors style={bleedStyle} />
      <View style={railStyle} pointerEvents="none" />
    </>
  );
}

// ── Chrome ───────────────────────────────────────────────────────────────────

// Today's header: the lockup and the date on one rule, the greeting under it.
export function ChromeGreeting({ date, greeting }: { date: string; greeting: string }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.chrome, { paddingTop: insets.top + space.md }]}>
      <ChromeFurniture />
      <View style={styles.chromeTop}>
        <View style={styles.lockup}>
          <Mark size={22} />
          <Text style={styles.wordmark}>
            Canes<Text style={styles.stop}>.</Text>
          </Text>
        </View>
        <Text style={styles.chromeDate}>{date}</Text>
      </View>
      <Text style={styles.greeting}>
        {greeting}
        <Text style={styles.stop}>.</Text>
      </Text>
    </View>
  );
}

// Every other screen: optional back, optional eyebrow, the title, and either a
// figure or a primary action on the right.
export function ChromeBar({
  title,
  eyebrow,
  sub,
  stat,
  statLabel = "Total",
  action,
  onAction,
  onBack,
}: {
  title: string;
  eyebrow?: string | null;
  sub?: string | null;
  stat?: string | null;
  statLabel?: string;
  action?: string | null;
  onAction?: () => void;
  onBack?: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.chrome, { paddingTop: insets.top + space.md }]}>
      <ChromeFurniture />
      <View style={styles.barRow}>
        <View style={styles.barLeft}>
          {onBack ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back"
              onPress={onBack}
              style={({ pressed }) => [styles.backBox, pressed && styles.chromePressed]}
            >
              <Feather name="chevron-left" size={17} color={color.chromeInk} />
            </Pressable>
          ) : null}
          <View style={styles.barTitles}>
            {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
            <Text style={styles.barTitle} numberOfLines={1}>
              {title}
              <Text style={styles.stop}>.</Text>
            </Text>
            {sub ? <Text style={styles.chromeSub}>{sub}</Text> : null}
          </View>
        </View>
        <View style={styles.barRight}>
          {stat ? (
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{stat}</Text>
              <Text style={styles.statLabel}>{statLabel}</Text>
            </View>
          ) : null}
          {action && onAction ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={action}
              onPress={onAction}
              style={({ pressed }) => [styles.chromeAction, pressed && styles.actionPressed]}
            >
              <Feather name="plus" size={15} color="#ffffff" />
              <Text style={styles.chromeActionText}>{action}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

// ── Section rule ─────────────────────────────────────────────────────────────

export function SectionRule({
  label,
  meta,
  tone = "muted",
}: {
  label: string;
  // A count, a total, or nothing. Pinned right, mono, never wrapped.
  meta?: string | number | null;
  tone?: "muted" | "danger" | "brand" | "good";
}) {
  const tint =
    tone === "danger" ? color.danger : tone === "brand" ? color.brand : tone === "good" ? color.good : color.faint;
  return (
    <View style={styles.ruleRow}>
      <Text style={[styles.ruleLabel, { color: tint }]}>{label}</Text>
      <View style={styles.ruleLine} />
      {meta !== null && meta !== undefined && meta !== "" ? (
        <Text style={styles.ruleMeta}>{String(meta)}</Text>
      ) : null}
    </View>
  );
}

// The variant that carries a filled count badge instead of bare digits — used
// where the number is the point ("Needs you now — 4").
export function SectionRuleBadge({ label, count }: { label: string; count: number }) {
  return (
    <View style={styles.ruleRow}>
      <Text style={[styles.ruleLabel, { color: color.faint }]}>{label}</Text>
      <View style={styles.ruleLine} />
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{count}</Text>
      </View>
    </View>
  );
}

// ── Ledger block ─────────────────────────────────────────────────────────────

// One surface per section. `rail` paints the 3px urgency edge — the redesign's
// single accent for "this is actually late", used once per thing rather than
// making the whole card louder.
export function LedgerBlock({
  children,
  rail,
  style,
}: {
  children: React.ReactNode;
  rail?: string;
  style?: ViewStyle;
}) {
  return (
    <View style={[styles.block, rail ? { borderLeftWidth: 3, borderLeftColor: rail } : null, style]}>
      {children}
    </View>
  );
}

export function Row({
  children,
  first,
  onPress,
  accessibilityLabel,
  rail,
}: {
  children: React.ReactNode;
  // The divider is a TOP border, so the first row must suppress it or the block
  // gains a hairline directly under its own border.
  first?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
  rail?: string;
}) {
  const body = (
    <View
      style={[
        styles.row,
        !first && styles.rowDivided,
        rail ? { borderLeftWidth: 3, borderLeftColor: rail } : null,
      ]}
    >
      {children}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => (pressed ? styles.rowPressed : null)}
    >
      {body}
    </Pressable>
  );
}

// The chevron every tappable row ends with.
export function Chevron() {
  return <Feather name="chevron-right" size={18} color={color.faint} />;
}

// ── Empty state ──────────────────────────────────────────────────────────────

export function EmptyState({
  text,
  size = 64,
  children,
}: {
  text: string;
  size?: number;
  children?: React.ReactNode;
}) {
  return (
    <View style={styles.empty}>
      <Mark size={size} opacity={0.11} />
      <Text style={styles.emptyText}>{text}</Text>
      {children}
    </View>
  );
}

// ── Chip ─────────────────────────────────────────────────────────────────────

export function Chip({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "neutral" | "brand" | "danger" | "good";
}) {
  const fill =
    tone === "brand"
      ? color.brandSoft
      : tone === "danger"
        ? color.dangerBg
        : tone === "good"
          ? color.goodBg
          : color.hover;
  const tint =
    tone === "brand"
      ? color.brandDeep
      : tone === "danger"
        ? color.danger
        : tone === "good"
          ? color.good
          : color.muted;
  return (
    <View style={[styles.chip, { backgroundColor: fill }]}>
      <Text style={[styles.chipText, { color: tint }]}>{label}</Text>
    </View>
  );
}

// ── Search bar ───────────────────────────────────────────────────────────────
//
// White strip under the chrome, hairline bottom — the same on every list, so
// the eye stops looking for it.
export function SearchStrip({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.searchStrip}>
      <Feather name="search" size={16} color={color.faint} />
      {children}
    </View>
  );
}

export const searchInputStyle = {
  flex: 1,
  height: 30,
  fontFamily: font.body,
  fontSize: 15,
  color: color.ink,
} as const;

const styles = StyleSheet.create({
  chrome: {
    backgroundColor: color.chrome,
    paddingHorizontal: 18,
    paddingBottom: 15,
    overflow: "hidden",
    position: "relative",
  },
  chromePressed: { backgroundColor: "rgba(255,255,255,0.06)" },
  chromeTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md },
  lockup: { flexDirection: "row", alignItems: "center", gap: 9 },
  wordmark: { ...type.wordmark, color: color.chromeInk },
  stop: { color: color.brand },
  chromeDate: { ...type.rule, color: color.chromeMuted },
  greeting: { ...type.display, fontSize: 26, letterSpacing: -0.9, color: color.chromeInk, marginTop: 11 },

  barRow: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: space.md },
  barLeft: { flexDirection: "row", alignItems: "flex-end", gap: 11, flex: 1, minWidth: 0 },
  backBox: {
    width: 34,
    height: 34,
    marginBottom: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  barTitles: { flex: 1, minWidth: 0 },
  eyebrow: { ...type.rule, color: color.chromeMuted, marginBottom: 5 },
  barTitle: { ...type.chromeTitle, color: color.chromeInk },
  chromeSub: { ...type.rule, color: color.chromeMuted, marginTop: 6 },
  barRight: { flexDirection: "row", alignItems: "center", gap: 9, paddingBottom: 3 },
  statBox: { alignItems: "flex-end" },
  statValue: { ...type.figureLg, color: color.chromeInk },
  statLabel: { ...type.ruleSm, color: color.chromeFaint, marginTop: 4 },
  chromeAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 40,
    paddingHorizontal: 14,
    backgroundColor: color.brandFill,
  },
  actionPressed: { opacity: 0.85 },
  chromeActionText: { fontFamily: font.bodySemi, fontSize: 14, color: "#ffffff" },

  ruleRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  ruleLabel: { ...type.rule },
  ruleLine: { flex: 1, height: 1, backgroundColor: color.line },
  ruleMeta: { ...type.rule, color: color.faint, letterSpacing: 1 },
  badge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 3,
    backgroundColor: color.chrome,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { fontFamily: font.mono, fontSize: 11, color: "#ffffff" },

  block: {
    backgroundColor: color.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  row: { padding: 13 },
  rowDivided: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line },
  rowPressed: { backgroundColor: color.hover },

  empty: {
    backgroundColor: color.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
    borderRadius: radius.lg,
    paddingVertical: 28,
    paddingHorizontal: 18,
    alignItems: "center",
    gap: 12,
  },
  emptyText: { ...type.body, color: color.muted, textAlign: "center" },

  chip: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 3 },
  chipText: { ...type.ruleSm, lineHeight: 12 },

  searchStrip: {
    backgroundColor: color.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.line,
    paddingHorizontal: 14,
    paddingVertical: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: HIT,
  },
});
