/**
 * Accounts and their balances. The golden rule the PRD hammers on: transfers
 * move money between accounts but are NEVER income or expense. Balance =
 * startingBalance + income − expense − transfersOut + transfersIn, computed
 * only from transactions on or before the reference day (future-dated items
 * don't move today's balance).
 */
import {
  MAX_ACCOUNTS,
  MAX_NAME,
  nextId,
  type Account,
  type AccountType,
  type BudgetState,
  activeAccounts,
  liveTxns,
} from "./model";
import { dayOf, type DateKey } from "./dates";
import type { Minor } from "./money";

export type AccountError = "empty_name" | "too_long" | "duplicate" | "not_found" | "limit";

export function validateAccountName(s: BudgetState, raw: string, exceptId?: string): AccountError | null {
  const name = raw.trim();
  if (!name) return "empty_name";
  if (name.length > MAX_NAME) return "too_long";
  if (s.accounts.some((a) => !a.archived && a.id !== exceptId && a.name.toLowerCase() === name.toLowerCase()))
    return "duplicate";
  return null;
}

export function addAccount(
  s: BudgetState,
  input: { name: string; type?: AccountType; startingBalance?: Minor; currency?: string },
): { state: BudgetState; error: AccountError | null; id?: string } {
  if (s.accounts.filter((a) => !a.archived).length >= MAX_ACCOUNTS) return { state: s, error: "limit" };
  const err = validateAccountName(s, input.name);
  if (err) return { state: s, error: err };
  const { id, seq } = nextId(s, "a");
  const order = s.accounts.reduce((m, a) => Math.max(m, a.order), -1) + 1;
  const account: Account = {
    id,
    name: input.name.trim(),
    type: input.type ?? "cash",
    currency: input.currency ?? s.prefs.currency,
    startingBalance: input.startingBalance ?? 0,
    order,
    archived: false,
  };
  const prefs =
    s.prefs.defaultAccountId == null
      ? { ...s.prefs, defaultAccountId: id, lastUsedAccountId: id }
      : s.prefs;
  return { state: { ...s, accounts: [...s.accounts, account], prefs, seq }, error: null, id };
}

export function editAccount(
  s: BudgetState,
  id: string,
  patch: Partial<Pick<Account, "name" | "type" | "startingBalance" | "currency">>,
): { state: BudgetState; error: AccountError | null } {
  const acc = s.accounts.find((a) => a.id === id);
  if (!acc) return { state: s, error: "not_found" };
  if (patch.name !== undefined) {
    const e = validateAccountName(s, patch.name, id);
    if (e) return { state: s, error: e };
  }
  return {
    state: {
      ...s,
      accounts: s.accounts.map((a) =>
        a.id === id ? { ...a, ...patch, ...(patch.name !== undefined ? { name: patch.name.trim() } : {}) } : a,
      ),
    },
    error: null,
  };
}

export function canDeleteAccount(s: BudgetState, id: string): boolean {
  return !s.transactions.some((t) => !t.deleted && (t.accountId === id || t.accountIdTo === id));
}

/** Delete (hard when no history, archive otherwise) and clear it as a default. */
export function deleteAccount(s: BudgetState, id: string): BudgetState {
  if (!s.accounts.some((a) => a.id === id)) return s;
  const prefs = {
    ...s.prefs,
    defaultAccountId: s.prefs.defaultAccountId === id ? null : s.prefs.defaultAccountId,
    lastUsedAccountId: s.prefs.lastUsedAccountId === id ? null : s.prefs.lastUsedAccountId,
  };
  if (!canDeleteAccount(s, id)) {
    return { ...s, accounts: s.accounts.map((a) => (a.id === id ? { ...a, archived: true } : a)), prefs };
  }
  return { ...s, accounts: s.accounts.filter((a) => a.id !== id), prefs };
}

export function reorderAccounts(s: BudgetState, id: string, toIndex: number): BudgetState {
  const visible = activeAccounts(s);
  const from = visible.findIndex((a) => a.id === id);
  if (from < 0) return s;
  const clamped = Math.max(0, Math.min(toIndex, visible.length - 1));
  if (from === clamped) return s;
  const ids = visible.map((a) => a.id);
  ids.splice(clamped, 0, ids.splice(from, 1)[0]);
  const orderMap = new Map(ids.map((aid, i) => [aid, i]));
  return {
    ...s,
    accounts: s.accounts.map((a) => (orderMap.has(a.id) ? { ...a, order: orderMap.get(a.id)! } : a)),
  };
}

/**
 * Balance of one account as of `asOf` (inclusive). Expenses reduce it, income
 * raises it, transfers move between source and destination — and because this
 * only counts transactions dated on or before `asOf`, future-dated items never
 * change the balance until their day arrives.
 */
export function accountBalance(s: BudgetState, accountId: string, asOf: DateKey): Minor {
  const acc = s.accounts.find((a) => a.id === accountId);
  if (!acc) return 0;
  let bal = acc.startingBalance;
  for (const t of liveTxns(s)) {
    if (dayOf(t.date) > asOf) continue;
    if (t.type === "expense" && t.accountId === accountId) bal -= t.amount;
    else if (t.type === "income" && t.accountId === accountId) bal += t.amount;
    else if (t.type === "transfer") {
      if (t.accountId === accountId) bal -= t.amount;
      if (t.accountIdTo === accountId) bal += t.amount;
    }
  }
  return bal;
}

/** Sum of all visible accounts' balances (net worth across the book). */
export function totalBalance(s: BudgetState, asOf: DateKey): Minor {
  return activeAccounts(s).reduce((sum, a) => sum + accountBalance(s, a.id, asOf), 0);
}

export const accountLabel: Record<AccountType, string> = {
  cash: "Cash",
  checking: "Checking",
  savings: "Savings",
  credit: "Credit",
};
