/**
 * Simulation of Envelope Mini for the factory's journey bots (scripts/journeys
 * .ts), driving the REAL core logic — no UI. Actions mirror exactly what a
 * screen offers in each state (including invalid input the UI lets you try);
 * goals are one per PRD user flow; invariants are the money rules that must
 * always hold; serialize/deserialize is what the app persists.
 */
import {
  activeAccounts,
  activeEnvelopes,
  envelopeById,
  accountById,
  emptyState,
  liveTxns,
  type BudgetState,
} from "./model";
import {
  addTransaction,
  addTransfer,
  addSplit,
  duplicateTransaction,
  deleteTransaction,
} from "./transactions";
import { addEnvelope } from "./envelopes";
import { addAccount } from "./accounts";
import { seedSamples, startFromScratch } from "./onboarding";
import { addRecurring, postAllDue } from "./recurring";
import { setCustomPeriod, setMonthlyPeriod, preferredAccountId } from "./prefs";
import { addDays, dayOf, type DateKey } from "./dates";

export interface Goal<S> {
  id: string;
  name: string;
  done(state: S): boolean;
}

export interface AppSim<S, A> {
  init(): S;
  actions(state: S): A[];
  apply(state: S, action: A): S;
  goals: Goal<S>[];
  invariants(state: S): string[];
  serialize(state: S): string;
  deserialize(raw: string): S;
}

interface SimState {
  data: BudgetState;
  pro: boolean;
  today: DateKey;
}

type Action =
  | { t: "seed" }
  | { t: "scratch" }
  | { t: "add_envelope" }
  | { t: "add_account" }
  | { t: "add_expense" }
  | { t: "add_expense_bad" } // amount 0 — the UI lets you tap +, Save is rejected
  | { t: "add_income" }
  | { t: "transfer" }
  | { t: "transfer_same" } // same from/to — rejected
  | { t: "split" }
  | { t: "duplicate" }
  | { t: "delete_last" }
  | { t: "create_recurring" }
  | { t: "post_due" }
  | { t: "set_biweekly" }
  | { t: "set_monthly" }
  | { t: "next_day" };

const MAX_SIM_ACCOUNTS = 4;
const MAX_SIM_ENVELOPES = 6;
const iso = (day: DateKey) => `${day}T12:00:00.000`;

const expenseCount = (d: BudgetState) => liveTxns(d).filter((t) => t.type === "expense").length;

/** The most recently added live transaction (highest numeric id). */
function lastTxn(d: BudgetState) {
  const live = liveTxns(d);
  if (!live.length) return null;
  return live.reduce((a, b) => (Number(b.id.slice(1)) > Number(a.id.slice(1)) ? b : a));
}

export const sim: AppSim<SimState, Action> = {
  init: () => ({ data: emptyState(), pro: false, today: "2026-01-05" }),

  actions: (s) => {
    const d = s.data;
    const out: Action[] = [];
    if (!d.onboarded) {
      out.push({ t: "seed" }, { t: "scratch" });
    } else {
      const envs = activeEnvelopes(d);
      const accts = activeAccounts(d);
      if (envs.length < MAX_SIM_ENVELOPES) out.push({ t: "add_envelope" });
      if (accts.length < MAX_SIM_ACCOUNTS) out.push({ t: "add_account" });
      if (envs.length && accts.length) {
        out.push({ t: "add_expense" }, { t: "add_expense_bad" }, { t: "add_income" });
        if (d.recurring.length === 0) out.push({ t: "create_recurring" });
      }
      if (accts.length >= 2) out.push({ t: "transfer" }, { t: "transfer_same" });
      if (envs.length >= 2 && accts.length) out.push({ t: "split" });
      if (lastTxn(d)) out.push({ t: "duplicate" }, { t: "delete_last" });
      if (d.recurring.some((r) => r.status === "active")) out.push({ t: "post_due" });
    }
    // Settings + time are reachable from any onboarded-or-not state.
    out.push({ t: "set_biweekly" }, { t: "set_monthly" }, { t: "next_day" });
    return out;
  },

  apply: (s, a) => {
    const d = s.data;
    const now = iso(s.today);
    const envs = activeEnvelopes(d);
    const accts = activeAccounts(d);
    const acctId = preferredAccountId(d) ?? accts[0]?.id ?? "";

    switch (a.t) {
      case "seed":
        return { ...s, data: seedSamples(d, s.today) };
      case "scratch":
        return { ...s, data: startFromScratch(d) };
      case "add_envelope":
        return { ...s, data: addEnvelope(d, { name: `Envelope ${d.seq}` }).state };
      case "add_account":
        return { ...s, data: addAccount(d, { name: `Account ${d.seq}`, type: "checking" }).state };
      case "add_expense":
        return {
          ...s,
          data: addTransaction(
            d,
            { type: "expense", amount: 2000 + expenseCount(d) * 137, accountId: acctId, envelopeId: envs[0]?.id ?? null },
            now,
          ).state,
        };
      case "add_expense_bad":
        return { ...s, data: addTransaction(d, { type: "expense", amount: 0, accountId: acctId, envelopeId: envs[0]?.id ?? null }, now).state };
      case "add_income":
        return { ...s, data: addTransaction(d, { type: "income", amount: 300000, accountId: acctId, envelopeId: envs[0]?.id ?? null }, now).state };
      case "transfer":
        return { ...s, data: addTransfer(d, { amount: 5000, accountId: accts[0]?.id ?? "", accountIdTo: accts[1]?.id ?? "" }, now).state };
      case "transfer_same":
        return { ...s, data: addTransfer(d, { amount: 5000, accountId: accts[0]?.id ?? "", accountIdTo: accts[0]?.id ?? "" }, now).state };
      case "split":
        return {
          ...s,
          data: addSplit(
            d,
            {
              type: "expense",
              total: 2000,
              accountId: acctId,
              parts: [
                { envelopeId: envs[0]?.id ?? "", amount: 1200 },
                { envelopeId: envs[1]?.id ?? "", amount: 800 },
              ],
            },
            now,
          ).state,
        };
      case "duplicate": {
        const t = lastTxn(d);
        return t ? { ...s, data: duplicateTransaction(d, t.id, now).state } : s;
      }
      case "delete_last": {
        const t = lastTxn(d);
        return t ? { ...s, data: deleteTransaction(d, t.id) } : s;
      }
      case "create_recurring":
        return {
          ...s,
          data: addRecurring(
            d,
            {
              name: "Rent",
              schedule: { kind: "monthly", startDate: s.today, params: { day: Number(s.today.slice(8, 10)) } },
              template: { type: "expense", amount: 120000, envelopeId: envs[0]?.id ?? null, accountId: acctId },
            },
            now,
          ).state,
        };
      case "post_due":
        return { ...s, data: postAllDue(d, s.today).state };
      case "set_biweekly":
        return { ...s, data: setCustomPeriod(d, "biweekly", s.today) };
      case "set_monthly":
        return { ...s, data: setMonthlyPeriod(d) };
      case "next_day":
        return { ...s, today: addDays(s.today, 1) };
    }
  },

  goals: [
    {
      id: "add_expense",
      name: "Log an expense from an envelope (UF1)",
      done: (s) => liveTxns(s.data).some((t) => t.type === "expense"),
    },
    {
      id: "quick_split",
      name: "Split a receipt across envelopes (UF2)",
      done: (s) => {
        const counts = new Map<string, number>();
        for (const t of liveTxns(s.data)) if (t.splitGroupId) counts.set(t.splitGroupId, (counts.get(t.splitGroupId) ?? 0) + 1);
        return [...counts.values()].some((n) => n >= 2);
      },
    },
    {
      id: "recurring_posts",
      name: "Create a recurring bill that posts (UF3)",
      done: (s) => s.data.recurring.length > 0 && liveTxns(s.data).some((t) => t.recurringInstanceId != null),
    },
    {
      id: "transfer",
      name: "Transfer between accounts (UF4)",
      done: (s) => liveTxns(s.data).some((t) => t.type === "transfer"),
    },
    {
      id: "biweekly_cycle",
      name: "Switch to biweekly paycheck budgeting (UF5)",
      done: (s) => s.data.prefs.period.type === "custom" && s.data.prefs.period.pattern === "biweekly",
    },
    {
      id: "duplicate",
      name: "Duplicate a purchase (UF8)",
      done: (s) => {
        const sig = (t: { type: string; amount: number; envelopeId: string | null; accountId: string }) =>
          `${t.type}|${t.amount}|${t.envelopeId}|${t.accountId}`;
        const seen = new Set<string>();
        for (const t of liveTxns(s.data)) {
          if (t.type === "transfer") continue;
          const k = sig(t);
          if (seen.has(k)) return true;
          seen.add(k);
        }
        return false;
      },
    },
  ],

  invariants: (s) => {
    const out: string[] = [];
    const d = s.data;
    const ids = new Set<string>();
    const add = (m: string) => {
      if (out.length < 40) out.push(m);
    };
    const checkId = (id: string, kind: string) => {
      if (ids.has(id)) add(`duplicate id ${id} (${kind})`);
      ids.add(id);
      const n = Number(id.replace(/\D/g, ""));
      if (!Number.isFinite(n) || n >= d.seq) add(`${id} (${kind}) >= seq ${d.seq}`);
    };

    for (const a of d.accounts) checkId(a.id, "account");
    for (const e of d.envelopes) {
      checkId(e.id, "envelope");
      if (e.parentId && !d.envelopes.some((x) => x.id === e.parentId)) add(`${e.id} parent missing`);
    }
    for (const l of d.labels) checkId(l.id, "label");
    for (const b of d.budgets) {
      checkId(b.id, "budget");
      if (!envelopeById(d, b.envelopeId)) add(`budget ${b.id} → missing envelope`);
      if (b.amountPlanned < 0) add(`budget ${b.id} negative plan`);
    }
    for (const r of d.recurring) {
      checkId(r.id, "recurring");
      if (!accountById(d, r.template.accountId)) add(`rule ${r.id} → missing account`);
      if (r.template.type === "expense" && !envelopeById(d, r.template.envelopeId)) add(`rule ${r.id} → missing envelope`);
      if (r.template.amount <= 0) add(`rule ${r.id} non-positive amount`);
    }
    for (const t of d.transactions) {
      checkId(t.id, "txn");
      if (!Number.isInteger(t.amount) || t.amount <= 0) add(`txn ${t.id} bad amount ${t.amount}`);
      if (!accountById(d, t.accountId)) add(`txn ${t.id} → missing account`);
      if (t.type === "transfer") {
        if (!t.accountIdTo || !accountById(d, t.accountIdTo)) add(`transfer ${t.id} → missing destination`);
        if (t.accountIdTo === t.accountId) add(`transfer ${t.id} same account`);
        if (t.envelopeId != null) add(`transfer ${t.id} has an envelope`);
      } else {
        if (t.accountIdTo != null) add(`${t.type} ${t.id} has a destination account`);
        if (t.type === "expense" && !envelopeById(d, t.envelopeId)) add(`expense ${t.id} → missing envelope`);
      }
      // Future-dated recurring must never post before its day arrives.
      if (t.recurringInstanceId && dayOf(t.date) > s.today) add(`posted future instance ${t.id}`);
    }
    return out;
  },

  serialize: (s) => JSON.stringify(s),
  deserialize: (raw) => JSON.parse(raw) as SimState,
};
