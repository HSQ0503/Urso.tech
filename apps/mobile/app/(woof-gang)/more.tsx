import { useQuery } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { signOutPlatform } from "@/platform/session";
import { queryClient } from "@/query";
import { font, HIT, radius, space, type } from "@/theme";
import { woofGangApi } from "@/workspaces/woof-gang/api";
import { Notice, ScreenHeader, wgColor, wgStyles } from "@/workspaces/woof-gang/ui";

export default function WoofGangMore(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const sessionQuery = useQuery({ queryKey: ["wg", "session"], queryFn: woofGangApi.session, staleTime: 60_000 });
  if (sessionQuery.isLoading) return <View style={wgStyles.centre}><ActivityIndicator color={wgColor.mint} size="large" /></View>;
  if (sessionQuery.isError || !sessionQuery.data) {
    return (
      <View style={wgStyles.centre}>
        <Notice tone="error" text="Workspace details could not be loaded. You can sign out and reconnect the account." />
        <View style={{ height: space.md }} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sign out of Urso"
          onPress={() => {
            void signOutPlatform().then(() => {
              queryClient.clear();
              router.replace("/login");
            });
          }}
          style={({ pressed }) => [styles.signOut, styles.errorSignOut, pressed && styles.pressed]}
        >
          <Feather name="log-out" size={18} color={wgColor.red} />
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </View>
    );
  }
  const session = sessionQuery.data;
  return (
    <View style={wgStyles.screen}>
      <ScrollView contentContainerStyle={[wgStyles.content, { paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.xxl }]}>
        <ScreenHeader eyebrow="WOOF GANG BAKERY" title="Workspace" />
        <View style={styles.profile}>
          <View style={styles.avatar}><Feather name="user" size={22} color={wgColor.mint} /></View>
          <View style={{ flex: 1 }}><Text style={styles.name}>{session.name ?? "Woof Gang member"}</Text><Text style={styles.role}>{session.role === "manager" ? "Store manager" : "Owner"}</Text></View>
        </View>
        {session.supportMode ? <Notice text="Urso support mode is active. It is a temporary verified support session, not a Woof Gang account." /> : null}
        <View style={styles.card}>
          <Text style={styles.label}>AVAILABLE STORES</Text>
          {session.stores.length ? session.stores.map((store, index) => <View key={store.id} style={[styles.store, index > 0 && styles.divided]}><Text style={styles.storeName}>{store.name}</Text>{store.id === session.defaultStoreId ? <Text style={styles.default}>DEFAULT</Text> : null}</View>) : <Text style={styles.empty}>No stores are assigned to this session.</Text>}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sign out of Urso"
          onPress={() => {
            void signOutPlatform().then(() => {
              queryClient.clear();
              router.replace("/login");
            });
          }}
          style={({ pressed }) => [styles.signOut, pressed && styles.pressed]}
        >
          <Feather name="log-out" size={18} color={wgColor.red} />
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  profile: { minHeight: 82, borderRadius: radius.lg, backgroundColor: wgColor.surface, borderColor: wgColor.line, borderWidth: 1, padding: space.md, flexDirection: "row", alignItems: "center", gap: space.md },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: wgColor.mintDeep, alignItems: "center", justifyContent: "center" },
  name: { color: wgColor.ink, fontFamily: font.bodySemi, fontSize: 17 },
  role: { color: wgColor.muted, ...type.small, marginTop: 2 },
  card: { borderRadius: radius.lg, overflow: "hidden", backgroundColor: wgColor.surface, borderColor: wgColor.line, borderWidth: 1 },
  label: { color: wgColor.mint, ...type.micro, padding: space.md },
  store: { minHeight: 54, paddingHorizontal: space.md, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  divided: { borderTopColor: wgColor.line, borderTopWidth: StyleSheet.hairlineWidth },
  storeName: { color: wgColor.ink, ...type.body },
  default: { color: wgColor.mint, ...type.micro },
  empty: { padding: space.md, color: wgColor.muted, ...type.body },
  signOut: { minHeight: HIT, borderRadius: radius.md, borderWidth: 1, borderColor: "rgba(243,141,136,0.3)", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.sm },
  signOutText: { color: wgColor.red, fontFamily: font.bodySemi, fontSize: 15 },
  errorSignOut: { alignSelf: "stretch", paddingHorizontal: space.lg },
  pressed: { opacity: 0.72 },
});
