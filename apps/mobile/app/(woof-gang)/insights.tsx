import { useQuery } from "@tanstack/react-query";
import { ActivityIndicator, RefreshControl, ScrollView, View } from "react-native";
import { useCallback } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { space } from "@/theme";
import { WgApiError, woofGangApi } from "@/workspaces/woof-gang/api";
import { currentEasternMonth } from "@/workspaces/woof-gang/period";
import { ActionList, Notice, RankingList, ScreenHeader, Section, Trend, wgColor, wgStyles } from "@/workspaces/woof-gang/ui";

export default function InsightsScreen(): React.ReactElement {
  const insets = useSafeAreaInsets();
  const month = currentEasternMonth();
  const sessionQuery = useQuery({ queryKey: ["wg", "session"], queryFn: woofGangApi.session, staleTime: 60_000 });
  const homeQuery = useQuery({
    queryKey: ["wg", "insights", month],
    queryFn: () => woofGangApi.home(sessionQuery.data?.defaultStoreId ?? null, month),
    enabled: sessionQuery.isSuccess,
  });
  const refresh = useCallback(async () => { await Promise.all([sessionQuery.refetch(), homeQuery.refetch()]); }, [homeQuery, sessionQuery]);
  if (sessionQuery.isLoading || homeQuery.isLoading) return <View style={wgStyles.centre}><ActivityIndicator color={wgColor.mint} size="large" /></View>;
  const error = sessionQuery.error ?? homeQuery.error;
  if (error) return <View style={wgStyles.centre}><Notice tone="error" text={error instanceof WgApiError ? error.message : "Insights could not be loaded."} /></View>;
  const home = homeQuery.data;
  if (!home) return <View style={wgStyles.centre}><Notice text="No insight data is available yet." /></View>;
  return (
    <View style={wgStyles.screen}>
      <ScrollView contentContainerStyle={[wgStyles.content, { paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.xxl }]} refreshControl={<RefreshControl refreshing={sessionQuery.isRefetching || homeQuery.isRefetching} onRefresh={() => void refresh()} tintColor={wgColor.mint} colors={[wgColor.mint]} />}>
        <ScreenHeader eyebrow="WOOF GANG BAKERY" title="Insights" />
        {home.source !== "ready" ? <Notice tone={home.source === "pending" ? "pending" : "error"} text={home.sourceNotice ?? "Source data is not ready yet."} /> : null}
        <Section label="Revenue trend" action={home.periodLabel}><Trend points={home.trend} /></Section>
        <Section label="Store comparison"><RankingList rank items={home.rankings} empty="Comparison data has not been published for this period." /></Section>
        <Section label="Patterns to watch"><ActionList items={home.actions} empty="No source-backed patterns have been flagged." /></Section>
      </ScrollView>
    </View>
  );
}
