import { useEffect } from "react";
import { StyleSheet, Text, View, type ViewStyle } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { gradient, palette, radius, shadowStrong, space, tones, type, type Tone } from "./theme";

/**
 * The ONE headline card per screen: the number the user opens the app for
 * (left to spend, today's streak, minutes focused) on the brand gradient,
 * with a label, an optional status line and an optional visual on the right
 * (a ProgressRing, an illustration). Flat white cards everywhere else.
 */
export function HeroCard({
  overline,
  value,
  caption,
  status,
  right,
  children,
  style,
}: {
  overline: string;
  value: string;
  caption?: string;
  status?: { label: string; tone: Tone };
  right?: React.ReactNode;
  children?: React.ReactNode;
  style?: ViewStyle;
}) {
  return (
    <LinearGradient colors={gradient.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.hero, style]}>
      <View style={styles.heroRow}>
        <View style={{ flex: 1, gap: 2 }} accessible accessibilityLabel={`${overline}: ${value}${caption ? `, ${caption}` : ""}`}>
          <Text style={[type.overline, { color: gradient.onHeroSoft }]}>{overline}</Text>
          <Text style={[type.hero, { color: gradient.onHero }]} numberOfLines={1} adjustsFontSizeToFit>
            {value}
          </Text>
          {caption ? <Text style={[type.label, { color: gradient.onHeroSoft }]}>{caption}</Text> : null}
          {status ? (
            <View style={[styles.heroPill]}>
              <View style={[styles.dot, { backgroundColor: tones[status.tone].bg }]} />
              <Text style={[type.label, { color: gradient.onHero }]}>{status.label}</Text>
            </View>
          ) : null}
        </View>
        {right}
      </View>
      {children}
    </LinearGradient>
  );
}

/** Small status pill: "On track", "Due today", "Over by $12", "Pro". */
export function Pill({ label, tone = "neutral", icon }: { label: string; tone?: Tone; icon?: React.ReactNode }) {
  const t = tones[tone];
  return (
    <View style={[styles.pill, { backgroundColor: t.bg }]}>
      {icon}
      <Text style={[type.label, { fontSize: 12, lineHeight: 16, color: t.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/**
 * Animated linear progress, 8dp thick. Tone follows the value unless given:
 * < 0.85 primary, ≥ 0.85 warning, > 1 danger (over budget / over limit).
 */
export function ProgressBar({ value, tone, color, height = 8 }: { value: number; tone?: Tone; color?: string; height?: number }) {
  const t = tone ?? (value > 1 ? "danger" : value >= 0.85 ? "warning" : "primary");
  const w = useSharedValue(0);
  useEffect(() => {
    w.value = withTiming(Math.max(0, Math.min(1, value)), { duration: 500, easing: Easing.out(Easing.cubic) });
  }, [value, w]);
  const fill = useAnimatedStyle(() => ({ width: `${w.value * 100}%` }));
  return (
    <View
      style={[styles.track, { height, borderRadius: height / 2, backgroundColor: tones[t].bg }]}
      accessible
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(Math.min(1, value) * 100) }}
    >
      <Animated.View style={[{ height, borderRadius: height / 2, backgroundColor: color ?? tones[t].fg }, fill]} />
    </View>
  );
}

/**
 * A figure with tabular digits (columns line up) and an optional sign colour:
 * tone="auto" → negative danger, positive success. Format the string yourself
 * (Intl / the app's formatMoney) — this only styles it.
 */
export function Amount({
  value,
  sign,
  tone,
  size = "row",
  style,
}: {
  value: string;
  sign?: number;
  tone?: Tone | "auto";
  size?: "row" | "number" | "hero";
  style?: object;
}) {
  const t = tone === "auto" ? (sign == null || sign === 0 ? undefined : sign < 0 ? "danger" : "success") : tone;
  const base = size === "hero" ? type.hero : size === "number" ? type.number : type.amount;
  return (
    <Text style={[base, t ? { color: tones[t].fg } : null, style]} numberOfLines={1}>
      {value}
    </Text>
  );
}

/** Loading placeholder with a soft pulse. Show skeleton rows, never a blank list or a spinner alone. */
export function Skeleton({ width = "100%", height = 16, round = false, style }: { width?: number | `${number}%`; height?: number; round?: boolean; style?: ViewStyle }) {
  const o = useSharedValue(0.5);
  useEffect(() => {
    o.value = withRepeat(withTiming(1, { duration: 700 }), -1, true);
  }, [o]);
  const pulse = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[{ width, height, borderRadius: round ? height / 2 : radius.sm, backgroundColor: palette.surfaceAlt }, pulse, style]} />;
}

/** A ready-made skeleton for a list: `rows` × (icon + two lines + trailing figure). */
export function SkeletonList({ rows = 4 }: { rows?: number }) {
  return (
    <View style={{ gap: space.lg }} accessibilityLabel="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} style={styles.skRow}>
          <Skeleton width={36} height={36} round />
          <View style={{ flex: 1, gap: 6 }}>
            <Skeleton width="60%" height={14} />
            <Skeleton width="35%" height={12} />
          </View>
          <Skeleton width={56} height={14} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: radius.xl, padding: space.xl, gap: space.lg, ...shadowStrong, shadowColor: gradient.hero[1], shadowOpacity: 0.28 },
  heroRow: { flexDirection: "row", alignItems: "center", gap: space.lg },
  heroPill: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", marginTop: space.sm, backgroundColor: "rgba(255,255,255,0.16)", borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  pill: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
  track: { width: "100%", overflow: "hidden" },
  skRow: { flexDirection: "row", alignItems: "center", gap: space.md },
});
