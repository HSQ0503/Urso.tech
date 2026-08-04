// The toast.
//
// One black pill above the tab bar, carrying the bear and a sentence. It is the
// app's only transient surface: every confirmation that used to be an Alert —
// "Booked for Tue 4", "Sent from the business line" — lands here instead, so a
// confirmation never blocks the thing it is confirming.
//
// Mounted once at the root rather than per screen: a toast raised on a detail
// screen has to survive the pop back to the list that raised it.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { color, font, motion, radius, shadow, type } from "@/theme";
import { Mark } from "@/components/ledger";

// Long enough to read a full sentence without hurrying, short enough that it is
// gone before it becomes furniture.
const DWELL = 4200;

type ToastApi = { show: (text: string) => void };

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  // Failing loudly here beats a silently swallowed confirmation — a screen that
  // thinks it reported success but did not is worse than a crash in dev.
  if (!api) throw new Error("useToast must be used inside <ToastProvider>");
  return api;
}

export function ToastProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [text, setText] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setText(null);
  }, []);

  const show = useCallback((next: string) => {
    if (timer.current) clearTimeout(timer.current);
    setText(next);
    timer.current = setTimeout(() => setText(null), DWELL);
  }, []);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {text === null ? null : <Toast text={text} onDismiss={clear} />}
    </ToastContext.Provider>
  );
}

function Toast({ text, onDismiss }: { text: string; onDismiss: () => void }): React.ReactElement {
  const insets = useSafeAreaInsets();
  const rise = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(rise, {
      toValue: 1,
      duration: motion.toast,
      easing: Easing.bezier(motion.easing.x1, motion.easing.y1, motion.easing.x2, motion.easing.y2),
      useNativeDriver: true,
    }).start();
  }, [rise]);

  return (
    <View
      style={[styles.layer, { bottom: insets.bottom + 82 }]}
      pointerEvents="box-none"
      accessibilityLiveRegion="polite"
    >
      <Animated.View
        style={[
          styles.toast,
          {
            opacity: rise,
            transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
          },
        ]}
      >
        <Mark size={22} />
        <Text style={styles.text}>{text}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          onPress={onDismiss}
          hitSlop={12}
        >
          <Text style={styles.ok}>OK</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { position: "absolute", left: 14, right: 14, zIndex: 70 },
  toast: {
    backgroundColor: color.chrome,
    borderRadius: radius.lg,
    paddingVertical: 13,
    paddingHorizontal: 15,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    ...shadow.toast,
  },
  text: { flex: 1, fontFamily: font.body, fontSize: 13, lineHeight: 18, color: color.chromeInk },
  ok: { ...type.rule, letterSpacing: 1.4, color: color.brand },
});
