/**
 * Transactions: the fast, forgiving entry path the PRD is built around. Add an
 * expense or deposit in a couple of taps with smart defaults, transfer between
 * accounts (never counted as income/expense), split a receipt across envelopes
 * with totals that must reconcile, duplicate the last purchase, bulk-edit, and
 * attach labels. Every edit records an audit trail entry.
 *
 * Pure: no React, no storage, and the clock is always passed in as `now`.
 */
import {
  MAX_NOTE,
  nextId,
  type BudgetState,
  type EditEntry,
  type Transaction,
  type TxnType,
  accountById,
  envelopeById,
  liveTxns,
} from "./model";
import { dayOf, type ISODateTime } from "./dates";
import type { Minor } from "./money";

export type TxnError =
  | "amount_required"
  | "bad_amount"
  | "no_account"
  | "no_envelope"
  | "same_account"
  | "not_found"
  | "split_mismatch"
  | "split_too_few"
  | "split_bad_part";

export interface NewTxn {
  type: "expense" | "income";
  amount: Minor;
  accountId: string;
  envelopeId: string | null;
  date?: ISODateTime;
  note?: string;
  labels?: string[];
  currency?: string; // optional per-record override (defaults to the account's)
}

function clampNote(note: string | undefined): string {
  return (note ?? "").trim().slice(0, MAX_NOTE);
}

function rememberAccount(s: BudgetState, accountId: string): BudgetState["prefs"] {
  return { ...s.prefs, lastUsedAccountId: accountId };
}

/** Validate the amount an entry screen allows the user to type. */
export function validateAmount(amount: Minor | null | undefined): TxnError | null {
  if (amount == null) return "amount_required";
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(amount)) return "bad_amount";
  return null;
}

export function addTransaction(
  s: BudgetState,
  input: NewTxn,
  now: ISODateTime,
): { state: BudgetState; error: TxnError | null; id?: string } {
  const amtErr = validateAmount(input.amount);
  if (amtErr) return { state: s, error: amtErr };
  const account = accountById(s, input.accountId);
  if (!account) return { state: s, error: "no_account" };
  if (input.type === "expense" && !envelopeById(s, input.envelopeId)) return { state: s, error: "no_envelope" };
  if (input.envelopeId && !envelopeById(s, input.envelopeId)) return { state: s, error: "no_envelope" };

  const { id, seq } = nextId(s, "t");
  const txn: Transaction = {
    id,
    type: input.type,
    amount: input.amount,
    currency: input.currency ?? account.currency,
    date: input.date ?? now,
    accountId: input.accountId,
    accountIdTo: null,
    envelopeId: input.envelopeId,
    note: clampNote(input.note),
    labels: input.labels ? [...new Set(input.labels)] : [],
    splitGroupId: null,
    recurringInstanceId: null,
    deleted: false,
    editHistory: [],
  };
  return {
    state: { ...s, transactions: [...s.transactions, txn], prefs: rememberAccount(s, input.accountId), seq },
    error: null,
    id,
  };
}

export interface NewTransfer {
  amount: Minor;
  accountId: string;
  accountIdTo: string;
  date?: ISODateTime;
  note?: string;
}

export function addTransfer(
  s: BudgetState,
  input: NewTransfer,
  now: ISODateTime,
): { state: BudgetState; error: TxnError | null; id?: string } {
  const amtErr = validateAmount(input.amount);
  if (amtErr) return { state: s, error: amtErr };
  const from = accountById(s, input.accountId);
  const to = accountById(s, input.accountIdTo);
  if (!from || !to) return { state: s, error: "no_account" };
  if (input.accountId === input.accountIdTo) return { state: s, error: "same_account" };

  const { id, seq } = nextId(s, "t");
  const txn: Transaction = {
    id,
    type: "transfer",
    amount: input.amount,
    currency: from.currency,
    date: input.date ?? now,
    accountId: input.accountId,
    accountIdTo: input.accountIdTo,
    envelopeId: null,
    note: clampNote(input.note),
    labels: [],
    splitGroupId: null,
    recurringInstanceId: null,
    deleted: false,
    editHistory: [],
  };
  return {
    state: { ...s, transactions: [...s.transactions, txn], prefs: rememberAccount(s, input.accountId), seq },
    error: null,
    id,
  };
}

// ─────────────────────────────── editing ───────────────────────────────────

export type EditableField = "amount" | "date" | "accountId" | "accountIdTo" | "envelopeId" | "note" | "type";

function diffEntries(before: Transaction, patch: Partial<Transaction>, now: ISODateTime): EditEntry[] {
  const fields: EditableField[] = ["amount", "date", "accountId", "accountIdTo", "envelopeId", "note", "type"];
  const out: EditEntry[] = [];
  for (const f of fields) {
    if (patch[f] === undefined) continue;
    const from = before[f];
    const to = patch[f];
    if (String(from) !== String(to)) out.push({ ts: now, field: f, from: String(from ?? ""), to: String(to ?? "") });
  }
  return out;
}

export function editTransaction(
  s: BudgetState,
  id: string,
  patch: Partial<Pick<Transaction, EditableField | "labels">>,
  now: ISODateTime,
): { state: BudgetState; error: TxnError | null } {
  const txn = s.transactions.find((t) => t.id === id);
  if (!txn) return { state: s, error: "not_found" };
  if (patch.amount !== undefined) {
    const e = validateAmount(patch.amount);
    if (e) return { state: s, error: e };
  }

  // Validate against the EFFECTIVE post-edit type, so changing the type can
  // never leave an impossible transaction (e.g. a transfer with no destination,
  // or an expense with no envelope).
  const effType = patch.type ?? txn.type;
  const effAccount = patch.accountId ?? txn.accountId;
  if (!accountById(s, effAccount)) return { state: s, error: "no_account" };

  const normalized: Partial<Transaction> = { ...patch };
  if (patch.note !== undefined) normalized.note = clampNote(patch.note);
  if (patch.labels !== undefined) normalized.labels = [...new Set(patch.labels)];

  if (effType === "transfer") {
    const effTo = patch.accountIdTo !== undefined ? patch.accountIdTo : txn.accountIdTo;
    if (!effTo || !accountById(s, effTo)) return { state: s, error: "no_account" };
    if (effTo === effAccount) return { state: s, error: "same_account" };
    normalized.accountIdTo = effTo;
    normalized.envelopeId = null; // transfers never carry an envelope
  } else {
    const effEnv = patch.envelopeId !== undefined ? patch.envelopeId : txn.envelopeId;
    if (effType === "expense" && !envelopeById(s, effEnv)) return { state: s, error: "no_envelope" };
    if (effEnv && !envelopeById(s, effEnv)) return { state: s, error: "no_envelope" };
    normalized.accountIdTo = null; // non-transfers have no destination account
    normalized.envelopeId = effEnv;
  }

  const history = diffEntries(txn, normalized, now);
  return {
    state: {
      ...s,
      transactions: s.transactions.map((t) =>
        t.id === id ? { ...t, ...normalized, editHistory: [...t.editHistory, ...history] } : t,
      ),
    },
    error: null,
  };
}

// ───────────────────────────── delete / undo ───────────────────────────────

/** Soft-delete (reversible with restoreTransaction / Undo). */
export function deleteTransaction(s: BudgetState, id: string): BudgetState {
  return { ...s, transactions: s.transactions.map((t) => (t.id === id ? { ...t, deleted: true } : t)) };
}
export function restoreTransaction(s: BudgetState, id: string): BudgetState {
  return { ...s, transactions: s.transactions.map((t) => (t.id === id ? { ...t, deleted: false } : t)) };
}

export function deleteSplitGroup(s: BudgetState, splitGroupId: string): BudgetState {
  return {
    ...s,
    transactions: s.transactions.map((t) => (t.splitGroupId === splitGroupId ? { ...t, deleted: true } : t)),
  };
}

// ───────────────────────────────── split ───────────────────────────────────

export interface SplitPart {
  envelopeId: string;
  amount: Minor;
  note?: string;
}

/** Totals must reconcile: ≥2 parts, each positive, summing exactly to total. */
export function validateSplit(total: Minor, parts: SplitPart[]): TxnError | null {
  if (parts.length < 2) return "split_too_few";
  if (parts.some((p) => !Number.isInteger(p.amount) || p.amount <= 0)) return "split_bad_part";
  const sum = parts.reduce((a, p) => a + p.amount, 0);
  if (sum !== total) return "split_mismatch";
  return null;
}

/** Distribute a total into n amounts by percent, with the rounding remainder
 *  pushed onto the first part so the pieces always sum back to the total. */
export function splitByPercent(total: Minor, percents: number[]): Minor[] {
  const raw = percents.map((p) => Math.round((total * p) / 100));
  const drift = total - raw.reduce((a, b) => a + b, 0);
  if (raw.length) raw[0] += drift;
  return raw;
}

export function addSplit(
  s: BudgetState,
  input: {
    type: "expense" | "income";
    total: Minor;
    accountId: string;
    parts: SplitPart[];
    date?: ISODateTime;
    note?: string;
    labels?: string[];
  },
  now: ISODateTime,
): { state: BudgetState; error: TxnError | null; splitGroupId?: string } {
  const amtErr = validateAmount(input.total);
  if (amtErr) return { state: s, error: amtErr };
  const account = accountById(s, input.accountId);
  if (!account) return { state: s, error: "no_account" };
  if (input.parts.some((p) => !envelopeById(s, p.envelopeId))) return { state: s, error: "no_envelope" };
  const splitErr = validateSplit(input.total, input.parts);
  if (splitErr) return { state: s, error: splitErr };

  const groupAlloc = nextId(s, "g");
  const splitGroupId = groupAlloc.id;
  let seq = groupAlloc.seq;
  const txns: Transaction[] = input.parts.map((part) => {
    const id = `t${seq}`;
    seq += 1;
    return {
      id,
      type: input.type,
      amount: part.amount,
      currency: account.currency,
      date: input.date ?? now,
      accountId: input.accountId,
      accountIdTo: null,
      envelopeId: part.envelopeId,
      note: clampNote(part.note ?? input.note),
      labels: input.labels ? [...new Set(input.labels)] : [],
      splitGroupId,
      recurringInstanceId: null,
      deleted: false,
      editHistory: [],
    };
  });
  return {
    state: { ...s, transactions: [...s.transactions, ...txns], prefs: rememberAccount(s, input.accountId), seq },
    error: null,
    splitGroupId,
  };
}

// ─────────────────────────────── duplicate ─────────────────────────────────

/**
 * Duplicate a transaction (or its whole split group), copying every field
 * except the date — which becomes `now` — so logging a frequent purchase is two
 * taps. Returns the id of the primary new transaction.
 */
export function duplicateTransaction(
  s: BudgetState,
  id: string,
  now: ISODateTime,
): { state: BudgetState; error: TxnError | null; id?: string } {
  const src = s.transactions.find((t) => t.id === id);
  if (!src) return { state: s, error: "not_found" };

  if (src.splitGroupId) {
    const members = s.transactions.filter((t) => t.splitGroupId === src.splitGroupId && !t.deleted);
    const groupAlloc = nextId(s, "g");
    const newGroup = groupAlloc.id;
    let seq = groupAlloc.seq;
    const copies: Transaction[] = members.map((m) => {
      const newId = `t${seq}`;
      seq += 1;
      return { ...m, id: newId, date: now, splitGroupId: newGroup, recurringInstanceId: null, editHistory: [] };
    });
    return {
      state: { ...s, transactions: [...s.transactions, ...copies], prefs: rememberAccount(s, src.accountId), seq },
      error: null,
      id: copies[0]?.id,
    };
  }

  const { id: newId, seq } = nextId(s, "t");
  const copy: Transaction = { ...src, id: newId, date: now, splitGroupId: null, recurringInstanceId: null, editHistory: [] };
  return {
    state: { ...s, transactions: [...s.transactions, copy], prefs: rememberAccount(s, src.accountId), seq },
    error: null,
    id: newId,
  };
}

/** The most recent live transaction touching an envelope (for "duplicate last"). */
export function lastTxnForEnvelope(s: BudgetState, envelopeId: string): Transaction | null {
  const matches = liveTxns(s).filter((t) => t.envelopeId === envelopeId);
  if (!matches.length) return null;
  return matches.reduce((a, b) => (b.date > a.date ? b : a));
}

// ───────────────────────────── bulk operations ─────────────────────────────

/** Apply one change to many transactions atomically (envelope, account, type). */
export function bulkEdit(
  s: BudgetState,
  ids: string[],
  patch: Partial<Pick<Transaction, "envelopeId" | "accountId">>,
  now: ISODateTime,
): { state: BudgetState; error: TxnError | null; changed: number } {
  if (patch.envelopeId !== undefined && patch.envelopeId && !envelopeById(s, patch.envelopeId))
    return { state: s, error: "no_envelope", changed: 0 };
  if (patch.accountId !== undefined && !accountById(s, patch.accountId))
    return { state: s, error: "no_account", changed: 0 };
  const idSet = new Set(ids);
  let changed = 0;
  const transactions = s.transactions.map((t) => {
    if (!idSet.has(t.id) || t.deleted) return t;
    // A transfer has no envelope; skip envelope reassignment for it. Also never
    // let an account reassignment turn a transfer into a self-transfer.
    const apply: Partial<Transaction> = {};
    if (patch.accountId !== undefined && !(t.type === "transfer" && patch.accountId === t.accountIdTo))
      apply.accountId = patch.accountId;
    if (patch.envelopeId !== undefined && t.type !== "transfer") apply.envelopeId = patch.envelopeId;
    if (!Object.keys(apply).length) return t;
    changed += 1;
    const history = diffEntries(t, apply, now);
    return { ...t, ...apply, editHistory: [...t.editHistory, ...history] };
  });
  return { state: { ...s, transactions }, error: null, changed };
}

export function bulkDelete(s: BudgetState, ids: string[]): BudgetState {
  const idSet = new Set(ids);
  return { ...s, transactions: s.transactions.map((t) => (idSet.has(t.id) ? { ...t, deleted: true } : t)) };
}

// ──────────────────────────────── labels ───────────────────────────────────

export function addLabel(
  s: BudgetState,
  input: { name: string; color?: string },
): { state: BudgetState; error: "empty_name" | "duplicate" | null; id?: string } {
  const name = input.name.trim();
  if (!name) return { state: s, error: "empty_name" };
  if (s.labels.some((l) => l.name.toLowerCase() === name.toLowerCase())) return { state: s, error: "duplicate" };
  const { id, seq } = nextId(s, "l");
  return {
    state: { ...s, labels: [...s.labels, { id, name, color: input.color ?? "#64748B" }], seq },
    error: null,
    id,
  };
}

/** Delete a label and strip it from every transaction that carried it. */
export function deleteLabel(s: BudgetState, labelId: string): BudgetState {
  return {
    ...s,
    labels: s.labels.filter((l) => l.id !== labelId),
    transactions: s.transactions.map((t) =>
      t.labels.includes(labelId) ? { ...t, labels: t.labels.filter((l) => l !== labelId) } : t,
    ),
  };
}

export function bulkApplyLabel(s: BudgetState, ids: string[], labelId: string, add: boolean): BudgetState {
  const idSet = new Set(ids);
  return {
    ...s,
    transactions: s.transactions.map((t) => {
      if (!idSet.has(t.id)) return t;
      const has = t.labels.includes(labelId);
      if (add && !has) return { ...t, labels: [...t.labels, labelId] };
      if (!add && has) return { ...t, labels: t.labels.filter((l) => l !== labelId) };
      return t;
    }),
  };
}

export function queryTransactions(
  s: BudgetState,
  filter: {
    from?: string;
    to?: string;
    accountId?: string;
    envelopeId?: string;
    labelId?: string;
    types?: TxnType[];
    text?: string;
  } = {},
): Transaction[] {
  const text = filter.text?.trim().toLowerCase();
  return liveTxns(s)
    .filter((t) => {
      const day = dayOf(t.date);
      if (filter.from && day < filter.from) return false;
      if (filter.to && day > filter.to) return false;
      if (filter.accountId && t.accountId !== filter.accountId && t.accountIdTo !== filter.accountId) return false;
      if (filter.envelopeId && t.envelopeId !== filter.envelopeId) return false;
      if (filter.labelId && !t.labels.includes(filter.labelId)) return false;
      if (filter.types && !filter.types.includes(t.type)) return false;
      if (text && !t.note.toLowerCase().includes(text)) return false;
      return true;
    })
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)); // date DESC
}
