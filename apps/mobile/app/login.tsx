import { useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  sendWorkspaceCode,
  signInWorkspaceWithPassword,
  verifyWorkspaceCode,
} from "@/platform/auth";
import { workspaceHref } from "@/platform/types";
import { queryClient } from "@/query";
import { ChromeLockup } from "@/components/ledger";
import { color, font, HIT, radius, shadow, space, type } from "@/theme";

// One neutral entry point across clients. The method is selected by the person,
// never guessed from their email, so this screen cannot become a membership
// lookup tool.
type Step = "choice" | "code" | "password";

const FALLBACK_NOTICE = "That didn’t go through. Try again in a moment.";

// Supabase issues an OTP whose length is configured per project, anywhere from
// 6 to 10 digits. Accept the whole range rather than assuming one: a maxLength
// that is too small truncates the code as it is typed or pasted, and the server
// then reports an invalid token, which sends you looking in the wrong place.
const MIN_CODE_LENGTH = 6;
const MAX_CODE_LENGTH = 10;

// This project issues 8, so 8 cells is what the field draws at rest. It grows
// rather than clips if a project is ever configured longer — the cells are a
// reading aid, not the thing that decides what is valid.
const CODE_CELLS = 8;

export default function Login(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState<Step>("choice");
  const [email, setEmail] = useState<string>("");
  const [code, setCode] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [busy, setBusy] = useState<boolean>(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Moving between steps clears the last step's sentence. Without this a
  // refusal from the email step ("Enter a valid email.") could still be on
  // screen under the code cells, blaming the code for something the address
  // did — which is exactly what it looked like in the field.
  function go(next: Step): void {
    setNotice(null);
    setStep(next);
  }

  function requireEmail(): string | null {
    const address = email.trim();
    if (!address) {
      setNotice("Enter your work email first.");
      return null;
    }
    // Shape-checked HERE as well as on the server. The server's refusal is the
    // authority, but it costs a round trip and — because /request-code answers
    // identically for every validly-shaped address so it cannot be used to
    // enumerate people — a typo and a stranger come back looking the same.
    // Catching an obviously malformed address before sending is the difference
    // between "Enter a valid email." and a silent nothing.
    if (!/^\S+@\S+\.\S+$/.test(address)) {
      setNotice("That doesn’t look like an email address.");
      return null;
    }
    return address;
  }

  async function handleSendCode(): Promise<void> {
    if (busy) return;
    const address = requireEmail();
    if (!address) return;

    setBusy(true);
    setNotice(null);
    const result = await sendWorkspaceCode(address);
    setBusy(false);

    if (!result.ok) {
      setNotice(result.notice ?? FALLBACK_NOTICE);
      return;
    }
    setCode("");
    go("code");
  }

  async function handleVerifyCode(): Promise<void> {
    if (busy) return;
    const entered = code.trim();
    // Supabase's OTP length is a PROJECT SETTING (6–10 digits), not a constant.
    // This project issues 8. Hardcoding 6 silently truncated the pasted code and
    // produced "Token has expired or is invalid", which points at the wrong
    // problem entirely. Validate a range and let the server judge the value.
    if (entered.length < MIN_CODE_LENGTH) {
      setNotice("Enter all the numbers from the email.");
      return;
    }

    setBusy(true);
    setNotice(null);
    const result = await verifyWorkspaceCode(email.trim(), entered);
    setBusy(false);

    if (!result.ok) {
      setNotice(result.notice ?? FALLBACK_NOTICE);
      return;
    }
    if (result.workspace) {
      queryClient.clear();
      router.replace(workspaceHref(result.workspace));
    }
  }

  async function handlePasswordSignIn(): Promise<void> {
    if (busy) return;
    const address = requireEmail();
    if (!address) return;
    if (!password) {
      setNotice("Enter your password.");
      return;
    }

    setBusy(true);
    setNotice(null);
    const result = await signInWorkspaceWithPassword(address, password);
    setBusy(false);

    if (!result.ok || !result.workspace) {
      setNotice(result.notice ?? FALLBACK_NOTICE);
      return;
    }
    queryClient.clear();
    router.replace(workspaceHref(result.workspace));
  }

  function handleChoose(method: Extract<Step, "code" | "password">): void {
    if (busy || !requireEmail()) return;
    setNotice(null);
    setStep(method);
    if (method === "code") void handleSendCode();
  }

  function handleChangeMethod(): void {
    if (busy) return;
    go("choice");
    setCode("");
    setPassword("");
    setNotice(null);
  }

  const address = email.trim();
  const chromeSub =
    step === "choice"
      ? "Client operations"
      : step === "code"
        ? `Code sent · ${address}`
        : address;

  return (
    <View style={styles.screen}>
      <ChromeLockup sub={chromeSub} />

      <KeyboardAvoidingView
        style={[styles.body, { paddingBottom: insets.bottom + space.lg }]}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.title}>
              {step === "choice"
                ? "Sign in"
                : step === "code"
                  ? "Check your email"
                  : "Enter your password"}
              <Text style={styles.stop}>.</Text>
            </Text>
            <Text style={styles.lede}>
              {step === "choice"
                ? "Use the sign-in method your office gave you. Your email works across Urso workspaces."
                : step === "code"
                  ? `We sent a code to ${address}. Type it in below. If it isn’t there in a minute, look in your junk mail.`
                  : "Use the password your office set up. You can return and get an email code instead."}
            </Text>
          </View>

          <View style={styles.cardBody}>
            {step === "choice" ? (
              <>
                <Text style={styles.label}>Work email</Text>
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@company.com"
                  placeholderTextColor={color.faint}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  keyboardType="email-address"
                  returnKeyType="send"
                  editable={!busy}
                  onSubmitEditing={() => {
                    handleChoose("password");
                  }}
                />
              </>
            ) : step === "code" ? (
              <>
                <View style={styles.labelRow}>
                  <Text style={styles.label}>Code</Text>
                  <Text style={styles.labelMeta}>
                    {MIN_CODE_LENGTH}–{MAX_CODE_LENGTH} digits
                  </Text>
                </View>
                <CodeField code={code} onChange={setCode} onSubmit={handleVerifyCode} busy={busy} />
              </>
            ) : (
              <>
                <Text style={styles.label}>Password</Text>
                <TextInput
                  style={styles.input}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Password"
                  placeholderTextColor={color.faint}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="password"
                  secureTextEntry
                  returnKeyType="go"
                  editable={!busy}
                  autoFocus
                  onSubmitEditing={() => {
                    void handlePasswordSignIn();
                  }}
                />
              </>
            )}

            {notice !== null && (
              <View style={styles.notice}>
                <Text style={styles.noticeText}>{notice}</Text>
              </View>
            )}

            {step === "choice" ? (
              <>
                <Pressable
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => handleChoose("password")}
                  style={({ pressed }) => [
                    styles.primary,
                    pressed && styles.primaryDown,
                    busy && styles.off,
                  ]}
                >
                  <Text style={styles.primaryLabel}>Continue with password</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => handleChoose("code")}
                  style={({ pressed }) => [
                    styles.secondary,
                    pressed && styles.secondaryDown,
                    busy && styles.off,
                  ]}
                >
                  <Text style={styles.secondaryLabel}>Email me a code</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Pressable
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => {
                    void (step === "code" ? handleVerifyCode() : handlePasswordSignIn());
                  }}
                  style={({ pressed }) => [
                    styles.primary,
                    pressed && styles.primaryDown,
                    busy && styles.off,
                  ]}
                >
                  <Text style={styles.primaryLabel}>{busy ? "Signing in…" : "Sign in"}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={handleChangeMethod}
                  style={styles.textButton}
                >
                  <Text style={styles.textButtonLabel}>Use a different sign-in method</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>

        <View style={styles.footer}>
          <View style={styles.footerLine} />
          <Text style={styles.footerText}>Urso · verified session</Text>
          <View style={styles.footerLine} />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

// The code, drawn as cells. A single input sits over the top so the OS keyboard,
// paste, and SMS autofill all behave normally — the cells are only a readout of
// what that one field holds.
//
// THE INPUT IS INVISIBLE, NOT TRANSPARENT, AND THE DIFFERENCE IS THE WHOLE BUG.
// It used to carry `opacity: 0`. React Native maps opacity onto UIView.alpha,
// and UIKit's default hitTest ignores any view with alpha <= 0.01 — so the field
// could not be tapped AND could not become first responder, which meant autoFocus
// fired and no keyboard ever appeared. On a real device that is a dead end: the
// code arrives by email and there is no way to type it. Invisible now means
// transparent TEXT on a transparent BACKGROUND at full alpha, which hit-tests
// normally.
//
// Belt and braces on top of that, because this screen must never be a dead end
// again: the whole block is pressable and focuses the field, and focus is
// re-asserted on mount after a frame — autoFocus alone is unreliable when a
// screen is still transitioning.
function CodeField({
  code,
  onChange,
  onSubmit,
  busy,
}: {
  code: string;
  onChange: (next: string) => void;
  onSubmit: () => Promise<void>;
  busy: boolean;
}): React.ReactElement {
  const ref = useRef<TextInput>(null);
  const cells = Array.from({ length: Math.max(CODE_CELLS, code.length) });

  useEffect(() => {
    const timer = setTimeout(() => ref.current?.focus(), 150);
    return () => clearTimeout(timer);
  }, []);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Enter the sign-in code"
      onPress={() => ref.current?.focus()}
      style={styles.codeWrap}
    >
      <View style={styles.codeCells} pointerEvents="none">
        {cells.map((_, index) => (
          <View
            key={index}
            style={[
              styles.codeCell,
              code[index] !== undefined && styles.codeCellFilled,
              index === code.length && styles.codeCellNext,
            ]}
          >
            <Text style={styles.codeChar}>{code[index] ?? ""}</Text>
          </View>
        ))}
      </View>
      <TextInput
        ref={ref}
        style={styles.codeInput}
        value={code}
        onChangeText={(next) => onChange(next.replace(/\D/g, "").slice(0, MAX_CODE_LENGTH))}
        keyboardType="number-pad"
        maxLength={MAX_CODE_LENGTH}
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        editable={!busy}
        autoFocus
        caretHidden
        accessibilityLabel="Sign-in code"
        onSubmitEditing={() => {
          void onSubmit();
        }}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },

  // The card rides up over the chrome's deep bottom padding.
  body: { flex: 1, paddingHorizontal: 18, marginTop: -64 },

  card: {
    backgroundColor: color.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
    borderRadius: radius.lg,
    overflow: "hidden",
    ...shadow.card,
  },
  cardHead: { paddingTop: 20, paddingHorizontal: 18, paddingBottom: 18 },
  cardBody: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.line,
    paddingTop: 14,
    paddingHorizontal: 18,
    paddingBottom: 18,
  },

  title: { ...type.heading, color: color.ink },
  stop: { color: color.brand },
  lede: { ...type.small, lineHeight: 20, color: color.muted, marginTop: 7 },

  labelRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  label: { ...type.rule, color: color.faint },
  labelMeta: { ...type.rule, letterSpacing: 1, color: color.faint },

  input: {
    // minHeight, never a fixed height: iOS mis-tracks a custom-font placeholder
    // when the field's height is constrained rather than derived.
    minHeight: HIT,
    marginTop: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.lineStrong,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    backgroundColor: color.surface,
    color: color.ink,
    fontFamily: font.body,
    // 16 keeps iOS from zooming the field on focus.
    fontSize: 16,
    // Explicit, and never a lineHeight: iOS builds the placeholder from the
    // field's default text attributes and tracks it far too wide under a custom
    // font unless the kern attribute is actually set.
    letterSpacing: 0,
  },

  codeWrap: { marginTop: 10, position: "relative" },
  codeCells: { flexDirection: "row", gap: 6 },
  codeCell: {
    flex: 1,
    height: 52,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.lineStrong,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  codeCellFilled: { backgroundColor: color.brandWash },
  codeCellNext: { borderColor: color.brand },
  codeChar: { fontFamily: font.monoMedium, fontSize: 20, color: color.ink },
  // NOT opacity: 0 — see CodeField. Transparent ink on a transparent ground at
  // full alpha, so UIKit still hit-tests it and it can take the keyboard.
  codeInput: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 52,
    color: "transparent",
    backgroundColor: "transparent",
  },

  notice: {
    marginTop: 12,
    backgroundColor: color.dangerBg,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  noticeText: { ...type.small, lineHeight: 18, fontFamily: font.bodyMedium, color: color.danger },

  primary: {
    height: 50,
    marginTop: 14,
    borderRadius: radius.md,
    backgroundColor: color.brandFill,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryDown: { backgroundColor: color.brandDown },
  primaryLabel: { fontFamily: font.bodySemi, fontSize: 15, color: color.surface },
  off: { opacity: 0.45 },

  secondary: {
    height: 50,
    marginTop: 8,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.lineStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryDown: { backgroundColor: color.hover },
  secondaryLabel: { fontFamily: font.bodySemi, fontSize: 15, color: color.brandDeep },

  textButton: { minHeight: 44, marginTop: 6, alignItems: "center", justifyContent: "center" },
  textButtonLabel: { ...type.small, fontFamily: font.bodyMedium, color: color.brandDeep },

  footer: {
    marginTop: "auto",
    paddingTop: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  footerLine: { flex: 1, height: 1, backgroundColor: color.line },
  footerText: { ...type.rule, fontSize: 10, letterSpacing: 1.6, color: color.faint },
});
