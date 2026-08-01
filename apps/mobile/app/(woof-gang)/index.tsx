import { useQuery } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { space } from "@/theme";
import { WgApiError, woofGangApi, type WgSession } from "@/workspaces/woof-gang/api";
import { currentEasternMonth, shiftMonth } from "@/workspaces/woof-gang/period";
import { ActionList, BriefCard, FeedCard, IconButton, KpiGrid, Notice, RankingList, ScreenHeader, Section, StorePerformance, Trend, wgColor, wgStyles } from "@/workspaces/woof-gang/ui";

function nextStore(session: WgSession, selected: string | null): string | null {
  if (!session.stores.length) return null;
  const index = session.stores.findIndex((store) => store.id === selected);
  return session.stores[(index + 1) % session.stores.length]?.id ?? session.stores[0].id;
}

export default function WoofGangToday(): React.ReactElement {
  const insets = useSafeAreaInsets();
  const [month, setMonth] = useState(currentEasternMonth);
  const currentMonth = currentEasternMonth();
  const [selectedStore, setSelectedStore] = useState<string | null>(null);
  const sessionQuery = useQuery({ queryKey: ["wg", "session"], queryFn: woofGangApi.session, staleTime: 60_000 });
  const activeStore = selectedStore ?? sessionQuery.data?.defaultStoreId ?? sessionQuery.data?.stores[0]?.id ?? null;
  const homeQuery = useQuery({
    queryKey: ["wg", "home", activeStore, month],
    queryFn: () => woofGangApi.home(activeStore, month),
    enabled: sessionQuery.isSuccess,
  });
  const storeName = useMemo(
    () => sessionQuery.data?.stores.find((store) => store.id === activeStore)?.name ?? "All stores",
    [activeStore, sessionQuery.data?.stores],
  );
  const refresh = useCallback(async () => {
    await Promise.all([sessionQuery.refetch(), homeQuery.refetch()]);
  }, [homeQuery, sessionQuery]);

  if (sessionQuery.isLoading || homeQuery.isLoading) {
    return <View style={wgStyles.centre}><ActivityIndicator color={wgColor.orange} size="large" /></View>;
  }

  const error = sessionQuery.error ?? homeQuery.error;
  if (error) {
    const message = error instanceof WgApiError ? error.message : "The workspace could not be loaded.";
    return (
      <View style={wgStyles.centre}>
        <Notice text={message} tone="error" />
        <View style={{ height: space.md }} />
        <Pressable accessibilityRole="button" accessibilityLabel="Retry loading workspace" onPress={() => void refresh()} style={({ pressed }) => [wgStyles.retry, pressed && { opacity: 0.72 }]}>
          <Text style={wgStyles.retryText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  const session = sessionQuery.data;
  const home = homeQuery.data;
  if (!session || !home) return <View style={wgStyles.centre}><Notice text="No workspace data is available yet." /></View>;
  const manager = session.role === "manager";

  return (
    <View style={wgStyles.screen}>
      <ScrollView
        contentContainerStyle={[wgStyles.content, { paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.xxl }]}
        refreshControl={<RefreshControl refreshing={sessionQuery.isRefetching || homeQuery.isRefetching} onRefresh={() => void refresh()} tintColor={wgColor.orange} colors={[wgColor.orange]} />}
      >
        <ScreenHeader eyebrow={`OVERVIEW · ${storeName.toUpperCase()} · ${home.periodLabel.toUpperCase()}`} title={manager ? "My Store" : `Welcome${session.name ? `, ${session.name.split(" ")[0]}` : ""}`} right={<IconButton icon="refresh-cw" label="Refresh dashboard" onPress={() => void refresh()} />} />
        {session.supportMode ? <Notice text="Urso support mode is active. The server is enforcing platform-admin access for this workspace." /> : null}
        {home.source === "pending" ? <Notice tone="pending" text={home.sourceNotice ?? "Source data is still syncing. Figures will appear when the source is ready."} /> : null}
        {home.source === "unavailable" ? <Notice tone="error" text={home.sourceNotice ?? "Source data is unavailable. Pull down to retry."} /> : null}

        <View style={wgStyles.controls}>
          <Pressable accessibilityRole="button" accessibilityLabel="Change store" onPress={() => setSelectedStore(nextStore(session, activeStore))} style={({ pressed }) => [wgStyles.control, pressed && { opacity: 0.72 }]}>
            <Text style={wgStyles.controlLabel}>Store</Text><Text style={wgStyles.controlValue} numberOfLines={1}>{storeName}</Text>
          </Pressable>
          <View style={wgStyles.control}>
            <Text style={wgStyles.controlLabel}>Period</Text>
            <View style={styles.periodRow}>
              <Pressable accessibilityRole="button" accessibilityLabel="Show previous month" onPress={() => setMonth(shiftMonth(month, -1))} style={({ pressed }) => [styles.periodStep, pressed && styles.pressed]}>
                <Feather name="chevron-left" size={18} color={wgColor.orange} />
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Return to current month" onPress={() => setMonth(currentMonth)} style={({ pressed }) => [styles.periodLabel, pressed && styles.pressed]}>
                <Text style={wgStyles.controlValue} numberOfLines={1}>{home.periodLabel}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Show next month" accessibilityState={{ disabled: month >= currentMonth }} disabled={month >= currentMonth} onPress={() => setMonth(shiftMonth(month, 1))} style={({ pressed }) => [styles.periodStep, month >= currentMonth && styles.disabled, pressed && month < currentMonth && styles.pressed]}>
                <Feather name="chevron-right" size={18} color={wgColor.orange} />
              </Pressable>
            </View>
          </View>
        </View>

        {manager && home.focus ? <View style={wgStyles.primary}><Feather name="target" size={18} color={wgColor.bg} /><Text style={wgStyles.primaryText}> {home.focus}</Text></View> : null}
        {!manager && home.brief ? <BriefCard {...home.brief} /> : null}
        <Section label={manager ? "Store scorecard" : "Performance overview"}><KpiGrid items={home.kpis} /></Section>
        <Section label="Revenue" action={home.periodLabel}><Trend points={home.trend} total={home.headlineRevenue} delta={home.headlineRevenueChange} /></Section>
        {manager ? (
          <>
            <Section label="Team"><RankingList items={home.team} empty="No team scorecard is available for this period." /></Section>
            <Section label="Watchlist"><ActionList items={home.watchlist} empty="Nothing is waiting on your store right now." /></Section>
          </>
        ) : (
          <>
            <Section label="Top action"><ActionList items={home.actions} empty="No action needs attention right now." /></Section>
            <View style={styles.feedGrid}><FeedCard kind="calls" data={home.calls} /><FeedCard kind="web" data={home.web} /></View>
            <Section label="Store performance" action="COMPARE"><StorePerformance items={home.stores} /></Section>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  feedGrid: { gap: space.sm },
  periodRow: { flexDirection: "row", alignItems: "center", marginHorizontal: -space.sm },
  periodStep: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  periodLabel: { minHeight: 44, flex: 1, alignItems: "center", justifyContent: "center" },
  disabled: { opacity: 0.3 },
  pressed: { opacity: 0.68 },
});
