import { Feather } from "@expo/vector-icons";
import { type ComponentProps, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { color, font, HIT, radius, space, type } from "@/theme";
import type { WgAction, WgKpi, WgRanking, WgTrendPoint } from "./api";

type IconName = ComponentProps<typeof Feather>["name"];

export const wgColor = {
  bg: "#0b1111",
  surface: "#121b1b",
  surfaceRaised: "#172222",
  line: "rgba(207, 230, 222, 0.12)",
  ink: "#f1f5f2",
  muted: "#a0b0aa",
  faint: "#71807a",
  mint: "#78d5a5",
  mintDeep: "#194e39",
  amber: "#f5bb62",
  red: "#f38d88",
} as const;

export function ScreenHeader({
  eyebrow,
  title,
  right,
}: {
  eyebrow: string;
  title: string;
  right?: ReactNode;
}): React.ReactElement {
  return (
    <View style={styles.header}>
      <View>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={styles.heading}>{title}</Text>
      </View>
      {right}
    </View>
  );
}

export function Section({
  label,
  action,
  children,
}: {
  label: string;
  action?: string;
  children: ReactNode;
}): React.ReactElement {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionLabel}>{label}</Text>
        {action ? <Text style={styles.sectionAction}>{action}</Text> : null}
      </View>
      {children}
    </View>
  );
}

export function KpiGrid({ items }: { items: WgKpi[] }): React.ReactElement {
  return (
    <View style={styles.kpiGrid}>
      {items.slice(0, 4).map((item) => (
        <View key={item.label} style={styles.kpi}>
          <Text style={styles.kpiLabel}>{item.label}</Text>
          <Text style={styles.kpiValue} numberOfLines={1}>{item.value}</Text>
          {item.change ? (
            <Text style={[styles.kpiChange, item.tone === "good" && styles.good, item.tone === "bad" && styles.bad]}>
              {item.change}
            </Text>
          ) : <Text style={styles.kpiChange}>No comparison</Text>}
        </View>
      ))}
    </View>
  );
}

export function Trend({ points }: { points: WgTrendPoint[] }): React.ReactElement {
  if (!points.length) return <Empty text="Revenue trend data has not been published for this period." />;
  const max = Math.max(...points.map((point) => point.value), 1);
  return (
    <View style={styles.trendCard} accessibilityLabel="Revenue trend chart">
      <View style={styles.bars}>
        {points.slice(-8).map((point) => (
          <View key={point.label} style={styles.barColumn}>
            <View style={styles.barTrack}>
              <View style={[styles.bar, { height: `${Math.max((point.value / max) * 100, 5)}%` }]} />
            </View>
            <Text style={styles.barLabel} numberOfLines={1}>{point.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export function ActionList({ items, empty }: { items: WgAction[]; empty: string }): React.ReactElement {
  if (!items.length) return <Empty text={empty} />;
  return (
    <View style={styles.listCard}>
      {items.slice(0, 5).map((item, index) => (
        <View key={item.id} style={[styles.listRow, index > 0 && styles.divided]}>
          <View style={[styles.dot, item.severity === "urgent" && styles.dotUrgent, item.severity === "watch" && styles.dotWatch]} />
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>{item.title}</Text>
            {item.detail ? <Text style={styles.rowDetail}>{item.detail}</Text> : null}
          </View>
        </View>
      ))}
    </View>
  );
}

export function RankingList({
  items,
  empty,
  rank,
}: {
  items: WgRanking[];
  empty: string;
  rank?: boolean;
}): React.ReactElement {
  if (!items.length) return <Empty text={empty} />;
  return (
    <View style={styles.listCard}>
      {items.slice(0, 6).map((item, index) => (
        <View key={item.id} style={[styles.listRow, index > 0 && styles.divided]}>
          {rank ? <Text style={styles.rank}>{index + 1}</Text> : <Feather name="users" size={17} color={wgColor.mint} />}
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>{item.name}</Text>
            {item.detail ? <Text style={styles.rowDetail}>{item.detail}</Text> : null}
            {item.score !== null ? (
              <View style={styles.scoreTrack}>
                <View style={[styles.scoreFill, { width: `${Math.max(0, Math.min(item.score, 100))}%` }]} />
              </View>
            ) : null}
          </View>
          <Text style={styles.rowValue}>{item.value}</Text>
        </View>
      ))}
    </View>
  );
}

export function Notice({ text, tone = "plain" }: { text: string; tone?: "plain" | "pending" | "error" }): React.ReactElement {
  return (
    <View style={[styles.notice, tone === "pending" && styles.noticePending, tone === "error" && styles.noticeError]}>
      <Feather name={tone === "error" ? "alert-circle" : tone === "pending" ? "clock" : "info"} size={17} color={tone === "error" ? wgColor.red : tone === "pending" ? wgColor.amber : wgColor.muted} />
      <Text style={styles.noticeText}>{text}</Text>
    </View>
  );
}

export function Empty({ text }: { text: string }): React.ReactElement {
  return <View style={styles.empty}><Text style={styles.emptyText}>{text}</Text></View>;
}

export function IconButton({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }): React.ReactElement {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.72 }]}
    >
      <Feather name={icon} size={19} color={wgColor.ink} />
    </Pressable>
  );
}

export const wgStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: wgColor.bg },
  content: { paddingHorizontal: space.lg, gap: space.xl },
  centre: { flex: 1, alignItems: "center", justifyContent: "center", padding: space.xl },
  retry: { minHeight: HIT, paddingHorizontal: space.lg, justifyContent: "center", borderRadius: radius.md, backgroundColor: wgColor.mint },
  retryText: { fontFamily: font.bodySemi, color: wgColor.bg, fontSize: 15, textAlign: "center" },
  controls: { flexDirection: "row", gap: space.sm },
  control: { minHeight: HIT, flex: 1, borderRadius: radius.md, backgroundColor: wgColor.surfaceRaised, borderWidth: 1, borderColor: wgColor.line, justifyContent: "center", paddingHorizontal: space.md },
  controlLabel: { color: wgColor.muted, ...type.small },
  controlValue: { color: wgColor.ink, fontFamily: font.bodySemi, fontSize: 15, marginTop: 1 },
  primary: { minHeight: HIT, borderRadius: radius.md, backgroundColor: wgColor.mint, justifyContent: "center", alignItems: "center", paddingHorizontal: space.lg },
  primaryText: { color: wgColor.bg, fontFamily: font.bodySemi, fontSize: 15 },
  pressed: { opacity: 0.72 },
});

const styles = StyleSheet.create({
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", gap: space.md },
  eyebrow: { ...type.micro, color: wgColor.mint },
  heading: { color: wgColor.ink, fontFamily: font.display, fontSize: 29, letterSpacing: -0.8, marginTop: 4 },
  section: { gap: space.sm },
  sectionHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  sectionLabel: { color: wgColor.ink, ...type.title },
  sectionAction: { color: wgColor.mint, ...type.small },
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  kpi: { width: "48.8%", minHeight: 112, backgroundColor: wgColor.surface, borderWidth: 1, borderColor: wgColor.line, borderRadius: radius.lg, padding: space.md, justifyContent: "space-between" },
  kpiLabel: { color: wgColor.muted, ...type.small },
  kpiValue: { color: wgColor.ink, fontFamily: font.bodySemi, fontSize: 23, letterSpacing: -0.3, marginTop: space.sm },
  kpiChange: { color: wgColor.faint, ...type.small, marginTop: 3 },
  good: { color: wgColor.mint },
  bad: { color: wgColor.red },
  trendCard: { height: 180, padding: space.md, backgroundColor: wgColor.surface, borderWidth: 1, borderColor: wgColor.line, borderRadius: radius.lg },
  bars: { flex: 1, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 7 },
  barColumn: { flex: 1, alignItems: "center", gap: 6, height: "100%" },
  barTrack: { flex: 1, width: "100%", justifyContent: "flex-end", borderRadius: 2, backgroundColor: "#20302c" },
  bar: { width: "100%", backgroundColor: wgColor.mint, borderRadius: 2 },
  barLabel: { color: wgColor.faint, fontFamily: font.mono, fontSize: 9 },
  listCard: { overflow: "hidden", borderRadius: radius.lg, borderWidth: 1, borderColor: wgColor.line, backgroundColor: wgColor.surface },
  listRow: { minHeight: 62, paddingHorizontal: space.md, paddingVertical: 11, flexDirection: "row", alignItems: "center", gap: space.sm },
  divided: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: wgColor.line },
  dot: { height: 9, width: 9, borderRadius: 5, backgroundColor: wgColor.mint },
  dotUrgent: { backgroundColor: wgColor.red },
  dotWatch: { backgroundColor: wgColor.amber },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { color: wgColor.ink, fontFamily: font.bodyMedium, fontSize: 15 },
  rowDetail: { color: wgColor.muted, ...type.small },
  rowValue: { color: wgColor.ink, fontFamily: font.bodySemi, fontSize: 14, textAlign: "right", maxWidth: 88 },
  rank: { minWidth: 20, color: wgColor.mint, fontFamily: font.mono, fontSize: 12, textAlign: "center" },
  scoreTrack: { marginTop: 5, height: 4, borderRadius: 2, backgroundColor: "#20302c", overflow: "hidden" },
  scoreFill: { height: "100%", backgroundColor: wgColor.mint, borderRadius: 2 },
  notice: { flexDirection: "row", alignItems: "flex-start", gap: space.sm, padding: space.md, borderRadius: radius.md, backgroundColor: wgColor.surfaceRaised, borderWidth: 1, borderColor: wgColor.line },
  noticePending: { borderColor: "rgba(245,187,98,0.3)" },
  noticeError: { borderColor: "rgba(243,141,136,0.3)" },
  noticeText: { flex: 1, color: wgColor.muted, ...type.small },
  empty: { minHeight: 88, alignItems: "center", justifyContent: "center", paddingHorizontal: space.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: wgColor.line, backgroundColor: wgColor.surface },
  emptyText: { color: wgColor.muted, ...type.body, textAlign: "center" },
  iconButton: { width: HIT, height: HIT, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: wgColor.surfaceRaised, borderWidth: 1, borderColor: wgColor.line },
});
