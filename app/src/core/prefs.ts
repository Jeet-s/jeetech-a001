/**
 * User preferences, the security lock, and Pro gating. All core budgeting is
 * free; Pro (the lifetime pro_unlock) only unlocks power features — so the gate
 * here must never cover the app's core job. Switching currency or budget period
 * changes views only; stored transactions and budgets are never rewritten.
 *
 * The PIN is stored as a salted hash, never in the clear. The hash is a simple
 * deterministic digest (the OS keychain in the UI layer provides real at-rest
 * protection); core only needs to verify a PIN without ever keeping it.
 */
import {
  type BudgetState,
  type ThemeMode,
  type UserPrefs,
  accountById,
} from "./model";
import type { PeriodSettings, PeriodPattern, DateKey } from "./dates";

// ─────────────────────────────── Pro gating ────────────────────────────────

export type ProFeature =
  | "advanced_reports" // multi-month compare, envelope drill exports
  | "bulk_edit" // multi-select bulk operations
  | "pdf_export" // PDF report/budget export
  | "multiple_books" // separate budgets
  | "advanced_themes"; // extra themes beyond base + dark

export const PRO_FEATURES: ProFeature[] = [
  "advanced_reports",
  "bulk_edit",
  "pdf_export",
  "multiple_books",
  "advanced_themes",
];

/** True if a feature sits behind the Pro unlock. Core budgeting is never here. */
export function requiresPro(feature: ProFeature): boolean {
  return PRO_FEATURES.includes(feature);
}

/** Can the user use this feature given their Pro entitlement? */
export function canUse(feature: ProFeature, pro: boolean): boolean {
  return pro || !requiresPro(feature);
}

// ───────────────────────────── preferences ─────────────────────────────────

export function setCurrency(s: BudgetState, currency: string): BudgetState {
  const c = (currency || "USD").toUpperCase();
  return { ...s, prefs: { ...s.prefs, currency: c } };
}

export function setTheme(s: BudgetState, theme: ThemeMode): BudgetState {
  return { ...s, prefs: { ...s.prefs, theme } };
}

export function setWarnOverspend(s: BudgetState, on: boolean): BudgetState {
  return { ...s, prefs: { ...s.prefs, warnOverspend: on } };
}

/** Switch the budget period. Historical data is untouched — only views recompute. */
export function setPeriod(s: BudgetState, period: PeriodSettings): BudgetState {
  return { ...s, prefs: { ...s.prefs, period } };
}

export function setMonthlyPeriod(s: BudgetState): BudgetState {
  return setPeriod(s, { type: "monthly" });
}

export function setCustomPeriod(
  s: BudgetState,
  pattern: PeriodPattern,
  startDate: DateKey,
  n?: number,
): BudgetState {
  return setPeriod(s, { type: "custom", pattern, startDate, n });
}

export function setDefaultAccount(s: BudgetState, accountId: string | null): BudgetState {
  if (accountId) {
    const a = accountById(s, accountId);
    if (!a || a.archived) return s; // must be a real, live account
  }
  return { ...s, prefs: { ...s.prefs, defaultAccountId: accountId } };
}

/** The account a new entry should default to: last used, else default, else first. */
export function preferredAccountId(s: BudgetState): string | null {
  const live = (id: string | null) => (id && accountById(s, id) && !accountById(s, id)!.archived ? id : null);
  return (
    live(s.prefs.lastUsedAccountId) ??
    live(s.prefs.defaultAccountId) ??
    s.accounts.find((a) => !a.archived)?.id ??
    null
  );
}

// ───────────────────────────── security lock ───────────────────────────────

const PIN_SALT = "envmini.pin.v1:";

/** FNV-1a 32-bit digest, hex. Deterministic and dependency-free. */
export function hashPin(pin: string): string {
  const input = PIN_SALT + pin;
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export type PinError = "too_short" | "not_numeric";

export function validatePin(pin: string): PinError | null {
  if (!/^\d+$/.test(pin)) return "not_numeric";
  if (pin.length < 4) return "too_short";
  return null;
}

export function setPin(s: BudgetState, pin: string): { state: BudgetState; error: PinError | null } {
  const err = validatePin(pin);
  if (err) return { state: s, error: err };
  return {
    state: { ...s, prefs: { ...s.prefs, security: { ...s.prefs.security, pinEnabled: true, pinHash: hashPin(pin) } } },
    error: null,
  };
}

export function verifyPin(s: BudgetState, pin: string): boolean {
  const sec = s.prefs.security;
  return sec.pinEnabled && sec.pinHash != null && sec.pinHash === hashPin(pin);
}

export function disableLock(s: BudgetState): BudgetState {
  return {
    ...s,
    prefs: { ...s.prefs, security: { ...s.prefs.security, pinEnabled: false, pinHash: null, biometricEnabled: false } },
  };
}

export function setBiometric(s: BudgetState, on: boolean): BudgetState {
  // Biometric only makes sense alongside a PIN fallback.
  if (on && !s.prefs.security.pinEnabled) return s;
  return { ...s, prefs: { ...s.prefs, security: { ...s.prefs.security, biometricEnabled: on } } };
}

export function setLockTimeout(s: BudgetState, seconds: number): BudgetState {
  const clamped = Math.max(0, Math.min(3600, Math.round(seconds)));
  return { ...s, prefs: { ...s.prefs, security: { ...s.prefs.security, lockTimeoutSec: clamped } } };
}

/** Should the app relock given how long it has been backgrounded? */
export function shouldLock(prefs: UserPrefs, backgroundedSec: number): boolean {
  return prefs.security.pinEnabled && backgroundedSec >= prefs.security.lockTimeoutSec;
}
