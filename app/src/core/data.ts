import { persisted, usePersisted } from "../modules/persist";
import { SCHEMA_VERSION, emptyState, type BudgetState } from "./model";

/**
 * Envelope Mini's on-device data — the real app store. Versioned with a
 * migrate path so a user's budget survives every update. The app is
 * offline-first (no cloud capability), so this is the single source of truth.
 */
export const budgetStore = persisted<BudgetState>("envmini_v1", emptyState(), {
  version: SCHEMA_VERSION,
  migrate: (old, from) => migrateBudget(old, from),
});
export const useBudget = () => usePersisted(budgetStore);

/**
 * Carry a user's data forward across schema versions. Unknown/older shapes fall
 * back to a fresh state merged with whatever fields we recognise, so nothing
 * crashes on load. New versions add their own `from < N` branches here.
 */
export function migrateBudget(old: unknown, _from: number): BudgetState {
  const base = emptyState();
  if (!old || typeof old !== "object") return base;
  const o = old as Partial<BudgetState>;
  return {
    ...base,
    ...o,
    prefs: { ...base.prefs, ...(o.prefs ?? {}), security: { ...base.prefs.security, ...(o.prefs?.security ?? {}) } },
    accounts: o.accounts ?? base.accounts,
    envelopes: o.envelopes ?? base.envelopes,
    transactions: o.transactions ?? base.transactions,
    budgets: o.budgets ?? base.budgets,
    recurring: o.recurring ?? base.recurring,
    labels: o.labels ?? base.labels,
    seq: typeof o.seq === "number" ? o.seq : base.seq,
    onboarded: !!o.onboarded,
  };
}
