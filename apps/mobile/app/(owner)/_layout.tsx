import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Tabs, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { validateCanesSession } from "@/platform/session";
import { SupportGate } from "@/platform/support-lock";
import { color, font } from "@/theme";

// The owner console's shell.
//
// The same five-task loop as the responsive website. Keeping the order and
// labels identical matters more than inventing a separate app information
// architecture: Sebastian should never have to remember which surface he is in.

export default function OwnerLayout(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [supportMode, setSupportMode] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void validateCanesSession().then((session) => {
      if (cancelled) return;
      if (!session) {
        router.replace("/login");
        return;
      }
      setSupportMode(session.workspace === "admin");
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (supportMode === null) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: color.bg }}>
        <ActivityIndicator color={color.brand} />
      </View>
    );
  }

  return (
    <SupportGate required={supportMode}>
      <Tabs
      // The detail screens (lead/job/customer) are hidden tabs, and a tab
      // navigator's default backBehavior is firstRoute — so back from a job
      // opened off the Schedule jumped to Today, severing the exact
      // job → customer → job graph this app is organised around. "history"
      // makes back return to the screen that opened this one.
      backBehavior="history"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: color.brand,
        tabBarInactiveTintColor: color.faint,
        tabBarStyle: {
          backgroundColor: color.surface,
          borderTopColor: color.line,
          borderTopWidth: StyleSheet.hairlineWidth,
          // The bottom inset lives inside an explicit tab-bar height. A 58pt
          // total left only ~24pt for the icon and label on Face ID phones.
          height: 56 + insets.bottom,
          paddingTop: 5,
          paddingBottom: insets.bottom,
        },
        tabBarItemStyle: { paddingVertical: 2 },
        tabBarLabelStyle: {
          fontFamily: font.bodyMedium,
          fontSize: 11,
        },
      }}
    >
      {/* "Home", not "Today" — index is the Markate-shaped launcher now, and the
          action queue it used to be lives behind the Dashboard tile. Calling a
          grid of doors "Today" was the label lying about the screen. */}
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color: c, size }) => <Feather name="grid" size={size} color={c} />,
        }}
      />
      <Tabs.Screen
        name="inbox"
        options={{
          title: "Inbox",
          tabBarIcon: ({ color: c, size }) => (
            <Feather name="message-square" size={size} color={c} />
          ),
        }}
      />
      <Tabs.Screen
        name="leads"
        options={{
          title: "Leads",
          tabBarIcon: ({ color: c, size }) => <Feather name="filter" size={size} color={c} />,
        }}
      />
      <Tabs.Screen
        name="schedule"
        options={{
          title: "Schedule",
          tabBarIcon: ({ color: c, size }) => <Feather name="calendar" size={size} color={c} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: "More",
          tabBarIcon: ({ color: c, size }) => <Feather name="menu" size={size} color={c} />,
        }}
      />

      {/* Reached from More, never from the tab bar. Tabs renders EVERY route in
          the group as a tab unless told otherwise, which put seven items down
          there — including "lead/[id]", a detail route with no meaning as a
          destination. href:null keeps them navigable while leaving the bar at
          the five things this app is organised around. */}
      <Tabs.Screen name="dashboard" options={{ href: null }} />
      <Tabs.Screen name="jobs" options={{ href: null }} />
      <Tabs.Screen name="customers" options={{ href: null }} />
      <Tabs.Screen name="lead/[id]" options={{ href: null }} />
      <Tabs.Screen name="lead/new" options={{ href: null }} />
      <Tabs.Screen name="job/[id]" options={{ href: null }} />
      <Tabs.Screen name="job/new" options={{ href: null }} />
      <Tabs.Screen name="customer/[id]" options={{ href: null }} />
      <Tabs.Screen name="customer/new" options={{ href: null }} />
      <Tabs.Screen name="invoices" options={{ href: null, tabBarStyle: { display: "none" } }} />
      <Tabs.Screen name="invoice/[id]" options={{ href: null, tabBarStyle: { display: "none" } }} />
      <Tabs.Screen name="invoice/new" options={{ href: null, tabBarStyle: { display: "none" } }} />
      <Tabs.Screen name="estimates" options={{ href: null, tabBarStyle: { display: "none" } }} />
      <Tabs.Screen name="estimate/[id]" options={{ href: null, tabBarStyle: { display: "none" } }} />
      <Tabs.Screen name="estimate/new" options={{ href: null, tabBarStyle: { display: "none" } }} />
      <Tabs.Screen name="thread/[phone]" options={{ href: null }} />
      <Tabs.Screen name="estimate/build" options={{ href: null, tabBarStyle: { display: "none" } }} />
      <Tabs.Screen name="invoice/lines" options={{ href: null, tabBarStyle: { display: "none" } }} />
      <Tabs.Screen name="expenses" options={{ href: null }} />
      <Tabs.Screen name="payouts" options={{ href: null }} />
      <Tabs.Screen name="insights" options={{ href: null }} />
      <Tabs.Screen name="catalog" options={{ href: null }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
      </Tabs>
    </SupportGate>
  );
}
