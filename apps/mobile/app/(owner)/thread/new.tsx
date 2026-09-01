import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fmtPhone, toE164, type CustomerSummary } from "@urso/types";
import {
  Avatar,
  Chevron,
  ChromeBar,
  SearchStrip,
  listRowStyle,
  searchInputStyle,
} from "@/components/ledger";
import { Notice } from "@/components/notice";
import { PhoneInput } from "@/components/phone-input";
import { useCustomers } from "@/queries";
import { noticeFrom, usePullToRefresh, useRefetchOnFocus } from "@/query";
import { color, font, HIT, radius, space, type } from "@/theme";

function matchesCustomer(customer: CustomerSummary, query: string): boolean {
  const text = query.trim().toLowerCase();
  if (!text) return true;
  if (customer.name?.toLowerCase().includes(text)) return true;
  const digits = text.replace(/\D/g, "");
  return digits.length > 0 && (customer.phone ?? "").includes(digits);
}

export default function NewThreadScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const customersQuery = useCustomers();
  useRefetchOnFocus(customersQuery.refetch);
  const { refreshing, onRefresh } = usePullToRefresh(customersQuery.refetch);

  const [phone, setPhone] = useState("");
  const [query, setQuery] = useState("");
  const [phoneNotice, setPhoneNotice] = useState<string | null>(null);

  const customers = useMemo(
    () => (customersQuery.data ?? []).filter((customer) => customer.phone !== null),
    [customersQuery.data],
  );
  const visible = useMemo(
    () => customers.filter((customer) => matchesCustomer(customer, query)),
    [customers, query],
  );

  function openConversation(normalizedPhone: string, customer?: CustomerSummary): void {
    const peerPhone = toE164(normalizedPhone) ?? normalizedPhone;
    router.replace({
      pathname: "/(owner)/thread/[phone]",
      params: {
        phone: peerPhone,
        ...(customer?.name ? { name: customer.name } : {}),
        ...(customer ? { contactId: customer.id } : {}),
      },
    });
  }

  function useNumber(): void {
    const normalized = toE164(phone);
    if (!normalized) {
      setPhoneNotice("Enter a complete 10-digit phone number.");
      return;
    }
    const customer = customers.find((candidate) => candidate.phone === normalized);
    setPhoneNotice(null);
    openConversation(normalized, customer);
  }

  const queryNotice = noticeFrom(customersQuery.error);

  return (
    <View style={styles.screen}>
      <ChromeBar
        title="New chat"
        sub="Choose a customer or enter any mobile number"
        onBack={() => router.back()}
      />

      <FlatList
        data={visible}
        keyExtractor={(customer) => customer.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={[
          styles.list,
          { paddingBottom: insets.bottom + space.xxl },
          visible.length === 0 && styles.listEmpty,
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={color.brand}
            colors={[color.brand]}
          />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.numberCard}>
              <Text style={styles.rule}>New number</Text>
              <Text style={styles.numberCopy}>
                The conversation is created only after the first message sends.
              </Text>
              <PhoneInput value={phone} onChange={setPhone} />
              <Notice text={phoneNotice} />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Continue to a new conversation"
                disabled={phone.replace(/\D/g, "").length !== 10}
                onPress={useNumber}
                style={({ pressed }) => [
                  styles.primary,
                  phone.replace(/\D/g, "").length !== 10 && styles.disabled,
                  pressed && styles.primaryPressed,
                ]}
              >
                <Text style={styles.primaryText}>Continue to message</Text>
              </Pressable>
            </View>

            <Notice text={queryNotice} />
            <Text style={styles.rule}>Existing customers</Text>
            <SearchStrip>
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search name or phone"
                placeholderTextColor={color.faint}
                autoCapitalize="none"
                autoCorrect={false}
                clearButtonMode="while-editing"
                returnKeyType="search"
                accessibilityLabel="Search customers to message"
                style={searchInputStyle}
              />
            </SearchStrip>
          </View>
        }
        ListEmptyComponent={
          customersQuery.isPending ? (
            <View style={styles.centre}>
              <ActivityIndicator color={color.brand} />
            </View>
          ) : (
            <Text style={styles.empty}>
              {query.trim()
                ? "No customers with a phone match that search."
                : "No customers have a phone number yet."}
            </Text>
          )
        }
        renderItem={({ item, index }) => {
          const name = item.name ?? "Unnamed customer";
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Message ${name} at ${fmtPhone(item.phone)}`}
              onPress={() => openConversation(item.phone as string, item)}
              style={({ pressed }) => [
                ...listRowStyle(index === 0, index === visible.length - 1),
                styles.customer,
                pressed && styles.pressed,
              ]}
            >
              <Avatar name={name} />
              <View style={styles.customerBody}>
                <View style={styles.customerTop}>
                  <Text style={styles.customerName} numberOfLines={1}>
                    {name}
                  </Text>
                  {item.archived ? <Text style={styles.archived}>Past client</Text> : null}
                </View>
                <Text style={styles.customerPhone}>{fmtPhone(item.phone)}</Text>
              </View>
              <Chevron />
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  list: { paddingHorizontal: space.lg, paddingTop: space.lg },
  listEmpty: { flexGrow: 1 },
  header: { gap: space.md, marginBottom: space.md },
  numberCard: {
    gap: space.sm,
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
    backgroundColor: color.surface,
  },
  rule: { ...type.rule, color: color.muted },
  numberCopy: { ...type.small, color: color.muted },
  primary: {
    minHeight: HIT,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: color.brandFill,
    paddingHorizontal: space.lg,
  },
  primaryPressed: { backgroundColor: color.brandDown },
  primaryText: { ...type.body, fontFamily: font.bodySemi, color: color.surface },
  disabled: { opacity: 0.45 },
  centre: { minHeight: 160, alignItems: "center", justifyContent: "center" },
  empty: { ...type.body, color: color.muted, textAlign: "center", padding: space.xl },
  customer: { minHeight: 68, flexDirection: "row", alignItems: "center", gap: space.md },
  pressed: { backgroundColor: color.hover },
  customerBody: { flex: 1, minWidth: 0, gap: 4 },
  customerTop: { flexDirection: "row", alignItems: "center", gap: space.sm },
  customerName: { ...type.title, color: color.ink, flexShrink: 1 },
  customerPhone: { ...type.small, color: color.muted },
  archived: {
    ...type.ruleSm,
    color: color.brandDeep,
    borderRadius: radius.chip,
    backgroundColor: color.brandSoft,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
});
