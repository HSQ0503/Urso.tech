import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { WebView, type WebViewNavigation } from "react-native-webview";
import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { API_BASE, owner, SessionExpiredError } from "@/api";
import { Notice } from "@/components/notice";
import { color, HIT, space, type } from "@/theme";

// The WebView tail (O3). Six console surfaces have no native screen and are not
// going to get one: Insights, Payouts, Expenses, Settings, the estimate builder
// and the catalog are ~30k lines of web UI whose value is the UI itself
// (recharts has no React Native equivalent, and the builder is the densest form
// in the product). Rebuilding them would dwarf every native screen combined for
// no gain the owner can see.
//
// So they are hosted here, inside the native stack with the app's own chrome —
// not handed to Safari. Sign-in is the single-use bridge in
// lib/canes/webview-handoff.ts: the app asks for a URL, the server mints a
// 60-second ticket, and redeeming it sets the ordinary session cookie inside
// this WebView's own cookie jar. The ticket is fetched fresh on every mount
// because it is spent the moment the page loads — there is nothing to cache and
// nothing worth keeping.

const SURFACES = {
  insights: { title: "Insights", to: "/CanesPressure/insights" },
  payouts: { title: "Payouts", to: "/CanesPressure/payouts" },
  expenses: { title: "Expenses", to: "/CanesPressure/expenses" },
  settings: { title: "Settings", to: "/CanesPressure/settings" },
  catalog: { title: "Price list", to: "/CanesPressure/estimates/items" },
} as const;

export type SurfaceKey = keyof typeof SURFACES;

export function isSurfaceKey(value: string): value is SurfaceKey {
  return Object.hasOwn(SURFACES, value);
}

export default function WebSurfaceScreen(): React.ReactElement {
  const { surface, to: toParam } = useLocalSearchParams<{ surface: string; to?: string }>();
  const insets = useSafeAreaInsets();
  const webRef = useRef<WebView>(null);

  const known = isSurfaceKey(surface) ? SURFACES[surface] : null;
  // `to` lets a caller open a SPECIFIC record (an estimate's builder) on a
  // known surface. The server whitelists it regardless — this is a convenience,
  // never the authority on where a session may land.
  const target = toParam ?? known?.to ?? null;
  const title = known?.title ?? "Console";

  const [url, setUrl] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [canGoBack, setCanGoBack] = useState(false);

  const load = useCallback(async () => {
    if (target === null) {
      setNotice("That page isn't available here.");
      setLoading(false);
      return;
    }
    setNotice(null);
    setLoading(true);
    try {
      const result = await owner.webviewUrl(target);
      if (result.ok) setUrl(result.data.url);
      else {
        setNotice(result.notice);
        setLoading(false);
      }
    } catch (error) {
      if (error instanceof SessionExpiredError) {
        router.replace("/login");
        return;
      }
      setNotice("Something went wrong. Try again.");
      setLoading(false);
    }
  }, [target]);

  // Mount only, and deliberately NOT on focus: a ticket is spent the moment
  // the page loads, so refetching on every return would mint a fresh one for a
  // WebView that is already signed in and showing the page.
  useEffect(() => {
    void load();
  }, [load]);

  // Back inside the site walks the WebView's history; at the first page it
  // leaves the surface. Without this, a tap into a settings sub-page would trap
  // the reader with no way back but the tab bar.
  const goBack = () => {
    if (canGoBack) webRef.current?.goBack();
    else router.back();
  };

  const onNavigationStateChange = (nav: WebViewNavigation) => {
    setCanGoBack(nav.canGoBack);
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.chrome, { paddingTop: insets.top + space.sm }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={goBack}
          hitSlop={space.sm}
          style={({ pressed }) => [styles.back, pressed && styles.backPressed]}
        >
          <Feather name="chevron-left" size={22} color={color.chromeInk} />
        </Pressable>
        <Text style={styles.chromeTitle}>{title}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Reload"
          onPress={() => void load()}
          hitSlop={space.sm}
          style={({ pressed }) => [styles.back, pressed && styles.backPressed]}
        >
          <Feather name="rotate-cw" size={18} color={color.chromeMuted} />
        </Pressable>
      </View>

      {notice !== null ? (
        <View style={styles.noticeWrap}>
          <Notice text={notice} />
          <Pressable
            accessibilityRole="button"
            onPress={() => void load()}
            style={({ pressed }) => [styles.button, pressed && styles.pressed]}
          >
            <Text style={styles.buttonText}>Try again</Text>
          </Pressable>
        </View>
      ) : null}

      {url !== null ? (
        <WebView
          ref={webRef}
          source={{ uri: url }}
          onNavigationStateChange={onNavigationStateChange}
          onLoadEnd={() => setLoading(false)}
          onError={() => {
            setLoading(false);
            setNotice("That page didn't load. Try again.");
          }}
          // The session cookie is set by the redeem redirect, so the jar must
          // persist across this WebView's own navigations.
          sharedCookiesEnabled
          thirdPartyCookiesEnabled={false}
          // The console is a full web app; it needs its own scrolling and
          // JavaScript. Nothing here is user-supplied content.
          javaScriptEnabled
          domStorageEnabled
          // Keep navigation inside the console. An external link (a Square
          // hosted page, a review URL) belongs in the system browser, not in a
          // frame carrying our session cookie.
          onShouldStartLoadWithRequest={(request) => request.url.startsWith(API_BASE)}
          style={styles.web}
        />
      ) : null}

      {loading ? (
        <View style={styles.centre} pointerEvents="none">
          <ActivityIndicator color={color.brand} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  centre: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
  },

  chrome: {
    backgroundColor: color.chrome,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingBottom: space.sm,
  },
  back: {
    minWidth: HIT,
    minHeight: HIT,
    alignItems: "center",
    justifyContent: "center",
  },
  backPressed: { opacity: 0.6 },
  chromeTitle: { ...type.title, color: color.chromeInk, flex: 1 },

  web: { flex: 1, backgroundColor: color.bg },

  noticeWrap: { padding: space.lg, gap: space.sm },
  button: {
    minHeight: HIT,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.lineStrong,
    borderRadius: 5,
    backgroundColor: color.surface,
  },
  buttonText: { ...type.body, color: color.ink },
  pressed: { backgroundColor: color.hover },
});
