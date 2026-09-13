// Recurring — the tile Sebastian asked for (2026-09-13) to "keep track of all
// recurring work".
//
// Today this lists the work orders flagged to repeat (jobs.recurrence), which
// is the only recurring signal the system holds. Recurring PLANS — a contract
// with a cadence, a price per visit, auto-generated visits and the 50%
// cancellation term — land in the next slice and take this screen over. The
// list below is truthful about that rather than pretending the flag is a plan.

import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fmtEt, fmtMoney, JOB_STATUS_LABEL, RECURRENCE_LABEL, type Job } from "@urso/types";
import { Avatar, Chevron, Chip, ChromeBar, EmptyState, listRowStyle } from "@/components/ledger";
import { Notice } from "@/components/notice";
import { useJobs } from "@/queries";
import { noticeFrom, usePullToRefresh, useRefetchOnFocus } from "@/query";
import { color, font, radius, space, type } from "@/theme";

function isRepeating(job: Job): boolean {
  return (job.recurrence ?? "none") !== "none" && job.status !== "canceled";
}

export default function RecurringScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const jobsQuery = useJobs();
  useRefetchOnFocus(jobsQuery.refetch);
  const { refreshing, onRefresh } = usePullToRefresh(jobsQuery.refetch);

  const jobs = (jobsQuery.data ?? []).filter(isRepeating);
  const notice = noticeFrom(jobsQuery.error);

  return (
    <View style={styles.screen}>
      <ChromeBar
        title="Recurring"
        sub={jobs.length > 0 ? `${jobs.length} repeating ${jobs.length === 1 ? "work order" : "work orders"}` : "Repeat customers and contracts"}
        onBack={() => router.back()}
      />
      {jobsQuery.isPending ? (
        <View style={styles.centre}>
          <ActivityIndicator color={color.brand} />
        </View>
      ) : (
        <FlatList
          data={jobs}
          keyExtractor={(job) => job.id}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + space.xxl }, jobs.length === 0 && styles.listEmpty]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={color.brand} colors={[color.brand]} />}
          ListHeaderComponent={
            <View style={styles.headerSlot}>
              <Notice text={notice} />
              <View style={styles.plansCard}>
                <Feather name="repeat" size={18} color={color.brandDeep} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.plansTitle}>Recurring plans are coming next</Text>
                  <Text style={styles.plansBody}>
                    Quarterly, twice-a-year, and yearly contracts with a price per visit, visits booked automatically, and a
                    50% cancellation term. Until then, a work order set to repeat shows here.
                  </Text>
                </View>
              </View>
            </View>
          }
          ListEmptyComponent={
            <EmptyState text="No repeating work yet. Open a work order and set how often it repeats, and it shows up here." />
          }
          renderItem={({ item, index }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${item.customer_name ?? "Job"}, ${RECURRENCE_LABEL[item.recurrence ?? "none"]}`}
              onPress={() => router.push({ pathname: "/(owner)/job/[id]", params: { id: item.id } })}
              style={({ pressed }) => [...listRowStyle(index === 0, index === jobs.length - 1), styles.row, pressed && styles.pressed]}
            >
              <Avatar name={item.customer_name ?? "Job"} />
              <View style={styles.rowBody}>
                <View style={styles.rowTop}>
                  <Text style={styles.name} numberOfLines={1}>
                    {item.customer_name ?? item.job_name ?? "Job"}
                  </Text>
                  <Chip label={RECURRENCE_LABEL[item.recurrence ?? "none"]} tone="brand" />
                </View>
                <Text style={styles.sub} numberOfLines={1}>
                  {[item.job_name, item.scheduled_at ? fmtEt(item.scheduled_at, { month: "short", day: "numeric" }) : JOB_STATUS_LABEL[item.status]]
                    .filter(Boolean)
                    .join(" · ")}
                </Text>
              </View>
              <View style={styles.rowEnd}>
                {item.total_cents > 0 ? <Text style={styles.money}>{fmtMoney(item.total_cents)}</Text> : null}
                <Chevron />
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  centre: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { paddingHorizontal: 14, paddingTop: 14 },
  listEmpty: { flexGrow: 1 },
  headerSlot: { gap: space.md, marginBottom: space.md },
  plansCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.sm,
    backgroundColor: color.brandWash,
    borderRadius: radius.md,
    padding: space.md,
  },
  plansTitle: { ...type.body, fontFamily: font.bodySemi, color: color.ink },
  plansBody: { ...type.small, color: color.muted, marginTop: 3 },
  row: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: 11 },
  pressed: { backgroundColor: color.hover },
  rowBody: { flex: 1, minWidth: 0 },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 7 },
  name: { fontFamily: font.bodySemi, fontSize: 16.5, lineHeight: 20, color: color.ink, flexShrink: 1 },
  sub: { ...type.small, lineHeight: 18, color: color.muted, marginTop: 3 },
  rowEnd: { flexDirection: "row", alignItems: "center", gap: 8 },
  money: { fontFamily: font.monoMedium, fontSize: 14, color: color.ink },
});
