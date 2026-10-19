/**
 * First-run setup. Onboarding is ≤3 screens and skippable; either path lands on
 * the envelope list with the core action one tap away. "Create samples" seeds a
 * Cash account plus the three starter envelopes (with budgets for the current
 * period) so the app is useful in seconds; "Start from scratch" just drops in a
 * Cash account so there is always somewhere to log a purchase.
 */
import { SAMPLE_ENVELOPES, type BudgetState } from "./model";
import { addAccount } from "./accounts";
import { addEnvelope } from "./envelopes";
import { setBudget } from "./budget";
import { periodFor, type DateKey } from "./dates";
import { toMinor } from "./money";

/** Ensure a default Cash account exists (UF1 edge: auto-create if none). */
export function ensureCashAccount(s: BudgetState): BudgetState {
  if (s.accounts.some((a) => !a.archived)) return s;
  return addAccount(s, { name: "Cash", type: "cash" }).state;
}

export function seedSamples(s: BudgetState, today: DateKey): BudgetState {
  let state = ensureCashAccount(s);
  const period = periodFor(today, state.prefs.period);
  for (const sample of SAMPLE_ENVELOPES) {
    const res = addEnvelope(state, {
      name: sample.name,
      icon: sample.icon,
      color: sample.color,
      rolloverEnabled: sample.rollover,
    });
    state = res.state;
    if (res.id && sample.planned > 0) {
      state = setBudget(state, res.id, period, toMinor(sample.planned, state.prefs.currency));
    }
  }
  return { ...state, onboarded: true };
}

export function startFromScratch(s: BudgetState): BudgetState {
  return { ...ensureCashAccount(s), onboarded: true };
}

export function finishOnboarding(s: BudgetState): BudgetState {
  return { ...s, onboarded: true };
}
