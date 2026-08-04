// The owner's door to everything that isn't the daily loop.
//
// The web sidebar has eleven destinations. Reproducing that as a scrolling tab
// bar would be faithful and useless, so the phone gets the daily loop in the tab
// bar and everything else behind this one row of doors.

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
import { color, radius, space, type } from "@/theme";
import {
  Chevron,
  ChromeBar,
  LedgerBlock,
  Mark,
  Row,
  SectionRule,
  bodyStyle,
} from "@/components/ledger";

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
    <Row first={first} onPress={onPress} accessibilityLabel={label} style={styles.row}>
      <View style={styles.rowInner}>
        <Feather name={icon} size={18} color={color.muted} />
        <Text style={styles.rowLabel}>{label}</Text>
        <Chevron />
      </View>
    </Row>
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
    {
      key: "jobs",
      label: "Work orders",
      icon: "briefcase",
      go: () => router.push("/(owner)/jobs"),
    },
    {
      key: "insights",
      label: "Insights",
      icon: "bar-chart-2",
      go: () => router.push("/(owner)/insights"),
    },
    {
      key: "payouts",
      label: "Payouts",
      icon: "pie-chart",
      go: () => router.push("/(owner)/payouts"),
    },
    {
      key: "expenses",
      label: "Expenses",
      icon: "trending-down",
      go: () => router.push("/(owner)/expenses"),
    },
    {
      key: "catalog",
      label: "Price list",
      icon: "list",
      go: () => router.push("/(owner)/catalog"),
    },
    {
      key: "settings",
      label: "Settings",
      icon: "settings",
      go: () => router.push("/(owner)/settings"),
    },
  ];

  return (
    <View style={styles.screen}>
      <ChromeBar title="More" sub="Canes Pressure · owner" />

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
          <View>
            <SectionRule label="Everything else" />
            <LedgerBlock>
              {destinations.map((destination, index) => (
                <DestinationRow
                  key={destination.key}
                  label={destination.label}
                  icon={destination.icon}
                  first={index === 0}
                  onPress={destination.go}
                />
              ))}
            </LedgerBlock>
          </View>

          <View>
            <SectionRule label="Signed in" />
            <LedgerBlock>
              <View style={styles.identity}>
                {/* The bear on black — the same lockup the chrome carries, at
                    the size a row can hold. */}
                <View style={styles.identityMark}>
                  <Mark size={30} />
                </View>
                <View style={styles.identityBody}>
                  <Text style={styles.name} numberOfLines={1}>
                    {profile?.name ?? "This device"}
                  </Text>
                  <Text style={styles.email} numberOfLines={1}>
                    {profile?.email ?? "No owner account is stored on this phone."}
                  </Text>
                </View>
              </View>

              <Row
                onPress={() => {
                  void handleSignOut();
                }}
                accessibilityLabel="Sign out"
                style={styles.row}
              >
                <View style={styles.rowInner}>
                  <Feather name="log-out" size={18} color={color.danger} />
                  <Text style={[styles.rowLabel, styles.dangerInk]}>Sign out</Text>
                  <Chevron />
                </View>
              </Row>
            </LedgerBlock>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  centre: { flex: 1, alignItems: "center", justifyContent: "center" },

  body: bodyStyle,

  row: { minHeight: 50, paddingVertical: 13, paddingHorizontal: 15, justifyContent: "center" },
  rowInner: { flexDirection: "row", alignItems: "center", gap: 14 },
  rowLabel: { ...type.body, lineHeight: 18, color: color.ink, flex: 1 },
  dangerInk: { color: color.danger },

  identity: { flexDirection: "row", alignItems: "center", gap: 13, padding: 15 },
  identityMark: {
    width: 42,
    height: 42,
    borderRadius: radius.sm,
    backgroundColor: color.chrome,
    alignItems: "center",
    justifyContent: "center",
  },
  identityBody: { flex: 1, minWidth: 0 },
  name: { ...type.title, color: color.ink },
  email: { ...type.small, lineHeight: 17, color: color.muted, marginTop: 4 },
});
