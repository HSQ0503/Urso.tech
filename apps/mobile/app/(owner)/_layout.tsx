import { StyleSheet } from "react-native";
import { Tabs } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { color, font } from "@/theme";

// The owner console's shell.
//
// FOUR tabs, chosen from what Sebastian actually does rather than from what the
// web console happens to have pages for. His day is: catch a new lead fast,
// put it on the calendar, answer messages. Everything else — estimates,
// invoices, customers, the money pages — is real work but not hourly work, so
// it lives behind More instead of eating a tab.
//
// The web sidebar has eleven destinations. Reproducing that as a scrolling tab
// bar would be faithful and useless; a phone gets the daily loop and a door to
// the rest.

export default function OwnerLayout(): React.ReactElement {
  return (
    <Tabs
      // The detail screens (lead/job/customer) are hidden tabs, and a tab
      // navigator's default backBehavior is firstRoute — so back from a job
      // opened off the Schedule jumped to Today, severing the exact
      // job → customer → job graph this app is organised around. "history"
      // makes back return to the screen that opened this one.
      backBehavior="history"
      screenOptions={{
        headerShown: false, // every screen draws its own black chrome header
        tabBarActiveTintColor: color.brand,
        tabBarInactiveTintColor: color.faint,
        tabBarStyle: {
          backgroundColor: color.surface,
          borderTopColor: color.line,
          borderTopWidth: StyleSheet.hairlineWidth,
        },
        tabBarLabelStyle: {
          fontFamily: font.bodyMedium,
          fontSize: 11,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Today",
          tabBarIcon: ({ color: c, size }) => <Feather name="sun" size={size} color={c} />,
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
        name="inbox"
        options={{
          title: "Inbox",
          tabBarIcon: ({ color: c, size }) => (
            <Feather name="message-square" size={size} color={c} />
          ),
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
          the four things this app is actually organised around. */}
      <Tabs.Screen name="leads" options={{ href: null }} />
      <Tabs.Screen name="customers" options={{ href: null }} />
      <Tabs.Screen name="lead/[id]" options={{ href: null }} />
      <Tabs.Screen name="job/[id]" options={{ href: null }} />
      <Tabs.Screen name="customer/[id]" options={{ href: null }} />
      <Tabs.Screen name="invoices" options={{ href: null }} />
      <Tabs.Screen name="invoice/[id]" options={{ href: null }} />
      <Tabs.Screen name="estimates" options={{ href: null }} />
      <Tabs.Screen name="estimate/[id]" options={{ href: null }} />
      <Tabs.Screen name="thread/[phone]" options={{ href: null }} />
    </Tabs>
  );
}
