import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Pressable,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fmtEt, fmtMoney } from "@urso/types";
import { Notice } from "@/components/notice";
import { PushSetupPrompt } from "@/components/push-settings";
import {
  LauncherBar,
  SupportRow,
  TileGrid,
  launcherBody,
  type LauncherTile,
} from "@/components/launcher";
import { useOverview } from "@/queries";
import { noticeFrom, usePullToRefresh, useRefetchOnFocus } from "@/query";
import { getAdminProfile } from "@/session";
import { color, space, type } from "@/canes-theme";

function firstNameOf(full: string | null): string | null {
  const first = (full ?? "").trim().split(/\s+/)[0];
  return first ? first : null;
}

export default function HomeScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState<string | null>(null);
  const [ownerAccess, setOwnerAccess] = useState(false);

  useEffect(() => {
    let live = true;
    void getAdminProfile().then((profile) => {
      if (live) {
        setName(firstNameOf(profile?.name ?? null));
        setOwnerAccess(Boolean(profile));
      }
    });
    return () => {
      live = false;
    };
  }, []);

  const overviewQuery = useOverview();
  useRefetchOnFocus(overviewQuery.refetch);
  const { refreshing, onRefresh } = usePullToRefresh(overviewQuery.refetch);

  const overview = overviewQuery.data ?? null;

  // A permission-refused overview still leaves a perfectly usable grid, so
  // the notice explains the missing counts and the tiles stay tappable.
  const notice = noticeFrom(overviewQuery.error);

  const overdue = overview?.pipeline.invoices.overdueCount ?? 0;

  // Markate's slot order, kept, with one swap Sebastian asked for (2026-09-13):
  // Inbox already has a tab, so its tile became Recurring — the plans he is
  // moving onto the system. Everything else sits where his thumb expects it.
  const tiles: LauncherTile[] = [
    // Dashboard is revenue only now (2026-09-13), so it carries no queue count.
    {
      key: "money",
      label: "Money",
      icon: "activity",
      onPress: () => router.push("/(owner)/money"),
    },
    {
      key: "recurring",
      label: "Recurring",
      icon: "repeat",
      onPress: () => router.push("/(owner)/service-agreements"),
    },
    {
      key: "expenses",
      label: "Expenses",
      icon: "trending-down",
      onPress: () => router.push("/(owner)/expenses"),
    },
    {
      key: "leads",
      label: "Leads",
      icon: "filter",
      count: overview?.pipeline.leads.newCount,
      onPress: () => router.push("/(owner)/leads"),
    },
    {
      key: "estimates",
      label: "Estimates",
      icon: "file-text",
      count: overview?.pipeline.quotes.awaitingCount,
      onPress: () => router.push("/(owner)/estimates"),
    },
    {
      key: "invoices",
      label: "Invoices",
      icon: "dollar-sign",
      count: overview?.pipeline.invoices.outstandingCount,
      // Red only when something is actually late. An outstanding invoice is
      // normal business; an overdue one is the thing he came to the screen for.
      tone: overdue > 0 ? "danger" : "brand",
      onPress: () => router.push("/(owner)/invoices"),
    },
    {
      key: "schedule",
      label: "Schedule",
      icon: "calendar",
      onPress: () => router.push("/(owner)/schedule"),
    },
    // Markate's eighth slot IS Work Orders. The unscheduled pile lives there now
    // (its default tab), so that is the count the tile carries: sold work
    // nobody has put on a day yet.
    {
      key: "jobs",
      label: "Work orders",
      icon: "briefcase",
      count: overview?.pipeline.jobs.unscheduledCount,
      onPress: () => router.push("/(owner)/jobs"),
    },
    {
      key: "customers",
      label: "Customers",
      icon: "users",
      onPress: () => router.push("/(owner)/customers"),
    },
    {
      key: "more",
      label: "More",
      icon: "more-horizontal",
      onPress: () => router.push("/(owner)/more"),
    },
  ];

  // Cold start only: a no-data refetch resets status to pending in v5, so
  // without the errorUpdateCount check a refused overview would throw this
  // spinner over the whole launcher on every focus.
  const showSpinner =
    overviewQuery.isPending && overviewQuery.errorUpdateCount === 0;

  return (
    <View style={styles.screen}>
      <LauncherBar onMenu={() => router.push("/(owner)/more")} actions={[]} />

      {showSpinner ? (
        <View style={styles.centre}>
          <ActivityIndicator color={color.brand} size="large" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[
            launcherBody,
            { paddingBottom: insets.bottom + space.xl },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={color.brand}
              colors={[color.brand]}
            />
          }
        >
          <View style={{ marginBottom: space.lg }}>
            <Text style={styles.heading}>{name ? `Hi ${name}` : "Home"}</Text>
            <Text style={styles.detail}>
              Today’s work and what needs attention.
            </Text>
          </View>
          <PushSetupPrompt />

          {notice !== null ? <Notice text={notice} /> : null}

          <View style={styles.section}>
            <Text style={styles.heading}>Today’s work</Text>
            {(overview?.todayJobs ?? []).length ? (
              overview?.todayJobs?.map((job) => (
                <Pressable
                  accessibilityRole="button"
                  key={job.id}
                  style={styles.workRow}
                  onPress={() =>
                    router.push({
                      pathname: "/(owner)/job/[id]",
                      params: { id: job.id },
                    })
                  }
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.title}>
                      {job.customer_name ?? "Customer"}
                    </Text>
                    <Text style={styles.detail}>
                      {job.job_name ?? "Service"}
                    </Text>
                  </View>
                  <Text style={styles.detail}>
                    {job.scheduled_at
                      ? fmtEt(job.scheduled_at, {
                          hour: "numeric",
                          minute: "2-digit",
                        })
                      : "Unscheduled"}
                  </Text>
                </Pressable>
              ))
            ) : (
              <Text style={styles.detail}>No work scheduled today.</Text>
            )}
          </View>
          <View style={styles.section}>
            <Text style={styles.heading}>Needs attention</Text>
            <Pressable
              accessibilityRole="button"
              style={styles.workRow}
              onPress={() => router.push("/(owner)/leads")}
            >
              <Text style={styles.title}>New leads</Text>
              <Text style={styles.title}>
                {overview?.pipeline.leads.newCount ?? 0}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              style={styles.workRow}
              onPress={() => router.push("/(owner)/jobs")}
            >
              <Text style={styles.title}>Work to schedule</Text>
              <Text style={styles.title}>
                {overview?.pipeline.jobs.unscheduledCount ?? 0}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              style={styles.workRow}
              onPress={() => router.push("/(owner)/invoices")}
            >
              <Text style={styles.title}>Overdue invoices</Text>
              <Text style={styles.title}>{overdue}</Text>
            </Pressable>
          </View>

          {ownerAccess ? (
            <Pressable
              accessibilityRole="button"
              style={styles.section}
              onPress={() => router.push("/(owner)/money")}
            >
              <Text style={styles.detail}>Collected in the last 7 days</Text>
              <Text style={styles.heading}>
                {fmtMoney(overview?.money.collectedThisWeekCents ?? 0)}
              </Text>
            </Pressable>
          ) : null}

          <TileGrid
            tiles={tiles.filter(
              (tile) =>
                ownerAccess || !["money", "expenses"].includes(tile.key),
            )}
          />

          <SupportRow onPress={() => router.push("/(owner)/more")} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: color.surface,
    borderRadius: 10,
    padding: space.lg,
    gap: space.sm,
    marginBottom: space.lg,
  },
  heading: { ...type.heading, color: color.ink },
  title: { ...type.body, color: color.ink },
  detail: { ...type.small, color: color.muted },
  workRow: {
    minHeight: 56,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: space.md,
    borderTopWidth: 1,
    borderColor: color.line,
    paddingVertical: space.sm,
  },
  screen: { flex: 1, backgroundColor: color.bg },
  centre: { flex: 1, alignItems: "center", justifyContent: "center" },
});
