import { useEffect, useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useDerivedValue, useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";
import { Canvas, Group, Path, Skia } from "@shopify/react-native-skia";
import { LinearGradient } from "expo-linear-gradient";
import { categorical, gradients, palette, space, type } from "./theme";

/** Animated circular progress (0..1) with a centred label. */
export function ProgressRing({
  value,
  size = 120,
  stroke = 12,
  color = palette.primary,
  track = palette.primarySoft,
  label,
  sublabel,
  labelColor,
  sublabelColor,
}: {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  track?: string;
  label?: string;
  sublabel?: string;
  /** Override the centred label colour (e.g. white on a gradient hero). */
  labelColor?: string;
  sublabelColor?: string;
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
        {label ? <Text style={[type.number, { fontSize: size * 0.22 }, labelColor ? { color: labelColor } : null]}>{label}</Text> : null}
        {sublabel ? <Text style={[type.caption, sublabelColor ? { color: sublabelColor } : null]}>{sublabel}</Text> : null}
      </View>
    </View>
  );
}

/** Category donut: colored arcs sized by share, with a total in the middle.
 *  Uses the same envelope colors as the list so the mapping reads instantly. */
export function Donut({
  slices,
  size = 148,
  stroke = 22,
  centerValue,
  centerLabel,
}: {
  slices: { color: string; value: number; label: string }[];
  size?: number;
  stroke?: number;
  centerValue?: string;
  centerLabel?: string;
}) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withTiming(1, { duration: 650 });
  }, [slices, p]);
  const r = (size - stroke) / 2;
  const total = Math.max(1, slices.reduce((a, s) => a + s.value, 0));
  const circle = useMemo(() => Skia.PathBuilder.Make().addCircle(size / 2, size / 2, r).build(), [size, r]);
  // Pre-compute cumulative start/end fractions for each arc (with a tiny gap).
  const arcs = useMemo(() => {
    let acc = 0;
    return slices.map((sl) => {
      const frac = sl.value / total;
      const start = acc;
      acc += frac;
      return { color: sl.color, start, end: Math.max(start, acc - 0.006) };
    });
  }, [slices, total]);
  const a11y = `Spending donut: ${slices.map((s) => `${s.label} ${Math.round((s.value / total) * 100)}%`).join(", ")}`;
  return (
    <View style={{ width: size, height: size }} accessible accessibilityRole="image" accessibilityLabel={a11y}>
      <Canvas style={StyleSheet.absoluteFill}>
        <Path path={circle} color={palette.surfaceAlt} style="stroke" strokeWidth={stroke} />
        <Group transform={[{ rotate: -Math.PI / 2 }]} origin={{ x: size / 2, y: size / 2 }}>
          {arcs.map((a, i) => (
            <AnimatedArc key={i} circle={circle} color={a.color} start={a.start} end={a.end} stroke={stroke} p={p} />
          ))}
        </Group>
      </Canvas>
      <View style={[StyleSheet.absoluteFill, styles.center]}>
        {centerValue ? <Text style={[type.number, { fontSize: size * 0.17 }]} numberOfLines={1}>{centerValue}</Text> : null}
        {centerLabel ? <Text style={type.caption}>{centerLabel}</Text> : null}
      </View>
    </View>
  );
}

function AnimatedArc({ circle, color, start, end, stroke, p }: { circle: ReturnType<typeof Skia.Path.MakeFromSVGString> | any; color: string; start: number; end: number; stroke: number; p: SharedValue<number> }) {
  // Grow each arc from its own start as the single progress value sweeps 0→1.
  const animEnd = useDerivedValue(() => start + (end - start) * p.value, [start, end]);
  return <Path path={circle} color={color} style="stroke" strokeWidth={stroke} strokeCap="butt" start={start} end={animEnd} />;
}

function Bar({ frac, colors, height, dim }: { frac: number; colors: readonly [string, string, ...string[]]; height: number; dim: boolean }) {
  const h = useSharedValue(0);
  useEffect(() => {
    h.value = withTiming(Math.max(0.04, frac) * height, { duration: 500 });
  }, [frac, height, h]);
  const style = useAnimatedStyle(() => ({ height: h.value }));
  return (
    <Animated.View style={[styles.bar, { opacity: dim ? 0.42 : 1 }, style]}>
      <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
    </Animated.View>
  );
}

/** Animated bar chart with vivid gradient bars (e.g. spending by week).
 *  `highlight` marks one bar (e.g. the latest), which renders at full strength
 *  while the rest sit back softly. */
export function BarChart({
  data,
  height = 140,
  color = palette.accent,
  gradient,
  highlight,
  summary,
  onPressBar,
}: {
  data: { label: string; value: number }[];
  height?: number;
  color?: string;
  /** Vertical gradient for the bars. Falls back to the brand emerald ramp. */
  gradient?: readonly [string, string, ...string[]];
  highlight?: number;
  /** Screen-reader summary. Falls back to a concise peak description (chart data
   * is a visual summary — reading every value aloud is overwhelming). */
  summary?: string;
  /** When set, each bar is tappable (drives value tooltips in Reports). */
  onPressBar?: (i: number) => void;
}) {
  const max = Math.max(1, ...data.map((d) => Math.abs(d.value)));
  const colors: readonly [string, string, ...string[]] = gradient ?? [color, gradients.brand[0]];
  const peak = data.reduce((best, d) => (d.value > best.value ? d : best), data[0] ?? { label: "", value: 0 });
  const a11y = summary ?? (data.length ? `Bar chart, ${data.length} bars from ${data[0].label} to ${data[data.length - 1].label}, highest ${peak.label}.` : "Bar chart, no data");
  // When nothing is explicitly highlighted, let the tallest bar stand out.
  const hot = highlight ?? data.indexOf(peak);
  return (
    <View accessible={!onPressBar} accessibilityRole="image" accessibilityLabel={a11y}>
      <View style={[styles.bars, { height }]}>
        {[0, 0.5, 1].map((g) => (
          <View key={`grid-${g}`} pointerEvents="none" style={[styles.grid, { bottom: g * height }]} />
        ))}
        {data.map((d, i) =>
          onPressBar ? (
            <Pressable key={`${d.label}-${i}`} style={styles.col} onPress={() => onPressBar(i)} accessibilityRole="button" accessibilityLabel={`${d.label}: ${Math.round(d.value)}`}>
              <Bar frac={Math.abs(d.value) / max} height={height} colors={colors} dim={i !== hot} />
            </Pressable>
          ) : (
            <View key={`${d.label}-${i}`} style={styles.col}>
              <Bar frac={Math.abs(d.value) / max} height={height} colors={colors} dim={i !== hot} />
            </View>
          ),
        )}
      </View>
      <View style={styles.labels}>
        {data.map((d, i) => (
          <Text key={`${d.label}-${i}`} style={[type.caption, styles.colLabel, i === hot && { color: palette.ink, fontFamily: type.bodyStrong.fontFamily }]}>{d.label}</Text>
        ))}
      </View>
    </View>
  );
}

/**
 * Donut for parts of a whole — a thin wrapper over {@link Donut} that takes the
 * factory-kit `data` shape (`{ label, value, color? }`) and falls back to the
 * categorical palette when a slice has no colour. Centre shows label/sublabel.
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
  const slices = data
    .filter((d) => d.value > 0)
    .map((d, i) => ({ label: d.label, value: d.value, color: d.color ?? categorical[i % categorical.length] }));
  return <Donut slices={slices} size={size} stroke={stroke} centerValue={label} centerLabel={sublabel} />;
}

/** Colour key for a chart: dot + label + value, same order/colours as the chart. */
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
  center: { alignItems: "center", justifyContent: "center" },
  bars: { flexDirection: "row", alignItems: "flex-end", gap: space.sm },
  col: { flex: 1, justifyContent: "flex-end" },
  bar: { width: "100%", borderTopLeftRadius: 7, borderTopRightRadius: 7, borderBottomLeftRadius: 2, borderBottomRightRadius: 2, overflow: "hidden" },
  labels: { flexDirection: "row", gap: space.sm, marginTop: space.sm },
  colLabel: { flex: 1, textAlign: "center" },
  legendRow: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 28 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  grid: { position: "absolute", left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: palette.border },
});
