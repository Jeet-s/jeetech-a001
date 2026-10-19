import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Tappable } from "./Pressable";
import { Icon, type IconName } from "./Icon";
import { useBannerHeight } from "../modules/layout";
import { fonts, palette, space } from "./theme";

export const TAB_BAR_HEIGHT = 64;

/** Bottom tab bar. Sits above the banner ad (if any) and the gesture area. */
export function TabBar<T extends string>({ tabs, active, onChange }: { tabs: { id: T; label: string; icon: IconName }[]; active: T; onChange: (id: T) => void }) {
  const insets = useSafeAreaInsets();
  const banner = useBannerHeight();
  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom, bottom: banner }]} accessibilityRole="tablist">
      {tabs.map((t) => {
        const on = t.id === active;
        return (
          <Tappable key={t.id} label={t.label} role="tab" accessibilityState={{ selected: on }} sound={null} onPress={() => onChange(t.id)} style={styles.tab}>
            <View style={[styles.pill, on && { backgroundColor: palette.primarySoft }]}>
              <Icon name={t.icon} size={22} color={on ? palette.primary : palette.inkMuted} />
            </View>
            <Text style={[styles.label, { color: on ? palette.primary : palette.inkMuted }]}>{t.label}</Text>
          </Tappable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { position: "absolute", left: 0, right: 0, flexDirection: "row", backgroundColor: palette.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border },
  tab: { flex: 1, height: TAB_BAR_HEIGHT, alignItems: "center", justifyContent: "center", gap: 2 },
  pill: { width: 56, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  label: { fontFamily: fonts.medium, fontSize: 12, marginTop: space.xs / 2 },
});
