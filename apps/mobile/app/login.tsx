import { useState } from "react";
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
import { color, font, HIT, radius, space, type } from "@/theme";

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

export default function Login(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState<Step>("choice");
  const [email, setEmail] = useState<string>("");
  const [code, setCode] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [busy, setBusy] = useState<boolean>(false);
  const [notice, setNotice] = useState<string | null>(null);

  function requireEmail(): string | null {
    const address = email.trim();
    if (!address) {
      setNotice("Enter your work email first.");
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
    setStep("code");
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
    setStep("choice");
    setCode("");
    setPassword("");
    setNotice(null);
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + space.lg }]}>
        <Text style={styles.wordmark}>
          Urso<Text style={styles.wordmarkDot}>.</Text>
        </Text>
        <Text style={styles.wordmarkLabel}>Client operations</Text>
      </View>

      <KeyboardAvoidingView
        style={styles.body}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.card}>
          {step === "choice" ? (
            <>
              <Text style={styles.title}>Sign in</Text>
              <Text style={styles.lede}>
                Use the sign-in method your office gave you. Your email works across Urso
                workspaces.
              </Text>

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
              <Text style={styles.title}>Check your email</Text>
              <Text style={styles.lede}>
                We sent a code to {email.trim()}. Type it in below. If it isn’t there in a
                minute, look in your junk mail.
              </Text>

              <Text style={styles.label}>Code</Text>
              <TextInput
                style={[styles.input, styles.codeInput]}
                value={code}
                onChangeText={setCode}
                placeholder="000000"
                placeholderTextColor={color.faint}
                keyboardType="number-pad"
                maxLength={MAX_CODE_LENGTH}
                autoComplete="one-time-code"
                textContentType="oneTimeCode"
                editable={!busy}
                autoFocus
                onSubmitEditing={() => {
                  void handleVerifyCode();
                }}
              />
            </>
          ) : (
            <>
              <Text style={styles.title}>Enter your password</Text>
              <Text style={styles.lede}>
                Use the password your office set up. You can return and get an email code instead.
              </Text>

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
            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={() => handleChoose("password")}
                style={({ pressed }) => [
                  styles.primary,
                  pressed && styles.primaryDown,
                  busy && styles.primaryOff,
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
                  busy && styles.primaryOff,
                ]}
              >
                <Text style={styles.secondaryLabel}>Email me a code</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => {
                void (step === "code" ? handleVerifyCode() : handlePasswordSignIn());
              }}
              style={({ pressed }) => [
                styles.primary,
                pressed && styles.primaryDown,
                busy && styles.primaryOff,
              ]}
            >
              <Text style={styles.primaryLabel}>{primaryLabel(step, busy)}</Text>
            </Pressable>
          )}

          {step !== "choice" && (
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={handleChangeMethod}
              style={styles.textButton}
            >
              <Text style={styles.textButtonLabel}>Use a different sign-in method</Text>
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function primaryLabel(step: Exclude<Step, "choice">, busy: boolean): string {
  if (step === "code") return busy ? "Signing in…" : "Sign in";
  return busy ? "Signing in…" : "Sign in";
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: color.bg,
  },
  header: {
    backgroundColor: color.chrome,
    paddingHorizontal: space.lg,
    paddingBottom: space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.chromeLine,
  },
  wordmark: {
    ...type.display,
    color: color.chromeInk,
  },
  wordmarkDot: {
    color: color.brand,
  },
  wordmarkLabel: {
    ...type.micro,
    color: color.chromeMuted,
    marginTop: space.xs,
  },
  body: {
    flex: 1,
    justifyContent: "center",
    padding: space.lg,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
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
  lede: {
    ...type.small,
    color: color.muted,
    marginTop: space.xs,
  },
  label: {
    ...type.micro,
    color: color.muted,
    marginTop: space.lg,
    marginBottom: space.sm,
  },
  input: {
    minHeight: HIT,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.lineStrong,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    backgroundColor: color.surface,
    color: color.ink,
    fontFamily: font.body,
    fontSize: 16,
  },
  codeInput: {
    fontFamily: font.mono,
    fontSize: 22,
    letterSpacing: 8,
    textAlign: "center",
  },
  notice: {
    marginTop: space.lg,
    backgroundColor: color.dangerBg,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  noticeText: {
    ...type.small,
    fontFamily: font.bodyMedium,
    color: color.danger,
  },
  primary: {
    minHeight: HIT,
    marginTop: space.lg,
    borderRadius: radius.md,
    backgroundColor: color.brandFill,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryDown: {
    backgroundColor: color.brandDown,
  },
  primaryOff: {
    opacity: 0.45,
  },
  primaryLabel: {
    fontFamily: font.bodySemi,
    fontSize: 15,
    color: color.surface,
  },
  actions: {
    marginTop: space.lg,
    gap: space.sm,
  },
  secondary: {
    minHeight: HIT,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.lineStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryDown: {
    backgroundColor: color.hover,
  },
  secondaryLabel: {
    fontFamily: font.bodySemi,
    fontSize: 15,
    color: color.brandDeep,
  },
  textButton: {
    minHeight: HIT,
    marginTop: space.xs,
    alignItems: "center",
    justifyContent: "center",
  },
  textButtonLabel: {
    ...type.small,
    fontFamily: font.bodyMedium,
    color: color.brandDeep,
  },
});
