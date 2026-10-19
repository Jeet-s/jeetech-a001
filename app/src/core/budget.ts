/**
 * Envelope budgeting math — the part competitors get wrong. Planned amounts are
 * stored per envelope per period; everything else (spent, remaining, rollover
 * carry) is computed on demand so switching the budget period or editing a past
 * transaction never corrupts stored history.
 *
 * Carry model (per the PRD):
 *   carryOut = (amountPlanned + carryIn) − netSpent
 *   next period's carryIn = previous carryOut, but only when rollover is enabled.
 * `netSpent` is expenses minus deposits in the envelope, so a deposit into an
 * envelope correctly increases what's available.
 */
import {
  nextId,
  type Budget,
  type BudgetState,
  liveTxns,
  envelopeById,
} from "./model";
import {
  periodFor,
  nextPeriod,
  daysBetween,
  dayOf,
  type DateKey,
  type Period,
  type PeriodSettings,
} from "./dates";
import type { Minor } from "./money";

export interface EnvelopeSummary {
  envelopeId: string;
  planned: Minor;
  expenses: Minor; // money out of the envelope
  deposits: Minor; // money into the envelope
  netSpent: Minor; // expenses − deposits
  carryIn: Minor;
  available: Minor; // planned + carryIn − netSpent  (what's left to spend)
  carryOut: Minor; // what would roll into next period
  overspent: boolean;
}

/** The planned amount for an envelope in a given period (0 if none set). */
export function plannedFor(s: BudgetState, envelopeId: string, period: Period): Minor {
  const b = s.budgets.find((x) => x.envelopeId === envelopeId && x.periodStart === period.start);
  return b ? b.amountPlanned : 0;
}

/** Upsert a planned amount for one envelope in one period. Past periods aren't
 *  touched unless this exact period is addressed. */
export function setBudget(
  s: BudgetState,
  envelopeId: string,
  period: Period,
  amountPlanned: Minor,
): BudgetState {
  if (!envelopeById(s, envelopeId)) return s;
  const amt = Math.max(0, Math.round(amountPlanned));
  const existing = s.budgets.find((b) => b.envelopeId === envelopeId && b.periodStart === period.start);
  if (existing) {
    return {
      ...s,
      budgets: s.budgets.map((b) => (b.id === existing.id ? { ...b, amountPlanned: amt } : b)),
    };
  }
  const { id, seq } = nextId(s, "b");
  const budget: Budget = {
    id,
    envelopeId,
    periodIndex: period.index,
    periodStart: period.start,
    periodEnd: period.end,
    amountPlanned: amt,
  };
  return { ...s, budgets: [...s.budgets, budget], seq };
}

/** Expenses and deposits for an envelope between two days (inclusive). When
 *  `asOf` is given, transactions dated after it are ignored — so future-dated
 *  items never change an envelope's remaining until their day arrives. */
export function flowsIn(
  s: BudgetState,
  envelopeId: string,
  from: DateKey,
  to: DateKey,
  asOf?: DateKey,
): { expenses: Minor; deposits: Minor } {
  let expenses = 0;
  let deposits = 0;
  for (const t of liveTxns(s)) {
    if (t.envelopeId !== envelopeId) continue;
    const day = dayOf(t.date);
    if (day < from || day > to) continue;
    if (asOf && day > asOf) continue;
    if (t.type === "expense") expenses += t.amount;
    else if (t.type === "income") deposits += t.amount;
  }
  return { expenses, deposits };
}

/** The earliest day any budget or transaction references for this envelope. */
function envelopeEpoch(s: BudgetState, envelopeId: string): DateKey | null {
  let earliest: DateKey | null = null;
  for (const b of s.budgets) {
    if (b.envelopeId === envelopeId && (earliest == null || b.periodStart < earliest)) earliest = b.periodStart;
  }
  for (const t of liveTxns(s)) {
    if (t.envelopeId !== envelopeId) continue;
    const d = dayOf(t.date);
    if (earliest == null || d < earliest) earliest = d;
  }
  return earliest;
}

/** Carry accumulated INTO `period` from earlier periods (0 if rollover off). */
export function carryInFor(
  s: BudgetState,
  envelopeId: string,
  period: Period,
  settings: PeriodSettings,
  asOf?: DateKey,
): Minor {
  const env = envelopeById(s, envelopeId);
  if (!env || !env.rolloverEnabled) return 0;
  const epoch = envelopeEpoch(s, envelopeId);
  if (epoch == null) return 0;
  let pr = periodFor(epoch, settings);
  let carry = 0;
  // Each period is ≥1 day, so the chain can't be longer than the span in days.
  const maxIters = Math.max(1, daysBetween(pr.start, period.start) + 2);
  let guard = 0;
  while (pr.start < period.start && guard++ < maxIters) {
    const planned = plannedFor(s, envelopeId, pr);
    const { expenses, deposits } = flowsIn(s, envelopeId, pr.start, pr.end, asOf);
    carry = planned + carry - (expenses - deposits); // carryOut of pr
    pr = nextPeriod(pr, settings);
  }
  return carry;
}

export function envelopeSummary(
  s: BudgetState,
  envelopeId: string,
  period: Period,
  settings: PeriodSettings,
  asOf?: DateKey,
): EnvelopeSummary {
  const planned = plannedFor(s, envelopeId, period);
  const { expenses, deposits } = flowsIn(s, envelopeId, period.start, period.end, asOf);
  const netSpent = expenses - deposits;
  const carryIn = carryInFor(s, envelopeId, period, settings, asOf);
  const available = planned + carryIn - netSpent;
  return {
    envelopeId,
    planned,
    expenses,
    deposits,
    netSpent,
    carryIn,
    available,
    carryOut: available,
    overspent: available < 0,
  };
}

/** Progress along an envelope's bar, 0..1+ (can exceed 1 when overspent, never
 *  below 0 — a net deposit shows as empty, with the headroom reflected in
 *  available). */
export function spentFraction(sum: EnvelopeSummary): number {
  const base = sum.planned + sum.carryIn;
  if (base <= 0) return sum.netSpent > 0 ? 1 : 0;
  return Math.max(0, sum.netSpent / base);
}

export interface PeriodTotals {
  planned: Minor;
  spent: Minor; // gross money out of envelopes this period (never negative)
  deposits: Minor; // gross money paid back into envelopes this period
  available: Minor; // planned + carry − net spent
  carryIn: Minor; // total rolled into this period from earlier ones
  carryOut: Minor; // total that would roll into the next period
}

/** Roll up all visible envelopes for a period (month header totals). Spent is
 *  the gross of expenses so a deposit never shows as "negative spending" — the
 *  money paid back is reported separately as deposits and reflected in
 *  available. */
export function periodTotals(
  s: BudgetState,
  period: Period,
  settings: PeriodSettings,
  asOf?: DateKey,
): PeriodTotals {
  let planned = 0;
  let spent = 0;
  let deposits = 0;
  let available = 0;
  let carryIn = 0;
  let carryOut = 0;
  for (const e of s.envelopes) {
    if (e.archived) continue;
    const sum = envelopeSummary(s, e.id, period, settings, asOf);
    planned += sum.planned;
    spent += sum.expenses;
    deposits += sum.deposits;
    available += sum.available;
    // Only rollover envelopes actually carry; others' leftovers reset each
    // period, so they must not inflate the month header's carry figures.
    if (e.rolloverEnabled) {
      carryIn += sum.carryIn;
      carryOut += sum.carryOut;
    }
  }
  return { planned, spent, deposits, available, carryIn, carryOut };
}
