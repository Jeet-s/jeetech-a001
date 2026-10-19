import { useEffect, useRef, useState } from "react";
import { budgetStore, useBudget } from "./core/data";
import {
  canRedo as hCanRedo,
  canUndo as hCanUndo,
  commit,
  initHistory,
  redo as hRedo,
  undo as hUndo,
  type History,
} from "./core/history";
import { dateKey } from "./core/dates";
import type { BudgetState } from "./core/model";
import { postAllDue } from "./core/recurring";

/**
 * The app's runtime state controller. The persisted budgetStore is the single
 * source of truth; this layer adds a session undo/redo stack on top (the PRD's
 * "undo last N actions") and the on-open recurring posting. Every user mutation
 * goes through `mutate`, so every change is undoable and written through.
 */
let hist: History = initHistory(budgetStore.get());
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** Re-base undo history on the current store (after boot / non-undoable writes). */
export function resetHistory(): void {
  hist = initHistory(budgetStore.get());
  notify();
}

/** Apply an undoable user mutation; records the previous state and persists. */
export function mutate(fn: (s: BudgetState) => BudgetState): BudgetState {
  const prev = budgetStore.get();
  const next = fn(prev);
  if (next === prev) return prev;
  hist = commit({ past: hist.past, present: prev, future: hist.future }, next);
  budgetStore.set(next);
  notify();
  return next;
}

export function undo(): void {
  if (!hCanUndo(hist)) return;
  hist = hUndo(hist);
  budgetStore.set(hist.present);
  notify();
}

export function redo(): void {
  if (!hCanRedo(hist)) return;
  hist = hRedo(hist);
  budgetStore.set(hist.present);
  notify();
}

/** Live undo/redo availability for toolbar buttons. */
export function useUndo(): { canUndo: boolean; canRedo: boolean } {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  return { canUndo: hCanUndo(hist), canRedo: hCanRedo(hist) };
}

/**
 * Transient "just saved" signal for an envelope — lets a sheet (which lives
 * outside the envelope list) tell the affected row to pop a success checkmark
 * the instant its transaction is committed, without threading props through.
 */
const flashListeners = new Set<(id: string) => void>();
export function flashEnvelope(id: string | null | undefined): void {
  if (!id) return;
  flashListeners.forEach((l) => l(id));
}
export function useEnvelopeFlash(onFlash: (id: string) => void): void {
  const ref = useRef(onFlash);
  ref.current = onFlash;
  useEffect(() => {
    const l = (id: string) => ref.current(id);
    flashListeners.add(l);
    return () => void flashListeners.delete(l);
  }, []);
}

/** Post any recurring occurrences whose day has arrived (called once on open). */
export function postDueOnOpen(todayKey: string): number {
  const res = postAllDue(budgetStore.get(), todayKey);
  if (res.posted > 0) {
    budgetStore.set(res.state);
    resetHistory();
  }
  return res.posted;
}

/** Today's local calendar day — the explicit clock every core call needs. */
export const today = (): string => dateKey(new Date());

export { useBudget };
