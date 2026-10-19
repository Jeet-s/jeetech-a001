import { useEffect, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { Canvas, Group, Path, Skia } from "@shopify/react-native-skia";
import { categorical, palette, space, type } from "./theme";

/** Animated circular progress (0..1) with a centred label. */
export function ProgressRing({
  value,
  size = 120,
  stroke = 12,
  color = palette.primary,
  track = palette.primarySoft,
  label,
  sublabel,
  labelColor = palette.ink,
}: {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  track?: string;
  label?: string;
  sublabel?: string;
  /** On a HeroCard: "#fff" with color="#fff" and track="rgba(255,255,255,0.22)". */
  labelColor?: string;
}) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withTiming(Math.max(0, Math.min(1, value)), { duration: 600 });
  }, [value, p]);
  const r = (size - stroke) / 2;
  const circle = useMemo(() => Skia.PathBuilder.Make().addCircle(size / 2, size / 2, r).build(), [size, r]);
  return (
    <View style={{ width: size, height: size }} accessible accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}>
      <Canvas style={StyleSheet.absoluteFill}>
        <Path path={circle} color={track} style="stroke" strokeWidth={stroke} />
        {/* The circle starts at 3 o'clock: rotate so progress grows from 12 o'clock. */}
        <Group transform={[{ rotate: -Math.PI / 2 }]} origin={{ x: size / 2, y: size / 2 }}>
          <Path path={circle} color={color} style="stroke" strokeWidth={stroke} strokeCap="round" start={0} end={p} />
        </Group>
      </Canvas>
      <View style={[StyleSheet.absoluteFill, styles.center]}>
        {label ? <Text style={[type.number, { fontSize: size * 0.22, color: labelColor }]}>{label}</Text> : null}
        {sublabel ? <Text style={[type.caption, labelColor !== palette.ink && { color: labelColor, opacity: 0.8 }]}>{sublabel}</Text> : null}
      </View>
    </View>
  );
}

function Bar({ frac, color, height }: { frac: number; color: string; height: number }) {
  const h = useSharedValue(0);
  useEffect(() => {
    h.value = withTiming(Math.max(0.04, frac) * height, { duration: 500 });
  }, [frac, height, h]);
  const style = useAnimatedStyle(() => ({ height: h.value }));
  return <Animated.View style={[styles.bar, { backgroundColor: color }, style]} />;
}

/** Simple animated bar chart (e.g. last 7 days). `highlight` marks one bar (today). */
export function BarChart({
  data,
  height = 140,
  color = palette.primary,
  highlight,
  showValues = false,
  format,
}: {
  data: { label: string; value: number }[];
  height?: number;
  color?: string;
  highlight?: number;
  /** Print each bar's value above it (use `format` for money/durations). */
  showValues?: boolean;
  format?: (v: number) => string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <View accessible accessibilityLabel={data.map((d) => `${d.label} ${d.value}`).join(", ")}>
      {showValues ? (
        <View style={styles.labels}>
          {data.map((d, i) => (
            <Text key={`v-${d.label}-${i}`} style={[type.caption, styles.colLabel, { fontVariant: ["tabular-nums"] }, i === highlight && { color: palette.ink }]} numberOfLines={1}>
              {format ? format(d.value) : d.value}
            </Text>
          ))}
        </View>
      ) : null}
      <View style={[styles.bars, { height }]}>
        {[0, 0.5, 1].map((g) => (
          <View key={g} pointerEvents="none" style={[styles.grid, { bottom: g * height }]} />
        ))}
        {data.map((d, i) => (
          <View key={`${d.label}-${i}`} style={styles.col}>
            <Bar frac={d.value / max} height={height} color={i === highlight ? color : `${color}66`} />
          </View>
        ))}
      </View>
      <View style={styles.labels}>
        {data.map((d, i) => (
          <Text key={`${d.label}-${i}`} style={[type.caption, styles.colLabel, i === highlight && { color: palette.ink }]}>{d.label}</Text>
        ))}
      </View>
    </View>
  );
}

/**
 * Donut for parts of a whole (spend by category, time by project): one stroke width,
 * categorical colours in order, the total in the centre, gaps between segments.
 * Pair with <Legend> — never make users guess what a colour means.
 */
export function DonutChart({
  data,
  size = 160,
  stroke = 22,
  label,
  sublabel,
}: {
  data: { label: string; value: number; color?: string }[];
  size?: number;
  stroke?: number;
  label?: string;
  sublabel?: string;
}) {
  const total = data.reduce((a, d) => a + Math.max(0, d.value), 0);
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = 0;
    p.value = withTiming(1, { duration: 700 });
  }, [total, p]);
  const r = (size - stroke) / 2;
  const segments = useMemo(() => {
    const oval = Skia.XYWHRect(stroke / 2, stroke / 2, size - stroke, size - stroke);
    const gap = data.length > 1 ? 2.5 : 0; // degrees
    let at = -90;
    return data
      .filter((d) => d.value > 0 && total > 0)
      .map((d, i) => {
        const sweep = (d.value / total) * 360;
        const path = Skia.PathBuilder.Make().addArc(oval, at + gap / 2, Math.max(0.5, sweep - gap)).build();
        at += sweep;
        return { path, color: d.color ?? categorical[i % categorical.length] };
      });
  }, [data, total, size, stroke]);
  return (
    <View
      style={{ width: size, height: size }}
      accessible
      accessibilityLabel={`${label ?? ""} ${data.map((d) => `${d.label} ${total ? Math.round((d.value / total) * 100) : 0}%`).join(", ")}`}
    >
      <Canvas style={StyleSheet.absoluteFill}>
        <Path path={Skia.PathBuilder.Make().addCircle(size / 2, size / 2, r).build()} color={palette.surfaceAlt} style="stroke" strokeWidth={stroke} />
        {segments.map((s, i) => (
          <Path key={i} path={s.path} color={s.color} style="stroke" strokeWidth={stroke} strokeCap="butt" end={p} />
        ))}
      </Canvas>
      <View style={[StyleSheet.absoluteFill, styles.center]}>
        {label ? <Text style={[type.number, { fontSize: size * 0.15 }]} numberOfLines={1} adjustsFontSizeToFit>{label}</Text> : null}
        {sublabel ? <Text style={type.caption}>{sublabel}</Text> : null}
      </View>
    </View>
  );
}

/** Colour key for a chart: dot + label + value, in the same order/colours as the chart. */
export function Legend({ items }: { items: { label: string; value?: string; color?: string }[] }) {
  return (
    <View style={{ gap: space.sm }}>
      {items.map((it, i) => (
        <View key={`${it.label}-${i}`} style={styles.legendRow}>
          <View style={[styles.legendDot, { backgroundColor: it.color ?? categorical[i % categorical.length] }]} />
          <Text style={[type.body, { flex: 1 }]} numberOfLines={1}>{it.label}</Text>
          {it.value ? <Text style={type.amount}>{it.value}</Text> : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { position: "absolute", left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: palette.border },
  legendRow: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 28 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  center: { alignItems: "center", justifyContent: "center" },
  bars: { flexDirection: "row", alignItems: "flex-end", gap: space.sm },
  col: { flex: 1, justifyContent: "flex-end" },
  bar: { borderRadius: 6, width: "100%" },
  labels: { flexDirection: "row", gap: space.sm, marginTop: space.sm },
  colLabel: { flex: 1, textAlign: "center" },
});
