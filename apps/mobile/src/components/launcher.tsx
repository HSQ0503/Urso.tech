// The launcher language.
//
// Sebastian is coming off Markate, and its home screen is a LAUNCHER: an
// announcement strip, a greeting, a money line, and a two-column grid of icon
// tiles with a red count in the corner of anything that needs him. It is not a
// dashboard — the dashboard is one of the tiles.
//
// This file is that vocabulary, drawn in Urso's tokens rather than Markate's
// green. The layout, the tile geometry, the badge placement and the tap targets
// are theirs so the muscle memory carries over; the colour, the type and the
// bear are ours so the app is still the app.
//
//   LauncherBar    the white top bar — menu on the left, badged icons right.
//   Announcement   the bordered strip under it. Markate sells product news
//                  here; we spend it on the one thing that actually needs him.
//   TileGrid/Tile  the 2-column grid. Two per row, always, with a soft brand
//                  blob behind each icon and the count pinned top-right.
//   SupportRow     the centred footer link.
//
// Contrast note: text here uses `muted`, never `faint`. faint is ink at 42%,
// which lands near 2.7:1 on white — fine for a hairline or a chevron, not for a
// word someone reads in a truck in sunlight.

import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { color, font, HIT, radius, space, type } from "@/theme";

type IconName = React.ComponentProps<typeof Feather>["name"];

// ── Top bar ──────────────────────────────────────────────────────────────────

export type BarAction = {
  key: string;
  icon: IconName;
  label: string;
  count?: number;
  onPress: () => void;
};

// Markate's bar is white, not chrome-black: the launcher reads as a light
// surface all the way up. The badge is a filled circle riding the icon's
// top-right corner, which is why the icon box carries the padding rather than
// the row — a badge on a flush icon clips against the screen edge.
export function LauncherBar({
  onMenu,
  actions,
}: {
  onMenu: () => void;
  actions: BarAction[];
}): React.ReactElement {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingTop: insets.top + space.sm }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Menu"
        onPress={onMenu}
        style={({ pressed }) => [styles.barButton, pressed && styles.pressedSoft]}
      >
        <Feather name="menu" size={24} color={color.ink} />
      </Pressable>

      <View style={styles.barRight}>
        {actions.map((action) => (
          <Pressable
            key={action.key}
            accessibilityRole="button"
            accessibilityLabel={
              action.count ? `${action.label}, ${action.count}` : action.label
            }
            onPress={action.onPress}
            style={({ pressed }) => [styles.barButton, pressed && styles.pressedSoft]}
          >
            <Feather name={action.icon} size={23} color={color.ink} />
            {action.count !== undefined && action.count > 0 ? (
              <View style={styles.barBadge}>
                <Text style={styles.barBadgeText} numberOfLines={1}>
                  {action.count > 99 ? "99+" : action.count}
                </Text>
              </View>
            ) : null}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// ── Announcement strip ───────────────────────────────────────────────────────

// Same slot and same shape as Markate's "Kate AI Bundle Reminder!", spent on
// something true instead. `tone` is what decides whether it reads as a nudge or
// as an all-clear — a strip that looks identical whether four leads are cold or
// none are is furniture, and gets ignored within a week.
export function Announcement({
  icon,
  title,
  detail,
  tone = "brand",
  onPress,
}: {
  icon: IconName;
  title: string;
  detail: string;
  tone?: "brand" | "good";
  onPress?: () => void;
}): React.ReactElement {
  const tint = tone === "good" ? color.good : color.brandDeep;
  const body = (
    <View style={[styles.announce, tone === "good" && styles.announceGood]}>
      <Feather name={icon} size={20} color={tint} />
      <View style={styles.announceBody}>
        <Text style={[styles.announceTitle, { color: tint }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.announceDetail} numberOfLines={1}>
          {detail}
        </Text>
      </View>
      {onPress ? <Feather name="chevron-right" size={20} color={color.muted} /> : null}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${detail}`}
      onPress={onPress}
      style={({ pressed }) => (pressed ? styles.pressedSoft : null)}
    >
      {body}
    </Pressable>
  );
}

// ── Greeting ─────────────────────────────────────────────────────────────────

// "Hi, Canes Pressure Washing!" over a money line. The sub-line is LABELLED
// rather than bare: Markate prints "$1,000.00 (1 Jobs Today)" with no unit, and
// a figure whose window you have to guess is worse than one you have to read.
export function LauncherGreeting({
  name,
  money,
  detail,
}: {
  name: string;
  money: string;
  detail: string;
}): React.ReactElement {
  return (
    <View style={styles.greetBlock}>
      <Text style={styles.greet} numberOfLines={2}>
        Hi, {name}
        <Text style={styles.stop}>.</Text>
      </Text>
      <Text style={styles.greetSub} numberOfLines={1}>
        <Text style={styles.greetMoney}>{money}</Text> {detail}
      </Text>
    </View>
  );
}

// ── Tiles ────────────────────────────────────────────────────────────────────

export type LauncherTile = {
  key: string;
  label: string;
  icon: IconName;
  // Absent or zero renders no badge at all. A "0" in the corner of every tile
  // is nine pieces of nothing competing with the one number that matters.
  count?: number;
  // Overdue money is the only thing that earns red; everything else counts in
  // brand orange, so red keeps meaning "this is late".
  tone?: "brand" | "danger";
  onPress: () => void;
};

// Two per row, always. Percentage widths with space-between rather than a gap:
// a percentage basis PLUS a gap overflows the row on narrow devices, and this
// grid must not reflow to one column on an SE.
export function TileGrid({ tiles }: { tiles: LauncherTile[] }): React.ReactElement {
  return (
    <View style={styles.grid}>
      {/* `key` is destructured out rather than spread: React consumes it, and
          leaving it in the spread makes it land twice on the element. */}
      {tiles.map(({ key, ...tile }) => (
        <Tile key={key} {...tile} />
      ))}
    </View>
  );
}

export function Tile({
  label,
  icon,
  count,
  tone = "brand",
  onPress,
}: Omit<LauncherTile, "key">): React.ReactElement {
  const badge = count !== undefined && count > 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={badge ? `${label}, ${count}` : label}
      onPress={onPress}
      style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
    >
      {/* The soft disc sits BEHIND and up-right of the glyph, the way Markate
          offsets its green blob. Absolute so it never adds to the icon's
          layout box and shifts the label off centre. */}
      <View style={styles.tileIcon}>
        <View style={styles.tileBlob} pointerEvents="none" />
        <Feather name={icon} size={27} color={color.ink} />
      </View>
      <Text style={styles.tileLabel} numberOfLines={1}>
        {label}
      </Text>
      {badge ? (
        <Text
          style={[styles.tileCount, tone === "danger" && styles.tileCountDanger]}
          numberOfLines={1}
        >
          {count > 99 ? "99+" : count}
        </Text>
      ) : null}
    </Pressable>
  );
}

// ── Report cards ─────────────────────────────────────────────────────────────
//
// Markate's "Today's Report" grid: same two columns as the launcher, but each
// cell is icon → label → figure instead of icon → label. Taller, because the
// figure is the point and a wrapped label must not push it out of the card.

export type StatCardProps = {
  label: string;
  icon: IconName;
  value: string;
  // Printed small beside the figure as "(1)", the way Markate qualifies a total
  // with how many things made it. Omitted when a bare count IS the figure.
  count?: number;
  // A zero is rendered muted. An amount that has not happened yet should not
  // read with the same weight as one that has.
  dim?: boolean;
};

export function StatGrid({ cards }: { cards: (StatCardProps & { key: string })[] }) {
  return (
    <View style={styles.grid}>
      {cards.map(({ key, ...card }) => (
        <StatCard key={key} {...card} />
      ))}
    </View>
  );
}

export function StatCard({ label, icon, value, count, dim }: StatCardProps): React.ReactElement {
  return (
    <View style={styles.stat}>
      <View style={styles.tileIcon}>
        <View style={styles.tileBlob} pointerEvents="none" />
        <Feather name={icon} size={24} color={color.ink} />
      </View>
      <Text style={styles.statLabel} numberOfLines={2}>
        {label}
      </Text>
      <View style={styles.statFigureRow}>
        <Text style={[styles.statValue, dim && styles.statValueDim]} numberOfLines={1}>
          {value}
        </Text>
        {count === undefined ? null : <Text style={styles.statCount}>({count})</Text>}
      </View>
    </View>
  );
}

// ── Footer ───────────────────────────────────────────────────────────────────

export function SupportRow({ onPress }: { onPress: () => void }): React.ReactElement {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Support"
      onPress={onPress}
      style={({ pressed }) => [styles.support, pressed && styles.pressedSoft]}
    >
      <Feather name="message-circle" size={19} color={color.brandDeep} />
      <Text style={styles.supportText}>Support</Text>
    </Pressable>
  );
}

// The launcher's own body padding. Tighter than the ledger screens' 16/20/28
// because the grid supplies most of its own rhythm.
export const launcherBody: ViewStyle = {
  paddingHorizontal: 16,
  paddingTop: 4,
  paddingBottom: 20,
  gap: 18,
};

const styles = StyleSheet.create({
  bar: {
    backgroundColor: color.surface,
    paddingHorizontal: 12,
    paddingBottom: space.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.line,
  },
  barRight: { flexDirection: "row", alignItems: "center", gap: 2 },
  barButton: {
    width: HIT,
    height: HIT,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
  },
  pressedSoft: { backgroundColor: color.hover },
  barBadge: {
    position: "absolute",
    top: 4,
    right: 3,
    minWidth: 19,
    height: 19,
    paddingHorizontal: 5,
    borderRadius: 10,
    backgroundColor: color.brandFill,
    alignItems: "center",
    justifyContent: "center",
    // A ring in the bar's own colour so the badge reads as sitting ON the icon
    // rather than merging with the glyph underneath it.
    borderWidth: 2,
    borderColor: color.surface,
  },
  barBadgeText: {
    fontFamily: font.monoMedium,
    fontSize: 10,
    lineHeight: 13,
    color: color.surface,
    fontVariant: ["tabular-nums"],
  },

  announce: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 62,
    paddingHorizontal: 14,
    paddingVertical: 11,
    backgroundColor: color.brandWash,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.brandEdgeSoft,
    borderRadius: radius.lg,
  },
  announceGood: { backgroundColor: color.goodBg, borderColor: color.line },
  announceBody: { flex: 1, minWidth: 0, gap: 3 },
  announceTitle: { ...type.title },
  announceDetail: { ...type.small, color: color.muted },

  greetBlock: { gap: 6 },
  greet: { ...type.display, color: color.ink },
  stop: { color: color.brand },
  greetSub: { ...type.small, color: color.muted },
  greetMoney: {
    fontFamily: font.monoMedium,
    fontSize: 13.5,
    color: color.ink,
    fontVariant: ["tabular-nums"],
  },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 12,
  },
  tile: {
    width: "48.5%",
    minHeight: 98,
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    paddingHorizontal: 10,
    paddingVertical: 14,
    backgroundColor: color.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
    borderRadius: radius.lg,
  },
  tilePressed: { backgroundColor: color.hover, borderColor: color.lineStrong },
  tileIcon: { alignItems: "center", justifyContent: "center" },
  tileBlob: {
    position: "absolute",
    top: -5,
    right: -9,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: color.brandSoft,
  },
  tileLabel: { ...type.title, color: color.ink, textAlign: "center" },
  tileCount: {
    position: "absolute",
    top: 8,
    right: 11,
    fontFamily: font.monoMedium,
    fontSize: 12,
    color: color.brandDeep,
    fontVariant: ["tabular-nums"],
  },
  tileCountDanger: { color: color.danger },

  stat: {
    width: "48.5%",
    minHeight: 150,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 18,
    backgroundColor: color.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
    borderRadius: radius.lg,
  },
  statLabel: { ...type.small, color: color.muted, textAlign: "center" },
  statFigureRow: { flexDirection: "row", alignItems: "baseline", gap: 5 },
  statValue: {
    fontFamily: font.monoMedium,
    fontSize: 19,
    letterSpacing: -0.4,
    color: color.ink,
    fontVariant: ["tabular-nums"],
  },
  statValueDim: { color: color.muted },
  statCount: {
    fontFamily: font.mono,
    fontSize: 12,
    color: color.muted,
    fontVariant: ["tabular-nums"],
  },

  support: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: HIT,
    borderRadius: radius.md,
  },
  supportText: { ...type.title, color: color.brandDeep },
});
