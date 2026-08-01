import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { validatePlatformAdminSession } from "@/platform/session";
import { wgColor } from "@/workspaces/woof-gang/ui";

export default function AdminLayout(): React.ReactElement {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void validatePlatformAdminSession().then((session) => {
      if (cancelled) return;
      if (!session) {
        router.replace("/login");
        return;
      }
      setAllowed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!allowed) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: wgColor.bg }}>
        <ActivityIndicator color={wgColor.mint} />
      </View>
    );
  }

  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: wgColor.bg } }} />;
}
