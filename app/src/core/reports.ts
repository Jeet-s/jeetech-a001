/**
 * Local reporting: income/expense totals, cash-flow buckets for the line/bar
 * charts, and category (envelope) breakdowns with drill-down. Transfers are
 * ALWAYS excluded from income/expense aggregates — they only move money between
 * accounts. Everything is a pure computation over the live transactions so a
 * custom date range or filter just recomputes, never mutates.
 */
import { type BudgetState, type Transaction, type TxnType, liveTxns } from "./model";
import { addDays, addMonths, dayOf, startOfMonth, type DateKey } from "./dates";
import type { Minor } from "./money";

export interface ReportFilter {
  accountId?: string;
  envelopeId?: string;
  labelId?: string;
}

function passes(t: Transaction, f: ReportFilter): boolean {
  if (f.accountId && t.accountId !== f.accountId && t.accountIdTo !== f.accountId) return false;
  if (f.envelopeId && t.envelopeId !== f.envelopeId) return false;
  if (f.labelId && !t.labels.includes(f.labelId)) return false;
  return true;
}

function inRange(t: Transaction, from: DateKey, to: DateKey): boolean {
  const d = dayOf(t.date);
  return d >= from && d <= to;
}

export interface Totals {
  income: Minor;
  expense: Minor;
  net: Minor; // income − expense (transfers never counted)
}

export function totals(s: BudgetState, from: DateKey, to: DateKey, f: ReportFilter = {}): Totals {
  let income = 0;
  let expense = 0;
  for (const t of liveTxns(s)) {
    if (t.type === "transfer") continue;
    if (!inRange(t, from, to) || !passes(t, f)) continue;
    if (t.type === "income") income += t.amount;
    else expense += t.amount;
  }
  return { income, expense, net: income - expense };
}

export type Bucket = "day" | "week" | "month";

export interface FlowPoint {
  label: DateKey; // bucket start day
  income: Minor;
  expense: Minor;
  net: Minor;
}

function bucketStart(day: DateKey, unit: Bucket, anchor: DateKey): DateKey {
  if (unit === "day") return day;
  if (unit === "month") return startOfMonth(day);
  // week: align to the anchor's weekday boundaries
  const delta = Math.floor((new Date(day + "T12:00").getTime() - new Date(anchor + "T12:00").getTime()) / 86_400_000);
  const back = ((delta % 7) + 7) % 7;
  return addDays(day, -back);
}

/** Bucketed cash-flow series for charts (oldest first, gaps filled with zeroes). */
export function cashFlow(
  s: BudgetState,
  from: DateKey,
  to: DateKey,
  unit: Bucket = "day",
  f: ReportFilter = {},
): FlowPoint[] {
  const map = new Map<DateKey, FlowPoint>();
  const keyFor = (day: DateKey) => bucketStart(day, unit, from);

  // seed buckets so the chart has a continuous x-axis
  let cursor = keyFor(from);
  let guard = 0;
  while (cursor <= to && guard++ < 10_000) {
    map.set(cursor, { label: cursor, income: 0, expense: 0, net: 0 });
    cursor = unit === "month" ? addMonths(cursor, 1) : addDays(cursor, unit === "week" ? 7 : 1);
  }

  for (const t of liveTxns(s)) {
    if (t.type === "transfer") continue;
    if (!inRange(t, from, to) || !passes(t, f)) continue;
    const k = keyFor(dayOf(t.date));
    const point = map.get(k) ?? { label: k, income: 0, expense: 0, net: 0 };
    if (t.type === "income") point.income += t.amount;
    else point.expense += t.amount;
    point.net = point.income - point.expense;
    map.set(k, point);
  }
  return [...map.values()].sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
}

export interface CategorySlice {
  envelopeId: string | null; // null groups uncategorised income
  expense: Minor;
  income: Minor;
  net: Minor; // expense − income (how much the envelope consumed)
  share: number; // 0..1 of total expense
}

/** Spend per envelope over a range — the data behind the category chart. */
export function categoryBreakdown(
  s: BudgetState,
  from: DateKey,
  to: DateKey,
  f: ReportFilter = {},
): CategorySlice[] {
  const map = new Map<string | null, { expense: Minor; income: Minor }>();
  for (const t of liveTxns(s)) {
    if (t.type === "transfer") continue;
    if (!inRange(t, from, to) || !passes(t, f)) continue;
    const key = t.envelopeId;
    const row = map.get(key) ?? { expense: 0, income: 0 };
    if (t.type === "expense") row.expense += t.amount;
    else row.income += t.amount;
    map.set(key, row);
  }
  const totalExpense = [...map.values()].reduce((a, r) => a + r.expense, 0);
  return [...map.entries()]
    .map(([envelopeId, r]) => ({
      envelopeId,
      expense: r.expense,
      income: r.income,
      net: r.expense - r.income,
      share: totalExpense > 0 ? r.expense / totalExpense : 0,
    }))
    .sort((a, b) => b.expense - a.expense);
}

/** Transactions behind a chart segment (tap-to-drill-down). */
export function drillDown(
  s: BudgetState,
  from: DateKey,
  to: DateKey,
  selector: { envelopeId?: string | null; type?: TxnType } = {},
  f: ReportFilter = {},
): Transaction[] {
  return liveTxns(s)
    .filter((t) => {
      if (t.type === "transfer") return false;
      if (!inRange(t, from, to) || !passes(t, f)) return false;
      if (selector.type && t.type !== selector.type) return false;
      if (selector.envelopeId !== undefined && t.envelopeId !== selector.envelopeId) return false;
      return true;
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

export interface MonthColumn {
  month: DateKey; // first of month
  income: Minor;
  expense: Minor;
  net: Minor;
}

/** PRO: multi-month comparison table (advanced reports). */
export function monthlyComparison(s: BudgetState, endMonth: DateKey, months: number, f: ReportFilter = {}): MonthColumn[] {
  const out: MonthColumn[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const m = startOfMonth(addMonths(endMonth, -i));
    const to = addDays(addMonths(m, 1), -1);
    const t = totals(s, m, to, f);
    out.push({ month: m, income: t.income, expense: t.expense, net: t.net });
  }
  return out;
}
