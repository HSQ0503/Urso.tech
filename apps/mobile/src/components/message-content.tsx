import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Linking from "expo-linking";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Message } from "@urso/types";
import { messageMediaUrl } from "@/api";
import { getAdminToken } from "@/session";
import { color, font, HIT, radius, space, type } from "@/theme";

const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>]+/gi;
const TRAILING_PUNCTUATION = /[),.!?:;]+$/;
const ESTIMATE_PATH = /\/CanesPressure\/e\//i;

type TextPart = { text: string; url: string | null };

function normalizedUrl(value: string): string {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

function splitLinks(body: string): TextPart[] {
  const parts: TextPart[] = [];
  let cursor = 0;
  for (const match of body.matchAll(URL_PATTERN)) {
    const start = match.index ?? 0;
    if (start > cursor) parts.push({ text: body.slice(cursor, start), url: null });

    const raw = match[0];
    const punctuation = raw.match(TRAILING_PUNCTUATION)?.[0] ?? "";
    const clean = punctuation ? raw.slice(0, -punctuation.length) : raw;
    parts.push({ text: clean, url: normalizedUrl(clean) });
    if (punctuation) parts.push({ text: punctuation, url: null });
    cursor = start + raw.length;
  }
  if (cursor < body.length) parts.push({ text: body.slice(cursor), url: null });
  return parts.length > 0 ? parts : [{ text: body, url: null }];
}

function linksFrom(parts: TextPart[]): string[] {
  return [...new Set(parts.flatMap((part) => (part.url ? [part.url] : [])))];
}

function linkHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Open link";
  }
}

async function openLink(url: string): Promise<void> {
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert("Link unavailable", "That link could not be opened.");
  }
}

function RichText({ body }: { body: string }) {
  const parts = useMemo(() => splitLinks(body), [body]);
  return (
    <Text style={styles.body}>
      {parts.map((part, index) =>
        part.url ? (
          <Text
            key={`${index}-${part.text}`}
            accessibilityRole="link"
            onPress={() => void openLink(part.url as string)}
            style={styles.linkText}
          >
            {part.text}
          </Text>
        ) : (
          <Text key={`${index}-${part.text}`}>{part.text}</Text>
        ),
      )}
    </Text>
  );
}

function LinkCards({ body }: { body: string }) {
  const links = useMemo(() => linksFrom(splitLinks(body)).slice(0, 2), [body]);
  if (links.length === 0) return null;

  return (
    <View style={styles.linkList}>
      {links.map((url) => {
        const estimate = ESTIMATE_PATH.test(url);
        return (
          <Pressable
            key={url}
            accessibilityRole="link"
            accessibilityLabel={estimate ? "Open estimate" : `Open link to ${linkHost(url)}`}
            onPress={() => void openLink(url)}
            style={({ pressed }) => [styles.linkCard, pressed && styles.pressed]}
          >
            <View style={styles.linkIcon}>
              <Feather name={estimate ? "file-text" : "external-link"} size={15} color={color.brandDeep} />
            </View>
            <View style={styles.linkMain}>
              <Text style={styles.linkTitle} numberOfLines={1}>
                {estimate ? "Open estimate" : linkHost(url)}
              </Text>
              <Text style={styles.linkUrl} numberOfLines={1}>
                {linkHost(url)}
              </Text>
            </View>
            <Feather name="chevron-right" size={17} color={color.faint} />
          </Pressable>
        );
      })}
    </View>
  );
}

function AuthenticatedImage({
  messageId,
  index,
  full,
}: {
  messageId: string;
  index: number;
  full?: boolean;
}) {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let mounted = true;
    void getAdminToken().then((value) => {
      if (mounted) setToken(value);
    });
    return () => {
      mounted = false;
    };
  }, []);

  if (failed) {
    return (
      <View style={[styles.mediaFallback, full && styles.mediaFallbackFull]}>
        <Feather name="image" size={24} color={full ? color.chromeMuted : color.muted} />
        <Text style={[styles.mediaFallbackText, full && styles.mediaFallbackTextFull]}>
          Photo unavailable
        </Text>
      </View>
    );
  }

  if (!token) {
    return (
      <View style={[styles.mediaFallback, full && styles.mediaFallbackFull]}>
        <ActivityIndicator color={full ? color.chromeInk : color.brand} />
      </View>
    );
  }

  return (
    <View style={full ? styles.fullImageFrame : styles.imageFrame}>
      <Image
        accessibilityLabel="Message photo"
        resizeMode={full ? "contain" : "cover"}
        source={{
          uri: messageMediaUrl(messageId, index),
          headers: { Authorization: `Bearer ${token}` },
        }}
        onLoadStart={() => {
          setLoading(true);
          setFailed(false);
        }}
        onLoadEnd={() => setLoading(false)}
        onError={() => {
          setLoading(false);
          setFailed(true);
        }}
        style={full ? styles.fullImage : styles.image}
      />
      {loading ? (
        <View style={[styles.imageLoading, full && styles.imageLoadingFull]}>
          <ActivityIndicator color={full ? color.chromeInk : color.brand} />
        </View>
      ) : null}
    </View>
  );
}

function MessageMedia({ message }: { message: Message }) {
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<number | null>(null);
  const visible = message.media_urls.slice(0, 4);
  if (visible.length === 0) return null;

  return (
    <>
      <View style={[styles.mediaGrid, visible.length === 1 && styles.mediaGridSingle]}>
        {visible.map((_, index) => (
          <Pressable
            key={`${message.id}-${index}`}
            accessibilityRole="imagebutton"
            accessibilityLabel={`Open photo ${index + 1} of ${message.media_urls.length}`}
            onPress={() => setSelected(index)}
            style={({ pressed }) => [
              visible.length === 1 ? styles.mediaTileSingle : styles.mediaTile,
              pressed && styles.mediaPressed,
            ]}
          >
            <AuthenticatedImage messageId={message.id} index={index} />
            {index === 3 && message.media_urls.length > 4 ? (
              <View style={styles.mediaMore}>
                <Text style={styles.mediaMoreText}>+{message.media_urls.length - 4}</Text>
              </View>
            ) : null}
          </Pressable>
        ))}
      </View>

      <Modal
        animationType="fade"
        onRequestClose={() => setSelected(null)}
        presentationStyle="fullScreen"
        visible={selected !== null}
      >
        <View style={styles.viewer}>
          <View style={[styles.viewerBar, { paddingTop: insets.top + space.sm }]}>
            <Text style={styles.viewerCount}>
              {selected === null ? "" : `${selected + 1} of ${message.media_urls.length}`}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close photo"
              onPress={() => setSelected(null)}
              style={({ pressed }) => [styles.viewerClose, pressed && styles.viewerClosePressed]}
            >
              <Feather name="x" size={23} color={color.chromeInk} />
            </Pressable>
          </View>
          {selected === null ? null : (
            <AuthenticatedImage messageId={message.id} index={selected} full />
          )}
        </View>
      </Modal>
    </>
  );
}

export function MessageContent({ message }: { message: Message }) {
  const body = message.body.trim();

  const showActions = () => {
    if (!body) return;
    Alert.alert("Message", undefined, [
      {
        text: "Copy text",
        onPress: () => {
          void Clipboard.setStringAsync(body);
        },
      },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  return (
    <Pressable
      accessibilityHint={body ? "Long press for message actions" : undefined}
      delayLongPress={350}
      onLongPress={showActions}
      style={styles.content}
    >
      <MessageMedia message={message} />
      {body ? <RichText body={body} /> : null}
      {body ? <LinkCards body={body} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { gap: space.sm },
  body: { ...type.body, color: color.ink },
  linkText: { color: color.brandDeep, textDecorationLine: "underline" },

  linkList: { gap: space.xs },
  linkCard: {
    minHeight: HIT,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.brandEdgeSoft,
    backgroundColor: color.surface,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
  linkIcon: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    backgroundColor: color.brandSoft,
  },
  linkMain: { flex: 1, minWidth: 0 },
  linkTitle: { ...type.small, fontFamily: font.bodySemi, color: color.ink },
  linkUrl: { ...type.smaller, color: color.muted },
  pressed: { backgroundColor: color.brandWash },

  mediaGrid: {
    width: 216,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.xs,
  },
  mediaGridSingle: { width: 216 },
  mediaTile: {
    width: 104,
    height: 104,
    borderRadius: radius.sm,
    overflow: "hidden",
    backgroundColor: color.bg,
  },
  mediaTileSingle: {
    width: 216,
    height: 162,
    borderRadius: radius.sm,
    overflow: "hidden",
    backgroundColor: color.bg,
  },
  mediaPressed: { opacity: 0.78 },
  imageFrame: { flex: 1 },
  image: { width: "100%", height: "100%" },
  imageLoading: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: color.bg,
  },
  mediaFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: space.xs,
    backgroundColor: color.bg,
  },
  mediaFallbackText: { ...type.smaller, color: color.muted },
  mediaMore: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(7, 7, 7, 0.58)",
  },
  mediaMoreText: { ...type.heading, color: color.chromeInk },

  viewer: { flex: 1, backgroundColor: color.chrome },
  viewerBar: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.md,
    paddingBottom: space.sm,
  },
  viewerCount: { ...type.small, color: color.chromeMuted },
  viewerClose: {
    width: HIT,
    height: HIT,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: HIT / 2,
    backgroundColor: color.chromeRaise,
  },
  viewerClosePressed: { backgroundColor: color.chromeEdge },
  fullImageFrame: { flex: 1 },
  fullImage: { width: "100%", height: "100%", resizeMode: "contain" },
  imageLoadingFull: { backgroundColor: color.chrome },
  mediaFallbackFull: { backgroundColor: color.chrome },
  mediaFallbackTextFull: { color: color.chromeMuted },
});
