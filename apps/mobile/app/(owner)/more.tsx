// The owner's door to everything that isn't the daily loop.
//
// Two destinations today, and that is on purpose: a row that opens nothing is
// worse than no row at all. NEXT SLICE, in the order the web sidebar has them:
// Estimates, Invoices, Insights, Payouts, Settings. Each one gets added here the
// same day its screen lands, never before.

import { useCallback, useEffect, useState, type ComponentProps } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { signOut } from "@/auth";
import { getAdminProfile, type AdminProfile } from "@/session";
import { color, HIT, radius, space, type } from "@/theme";

type IconName = ComponentProps<typeof Feather>["name"];

type Destination = {
  key: string;
  label: string;
  icon: IconName;
  go: () => void;
};

function DestinationRow({
  label,
  icon,
  first,
  onPress,
}: {
  label: string;
  icon: IconName;
  first: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.row, !first && styles.divided, pressed && styles.pressed]}
    >
      <Feather name={icon} size={18} color={color.muted} />
      <Text style={styles.rowLabel}>{label}</Text>
      <Feather name="chevron-right" size={18} color={color.faint} />
    </Pressable>
  );
}

export default function MoreScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setProfile(await getAdminProfile());
  }, []);

  useEffect(() => {
    let live = true;
    void load().finally(() => {
      if (live) setLoading(false);
    });
    return () => {
      live = false;
    };
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load().finally(() => setRefreshing(false));
  }, [load]);

  const handleSignOut = useCallback(async () => {
    await signOut();
    router.replace("/login");
  }, [router]);

  const destinations: Destination[] = [
    {
      key: "leads",
      label: "Leads",
      icon: "user-plus",
      go: () => router.push("/(owner)/leads"),
    },
    {
      key: "customers",
      label: "Customers",
      icon: "users",
      go: () => router.push("/(owner)/customers"),
    },
    {
      key: "estimates",
      label: "Estimates",
      icon: "file-text",
      go: () => router.push("/(owner)/estimates"),
    },
    {
      key: "invoices",
      label: "Invoices",
      icon: "dollar-sign",
      go: () => router.push("/(owner)/invoices"),
    },
    // The WebView tail. These five open the real console inside the app —
    // recharts has no RN equivalent and the price list is a dense form, so
    // rebuilding them natively would cost more than every native screen so far
    // and show the owner nothing new.
    {
      key: "insights",
      label: "Insights",
      icon: "bar-chart-2",
      go: () => router.push({ pathname: "/(owner)/web/[surface]", params: { surface: "insights" } }),
    },
    {
      key: "payouts",
      label: "Payouts",
      icon: "pie-chart",
      go: () => router.push({ pathname: "/(owner)/web/[surface]", params: { surface: "payouts" } }),
    },
    {
      key: "expenses",
      label: "Expenses",
      icon: "trending-down",
      go: () => router.push({ pathname: "/(owner)/web/[surface]", params: { surface: "expenses" } }),
    },
    {
      key: "catalog",
      label: "Price list",
      icon: "list",
      go: () => router.push({ pathname: "/(owner)/web/[surface]", params: { surface: "catalog" } }),
    },
    {
      key: "settings",
      label: "Settings",
      icon: "settings",
      go: () => router.push({ pathname: "/(owner)/web/[surface]", params: { surface: "settings" } }),
    },
  ];

  return (
    <View style={styles.screen}>
      <View style={[styles.chrome, { paddingTop: insets.top + space.md }]}>
        <Text style={styles.chromeTitle}>More</Text>
      </View>

      {loading ? (
        <View style={styles.centre}>
          <ActivityIndicator color={color.brand} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.xxl }]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={color.brand}
              colors={[color.brand]}
            />
          }
        >
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Everything else</Text>
            <View style={styles.card}>
              {destinations.map((destination, index) => (
                <DestinationRow
                  key={destination.key}
                  label={destination.label}
                  icon={destination.icon}
                  first={index === 0}
                  onPress={destination.go}
                />
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Signed in</Text>
            <View style={styles.card}>
              <View style={styles.identity}>
                <Text style={styles.name}>{profile?.name ?? "This device"}</Text>
                <Text style={styles.email}>
                  {profile?.email ?? "No owner account is stored on this phone."}
                </Text>
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Sign out"
                onPress={() => {
                  void handleSignOut();
                }}
                style={({ pressed }) => [styles.row, styles.divided, pressed && styles.pressed]}
              >
                <Feather name="log-out" size={18} color={color.danger} />
                <Text style={[styles.rowLabel, styles.dangerInk]}>Sign out</Text>
                <Feather name="chevron-right" size={18} color={color.faint} />
              </Pressable>
            </View>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  centre: { flex: 1, alignItems: "center", justifyContent: "center" },

  chrome: { backgroundColor: color.chrome, paddingHorizontal: space.lg, paddingBottom: space.md },
  chromeTitle: { ...type.display, color: color.chromeInk },

  body: { padding: space.lg, gap: space.xl },

  section: { gap: space.sm },
  sectionLabel: { ...type.micro, color: color.faint },

  card: {
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
    overflow: "hidden",
  },

  row: {
    minHeight: HIT,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  divided: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line },
  rowLabel: { ...type.body, color: color.ink, flex: 1 },
  pressed: { backgroundColor: color.hover },
  dangerInk: { color: color.danger },

  identity: { paddingHorizontal: space.lg, paddingVertical: space.lg, gap: space.xs },
  name: { ...type.title, color: color.ink },
  email: { ...type.small, color: color.muted },
});
