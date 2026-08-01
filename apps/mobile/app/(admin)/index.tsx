import * as LocalAuthentication from "expo-local-authentication";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { signOutPlatform } from "@/platform/session";
import { markSupportModeUnlocked } from "@/platform/support-lock";
import { queryClient } from "@/query";
import { font, HIT, radius, space, type } from "@/theme";
import { Notice, ScreenHeader, wgColor, wgStyles } from "@/workspaces/woof-gang/ui";

type Destination = "woof-gang" | "canes";

export default function UrsoControl(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [opening, setOpening] = useState<Destination | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const openWorkspace = useCallback(async (destination: Destination) => {
    setNotice(null);
    setOpening(destination);
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Unlock Urso Control",
        promptDescription: "Verify before opening a client workspace.",
        cancelLabel: "Not now",
        disableDeviceFallback: false,
      });
      if (!result.success) {
        setNotice(result.error === "not_enrolled" ? "Set up Face ID, Touch ID, or a device passcode to open client workspaces." : "Verification was not completed. Client workspaces remain locked.");
        return;
      }
      markSupportModeUnlocked();
      if (destination === "woof-gang") router.push("/(woof-gang)");
      else router.push("/(owner)");
    } finally {
      setOpening(null);
    }
  }, [router]);

  return (
    <View style={wgStyles.screen}>
      <View style={[styles.content, { paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.xxl }]}>
        <ScreenHeader eyebrow="URSO / INTERNAL" title="Control" />
        <View style={styles.hero}>
          <View style={styles.mark}><Text style={styles.markText}>U</Text></View>
          <View style={{ flex: 1 }}><Text style={styles.heroTitle}>Verified support access</Text><Text style={styles.heroCopy}>Choose a client workspace only when you are actively supporting its team.</Text></View>
        </View>
        <Notice text="Support mode uses your verified Urso session. Each workspace rechecks your live admin access and server permissions. This app never carries a client secret." />
        {notice ? <Notice tone="error" text={notice} /> : null}
        <Text style={styles.label}>CLIENT WORKSPACES</Text>
        <WorkspaceButton title="Woof Gang Bakery" detail="Operations analytics · native workspace" icon="activity" loading={opening === "woof-gang"} disabled={opening !== null} onPress={() => void openWorkspace("woof-gang")} />
        <WorkspaceButton title="Canes Pressure" detail="Owner operations · verified access" icon="briefcase" loading={opening === "canes"} disabled={opening !== null} onPress={() => void openWorkspace("canes")} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sign out of Urso Control"
          disabled={opening !== null}
          onPress={() => {
            void signOutPlatform().then(() => {
              queryClient.clear();
              router.replace("/login");
            });
          }}
          style={({ pressed }) => [styles.signOut, pressed && { opacity: 0.72 }]}
        >
          <Feather name="log-out" size={18} color={wgColor.red} />
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </View>
    </View>
  );
}

function WorkspaceButton({ title, detail, icon, loading, disabled, onPress }: { title: string; detail: string; icon: "activity" | "briefcase"; loading: boolean; disabled: boolean; onPress: () => void }): React.ReactElement {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Unlock ${title}`} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.workspace, pressed && !disabled && { opacity: 0.74 }, disabled && styles.disabled]}>
      <View style={styles.workspaceIcon}><Feather name={icon} size={21} color={wgColor.mint} /></View>
      <View style={{ flex: 1 }}><Text style={styles.workspaceTitle}>{title}</Text><Text style={styles.workspaceDetail}>{detail}</Text></View>
      {loading ? <ActivityIndicator color={wgColor.mint} /> : <Feather name="chevron-right" size={20} color={wgColor.mint} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, paddingHorizontal: space.lg, gap: space.md },
  hero: { padding: space.lg, borderRadius: radius.lg, backgroundColor: "#15352a", borderWidth: 1, borderColor: "rgba(120,213,165,0.32)", flexDirection: "row", alignItems: "center", gap: space.md },
  mark: { width: 48, height: 48, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: wgColor.mint },
  markText: { color: wgColor.bg, fontFamily: font.display, fontSize: 27 },
  heroTitle: { color: wgColor.ink, fontFamily: font.bodySemi, fontSize: 17 },
  heroCopy: { color: "#c4d7cf", ...type.small, marginTop: 3 },
  label: { color: wgColor.mint, ...type.micro, marginTop: space.sm },
  workspace: { minHeight: 86, padding: space.md, borderRadius: radius.lg, backgroundColor: wgColor.surface, borderColor: wgColor.line, borderWidth: 1, flexDirection: "row", gap: space.md, alignItems: "center" },
  workspaceIcon: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: wgColor.mintDeep, alignItems: "center", justifyContent: "center" },
  workspaceTitle: { color: wgColor.ink, fontFamily: font.bodySemi, fontSize: 16 },
  workspaceDetail: { color: wgColor.muted, ...type.small, marginTop: 3 },
  disabled: { opacity: 0.6 },
  signOut: { minHeight: HIT, borderRadius: radius.md, borderWidth: 1, borderColor: "rgba(243,141,136,0.3)", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.sm, marginTop: "auto" },
  signOutText: { color: wgColor.red, fontFamily: font.bodySemi, fontSize: 15 },
});
