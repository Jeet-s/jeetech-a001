import { StyleSheet, Text, View } from "react-native";
import Animated, { useAnimatedStyle, withSpring, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Tappable } from "./Pressable";
import { Icon, type IconName } from "./Icon";
import { useBannerHeight } from "../modules/layout";
import { durations, fonts, palette, space, springs } from "./theme";

export const TAB_BAR_HEIGHT = 64;

/**
 * Minimum space kept below the tabs so the Android system gesture pill never
 * overlaps a tab. Some devices (notably large tablets) under-report the bottom
 * safe-area inset, so we floor it here rather than trust the inset alone.
 */
const GESTURE_CLEARANCE = space.xl;

/** One tab. The active pill fades + pops in so switching tabs feels alive. */
function Tab<T extends string>({ tab, on, onChange }: { tab: { id: T; label: string; icon: IconName }; on: boolean; onChange: (id: T) => void }) {
  const pill = useAnimatedStyle(() => ({
    backgroundColor: withTiming(on ? palette.primarySoft : "transparent", { duration: durations.base }),
    transform: [{ scale: withSpring(on ? 1 : 0.82, springs.pop) }],
  }));
  return (
    <Tappable label={tab.label} role="tab" accessibilityState={{ selected: on }} sound={null} onPress={() => onChange(tab.id)} style={styles.tab}>
      <Animated.View style={[styles.pill, pill]}>
        <Icon name={tab.icon} size={22} color={on ? palette.primary : palette.inkMuted} />
      </Animated.View>
      <Text style={[styles.label, { color: on ? palette.primary : palette.inkMuted }]}>{tab.label}</Text>
    </Tappable>
  );
}

/** Bottom tab bar. Sits above the banner ad (if any) and the gesture area. */
export function TabBar<T extends string>({ tabs, active, onChange }: { tabs: { id: T; label: string; icon: IconName }[]; active: T; onChange: (id: T) => void }) {
  const insets = useSafeAreaInsets();
  const banner = useBannerHeight();
  // Glide up/down smoothly when the banner appears or disappears.
  const pos = useAnimatedStyle(() => ({ bottom: withTiming(banner, { duration: durations.base }) }));
  return (
    <Animated.View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, GESTURE_CLEARANCE) }, pos]} accessibilityRole="tablist">
      {tabs.map((t) => (
        <Tab key={t.id} tab={t} on={t.id === active} onChange={onChange} />
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: { position: "absolute", left: 0, right: 0, flexDirection: "row", backgroundColor: palette.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border },
  tab: { flex: 1, height: TAB_BAR_HEIGHT, alignItems: "center", justifyContent: "center", gap: 2 },
  pill: { width: 56, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  label: { fontFamily: fonts.medium, fontSize: 12, marginTop: space.xs / 2 },
});
