import { forwardRef, useState } from "react";
import { StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import Animated, { useAnimatedStyle, withSpring, withTiming } from "react-native-reanimated";
import { Tappable } from "./Pressable";
import { Icon, type IconName } from "./Icon";
import { durations, fonts, palette, radius, space, springs, TOUCH, type } from "./theme";
import { feedback } from "../audio/sfx";

/** Labelled text input with focus ring, helper and error text. */
export const TextField = forwardRef<React.ComponentRef<typeof TextInput>, TextInputProps & { label: string; error?: string | null; helper?: string }>(
  function TextField({ label, error, helper, style, onFocus, onBlur, ...rest }, ref) {
    const [focused, setFocused] = useState(false);
    const border = error ? palette.danger : focused ? palette.primary : palette.border;
    const a11y = label || (typeof rest.placeholder === "string" ? rest.placeholder : undefined);
    return (
      <View style={{ gap: 6 }}>
        {label ? <Text style={type.label}>{label}</Text> : null}
        <TextInput
          ref={ref}
          accessibilityLabel={a11y}
          placeholderTextColor={palette.inkMuted}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[styles.input, { borderColor: border }, style]}
          {...rest}
        />
        {error ? <Text style={[type.caption, { color: palette.danger }]}>{error}</Text> : helper ? <Text style={type.caption}>{helper}</Text> : null}
      </View>
    );
  },
);

/** Settings-style switch row. Pass `accessibilityLabel` for compact, label-less toggles. */
export function Toggle({ label, value, onChange, description, accessibilityLabel }: { label: string; value: boolean; onChange: (v: boolean) => void; description?: string; accessibilityLabel?: string }) {
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: withSpring(value ? 20 : 0, springs.press) }] }));
  const track = useAnimatedStyle(() => ({ backgroundColor: withTiming(value ? palette.primary : palette.border, { duration: 160 }) }));
  return (
    <Tappable label={accessibilityLabel ?? label} role="switch" sound={null} scale={0.99} onPress={() => { feedback("pop", "select"); onChange(!value); }} style={label ? styles.row : undefined} accessibilityState={{ checked: value }}>
      {label ? (
        <View style={{ flex: 1 }}>
          <Text style={type.bodyStrong}>{label}</Text>
          {description ? <Text style={type.caption}>{description}</Text> : null}
        </View>
      ) : null}
      <Animated.View style={[styles.track, track]}>
        <Animated.View style={[styles.knob, knob]} />
      </Animated.View>
    </Tappable>
  );
}

/** Tappable list row: icon, title, subtitle, trailing value/chevron. */
export function ListItem({
  title,
  subtitle,
  icon,
  iconTint = palette.primary,
  value,
  trailing,
  onPress,
  chevron = !!onPress,
  destructive,
}: {
  title: string;
  subtitle?: string;
  icon?: IconName;
  iconTint?: string;
  value?: string;
  /** Custom right side (an Amount, a Pill, a column) instead of `value`. */
  trailing?: React.ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  destructive?: boolean;
}) {
  const body = (
    <>
      {icon ? (
        <View style={[styles.iconWrap, { backgroundColor: destructive ? palette.dangerSoft : iconTint === palette.primary ? palette.primarySoft : `${iconTint}1F` }]}>
          <Icon name={icon} size={20} color={destructive ? palette.danger : iconTint} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={[type.bodyStrong, destructive && { color: palette.danger }]} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={type.caption} numberOfLines={2}>{subtitle}</Text> : null}
      </View>
      {trailing ?? (value ? <Text style={[type.amount, { color: palette.inkSoft }]}>{value}</Text> : null)}
      {chevron ? <Icon name="chevronRight" size={20} color={palette.inkMuted} /> : null}
    </>
  );
  return onPress ? (
    <Tappable label={title} onPress={onPress} scale={0.98} style={styles.item}>{body}</Tappable>
  ) : (
    <View style={styles.item} accessible accessibilityLabel={value ? `${title}: ${value}` : title}>{body}</View>
  );
}

/** Small selectable pill. */
export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress?: () => void }) {
  return (
    <Tappable
      label={label}
      role="checkbox"
      accessibilityState={{ checked: !!selected }}
      onPress={onPress}
      sound="pop"
      style={[styles.chip, selected ? { backgroundColor: palette.primary, borderColor: palette.primary } : null]}
    >
      <Text style={[type.label, { color: selected ? palette.onPrimary : palette.ink }]}>{label}</Text>
    </Tappable>
  );
}

/** Segmented control for 2-4 options. The selected pill fades in smoothly. */
export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={styles.segment} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <SegItem key={o.value} label={o.label} on={on} onPress={() => onChange(o.value)} />
        );
      })}
    </View>
  );
}

function SegItem({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const pill = useAnimatedStyle(() => ({
    backgroundColor: withTiming(on ? palette.surface : "transparent", { duration: durations.fast }),
    opacity: withTiming(on ? 1 : 0, { duration: durations.fast }),
  }));
  return (
    <Tappable label={label} role="tab" accessibilityState={{ selected: on }} sound="pop" onPress={onPress} style={styles.segItem}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.segFill, pill]} />
      <Text style={[type.label, { color: on ? palette.ink : palette.inkSoft }]}>{label}</Text>
    </Tappable>
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: TOUCH,
    borderWidth: 1.5,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    fontFamily: fonts.regular,
    fontSize: 16,
    color: palette.ink,
    backgroundColor: palette.surface,
  },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: TOUCH + 8, paddingVertical: space.sm },
  track: { width: 48, height: 28, borderRadius: 14, padding: 3 },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: "#fff", elevation: 2 },
  item: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: TOUCH + 12, paddingVertical: space.sm },
  iconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  chip: { minHeight: 36, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface, justifyContent: "center" },
  segment: { flexDirection: "row", backgroundColor: palette.surfaceAlt, borderRadius: radius.md, padding: 3 },
  segItem: { flex: 1, minHeight: 38, alignItems: "center", justifyContent: "center", borderRadius: radius.sm, overflow: "hidden" },
  segFill: { borderRadius: radius.sm, backgroundColor: palette.surface, shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
});
