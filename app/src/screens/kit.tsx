import { useEffect, useState } from "react";
import { StyleSheet, Text, View, type TextStyle, type ViewStyle } from "react-native";
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import {
  Icon,
  Tappable,
  type IconName,
  fonts,
  palette,
  radius,
  space,
  type,
} from "../ui";
import { PATHS } from "../ui/Icon";
import { feedback } from "../audio/sfx";
import { calc, calcToMinor, formatMoney, type Minor } from "../core/money";
import type { TxnError } from "../core/transactions";
import type { EnvelopeError } from "../core/envelopes";
import type { AccountError } from "../core/accounts";
import type { RecurringError } from "../core/recurring";
import type { AccountType, ScheduleKind, TxnType } from "../core/model";

// ─────────────────────────────── helpers ───────────────────────────────────

/** An envelope's stored icon name, falling back to a known glyph. */
export function iconFor(name: string | undefined): IconName {
  return name && name in PATHS ? (name as IconName) : "cart";
}

const TABULAR: TextStyle = { fontVariant: ["tabular-nums"] };

/** Right-aligned, tabular currency amount. `compact` drops a trailing all-zero
 *  ".00" (display only — "$57.00" → "$57", but "$57.50" stays) to keep primary
 *  list figures clean. */
export function Money({
  minor,
  currency,
  style,
  sign,
  compact,
}: {
  minor: Minor;
  currency: string;
  style?: TextStyle | TextStyle[];
  sign?: boolean;
  compact?: boolean;
}) {
  let text = formatMoney(minor, currency, { sign });
  if (compact) text = text.replace(/\.0+$/, "");
  return (
    <Text style={[TABULAR, ...(Array.isArray(style) ? style : [style])]} numberOfLines={1}>
      {text}
    </Text>
  );
}

/** Rounded, tinted icon tile for an envelope. */
export function EnvelopeGlyph({ icon, color, size = 40 }: { icon: string; color: string; size?: number }) {
  return (
    <View
      style={{ width: size, height: size, borderRadius: size * 0.3, backgroundColor: color + "22", alignItems: "center", justifyContent: "center" }}
    >
      <Icon name={iconFor(icon)} size={Math.round(size * 0.5)} color={color} />
    </View>
  );
}

/** Animated allocated/spent progress bar for an envelope row. */
export function EnvelopeBar({ fraction, color, overspent, height = 8 }: { fraction: number; color: string; overspent?: boolean; height?: number }) {
  const f = Math.max(0, Math.min(1, fraction));
  const w = useSharedValue(0);
  useEffect(() => {
    w.value = withTiming(f, { duration: 480 });
  }, [f, w]);
  const fill = useAnimatedStyle(() => ({ width: `${w.value * 100}%` }));
  return (
    <View style={[styles.track, { height, borderRadius: height / 2 }]}>
      <Animated.View style={[styles.fill, { height, borderRadius: height / 2, backgroundColor: overspent ? palette.danger : color }, fill]} />
    </View>
  );
}

// ───────────────────────────── calculator keypad ───────────────────────────

const OPS = ["+", "−", "×", "÷", "%"] as const;
const GLYPH: Record<string, string> = { "−": "-", "×": "*", "÷": "/" };

/**
 * On-screen amount entry with a full calculator (+ − × ÷ and percent). The
 * value is the raw expression string; the live result is shown below and
 * committed with calcToMinor by the caller.
 */
export function AmountKeypad({
  expr,
  onExpr,
  currency,
  tone = palette.ink,
}: {
  expr: string;
  onExpr: (next: string) => void;
  currency: string;
  tone?: string;
}) {
  // Keypad is numeric by default; the +−×÷ panel is opt-in so the common case
  // (type a number, save) stays uncluttered.
  const [showOps, setShowOps] = useState(false);
  const result = calcToMinor(expr, currency);
  const hasOp = /[+\-*/%]/.test(expr.replace(/^-/, ""));
  const press = (ch: string) => {
    feedback("tap", "light");
    const last = expr.slice(-1);
    if ("+-*/%".includes(ch)) {
      if (!expr && ch !== "-") return; // can't start with a binary op (allow leading minus)
      if ("+-*/".includes(last)) return onExpr(expr.slice(0, -1) + ch); // replace trailing op
    }
    if (expr.length >= 24) return;
    onExpr(expr + ch);
  };
  const back = () => {
    feedback("tap", "light");
    onExpr(expr.slice(0, -1));
  };
  const Key = ({ label, value }: { label: string; value: string }) => (
    <Tappable label={label} sound={null} onPress={() => press(value)} style={styles.key}>
      <Text style={styles.keyTxt}>{label}</Text>
    </Tappable>
  );
  const income = tone === palette.success;
  const bad = result == null && !!expr;
  const underline = bad ? palette.danger : expr ? (income ? palette.success : palette.primary) : palette.border;
  return (
    <View style={{ gap: space.md }}>
      <View style={[styles.display, { borderBottomColor: underline }]}>
        <Text style={[type.caption, { minHeight: 16, color: income ? palette.success : palette.inkSoft }]} numberOfLines={1}>
          {hasOp && result != null ? expr.replace(/\*/g, "×").replace(/\//g, "÷") : " "}
        </Text>
        <Text style={[styles.displayAmount, TABULAR, { color: bad ? palette.danger : tone }]} numberOfLines={1} adjustsFontSizeToFit>
          {expr ? (result != null ? formatMoney(result, currency) : formatMoney(0, currency)) : formatMoney(0, currency)}
        </Text>
      </View>

      <View style={styles.opBar}>
        <Tappable
          label={showOps ? "Hide calculator" : "Show calculator"}
          role="switch"
          accessibilityState={{ checked: showOps }}
          sound="pop"
          onPress={() => setShowOps((v) => !v)}
          style={[styles.opToggle, showOps && { backgroundColor: palette.primarySoft, borderColor: palette.primary }]}
        >
          <Text style={[type.label, { color: showOps ? palette.primary : palette.inkSoft }]}>＋−×÷</Text>
        </Tappable>
        {showOps ? (
          <Animated.View entering={FadeIn.duration(140)} exiting={FadeOut.duration(120)} style={styles.opRow}>
            {OPS.map((o) => (
              <Tappable key={o} label={`operator ${o}`} sound={null} onPress={() => press(GLYPH[o] ?? o)} style={styles.opKey}>
                <Text style={[styles.opTxt, { color: palette.primary }]}>{o}</Text>
              </Tappable>
            ))}
          </Animated.View>
        ) : null}
      </View>

      <View style={styles.pad}>
        {[["7", "8", "9"], ["4", "5", "6"], ["1", "2", "3"]].map((row, i) => (
          <View key={i} style={styles.padRow}>
            {row.map((d) => (
              <Key key={d} label={d} value={d} />
            ))}
          </View>
        ))}
        <View style={styles.padRow}>
          <Key label="." value="." />
          <Key label="0" value="0" />
          <Tappable label="Delete" sound={null} onPress={back} style={styles.key}>
            <Icon name="close" size={22} color={palette.inkSoft} />
          </Tappable>
        </View>
      </View>
    </View>
  );
}

/** Evaluate an expression to a plain number for previews (null if incomplete). */
export const evalExpr = (expr: string): number | null => calc(expr);

// ───────────────────────────── select / chips ──────────────────────────────

/** A labelled row that shows the current pick and opens a picker when tapped. */
export function SelectRow({
  label,
  value,
  icon,
  onPress,
  tint = palette.inkSoft,
}: {
  label: string;
  value: string;
  icon?: IconName;
  onPress: () => void;
  tint?: string;
}) {
  return (
    <Tappable label={`${label}: ${value}`} onPress={onPress} scale={0.99} style={styles.selectRow}>
      {icon ? <Icon name={icon} size={20} color={tint} /> : null}
      <Text style={[type.label, { flex: 1 }]}>{label}</Text>
      <Text style={[type.bodyStrong, { color: palette.ink }]} numberOfLines={1}>{value}</Text>
      <Icon name="chevronRight" size={18} color={palette.inkMuted} />
    </Tappable>
  );
}

/** Horizontal row of selectable option pills. */
export function OptionChips<T extends string>({
  options,
  value,
  onChange,
  wrap = true,
}: {
  options: { value: T; label: string; color?: string }[];
  value: T | null;
  onChange: (v: T) => void;
  wrap?: boolean;
}) {
  return (
    <View style={[styles.chipRow, wrap && { flexWrap: "wrap" }]}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Tappable
            key={o.value}
            label={o.label}
            role="checkbox"
            accessibilityState={{ checked: on }}
            sound="pop"
            onPress={() => onChange(o.value)}
            style={[styles.optChip, on && { backgroundColor: o.color ?? palette.primary, borderColor: o.color ?? palette.primary }]}
          >
            {o.color && !on ? <View style={[styles.dot, { backgroundColor: o.color }]} /> : null}
            <Text style={[type.label, { color: on ? palette.onPrimary : palette.ink }]}>{o.label}</Text>
          </Tappable>
        );
      })}
    </View>
  );
}

/** Two-column grid of selectable envelope cards (icon + name + tick). Used for
 *  picking an envelope when adding a transaction — far easier to scan than a
 *  wrapping row of pills, with the colour/icon doing the recognising. */
export function EnvelopeCardPicker<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; color?: string; icon?: string }[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.cardGrid}>
      {options.map((o) => {
        const on = o.value === value;
        const color = o.color ?? palette.inkMuted;
        return (
          <Tappable
            key={o.value}
            label={o.label}
            role="checkbox"
            accessibilityState={{ checked: on }}
            sound="pop"
            onPress={() => onChange(o.value)}
            style={[styles.envCard, on && { borderColor: color, backgroundColor: color + "14" }]}
          >
            {o.color || o.icon ? (
              <EnvelopeGlyph icon={o.icon ?? "wallet"} color={color} size={30} />
            ) : (
              <View style={styles.envCardNone}><Icon name="close" size={16} color={palette.inkMuted} /></View>
            )}
            <Text style={[type.label, { flex: 1, color: palette.ink }]} numberOfLines={1}>{o.label}</Text>
            {on ? <Icon name="check" size={16} color={color} /> : null}
          </Tappable>
        );
      })}
    </View>
  );
}

// ─────────────────────────── labels & copy maps ────────────────────────────

export const txnError: Record<TxnError, string> = {
  amount_required: "Enter an amount.",
  bad_amount: "Enter an amount greater than zero.",
  no_account: "Choose an account.",
  no_envelope: "Choose an envelope.",
  same_account: "Pick two different accounts.",
  not_found: "That item is no longer available.",
  split_mismatch: "The parts must add up to the total.",
  split_too_few: "Split across at least two envelopes.",
  split_bad_part: "Every part needs an amount above zero.",
};

export const envelopeError: Record<EnvelopeError, string> = {
  empty_name: "Give the envelope a name.",
  too_long: "Keep the name under 40 characters.",
  duplicate: "You already have an envelope with this name.",
  bad_color: "Pick a valid colour.",
  not_found: "That envelope is no longer available.",
  cycle: "An envelope can't be nested inside itself.",
};

export const accountError: Record<AccountError, string> = {
  empty_name: "Give the account a name.",
  too_long: "Keep the name under 40 characters.",
  duplicate: "You already have an account with this name.",
  not_found: "That account is no longer available.",
  limit: "You've reached the account limit.",
};

export const recurringError: Record<RecurringError, string> = {
  empty_name: "Give the scheduled item a name.",
  bad_amount: "Enter an amount greater than zero.",
  no_account: "Choose an account.",
  no_envelope: "Choose an envelope.",
  bad_schedule: "Check the schedule — the dates look off.",
  not_found: "That item is no longer available.",
};

export const accountTypeLabel: Record<AccountType, string> = {
  cash: "Cash",
  checking: "Checking",
  savings: "Savings",
  credit: "Credit",
};

export const txnTypeLabel: Record<TxnType, string> = {
  expense: "Expense",
  income: "Deposit",
  transfer: "Transfer",
};

export const scheduleKindLabel: Record<ScheduleKind, string> = {
  weekly: "Weekly",
  biweekly: "Every 2 weeks",
  semiMonthly: "Twice a month",
  monthly: "Monthly",
  nDays: "Every N days",
  firstWeekday: "First weekday",
  lastWeekday: "Last weekday",
  nthWeekday: "Nth weekday",
};

export const WEEKDAY_OPTS = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

export const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "INR", "JPY", "CNY", "BRL", "MXN", "CHF", "ZAR", "NZD", "KRW"];

const styles = StyleSheet.create({
  track: { backgroundColor: palette.surfaceAlt, overflow: "hidden", width: "100%" },
  fill: { position: "absolute", left: 0, top: 0 },
  display: { alignItems: "center", paddingVertical: space.sm, paddingHorizontal: space.sm, borderBottomWidth: 2 },
  displayAmount: { fontFamily: fonts.bold, fontSize: 36, lineHeight: 44, letterSpacing: -0.8, color: palette.ink },
  opBar: { flexDirection: "row", alignItems: "center", gap: space.sm },
  opToggle: { height: 44, paddingHorizontal: 16, borderRadius: radius.md, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface, alignItems: "center", justifyContent: "center" },
  opRow: { flex: 1, flexDirection: "row", gap: space.sm },
  opKey: { flex: 1, height: 44, borderRadius: radius.md, backgroundColor: palette.primarySoft, alignItems: "center", justifyContent: "center" },
  opTxt: { fontFamily: fonts.semibold, fontSize: 20 },
  pad: { gap: space.sm },
  padRow: { flexDirection: "row", gap: space.sm },
  key: { flex: 1, height: 56, borderRadius: radius.md, backgroundColor: palette.surfaceAlt, alignItems: "center", justifyContent: "center" },
  keyTxt: { fontFamily: fonts.semibold, fontSize: 24, color: palette.ink, ...TABULAR },
  selectRow: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 52, paddingVertical: space.sm },
  chipRow: { flexDirection: "row", gap: space.sm },
  optChip: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 40, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface, justifyContent: "center" },
  dot: { width: 10, height: 10, borderRadius: 5 },
  cardGrid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  envCard: { flexDirection: "row", alignItems: "center", gap: space.sm, width: "47.5%", flexGrow: 1, minHeight: 52, paddingHorizontal: space.sm, paddingVertical: space.sm, borderRadius: radius.md, borderWidth: 1.5, borderColor: palette.border, backgroundColor: palette.surface },
  envCardNone: { width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: palette.surfaceAlt },
});
