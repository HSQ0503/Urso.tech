import { ScrollView, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChromeBar, bodyStyle } from "@/components/ledger";
import { PushNotificationSettings } from "@/components/push-settings";
import { color, space } from "@/theme";

export default function CrewNotificationSettingsScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.screen}>
      <ChromeBar
        title="Notifications"
        sub="Crew schedule and job alerts"
        onBack={() => router.back()}
      />
      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.xxl }]}
        contentInsetAdjustmentBehavior="never"
      >
        <PushNotificationSettings workspace="crew" />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  body: bodyStyle,
});
