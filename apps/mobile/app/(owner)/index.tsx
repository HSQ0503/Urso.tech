// Home — the launcher.
//
// Sebastian is migrating off Markate, and Markate's home is not a dashboard: it
// is a bar, an announcement strip, a greeting with a money line, and a
// two-column grid of icon tiles with a count in the corner of whatever needs
// him. He opens that screen dozens of times a day and his hands already know
// where every tile is, so this screen keeps their geometry — same two columns,
// same five rows, same slot order, same badge corner — and changes only what
// the slots point at and what colour they are.
//
// One Markate tile has no Urso surface behind it: Route Planner is not a thing
// we do (per Han, 2026-08-04), and its top-right slot goes to Inbox, which on
// their build is only a header icon. Every other tile now points at its real
// equivalent — including Work Orders, which is their word for jobs and got a
// list of its own once GET /canes/jobs existed.
//
// The action queue this screen USED to be did not disappear — it is the
// Dashboard tile, which is exactly where Markate keeps theirs. See
// app/(owner)/dashboard.tsx.
//
// Every time is America/New_York via fmtEt. The device clock is never read.

import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fmtMoney, type Thread } from "@urso/types";
import { Notice } from "@/components/notice";
import {
  Announcement,
  LauncherBar,
  LauncherGreeting,
  SupportRow,
  TileGrid,
  launcherBody,
  type LauncherTile,
} from "@/components/launcher";
import { useOverview, useThreads } from "@/queries";
import { noticeFrom, usePullToRefresh, useRefetchOnFocus } from "@/query";
import { getAdminProfile } from "@/session";
import { color, space } from "@/theme";

// The inbox's own definition of "waiting on you", reused verbatim rather than
// re-derived: a vendor thread's newest event is always inbound, so counting it
// would leave a permanent badge on the bar that never clears.
function isWaiting(thread: Thread): boolean {
  return thread.unread && thread.kind !== "vendor";
}

function firstNameOf(full: string | null): string | null {
  const first = (full ?? "").trim().split(/\s+/)[0];
  return first ? first : null;
}

export default function HomeScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void getAdminProfile().then((profile) => {
      if (live) setName(firstNameOf(profile?.name ?? null));
    });
    return () => {
      live = false;
    };
  }, []);

  const overviewQuery = useOverview();
  // Shares the cache the Inbox tab already fills, so opening home does not cost
  // a second round trip once either screen has been visited.
  const threadsQuery = useThreads();
  useRefetchOnFocus(overviewQuery.refetch);
  useRefetchOnFocus(threadsQuery.refetch);
  const { refreshing, onRefresh } = usePullToRefresh(() =>
    Promise.all([overviewQuery.refetch(), threadsQuery.refetch()]),
  );

  const overview = overviewQuery.data ?? null;
  const threads = threadsQuery.data ?? null;

  // A refusal on one read must not blank the other — a permission-refused
  // overview still leaves a perfectly usable grid, so the notice explains the
  // missing counts and the tiles stay tappable.
  const notice = noticeFrom(overviewQuery.error) ?? noticeFrom(threadsQuery.error);

  const unread = useMemo(
    () => (threads ?? []).filter(isWaiting).length,
    [threads],
  );

  // What the Dashboard tile and the bar's checklist both count: the four
  // queues the action screen is built from.
  const needs =
    (overview?.coldNeedingCall.length ?? 0) +
    (overview?.unconfirmedToday.length ?? 0) +
    (overview?.pastDueVisits.length ?? 0) +
    (overview?.followUpsDue.length ?? 0);

  const cold = overview?.coldNeedingCall.length ?? 0;
  const overdue = overview?.pipeline.invoices.overdueCount ?? 0;

  // Markate's slot order, kept: only their Route Planner slot differs, and it
  // holds Inbox. Everything else sits exactly where his thumb already expects it.
  const tiles: LauncherTile[] = [
    {
      key: "dashboard",
      label: "Dashboard",
      icon: "activity",
      count: needs,
      tone: cold > 0 ? "danger" : "brand",
      onPress: () => router.push("/(owner)/dashboard"),
    },
    {
      key: "inbox",
      label: "Inbox",
      icon: "message-square",
      count: unread,
      onPress: () => router.push("/(owner)/inbox"),
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
      count: overview?.pipeline.jobs.unscheduledCount,
      onPress: () => router.push("/(owner)/schedule"),
    },
    // Markate's eighth slot IS Work Orders. It was standing in as Insights only
    // because Urso had no jobs list; now that /canes/jobs exists the grid is
    // back to their real layout, and Insights keeps its row in More.
    {
      key: "jobs",
      label: "Work orders",
      icon: "briefcase",
      count: overview?.pipeline.jobs.activeCount,
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
  const showSpinner = overviewQuery.isPending && overviewQuery.errorUpdateCount === 0;

  return (
    <View style={styles.screen}>
      <LauncherBar
        onMenu={() => router.push("/(owner)/more")}
        actions={[
          {
            key: "inbox",
            icon: "message-square",
            label: "Inbox",
            count: unread,
            onPress: () => router.push("/(owner)/inbox"),
          },
          {
            key: "queue",
            icon: "check-square",
            label: "Needs you now",
            count: needs,
            onPress: () => router.push("/(owner)/dashboard"),
          },
        ]}
      />

      {showSpinner ? (
        <View style={styles.centre}>
          <ActivityIndicator color={color.brand} size="large" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[launcherBody, { paddingBottom: insets.bottom + space.xl }]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={color.brand}
              colors={[color.brand]}
            />
          }
        >
          {/* Markate sells product news in this strip. It is the most looked-at
              band on the screen, so it carries the one thing that actually
              needs him — and reads as an all-clear when nothing does, because a
              strip that looks the same either way stops being read. */}
          {cold > 0 ? (
            <Announcement
              icon="phone-call"
              title={`Call ${cold} lead${cold === 1 ? "" : "s"} now`}
              detail="Speed to lead is what wins the job."
              onPress={() => router.push("/(owner)/dashboard")}
            />
          ) : needs > 0 ? (
            <Announcement
              icon="bell"
              title={`${needs} thing${needs === 1 ? "" : "s"} need you`}
              detail="Tap to work the queue."
              onPress={() => router.push("/(owner)/dashboard")}
            />
          ) : (
            <Announcement
              icon="check-circle"
              title="You're all caught up"
              detail="Nothing is waiting on you right now."
              tone="good"
            />
          )}

          <LauncherGreeting
            name={name ?? "there"}
            money={fmtMoney(overview?.money.collectedThisWeekCents ?? 0)}
            detail={`collected this week · ${overview?.todayAgenda.length ?? 0} today`}
          />

          {notice !== null ? <Notice text={notice} /> : null}

          <TileGrid tiles={tiles} />

          <SupportRow onPress={() => router.push("/(owner)/more")} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  centre: { flex: 1, alignItems: "center", justifyContent: "center" },
});
