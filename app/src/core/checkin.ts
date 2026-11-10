import { dayOf, type DateKey } from "./dates";
import type { BudgetState, Transaction } from "./model";

/** Derive the home check-in from saved entries; never seed activity or persist a second counter. */
export function dailyCheckIn(s: BudgetState, today: DateKey): {
  latest: Transaction | null;
  todayCount: number;
} {
  let latest: Transaction | null = null;
  let todayCount = 0;
  for (const entry of s.transactions) {
    if (entry.deleted || entry.type === "transfer" || entry.recurringInstanceId) continue;
    latest = entry;
    if (dayOf(entry.date) === today) todayCount += 1;
  }
  return { latest, todayCount };
}
