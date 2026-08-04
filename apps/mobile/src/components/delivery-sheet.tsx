import { useEffect, useState, type ComponentProps } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { color, font, HIT, radius, space } from "@/theme";

export type DeliveryChoice = "text" | "email" | "both";
export type DeliveryChannels = { text: boolean; email: boolean };

export function deliveryChannels(choice: DeliveryChoice): DeliveryChannels {
  return {
    text: choice === "text" || choice === "both",
    email: choice === "email" || choice === "both",
  };
}

function defaultChoice(phone: string | null, email: string | null): DeliveryChoice {
  if (phone && email) return "both";
  if (email) return "email";
  return "text";
}

function displayPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  const ten = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (ten.length !== 10) return value;
  return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
}

function ChannelButton({
  label,
  detail,
  icon,
  active,
  disabled,
  onPress,
}: {
  label: string;
  detail: string;
  icon: ComponentProps<typeof Feather>["name"];
  active: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: active, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.channel,
        active && styles.channelActive,
        disabled && styles.channelDisabled,
        pressed && styles.channelPressed,
      ]}
    >
      <View style={[styles.channelIcon, active && styles.channelIconActive]}>
        <Feather name={icon} size={21} color={active ? color.surface : color.muted} />
      </View>
      <View style={styles.channelCopy}>
        <Text style={[styles.channelLabel, active && styles.channelLabelActive]}>{label}</Text>
        <Text numberOfLines={1} style={styles.channelDetail}>{detail}</Text>
      </View>
      <Feather name={active ? "check-circle" : "circle"} size={21} color={active ? color.brand : color.lineStrong} />
    </Pressable>
  );
}

export function DeliverySheet({
  visible,
  documentLabel,
  phone,
  email,
  sending,
  onClose,
  onSend,
}: {
  visible: boolean;
  documentLabel: "estimate" | "invoice";
  phone: string | null;
  email: string | null;
  sending: boolean;
  onClose: () => void;
  onSend: (channels: DeliveryChannels) => void;
}) {
  const insets = useSafeAreaInsets();
  const hasPhone = Boolean(phone?.trim());
  const hasEmail = Boolean(email?.trim());
  const [choice, setChoice] = useState<DeliveryChoice>(() => defaultChoice(phone, email));

  useEffect(() => {
    if (visible) setChoice(defaultChoice(phone, email));
  }, [email, phone, visible]);

  const canSend = hasPhone || hasEmail;
  const channels = deliveryChannels(choice);
  const summary = choice === "both"
    ? `Text ${displayPhone(phone ?? "")} and email ${email}.`
    : choice === "email"
      ? `Email ${email}.`
      : `Text ${displayPhone(phone ?? "")}.`;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.scrim}>
        <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Close delivery options" onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + space.lg }]}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>SEND {documentLabel.toUpperCase()}</Text>
              <Text style={styles.title}>How should it go out?</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={styles.close}>
              <Feather name="x" size={25} color={color.muted} />
            </Pressable>
          </View>

          {!canSend ? (
            <View style={styles.missing}>
              <Feather name="alert-circle" size={21} color={color.danger} />
              <Text style={styles.missingText}>Add a phone number or email before sending this {documentLabel}.</Text>
            </View>
          ) : (
            <View accessibilityRole="radiogroup" style={styles.channels}>
              <ChannelButton
                label="Text"
                detail={hasPhone ? displayPhone(phone ?? "") : "No phone on file"}
                icon="message-square"
                active={choice === "text"}
                disabled={!hasPhone || sending}
                onPress={() => setChoice("text")}
              />
              <ChannelButton
                label="Email"
                detail={hasEmail ? email ?? "" : "No email on file"}
                icon="mail"
                active={choice === "email"}
                disabled={!hasEmail || sending}
                onPress={() => setChoice("email")}
              />
              <ChannelButton
                label="Both"
                detail={hasPhone && hasEmail ? "Send through both channels" : "Phone and email required"}
                icon="send"
                active={choice === "both"}
                disabled={!hasPhone || !hasEmail || sending}
                onPress={() => setChoice("both")}
              />
            </View>
          )}

          {canSend ? <Text style={styles.summary}>{summary}</Text> : null}
          <Text style={styles.disclaimer}>Text delivery respects customer opt-outs and quiet hours. Card payments open on Square’s secure page.</Text>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Send ${documentLabel}`}
            accessibilityState={{ disabled: !canSend || sending }}
            disabled={!canSend || sending}
            onPress={() => onSend(channels)}
            style={({ pressed }) => [styles.send, (!canSend || sending) && styles.sendDisabled, pressed && styles.sendPressed]}
          >
            {sending ? <ActivityIndicator color={color.surface} /> : <Feather name="send" size={20} color={color.surface} />}
            <Text style={styles.sendText}>{sending ? "SENDING…" : `SEND ${documentLabel.toUpperCase()}`}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: "flex-end", backgroundColor: color.scrim },
  sheet: { paddingHorizontal: 18, paddingTop: 10, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: color.surface },
  handle: { width: 52, height: 5, alignSelf: "center", borderRadius: 3, backgroundColor: color.lineStrong },
  header: { minHeight: 104, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 14 },
  headerCopy: { flex: 1 },
  eyebrow: { fontFamily: font.monoMedium, fontSize: 12, letterSpacing: 1.6, color: color.brandDeep },
  title: { marginTop: 5, fontFamily: font.bodySemi, fontSize: 25, color: color.ink },
  close: { width: HIT, height: HIT, alignItems: "center", justifyContent: "center" },
  channels: { gap: 10 },
  channel: { minHeight: 72, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: color.lineStrong, borderRadius: radius.md, backgroundColor: color.hover },
  channelActive: { borderColor: color.brand, backgroundColor: color.brandWash },
  channelDisabled: { opacity: 0.42 },
  channelPressed: { transform: [{ scale: 0.99 }] },
  channelIcon: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 21, backgroundColor: color.surface },
  channelIconActive: { backgroundColor: color.brandFill },
  channelCopy: { flex: 1 },
  channelLabel: { fontFamily: font.bodySemi, fontSize: 17, color: color.ink },
  channelLabelActive: { color: color.brandDeep },
  channelDetail: { marginTop: 3, fontFamily: font.body, fontSize: 13, color: color.muted },
  missing: { minHeight: 70, padding: 14, flexDirection: "row", alignItems: "center", gap: 10, borderRadius: radius.md, backgroundColor: color.dangerBg },
  missingText: { flex: 1, fontFamily: font.bodyMedium, fontSize: 14, lineHeight: 20, color: color.danger },
  summary: { marginTop: 15, fontFamily: font.bodyMedium, fontSize: 14, color: color.ink },
  disclaimer: { marginTop: 7, fontFamily: font.body, fontSize: 12, lineHeight: 17, color: color.faint },
  send: { minHeight: 58, marginTop: 20, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, borderRadius: radius.md, backgroundColor: color.brandFill },
  sendDisabled: { opacity: 0.42 },
  sendPressed: { backgroundColor: color.brandDeep },
  sendText: { fontFamily: font.bodySemi, fontSize: 16, letterSpacing: 1.1, color: color.surface },
});
