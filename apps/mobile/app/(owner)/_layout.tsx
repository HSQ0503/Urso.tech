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
    </Tabs>
  );
}
