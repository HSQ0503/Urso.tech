import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { color } from "@/theme";

export default function LegacyInvoiceLinesRedirect(): React.ReactElement {
  const { id } = useLocalSearchParams<{ id?: string }>();

  useEffect(() => {
    if (typeof id === "string") {
      router.replace({ pathname: "/(owner)/invoice/new", params: { id } });
      return;
    }
    router.replace("/(owner)/invoices");
  }, [id]);

  return <View style={styles.screen}><ActivityIndicator color={color.brand} /></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: color.surface },
});
