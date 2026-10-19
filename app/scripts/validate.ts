/// <reference types="node" />
/**
 * Core-logic tests for Envelope Mini — run by the factory QA with
 * `npm run validate`. Every rule in src/core is exercised through its real
 * function: money + calculator, dates + periods, envelopes, accounts +
 * balances, transactions (transfer/split/duplicate/bulk/labels/history),
 * rollover across 12 periods, the recurring engine, reports, CSV round-trip,
 * undo/redo, prefs + Pro gating + the security lock, onboarding, and migration.
 *
 * Final stdout line is JSON: {"tests":N,"passed":N,"failures":[...],"features":[...]}
 */
import {
  calc,
  calcToMinor,
  parseAmount,
  formatMoney,
  toMinor,
  minorDigits,
} from "../src/core/money";
import {
  addDays,
  addMonths,
  daysBetween,
  periodFor,
  nextPeriod,
  presetRange,
  periodsInRange,
} from "../src/core/dates";
import {
  emptyState,
  activeEnvelopes,
  activeAccounts,
  SAMPLE_ENVELOPES,
  type BudgetState,
} from "../src/core/model";
import {
  addEnvelope,
  editEnvelope,
  deleteEnvelope,
  hideEnvelope,
  reorderEnvelopes,
  setRollover,
  contrastRatio,
  readableTextOn,
  searchEnvelopes,
} from "../src/core/envelopes";
import {
  addAccount,
  editAccount,
  deleteAccount,
  accountBalance,
} from "../src/core/accounts";
import {
  addTransaction,
  addTransfer,
  editTransaction,
  deleteTransaction,
  restoreTransaction,
  validateAmount,
  validateSplit,
  splitByPercent,
  addSplit,
  duplicateTransaction,
  lastTxnForEnvelope,
  bulkEdit,
  bulkDelete,
  addLabel,
  bulkApplyLabel,
  deleteLabel,
  queryTransactions,
} from "../src/core/transactions";
import { setBudget, carryInFor, envelopeSummary, spentFraction, periodTotals } from "../src/core/budget";
import {
  addRecurring,
  editRecurring,
  pauseRecurring,
  skipOccurrence,
  occurrencesBetween,
  nextOccurrence,
  validateSchedule,
  postDue,
  postAllDue,
  calendarPreview,
  type NewRecurring,
} from "../src/core/recurring";
import { totals, categoryBreakdown, drillDown, cashFlow, monthlyComparison } from "../src/core/reports";
import { exportCsv, parseCsv, detectMapping, previewImport, importCsvText } from "../src/core/csv";
import { initHistory, commit, undo, redo, canUndo, canRedo, UNDO_LIMIT } from "../src/core/history";
import {
  requiresPro,
  canUse,
  setCurrency,
  setCustomPeriod,
  setDefaultAccount,
  preferredAccountId,
  hashPin,
  validatePin,
  setPin,
  verifyPin,
  disableLock,
  setBiometric,
  shouldLock,
  type ProFeature,
} from "../src/core/prefs";
import { seedSamples, startFromScratch, ensureCashAccount } from "../src/core/onboarding";
import { migrateBudget } from "../src/core/data";
import { sim } from "../src/core/sim";

const results: { name: string; ok: boolean; why?: string }[] = [];
const features = new Set<string>();
function test(feature: string, name: string, fn: () => void) {
  features.add(feature);
  try {
    fn();
    results.push({ name, ok: true });
  } catch (e) {
    results.push({ name, ok: false, why: String((e as Error)?.message ?? e).slice(0, 200) });
  }
}
function eq<T>(a: T, b: T, msg = "") {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}
function ok(cond: boolean, msg = "assertion failed") {
  if (!cond) throw new Error(msg);
}
function approx(a: number | null, b: number, eps = 1e-6) {
  if (a == null || Math.abs(a - b) > eps) throw new Error(`expected ~${b}, got ${a}`);
}

const T = "2026-03-10";
const NOW = "2026-03-10T12:00:00.000";
const iso = (d: string) => `${d}T12:00:00.000`;

// Common fixture: an onboarded book with Cash + the three sample envelopes.
const seeded = (): BudgetState => seedSamples(emptyState(), T);
const firstEnv = (s: BudgetState) => activeEnvelopes(s)[0].id;
const cash = (s: BudgetState) => activeAccounts(s)[0].id;

// ─────────────────────────────── money ─────────────────────────────────────
test("money", "toMinor rounds to cents", () => eq(toMinor(23.45, "USD"), 2345));
test("money", "toMinor fixes 1.005 binary error", () => eq(toMinor(1.005, "USD"), 101));
test("money", "minorDigits JPY is 0", () => eq(minorDigits("JPY"), 0));
test("money", "format grouped with symbol", () => eq(formatMoney(123456, "USD"), "$1,234.56"));
test("money", "format negative", () => eq(formatMoney(-500, "USD"), "-$5.00"));
test("money", "format JPY no decimals", () => eq(formatMoney(1000, "JPY"), "¥1,000"));
test("money", "parse plain", () => eq(parseAmount("23.45", "USD"), 2345));
test("money", "parse strips symbol and grouping", () => eq(parseAmount("$1,234.56", "USD"), 123456));
test("money", "parse european decimal", () => eq(parseAmount("1.234,56", "EUR", ","), 123456));
test("money", "parse junk is null", () => eq(parseAmount("abc", "USD"), null));
test("money", "parse empty is null", () => eq(parseAmount("", "USD"), null));

// ───────────────────────────── calculator ──────────────────────────────────
test("calculator", "addition", () => approx(calc("2+3"), 5));
test("calculator", "subtraction", () => approx(calc("10-4"), 6));
test("calculator", "times glyph", () => approx(calc("3×4"), 12));
test("calculator", "divide glyph", () => approx(calc("20÷4"), 5));
test("calculator", "precedence", () => approx(calc("2+3*4"), 14));
test("calculator", "standalone percent", () => approx(calc("50%"), 0.5));
test("calculator", "percent of product", () => approx(calc("200×10%"), 20));
test("calculator", "relative add percent (tip)", () => approx(calc("45+10%"), 49.5));
test("calculator", "relative subtract percent (discount)", () => approx(calc("100-10%"), 90));
test("calculator", "leading minus", () => approx(calc("-5+2"), -3));
test("calculator", "empty is null", () => eq(calc(""), null));
test("calculator", "trailing operator is null", () => eq(calc("2+"), null));
test("calculator", "divide by zero is null", () => eq(calc("5/0"), null));
test("calculator", "calcToMinor rounds", () => eq(calcToMinor("23.456", "USD"), 2346));
test("calculator", "calcToMinor with percent", () => eq(calcToMinor("10+10%", "USD"), 1100));

// ──────────────────────────── dates & periods ──────────────────────────────
test("dates", "addDays across month", () => eq(addDays("2026-01-31", 1), "2026-02-01"));
test("dates", "addDays backwards across year", () => eq(addDays("2026-01-01", -1), "2025-12-31"));
test("dates", "addMonths clamps to short month", () => eq(addMonths("2026-01-31", 1), "2026-02-28"));
test("dates", "daysBetween", () => eq(daysBetween("2026-03-01", "2026-03-10"), 9));
test("periods", "monthly contains day", () => {
  const p = periodFor(T, { type: "monthly" });
  eq([p.start, p.end], ["2026-03-01", "2026-03-31"]);
});
test("periods", "biweekly from anchor", () => {
  const s = { type: "custom" as const, pattern: "biweekly" as const, startDate: "2026-03-01" };
  eq(periodFor("2026-03-10", s), { start: "2026-03-01", end: "2026-03-14", index: 0 });
});
test("periods", "biweekly next range", () => {
  const s = { type: "custom" as const, pattern: "biweekly" as const, startDate: "2026-03-01" };
  const p = periodFor("2026-03-20", s);
  eq([p.start, p.end], ["2026-03-15", "2026-03-28"]);
});
test("periods", "semiMonthly second half", () => {
  const p = periodFor("2026-03-20", { type: "custom", pattern: "semiMonthly", startDate: "2026-01-01" });
  eq([p.start, p.end], ["2026-03-16", "2026-03-31"]);
});
test("periods", "next period monthly rolls to April", () => {
  const p = nextPeriod(periodFor(T, { type: "monthly" }), { type: "monthly" });
  eq(p.start, "2026-04-01");
});
test("periods", "preset this_month", () => eq(presetRange("this_month", T), { from: "2026-03-01", to: "2026-03-31" }));
test("periods", "year boundary biweekly", () => {
  const s = { type: "custom" as const, pattern: "biweekly" as const, startDate: "2025-12-29" };
  const p = periodFor("2026-01-05", s);
  eq([p.start, p.end], ["2025-12-29", "2026-01-11"]);
});

// ──────────────────────────────── envelopes ────────────────────────────────
test("envelopes", "add creates envelope", () => eq(addEnvelope(emptyState(), { name: "Rent" }).state.envelopes.length, 1));
test("envelopes", "duplicate name rejected", () => {
  const s = addEnvelope(emptyState(), { name: "Rent" }).state;
  eq(addEnvelope(s, { name: "rent" }).error, "duplicate");
});
test("envelopes", "empty name rejected", () => eq(addEnvelope(emptyState(), { name: "  " }).error, "empty_name"));
test("envelopes", "bad color rejected", () => eq(addEnvelope(emptyState(), { name: "X", color: "blue" }).error, "bad_color"));
test("envelopes", "edit propagates name", () => {
  const r = addEnvelope(emptyState(), { name: "Food" });
  eq(editEnvelope(r.state, r.id!, { name: "Groceries" }).state.envelopes[0].name, "Groceries");
});
test("envelopes", "rename to itself allowed", () => {
  const r = addEnvelope(emptyState(), { name: "Food" });
  eq(editEnvelope(r.state, r.id!, { name: "Food" }).error, null);
});
test("envelopes", "contrast white/black is 21", () => approx(contrastRatio("#FFFFFF", "#000000"), 21, 0.1));
test("envelopes", "readable text on light bg is ink", () => eq(readableTextOn("#F1F5F9"), "#0F172A"));
test("envelopes", "readable text on navy is white", () => eq(readableTextOn("#0F172A"), "#FFFFFF"));
test("envelopes", "reorder moves to front", () => {
  let s = emptyState();
  for (const n of ["A", "B", "C"]) s = addEnvelope(s, { name: n }).state;
  const cId = activeEnvelopes(s)[2].id;
  s = reorderEnvelopes(s, cId, 0);
  eq(activeEnvelopes(s).map((e) => e.name), ["C", "A", "B"]);
});
test("envelopes", "hide keeps data, drops from active", () => {
  const r = addEnvelope(emptyState(), { name: "Food" });
  const s = hideEnvelope(r.state, r.id!);
  eq([s.envelopes.length, activeEnvelopes(s).length], [1, 0]);
});
test("envelopes", "delete with history archives (keeps reports valid)", () => {
  let s = seeded();
  const e = firstEnv(s);
  s = addTransaction(s, { type: "expense", amount: 1000, accountId: cash(s), envelopeId: e }, NOW).state;
  s = deleteEnvelope(s, e);
  ok(s.envelopes.find((x) => x.id === e)!.archived, "should be archived not removed");
});
test("envelopes", "delete without history removes", () => {
  const r = addEnvelope(emptyState(), { name: "Food" });
  eq(deleteEnvelope(r.state, r.id!).envelopes.length, 0);
});
test("envelopes", "search by name", () => {
  let s = emptyState();
  for (const n of ["Groceries", "Fuel", "Gifts"]) s = addEnvelope(s, { name: n }).state;
  eq(searchEnvelopes(s, "g").map((e) => e.name), ["Groceries", "Gifts"]);
});
test("envelopes", "setRollover toggles flag", () => {
  const r = addEnvelope(emptyState(), { name: "Food" });
  eq(setRollover(r.state, r.id!, true).envelopes[0].rolloverEnabled, true);
});

// ───────────────────────────── accounts & balances ─────────────────────────
test("accounts", "first account becomes default", () => {
  const r = addAccount(emptyState(), { name: "Cash" });
  eq(r.state.prefs.defaultAccountId, r.id);
});
test("accounts", "duplicate name rejected", () => {
  const s = addAccount(emptyState(), { name: "Cash" }).state;
  eq(addAccount(s, { name: "cash" }).error, "duplicate");
});
test("accounts", "balance after expense", () => {
  let s = seeded();
  const a = cash(s);
  s = addTransaction(s, { type: "expense", amount: 2345, accountId: a, envelopeId: firstEnv(s) }, NOW).state;
  eq(accountBalance(s, a, T), -2345);
});
test("accounts", "balance after income", () => {
  let s = seeded();
  const a = cash(s);
  s = addTransaction(s, { type: "income", amount: 5000, accountId: a, envelopeId: firstEnv(s) }, NOW).state;
  eq(accountBalance(s, a, T), 5000);
});
test("accounts", "edit starting balance", () => {
  let s = seeded();
  const a = cash(s);
  s = editAccount(s, a, { startingBalance: 10000 }).state;
  eq(accountBalance(s, a, T), 10000);
});
test("accounts", "future-dated txn does not move today's balance", () => {
  let s = seeded();
  const a = cash(s);
  s = addTransaction(s, { type: "expense", amount: 2345, accountId: a, envelopeId: firstEnv(s), date: iso("2026-03-20") }, NOW).state;
  eq(accountBalance(s, a, T), 0);
});
test("accounts", "delete with history archives", () => {
  let s = seeded();
  const a = cash(s);
  s = addTransaction(s, { type: "expense", amount: 100, accountId: a, envelopeId: firstEnv(s) }, NOW).state;
  s = deleteAccount(s, a);
  ok(s.accounts.find((x) => x.id === a)!.archived);
});

// ────────────────────────── transfers (never income/expense) ───────────────
test("transfers", "transfer moves money both ways", () => {
  let s = seeded();
  const from = cash(s);
  const r = addAccount(s, { name: "Checking", startingBalance: 10000 });
  s = r.state;
  const to = r.id!;
  s = addTransfer(s, { amount: 4000, accountId: to, accountIdTo: from }, NOW).state;
  eq([accountBalance(s, to, T), accountBalance(s, from, T)], [6000, 4000]);
});
test("transfers", "same account rejected", () => {
  const s = seeded();
  eq(addTransfer(s, { amount: 100, accountId: cash(s), accountIdTo: cash(s) }, NOW).error, "same_account");
});
test("transfers", "excluded from income/expense totals", () => {
  let s = seeded();
  const from = cash(s);
  const r = addAccount(s, { name: "Checking" });
  s = r.state;
  s = addTransfer(s, { amount: 4000, accountId: from, accountIdTo: r.id! }, NOW).state;
  const t = totals(s, "2026-03-01", "2026-03-31");
  eq([t.income, t.expense], [0, 0]);
});

// ──────────────────────────────── transactions ─────────────────────────────
test("txn", "validateAmount rejects empty/zero/negative/fraction", () => {
  eq([validateAmount(null), validateAmount(0), validateAmount(-5), validateAmount(1.5), validateAmount(2345)], [
    "amount_required",
    "bad_amount",
    "bad_amount",
    "bad_amount",
    null,
  ]);
});
test("txn", "add remembers last used account", () => {
  let s = seeded();
  const r = addAccount(s, { name: "Checking" });
  s = r.state;
  s = addTransaction(s, { type: "expense", amount: 100, accountId: r.id!, envelopeId: firstEnv(s) }, NOW).state;
  eq(s.prefs.lastUsedAccountId, r.id);
});
test("txn", "expense requires an envelope", () => {
  const s = seeded();
  eq(addTransaction(s, { type: "expense", amount: 100, accountId: cash(s), envelopeId: null }, NOW).error, "no_envelope");
});
test("txn", "edit records audit history", () => {
  let s = seeded();
  const r = addTransaction(s, { type: "expense", amount: 100, accountId: cash(s), envelopeId: firstEnv(s) }, NOW);
  s = r.state;
  s = editTransaction(s, r.id!, { amount: 250 }, "2026-03-11T09:00:00.000").state;
  const t = s.transactions.find((x) => x.id === r.id!)!;
  eq([t.amount, t.editHistory.length, t.editHistory[0].field, t.editHistory[0].from, t.editHistory[0].to], [250, 1, "amount", "100", "250"]);
});
test("txn", "soft delete and restore (undo)", () => {
  let s = seeded();
  const r = addTransaction(s, { type: "expense", amount: 100, accountId: cash(s), envelopeId: firstEnv(s) }, NOW);
  s = deleteTransaction(r.state, r.id!);
  ok(s.transactions[0].deleted);
  s = restoreTransaction(s, r.id!);
  ok(!s.transactions[0].deleted);
});
test("txn", "duplicate copies fields but sets date to now", () => {
  let s = seeded();
  const r = addTransaction(s, { type: "expense", amount: 777, accountId: cash(s), envelopeId: firstEnv(s), date: iso("2026-01-01") }, NOW);
  s = r.state;
  const dup = duplicateTransaction(s, r.id!, iso("2026-03-10"));
  const nt = dup.state.transactions.find((x) => x.id === dup.id)!;
  eq([nt.amount, nt.date], [777, iso("2026-03-10")]);
});
test("txn", "last txn for envelope", () => {
  let s = seeded();
  const e = firstEnv(s);
  s = addTransaction(s, { type: "expense", amount: 100, accountId: cash(s), envelopeId: e, date: iso("2026-03-01") }, NOW).state;
  s = addTransaction(s, { type: "expense", amount: 200, accountId: cash(s), envelopeId: e, date: iso("2026-03-05") }, NOW).state;
  eq(lastTxnForEnvelope(s, e)!.amount, 200);
});
test("txn", "query filters by envelope, sorts date DESC", () => {
  let s = seeded();
  const e = firstEnv(s);
  s = addTransaction(s, { type: "expense", amount: 100, accountId: cash(s), envelopeId: e, date: iso("2026-03-01") }, NOW).state;
  s = addTransaction(s, { type: "expense", amount: 200, accountId: cash(s), envelopeId: e, date: iso("2026-03-05") }, NOW).state;
  eq(queryTransactions(s, { envelopeId: e }).map((t) => t.amount), [200, 100]);
});

// ──────────────────────────────── split ────────────────────────────────────
test("split", "validate detects mismatch", () => eq(validateSplit(1000, [{ envelopeId: "e1", amount: 400 }, { envelopeId: "e2", amount: 500 }]), "split_mismatch"));
test("split", "validate requires two parts", () => eq(validateSplit(1000, [{ envelopeId: "e1", amount: 1000 }]), "split_too_few"));
test("split", "validate rejects non-positive part", () => eq(validateSplit(1000, [{ envelopeId: "e1", amount: 1000 }, { envelopeId: "e2", amount: 0 }]), "split_bad_part"));
test("split", "valid split passes", () => eq(validateSplit(1000, [{ envelopeId: "e1", amount: 400 }, { envelopeId: "e2", amount: 600 }]), null));
test("split", "byPercent sums exactly to total", () => {
  const parts = splitByPercent(1000, [33.33, 33.33, 33.34]);
  eq(parts.reduce((a, b) => a + b, 0), 1000);
});
test("split", "addSplit creates linked group", () => {
  let s = seeded();
  const envs = activeEnvelopes(s);
  const r = addSplit(s, { type: "expense", total: 2000, accountId: cash(s), parts: [{ envelopeId: envs[0].id, amount: 1200 }, { envelopeId: envs[1].id, amount: 800 }] }, NOW);
  s = r.state;
  const group = s.transactions.filter((t) => t.splitGroupId === r.splitGroupId);
  eq([group.length, group.reduce((a, t) => a + t.amount, 0)], [2, 2000]);
});
test("split", "duplicate a split duplicates the whole group", () => {
  let s = seeded();
  const envs = activeEnvelopes(s);
  const r = addSplit(s, { type: "expense", total: 2000, accountId: cash(s), parts: [{ envelopeId: envs[0].id, amount: 1200 }, { envelopeId: envs[1].id, amount: 800 }] }, NOW);
  s = r.state;
  const anyMember = s.transactions.find((t) => t.splitGroupId === r.splitGroupId)!;
  const dup = duplicateTransaction(s, anyMember.id, NOW);
  const groups = new Set(dup.state.transactions.map((t) => t.splitGroupId).filter(Boolean));
  eq([groups.size, dup.state.transactions.filter((t) => t.splitGroupId && t.splitGroupId !== r.splitGroupId).length], [2, 2]);
});

// ───────────────────────────── bulk & labels ───────────────────────────────
test("bulk", "bulkEdit reassigns envelope atomically", () => {
  let s = seeded();
  const envs = activeEnvelopes(s);
  const a = addTransaction(s, { type: "expense", amount: 100, accountId: cash(s), envelopeId: envs[0].id }, NOW);
  const b = addTransaction(a.state, { type: "expense", amount: 200, accountId: cash(a.state), envelopeId: envs[0].id }, NOW);
  s = b.state;
  const res = bulkEdit(s, [a.id!, b.id!], { envelopeId: envs[1].id }, NOW);
  eq([res.changed, res.state.transactions.every((t) => t.envelopeId === envs[1].id)], [2, true]);
});
test("bulk", "bulkDelete soft-deletes many", () => {
  let s = seeded();
  const a = addTransaction(s, { type: "expense", amount: 100, accountId: cash(s), envelopeId: firstEnv(s) }, NOW);
  const b = addTransaction(a.state, { type: "expense", amount: 200, accountId: cash(a.state), envelopeId: firstEnv(a.state) }, NOW);
  s = bulkDelete(b.state, [a.id!, b.id!]);
  eq(s.transactions.every((t) => t.deleted), true);
});
test("labels", "create, apply, filter, delete strips", () => {
  let s = seeded();
  const t = addTransaction(s, { type: "expense", amount: 100, accountId: cash(s), envelopeId: firstEnv(s) }, NOW);
  s = t.state;
  const l = addLabel(s, { name: "Trip" });
  s = l.state;
  s = bulkApplyLabel(s, [t.id!], l.id!, true);
  eq(queryTransactions(s, { labelId: l.id! }).length, 1);
  s = deleteLabel(s, l.id!);
  eq(s.transactions[0].labels.length, 0);
});
test("labels", "duplicate label rejected", () => {
  const s = addLabel(emptyState(), { name: "Work" }).state;
  eq(addLabel(s, { name: "work" }).error, "duplicate");
});

// ─────────────────────────────── rollover ──────────────────────────────────
const monthly = { type: "monthly" as const };
function rolloverEnv(): { s: BudgetState; e: string } {
  let s = emptyState();
  s = addAccount(s, { name: "Cash" }).state;
  const r = addEnvelope(s, { name: "Groceries", rolloverEnabled: true });
  return { s: r.state, e: r.id! };
}
test("rollover", "positive carry increases next period", () => {
  let { s, e } = rolloverEnv();
  s = setBudget(s, e, periodFor("2026-01-15", monthly), 10000);
  s = setBudget(s, e, periodFor("2026-02-15", monthly), 10000);
  s = addTransaction(s, { type: "expense", amount: 6000, accountId: cash(s), envelopeId: e, date: iso("2026-01-15") }, NOW).state;
  eq(carryInFor(s, e, periodFor("2026-02-15", monthly), monthly), 4000);
});
test("rollover", "negative carry reduces next period", () => {
  let { s, e } = rolloverEnv();
  s = setBudget(s, e, periodFor("2026-01-15", monthly), 5000);
  s = setBudget(s, e, periodFor("2026-02-15", monthly), 5000);
  s = addTransaction(s, { type: "expense", amount: 8000, accountId: cash(s), envelopeId: e, date: iso("2026-01-15") }, NOW).state;
  const sum = envelopeSummary(s, e, periodFor("2026-02-15", monthly), monthly);
  eq([sum.carryIn, sum.available], [-3000, 2000]);
});
test("rollover", "disabled envelope never carries", () => {
  let { s, e } = rolloverEnv();
  s = setRollover(s, e, false);
  s = setBudget(s, e, periodFor("2026-01-15", monthly), 10000);
  s = addTransaction(s, { type: "expense", amount: 2000, accountId: cash(s), envelopeId: e, date: iso("2026-01-15") }, NOW).state;
  eq(carryInFor(s, e, periodFor("2026-02-15", monthly), monthly), 0);
});
test("rollover", "deposit into envelope increases available", () => {
  let { s, e } = rolloverEnv();
  const p = periodFor("2026-03-15", monthly);
  s = setBudget(s, e, p, 10000);
  s = addTransaction(s, { type: "expense", amount: 4000, accountId: cash(s), envelopeId: e, date: iso("2026-03-15") }, NOW).state;
  s = addTransaction(s, { type: "income", amount: 1000, accountId: cash(s), envelopeId: e, date: iso("2026-03-16") }, NOW).state;
  eq(envelopeSummary(s, e, p, monthly).available, 7000);
});
test("rollover", "carry compounds correctly across 12 periods", () => {
  let { s, e } = rolloverEnv();
  let m = "2026-01-15";
  for (let i = 0; i < 12; i++) {
    const p = periodFor(m, monthly);
    s = setBudget(s, e, p, 10000);
    s = addTransaction(s, { type: "expense", amount: 9000, accountId: cash(s), envelopeId: e, date: iso(m) }, NOW).state;
    m = addMonths(m, 1);
  }
  // each month leaves +1000; carry into the 12th month is 11 * 1000
  eq(carryInFor(s, e, periodFor("2026-12-15", monthly), monthly), 11000);
});
test("rollover", "past periods are not mutated when budget set later", () => {
  let { s, e } = rolloverEnv();
  s = setBudget(s, e, periodFor("2026-01-15", monthly), 10000);
  const before = JSON.stringify(s.transactions);
  s = setBudget(s, e, periodFor("2026-02-15", monthly), 20000);
  eq(JSON.stringify(s.transactions), before);
});

// ──────────────────────────────── recurring ────────────────────────────────
const sch = (over: Partial<NewRecurring["schedule"]>): NewRecurring["schedule"] => ({
  kind: "monthly",
  startDate: "2026-03-01",
  params: {},
  ...over,
});
test("recurring", "weekly occurrences", () => {
  const s = { kind: "weekly" as const, startDate: "2026-03-02", endDate: null, params: { weekday: 1 }, skips: [], shift: "none" as const };
  eq(occurrencesBetween(s, "2026-03-01", "2026-03-23"), ["2026-03-02", "2026-03-09", "2026-03-16", "2026-03-23"]);
});
test("recurring", "weekly anchors to chosen weekday when start differs", () => {
  // start on a Sunday but ask for Wednesday (weekday 3) → occurrences on Wednesdays
  const s = { kind: "weekly" as const, startDate: "2026-03-01", endDate: null, params: { weekday: 3 }, skips: [], shift: "none" as const };
  eq(occurrencesBetween(s, "2026-03-01", "2026-03-20"), ["2026-03-04", "2026-03-11", "2026-03-18"]);
});
test("recurring", "biweekly occurrences", () => {
  const s = { kind: "biweekly" as const, startDate: "2026-03-01", endDate: null, params: {}, skips: [], shift: "none" as const };
  eq(occurrencesBetween(s, "2026-03-01", "2026-04-15"), ["2026-03-01", "2026-03-15", "2026-03-29", "2026-04-12"]);
});
test("recurring", "monthly day 31 clamps in February", () => {
  const s = { kind: "monthly" as const, startDate: "2026-01-31", endDate: null, params: { day: 31 }, skips: [], shift: "none" as const };
  eq(occurrencesBetween(s, "2026-01-01", "2026-03-31"), ["2026-01-31", "2026-02-28", "2026-03-31"]);
});
test("recurring", "semiMonthly 1st & 15th", () => {
  const s = { kind: "semiMonthly" as const, startDate: "2026-03-01", endDate: null, params: { days: [1, 15] }, skips: [], shift: "none" as const };
  eq(occurrencesBetween(s, "2026-03-01", "2026-04-01"), ["2026-03-01", "2026-03-15", "2026-04-01"]);
});
test("recurring", "nth weekday (2nd Tuesday)", () => {
  const s = { kind: "nthWeekday" as const, startDate: "2026-03-01", endDate: null, params: { weekday: 2, nth: 2 }, skips: [], shift: "none" as const };
  eq(occurrencesBetween(s, "2026-03-01", "2026-03-31"), ["2026-03-10"]);
});
test("recurring", "last weekday (last Friday)", () => {
  const s = { kind: "lastWeekday" as const, startDate: "2026-03-01", endDate: null, params: { weekday: 5 }, skips: [], shift: "none" as const };
  eq(occurrencesBetween(s, "2026-03-01", "2026-03-31"), ["2026-03-27"]);
});
test("recurring", "nDays cadence", () => {
  const s = { kind: "nDays" as const, startDate: "2026-03-01", endDate: null, params: { n: 10 }, skips: [], shift: "none" as const };
  eq(occurrencesBetween(s, "2026-03-01", "2026-03-31"), ["2026-03-01", "2026-03-11", "2026-03-21", "2026-03-31"]);
});
test("recurring", "weekend shift to next weekday", () => {
  // 2026-03-01 is a Sunday
  const s = { kind: "monthly" as const, startDate: "2026-03-01", endDate: null, params: { day: 1 }, skips: [], shift: "nextWeekday" as const };
  eq(occurrencesBetween(s, "2026-03-01", "2026-03-05"), ["2026-03-02"]);
});
test("recurring", "skip removes an occurrence", () => {
  const base = { kind: "weekly" as const, startDate: "2026-03-02", endDate: null, params: { weekday: 1 }, skips: ["2026-03-09"], shift: "none" as const };
  eq(occurrencesBetween(base, "2026-03-01", "2026-03-16"), ["2026-03-02", "2026-03-16"]);
});
test("recurring", "end date stops occurrences", () => {
  const s = { kind: "weekly" as const, startDate: "2026-03-02", endDate: "2026-03-10", params: { weekday: 1 }, skips: [], shift: "none" as const };
  eq(occurrencesBetween(s, "2026-03-01", "2026-03-31"), ["2026-03-02", "2026-03-09"]);
});
test("recurring", "nextOccurrence finds the following date", () => {
  const s = { kind: "monthly" as const, startDate: "2026-03-01", endDate: null, params: { day: 15 }, skips: [], shift: "none" as const };
  eq(nextOccurrence(s, "2026-03-16"), "2026-04-15");
});
test("recurring", "validateSchedule rejects nth without weekday range", () => {
  eq(validateSchedule({ kind: "nthWeekday", startDate: "2026-03-01", endDate: null, params: { weekday: 9, nth: 2 }, skips: [], shift: "none" }), false);
});
test("recurring", "addRecurring validates amount", () => {
  const s = seeded();
  eq(addRecurring(s, { name: "Rent", schedule: sch({ params: { day: 1 } }), template: { type: "expense", amount: 0, envelopeId: firstEnv(s), accountId: cash(s) } }, NOW).error, "bad_amount");
});
test("recurring", "posts due occurrences up to today only", () => {
  let s = seeded();
  const r = addRecurring(s, { name: "Rent", schedule: sch({ kind: "monthly", startDate: "2026-01-01", params: { day: 1 } }), template: { type: "expense", amount: 120000, envelopeId: firstEnv(s), accountId: cash(s) } }, NOW);
  s = r.state;
  const posted = postDue(s, r.id!, "2026-03-10");
  // Jan 1, Feb 1, Mar 1 are due; Apr 1 is not.
  eq(posted.posted, ["2026-01-01", "2026-02-01", "2026-03-01"]);
});
test("recurring", "posting is idempotent", () => {
  let s = seeded();
  const r = addRecurring(s, { name: "Rent", schedule: sch({ kind: "monthly", startDate: "2026-01-01", params: { day: 1 } }), template: { type: "expense", amount: 120000, envelopeId: firstEnv(s), accountId: cash(s) } }, NOW);
  s = postDue(r.state, r.id!, "2026-03-10").state;
  const again = postDue(s, r.id!, "2026-03-10");
  eq(again.posted.length, 0);
});
test("recurring", "future rule posts nothing today", () => {
  let s = seeded();
  const r = addRecurring(s, { name: "Future", schedule: sch({ kind: "monthly", startDate: "2026-06-01", params: { day: 1 } }), template: { type: "expense", amount: 1000, envelopeId: firstEnv(s), accountId: cash(s) } }, NOW);
  eq(postDue(r.state, r.id!, "2026-03-10").posted.length, 0);
});
test("recurring", "paused rule posts nothing", () => {
  let s = seeded();
  const r = addRecurring(s, { name: "Rent", schedule: sch({ kind: "monthly", startDate: "2026-01-01", params: { day: 1 } }), template: { type: "expense", amount: 1000, envelopeId: firstEnv(s), accountId: cash(s) } }, NOW);
  s = pauseRecurring(r.state, r.id!, true);
  eq(postDue(s, r.id!, "2026-03-10").posted.length, 0);
});
test("recurring", "edit scope 'all' changes template + records audit", () => {
  let s = seeded();
  const r = addRecurring(s, { name: "Rent", schedule: sch({ params: { day: 1 } }), template: { type: "expense", amount: 1000, envelopeId: firstEnv(s), accountId: cash(s) } }, NOW);
  s = r.state;
  const res = editRecurring(s, r.id!, { template: { amount: 2000 } }, "all", "2026-04-01", "2026-03-11T00:00:00.000");
  const rule = res.state.recurring.find((x) => x.id === r.id!)!;
  eq([rule.template.amount, rule.audit.some((a) => a.scope === "all" && a.note === "edit all")], [2000, true]);
});
test("recurring", "edit scope 'thisAndFuture' splits the rule", () => {
  let s = seeded();
  const r = addRecurring(s, { name: "Rent", schedule: sch({ kind: "monthly", startDate: "2026-01-01", params: { day: 1 } }), template: { type: "expense", amount: 1000, envelopeId: firstEnv(s), accountId: cash(s) } }, NOW);
  s = r.state;
  const res = editRecurring(s, r.id!, { template: { amount: 2000 } }, "thisAndFuture", "2026-04-01", "2026-03-11T00:00:00.000");
  const old = res.state.recurring.find((x) => x.id === r.id!)!;
  eq([res.state.recurring.length, old.schedule.endDate], [2, "2026-03-31"]);
});
test("recurring", "skipOccurrence adds skip", () => {
  let s = seeded();
  const r = addRecurring(s, { name: "Rent", schedule: sch({ kind: "weekly", startDate: "2026-03-02", params: { weekday: 1 } }), template: { type: "expense", amount: 1000, envelopeId: firstEnv(s), accountId: cash(s) } }, NOW);
  s = skipOccurrence(r.state, r.id!, "2026-03-09", NOW);
  ok(s.recurring[0].schedule.skips.includes("2026-03-09"));
});
test("recurring", "calendar preview marks posted vs upcoming", () => {
  let s = seeded();
  const r = addRecurring(s, { name: "Rent", schedule: sch({ kind: "monthly", startDate: "2026-03-01", params: { day: 1 } }), template: { type: "expense", amount: 1000, envelopeId: firstEnv(s), accountId: cash(s) } }, NOW);
  s = postDue(r.state, r.id!, "2026-03-10").state;
  const cal = calendarPreview(s, "2026-03-01", "2026-04-30");
  eq([cal.find((c) => c.day === "2026-03-01")?.posted, cal.find((c) => c.day === "2026-04-01")?.posted], [true, false]);
});

// ──────────────────────────────── reports ──────────────────────────────────
test("reports", "category breakdown shares sum to ~1", () => {
  let s = seeded();
  const envs = activeEnvelopes(s);
  s = addTransaction(s, { type: "expense", amount: 3000, accountId: cash(s), envelopeId: envs[0].id }, NOW).state;
  s = addTransaction(s, { type: "expense", amount: 1000, accountId: cash(s), envelopeId: envs[1].id }, NOW).state;
  const b = categoryBreakdown(s, "2026-03-01", "2026-03-31");
  approx(b.reduce((a, c) => a + c.share, 0), 1, 1e-6);
  eq(b[0].envelopeId, envs[0].id); // sorted by spend desc
});
test("reports", "drilldown returns matching txns", () => {
  let s = seeded();
  const e = firstEnv(s);
  s = addTransaction(s, { type: "expense", amount: 3000, accountId: cash(s), envelopeId: e }, NOW).state;
  eq(drillDown(s, "2026-03-01", "2026-03-31", { envelopeId: e }).length, 1);
});
test("reports", "cashFlow buckets by month", () => {
  let s = seeded();
  s = addTransaction(s, { type: "expense", amount: 1000, accountId: cash(s), envelopeId: firstEnv(s), date: iso("2026-02-10") }, NOW).state;
  s = addTransaction(s, { type: "income", amount: 5000, accountId: cash(s), envelopeId: firstEnv(s), date: iso("2026-03-10") }, NOW).state;
  const flow = cashFlow(s, "2026-02-01", "2026-03-31", "month");
  eq([flow.length, flow[0].expense, flow[1].income], [2, 1000, 5000]);
});
test("reports", "monthlyComparison has one column per month", () => {
  const s = seeded();
  eq(monthlyComparison(s, "2026-03-01", 3).length, 3);
});

// ────────────────────────────── CSV round-trip ─────────────────────────────
test("csv", "export then import reproduces totals", () => {
  let s = seeded();
  const envs = activeEnvelopes(s);
  s = addTransaction(s, { type: "expense", amount: 2345, accountId: cash(s), envelopeId: envs[0].id, note: "Milk, eggs" }, NOW).state;
  s = addTransaction(s, { type: "income", amount: 500000, accountId: cash(s), envelopeId: envs[1].id }, NOW).state;
  const before = totals(s, "2000-01-01", "2100-01-01");
  const csv = exportCsv(s);
  const fresh = importCsvText(emptyState(), csv, NOW, "USD");
  const after = totals(fresh.state, "2000-01-01", "2100-01-01");
  eq([after.income, after.expense], [before.income, before.expense]);
});
test("csv", "round-trip recreates envelopes & accounts by name", () => {
  let s = seeded();
  s = addTransaction(s, { type: "expense", amount: 2345, accountId: cash(s), envelopeId: firstEnv(s) }, NOW).state;
  const csv = exportCsv(s);
  const fresh = importCsvText(emptyState(), csv, NOW, "USD");
  ok(fresh.state.envelopes.some((e) => e.name === "Groceries"));
  ok(fresh.state.accounts.some((a) => a.name === "Cash"));
});
test("csv", "transfer round-trips without becoming income/expense", () => {
  let s = seeded();
  const r = addAccount(s, { name: "Checking" });
  s = r.state;
  s = addTransfer(s, { amount: 4000, accountId: cash(s), accountIdTo: r.id! }, NOW).state;
  const fresh = importCsvText(emptyState(), exportCsv(s), NOW, "USD");
  const t = totals(fresh.state, "2000-01-01", "2100-01-01");
  eq([t.income, t.expense, fresh.state.transactions.filter((x) => x.type === "transfer").length], [0, 0, 1]);
});
test("csv", "parse handles quoted commas", () => {
  const rows = parseCsv('Date,Note\n2026-03-10,"Milk, eggs"');
  eq(rows[1], ["2026-03-10", "Milk, eggs"]);
});
test("csv", "detectMapping maps common aliases", () => {
  const m = detectMapping(["Date", "Category", "Amount", "Memo"]);
  eq([m.Date, m.Envelope, m.Amount, m.Note], [0, 1, 2, 3]);
});
test("csv", "preview flags invalid rows", () => {
  const rows = parseCsv("Date,Type,Amount,Account\nnope,expense,10,Cash\n2026-03-10,expense,5,Cash");
  const pv = previewImport(rows.slice(1), detectMapping(rows[0]));
  eq([pv[0].error, pv[1].error], ["invalid date", null]);
});

// ──────────────────────────────── undo/redo ────────────────────────────────
test("history", "commit then undo restores previous", () => {
  const a = seeded();
  const b = addEnvelope(a, { name: "New" }).state;
  let h = commit(initHistory(a), b);
  ok(canUndo(h) && !canRedo(h));
  h = undo(h);
  eq(h.present.envelopes.length, a.envelopes.length);
  ok(canRedo(h));
});
test("history", "redo re-applies", () => {
  const a = seeded();
  const b = addEnvelope(a, { name: "New" }).state;
  const h = redo(undo(commit(initHistory(a), b)));
  eq(h.present.envelopes.length, b.envelopes.length);
});
test("history", "no-op commit does not grow stack", () => {
  const a = seeded();
  const h = commit(initHistory(a), a);
  eq(h.past.length, 0);
});
test("history", "stack is bounded to the limit", () => {
  let h = initHistory(emptyState());
  for (let i = 0; i < UNDO_LIMIT + 5; i++) h = commit(h, addEnvelope(h.present, { name: `E${i}` }).state);
  eq(h.past.length, UNDO_LIMIT);
});

// ────────────────────────────── prefs & pro ────────────────────────────────
test("pro", "advanced reports require Pro", () => eq(requiresPro("advanced_reports"), true));
test("pro", "free user blocked from pro feature", () => eq(canUse("pdf_export", false), false));
test("pro", "pro user allowed", () => eq(canUse("pdf_export", true), true));
test("pro", "bulk edit is a pro feature", () => eq(requiresPro("bulk_edit" as ProFeature), true));
test("prefs", "currency upper-cased", () => eq(setCurrency(emptyState(), "eur").prefs.currency, "EUR"));
test("prefs", "custom biweekly period set", () => {
  const p = setCustomPeriod(emptyState(), "biweekly", "2026-03-01").prefs.period;
  eq([p.type, p.pattern, p.startDate], ["custom", "biweekly", "2026-03-01"]);
});
test("prefs", "switching period keeps transactions intact", () => {
  let s = seeded();
  s = addTransaction(s, { type: "expense", amount: 100, accountId: cash(s), envelopeId: firstEnv(s) }, NOW).state;
  const before = JSON.stringify(s.transactions);
  s = setCustomPeriod(s, "biweekly", "2026-03-01");
  eq(JSON.stringify(s.transactions), before);
});
test("prefs", "default account must exist", () => eq(setDefaultAccount(emptyState(), "nope").prefs.defaultAccountId, null));
test("prefs", "preferred account falls back to first", () => {
  const s = addAccount(emptyState(), { name: "Cash" }).state;
  eq(preferredAccountId(s), activeAccounts(s)[0].id);
});

// ─────────────────────────────── security ──────────────────────────────────
test("security", "hashPin is deterministic and not the raw pin", () => {
  ok(hashPin("1234") === hashPin("1234"));
  ok(hashPin("1234") !== "1234");
});
test("security", "validatePin rejects short/non-numeric", () => eq([validatePin("12"), validatePin("abcd"), validatePin("1234")], ["too_short", "not_numeric", null]));
test("security", "set then verify pin", () => {
  const s = setPin(emptyState(), "4821").state;
  ok(verifyPin(s, "4821") && !verifyPin(s, "0000"));
});
test("security", "disableLock clears pin & biometric", () => {
  let s = setPin(emptyState(), "4821").state;
  s = disableLock(s);
  eq([s.prefs.security.pinEnabled, s.prefs.security.pinHash], [false, null]);
});
test("security", "biometric requires a pin first", () => eq(setBiometric(emptyState(), true).prefs.security.biometricEnabled, false));
test("security", "shouldLock respects timeout", () => {
  const s = setPin(emptyState(), "4821").state;
  eq([shouldLock(s.prefs, 30), shouldLock(s.prefs, 120)], [false, true]);
});

// ────────────────────────────── onboarding ─────────────────────────────────
test("onboarding", "seedSamples creates account, envelopes, budgets", () => {
  const s = seedSamples(emptyState(), T);
  eq([s.accounts.length, activeEnvelopes(s).length, s.budgets.length >= SAMPLE_ENVELOPES.length, s.onboarded], [1, 3, true, true]);
});
test("onboarding", "startFromScratch creates only Cash", () => {
  const s = startFromScratch(emptyState());
  eq([s.accounts.length, s.envelopes.length, s.onboarded], [1, 0, true]);
});
test("onboarding", "ensureCashAccount is a no-op when an account exists", () => {
  const s = addAccount(emptyState(), { name: "Wallet" }).state;
  eq(ensureCashAccount(s).accounts.length, 1);
});

// ─────────────────────────── persistence & migration ───────────────────────
test("persistence", "migrate from empty/unknown yields fresh state", () => eq(migrateBudget(null, 0).onboarded, false));
test("persistence", "migrate preserves recognised fields", () => {
  const prior = seedSamples(emptyState(), T);
  const migrated = migrateBudget(prior, 1);
  eq([migrated.accounts.length, migrated.envelopes.length, migrated.onboarded], [1, 3, true]);
});
test("persistence", "sim state survives serialize → deserialize", () => {
  let st = sim.init();
  for (const a of sim.actions(st).slice(0, 2)) st = sim.apply(st, a);
  eq(sim.deserialize(sim.serialize(st)), st);
});
test("sim", "fresh install is not onboarded", () => eq(sim.init().data.onboarded, false));
test("sim", "seeded state holds all invariants", () => {
  let st = sim.init();
  st = sim.apply(st, { t: "seed" });
  eq(sim.invariants(st), []);
});

// ───────────────── audit regressions (bugs found by the review) ────────────
test("calculator", "rejects two numbers separated by space", () => eq(calc("12 50"), null));
test("money", "toMinor rejects overflow to a safe integer", () => eq(toMinor(1e308, "USD"), 0));
test("money", "never renders negative zero", () => eq(formatMoney(-0.4, "USD"), "$0.00"));
test("periods", "periodsInRange covers a full daily span (no 1000 truncation)", () => {
  const nd = { type: "custom" as const, pattern: "nDays" as const, n: 1, startDate: "2026-01-01" };
  eq(periodsInRange("2026-01-01", "2026-01-10", nd).length, 10);
});
test("txn", "edit to transfer without a destination is rejected", () => {
  let s = seeded();
  const r = addTransaction(s, { type: "expense", amount: 100, accountId: cash(s), envelopeId: firstEnv(s) }, NOW);
  eq(editTransaction(r.state, r.id!, { type: "transfer" }, NOW).error, "no_account");
});
test("txn", "edit to transfer clears the envelope and sets destination", () => {
  let s = seeded();
  const b = addAccount(s, { name: "Checking" });
  s = b.state;
  const r = addTransaction(s, { type: "expense", amount: 100, accountId: cash(s), envelopeId: firstEnv(s) }, NOW);
  const res = editTransaction(r.state, r.id!, { type: "transfer", accountIdTo: b.id! }, NOW);
  const t = res.state.transactions.find((x) => x.id === r.id!)!;
  eq([res.error, t.type, t.envelopeId, t.accountIdTo], [null, "transfer", null, b.id!]);
});
test("txn", "edit income→expense still requires an envelope", () => {
  let s = seeded();
  const r = addTransaction(s, { type: "income", amount: 100, accountId: cash(s), envelopeId: firstEnv(s) }, NOW);
  eq(editTransaction(r.state, r.id!, { type: "expense", envelopeId: null }, NOW).error, "no_envelope");
});
test("txn", "edit cannot pin an envelope onto a transfer", () => {
  let s = seeded();
  const b = addAccount(s, { name: "Checking" });
  s = b.state;
  const r = addTransfer(s, { amount: 100, accountId: cash(s), accountIdTo: b.id! }, NOW);
  const res = editTransaction(r.state, r.id!, { envelopeId: firstEnv(s) }, NOW);
  eq(res.state.transactions.find((x) => x.id === r.id!)!.envelopeId, null);
});
test("bulk", "bulkEdit never turns a transfer into a self-transfer", () => {
  let s = seeded();
  const b = addAccount(s, { name: "Checking" });
  s = b.state;
  const r = addTransfer(s, { amount: 100, accountId: cash(s), accountIdTo: b.id! }, NOW);
  s = r.state;
  const res = bulkEdit(s, [r.id!], { accountId: b.id! }, NOW); // would make from===to
  const t = res.state.transactions.find((x) => x.id === r.id!)!;
  ok(t.accountId !== t.accountIdTo, "transfer must keep distinct accounts");
});
test("budget", "future-dated expense excluded from remaining when asOf given", () => {
  let { s, e } = rolloverEnv();
  const p = periodFor("2026-03-15", monthly);
  s = setBudget(s, e, p, 10000);
  s = addTransaction(s, { type: "expense", amount: 4000, accountId: cash(s), envelopeId: e, date: iso("2026-03-25") }, NOW).state;
  // as of the 15th, the 25th's expense hasn't happened yet
  eq(envelopeSummary(s, e, p, monthly, "2026-03-15").available, 10000);
  // by month end it counts
  eq(envelopeSummary(s, e, p, monthly, "2026-03-31").available, 6000);
});
test("budget", "spentFraction clamps to 0 on a net deposit", () => {
  let { s, e } = rolloverEnv();
  const p = periodFor("2026-03-15", monthly);
  s = setBudget(s, e, p, 10000);
  s = addTransaction(s, { type: "income", amount: 3000, accountId: cash(s), envelopeId: e, date: iso("2026-03-10") }, NOW).state;
  ok(spentFraction(envelopeSummary(s, e, p, monthly)) >= 0);
});
test("budget", "periodTotals never reports a deposit as negative Spent", () => {
  let { s, e } = rolloverEnv();
  const p = periodFor("2026-03-15", monthly);
  s = setBudget(s, e, p, 10000);
  // a lone $1.00 deposit used to make the summary card read Spent = -$1.00
  s = addTransaction(s, { type: "income", amount: 100, accountId: cash(s), envelopeId: e, date: iso("2026-03-10") }, NOW).state;
  let t = periodTotals(s, p, monthly, "2026-03-31");
  eq([t.spent, t.deposits], [0, 100]);
  ok(t.spent >= 0, "spent must never be negative");
  // with a real expense too, Spent is the gross expense and deposits stay separate
  s = addTransaction(s, { type: "expense", amount: 4000, accountId: cash(s), envelopeId: e, date: iso("2026-03-12") }, NOW).state;
  t = periodTotals(s, p, monthly, "2026-03-31");
  eq([t.spent, t.deposits, t.available], [4000, 100, 6100]);
});
test("budget", "periodTotals carry totals count only rollover envelopes", () => {
  let { s, e } = rolloverEnv(); // Groceries, rollover ON
  const jan = periodFor("2026-01-15", monthly);
  const feb = periodFor("2026-02-15", monthly);
  s = setBudget(s, e, jan, 10000);
  s = setBudget(s, e, feb, 10000);
  // spend 6000 in Jan → 4000 should roll into Feb
  s = addTransaction(s, { type: "expense", amount: 6000, accountId: cash(s), envelopeId: e, date: iso("2026-01-15") }, NOW).state;
  // a NON-rollover envelope with an untouched budget must not inflate carry
  const r2 = addEnvelope(s, { name: "Fuel", rolloverEnabled: false });
  s = r2.state;
  s = setBudget(s, r2.id!, feb, 5000);
  const t = periodTotals(s, feb, monthly, "2026-02-28");
  eq(t.carryIn, 4000); // only Groceries carries in
  eq(t.carryOut, 14000); // Groceries 10000 + 4000 carry; Fuel's 5000 leftover excluded
});
test("recurring", "weekend shift cannot escape the end date", () => {
  // 2026-01-31 is a Saturday; nextWeekday → Feb 2 which is past the end date
  const s = { kind: "monthly" as const, startDate: "2026-01-01", endDate: "2026-01-31", params: { day: 31 }, skips: [], shift: "nextWeekday" as const };
  eq(occurrencesBetween(s, "2026-01-01", "2026-03-31"), []);
});
test("recurring", "skip matches the shifted occurrence date", () => {
  // Sunday 2026-03-01 shifts to Monday 2026-03-02; skipping the shifted date drops it
  const s = { kind: "monthly" as const, startDate: "2026-03-01", endDate: null, params: { day: 1 }, skips: ["2026-03-02"], shift: "nextWeekday" as const };
  eq(occurrencesBetween(s, "2026-03-01", "2026-03-31"), []);
});
test("recurring", "thisAndFuture inherits the watermark and never double-posts", () => {
  let s = seeded();
  const r = addRecurring(s, { name: "Rent", schedule: sch({ kind: "monthly", startDate: "2026-01-01", params: { day: 1 } }), template: { type: "expense", amount: 1000, envelopeId: firstEnv(s), accountId: cash(s) } }, NOW);
  s = postDue(r.state, r.id!, "2026-03-10").state;
  const postedCount = s.transactions.filter((t) => t.recurringInstanceId).length;
  const split = editRecurring(s, r.id!, { template: { amount: 2000 } }, "thisAndFuture", "2026-02-01", NOW);
  s = split.state;
  const spun = s.recurring.find((x) => x.id === split.id)!;
  eq(spun.lastPostedAt, "2026-03-10");
  // posting again posts nothing already covered
  const after = postAllDue(s, "2026-03-10");
  eq(after.state.transactions.filter((t) => t.recurringInstanceId).length, postedCount);
});
test("csv", "labels round-trip through export/import", () => {
  let s = seeded();
  const t = addTransaction(s, { type: "expense", amount: 2345, accountId: cash(s), envelopeId: firstEnv(s) }, NOW);
  s = t.state;
  const l = addLabel(s, { name: "Trip" });
  s = bulkApplyLabel(l.state, [t.id!], l.id!, true);
  const fresh = importCsvText(emptyState(), exportCsv(s), NOW, "USD");
  const imported = fresh.state.transactions[0];
  const lbl = fresh.state.labels.find((x) => x.id === imported.labels[0]);
  eq(lbl?.name, "Trip");
});
test("csv", "per-row currency is preserved on round-trip", () => {
  let s = seeded();
  s = addTransaction(s, { type: "expense", amount: 500, accountId: cash(s), envelopeId: firstEnv(s), currency: "EUR" }, NOW).state;
  const fresh = importCsvText(emptyState(), exportCsv(s), NOW, "USD");
  eq(fresh.state.transactions[0].currency, "EUR");
});
test("csv", "comma decimal export round-trips with matching decimal", () => {
  let s = seeded();
  s = addTransaction(s, { type: "expense", amount: 2345, accountId: cash(s), envelopeId: firstEnv(s) }, NOW).state;
  const csv = exportCsv(s, { decimal: "," });
  const fresh = importCsvText(emptyState(), csv, NOW, "USD", ",");
  eq(totals(fresh.state, "2000-01-01", "2100-01-01").expense, 2345);
});
test("prefs", "an archived account cannot become the default", () => {
  let s = seeded();
  const b = addAccount(s, { name: "Old" });
  s = b.state;
  s = addTransaction(s, { type: "expense", amount: 100, accountId: b.id!, envelopeId: firstEnv(s) }, NOW).state;
  s = deleteAccount(s, b.id!); // archived (has history)
  s = setDefaultAccount(s, b.id!);
  ok(s.prefs.defaultAccountId !== b.id!, "archived account must not be default");
});

// ─────────────────────────────── summary ───────────────────────────────────
const failures = results.filter((r) => !r.ok).map((r) => `${r.name}: ${r.why}`);
for (const r of results) console.error(`${r.ok ? "PASS" : "FAIL"} ${r.name}${r.why ? ` — ${r.why}` : ""}`);
console.log(JSON.stringify({ tests: results.length, passed: results.length - failures.length, failures, features: [...features] }));
process.exit(failures.length ? 1 : 0);
