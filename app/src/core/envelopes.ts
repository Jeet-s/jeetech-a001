/**
 * Envelope (category) rules: create / edit / delete, hide without deleting,
 * drag-reorder, sub-envelopes, and accessible colour validation. Every edit
 * returns a new state; references in budgets and transactions are kept valid
 * (delete archives rather than orphaning unless there is no history).
 */
import {
  MAX_NAME,
  nextId,
  type BudgetState,
  type Envelope,
  activeEnvelopes,
} from "./model";

export type EnvelopeError = "empty_name" | "too_long" | "duplicate" | "bad_color" | "not_found" | "cycle";

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** Relative luminance (WCAG) of a hex colour, 0..1. */
export function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  const toLin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * toLin((n >> 16) & 255) + 0.7152 * toLin((n >> 8) & 255) + 0.0722 * toLin(n & 255);
}

/** WCAG contrast ratio between two hex colours (1..21). */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Pick black or white text for a background so text stays AA-legible. */
export function readableTextOn(bg: string): "#0F172A" | "#FFFFFF" {
  return contrastRatio(bg, "#FFFFFF") >= contrastRatio(bg, "#0F172A") ? "#FFFFFF" : "#0F172A";
}

export function validateColor(hex: string): boolean {
  return HEX.test(hex);
}

export function validateEnvelopeName(
  s: BudgetState,
  raw: string,
  exceptId?: string,
): EnvelopeError | null {
  const name = raw.trim();
  if (!name) return "empty_name";
  if (name.length > MAX_NAME) return "too_long";
  if (
    s.envelopes.some(
      (e) => !e.archived && e.id !== exceptId && e.name.toLowerCase() === name.toLowerCase(),
    )
  )
    return "duplicate";
  return null;
}

export function addEnvelope(
  s: BudgetState,
  input: { name: string; icon?: string; color?: string; parentId?: string | null; rolloverEnabled?: boolean },
): { state: BudgetState; error: EnvelopeError | null; id?: string } {
  const nameError = validateEnvelopeName(s, input.name);
  if (nameError) return { state: s, error: nameError };
  const color = input.color ?? "#10B981";
  if (!validateColor(color)) return { state: s, error: "bad_color" };
  if (input.parentId && !s.envelopes.some((e) => e.id === input.parentId)) {
    return { state: s, error: "not_found" };
  }
  const { id, seq } = nextId(s, "e");
  const order = s.envelopes.reduce((m, e) => Math.max(m, e.order), -1) + 1;
  const env: Envelope = {
    id,
    name: input.name.trim(),
    icon: input.icon ?? "cart",
    color,
    order,
    archived: false,
    parentId: input.parentId ?? null,
    rolloverEnabled: input.rolloverEnabled ?? false,
  };
  return { state: { ...s, envelopes: [...s.envelopes, env], seq }, error: null, id };
}

export function editEnvelope(
  s: BudgetState,
  id: string,
  patch: Partial<Pick<Envelope, "name" | "icon" | "color" | "parentId" | "rolloverEnabled">>,
): { state: BudgetState; error: EnvelopeError | null } {
  const env = s.envelopes.find((e) => e.id === id);
  if (!env) return { state: s, error: "not_found" };
  if (patch.name !== undefined) {
    const e = validateEnvelopeName(s, patch.name, id);
    if (e) return { state: s, error: e };
  }
  if (patch.color !== undefined && !validateColor(patch.color)) return { state: s, error: "bad_color" };
  if (patch.parentId !== undefined && patch.parentId) {
    if (patch.parentId === id) return { state: s, error: "cycle" };
    if (!s.envelopes.some((e) => e.id === patch.parentId)) return { state: s, error: "not_found" };
    // no deeper than one level: a parent cannot itself have a parent
    const parent = s.envelopes.find((e) => e.id === patch.parentId);
    if (parent && parent.parentId) return { state: s, error: "cycle" };
    // cannot parent onto one of your own children
    if (s.envelopes.some((e) => e.parentId === id && e.id === patch.parentId)) return { state: s, error: "cycle" };
  }
  return {
    state: {
      ...s,
      envelopes: s.envelopes.map((e) =>
        e.id === id
          ? {
              ...e,
              ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
              ...(patch.icon !== undefined ? { icon: patch.icon } : {}),
              ...(patch.color !== undefined ? { color: patch.color } : {}),
              ...(patch.parentId !== undefined ? { parentId: patch.parentId } : {}),
              ...(patch.rolloverEnabled !== undefined ? { rolloverEnabled: patch.rolloverEnabled } : {}),
            }
          : e,
      ),
    },
    error: null,
  };
}

/** Rollover is applied prospectively; past budgets are never rewritten here. */
export function setRollover(s: BudgetState, id: string, enabled: boolean): BudgetState {
  return editEnvelope(s, id, { rolloverEnabled: enabled }).state;
}

export function hideEnvelope(s: BudgetState, id: string, archived = true): BudgetState {
  return { ...s, envelopes: s.envelopes.map((e) => (e.id === id ? { ...e, archived } : e)) };
}

/** True when an envelope has no live transactions and can be hard-deleted. */
export function canDeleteEnvelope(s: BudgetState, id: string): boolean {
  return !s.transactions.some((t) => !t.deleted && t.envelopeId === id);
}

/**
 * Delete an envelope. With history it is archived (so reports stay correct);
 * with none it is removed outright along with its budgets. Child envelopes are
 * re-parented to the grandparent (null) rather than orphaned.
 */
export function deleteEnvelope(s: BudgetState, id: string): BudgetState {
  if (!s.envelopes.some((e) => e.id === id)) return s;
  const reparented = s.envelopes.map((e) => (e.parentId === id ? { ...e, parentId: null } : e));
  if (!canDeleteEnvelope(s, id)) {
    return { ...s, envelopes: reparented.map((e) => (e.id === id ? { ...e, archived: true } : e)) };
  }
  return {
    ...s,
    envelopes: reparented.filter((e) => e.id !== id),
    budgets: s.budgets.filter((b) => b.envelopeId !== id),
  };
}

/** Move an envelope to a new slot among the visible envelopes (drag-reorder). */
export function reorderEnvelopes(s: BudgetState, id: string, toIndex: number): BudgetState {
  const visible = activeEnvelopes(s);
  const from = visible.findIndex((e) => e.id === id);
  if (from < 0) return s;
  const clamped = Math.max(0, Math.min(toIndex, visible.length - 1));
  if (from === clamped) return s;
  const ids = visible.map((e) => e.id);
  ids.splice(clamped, 0, ids.splice(from, 1)[0]);
  const orderMap = new Map(ids.map((eid, i) => [eid, i]));
  return {
    ...s,
    envelopes: s.envelopes.map((e) => (orderMap.has(e.id) ? { ...e, order: orderMap.get(e.id)! } : e)),
  };
}

/** Case-insensitive name search over visible envelopes. */
export function searchEnvelopes(s: BudgetState, query: string): Envelope[] {
  const q = query.trim().toLowerCase();
  const vis = activeEnvelopes(s);
  return q ? vis.filter((e) => e.name.toLowerCase().includes(q)) : vis;
}

export const childEnvelopes = (s: BudgetState, parentId: string) =>
  s.envelopes.filter((e) => e.parentId === parentId && !e.archived).sort((a, b) => a.order - b.order);
