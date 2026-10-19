/**
 * The recurring engine — the feature reviewers punish competitors for getting
 * wrong. Flexible cadences, skip/shift, start/end dates, a calendar preview,
 * edit scopes (this / this+future / all with an audit trail), and posting that
 * only ever creates transactions whose day has arrived. Future occurrences are
 * previewed but never affect balances until posted.
 */
import {
  MAX_NOTE,
  nextId,
  type BudgetState,
  type EditScope,
  type RecurringRule,
  type Schedule,
  type ScheduleKind,
  type Transaction,
  accountById,
  envelopeById,
} from "./model";
import {
  addDays,
  daysBetween,
  daysInMonth,
  dateFromKey,
  type DateKey,
  type ISODateTime,
} from "./dates";
import { validateAmount } from "./transactions";

export type RecurringError =
  | "empty_name"
  | "bad_amount"
  | "no_account"
  | "no_envelope"
  | "bad_schedule"
  | "not_found";

const p2 = (n: number) => String(n).padStart(2, "0");
const isoNoon = (day: DateKey): ISODateTime => `${day}T12:00:00.000`;
const instanceKey = (ruleId: string, day: DateKey) => `${ruleId}:${day}`;

// ─────────────────────── occurrence date generation ────────────────────────

function monthKey(year: number, month1: number, day: number): DateKey {
  const last = daysInMonth(year, month1);
  return `${year}-${p2(month1)}-${p2(Math.min(day, last))}`;
}

function nthWeekdayOfMonth(year: number, month1: number, weekday: number, nth: number): DateKey | null {
  const firstDow = new Date(year, month1 - 1, 1).getDay();
  let day = 1 + ((weekday - firstDow + 7) % 7) + (nth - 1) * 7;
  if (day > daysInMonth(year, month1)) return null;
  return `${year}-${p2(month1)}-${p2(day)}`;
}

function lastWeekdayOfMonth(year: number, month1: number, weekday: number): DateKey {
  const last = daysInMonth(year, month1);
  const lastDow = new Date(year, month1 - 1, last).getDay();
  const day = last - ((lastDow - weekday + 7) % 7);
  return `${year}-${p2(month1)}-${p2(day)}`;
}

function applyShift(day: DateKey, shift: Schedule["shift"]): DateKey {
  if (shift === "none") return day;
  const dow = dateFromKey(day).getDay();
  if (dow !== 0 && dow !== 6) return day;
  if (shift === "nextWeekday") return applyShift(addDays(day, 1), shift);
  return applyShift(addDays(day, -1), shift);
}

function intervalDays(kind: ScheduleKind, params: Schedule["params"]): number | null {
  if (kind === "weekly") return 7;
  if (kind === "biweekly") return 14;
  if (kind === "nDays") return Math.max(1, Math.floor(params.n ?? 0));
  return null;
}

/**
 * Scheduled dates (before skips) whose SHIFTED date lands within [from, to].
 * Respects the schedule's start and end dates.
 */
export function occurrencesBetween(sch: Schedule, from: DateKey, to: DateKey): DateKey[] {
  if (from > to) return [];
  const hardEnd = sch.endDate && sch.endDate < to ? sch.endDate : to;
  const out: DateKey[] = [];
  const push = (scheduled: DateKey) => {
    // The shifted date is the canonical occurrence the rest of the engine uses
    // (posting, calendar, skips). Gate start/end/skip against IT so a weekend
    // shift can never escape the rule's own boundaries or dodge a skip.
    const shifted = applyShift(scheduled, sch.shift);
    if (shifted < sch.startDate) return;
    if (sch.endDate && shifted > sch.endDate) return;
    if (sch.skips.includes(shifted)) return;
    if (shifted >= from && shifted <= to) out.push(shifted);
  };

  const step = intervalDays(sch.kind, sch.params);
  if (step != null) {
    // Day-stepped cadence. Weekly/biweekly anchor to the chosen weekday when one
    // is given (so a start date on a different weekday still lands correctly).
    let anchor = sch.startDate;
    if ((sch.kind === "weekly" || sch.kind === "biweekly") && sch.params.weekday != null) {
      const delta = ((sch.params.weekday - dateFromKey(anchor).getDay()) % 7 + 7) % 7;
      anchor = addDays(anchor, delta);
    }
    const gap = daysBetween(anchor, from);
    const skip = gap > 0 ? Math.floor(gap / step) : 0;
    let cur = addDays(anchor, skip * step);
    // step back a little so a shift can pull an occurrence into the window
    cur = addDays(cur, -step);
    let guard = 0;
    while (cur <= addDays(hardEnd, step) && guard++ < 100_000) {
      push(cur);
      cur = addDays(cur, step);
    }
    return [...new Set(out)].sort();
  }

  // month-based cadences — iterate month by month across the window
  const [fy, fm] = (from < sch.startDate ? sch.startDate : from).split("-").map(Number);
  const [ty, tm] = hardEnd.split("-").map(Number);
  let year = fy;
  let month = fm;
  let guard = 0;
  while ((year < ty || (year === ty && month <= tm + 1)) && guard++ < 10_000) {
    switch (sch.kind) {
      case "monthly":
        push(monthKey(year, month, sch.params.day ?? 1));
        break;
      case "semiMonthly":
        for (const d of sch.params.days ?? [1, 15]) push(monthKey(year, month, d));
        break;
      case "firstWeekday": {
        const d = nthWeekdayOfMonth(year, month, sch.params.weekday ?? 1, 1);
        if (d) push(d);
        break;
      }
      case "nthWeekday": {
        const d = nthWeekdayOfMonth(year, month, sch.params.weekday ?? 1, sch.params.nth ?? 1);
        if (d) push(d);
        break;
      }
      case "lastWeekday":
        push(lastWeekdayOfMonth(year, month, sch.params.weekday ?? 1));
        break;
    }
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return [...new Set(out)].sort();
}

/** The next occurrence strictly on or after `day`, or null past the end date. */
export function nextOccurrence(sch: Schedule, day: DateKey): DateKey | null {
  const horizon = sch.endDate ?? addDays(day, 366 * 5);
  const occ = occurrencesBetween(sch, day, horizon);
  return occ[0] ?? null;
}

export function validateSchedule(sch: Schedule): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sch.startDate)) return false;
  if (sch.endDate && sch.endDate < sch.startDate) return false;
  const pr = sch.params;
  switch (sch.kind) {
    case "nDays":
      return (pr.n ?? 0) >= 1;
    case "monthly":
      return (pr.day ?? 0) >= 1 && (pr.day ?? 0) <= 31;
    case "semiMonthly":
      return !!pr.days && pr.days.length >= 1 && pr.days.every((d) => d >= 1 && d <= 31);
    case "weekly":
    case "biweekly":
      return true;
    case "firstWeekday":
    case "lastWeekday":
      return (pr.weekday ?? -1) >= 0 && (pr.weekday ?? 7) <= 6;
    case "nthWeekday":
      return (pr.weekday ?? -1) >= 0 && (pr.weekday ?? 7) <= 6 && (pr.nth ?? 0) >= 1 && (pr.nth ?? 0) <= 5;
  }
}

// ─────────────────────────────── rule CRUD ─────────────────────────────────

export interface NewRecurring {
  name: string;
  schedule: {
    kind: ScheduleKind;
    startDate: DateKey;
    endDate?: DateKey | null;
    params?: Schedule["params"];
    shift?: Schedule["shift"];
  };
  template: {
    type: "expense" | "income";
    amount: number;
    envelopeId: string | null;
    accountId: string;
    note?: string;
  };
  status?: "active" | "paused";
}

function buildSchedule(input: NewRecurring["schedule"]): Schedule {
  return {
    kind: input.kind,
    startDate: input.startDate,
    endDate: input.endDate ?? null,
    params: input.params ?? {},
    skips: [],
    shift: input.shift ?? "none",
  };
}

export function addRecurring(
  s: BudgetState,
  input: NewRecurring,
  now: ISODateTime,
): { state: BudgetState; error: RecurringError | null; id?: string } {
  if (!input.name.trim()) return { state: s, error: "empty_name" };
  if (validateAmount(input.template.amount)) return { state: s, error: "bad_amount" };
  if (!accountById(s, input.template.accountId)) return { state: s, error: "no_account" };
  if (input.template.type === "expense" && !envelopeById(s, input.template.envelopeId))
    return { state: s, error: "no_envelope" };
  const schedule = buildSchedule(input.schedule);
  if (!validateSchedule(schedule)) return { state: s, error: "bad_schedule" };

  const { id, seq } = nextId(s, "r");
  const rule: RecurringRule = {
    id,
    name: input.name.trim(),
    status: input.status ?? "active",
    schedule,
    template: {
      type: input.template.type,
      amount: input.template.amount,
      envelopeId: input.template.envelopeId,
      accountId: input.template.accountId,
      note: (input.template.note ?? "").slice(0, MAX_NOTE),
    },
    lastPostedAt: null,
    audit: [{ ts: now, scope: "all", note: "created" }],
  };
  return { state: { ...s, recurring: [...s.recurring, rule], seq }, error: null, id };
}

export function pauseRecurring(s: BudgetState, ruleId: string, paused: boolean): BudgetState {
  return {
    ...s,
    recurring: s.recurring.map((r) => (r.id === ruleId ? { ...r, status: paused ? "paused" : "active" } : r)),
  };
}

export function deleteRecurring(s: BudgetState, ruleId: string): BudgetState {
  return { ...s, recurring: s.recurring.filter((r) => r.id !== ruleId) };
}

/** Skip a single future occurrence (scope "this" on an unposted date). */
export function skipOccurrence(s: BudgetState, ruleId: string, day: DateKey, now: ISODateTime): BudgetState {
  return {
    ...s,
    recurring: s.recurring.map((r) =>
      r.id === ruleId
        ? {
            ...r,
            schedule: { ...r.schedule, skips: [...new Set([...r.schedule.skips, day])] },
            audit: [...r.audit, { ts: now, scope: "this", note: `skip ${day}` }],
          }
        : r,
    ),
  };
}

/**
 * Edit a rule with an explicit scope (the dialog the PRD requires):
 *  • "all"           — change the rule itself from the start.
 *  • "thisAndFuture" — end the current rule the day before `effectiveDate` and
 *                      spin off a new rule starting then with the changes.
 *  • "this"          — only affect one occurrence (skip it here; the caller
 *                      edits/creates the single transaction separately).
 * Every edit appends to the rule's audit history.
 */
export function editRecurring(
  s: BudgetState,
  ruleId: string,
  patch: {
    name?: string;
    status?: "active" | "paused";
    schedule?: Partial<NewRecurring["schedule"]>;
    template?: Partial<NewRecurring["template"]>;
  },
  scope: EditScope,
  effectiveDate: DateKey,
  now: ISODateTime,
): { state: BudgetState; error: RecurringError | null; id?: string } {
  const rule = s.recurring.find((r) => r.id === ruleId);
  if (!rule) return { state: s, error: "not_found" };

  const merged = mergeRule(rule, patch);
  if (!merged) return { state: s, error: "bad_schedule" };
  const check = validateMerged(s, merged);
  if (check) return { state: s, error: check };

  if (scope === "all") {
    return {
      state: {
        ...s,
        recurring: s.recurring.map((r) =>
          r.id === ruleId ? { ...merged, audit: [...rule.audit, { ts: now, scope, note: "edit all" }] } : r,
        ),
      },
      error: null,
      id: ruleId,
    };
  }

  if (scope === "thisAndFuture") {
    const endedOld: RecurringRule = {
      ...rule,
      schedule: { ...rule.schedule, endDate: addDays(effectiveDate, -1) },
      audit: [...rule.audit, { ts: now, scope, note: `split at ${effectiveDate}` }],
    };
    const { id, seq } = nextId(s, "r");
    const spun: RecurringRule = {
      ...merged,
      id,
      schedule: { ...merged.schedule, startDate: effectiveDate, skips: [] },
      // Inherit the parent's posting watermark so occurrences the parent already
      // posted are never re-posted as duplicates under the new rule.
      lastPostedAt: rule.lastPostedAt,
      audit: [{ ts: now, scope, note: `from ${effectiveDate}` }],
    };
    return {
      state: { ...s, recurring: [...s.recurring.map((r) => (r.id === ruleId ? endedOld : r)), spun], seq },
      error: null,
      id,
    };
  }

  // scope === "this" — skip only the targeted occurrence.
  return { state: skipOccurrence(s, ruleId, effectiveDate, now), error: null, id: ruleId };
}

function mergeRule(rule: RecurringRule, patch: Parameters<typeof editRecurring>[2]): RecurringRule | null {
  const schedule: Schedule = patch.schedule
    ? {
        ...rule.schedule,
        kind: patch.schedule.kind ?? rule.schedule.kind,
        startDate: patch.schedule.startDate ?? rule.schedule.startDate,
        endDate: patch.schedule.endDate === undefined ? rule.schedule.endDate : patch.schedule.endDate,
        params: patch.schedule.params ?? rule.schedule.params,
        shift: patch.schedule.shift ?? rule.schedule.shift,
      }
    : rule.schedule;
  if (!validateSchedule(schedule)) return null;
  return {
    ...rule,
    name: patch.name !== undefined ? patch.name.trim() : rule.name,
    status: patch.status ?? rule.status,
    schedule,
    template: patch.template
      ? {
          type: patch.template.type ?? rule.template.type,
          amount: patch.template.amount ?? rule.template.amount,
          envelopeId: patch.template.envelopeId !== undefined ? patch.template.envelopeId : rule.template.envelopeId,
          accountId: patch.template.accountId ?? rule.template.accountId,
          note: patch.template.note !== undefined ? patch.template.note.slice(0, MAX_NOTE) : rule.template.note,
        }
      : rule.template,
  };
}

function validateMerged(s: BudgetState, rule: RecurringRule): RecurringError | null {
  if (!rule.name.trim()) return "empty_name";
  if (validateAmount(rule.template.amount)) return "bad_amount";
  if (!accountById(s, rule.template.accountId)) return "no_account";
  if (rule.template.type === "expense" && !envelopeById(s, rule.template.envelopeId)) return "no_envelope";
  return null;
}

// ──────────────────────────────── posting ──────────────────────────────────

/**
 * Post every due occurrence of a rule up to and including `now` (local day).
 * Idempotent — an occurrence that already produced a transaction is never
 * posted twice. Future occurrences are left alone. Paused rules post nothing.
 */
export function postDue(
  s: BudgetState,
  ruleId: string,
  now: DateKey,
): { state: BudgetState; posted: DateKey[] } {
  const rule = s.recurring.find((r) => r.id === ruleId);
  if (!rule || rule.status !== "active") return { state: s, posted: [] };

  const fromDay = rule.lastPostedAt ? addDays(rule.lastPostedAt, 1) : rule.schedule.startDate;
  if (fromDay > now) return { state: s, posted: [] };

  const due = occurrencesBetween(rule.schedule, fromDay, now);
  if (!due.length) {
    // Nothing to post, but advance the watermark so we don't rescan forever.
    return {
      state: { ...s, recurring: s.recurring.map((r) => (r.id === ruleId ? { ...r, lastPostedAt: now } : r)) },
      posted: [],
    };
  }

  const existing = new Set(s.transactions.map((t) => t.recurringInstanceId).filter(Boolean) as string[]);
  const newTxns: Transaction[] = [];
  let seq = s.seq;
  const posted: DateKey[] = [];
  const acc = accountById(s, rule.template.accountId);
  const currency = acc ? acc.currency : s.prefs.currency;

  for (const day of due) {
    const key = instanceKey(ruleId, day);
    if (existing.has(key)) continue;
    newTxns.push({
      id: `t${seq}`,
      type: rule.template.type,
      amount: rule.template.amount,
      currency,
      date: isoNoon(day),
      accountId: rule.template.accountId,
      accountIdTo: null,
      envelopeId: rule.template.envelopeId,
      note: rule.template.note,
      labels: [],
      splitGroupId: null,
      recurringInstanceId: key,
      deleted: false,
      editHistory: [],
    });
    seq += 1;
    posted.push(day);
  }

  return {
    state: {
      ...s,
      transactions: [...s.transactions, ...newTxns],
      recurring: s.recurring.map((r) => (r.id === ruleId ? { ...r, lastPostedAt: now } : r)),
      seq,
    },
    posted,
  };
}

/** Post all active rules that have due occurrences (called on app open). */
export function postAllDue(s: BudgetState, now: DateKey): { state: BudgetState; posted: number } {
  let state = s;
  let total = 0;
  for (const r of s.recurring) {
    const res = postDue(state, r.id, now);
    state = res.state;
    total += res.posted.length;
  }
  return { state, posted: total };
}

export interface CalendarItem {
  ruleId: string;
  name: string;
  day: DateKey;
  type: "expense" | "income";
  amount: number;
  posted: boolean;
}

/** Upcoming (and recently posted) occurrences for the calendar preview. */
export function calendarPreview(s: BudgetState, from: DateKey, to: DateKey): CalendarItem[] {
  const posted = new Set(s.transactions.map((t) => t.recurringInstanceId).filter(Boolean) as string[]);
  const items: CalendarItem[] = [];
  for (const r of s.recurring) {
    if (r.status !== "active") continue;
    for (const day of occurrencesBetween(r.schedule, from, to)) {
      items.push({
        ruleId: r.id,
        name: r.name,
        day,
        type: r.template.type,
        amount: r.template.amount,
        posted: posted.has(instanceKey(r.id, day)),
      });
    }
  }
  return items.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
}
