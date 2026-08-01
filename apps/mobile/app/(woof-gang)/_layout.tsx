import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Tabs } from "expo-router";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { SupportGate } from "@/platform/support-lock";
import { font } from "@/theme";
import { woofGangApi } from "@/workspaces/woof-gang/api";
import { wgColor } from "@/workspaces/woof-gang/ui";

export default function WoofGangLayout(): React.ReactElement {
  const sessionQuery = useQuery({
    queryKey: ["wg", "session"],
    queryFn: woofGangApi.session,
    staleTime: 60_000,
  });

  if (sessionQuery.isLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: wgColor.bg }}>
        <ActivityIndicator color={wgColor.orange} />
      </View>
    );
  }

  return (
    <SupportGate required={sessionQuery.data?.supportMode === true}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: wgColor.orange,
          tabBarInactiveTintColor: wgColor.faint,
          tabBarStyle: {
            // This must be opaque. A translucent panel composites over the
            // app root's light Canes canvas inside the iOS safe area, which
            // turns the Woof Gang tab bar white and erases inactive labels.
            backgroundColor: wgColor.bg,
            borderTopColor: wgColor.line,
            borderTopWidth: StyleSheet.hairlineWidth,
          },
          tabBarBackground: () => <View style={[StyleSheet.absoluteFill, { backgroundColor: wgColor.bg }]} pointerEvents="none" />,
          tabBarLabelStyle: { fontFamily: font.bodyMedium, fontSize: 11 },
        }}
      >
        <Tabs.Screen name="index" options={{ title: "Today", tabBarIcon: ({ color, size }) => <Feather name="home" size={size} color={color} /> }} />
        <Tabs.Screen name="insights" options={{ title: "Insights", tabBarIcon: ({ color, size }) => <Feather name="bar-chart-2" size={size} color={color} /> }} />
        <Tabs.Screen name="ai" options={{ title: "urso.ai", tabBarIcon: ({ color, size }) => <Feather name="message-square" size={size} color={color} /> }} />
        <Tabs.Screen name="more" options={{ title: "More", tabBarIcon: ({ color, size }) => <Feather name="menu" size={size} color={color} /> }} />
        <Tabs.Screen name="explore" options={{ href: null }} />
      </Tabs>
    </SupportGate>
  );
}
