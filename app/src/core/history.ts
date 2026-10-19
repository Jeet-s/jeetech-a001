/**
 * Session undo/redo. The app's data is one immutable value, so undo/redo is
 * just a stack of snapshots: every committed mutation pushes the previous state
 * onto `past` and clears `future`; undo moves a snapshot from past→future and
 * redo the other way. Bounded so a long session can't grow without limit.
 *
 * This is session-only state (never persisted), matching the PRD's "undo last N
 * actions within session".
 */
import type { BudgetState } from "./model";

export const UNDO_LIMIT = 20;

export interface History {
  past: BudgetState[];
  present: BudgetState;
  future: BudgetState[];
}

export function initHistory(present: BudgetState): History {
  return { past: [], present, future: [] };
}

/** Commit a new present, remembering the old one for undo. */
export function commit(h: History, next: BudgetState): History {
  if (next === h.present) return h; // no-op mutation, don't pollute the stack
  const past = [...h.past, h.present];
  if (past.length > UNDO_LIMIT) past.shift();
  return { past, present: next, future: [] };
}

export const canUndo = (h: History) => h.past.length > 0;
export const canRedo = (h: History) => h.future.length > 0;

export function undo(h: History): History {
  if (!h.past.length) return h;
  const past = [...h.past];
  const present = past.pop()!;
  return { past, present, future: [h.present, ...h.future].slice(0, UNDO_LIMIT) };
}

export function redo(h: History): History {
  if (!h.future.length) return h;
  const [present, ...future] = h.future;
  const past = [...h.past, h.present];
  if (past.length > UNDO_LIMIT) past.shift();
  return { past, present, future };
}

export const depth = (h: History) => ({ undo: h.past.length, redo: h.future.length });
