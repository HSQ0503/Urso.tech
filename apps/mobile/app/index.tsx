import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { detectWorkspaceSession, platformConfigured } from "@/platform/session";
import { workspaceHref } from "@/platform/types";
import { checkEtSupport } from "@/intl-guard";
import { color, radius, space, type } from "@/theme";

// The launch gate. It decides between the owner console, the crew stack and
// login before any of them is visible, because someone who sees the login screen
// blink past on every cold start stops trusting that they are actually signed in.
//
// Every configured client is checked directly. We do not feed the crew check
// through the shared Canes API client because its generic bearer fallback can
// let an unrelated/stale admin token shadow a real crew session.

export default function Index(): React.ReactElement {
  const router = useRouter();
  const configured = platformConfigured();
  // Proven once at launch, not assumed. Hermes gets its timezone data from the
  // platform, and a build without it renders every job time in the device's own
  // zone instead of the shop's. Wrong times sent a crew to the wrong place is
  // worse than an honest stop.
  const et = checkEtSupport();

  useEffect(() => {
    if (!configured || !et.ok) return;
    let cancelled = false;

    void (async () => {
      try {
        const session = await detectWorkspaceSession();
        if (cancelled) return;
        router.replace(session ? workspaceHref(session.workspace) : "/login");
      } catch {
        // SessionExpiredError, or anything else this early: send them to login.
        if (cancelled) return;
        router.replace("/login");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [configured, et.ok, router]);

  if (!configured) {
    return (
      <View style={styles.screen}>
        <View style={styles.card}>
          <Text style={styles.title}>Setup needed</Text>
          <Text style={styles.body}>
            This copy of the app doesn’t know which account to connect to yet, so there is nothing
            to sign in to.
          </Text>
          <Text style={styles.body}>
            Whoever set the app up needs to fill in apps/mobile/.env.local and start it again.
          </Text>
        </View>
      </View>
    );
  }

  if (!et.ok) {
    return (
      <View style={styles.screen}>
        <View style={styles.card}>
          <Text style={styles.title}>Times can’t be shown correctly</Text>
          <Text style={styles.body}>
            This phone isn’t showing Eastern time properly, so job times would be wrong. Rather than
            risk sending you to a job at the wrong hour, the app has stopped here.
          </Text>
          <Text style={styles.body}>Send this to Urso: {et.detail}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ActivityIndicator color={color.brand} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: color.bg,
    padding: space.xl,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: color.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
    borderRadius: radius.lg,
    padding: space.lg,
  },
  title: {
    ...type.title,
    color: color.ink,
  },
  body: {
    ...type.small,
    color: color.muted,
    marginTop: space.sm,
  },
});
