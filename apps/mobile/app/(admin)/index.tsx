import * as LocalAuthentication from "expo-local-authentication";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { signOutPlatform } from "@/platform/session";
import { markSupportModeUnlocked } from "@/platform/support-lock";
import { queryClient } from "@/query";
import { font, HIT, space, type } from "@/theme";
import { Notice, ScreenHeader, wgColor, wgStyles } from "@/workspaces/woof-gang/ui";

type Destination = "woof-gang" | "canes";

export default function UrsoControl(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [opening, setOpening] = useState<Destination | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const enter = useCallback(
    (destination: Destination) => {
      markSupportModeUnlocked();
      if (destination === "woof-gang") router.push("/(woof-gang)");
      else router.push("/(owner)");
    },
    [router],
  );

  const openWorkspace = useCallback(
    async (destination: Destination) => {
      setNotice(null);
      setOpening(destination);
      try {
        // DEVELOPMENT BUILDS DO NOT GATE. A simulator cannot satisfy this
        // prompt from inside the app: with a biometric enrolled it wants a face
        // that only the Simulator's own Features menu can supply, and with a
        // passcode set it wants a passcode nobody chose. Both are walls with
        // the developer on the wrong side, and the workaround — driving
        // BiometricKit from the host shell — is not something a person testing
        // their own app should have to know.
        //
        // Nothing is weakened by this. __DEV__ is false in every release and
        // TestFlight build, so the gate ships exactly as written; and a dev
        // build already implies Metro, the dev menu, and the source. The threat
        // this gate answers is someone picking up a PRODUCTION phone, which a
        // development bundle is not.
        //
        // The notice is not decoration: an unexplained skip would look like the
        // gate is broken in production too.
        if (__DEV__) {
          setNotice("Development build — the verification gate is off. It stays on in TestFlight and release builds.");
          enter(destination);
          return;
        }

        // A device that CANNOT authenticate locally cannot be protected by
        // being asked to. No enrolled biometric AND no passcode means the phone
        // is already open to anyone holding it, so this prompt adds nothing —
        // it only locks the operator out of their own tool with no way through,
        // which is exactly what it did on a simulator. `disableDeviceFallback:
        // false` is not the escape hatch it looks like: the passcode fallback
        // only exists if a passcode is set.
        //
        // getEnrolledLevelAsync is the right question, not isEnrolledAsync —
        // the latter is biometrics-only and would send a passcode-protected
        // phone with no Face ID down this path even though it can verify fine.
        const level = await LocalAuthentication.getEnrolledLevelAsync();
        if (level === LocalAuthentication.SecurityLevel.NONE) {
          setNotice(
            "This device has no Face ID, Touch ID or passcode, so it can’t verify you. Opening anyway — set a device passcode to turn the lock back on.",
          );
          enter(destination);
          return;
        }

        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: "Unlock Urso Control",
          promptDescription: "Verify before opening a client workspace.",
          cancelLabel: "Not now",
          disableDeviceFallback: false,
        });
        if (!result.success) {
          // A device that CAN verify and did not is a real refusal — a cancel
          // or a failed match keeps the workspaces locked, as intended.
          setNotice("Verification was not completed. Client workspaces remain locked.");
          return;
        }
        enter(destination);
      } finally {
        setOpening(null);
      }
    },
    [enter],
  );

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
      <View style={styles.workspaceIcon}><Feather name={icon} size={21} color={wgColor.orange} /></View>
      <View style={{ flex: 1 }}><Text style={styles.workspaceTitle}>{title}</Text><Text style={styles.workspaceDetail}>{detail}</Text></View>
      {loading ? <ActivityIndicator color={wgColor.orange} /> : <Feather name="chevron-right" size={20} color={wgColor.orange} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, paddingHorizontal: space.lg, gap: space.md },
  hero: { padding: space.lg, backgroundColor: wgColor.orangeWash, borderWidth: 1, borderColor: wgColor.lineStrong, flexDirection: "row", alignItems: "center", gap: space.md },
  mark: { width: 48, height: 48, alignItems: "center", justifyContent: "center", backgroundColor: wgColor.orange },
  markText: { color: wgColor.bg, fontFamily: font.display, fontSize: 27 },
  heroTitle: { color: wgColor.ink, fontFamily: font.bodySemi, fontSize: 17 },
  heroCopy: { color: wgColor.muted, ...type.small, marginTop: 3 },
  label: { color: wgColor.orange, ...type.micro, marginTop: space.sm },
  workspace: { minHeight: 86, padding: space.md, backgroundColor: wgColor.surface, borderColor: wgColor.line, borderWidth: 1, flexDirection: "row", gap: space.md, alignItems: "center" },
  workspaceIcon: { width: 44, height: 44, backgroundColor: wgColor.orangeSoft, alignItems: "center", justifyContent: "center" },
  workspaceTitle: { color: wgColor.ink, fontFamily: font.bodySemi, fontSize: 16 },
  workspaceDetail: { color: wgColor.muted, ...type.small, marginTop: 3 },
  disabled: { opacity: 0.6 },
  signOut: { minHeight: HIT, borderWidth: 1, borderColor: "rgba(243,141,136,0.3)", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.sm, marginTop: "auto" },
  signOutText: { color: wgColor.red, fontFamily: font.bodySemi, fontSize: 15 },
});
