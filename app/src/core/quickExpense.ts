import type { BudgetState } from "./model";
import type { ISODateTime } from "./dates";
import { addEnvelope, type EnvelopeError } from "./envelopes";
import { addTransaction, type NewTxn, type TxnError } from "./transactions";

/** Save a real purchase and its new envelope together, or leave all data untouched. */
export function addExpenseInNewEnvelope(
  s: BudgetState,
  input: Omit<NewTxn, "type" | "envelopeId"> & { envelopeName: string },
  now: ISODateTime,
): { state: BudgetState; error: EnvelopeError | TxnError | null; id?: string; envelopeId?: string } {
  const envelope = addEnvelope(s, { name: input.envelopeName });
  if (envelope.error || !envelope.id) return { state: s, error: envelope.error ?? "no_envelope" };
  const saved = addTransaction(envelope.state, { ...input, type: "expense", envelopeId: envelope.id }, now);
  if (saved.error) return { state: s, error: saved.error };
  return { ...saved, envelopeId: envelope.id };
}
