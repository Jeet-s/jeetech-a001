import { useEffect, useState } from "react";
import { Image, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View, type ImageSourcePropType } from "react-native";
import Animated, { Easing, FadeInDown, FadeOutDown, useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { IconButton } from "./Button";
import { Icon, type IconName } from "./Icon";
import { palette, radius, shadowStrong, space, springs, type } from "./theme";
import { play } from "../audio/sfx";

/** Bottom sheet over a dimmed backdrop — for add/edit forms, pickers and the Pro offer. */
export function Sheet({ visible, title, onClose, children }: { visible: boolean; title?: string; onClose: () => void; children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const y = useSharedValue(1);
  useEffect(() => {
    if (visible) play("whoosh", 0.4);
    y.value = visible ? withSpring(0, springs.gentle) : withTiming(1, { duration: 180 });
  }, [visible, y]);
  const sheet = useAnimatedStyle(() => ({ transform: [{ translateY: y.value * 600 }] }));
  const dim = useAnimatedStyle(() => ({ opacity: withTiming(visible ? 1 : 0, { duration: 200, easing: Easing.out(Easing.quad) }) }));
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: palette.scrim }, dim]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
      </Animated.View>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.bottom} pointerEvents="box-none">
        <Animated.View style={[styles.sheet, { paddingBottom: insets.bottom + space.lg }, sheet]}>
          <View style={styles.grabber} />
          {title ? (
            <View style={styles.titleRow}>
              <Text style={[type.title, { flex: 1 }]} accessibilityRole="header">{title}</Text>
              <IconButton icon="close" label="Close" size={40} onPress={onClose} />
            </View>
          ) : null}
          {children}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Friendly empty state: illustration/icon, one line of why, one clear action. */
export function EmptyState({
  icon = "plus",
  art,
  title,
  body,
  action,
}: {
  icon?: IconName;
  /** An illustration from src/art (preferred over the icon on first-run screens). */
  art?: ImageSourcePropType;
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  return (
    <View style={styles.empty}>
      {art ? (
        <Image source={art} style={styles.emptyArt} resizeMode="contain" accessibilityIgnoresInvertColors />
      ) : (
        <View style={styles.emptyIcon}>
          <Icon name={icon} size={30} color={palette.primary} />
        </View>
      )}
      <Text style={[type.heading, { textAlign: "center" }]}>{title}</Text>
      {body ? <Text style={[type.body, { color: palette.inkSoft, textAlign: "center" }]}>{body}</Text> : null}
      {action}
    </View>
  );
}

type ToastMsg = { id: number; text: string; action?: { label: string; onPress: () => void } };
let push: ((m: Omit<ToastMsg, "id">) => void) | null = null;

/** Show a short confirmation ("Saved", "Deleted · Undo"). Mount <ToastHost/> once in App. */
export function toast(text: string, action?: ToastMsg["action"]): void {
  push?.({ text, action });
}

export function ToastHost({ bottom = 96 }: { bottom?: number }) {
  const [msg, setMsg] = useState<ToastMsg | null>(null);
  useEffect(() => {
    let n = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    push = (m) => {
      if (timer) clearTimeout(timer);
      setMsg({ ...m, id: ++n });
      timer = setTimeout(() => setMsg(null), m.action ? 5000 : 2200);
    };
    return () => {
      push = null;
      if (timer) clearTimeout(timer);
    };
  }, []);
  if (!msg) return null;
  return (
    <Animated.View key={msg.id} entering={FadeInDown.duration(200)} exiting={FadeOutDown.duration(160)} style={[styles.toast, { bottom }]} accessibilityLiveRegion="polite">
      <Text style={[type.bodyStrong, { color: "#fff", flex: 1 }]}>{msg.text}</Text>
      {msg.action ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={msg.action.label}
          hitSlop={10}
          onPress={() => {
            msg.action?.onPress();
            setMsg(null);
          }}
        >
          <Text style={[type.button, { color: "#A5B4FC" }]}>{msg.action.label}</Text>
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bottom: { flex: 1, justifyContent: "flex-end" },
  sheet: { backgroundColor: palette.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingHorizontal: space.lg, gap: space.lg, ...shadowStrong },
  grabber: { alignSelf: "center", width: 40, height: 5, borderRadius: 3, backgroundColor: palette.border, marginTop: space.sm },
  titleRow: { flexDirection: "row", alignItems: "center" },
  empty: { alignItems: "center", gap: space.md, paddingVertical: space.xxl, paddingHorizontal: space.lg },
  emptyArt: { width: 180, height: 140 },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: palette.primarySoft, alignItems: "center", justifyContent: "center" },
  toast: { position: "absolute", left: space.lg, right: space.lg, backgroundColor: palette.ink, borderRadius: radius.md, paddingHorizontal: space.lg, minHeight: 52, flexDirection: "row", alignItems: "center", gap: space.md, ...shadowStrong },
});
