import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import { Button, Icon, Sheet, Tappable, feedback, palette, radius, space, toast, type } from "../ui";
import { mutate, useBudget } from "../state";
import { setPin, verifyPin, validatePin } from "../core/prefs";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"];

/** Numeric PIN pad with dot indicators. */
function PinPad({ value, onChange, max = 6 }: { value: string; onChange: (v: string) => void; max?: number }) {
  const press = (k: string) => {
    feedback("tap", "light");
    if (k === "del") return onChange(value.slice(0, -1));
    if (!k) return;
    if (value.length >= max) return;
    onChange(value + k);
  };
  return (
    <View style={{ gap: space.lg }}>
      <View style={styles.dots}>
        {Array.from({ length: max }).map((_, i) => (
          <View key={i} style={[styles.dot, i < value.length && styles.dotOn]} />
        ))}
      </View>
      <View style={styles.pad}>
        {KEYS.map((k, i) => (
          <View key={i} style={styles.padCell}>
            {k ? (
              <Tappable label={k === "del" ? "Delete" : k} sound={null} onPress={() => press(k)} style={styles.padKey}>
                {k === "del" ? <Icon name="chevronLeft" size={24} color={palette.inkSoft} /> : <Text style={styles.padTxt}>{k}</Text>}
              </Tappable>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}

/** Set or change the app-lock PIN (enter → confirm). */
export function PinSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const s = useBudget();
  const [stage, setStage] = useState<"enter" | "confirm">("enter");
  const [first, setFirst] = useState("");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) { setStage("enter"); setFirst(""); setValue(""); setError(null); }
  }, [visible]);

  const onDigits = (v: string) => {
    setValue(v);
    setError(null);
  };

  const submit = () => {
    if (stage === "enter") {
      const err = validatePin(value);
      if (err) { feedback("error", "error"); return setError(err === "too_short" ? "Use at least 4 digits." : "Numbers only."); }
      setFirst(value);
      setValue("");
      setStage("confirm");
      return;
    }
    if (value !== first) {
      feedback("error", "error");
      setValue("");
      setStage("enter");
      setFirst("");
      return setError("Those didn't match — try again.");
    }
    const res = setPin(s, value);
    if (res.error) { feedback("error", "error"); return setError("Pick a different PIN."); }
    mutate(() => res.state);
    feedback("success", "success");
    toast("App lock on");
    onClose();
  };

  return (
    <Sheet visible={visible} title={stage === "enter" ? "Choose a PIN" : "Confirm PIN"} onClose={onClose}>
      <Text style={[type.body, { color: palette.inkSoft, textAlign: "center" }]}>
        {stage === "enter" ? "This PIN unlocks the app on this device." : "Enter it again to confirm."}
      </Text>
      <PinPad value={value} onChange={onDigits} />
      {error ? <Text style={[type.caption, { color: palette.danger, textAlign: "center" }]}>{error}</Text> : null}
      <Button label={stage === "enter" ? "Continue" : "Set PIN"} size="lg" disabled={value.length < 4} onPress={submit} />
    </Sheet>
  );
}

/** Full-screen lock gate shown on launch / resume when a PIN is set. */
export function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const s = useBudget();
  const insets = useSafeAreaInsets();
  const [value, setValue] = useState("");
  const shake = useSharedValue(0);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));

  const onDigits = (v: string) => {
    setValue(v);
    if (v.length >= 4 && verifyPin(s, v)) {
      feedback("success", "success");
      onUnlock();
    } else if (v.length >= 6) {
      feedback("error", "error");
      shake.value = withSequence(withTiming(-10, { duration: 50 }), withTiming(10, { duration: 50 }), withTiming(-6, { duration: 50 }), withTiming(0, { duration: 50 }));
      setValue("");
    }
  };

  return (
    <View style={[styles.lock, { paddingTop: insets.top + space.xxl, paddingBottom: insets.bottom + space.xl }]}>
      <View style={styles.lockTop}>
        <View style={styles.lockBadge}><Icon name="lock" size={34} color={palette.onPrimary} /></View>
        <Text style={[type.title, { color: palette.onPrimary }]}>Envelope Mini</Text>
        <Text style={[type.body, { color: "#CBD5E1", textAlign: "center" }]}>Enter your PIN to unlock</Text>
      </View>
      <Animated.View style={shakeStyle}>
        <PinPadDark value={value} onChange={onDigits} max={6} />
      </Animated.View>
      <View />
    </View>
  );
}

/** Dark variant of the pad for the lock screen. */
function PinPadDark({ value, onChange, max = 6 }: { value: string; onChange: (v: string) => void; max?: number }) {
  const press = (k: string) => {
    feedback("tap", "light");
    if (k === "del") return onChange(value.slice(0, -1));
    if (!k) return;
    if (value.length >= max) return;
    onChange(value + k);
  };
  return (
    <View style={{ gap: space.xl }}>
      <View style={styles.dots}>
        {Array.from({ length: max }).map((_, i) => (
          <View key={i} style={[styles.dotDark, i < value.length && styles.dotDarkOn]} />
        ))}
      </View>
      <View style={styles.pad}>
        {KEYS.map((k, i) => (
          <View key={i} style={styles.padCell}>
            {k ? (
              <Tappable label={k === "del" ? "Delete" : k} sound={null} onPress={() => press(k)} style={styles.padKeyDark}>
                {k === "del" ? <Icon name="chevronLeft" size={24} color="#CBD5E1" /> : <Text style={[styles.padTxt, { color: palette.onPrimary }]}>{k}</Text>}
              </Tappable>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dots: { flexDirection: "row", gap: space.md, justifyContent: "center" },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: palette.border },
  dotOn: { backgroundColor: palette.primary, borderColor: palette.primary },
  dotDark: { width: 15, height: 15, borderRadius: 8, borderWidth: 2, borderColor: "#475569" },
  dotDarkOn: { backgroundColor: palette.accent, borderColor: palette.accent },
  pad: { flexDirection: "row", flexWrap: "wrap" },
  padCell: { width: "33.33%", alignItems: "center", justifyContent: "center", paddingVertical: space.xs },
  padKey: { width: 72, height: 64, borderRadius: radius.lg, alignItems: "center", justifyContent: "center" },
  padKeyDark: { width: 76, height: 68, borderRadius: radius.lg, alignItems: "center", justifyContent: "center" },
  padTxt: { fontSize: 28, color: palette.ink, fontVariant: ["tabular-nums"] },
  lock: { flex: 1, backgroundColor: palette.primary, paddingHorizontal: space.xl, alignItems: "center", justifyContent: "space-between" },
  lockTop: { alignItems: "center", gap: space.sm },
  lockBadge: { width: 76, height: 76, borderRadius: 24, backgroundColor: "#1E293B", alignItems: "center", justifyContent: "center", marginBottom: space.sm },
});
