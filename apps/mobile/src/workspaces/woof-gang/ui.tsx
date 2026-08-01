import { Feather } from "@expo/vector-icons";
import { type ComponentProps, type ReactNode, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Line, Path, Stop, Text as SvgText } from "react-native-svg";
import { font, HIT, space, type } from "@/theme";
import type { WgAction, WgFeed, WgKpi, WgRanking, WgStorePerformance, WgTrendPoint } from "./api";

type IconName = ComponentProps<typeof Feather>["name"];

// Literal dashboard tokens from app/globals.css. Orange is the brand accent;
// green is reserved for a genuinely positive movement.
export const wgColor = {
  bg: "#070707",
  surface: "rgba(255,255,255,0.025)",
  surfaceRaised: "rgba(255,255,255,0.05)",
  cell: "#070707",
  line: "rgba(255,255,255,0.08)",
  lineStrong: "rgba(255,255,255,0.14)",
  ink: "#ffffff",
  muted: "rgba(255,255,255,0.58)",
  faint: "rgba(255,255,255,0.38)",
  orange: "#fe5100",
  orangeSoft: "rgba(254,81,0,0.12)",
  orangeWash: "rgba(254,81,0,0.06)",
  series: "rgba(255,255,255,0.28)",
  track: "rgba(255,255,255,0.12)",
  grid: "rgba(255,255,255,0.07)",
  good: "#46d18a",
  amber: "#f5bb62",
  red: "#f38d88",
} as const;

export function ScreenHeader({ eyebrow, title, right }: { eyebrow: string; title: string; right?: ReactNode }): React.ReactElement {
  return (
    <View style={styles.header}>
      <View style={styles.headerCopy}>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={styles.heading}>{title}</Text>
      </View>
      {right}
    </View>
  );
}

export function Section({ label, action, children }: { label: string; action?: string; children: ReactNode }): React.ReactElement {
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
      {items.map((item) => (
        <View key={item.label} style={styles.kpi}>
          <View style={styles.kpiTop}>
            <Text style={styles.kpiLabel}>{item.label}</Text>
            {item.change ? <Text style={[styles.delta, item.tone === "good" && styles.good, item.tone === "bad" && styles.bad]}>{item.change.split(" ")[0]}</Text> : null}
          </View>
          <Text style={[styles.kpiValue, item.accent && styles.accent]} numberOfLines={1}>{item.value}</Text>
        </View>
      ))}
    </View>
  );
}

function linePath(points: WgTrendPoint[], width: number, height: number): { line: string; area: string; coordinates: Array<{ x: number; y: number }> } {
  const values = points.map((point) => point.value);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const spread = Math.max(max - min, 1);
  const coordinates = points.map((point, index) => ({
    x: points.length === 1 ? width / 2 : (index / (points.length - 1)) * width,
    y: height - ((point.value - min) / spread) * (height - 12) - 6,
  }));
  const line = coordinates.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  return { line, area: `${line} L${width},${height} L0,${height} Z`, coordinates };
}

export function Trend({ points, total, delta }: { points: WgTrendPoint[]; total?: string; delta?: string | null }): React.ReactElement {
  const [width, setWidth] = useState(0);
  const chartHeight = 176;
  const onLayout = (event: LayoutChangeEvent) => setWidth(Math.floor(event.nativeEvent.layout.width));
  const paths = useMemo(() => linePath(points, Math.max(width - 24, 1), chartHeight - 30), [points, width]);
  if (!points.length) return <Empty text="Revenue trend data has not been published for this period." />;
  return (
    <View style={styles.trendCard} accessibilityRole="image" accessibilityLabel={`Revenue trend. ${total ?? ""} ${delta ?? ""}`} onLayout={onLayout}>
      {total ? (
        <View style={styles.chartSummary}>
          <Text style={styles.chartTotal}>{total}</Text>
          {delta ? <Text style={styles.chartDelta}>{delta}</Text> : null}
        </View>
      ) : null}
      {width > 0 ? (
        <Svg width={width} height={chartHeight} viewBox={`0 0 ${width} ${chartHeight}`}>
          <Defs>
            <LinearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={wgColor.orange} stopOpacity={0.24} />
              <Stop offset="1" stopColor={wgColor.orange} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          {[24, 66, 108].map((y) => <Line key={y} x1="12" x2={width - 12} y1={y} y2={y} stroke={wgColor.grid} strokeWidth="1" />)}
          <Path d={paths.area} fill="url(#revenueFill)" transform="translate(12 0)" />
          <Path d={paths.line} fill="none" stroke={wgColor.orange} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" transform="translate(12 0)" />
          {paths.coordinates.length <= 12 ? paths.coordinates.map((point, index) => (
            <Circle key={`${point.x}-${index}`} cx={point.x + 12} cy={point.y} r="2" fill={wgColor.orange} />
          )) : null}
          {points.filter((_, index) => index === 0 || index === points.length - 1 || (points.length <= 12 && index === Math.floor(points.length / 2))).map((point) => {
            const index = points.indexOf(point);
            const x = paths.coordinates[index]?.x ?? 0;
            return <SvgText key={`${point.label}-${index}`} x={Math.min(Math.max(x + 12, 18), width - 18)} y={chartHeight - 5} fill={wgColor.faint} fontSize="9" textAnchor={index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"}>{point.label}</SvgText>;
          })}
        </Svg>
      ) : null}
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

export function RankingList({ items, empty, rank }: { items: WgRanking[]; empty: string; rank?: boolean }): React.ReactElement {
  if (!items.length) return <Empty text={empty} />;
  return (
    <View style={styles.listCard}>
      {items.slice(0, 6).map((item, index) => (
        <View key={item.id} style={[styles.listRow, index > 0 && styles.divided]}>
          {rank ? <Text style={styles.rank}>{index + 1}</Text> : <Feather name="users" size={17} color={wgColor.orange} />}
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>{item.name}</Text>
            {item.detail ? <Text style={styles.rowDetail}>{item.detail}</Text> : null}
            {item.score !== null ? <View style={styles.scoreTrack}><View style={[styles.scoreFill, { width: `${Math.max(0, Math.min(item.score, 100))}%` }]} /></View> : null}
          </View>
          <Text style={styles.rowValue}>{item.value}</Text>
        </View>
      ))}
    </View>
  );
}

export function StorePerformance({ items }: { items: WgStorePerformance[] }): React.ReactElement {
  if (!items.length) return <Empty text="Store performance will appear after source data arrives." />;
  return (
    <View style={styles.storeGrid}>
      {items.map((item) => (
        <View key={item.id} style={styles.storeCard}>
          <View style={styles.storeHead}><Text style={styles.rowTitle}>{item.name}</Text><Text style={styles.storeAvg}>{item.avgTicket} AVG</Text></View>
          <Text style={styles.storeRevenue}>{item.revenue}</Text>
          <View style={styles.meterHead}><Text style={styles.micro}>RETURN</Text><Text style={styles.meterValue}>{Math.round(item.rebook)}%</Text></View>
          <View style={styles.scoreTrack}><View style={[styles.scoreFillMuted, { width: `${Math.min(item.rebook, 100)}%` }]} /></View>
          <View style={styles.storeFoot}><Text style={styles.micro}>RETAIL ATTACH</Text><Text style={[styles.meterValue, item.attach < 15 && styles.accent]}>{Math.round(item.attach)}%</Text></View>
        </View>
      ))}
    </View>
  );
}

export function FeedCard({ kind, data }: { kind: "calls" | "web"; data: WgFeed }): React.ReactElement {
  const title = kind === "calls" ? "Inbound calls" : "Website traffic vs bookings";
  if (!data.live) {
    return (
      <View style={styles.feedCard}>
        <Text style={styles.micro}>{title}</Text>
        <View style={styles.feedEmpty}>
          <Text style={styles.micro}>COMING ONLINE</Text>
          <Text style={styles.feedTitle}>{kind === "calls" ? "Call tracking goes live with Twilio" : "Website analytics connect next"}</Text>
          <Text style={styles.feedDetail}>{kind === "calls" ? "Answered vs missed calls and the revenue behind every missed one will appear here." : "Visits, online bookings, and funnel leakage will appear here once analytics is linked."}</Text>
        </View>
      </View>
    );
  }
  return <View style={styles.feedCard}><Text style={styles.micro}>{title}</Text><Text style={styles.feedPrimary}>{data.primary}</Text><Text style={styles.accent}>{data.secondary}</Text></View>;
}

export function BriefCard({ headline, recommendation, actionsOpen }: { headline: string; recommendation: string; actionsOpen: number }): React.ReactElement {
  return (
    <View style={styles.briefCard}>
      <Text style={styles.ursoAi}>URSO.AI · WEEKLY BRIEF</Text>
      <Text style={styles.briefHeadline}>{headline}</Text>
      {recommendation ? <Text style={styles.briefDetail}>{recommendation}</Text> : null}
      <Text style={styles.briefMeta}>{actionsOpen} OPEN {actionsOpen === 1 ? "ACTION" : "ACTIONS"}</Text>
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
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}><Feather name={icon} size={18} color={wgColor.ink} /></Pressable>;
}

export const wgStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: wgColor.bg },
  content: { paddingHorizontal: space.lg, gap: space.xl },
  centre: { flex: 1, alignItems: "center", justifyContent: "center", padding: space.xl, backgroundColor: wgColor.bg },
  retry: { minHeight: HIT, paddingHorizontal: space.lg, justifyContent: "center", backgroundColor: wgColor.orange },
  retryText: { fontFamily: font.bodySemi, color: wgColor.bg, fontSize: 15, textAlign: "center" },
  controls: { flexDirection: "row", gap: space.sm },
  control: { minHeight: 62, flex: 1, backgroundColor: wgColor.surface, borderWidth: 1, borderColor: wgColor.line, justifyContent: "center", paddingHorizontal: space.md },
  controlLabel: { color: wgColor.faint, ...type.micro },
  controlValue: { color: wgColor.ink, fontFamily: font.bodySemi, fontSize: 14, marginTop: 3 },
  primary: { minHeight: HIT, backgroundColor: wgColor.orangeSoft, borderLeftWidth: 2, borderLeftColor: wgColor.orange, justifyContent: "center", paddingHorizontal: space.lg, paddingVertical: space.md },
  primaryText: { color: wgColor.ink, fontFamily: font.bodyMedium, fontSize: 14, lineHeight: 20 },
  pressed: { opacity: 0.68 },
});

const styles = StyleSheet.create({
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", gap: space.md },
  headerCopy: { flex: 1 },
  eyebrow: { ...type.micro, color: wgColor.muted },
  heading: { color: wgColor.ink, fontFamily: font.display, fontSize: 29, letterSpacing: -0.8, marginTop: 5 },
  section: { gap: space.sm },
  sectionHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  sectionLabel: { color: wgColor.ink, ...type.title },
  sectionAction: { color: wgColor.muted, ...type.micro },
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", borderTopWidth: 1, borderLeftWidth: 1, borderColor: wgColor.line },
  kpi: { width: "50%", minHeight: 104, backgroundColor: wgColor.cell, borderRightWidth: 1, borderBottomWidth: 1, borderColor: wgColor.line, padding: space.md, justifyContent: "space-between" },
  kpiTop: { gap: 4 },
  kpiLabel: { color: wgColor.muted, ...type.micro },
  kpiValue: { color: wgColor.ink, fontFamily: font.bodySemi, fontSize: 23, letterSpacing: -0.45 },
  delta: { color: wgColor.faint, fontFamily: font.mono, fontSize: 10 },
  good: { color: wgColor.good },
  bad: { color: wgColor.red },
  accent: { color: wgColor.orange },
  trendCard: { minHeight: 232, paddingTop: space.md, backgroundColor: wgColor.surface, borderWidth: 1, borderColor: wgColor.line, overflow: "hidden" },
  chartSummary: { flexDirection: "row", alignItems: "baseline", gap: space.sm, paddingHorizontal: space.md },
  chartTotal: { color: wgColor.ink, fontFamily: font.bodySemi, fontSize: 22, letterSpacing: -0.4 },
  chartDelta: { color: wgColor.good, fontFamily: font.mono, fontSize: 11 },
  listCard: { overflow: "hidden", borderWidth: 1, borderColor: wgColor.line, backgroundColor: wgColor.surface },
  listRow: { minHeight: 62, paddingHorizontal: space.md, paddingVertical: 11, flexDirection: "row", alignItems: "center", gap: space.sm },
  divided: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: wgColor.line },
  dot: { height: 8, width: 8, backgroundColor: wgColor.orange },
  dotUrgent: { backgroundColor: wgColor.red },
  dotWatch: { backgroundColor: wgColor.amber },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { color: wgColor.ink, fontFamily: font.bodyMedium, fontSize: 15 },
  rowDetail: { color: wgColor.muted, ...type.small },
  rowValue: { color: wgColor.ink, fontFamily: font.bodySemi, fontSize: 14, textAlign: "right", maxWidth: 88 },
  rank: { minWidth: 20, color: wgColor.orange, fontFamily: font.mono, fontSize: 12, textAlign: "center" },
  scoreTrack: { marginTop: 6, height: 3, backgroundColor: wgColor.track, overflow: "hidden" },
  scoreFill: { height: "100%", backgroundColor: wgColor.orange },
  scoreFillMuted: { height: "100%", backgroundColor: wgColor.series },
  storeGrid: { gap: space.sm },
  storeCard: { borderWidth: 1, borderColor: wgColor.line, backgroundColor: wgColor.surface, padding: space.md, gap: space.md },
  storeHead: { flexDirection: "row", justifyContent: "space-between", gap: space.md },
  storeAvg: { color: wgColor.muted, fontFamily: font.mono, fontSize: 10 },
  storeRevenue: { color: wgColor.ink, fontFamily: font.bodySemi, fontSize: 27, letterSpacing: -0.6 },
  meterHead: { flexDirection: "row", justifyContent: "space-between" },
  meterValue: { color: wgColor.muted, fontFamily: font.mono, fontSize: 11 },
  storeFoot: { borderTopWidth: 1, borderTopColor: wgColor.line, paddingTop: space.md, flexDirection: "row", justifyContent: "space-between" },
  micro: { color: wgColor.muted, ...type.micro },
  feedCard: { minHeight: 190, borderWidth: 1, borderColor: wgColor.line, backgroundColor: wgColor.surface, padding: space.md, gap: space.md },
  feedEmpty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: space.md, gap: space.sm, backgroundColor: wgColor.orangeWash },
  feedTitle: { color: wgColor.ink, fontFamily: font.bodySemi, fontSize: 15, textAlign: "center" },
  feedDetail: { color: wgColor.muted, ...type.small, textAlign: "center" },
  feedPrimary: { color: wgColor.ink, fontFamily: font.bodySemi, fontSize: 23 },
  briefCard: { borderLeftWidth: 2, borderLeftColor: wgColor.orange, backgroundColor: wgColor.orangeWash, padding: space.lg, gap: space.sm },
  ursoAi: { color: wgColor.orange, ...type.micro },
  briefHeadline: { color: wgColor.ink, fontFamily: font.display, fontSize: 21, lineHeight: 27 },
  briefDetail: { color: wgColor.muted, ...type.body },
  briefMeta: { color: wgColor.faint, ...type.micro, marginTop: space.xs },
  notice: { flexDirection: "row", alignItems: "flex-start", gap: space.sm, padding: space.md, backgroundColor: wgColor.surfaceRaised, borderWidth: 1, borderColor: wgColor.line },
  noticePending: { borderColor: "rgba(245,187,98,0.3)" },
  noticeError: { borderColor: "rgba(243,141,136,0.3)" },
  noticeText: { flex: 1, color: wgColor.muted, ...type.small },
  empty: { minHeight: 88, alignItems: "center", justifyContent: "center", paddingHorizontal: space.lg, borderWidth: 1, borderColor: wgColor.line, backgroundColor: wgColor.surface },
  emptyText: { color: wgColor.muted, ...type.body, textAlign: "center" },
  iconButton: { width: HIT, height: HIT, alignItems: "center", justifyContent: "center", backgroundColor: wgColor.surfaceRaised, borderWidth: 1, borderColor: wgColor.line },
  pressed: { opacity: 0.68 },
});
