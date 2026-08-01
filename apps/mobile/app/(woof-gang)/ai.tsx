import { Feather } from "@expo/vector-icons";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { font, HIT, space, type } from "@/theme";
import { WgApiError, woofGangApi } from "@/workspaces/woof-gang/api";
import { currentEasternMonth } from "@/workspaces/woof-gang/period";
import { Notice, ScreenHeader, wgColor, wgStyles } from "@/workspaces/woof-gang/ui";

type ChatMessage = { id: string; role: "user" | "assistant"; text: string };

const suggestions = [
  "What should I focus on this week?",
  "Which store moved the most recently?",
  "Where are we leaving revenue on the table?",
];

export default function WoofGangAi(): React.ReactElement {
  const params = useLocalSearchParams<{ topic?: string; store?: string; month?: string }>();
  const topic = typeof params.topic === "string" ? params.topic : undefined;
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: "welcome", role: "assistant", text: topic ? `You opened the analyst from ${topic}. Ask what changed, why it moved, or what to do next.` : "Ask me about revenue, customers, products, stores, or the team. I’ll pull the live Woof Gang data before I answer." },
  ]);
  const sessionQuery = useQuery({ queryKey: ["wg", "session"], queryFn: woofGangApi.session, staleTime: 60_000 });
  const storeId = typeof params.store === "string" ? params.store : sessionQuery.data?.defaultStoreId ?? null;
  const month = typeof params.month === "string" ? params.month : currentEasternMonth();
  const chat = useMutation({
    mutationFn: (message: string) => woofGangApi.askAi(message, storeId, month, topic),
    onSuccess: (answer) => setMessages((current) => [...current, { id: `assistant-${Date.now()}`, role: "assistant", text: answer }]),
  });

  const submit = (preset?: string) => {
    const question = (preset ?? draft).trim();
    if (!question || chat.isPending) return;
    setMessages((current) => [...current, { id: `user-${Date.now()}`, role: "user", text: question }]);
    setDraft("");
    chat.mutate(question);
  };

  if (sessionQuery.isLoading) return <View style={wgStyles.centre}><ActivityIndicator color={wgColor.orange} size="large" /></View>;

  return (
    <KeyboardAvoidingView style={wgStyles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={84}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + space.lg }]}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        <ScreenHeader eyebrow="WOOF GANG BAKERY · LIVE DATA" title="urso.ai" />
        <View style={styles.scope}><View style={styles.liveDot} /><Text style={styles.scopeText}>{sessionQuery.data?.role === "manager" ? "ASSIGNED STORE ONLY" : "ALL STORES"} · {month}{topic ? ` · ${topic.toUpperCase()}` : ""}</Text></View>
        <View style={styles.thread}>
          {messages.map((message) => (
            <View key={message.id} style={[styles.message, message.role === "user" ? styles.userMessage : styles.assistantMessage]}>
              <Text style={[styles.messageLabel, message.role === "assistant" && styles.aiLabel]}>{message.role === "assistant" ? "URSO.AI" : "YOU"}</Text>
              <Text style={styles.messageText}>{message.text}</Text>
            </View>
          ))}
          {chat.isPending ? <View style={[styles.message, styles.assistantMessage, styles.thinking]}><ActivityIndicator color={wgColor.orange} size="small" /><Text style={styles.thinkingText}>Analyzing live dashboard data…</Text></View> : null}
          {chat.isError ? <Notice tone="error" text={chat.error instanceof WgApiError ? chat.error.message : "The analyst could not answer that question."} /> : null}
        </View>
        {messages.length === 1 ? <View style={styles.suggestions}>{suggestions.map((suggestion) => <Pressable key={suggestion} accessibilityRole="button" onPress={() => submit(suggestion)} style={({ pressed }) => [styles.suggestion, pressed && styles.pressed]}><Text style={styles.suggestionText}>{suggestion}</Text><Feather name="arrow-up-right" color={wgColor.orange} size={16} /></Pressable>)}</View> : null}
      </ScrollView>
      <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, space.sm) }]}>
        <TextInput
          accessibilityLabel="Ask urso.ai"
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={() => submit()}
          placeholder="Ask about the business…"
          placeholderTextColor={wgColor.faint}
          multiline
          maxLength={2_000}
          style={styles.input}
        />
        <Pressable accessibilityRole="button" accessibilityLabel="Send question" disabled={!draft.trim() || chat.isPending} onPress={() => submit()} style={({ pressed }) => [styles.send, (!draft.trim() || chat.isPending) && styles.disabled, pressed && styles.pressed]}>
          <Feather name="arrow-up" color={wgColor.bg} size={20} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.lg, paddingBottom: space.xl, gap: space.lg },
  scope: { flexDirection: "row", alignItems: "center", gap: space.sm, borderBottomWidth: 1, borderBottomColor: wgColor.line, paddingBottom: space.md },
  liveDot: { width: 6, height: 6, backgroundColor: wgColor.good },
  scopeText: { color: wgColor.faint, ...type.micro },
  thread: { gap: space.md },
  message: { maxWidth: "92%", borderWidth: 1, padding: space.md, gap: space.sm },
  userMessage: { alignSelf: "flex-end", borderColor: wgColor.lineStrong, backgroundColor: wgColor.surfaceRaised },
  assistantMessage: { alignSelf: "flex-start", borderColor: wgColor.line, backgroundColor: wgColor.surface },
  messageLabel: { color: wgColor.faint, ...type.micro },
  aiLabel: { color: wgColor.orange },
  messageText: { color: wgColor.ink, ...type.body },
  thinking: { flexDirection: "row", alignItems: "center" },
  thinkingText: { color: wgColor.muted, ...type.small },
  suggestions: { gap: space.sm },
  suggestion: { minHeight: HIT, borderWidth: 1, borderColor: wgColor.line, paddingHorizontal: space.md, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md },
  suggestionText: { flex: 1, color: wgColor.muted, fontFamily: font.body, fontSize: 14 },
  composer: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: wgColor.line, backgroundColor: wgColor.bg, paddingTop: space.sm, paddingHorizontal: space.md, flexDirection: "row", alignItems: "flex-end", gap: space.sm },
  input: { flex: 1, minHeight: HIT, maxHeight: 112, borderWidth: 1, borderColor: wgColor.lineStrong, color: wgColor.ink, backgroundColor: wgColor.surfaceRaised, paddingHorizontal: space.md, paddingTop: 13, paddingBottom: 12, fontFamily: font.body, fontSize: 15 },
  send: { width: HIT, height: HIT, alignItems: "center", justifyContent: "center", backgroundColor: wgColor.orange },
  disabled: { opacity: 0.35 },
  pressed: { opacity: 0.68 },
});
