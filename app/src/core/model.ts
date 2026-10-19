/**
 * The Envelope Mini domain model — every entity from the PRD, the root state
 * that gets persisted, deterministic id generation (a single counter, so the
 * same actions always produce the same ids — essential for the journey bots'
 * save/restore round-trips), and the sample data for onboarding.
 *
 * Pure data + tiny helpers only. All behaviour lives in the sibling modules.
 */
import { DEFAULT_PERIOD, type DateKey, type ISODateTime, type PeriodSettings } from "./dates";
import type { Minor } from "./money";

export type AccountType = "cash" | "checking" | "savings" | "credit";
export type TxnType = "expense" | "income" | "transfer";
export type ThemeMode = "system" | "light" | "dark";

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  currency: string; // ISO 4217
  startingBalance: Minor;
  order: number;
  archived: boolean;
}

export interface Envelope {
  id: string;
  name: string;
  icon: string;
  color: string; // hex
  order: number;
  archived: boolean;
  parentId: string | null; // sub-envelope support
  rolloverEnabled: boolean;
}

export interface Label {
  id: string;
  name: string;
  color: string;
}

export interface EditEntry {
  ts: ISODateTime;
  field: string;
  from: string;
  to: string;
}

export interface Transaction {
  id: string;
  type: TxnType;
  amount: Minor; // always positive
  currency: string;
  date: ISODateTime;
  accountId: string;
  accountIdTo: string | null; // transfers only
  envelopeId: string | null; // null for transfers
  note: string;
  labels: string[]; // Label ids
  splitGroupId: string | null;
  recurringInstanceId: string | null; // "<ruleId>:<DateKey>" of the occurrence it posted
  deleted: boolean;
  editHistory: EditEntry[];
}

export interface Budget {
  id: string;
  envelopeId: string;
  periodIndex: number; // which period (from PeriodSettings) this plan is for
  periodStart: DateKey;
  periodEnd: DateKey;
  amountPlanned: Minor;
}

export type ScheduleKind =
  | "weekly"
  | "biweekly"
  | "semiMonthly"
  | "monthly"
  | "nDays"
  | "firstWeekday"
  | "lastWeekday"
  | "nthWeekday";

export type ShiftMode = "none" | "prevWeekday" | "nextWeekday";

export interface Schedule {
  kind: ScheduleKind;
  startDate: DateKey;
  endDate: DateKey | null;
  /** weekday 0-6, day-of-month 1-31, nth 1-5, n (for nDays), days (semiMonthly). */
  params: { weekday?: number; day?: number; nth?: number; n?: number; days?: number[] };
  skips: DateKey[]; // occurrences the user chose to skip
  shift: ShiftMode; // move off weekends
}

export interface RecurringRule {
  id: string;
  name: string;
  status: "active" | "paused";
  schedule: Schedule;
  template: {
    type: "expense" | "income";
    amount: Minor;
    envelopeId: string | null;
    accountId: string;
    note: string;
  };
  lastPostedAt: DateKey | null; // last occurrence date posted
  audit: { ts: ISODateTime; scope: EditScope; note: string }[];
}

export type EditScope = "this" | "thisAndFuture" | "all";

export interface Security {
  pinEnabled: boolean;
  pinHash: string | null; // salted hash, never the raw PIN
  biometricEnabled: boolean;
  lockTimeoutSec: number;
}

export interface UserPrefs {
  currency: string;
  theme: ThemeMode;
  period: PeriodSettings;
  defaultAccountId: string | null;
  lastUsedAccountId: string | null;
  security: Security;
  warnOverspend: boolean;
}

export interface BudgetState {
  accounts: Account[];
  envelopes: Envelope[];
  transactions: Transaction[];
  budgets: Budget[];
  recurring: RecurringRule[];
  labels: Label[];
  prefs: UserPrefs;
  seq: number; // monotonic id counter
  onboarded: boolean;
}

export const SCHEMA_VERSION = 1;

export const DEFAULT_SECURITY: Security = {
  pinEnabled: false,
  pinHash: null,
  biometricEnabled: false,
  lockTimeoutSec: 60,
};

export const DEFAULT_PREFS: UserPrefs = {
  currency: "USD",
  theme: "system",
  period: DEFAULT_PERIOD,
  defaultAccountId: null,
  lastUsedAccountId: null,
  security: DEFAULT_SECURITY,
  warnOverspend: true,
};

export function emptyState(): BudgetState {
  return {
    accounts: [],
    envelopes: [],
    transactions: [],
    budgets: [],
    recurring: [],
    labels: [],
    prefs: { ...DEFAULT_PREFS, security: { ...DEFAULT_SECURITY }, period: { ...DEFAULT_PERIOD } },
    seq: 1,
    onboarded: false,
  };
}

// ───────────────────────────── id generation ───────────────────────────────

/** Allocate the next id for `prefix`, returning the id and the bumped state. */
export function nextId(s: BudgetState, prefix: string): { id: string; seq: number } {
  return { id: `${prefix}${s.seq}`, seq: s.seq + 1 };
}

// ──────────────────────────── limits & palette ─────────────────────────────

export const MAX_NAME = 40;
export const MAX_NOTE = 140;
export const MAX_ENVELOPES_FREE = Infinity; // envelopes are a free core feature
export const MAX_ACCOUNTS = 50;

export const ENVELOPE_COLORS = [
  "#10B981",
  "#F59E0B",
  "#EF4444",
  "#3B82F6",
  "#8B5CF6",
  "#EC4899",
  "#14B8A6",
  "#64748B",
];

export const ENVELOPE_ICONS = [
  "cart",
  "fuel",
  "food",
  "home",
  "bolt",
  "heart",
  "gift",
  "star",
  "bag",
  "car",
];

export interface SampleEnvelope {
  name: string;
  icon: string;
  color: string;
  planned: number; // major units, converted on seed
  rollover: boolean;
}

export const SAMPLE_ENVELOPES: SampleEnvelope[] = [
  { name: "Groceries", icon: "cart", color: "#10B981", planned: 500, rollover: true },
  { name: "Fuel", icon: "fuel", color: "#F59E0B", planned: 150, rollover: false },
  { name: "Eating Out", icon: "food", color: "#EF4444", planned: 120, rollover: true },
];

// ──────────────────────────── small lookups ────────────────────────────────

export const activeAccounts = (s: BudgetState) =>
  s.accounts.filter((a) => !a.archived).sort((a, b) => a.order - b.order);
export const activeEnvelopes = (s: BudgetState) =>
  s.envelopes.filter((e) => !e.archived).sort((a, b) => a.order - b.order);
export const liveTxns = (s: BudgetState) => s.transactions.filter((t) => !t.deleted);

export const accountById = (s: BudgetState, id: string | null) =>
  id ? s.accounts.find((a) => a.id === id) ?? null : null;
export const envelopeById = (s: BudgetState, id: string | null) =>
  id ? s.envelopes.find((e) => e.id === id) ?? null : null;
export const labelById = (s: BudgetState, id: string) => s.labels.find((l) => l.id === id) ?? null;
