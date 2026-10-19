import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { springs } from "./theme";
import { haptic, play, type Sfx } from "../audio/sfx";

const APressable = Animated.createAnimatedComponent(Pressable);

/**
 * Base tappable: springs down on press, gives haptic (+ optional sound)
 * feedback, and always carries an accessibility label. Every custom tappable
 * surface in the app is built on this — never a bare Pressable/Touchable.
 */
export function Tappable({
  onPress,
  label,
  sound = "tap",
  scale = 0.97,
  style,
  children,
  disabled,
  role = "button",
  ...rest
}: Omit<PressableProps, "style" | "children"> & {
  label: string;
  sound?: Sfx | null;
  scale?: number;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  role?: "button" | "link" | "checkbox" | "tab" | "switch";
}) {
  const p = useSharedValue(0);
  // Scale springs down for a tactile feel; opacity drops on a fast linear ramp
  // so the press reads as "caught" within ~80ms even before the spring settles.
  const o = useSharedValue(0);
  const anim = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - p.value * (1 - scale) }],
    opacity: 1 - o.value * 0.38,
  }));
  return (
    <APressable
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      hitSlop={6}
      onPressIn={() => {
        p.value = withSpring(1, springs.press);
        o.value = withTiming(1, { duration: 80 });
        // Fire the haptic the moment the finger lands — immediate perceived
        // responsiveness — while the sound (if any) plays on release. Tappables
        // that manage their own feedback pass sound={null} and are left alone.
        if (!disabled && sound) haptic("select");
      }}
      onPressOut={() => {
        p.value = withSpring(0, springs.press);
        o.value = withTiming(0, { duration: 140 });
      }}
      onPress={(e) => {
        if (sound) play(sound);
        onPress?.(e);
      }}
      style={[anim, style, disabled ? { opacity: 0.45 } : null]}
      {...rest}
    >
      {children}
    </APressable>
  );
}
