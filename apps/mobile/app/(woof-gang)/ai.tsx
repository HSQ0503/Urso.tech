import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { font, HIT, space, type } from "@/theme";
import {
  WgApiError,
  woofGangApi,
  type WgAiMessage,
  type WgAiPart,
  type WgAiThread,
} from "@/workspaces/woof-gang/api";
import { currentEasternMonth } from "@/workspaces/woof-gang/period";
import { IconButton, Notice, ScreenHeader, wgColor, wgStyles } from "@/workspaces/woof-gang/ui";

const suggestions = [
  "Where am I losing the most money right now?",
  "What should I focus on this week?",
  "Which store needs the most attention, and why?",
  "Who are my most valuable customers slipping away?",
];

const toolLabels: Record<string, string> = {
  metrics_overview: "headline metrics",
  monthly_series: "monthly trends",
  store_comparison: "store comparison",
  product_performance: "product performance",
  team_performance: "groomer contribution",
  customer_health: "customer health",
  decompose_revenue_change: "revenue drivers",
  profit_and_loss: "profit & loss",
  cost_breakdown: "cost breakdown",
  retention_detail: "retention",
  winback_targets: "win-back list",
  events_in_range: "logged events",
};

const textOf = (message: WgAiMessage): string => message.parts
  .filter((part) => part.type === "text" && typeof part.text === "string")
  .map((part) => part.text ?? "")
  .join("");

const toolsOf = (message: WgAiMessage): string[] => Array.from(new Set(message.parts
  .filter((part) => part.type.startsWith("tool-"))
  .map((part) => {
    const name = part.type.replace(/^tool-/, "");
    return toolLabels[name] ?? name.replace(/_/g, " ");
  })));

const textPart = (text: string): WgAiPart => ({ type: "text", text });

function InlineText({ value, style }: { value: string; style: object }): React.ReactElement {
  const pieces = value.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return <Text style={style}>{pieces.map((piece, index) => piece.startsWith("**") && piece.endsWith("**")
    ? <Text key={`${piece}-${index}`} style={styles.bold}>{piece.slice(2, -2)}</Text>
    : <Fragment key={`${piece}-${index}`}>{piece}</Fragment>)}</Text>;
}

function RichAnswer({ text }: { text: string }): React.ReactElement {
  const lines = text.split("\n");
  return <View style={styles.answer}>{lines.map((line, index) => {
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    const bullet = /^[-*]\s+(.+)$/.exec(line);
    const numbered = /^\d+\.\s+(.+)$/.exec(line);
    if (!line.trim()) return <View key={`space-${index}`} style={styles.answerSpace} />;
    if (heading) return <InlineText key={`heading-${index}`} value={heading[2]} style={styles.answerHeading} />;
    if (bullet || numbered) return <View key={`list-${index}`} style={styles.answerRow}><Text style={styles.answerMarker}>{bullet ? "•" : `${line.split(".")[0]}.`}</Text><InlineText value={(bullet ?? numbered)![1]} style={styles.answerText} /></View>;
    return <InlineText key={`line-${index}`} value={line} style={styles.answerText} />;
  })}</View>;
}

function Message({ message, live }: { message: WgAiMessage; live: boolean }): React.ReactElement {
  const text = textOf(message);
  const tools = toolsOf(message);
  const assistant = message.role === "assistant";
  return (
    <View style={[styles.message, assistant ? styles.assistantMessage : styles.userMessage]}>
      <Text style={[styles.messageLabel, assistant && styles.aiLabel]}>{assistant ? "URSO.AI" : "YOU"}</Text>
      {tools.length ? <View style={styles.toolRow}><Text style={styles.toolLead}>ANALYZED</Text>{tools.map((tool) => <Text key={tool} style={styles.toolChip}>{tool}</Text>)}</View> : null}
      {text ? assistant ? <RichAnswer text={text} /> : <Text style={styles.messageText}>{text}</Text> : live ? <View style={styles.thinking}><ActivityIndicator color={wgColor.orange} size="small" /><Text style={styles.thinkingText}>Reading the live numbers…</Text></View> : null}
    </View>
  );
}

function threadDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function WoofGangAi(): React.ReactElement {
  const params = useLocalSearchParams<{ topic?: string; store?: string; month?: string }>();
  const topic = typeof params.topic === "string" ? params.topic : undefined;
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const initialized = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<WgAiMessage[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [threadsOpen, setThreadsOpen] = useState(false);
  const [hydrating, setHydrating] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const sessionQuery = useQuery({ queryKey: ["wg", "session"], queryFn: woofGangApi.session, staleTime: 60_000 });
  const threadsQuery = useQuery({ queryKey: ["wg", "ai", "threads"], queryFn: woofGangApi.aiThreads, staleTime: 15_000 });
  const storeId = typeof params.store === "string" ? params.store : sessionQuery.data?.defaultStoreId ?? null;
  const month = typeof params.month === "string" ? params.month : currentEasternMonth();
  const storeName = sessionQuery.data?.stores.find((store) => store.id === storeId)?.name ?? (sessionQuery.data?.role === "manager" ? "Assigned store" : "All stores");

  const openThread = useCallback(async (threadId: string) => {
    if (busy) return;
    setHydrating(true);
    setError(null);
    setActiveThreadId(threadId);
    setThreadsOpen(false);
    try {
      setMessages(await woofGangApi.aiMessages(threadId));
    } catch (requestError) {
      setMessages([]);
      setError(requestError instanceof WgApiError ? requestError.message : "The conversation could not be loaded.");
    } finally {
      setHydrating(false);
    }
  }, [busy]);

  useEffect(() => {
    if (!threadsQuery.isSuccess || initialized.current) return;
    initialized.current = true;
    const first = threadsQuery.data[0];
    if (first) void openThread(first.id);
    else setHydrating(false);
  }, [openThread, threadsQuery.data, threadsQuery.isSuccess]);

  useEffect(() => {
    if (!threadsQuery.isError) return;
    setHydrating(false);
    setError("Saved conversations could not be loaded.");
  }, [threadsQuery.isError]);

  const newThread = useCallback(() => {
    if (busy) return;
    setActiveThreadId(null);
    setMessages([]);
    setDraft("");
    setError(null);
    setHydrating(false);
    setThreadsOpen(false);
  }, [busy]);

  const renameThread = useCallback(async (thread: WgAiThread) => {
    const title = renameDraft.trim();
    if (!title) return;
    try {
      await woofGangApi.renameAiThread(thread.id, title);
      setRenamingId(null);
      setRenameDraft("");
      await threadsQuery.refetch();
    } catch (requestError) {
      setError(requestError instanceof WgApiError ? requestError.message : "The conversation could not be renamed.");
    }
  }, [renameDraft, threadsQuery]);

  const deleteThread = useCallback((thread: WgAiThread) => {
    if (busy) return;
    Alert.alert("Delete conversation?", `“${thread.title}” and its saved messages will be removed.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => void (async () => {
        try {
          await woofGangApi.deleteAiThread(thread.id);
          const result = await threadsQuery.refetch();
          if (activeThreadId === thread.id) {
            setActiveThreadId(null);
            setMessages([]);
            const next = result.data?.find((item) => item.id !== thread.id);
            if (next) await openThread(next.id);
          }
        } catch (requestError) {
          setError(requestError instanceof WgApiError ? requestError.message : "The conversation could not be deleted.");
        }
      })() },
    ]);
  }, [activeThreadId, busy, openThread, threadsQuery]);

  const submit = useCallback(async (preset?: string) => {
    const question = (preset ?? draft).trim();
    if (!question || busy) return;
    setBusy(true);
    setError(null);
    setDraft("");
    let threadId = activeThreadId;
    try {
      if (!threadId) {
        const thread = await woofGangApi.createAiThread(storeId ?? "all");
        threadId = thread.id;
        setActiveThreadId(thread.id);
        await threadsQuery.refetch();
      }
      const userMessage: WgAiMessage = { id: `mobile-user-${Date.now()}`, role: "user", parts: [textPart(question)] };
      const context = [...messages, userMessage];
      const assistantId = `mobile-assistant-${Date.now()}`;
      setMessages([...context, { id: assistantId, role: "assistant", parts: [] }]);
      const controller = new AbortController();
      abortRef.current = controller;
      let answer = "";
      await woofGangApi.streamAi(context, threadId, storeId, month, (chunk) => {
        answer += chunk;
        setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, parts: [textPart(answer)] } : message));
      }, controller.signal);
      if (!answer.trim()) {
        setMessages((current) => current.filter((message) => message.id !== assistantId));
        throw new WgApiError("The analyst did not finish that answer. Try again.", true);
      }
      await threadsQuery.refetch();
    } catch (requestError) {
      if (!(requestError instanceof Error && requestError.name === "AbortError")) {
        setError(requestError instanceof WgApiError ? requestError.message : "The analyst could not answer that question.");
      }
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  }, [activeThreadId, busy, draft, messages, month, storeId, threadsQuery]);

  if (sessionQuery.isLoading || threadsQuery.isLoading) return <View style={wgStyles.centre}><ActivityIndicator color={wgColor.orange} size="large" /></View>;

  const threads = threadsQuery.data ?? [];
  const empty = !hydrating && messages.length === 0;
  return (
    <KeyboardAvoidingView style={wgStyles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={84}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + space.lg }]}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        <ScreenHeader eyebrow="WOOF GANG BAKERY · LIVE DATA" title="urso.ai" right={<View style={styles.headerActions}><IconButton icon="list" label="Conversations" onPress={() => setThreadsOpen((open) => !open)} /><IconButton icon="plus" label="New conversation" onPress={newThread} /></View>} />
        <View style={styles.scope}><View style={styles.liveDot} /><Text style={styles.scopeText}>{storeName.toUpperCase()} · {month}{topic ? ` · ${topic.toUpperCase()}` : ""}</Text></View>

        {threadsOpen ? <View style={styles.threadPanel}>
          <View style={styles.threadPanelHeader}><Text style={styles.threadPanelLabel}>CONVERSATIONS</Text><Text style={styles.threadCount}>{threads.length}</Text></View>
          {threadsQuery.isError ? <Notice tone="error" text="Saved conversations could not be loaded." /> : threads.length ? threads.map((thread, index) => <View key={thread.id} style={[styles.threadRow, index > 0 && styles.divided, thread.id === activeThreadId && styles.activeThread]}>
            {renamingId === thread.id ? <View style={styles.renameRow}><TextInput accessibilityLabel="Conversation name" autoFocus value={renameDraft} onChangeText={setRenameDraft} onSubmitEditing={() => void renameThread(thread)} style={styles.renameInput} /><Pressable accessibilityRole="button" accessibilityLabel="Save conversation name" onPress={() => void renameThread(thread)} style={styles.threadIcon}><Feather name="check" size={17} color={wgColor.orange} /></Pressable></View> : <>
              <Pressable accessibilityRole="button" accessibilityLabel={`Open ${thread.title}`} disabled={busy} onPress={() => void openThread(thread.id)} style={styles.threadOpen}><Text style={styles.threadTitle} numberOfLines={1}>{thread.title}</Text><Text style={styles.threadDate}>{threadDate(thread.updatedAt)}</Text></Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={`Rename ${thread.title}`} disabled={busy} onPress={() => { setRenamingId(thread.id); setRenameDraft(thread.title); }} style={styles.threadIcon}><Feather name="edit-2" size={15} color={wgColor.muted} /></Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${thread.title}`} disabled={busy} onPress={() => deleteThread(thread)} style={styles.threadIcon}><Feather name="trash-2" size={15} color={wgColor.red} /></Pressable>
            </>}
          </View>) : <Text style={styles.threadEmpty}>Your first question will start a saved conversation.</Text>}
        </View> : null}

        {error ? <Notice tone="error" text={error} /> : null}
        {hydrating ? <View style={styles.loadingThread}><ActivityIndicator color={wgColor.orange} /><Text style={styles.thinkingText}>Loading conversation…</Text></View> : null}
        {empty ? <View style={styles.welcome}><Text style={styles.welcomeTitle}>{topic ? `Ask about ${topic}` : `Good to see you${sessionQuery.data?.name ? `, ${sessionQuery.data.name.split(" ")[0]}` : ""}.`}</Text><Text style={styles.welcomeText}>I’m using the same strategist, live tools, saved memory, and business context as the web dashboard.</Text></View> : null}
        <View style={styles.thread}>
          {messages.map((message, index) => <Message key={message.id} message={message} live={busy && index === messages.length - 1 && message.role === "assistant"} />)}
        </View>
        {empty ? <View style={styles.suggestions}>{suggestions.map((suggestion) => <Pressable key={suggestion} accessibilityRole="button" disabled={busy} onPress={() => void submit(suggestion)} style={({ pressed }) => [styles.suggestion, pressed && styles.pressed]}><Text style={styles.suggestionText}>{suggestion}</Text><Feather name="arrow-up-right" color={wgColor.orange} size={16} /></Pressable>)}</View> : null}
      </ScrollView>
      <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, space.sm) }]}>
        <TextInput accessibilityLabel="Ask urso.ai" value={draft} onChangeText={setDraft} onSubmitEditing={() => void submit()} placeholder="Ask about the business…" placeholderTextColor={wgColor.faint} multiline maxLength={2_000} style={styles.input} />
        {busy ? <Pressable accessibilityRole="button" accessibilityLabel="Stop response" onPress={() => abortRef.current?.abort()} style={styles.stop}><Feather name="square" color={wgColor.ink} size={16} /></Pressable> : <Pressable accessibilityRole="button" accessibilityLabel="Send question" disabled={!draft.trim()} onPress={() => void submit()} style={({ pressed }) => [styles.send, !draft.trim() && styles.disabled, pressed && styles.pressed]}><Feather name="arrow-up" color={wgColor.bg} size={20} /></Pressable>}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.lg, paddingBottom: space.xl, gap: space.lg },
  headerActions: { flexDirection: "row", gap: space.sm },
  scope: { flexDirection: "row", alignItems: "center", gap: space.sm, borderBottomWidth: 1, borderBottomColor: wgColor.line, paddingBottom: space.md },
  liveDot: { width: 6, height: 6, backgroundColor: wgColor.good },
  scopeText: { flex: 1, color: wgColor.faint, ...type.micro },
  threadPanel: { borderWidth: 1, borderColor: wgColor.line, backgroundColor: wgColor.surface },
  threadPanelHeader: { minHeight: 44, paddingHorizontal: space.md, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: wgColor.line },
  threadPanelLabel: { color: wgColor.orange, ...type.micro },
  threadCount: { color: wgColor.faint, fontFamily: font.mono, fontSize: 10 },
  threadRow: { minHeight: 58, flexDirection: "row", alignItems: "center", borderLeftWidth: 2, borderLeftColor: "transparent" },
  activeThread: { borderLeftColor: wgColor.orange, backgroundColor: wgColor.orangeWash },
  divided: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: wgColor.line },
  threadOpen: { minHeight: 58, flex: 1, justifyContent: "center", paddingHorizontal: space.md },
  threadTitle: { color: wgColor.ink, fontFamily: font.bodyMedium, fontSize: 14 },
  threadDate: { color: wgColor.faint, fontFamily: font.mono, fontSize: 9, marginTop: 3 },
  threadIcon: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  renameRow: { flex: 1, minHeight: 58, flexDirection: "row", alignItems: "center", paddingLeft: space.sm },
  renameInput: { flex: 1, minHeight: 44, borderWidth: 1, borderColor: wgColor.lineStrong, color: wgColor.ink, backgroundColor: wgColor.surfaceRaised, fontFamily: font.body, fontSize: 14, paddingHorizontal: space.md },
  threadEmpty: { color: wgColor.muted, ...type.small, padding: space.md },
  loadingThread: { minHeight: 120, alignItems: "center", justifyContent: "center", gap: space.sm },
  welcome: { borderLeftWidth: 2, borderLeftColor: wgColor.orange, backgroundColor: wgColor.orangeWash, padding: space.lg, gap: space.sm },
  welcomeTitle: { color: wgColor.ink, fontFamily: font.display, fontSize: 23, lineHeight: 29 },
  welcomeText: { color: wgColor.muted, ...type.body },
  thread: { gap: space.md },
  message: { maxWidth: "94%", borderWidth: 1, padding: space.md, gap: space.sm },
  userMessage: { alignSelf: "flex-end", borderColor: "rgba(254,81,0,0.28)", backgroundColor: wgColor.orangeWash },
  assistantMessage: { alignSelf: "stretch", borderColor: wgColor.line, backgroundColor: wgColor.surface },
  messageLabel: { color: wgColor.faint, ...type.micro },
  aiLabel: { color: wgColor.orange },
  messageText: { color: wgColor.ink, ...type.body },
  toolRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.xs },
  toolLead: { color: wgColor.orange, fontFamily: font.mono, fontSize: 9, letterSpacing: 0.6 },
  toolChip: { color: wgColor.faint, fontFamily: font.mono, fontSize: 9, borderWidth: 1, borderColor: wgColor.line, paddingHorizontal: 6, paddingVertical: 3 },
  thinking: { flexDirection: "row", alignItems: "center", gap: space.sm },
  thinkingText: { color: wgColor.muted, ...type.small },
  answer: { gap: 6 },
  answerText: { flex: 1, color: wgColor.ink, ...type.body },
  answerHeading: { color: wgColor.ink, fontFamily: font.bodySemi, fontSize: 16, lineHeight: 22, marginTop: 4 },
  answerRow: { flexDirection: "row", alignItems: "flex-start", gap: space.sm },
  answerMarker: { width: 18, color: wgColor.orange, fontFamily: font.mono, fontSize: 12, lineHeight: 21 },
  answerSpace: { height: 5 },
  bold: { fontFamily: font.bodySemi, color: wgColor.ink },
  suggestions: { gap: space.sm },
  suggestion: { minHeight: HIT, borderWidth: 1, borderColor: wgColor.line, paddingHorizontal: space.md, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md },
  suggestionText: { flex: 1, color: wgColor.muted, fontFamily: font.body, fontSize: 14 },
  composer: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: wgColor.line, backgroundColor: wgColor.bg, paddingTop: space.sm, paddingHorizontal: space.md, flexDirection: "row", alignItems: "flex-end", gap: space.sm },
  input: { flex: 1, minHeight: HIT, maxHeight: 112, borderWidth: 1, borderColor: wgColor.lineStrong, color: wgColor.ink, backgroundColor: wgColor.surfaceRaised, paddingHorizontal: space.md, paddingTop: 13, paddingBottom: 12, fontFamily: font.body, fontSize: 15 },
  send: { width: HIT, height: HIT, alignItems: "center", justifyContent: "center", backgroundColor: wgColor.orange },
  stop: { width: HIT, height: HIT, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: wgColor.lineStrong },
  disabled: { opacity: 0.35 },
  pressed: { opacity: 0.68 },
});
