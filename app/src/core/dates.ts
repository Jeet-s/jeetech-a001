/**
 * Timezone-safe local dates (keyed YYYY-MM-DD) and budget-period math. Periods
 * are computed from the user's settings and NEVER mutate stored data — any view
 * just recomputes the range it needs. All functions take their reference date
 * explicitly; there is no hidden clock.
 */

export type DateKey = string; // YYYY-MM-DD, local calendar day
export type ISODateTime = string; // full ISO timestamp (stored on transactions)

const p2 = (n: number) => String(n).padStart(2, "0");

export function dateKey(d: Date): DateKey {
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

/** Midday local time keeps us clear of DST transitions when doing day math. */
export function dateFromKey(key: DateKey): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

/** The local calendar day of an ISO datetime (what the transaction "counts" on). */
export function dayOf(iso: ISODateTime): DateKey {
  return iso.slice(0, 10);
}

export function addDays(key: DateKey, n: number): DateKey {
  const [y, m, d] = key.split("-").map(Number);
  return dateKey(new Date(y, m - 1, d + n, 12));
}

export function addMonths(key: DateKey, n: number): DateKey {
  const [y, m, d] = key.split("-").map(Number);
  const base = new Date(y, m - 1 + n, 1, 12);
  const last = daysInMonth(base.getFullYear(), base.getMonth() + 1);
  base.setDate(Math.min(d, last));
  return dateKey(base);
}

export function daysInMonth(year: number, month1: number): number {
  return new Date(year, month1, 0).getDate();
}

/** Whole days from a → b (b - a). Same day = 0. */
export function daysBetween(a: DateKey, b: DateKey): number {
  const ms = dateFromKey(b).getTime() - dateFromKey(a).getTime();
  return Math.round(ms / 86_400_000);
}

export const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function weekday(key: DateKey): number {
  return dateFromKey(key).getDay();
}
export function weekdayLabel(key: DateKey): string {
  return WEEKDAY[weekday(key)];
}
export function monthLabel(key: DateKey): string {
  const [, m] = key.split("-").map(Number);
  return MONTHS[m - 1];
}

export function clampKey(key: DateKey, min: DateKey, max: DateKey): DateKey {
  return key < min ? min : key > max ? max : key;
}

export function startOfMonth(key: DateKey): DateKey {
  return key.slice(0, 7) + "-01";
}
export function endOfMonth(key: DateKey): DateKey {
  const [y, m] = key.split("-").map(Number);
  return `${y}-${p2(m)}-${p2(daysInMonth(y, m))}`;
}

// ─────────────────────────────── periods ───────────────────────────────────

export type PeriodPattern = "monthly" | "semiMonthly" | "biweekly" | "weekly" | "nDays";

export interface PeriodSettings {
  type: "monthly" | "custom";
  pattern?: PeriodPattern; // when type === "custom"
  startDate?: DateKey; // anchor for rolling patterns
  n?: number; // length for nDays
}

export interface Period {
  start: DateKey; // inclusive
  end: DateKey; // inclusive
  index: number; // 0-based, counted from the anchor (monthly uses months since epoch)
}

export const DEFAULT_PERIOD: PeriodSettings = { type: "monthly" };

function normalizePattern(s: PeriodSettings): { pattern: PeriodPattern; anchor: DateKey; n: number } {
  if (s.type === "monthly") return { pattern: "monthly", anchor: "1970-01-01", n: 1 };
  const pattern = s.pattern ?? "monthly";
  const anchor = s.startDate ?? "1970-01-01";
  const n = Math.max(1, Math.floor(s.n ?? (pattern === "weekly" ? 7 : pattern === "biweekly" ? 14 : 1)));
  return { pattern, anchor, n };
}

/** The period that contains `key`, under the given settings. */
export function periodFor(key: DateKey, s: PeriodSettings): Period {
  const { pattern, anchor, n } = normalizePattern(s);
  switch (pattern) {
    case "monthly": {
      const [y, m] = key.split("-").map(Number);
      return { start: startOfMonth(key), end: endOfMonth(key), index: y * 12 + (m - 1) };
    }
    case "semiMonthly": {
      const [y, m, d] = key.split("-").map(Number);
      if (d <= 15) return { start: `${y}-${p2(m)}-01`, end: `${y}-${p2(m)}-15`, index: (y * 12 + (m - 1)) * 2 };
      return { start: `${y}-${p2(m)}-16`, end: endOfMonth(key), index: (y * 12 + (m - 1)) * 2 + 1 };
    }
    case "weekly":
    case "biweekly":
    case "nDays": {
      const len = pattern === "weekly" ? 7 : pattern === "biweekly" ? 14 : n;
      const delta = daysBetween(anchor, key);
      const idx = Math.floor(delta / len);
      const start = addDays(anchor, idx * len);
      return { start, end: addDays(start, len - 1), index: idx };
    }
  }
}

export function nextPeriod(period: Period, s: PeriodSettings): Period {
  return periodFor(addDays(period.end, 1), s);
}
export function prevPeriod(period: Period, s: PeriodSettings): Period {
  return periodFor(addDays(period.start, -1), s);
}

export function periodContains(period: Period, key: DateKey): boolean {
  return key >= period.start && key <= period.end;
}

/** A short human label for a period header, e.g. "March 2026" or "Mar 1 – Mar 14". */
export function periodLabel(period: Period, s: PeriodSettings): string {
  if (s.type === "monthly") {
    const [y, m] = period.start.split("-").map(Number);
    return `${["January","February","March","April","May","June","July","August","September","October","November","December"][m - 1]} ${y}`;
  }
  const a = period.start.split("-").map(Number);
  const b = period.end.split("-").map(Number);
  const left = `${MONTHS[a[1] - 1]} ${a[2]}`;
  const right = `${MONTHS[b[1] - 1]} ${b[2]}`;
  return `${left} – ${right}`;
}

/** List the periods overlapping [from, to] (inclusive), oldest first. */
export function periodsInRange(from: DateKey, to: DateKey, s: PeriodSettings): Period[] {
  const out: Period[] = [];
  let cur = periodFor(from, s);
  // Each period spans at least one day, so the range can hold at most (span + 1)
  // periods — bound the loop by that so a short cadence never truncates output.
  const maxIters = Math.max(1, daysBetween(from, to) + 2);
  let guard = 0;
  while (cur.start <= to && guard++ < maxIters) {
    out.push(cur);
    cur = nextPeriod(cur, s);
  }
  return out;
}

// ─────────────────────── date-range presets (reports) ──────────────────────

export type RangePreset = "this_month" | "last_month" | "last_3m" | "ytd" | "this_period" | "custom";

export function presetRange(
  preset: RangePreset,
  today: DateKey,
  periodSettings: PeriodSettings = DEFAULT_PERIOD,
  custom?: { from: DateKey; to: DateKey },
): { from: DateKey; to: DateKey } {
  switch (preset) {
    case "this_month":
      return { from: startOfMonth(today), to: endOfMonth(today) };
    case "last_month": {
      const lm = addMonths(today, -1);
      return { from: startOfMonth(lm), to: endOfMonth(lm) };
    }
    case "last_3m":
      return { from: startOfMonth(addMonths(today, -2)), to: endOfMonth(today) };
    case "ytd":
      return { from: today.slice(0, 4) + "-01-01", to: today };
    case "this_period": {
      const pr = periodFor(today, periodSettings);
      return { from: pr.start, to: pr.end };
    }
    case "custom":
      return custom ?? { from: startOfMonth(today), to: endOfMonth(today) };
  }
}
