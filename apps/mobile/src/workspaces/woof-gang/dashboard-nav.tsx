import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { type ComponentProps } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { WgDashboardSection } from "@urso/types";
import { font, HIT, space, type } from "@/theme";
import { wgColor } from "./ui";

type IconName = ComponentProps<typeof Feather>["name"];

export type DashboardLink = { id: WgDashboardSection; title: string; detail: string; icon: IconName };

export const intelligenceLinks: DashboardLink[] = [
  { id: "brief", title: "Weekly brief", detail: "What changed and what to do next", icon: "file-text" },
  { id: "performance", title: "Performance", detail: "Capture, conversion, revenue and mix", icon: "activity" },
  { id: "revenue", title: "Revenue map", detail: "Locations, services, groomers and customers", icon: "trending-up" },
  { id: "money", title: "Money", detail: "QuickBooks profit, margins and costs", icon: "dollar-sign" },
  { id: "compare", title: "Compare", detail: "Stores, groomers and products by period", icon: "shuffle" },
  { id: "customers", title: "Customers", detail: "Retention, cohorts, LTV and win-backs", icon: "users" },
  { id: "products", title: "Products", detail: "Searchable sales and margin catalog", icon: "package" },
  { id: "actions", title: "AI actions", detail: "Review, approve or dismiss recommendations", icon: "zap" },
];

export const operationsLinks: DashboardLink[] = [
  { id: "events", title: "Events", detail: "Log the real-world context behind changes", icon: "calendar" },
  { id: "stores", title: "Stores", detail: "Scoreboard and location comparisons", icon: "map-pin" },
  { id: "team", title: "Team", detail: "Groomer revenue, return and attach", icon: "briefcase" },
  { id: "reviews", title: "Reviews", detail: "Reputation, responses and findability", icon: "star" },
];

export function DashboardDirectory({ links }: { links: DashboardLink[] }): React.ReactElement {
  const router = useRouter();
  return <View style={styles.list}>{links.map((item, index) => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Open ${item.title}`} onPress={() => router.push({ pathname: "/(woof-gang)/explore", params: { section: item.id } })} style={({ pressed }) => [styles.row, index > 0 && styles.divided, pressed && styles.pressed]}><View style={styles.icon}><Feather name={item.icon} size={19} color={wgColor.orange} /></View><View style={styles.copy}><Text style={styles.title}>{item.title}</Text><Text style={styles.detail}>{item.detail}</Text></View><Feather name="chevron-right" size={18} color={wgColor.faint} /></Pressable>)}</View>;
}

const styles = StyleSheet.create({
  list: { borderWidth: 1, borderColor: wgColor.line, backgroundColor: wgColor.surface },
  row: { minHeight: 76, flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.md },
  divided: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: wgColor.line },
  icon: { width: HIT, height: HIT, alignItems: "center", justifyContent: "center", backgroundColor: wgColor.orangeSoft },
  copy: { flex: 1, gap: 2 },
  title: { color: wgColor.ink, fontFamily: font.bodySemi, fontSize: 15 },
  detail: { color: wgColor.muted, ...type.small },
  pressed: { opacity: 0.68 },
});
