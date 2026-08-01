import { Feather } from "@expo/vector-icons";
import { useMutation } from "@tanstack/react-query";
import { type ReactNode, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Line, Path, Stop } from "react-native-svg";
import type { WgMobileSectionBlock, WgTone, WgValueFormat } from "@urso/types";
import { font, HIT, space, type } from "@/theme";
import { woofGangApi } from "./api";
import { Empty, Notice, wgColor } from "./ui";

type Props = { block: WgMobileSectionBlock; onChanged: () => void };

const toneColor = (tone?: WgTone): string => {
  if (tone === "accent" || tone === "bad") return wgColor.orange;
  if (tone === "good") return wgColor.good;
  if (tone === "warning") return wgColor.amber;
  if (tone === "muted") return wgColor.series;
  return wgColor.ink;
};

const formatDelta = (value: number) => `${value >= 0 ? "+" : "−"}${Math.abs(value * 100).toFixed(1)}%`;

function BlockShell({ title, detail, children }: { title?: string; detail?: string; children: ReactNode }): React.ReactElement {
  return (
    <View style={styles.shell}>
      {title ? <View style={styles.shellHeader}><Text style={styles.shellTitle}>{title}</Text>{detail ? <Text style={styles.shellDetail}>{detail}</Text> : null}</View> : null}
      {children}
    </View>
  );
}

function Metrics({ block }: { block: Extract<WgMobileSectionBlock, { type: "metrics" }> }): React.ReactElement {
  return (
    <BlockShell title={block.title}>
      <View style={styles.metricGrid}>
        {block.items.map((item) => (
          <View key={item.label} style={styles.metricCell}>
            <Text style={styles.micro}>{item.label}</Text>
            <Text style={[styles.metricValue, { color: toneColor(item.tone) }]} numberOfLines={1}>{item.display}</Text>
            {item.delta !== undefined && item.delta !== null ? <Text style={[styles.metricDetail, { color: item.delta >= 0 ? wgColor.good : wgColor.orange }]}>{formatDelta(item.delta)}</Text> : item.detail ? <Text style={styles.metricDetail}>{item.detail}</Text> : null}
          </View>
        ))}
      </View>
    </BlockShell>
  );
}

function pathFor(values: Array<number | null>, width: number, height: number): { line: string; area: string; points: Array<{ x: number; y: number }> } {
  const available = values.filter((value): value is number => value !== null && Number.isFinite(value));
  const min = Math.min(...available, 0);
  const max = Math.max(...available, 1);
  const spread = Math.max(max - min, 1);
  const points = values.map((value, index) => ({ x: values.length <= 1 ? width / 2 : index / (values.length - 1) * width, y: value === null ? height : height - ((value - min) / spread) * (height - 12) - 6 }));
  const line = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  return { line, area: `${line} L${width},${height} L0,${height} Z`, points };
}

function LineChart({ block }: { block: Extract<WgMobileSectionBlock, { type: "line" }> }): React.ReactElement {
  const [selected, setSelected] = useState(0);
  const [width, setWidth] = useState(0);
  const active = block.series[Math.min(selected, block.series.length - 1)];
  const chart = useMemo(() => pathFor(active.values, Math.max(width - 24, 1), 158), [active.values, width]);
  return (
    <BlockShell title={block.title} detail={block.detail}>
      {block.series.length > 1 ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>{block.series.map((series, index) => <Pressable key={series.name} accessibilityRole="button" accessibilityState={{ selected: selected === index }} onPress={() => setSelected(index)} style={[styles.tab, selected === index && styles.tabActive]}><Text style={[styles.tabText, selected === index && styles.tabTextActive]}>{series.name}</Text></Pressable>)}</ScrollView> : null}
      <View style={styles.chart} onLayout={(event) => setWidth(Math.floor(event.nativeEvent.layout.width))} accessibilityRole="image" accessibilityLabel={`${block.title}: ${active.name} trend`}>
        {width > 0 ? <Svg width={width} height={184} viewBox={`0 0 ${width} 184`}>
          <Defs><LinearGradient id={`fill-${block.id}`} x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={toneColor(active.tone)} stopOpacity={0.22} /><Stop offset="1" stopColor={toneColor(active.tone)} stopOpacity={0} /></LinearGradient></Defs>
          {[28, 76, 124].map((y) => <Line key={y} x1="12" x2={width - 12} y1={y} y2={y} stroke={wgColor.grid} strokeWidth="1" />)}
          <Path d={chart.area} fill={`url(#fill-${block.id})`} transform="translate(12 0)" />
          <Path d={chart.line} fill="none" stroke={toneColor(active.tone)} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" transform="translate(12 0)" />
          {chart.points.length <= 16 ? chart.points.map((point, index) => <Circle key={`${point.x}-${index}`} cx={point.x + 12} cy={point.y} r="2" fill={toneColor(active.tone)} />) : null}
        </Svg> : null}
      </View>
      <View style={styles.axis}><Text style={styles.axisText}>{block.labels[0] ?? ""}</Text><Text style={styles.axisText}>{block.labels.at(-1) ?? ""}</Text></View>
    </BlockShell>
  );
}

function Bars({ block }: { block: Extract<WgMobileSectionBlock, { type: "bars" }> }): React.ReactElement {
  const max = Math.max(...block.rows.map((row) => Math.abs(row.value)), 1);
  if (!block.rows.length) return <BlockShell title={block.title}><Empty text="No data is available for this view." /></BlockShell>;
  return (
    <BlockShell title={block.title} detail={block.detail}>
      <View style={styles.barList}>{block.rows.map((row, index) => <View key={row.id} style={[styles.barRow, index > 0 && styles.divided]}>
        <View style={styles.barCopy}><Text style={styles.barLabel} numberOfLines={1}>{row.label}</Text>{row.detail ? <Text style={styles.barDetail} numberOfLines={1}>{row.detail}</Text> : null}</View>
        <View style={styles.barVisual}><View style={styles.barTrack}><View style={[styles.barFill, { width: `${Math.max(Math.abs(row.value) / max * 100, row.value === 0 ? 0 : 2)}%`, backgroundColor: toneColor(row.tone) }]} /></View></View>
        <Text style={[styles.barValue, { color: toneColor(row.tone) }]}>{row.display}</Text>
      </View>)}</View>
    </BlockShell>
  );
}

function Segments({ block }: { block: Extract<WgMobileSectionBlock, { type: "segments" }> }): React.ReactElement {
  const total = block.items.reduce((sum, item) => sum + Math.max(item.value, 0), 0) || 1;
  return (
    <BlockShell title={block.title} detail={block.detail}>
      <View style={styles.segmentTrack}>{block.items.map((item) => <View key={item.label} style={{ width: `${Math.max(item.value, 0) / total * 100}%`, backgroundColor: toneColor(item.tone) }} />)}</View>
      <View>{block.items.map((item, index) => <View key={item.label} style={[styles.legendRow, index > 0 && styles.divided]}><View style={[styles.legendDot, { backgroundColor: toneColor(item.tone) }]} /><Text style={styles.legendLabel}>{item.label}</Text><Text style={styles.legendValue}>{item.display}</Text></View>)}</View>
    </BlockShell>
  );
}

function Funnel({ block }: { block: Extract<WgMobileSectionBlock, { type: "funnel" }> }): React.ReactElement {
  const max = Math.max(...block.steps.map((step) => step.value), 1);
  return <BlockShell title={block.title} detail={block.detail}><View style={styles.funnel}>{block.steps.map((step, index) => <View key={`${step.label}-${index}`} style={[styles.funnelStep, { width: `${Math.max(step.value / max * 100, 28)}%`, borderColor: toneColor(step.tone) }]}><Text style={styles.funnelLabel}>{step.label}</Text><Text style={[styles.funnelValue, { color: toneColor(step.tone) }]}>{step.display}</Text></View>)}</View></BlockShell>;
}

function DataTable({ block }: { block: Extract<WgMobileSectionBlock, { type: "table" }> }): React.ReactElement {
  if (!block.rows.length) return <BlockShell title={block.title} detail={block.detail}><Empty text="No rows match this view." /></BlockShell>;
  return (
    <BlockShell title={block.title} detail={block.detail}>
      <View style={styles.table}>{block.rows.map((row, rowIndex) => <View key={row.id} style={[styles.tableRow, rowIndex > 0 && styles.divided, { borderLeftColor: toneColor(row.tone) }]}>
        <Text style={styles.tableTitle}>{row.cells[0] ?? "—"}</Text>
        {row.detail ? <Text style={styles.tableDetail}>{row.detail}</Text> : null}
        <View style={styles.tableCells}>{row.cells.slice(1).map((cell, index) => <View key={`${block.columns[index + 1]}-${index}`} style={styles.tableCell}><Text style={styles.tableColumn}>{block.columns[index + 1]}</Text><Text style={styles.tableValue}>{cell}</Text></View>)}</View>
      </View>)}</View>
    </BlockShell>
  );
}

function Narrative({ block }: { block: Extract<WgMobileSectionBlock, { type: "narrative" }> }): React.ReactElement {
  return <View style={[styles.narrative, { borderLeftColor: toneColor(block.tone) }]}><Text style={styles.narrativeTitle}>{block.title}</Text>{block.body ? <Text style={styles.narrativeBody}>{block.body}</Text> : null}{block.items?.map((item, index) => <View key={`${item}-${index}`} style={styles.bullet}><View style={[styles.bulletDot, { backgroundColor: toneColor(block.tone) }]} /><Text style={styles.bulletText}>{item}</Text></View>)}</View>;
}

function Brief({ block }: { block: Extract<WgMobileSectionBlock, { type: "brief" }> }): React.ReactElement {
  return <View style={styles.brief}><Text style={styles.briefKicker}>URSO · WEEKLY OPERATING BRIEF</Text><Text style={styles.briefHeadline}>{block.headline}</Text><Metrics block={{ id: `${block.id}-changes`, type: "metrics", title: "What changed", items: block.changes }} /><View style={styles.briefColumns}><Narrative block={{ id: `${block.id}-wins`, type: "narrative", title: "What improved", items: block.wins, tone: "good" }} /><Narrative block={{ id: `${block.id}-risks`, type: "narrative", title: "What to watch", items: block.risks, tone: "accent" }} /></View><Narrative block={{ id: `${block.id}-opportunity`, type: "narrative", title: block.opportunity.title, body: block.opportunity.detail, tone: "accent" }} /><Narrative block={{ id: `${block.id}-next`, type: "narrative", title: "Recommended next step", body: block.recommendation, items: [`${block.actionsCompleted} completed · ${block.actionsOpen} open`], tone: "plain" }} /></View>;
}

function Actions({ block, onChanged }: { block: Extract<WgMobileSectionBlock, { type: "actions" }>; onChanged: () => void }): React.ReactElement {
  const mutation = useMutation({ mutationFn: ({ id, status }: { id: string; status: "approved" | "dismissed" }) => woofGangApi.updateAction(id, status), onSuccess: onChanged });
  return <BlockShell title={block.title}>{mutation.isError ? <Notice tone="error" text="The action could not be updated. Try again." /> : null}<View style={styles.actionList}>{block.items.map((item, index) => <View key={item.id} style={[styles.action, index > 0 && styles.divided]}><View style={styles.actionMeta}><Text style={styles.micro}>{item.agent} · {item.store}</Text><Text style={[styles.status, item.status === "suggested" && styles.statusAccent]}>{item.status.toUpperCase()}</Text></View><Text style={styles.actionTitle}>{item.title}</Text><Text style={styles.actionDetail}>{item.detail}</Text><Text style={styles.actionMetric}>{item.metric}</Text>{item.result ? <Text style={styles.actionResult}>{item.result}</Text> : null}{item.status === "suggested" ? <View style={styles.actionButtons}><Pressable accessibilityRole="button" disabled={mutation.isPending} onPress={() => mutation.mutate({ id: item.id, status: "approved" })} style={({ pressed }) => [styles.approve, pressed && styles.pressed]}><Text style={styles.approveText}>Approve</Text></Pressable><Pressable accessibilityRole="button" disabled={mutation.isPending} onPress={() => mutation.mutate({ id: item.id, status: "dismissed" })} style={({ pressed }) => [styles.dismiss, pressed && styles.pressed]}><Text style={styles.dismissText}>Dismiss</Text></Pressable></View> : null}</View>)}</View></BlockShell>;
}

const eventTypes = ["staffing", "promo", "price_change", "closure", "marketing", "weather", "other"];
const storeOptions = [{ id: "all", name: "All stores" }, { id: "wp", name: "Winter Park" }, { id: "wg", name: "Winter Garden" }, { id: "lv", name: "Lakeside Village" }, { id: "wm", name: "Windermere" }];

function Events({ block, onChanged }: { block: Extract<WgMobileSectionBlock, { type: "events" }>; onChanged: () => void }): React.ReactElement {
  const [eventType, setEventType] = useState("staffing");
  const [store, setStore] = useState(block.managerStoreId ?? "all");
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const create = useMutation({ mutationFn: () => woofGangApi.createEvent({ store, eventType, title, detail, start, end }), onSuccess: () => { setTitle(""); setDetail(""); setStart(""); setEnd(""); onChanged(); } });
  const remove = useMutation({ mutationFn: woofGangApi.deleteEvent, onSuccess: onChanged });
  const next = (values: string[], current: string) => values[(values.indexOf(current) + 1) % values.length];
  return <View style={styles.eventStack}>{block.canEdit ? <BlockShell title="Log business context"><View style={styles.eventForm}><View style={styles.eventControls}><Pressable accessibilityRole="button" onPress={() => setEventType(next(eventTypes, eventType))} style={styles.formChoice}><Text style={styles.formLabel}>TYPE</Text><Text style={styles.formValue}>{eventType.replace("_", " ")}</Text></Pressable><Pressable accessibilityRole="button" disabled={block.managerStoreId !== null} onPress={() => setStore(next(storeOptions.map((option) => option.id), store))} style={[styles.formChoice, block.managerStoreId !== null && styles.disabled]}><Text style={styles.formLabel}>STORE</Text><Text style={styles.formValue}>{storeOptions.find((option) => option.id === store)?.name}</Text></Pressable></View><TextInput accessibilityLabel="What happened" placeholder="What happened" placeholderTextColor={wgColor.faint} value={title} onChangeText={setTitle} style={styles.formInput} /><TextInput accessibilityLabel="Event detail" placeholder="Detail (optional)" placeholderTextColor={wgColor.faint} value={detail} onChangeText={setDetail} style={styles.formInput} /><View style={styles.eventControls}><TextInput accessibilityLabel="Start date" placeholder="Start YYYY-MM-DD" placeholderTextColor={wgColor.faint} value={start} onChangeText={setStart} autoCapitalize="none" style={[styles.formInput, styles.dateInput]} /><TextInput accessibilityLabel="End date" placeholder="End (optional)" placeholderTextColor={wgColor.faint} value={end} onChangeText={setEnd} autoCapitalize="none" style={[styles.formInput, styles.dateInput]} /></View>{create.isError ? <Notice tone="error" text={create.error instanceof Error ? create.error.message : "The event could not be saved."} /> : null}<Pressable accessibilityRole="button" disabled={!title.trim() || !start.trim() || create.isPending} onPress={() => create.mutate()} style={({ pressed }) => [styles.approve, (!title.trim() || !start.trim() || create.isPending) && styles.disabled, pressed && styles.pressed]}><Text style={styles.approveText}>{create.isPending ? "Saving…" : "Log event"}</Text></Pressable></View></BlockShell> : null}<BlockShell title={block.title}>{block.items.length ? block.items.map((item, index) => <View key={item.id} style={[styles.event, index > 0 && styles.divided]}><View style={styles.actionMeta}><Text style={styles.micro}>{item.eventType.replace("_", " ")} · {item.store}</Text><Text style={styles.eventDate}>{item.start}{item.end ? ` → ${item.end}` : " → ongoing"}</Text></View><Text style={styles.actionTitle}>{item.title}</Text>{item.detail ? <Text style={styles.actionDetail}>{item.detail}</Text> : null}{block.canEdit ? <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${item.title}`} onPress={() => Alert.alert("Delete event?", "This removes the event from the dashboard and AI context.", [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => remove.mutate(item.id) }])} style={styles.deleteButton}><Feather name="trash-2" size={15} color={wgColor.red} /><Text style={styles.deleteText}>Delete</Text></Pressable> : null}</View>) : <Empty text="No business events have been logged for this scope." />}</BlockShell></View>;
}

export function DashboardBlock({ block, onChanged }: Props): React.ReactElement {
  if (block.type === "metrics") return <Metrics block={block} />;
  if (block.type === "line") return <LineChart block={block} />;
  if (block.type === "bars") return <Bars block={block} />;
  if (block.type === "segments") return <Segments block={block} />;
  if (block.type === "funnel") return <Funnel block={block} />;
  if (block.type === "table") return <DataTable block={block} />;
  if (block.type === "narrative") return <Narrative block={block} />;
  if (block.type === "brief") return <Brief block={block} />;
  if (block.type === "actions") return <Actions block={block} onChanged={onChanged} />;
  return <Events block={block} onChanged={onChanged} />;
}

const styles = StyleSheet.create({
  shell: { borderWidth: 1, borderColor: wgColor.line, backgroundColor: wgColor.surface, overflow: "hidden" },
  shellHeader: { padding: space.md, borderBottomWidth: 1, borderBottomColor: wgColor.line, gap: 3 },
  shellTitle: { color: wgColor.ink, fontFamily: font.bodySemi, fontSize: 16 },
  shellDetail: { color: wgColor.muted, ...type.small },
  micro: { color: wgColor.faint, ...type.micro },
  metricGrid: { flexDirection: "row", flexWrap: "wrap" },
  metricCell: { width: "50%", minHeight: 102, padding: space.md, justifyContent: "space-between", borderRightWidth: 1, borderBottomWidth: 1, borderColor: wgColor.line },
  metricValue: { fontFamily: font.bodySemi, fontSize: 22, letterSpacing: -0.4 },
  metricDetail: { color: wgColor.muted, fontFamily: font.mono, fontSize: 10 },
  tabs: { gap: space.xs, padding: space.md, paddingBottom: 0 },
  tab: { minHeight: 40, justifyContent: "center", borderWidth: 1, borderColor: wgColor.line, paddingHorizontal: space.md },
  tabActive: { borderColor: wgColor.orange, backgroundColor: wgColor.orangeSoft },
  tabText: { color: wgColor.muted, fontFamily: font.bodyMedium, fontSize: 12 },
  tabTextActive: { color: wgColor.orange },
  chart: { height: 184, marginTop: space.sm },
  axis: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: space.md, paddingBottom: space.md },
  axisText: { color: wgColor.faint, fontFamily: font.mono, fontSize: 9 },
  barList: {},
  barRow: { minHeight: 66, padding: space.md, gap: space.sm },
  divided: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: wgColor.line },
  barCopy: { flexDirection: "row", justifyContent: "space-between", gap: space.sm },
  barLabel: { flex: 1, color: wgColor.ink, fontFamily: font.bodyMedium, fontSize: 14 },
  barDetail: { color: wgColor.faint, ...type.small },
  barVisual: { flexDirection: "row", alignItems: "center", gap: space.sm },
  barTrack: { flex: 1, height: 5, backgroundColor: wgColor.track },
  barFill: { height: "100%" },
  barValue: { position: "absolute", right: space.md, bottom: 11, fontFamily: font.mono, fontSize: 11 },
  segmentTrack: { flexDirection: "row", height: 10, margin: space.md, overflow: "hidden" },
  legendRow: { minHeight: 48, paddingHorizontal: space.md, flexDirection: "row", alignItems: "center", gap: space.sm },
  legendDot: { width: 8, height: 8 },
  legendLabel: { flex: 1, color: wgColor.muted, ...type.body },
  legendValue: { color: wgColor.ink, fontFamily: font.mono, fontSize: 12 },
  funnel: { alignItems: "center", padding: space.md, gap: space.xs },
  funnelStep: { minHeight: 48, borderWidth: 1, backgroundColor: wgColor.surfaceRaised, paddingHorizontal: space.md, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  funnelLabel: { color: wgColor.muted, fontFamily: font.bodyMedium, fontSize: 13 },
  funnelValue: { fontFamily: font.mono, fontSize: 12 },
  table: {},
  tableRow: { padding: space.md, borderLeftWidth: 2 },
  tableTitle: { color: wgColor.ink, fontFamily: font.bodySemi, fontSize: 15 },
  tableDetail: { color: wgColor.muted, ...type.small, marginTop: 2 },
  tableCells: { flexDirection: "row", flexWrap: "wrap", marginTop: space.sm, gap: space.sm },
  tableCell: { minWidth: "30%", flexGrow: 1, gap: 2 },
  tableColumn: { color: wgColor.faint, ...type.micro },
  tableValue: { color: wgColor.muted, fontFamily: font.mono, fontSize: 11 },
  narrative: { borderLeftWidth: 2, backgroundColor: wgColor.surface, padding: space.lg, gap: space.sm },
  narrativeTitle: { color: wgColor.ink, fontFamily: font.bodySemi, fontSize: 16 },
  narrativeBody: { color: wgColor.muted, ...type.body },
  bullet: { flexDirection: "row", alignItems: "flex-start", gap: space.sm },
  bulletDot: { width: 6, height: 6, marginTop: 7 },
  bulletText: { flex: 1, color: wgColor.muted, ...type.body },
  brief: { gap: space.md },
  briefKicker: { color: wgColor.orange, ...type.micro },
  briefHeadline: { color: wgColor.ink, fontFamily: font.display, fontSize: 25, lineHeight: 32 },
  briefColumns: { gap: space.sm },
  actionList: {},
  action: { padding: space.md, gap: space.sm },
  actionMeta: { flexDirection: "row", justifyContent: "space-between", gap: space.md },
  status: { color: wgColor.faint, ...type.micro },
  statusAccent: { color: wgColor.orange },
  actionTitle: { color: wgColor.ink, fontFamily: font.bodySemi, fontSize: 16 },
  actionDetail: { color: wgColor.muted, ...type.body },
  actionMetric: { color: wgColor.orange, fontFamily: font.mono, fontSize: 11 },
  actionResult: { color: wgColor.good, ...type.small },
  actionButtons: { flexDirection: "row", gap: space.sm },
  approve: { minHeight: HIT, flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: wgColor.orange, paddingHorizontal: space.md },
  approveText: { color: wgColor.bg, fontFamily: font.bodySemi, fontSize: 14 },
  dismiss: { minHeight: HIT, flex: 1, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: wgColor.lineStrong },
  dismissText: { color: wgColor.muted, fontFamily: font.bodySemi, fontSize: 14 },
  eventStack: { gap: space.md },
  eventForm: { padding: space.md, gap: space.sm },
  eventControls: { flexDirection: "row", gap: space.sm },
  formChoice: { minHeight: HIT, flex: 1, borderWidth: 1, borderColor: wgColor.line, paddingHorizontal: space.md, justifyContent: "center" },
  formLabel: { color: wgColor.faint, ...type.micro },
  formValue: { color: wgColor.ink, fontFamily: font.bodyMedium, fontSize: 13, textTransform: "capitalize", marginTop: 2 },
  formInput: { minHeight: HIT, borderWidth: 1, borderColor: wgColor.line, color: wgColor.ink, fontFamily: font.body, fontSize: 14, paddingHorizontal: space.md, backgroundColor: wgColor.surfaceRaised },
  dateInput: { flex: 1 },
  event: { padding: space.md, gap: space.sm },
  eventDate: { color: wgColor.faint, fontFamily: font.mono, fontSize: 9 },
  deleteButton: { minHeight: 44, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: space.sm },
  deleteText: { color: wgColor.red, fontFamily: font.bodyMedium, fontSize: 13 },
  disabled: { opacity: 0.38 },
  pressed: { opacity: 0.68 },
});
