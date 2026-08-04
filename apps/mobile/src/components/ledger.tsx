// The ledger language.
//
// The app used to be floating cards on a grey ground — one rounded box per
// thing, each with its own border, stacked with gaps. It read like default iOS
// with an orange tint. This is the replacement vocabulary, and the whole
// redesign is these pieces applied consistently:
//
//   Mark          the Urso bear. Ghosted and bled off every black header,
//                 solid in a lockup, and the figure in every empty state.
//   ChromeHeader  the black header, in two shapes — Today's greeting and the
//                 back/title/action bar every other screen uses.
//   MoneyStrip    the three-cell figure strip under Today's chrome. It was
//                 four scrolls down; it is now the first thing you see.
//   SectionRule   a mono label, a hairline that eats the remaining width, and
//                 the count pinned right. Replaces the free-floating heading.
//   LedgerBlock   ONE white surface per section, rows divided by hairlines,
//                 instead of one bordered card per row.
//   Row           a row inside that block. `first` suppresses the divider.
//   FieldBlock    the label-over-value rows every detail screen is built from.
//   ActionRow     the side-by-side button pair at the top of a detail screen.
//   FilterChips   the tinted-outline filter strip on a list.
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
import { color, font, HIT, mark, radius, shadow, space, type } from "@/theme";

// StyleSheet.create widens a heterogeneous sheet's entries to
// ViewStyle | TextStyle | ImageStyle, which an <Image> then refuses. The bleeds
// are the only image styles in this file, so they stay plain annotated objects.
const bleedStyle: ImageStyle = mark.bleed;
const bleedTallStyle: ImageStyle = mark.bleedTall;
const railStyle: ViewStyle = { ...mark.rail, backgroundColor: color.brand, ...shadow.railGlow };
const railWideStyle: ViewStyle = {
  ...mark.railWide,
  backgroundColor: color.brand,
  ...shadow.railGlow,
};

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
export function ChromeFurniture({ tall }: { tall?: boolean }) {
  return (
    <>
      <Image
        source={mark.src}
        accessibilityIgnoresInvertColors
        style={tall ? bleedTallStyle : bleedStyle}
      />
      <View style={tall ? railWideStyle : railStyle} pointerEvents="none" />
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
              <Feather name="plus" size={15} color={color.surface} />
              <Text style={styles.chromeActionText}>{action}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

// The deep chrome the auth screens use — a lockup, a mono sub-line, and enough
// bottom padding that the card below can overlap it.
export function ChromeLockup({ sub }: { sub: string }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.authChrome, { paddingTop: insets.top + space.xl }]}>
      <ChromeFurniture tall />
      <View style={styles.lockupRow}>
        <Mark size={30} />
        <Text style={styles.lockupText}>
          Urso<Text style={styles.stop}>.</Text>
        </Text>
      </View>
      <Text style={styles.authSub} numberOfLines={1}>
        {sub}
      </Text>
    </View>
  );
}

// ── Money strip ──────────────────────────────────────────────────────────────

export type MoneyCell = { label: string; value: string; dim?: boolean };

// Three figures under Today's chrome. White ground, hairline between cells,
// hairline underneath — it reads as part of the chrome, not as a card.
export function MoneyStrip({ label, cells }: { label: string; cells: MoneyCell[] }) {
  return (
    <View>
      <View style={styles.moneyHead}>
        <Text style={styles.moneyHeadLabel}>{label}</Text>
        <View style={styles.ruleLine} />
      </View>
      <View style={styles.moneyRow}>
        {cells.map((cell, index) => (
          <View key={cell.label} style={[styles.moneyCell, index > 0 && styles.moneyCellDivided]}>
            <Text style={styles.moneyLabel}>{cell.label}</Text>
            <Text style={[styles.moneyValue, cell.dim && styles.moneyValueDim]} numberOfLines={1}>
              {cell.value}
            </Text>
          </View>
        ))}
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
  tone?: "muted" | "danger" | "brand" | "good" | "ink";
}) {
  const tint =
    tone === "danger"
      ? color.danger
      : tone === "brand"
        ? color.brand
        : tone === "good"
          ? color.good
          : tone === "ink"
            ? color.ink
            : color.faint;
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

// The dotted sub-heading inside a section — "Past due visits — 2" over its
// block. The dot carries the tone; the label repeats it.
export function GroupLabel({ label, tone }: { label: string; tone: string }) {
  return (
    <View style={styles.groupRow}>
      <View style={[styles.groupDot, { backgroundColor: tone }]} />
      <Text style={[styles.groupLabel, { color: tone }]}>{label}</Text>
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
  style,
}: {
  children: React.ReactNode;
  // The divider is a TOP border, so the first row must suppress it or the block
  // gains a hairline directly under its own border.
  first?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
  rail?: string;
  style?: ViewStyle;
}) {
  const body = (
    <View
      style={[
        styles.row,
        !first && styles.rowDivided,
        rail ? { borderLeftWidth: 3, borderLeftColor: rail } : null,
        style,
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

// A FlatList cannot render its rows inside one <LedgerBlock> without giving up
// virtualization, and the long lists (leads, customers) need it. So the rows
// draw the block between them: side hairlines on every row, the top and bottom
// edges and the corner radii on the two that are actually at the ends.
export function listRowStyle(first: boolean, last: boolean): ViewStyle[] {
  return [
    styles.listRow,
    first ? styles.listRowFirst : styles.rowDivided,
    last ? styles.listRowLast : null,
  ].filter(Boolean) as ViewStyle[];
}

// ── Fields ───────────────────────────────────────────────────────────────────

export type Field = { label: string; value: string };

// A labelled block of read-only fields — the shape every detail screen repeats.
export function FieldBlock({ fields }: { fields: Field[] }) {
  return (
    <LedgerBlock>
      {fields.map((field, index) => (
        <View key={field.label} style={[styles.field, index > 0 && styles.rowDivided]}>
          <Text style={styles.fieldLabel}>{field.label}</Text>
          <Text style={styles.fieldValue}>{field.value}</Text>
        </View>
      ))}
    </LedgerBlock>
  );
}

// A section rule with a field block under it. Detail screens are almost
// entirely this, so it exists to stop each one re-spelling the pair.
export function FieldSection({ label, fields }: { label: string; fields: Field[] }) {
  return (
    <View>
      <SectionRule label={label} />
      <FieldBlock fields={fields} />
    </View>
  );
}

// ── Actions ──────────────────────────────────────────────────────────────────

export type Action = { label: string; onPress: () => void; primary?: boolean; icon?: IconName };

type IconName = React.ComponentProps<typeof Feather>["name"];

// The button pair at the top of a detail screen. Equal widths; at most one is
// primary, because two loud buttons read as no primary at all.
export function ActionRow({ actions }: { actions: Action[] }) {
  return (
    <View style={styles.actionRow}>
      {actions.map((action) => (
        <ActionButton key={action.label} {...action} />
      ))}
    </View>
  );
}

export function ActionButton({
  label,
  onPress,
  primary,
  tone = "neutral",
  icon,
}: Action & { tone?: "neutral" | "brand" }) {
  const brand = tone === "brand" && !primary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        primary ? styles.actionPrimary : brand ? styles.actionBrand : styles.actionNeutral,
        pressed && (primary ? styles.actionPressed : styles.actionPressedSoft),
      ]}
    >
      {icon ? (
        <Feather
          name={icon}
          size={15}
          color={primary ? color.surface : brand ? color.brandDeep : color.ink}
        />
      ) : null}
      <Text
        style={[
          styles.actionText,
          primary ? styles.actionTextPrimary : brand ? styles.actionTextBrand : null,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// The full-width solid button that closes a section — "Build an estimate".
export function PrimaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.primary, pressed && styles.actionPressed]}
    >
      <Text style={styles.primaryText}>{label}</Text>
    </Pressable>
  );
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

// The short variant that sits inline rather than filling a section — the bear
// at the left, one line of good news at the right.
export function EmptyInline({ text, tone = "muted" }: { text: string; tone?: "muted" | "good" }) {
  return (
    <View style={styles.emptyInline}>
      <Mark size={44} opacity={0.14} />
      <Text style={[styles.emptyText, tone === "good" && { color: color.good }]}>{text}</Text>
    </View>
  );
}

// ── Chip ─────────────────────────────────────────────────────────────────────

export type ChipTone = "neutral" | "brand" | "danger" | "good";

export function chipFill(tone: ChipTone): string {
  return tone === "brand"
    ? color.brandSoft
    : tone === "danger"
      ? color.dangerBg
      : tone === "good"
        ? color.goodBg
        : color.hover;
}

export function chipTint(tone: ChipTone): string {
  return tone === "brand"
    ? color.brandDeep
    : tone === "danger"
      ? color.danger
      : tone === "good"
        ? color.good
        : color.muted;
}

export function Chip({ label, tone = "neutral" }: { label: string; tone?: ChipTone }) {
  return (
    <View style={[styles.chip, { backgroundColor: chipFill(tone) }]}>
      <Text style={[styles.chipText, { color: chipTint(tone) }]}>{label}</Text>
    </View>
  );
}

// ── Filter chips ─────────────────────────────────────────────────────────────

export type Filter<K extends string> = { key: K; label: string; count?: number };

// The tinted-outline filter strip a list carries under its search bar.
export function FilterChips<K extends string>({
  filters,
  current,
  onPick,
}: {
  filters: Filter<K>[];
  current: K;
  onPick: (key: K) => void;
}) {
  return (
    <View style={styles.filterStrip}>
      {filters.map((filter) => {
        const on = filter.key === current;
        return (
          <Pressable
            key={filter.key}
            accessibilityRole="button"
            accessibilityLabel={
              filter.count === undefined ? filter.label : `${filter.label}, ${filter.count}`
            }
            accessibilityState={{ selected: on }}
            onPress={() => onPick(filter.key)}
            style={({ pressed }) => [
              styles.filterChip,
              on && styles.filterChipOn,
              pressed && styles.rowPressed,
            ]}
          >
            <Text style={[styles.filterLabel, on && styles.filterTextOn]}>{filter.label}</Text>
            {filter.count === undefined ? null : (
              <Text style={[styles.filterCount, on && styles.filterTextOn]}>{filter.count}</Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

// ── Avatar ───────────────────────────────────────────────────────────────────

export function initialsOf(name: string): string {
  const parts = String(name).replace(/[()]/g, "").trim().split(/\s+/);
  // A row whose "name" is a bare phone number has no initials worth showing.
  if (!parts[0] || /^\d/.test(parts[0])) return "#";
  return ((parts[0][0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
}

export function Avatar({ name, hot }: { name: string; hot?: boolean }) {
  return (
    <View style={[styles.avatar, hot && styles.avatarHot]}>
      <Text style={[styles.avatarText, hot && styles.avatarTextHot]}>{initialsOf(name)}</Text>
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

// letterSpacing is set EXPLICITLY, and no lineHeight is set at all. iOS builds
// the placeholder from the field's default text attributes, and with a custom
// font and no kern attribute of its own it renders the placeholder — and only
// the placeholder — tracked far too wide. Pinning it to 0 forces the attribute.
export const searchInputStyle = {
  flex: 1,
  minHeight: 30,
  fontFamily: font.body,
  fontSize: 15,
  letterSpacing: 0,
  color: color.ink,
} as const;

// The screen padding every ledger body uses.
export const bodyStyle = {
  paddingHorizontal: 14,
  paddingTop: 18,
  paddingBottom: 26,
  gap: 22,
} as const;

const styles = StyleSheet.create({
  chrome: {
    backgroundColor: color.chrome,
    paddingHorizontal: 18,
    paddingBottom: 15,
    overflow: "hidden",
    position: "relative",
  },
  chromePressed: { backgroundColor: color.chromeRaise },
  chromeTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.md,
  },
  lockup: { flexDirection: "row", alignItems: "center", gap: 9 },
  wordmark: { ...type.wordmark, color: color.chromeInk },
  stop: { color: color.brand },
  chromeDate: { ...type.rule, color: color.chromeMuted },
  greeting: { ...type.display, color: color.chromeInk, marginTop: 11 },

  authChrome: {
    backgroundColor: color.chrome,
    paddingHorizontal: 22,
    paddingBottom: 96,
    overflow: "hidden",
    position: "relative",
  },
  lockupRow: { flexDirection: "row", alignItems: "center", gap: 11 },
  lockupText: { ...type.lockup, color: color.chromeInk },
  authSub: { ...type.rule, letterSpacing: 1.9, color: color.chromeMuted, marginTop: 10 },

  barRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: space.md,
  },
  barLeft: { flexDirection: "row", alignItems: "flex-end", gap: 11, flex: 1, minWidth: 0 },
  backBox: {
    width: 34,
    height: 34,
    marginBottom: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.chromeEdge,
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
  statLabel: { ...type.ruleSm, letterSpacing: 1.5, color: color.chromeFaint, marginTop: 4 },
  chromeAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 40,
    paddingHorizontal: 14,
    backgroundColor: color.brandFill,
  },
  actionPressed: { opacity: 0.85 },
  actionPressedSoft: { backgroundColor: color.hover },
  chromeActionText: { fontFamily: font.bodySemi, fontSize: 14, color: color.surface },

  moneyHead: {
    backgroundColor: color.surface,
    paddingHorizontal: 14,
    paddingTop: 9,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  moneyHeadLabel: { ...type.ruleSm, letterSpacing: 1.5, color: color.faint },
  moneyRow: {
    flexDirection: "row",
    backgroundColor: color.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.line,
  },
  moneyCell: { flex: 1, paddingTop: 4, paddingHorizontal: 12, paddingBottom: 14 },
  moneyCellDivided: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: color.line },
  moneyLabel: { ...type.ruleSm, lineHeight: 12, letterSpacing: 1.2, color: color.faint },
  moneyValue: { ...type.figure, color: color.ink, marginTop: 6 },
  moneyValueDim: { color: color.faint },

  ruleRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  ruleLabel: { ...type.rule },
  ruleLine: { flex: 1, height: 1, backgroundColor: color.line },
  ruleMeta: { ...type.rule, color: color.faint, letterSpacing: 1 },
  badge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: radius.chip,
    backgroundColor: color.chrome,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { fontFamily: font.monoMedium, fontSize: 11, color: color.surface },

  groupRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 7 },
  groupDot: { width: 5, height: 5, borderRadius: 2.5 },
  groupLabel: { ...type.rule, letterSpacing: 1.4 },

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

  listRow: {
    padding: 13,
    backgroundColor: color.surface,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
  },
  listRowFirst: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  listRowLast: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
  },

  field: { paddingVertical: 12, paddingHorizontal: 13 },
  fieldLabel: { ...type.ruleSm, color: color.faint },
  fieldValue: { ...type.body, lineHeight: 21, color: color.ink, marginTop: 6 },

  actionRow: { flexDirection: "row", gap: space.sm },
  action: {
    flex: 1,
    minHeight: HIT,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.md,
  },
  actionNeutral: { backgroundColor: color.surface, borderColor: color.lineStrong },
  actionBrand: { backgroundColor: color.brandSoft, borderColor: color.brandEdgeStrong },
  actionPrimary: { backgroundColor: color.brandFill, borderColor: color.brandFill },
  actionText: { fontFamily: font.bodyMedium, fontSize: 14, color: color.ink },
  actionTextPrimary: { color: color.surface },
  actionTextBrand: { color: color.brandDeep },

  primary: {
    minHeight: HIT,
    borderRadius: radius.md,
    backgroundColor: color.brandFill,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: { fontFamily: font.bodySemi, fontSize: 15, color: color.surface },

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
  emptyInline: {
    backgroundColor: color.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
    borderRadius: radius.lg,
    paddingVertical: 22,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
  },
  emptyText: { fontFamily: font.body, fontSize: 14, lineHeight: 20, color: color.muted },

  chip: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: radius.chip },
  chipText: { ...type.ruleSm, lineHeight: 12 },

  filterStrip: {
    backgroundColor: color.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.line,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
    backgroundColor: color.surface,
  },
  filterChipOn: { borderColor: color.brandEdgeStrong, backgroundColor: color.brandSoft },
  filterLabel: { ...type.rule, letterSpacing: 1.4, color: color.muted },
  filterCount: { fontFamily: font.monoMedium, fontSize: 11, color: color.muted },
  filterTextOn: { color: color.brandDeep },

  avatar: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    backgroundColor: color.hover,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarHot: { backgroundColor: color.brandSoft },
  avatarText: { fontFamily: font.monoMedium, fontSize: 12, color: color.muted },
  avatarTextHot: { color: color.brandDeep },

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
