import { useEffect, useMemo, useState } from "react";
import { Keyboard, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Animated, { FadeIn, LinearTransition } from "react-native-reanimated";
import {
  Button,
  Icon,
  IconButton,
  Pill,
  Segmented,
  Sheet,
  TextField,
  feedback,
  palette,
  radius,
  space,
  toast,
  type,
} from "../ui";
import {
  AmountKeypad,
  EnvelopeCardPicker,
  Money,
  OptionChips,
  accountTypeLabel,
  txnError,
} from "./kit";
import { flashEnvelope, mutate, today, undo, useBudget } from "../state";
import { analytics } from "../modules/analytics";
import {
  accountById,
  activeAccounts,
  activeEnvelopes,
  envelopeById,
  liveTxns,
  type BudgetState,
} from "../core/model";
import {
  addSplit,
  addTransaction,
  addTransfer,
  deleteSplitGroup,
  deleteTransaction,
  duplicateTransaction,
  editTransaction,
  splitByPercent,
  validateSplit,
} from "../core/transactions";
import { preferredAccountId } from "../core/prefs";
import { envelopeSummary } from "../core/budget";
import { calcToMinor, fromMinor, formatMoney, type Minor } from "../core/money";
import { WEEKDAY, MONTHS, addDays, dayOf, periodFor } from "../core/dates";

// ───────────────────────────── shared helpers ──────────────────────────────

const iso = (day: string) => `${day}T12:00:00.000`;
const majorStr = (minor: Minor, currency: string) => String(fromMinor(minor, currency));

function dateLabel(day: string, todayKey: string): string {
  if (day === todayKey) return "Today";
  if (day === addDays(todayKey, -1)) return "Yesterday";
  const [, m, d] = day.split("-").map(Number);
  return `${WEEKDAY[new Date(day + "T12:00").getDay()]} ${MONTHS[m - 1]} ${d}`;
}

function acctOptions(s: BudgetState) {
  return activeAccounts(s).map((a) => ({ value: a.id, label: a.name }));
}
function envOptions(s: BudgetState) {
  return activeEnvelopes(s).map((e) => ({ value: e.id, label: e.name, color: e.color, icon: e.icon }));
}

/** Date picker row: ±1 day steppers with a reset to Today. */
function DatePicker({ day, onDay, todayKey }: { day: string; onDay: (d: string) => void; todayKey: string }) {
  return (
    <View style={styles.dateRow}>
      <Text style={[type.label, { flex: 1 }]}>Date</Text>
      <IconButton icon="chevronLeft" label="Previous day" size={40} onPress={() => onDay(addDays(day, -1))} />
      <Text style={[type.bodyStrong, { minWidth: 104, textAlign: "center" }]}>{dateLabel(day, todayKey)}</Text>
      <IconButton
        icon="chevronRight"
        label="Next day"
        size={40}
        onPress={() => onDay(day >= todayKey ? day : addDays(day, 1))}
      />
    </View>
  );
}

// ─────────────────────────── add / edit transaction ────────────────────────

export type TxnDraft =
  | { mode: "add"; type: "expense" | "income"; envelopeId?: string | null; accountId?: string; amount?: number }
  | { mode: "edit"; id: string };

export function TransactionSheet({
  draft,
  onClose,
  onSplit,
}: {
  draft: TxnDraft | null;
  onClose: () => void;
  onSplit: (ctx: { accountId: string; total: Minor; note: string }) => void;
}) {
  const s = useBudget();
  const { height } = useWindowDimensions();
  const todayKey = today();

  const [kind, setKind] = useState<"expense" | "income">("expense");
  const [expr, setExpr] = useState("");
  const [envelopeId, setEnvelopeId] = useState<string>("");
  const [accountId, setAccountId] = useState<string>("");
  const [day, setDay] = useState(todayKey);
  const [note, setNote] = useState("");
  const [labels, setLabels] = useState<string[]>([]);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The sheet is pre-inflated at the app root (SheetsProvider), so opening it is
  // just a visibility flip. We hold back the live-balance preview — the one part
  // that scans transactions — until just after the open spring settles, so the
  // animation stays buttery even on very large datasets. Keypad + Save are live
  // immediately, so a quick "type → Save" never waits.
  const [ready, setReady] = useState(false);

  const editing = draft?.mode === "edit" ? s.transactions.find((t) => t.id === draft.id) ?? null : null;
  const key = draft ? (draft.mode === "edit" ? `e:${draft.id}` : `a:${draft.type}:${draft.envelopeId ?? ""}`) : "";

  // Seed the form whenever a new draft opens.
  useEffect(() => {
    if (!draft) return;
    setError(null);
    setMore(false);
    if (draft.mode === "edit" && editing) {
      setKind(editing.type === "income" ? "income" : "expense");
      setExpr(majorStr(editing.amount, editing.currency));
      setEnvelopeId(editing.envelopeId ?? "");
      setAccountId(editing.accountId);
      setDay(dayOf(editing.date));
      setNote(editing.note);
      setLabels(editing.labels);
    } else if (draft.mode === "add") {
      setKind(draft.type);
      setExpr(draft.amount != null ? String(draft.amount) : "");
      // Smart default: for a quick expense from the hero, pre-select an envelope
      // so the common flow is just "type amount → Save" (≤ 2 taps).
      setEnvelopeId(draft.envelopeId ?? (draft.type === "expense" ? activeEnvelopes(s)[0]?.id ?? "" : ""));
      setAccountId(draft.accountId ?? preferredAccountId(s) ?? "");
      setDay(todayKey);
      setNote("");
      setLabels([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Flip `ready` on once the open animation has settled (reset while closed).
  useEffect(() => {
    if (!draft) { setReady(false); return; }
    const t = setTimeout(() => setReady(true), 220);
    return () => clearTimeout(t);
  }, [draft]);

  const isTransfer = draft?.mode === "edit" && editing?.type === "transfer";
  const account = accountById(s, accountId);
  const currency = account?.currency ?? s.prefs.currency;
  const envs = useMemo(() => envOptions(s), [s]);
  const accts = useMemo(() => acctOptions(s), [s]);
  const amount = calcToMinor(expr, currency);
  const canSplit = draft?.mode === "add" && kind === "expense" && activeEnvelopes(s).length >= 2 && !!accountId;
  const valid = amount != null && amount > 0;

  // Live "left after this" preview — deferred until the sheet has settled and
  // memoised so the envelope scan only reruns when an input it depends on moves.
  const preview = useMemo(() => {
    if (!ready || isTransfer || !valid || amount == null) return null;
    if (kind === "expense" && !envelopeId) return null;
    const env = envelopeById(s, envelopeId);
    const color = kind === "income" ? palette.success : env?.color ?? palette.primary;
    let before: number | null = null;
    let after: number | null = null;
    if (env) {
      const sum = envelopeSummary(s, env.id, periodFor(todayKey, s.prefs.period), s.prefs.period, todayKey);
      before = sum.available;
      after = kind === "income" ? before + amount : before - amount;
    }
    return { env, color, before, after, over: after != null && after < 0 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, isTransfer, valid, amount, envelopeId, kind, s, todayKey]);

  const save = () => {
    if (amount == null || amount <= 0) {
      feedback("error", "error");
      return setError(txnError.bad_amount);
    }
    const now = iso(day);
    if (isTransfer && editing) {
      // A transfer keeps its type and both accounts — only amount/date/note change.
      const res = editTransaction(s, editing.id, { amount, note, date: now }, iso(todayKey));
      if (res.error) { feedback("error", "error"); return setError(txnError[res.error]); }
      mutate(() => res.state);
      feedback("success", "success");
      toast("Transfer updated");
      return onClose();
    }
    const envId = envelopeId || null;
    if (kind === "expense" && !envId) {
      feedback("error", "error");
      return setError(txnError.no_envelope);
    }
    if (draft?.mode === "edit" && editing) {
      const res = editTransaction(s, editing.id, { amount, type: kind, envelopeId: envId, accountId, note, labels, date: now }, iso(todayKey));
      if (res.error) {
        feedback("error", "error");
        return setError(txnError[res.error]);
      }
      mutate(() => res.state);
      feedback("success", "success");
      flashEnvelope(envId);
      toast("Changes saved", { label: "Undo", onPress: undo });
      return onClose();
    }
    const res = addTransaction(s, { type: kind, amount, accountId, envelopeId: envId, note, labels, date: now }, now);
    if (res.error) {
      feedback("error", "error");
      return setError(txnError[res.error]);
    }
    mutate(() => res.state);
    feedback("success", "success");
    flashEnvelope(envId);
    analytics.track("core_action", { feature: kind === "expense" ? "add_expense" : "add_income" });
    analytics.track(kind === "expense" ? "expense_add" : "income_add");
    toast(kind === "expense" ? "Expense added" : "Deposit added", { label: "Undo", onPress: undo });
    onClose();
  };

  const remove = () => {
    if (!editing) return;
    const gid = editing.splitGroupId;
    mutate((st) => (gid ? deleteSplitGroup(st, gid) : deleteTransaction(st, editing.id)));
    feedback("pop", "warning");
    onClose();
    toast(gid ? "Split deleted" : "Deleted", { label: "Undo", onPress: undo });
  };

  const duplicate = () => {
    if (!editing) return;
    const res = duplicateTransaction(s, editing.id, iso(todayKey));
    if (res.error) return;
    mutate(() => res.state);
    feedback("success", "success");
    analytics.track("duplicate_use");
    onClose();
    toast("Duplicated to today", { label: "Undo", onPress: undo });
  };

  const addNewLabel = () => {
    // Quick inline label from the note field text, kept simple & offline.
    const name = note.trim().slice(0, 24);
    if (!name) return;
    mutate((st) => {
      const existing = st.labels.find((l) => l.name.toLowerCase() === name.toLowerCase());
      if (existing) {
        setLabels((ls) => [...new Set([...ls, existing.id])]);
        return st;
      }
      const id = `l${st.seq}`;
      setLabels((ls) => [...new Set([...ls, id])]);
      return { ...st, labels: [...st.labels, { id, name, color: "#64748B" }], seq: st.seq + 1 };
    });
    feedback("pop", "select");
  };

  const typeTitle = isTransfer ? "Edit transfer" : draft?.mode === "edit" ? "Edit transaction" : kind === "expense" ? "Add expense" : "Add deposit";
  const transferAccounts = isTransfer && editing ? `${accountById(s, editing.accountId)?.name ?? ""} → ${accountById(s, editing.accountIdTo)?.name ?? ""}` : "";

  return (
    <Sheet visible={!!draft} title={typeTitle} onClose={onClose}>
      <ScrollView style={{ maxHeight: height * 0.66 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: space.md }}>
        {isTransfer ? (
          <>
            <View style={styles.hintRow}>
              <Icon name="swap" size={18} color={palette.inkSoft} />
              <Text style={[type.bodyStrong, { flex: 1 }]}>{transferAccounts}</Text>
            </View>
            <AmountKeypad expr={expr} onExpr={(e) => { setExpr(e); setError(null); }} currency={currency} />
          </>
        ) : (
          <>
            <Segmented
              options={[{ value: "expense", label: "Expense" }, { value: "income", label: "Deposit" }]}
              value={kind}
              onChange={(v) => { setKind(v); setError(null); }}
            />
            <AmountKeypad expr={expr} onExpr={(e) => { setExpr(e); setError(null); }} currency={currency} tone={kind === "income" ? palette.success : palette.ink} />

            <Text style={type.label}>{kind === "expense" ? "Envelope" : "Envelope (optional)"}</Text>
            {kind === "income" ? (
              <EnvelopeCardPicker options={[{ value: "", label: "No envelope" }, ...envs]} value={envelopeId} onChange={(v) => { setEnvelopeId(v); setError(null); }} />
            ) : (
              <EnvelopeCardPicker options={envs} value={envelopeId} onChange={(v) => { setEnvelopeId(v); setError(null); }} />
            )}

            {accts.length > 1 ? (
              <>
                <Text style={type.label}>Account</Text>
                <OptionChips options={accts} value={accountId} onChange={setAccountId} />
              </>
            ) : null}
          </>
        )}

        {more ? (
          <Animated.View entering={FadeIn.duration(160)} layout={LinearTransition.duration(200)} style={{ gap: space.md }}>
            <DatePicker day={day} onDay={setDay} todayKey={todayKey} />
            <TextField label="Note" placeholder="e.g. Weekly groceries" value={note} onChangeText={setNote} maxLength={140} returnKeyType="done" onSubmitEditing={() => Keyboard.dismiss()} />
            {s.labels.length ? (
              <>
                <Text style={type.label}>Labels</Text>
                <OptionChips
                  options={s.labels.map((l) => ({ value: l.id, label: l.name }))}
                  value={null}
                  onChange={(id) => setLabels((ls) => (ls.includes(id) ? ls.filter((x) => x !== id) : [...ls, id]))}
                />
                <View style={styles.labelTags}>
                  {labels.map((id) => {
                    const l = s.labels.find((x) => x.id === id);
                    return l ? <Text key={id} style={styles.labelTag}>{l.name}</Text> : null;
                  })}
                </View>
              </>
            ) : note.trim() ? (
              <Button label={`Add "${note.trim().slice(0, 16)}" as a label`} variant="ghost" size="sm" icon="tag" sound="pop" onPress={addNewLabel} />
            ) : null}
          </Animated.View>
        ) : (
          <Button label="Add date, note & labels" variant="ghost" size="sm" icon="edit" sound={null} onPress={() => setMore(true)} />
        )}

        {error ? <Text style={[type.caption, { color: palette.danger }]}>{error}</Text> : null}
      </ScrollView>

      <View style={{ gap: space.sm }}>
        {preview ? (
          <Animated.View entering={FadeIn.duration(160)} style={styles.previewCard}>
            <View style={styles.previewRow}>
              <View style={[styles.previewDot, { backgroundColor: preview.color }]} />
              <Text style={[type.label, { flex: 1 }]} numberOfLines={1}>
                {kind === "income" ? (preview.env ? `Deposit to ${preview.env.name}` : "Deposit") : preview.env?.name ?? "Expense"}
              </Text>
              <Money minor={amount ?? 0} currency={currency} style={[type.amount, { color: kind === "income" ? palette.success : palette.ink }]} sign={kind === "income"} />
            </View>
            {preview.env && preview.before != null && preview.after != null ? (
              <View style={styles.previewRow}>
                <Text style={[type.caption, { flex: 1 }]} numberOfLines={1}>
                  Left {kind === "income" ? "after deposit" : "after this"}
                </Text>
                <Text style={styles.previewArrow}>
                  {formatMoney(preview.before, currency)}
                  <Text style={{ color: palette.inkMuted }}>{"  →  "}</Text>
                  <Text style={{ color: preview.over ? palette.danger : palette.ink }}>{formatMoney(preview.after, currency)}</Text>
                </Text>
                {preview.over ? <Pill label="Over" tone="danger" /> : null}
              </View>
            ) : null}
          </Animated.View>
        ) : !valid && !error ? (
          // Inline, friendly reason the Save button is waiting — no silent dead CTA.
          <Text style={[type.caption, styles.amountHint]}>Enter an amount above zero to save.</Text>
        ) : null}
        <Button label={draft?.mode === "edit" ? "Save changes" : "Save"} size="lg" icon="check" disabled={!valid} onPress={save} />
        {canSplit ? (
          <Button
            label="Split across envelopes"
            variant="secondary"
            icon="split"
            onPress={() => {
              if (amount == null || amount <= 0) return setError(txnError.bad_amount);
              analytics.track("split_open");
              onSplit({ accountId, total: amount, note });
            }}
          />
        ) : null}
        {draft?.mode === "edit" ? (
          <View style={styles.editActions}>
            <Button label="Duplicate" variant="ghost" icon="copy" style={{ flex: 1 }} onPress={duplicate} />
            <Button label="Delete" variant="danger" icon="trash" style={{ flex: 1 }} onPress={remove} />
          </View>
        ) : null}
      </View>
    </Sheet>
  );
}

// ─────────────────────────────────── split ─────────────────────────────────

export function SplitSheet({
  spec,
  onClose,
}: {
  spec: { accountId: string; total: Minor; note: string } | null;
  onClose: () => void;
}) {
  const s = useBudget();
  const { height } = useWindowDimensions();
  const todayKey = today();
  const account = accountById(s, spec?.accountId ?? null);
  const currency = account?.currency ?? s.prefs.currency;
  const envs = activeEnvelopes(s);

  const [parts, setParts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (spec) {
      setParts({});
      setError(null);
    }
  }, [spec]);

  const selected = Object.keys(parts);
  const allocated = selected.reduce((sum, id) => {
    const v = calcToMinor(parts[id] || "", currency);
    return sum + (v && v > 0 ? v : 0);
  }, 0);
  const total = spec?.total ?? 0;
  const remaining = total - allocated;

  const toggle = (id: string) => {
    feedback("pop", "select");
    setParts((p) => {
      if (id in p) {
        const { [id]: _drop, ...rest } = p;
        return rest;
      }
      return { ...p, [id]: "" };
    });
    setError(null);
  };

  const even = () => {
    if (!selected.length) return;
    const amounts = splitByPercent(total, selected.map(() => 100 / selected.length));
    const next: Record<string, string> = {};
    selected.forEach((id, i) => (next[id] = String(fromMinor(amounts[i], currency))));
    setParts(next);
    feedback("pop", "light");
  };

  const save = () => {
    if (!spec) return;
    const built = selected.map((id) => ({ envelopeId: id, amount: calcToMinor(parts[id] || "", currency) ?? 0 }));
    const err = validateSplit(total, built);
    if (err) {
      feedback("error", "error");
      analytics.track("split_validation_error");
      return setError(txnError[err]);
    }
    const res = addSplit(s, { type: "expense", total, accountId: spec.accountId, parts: built, note: spec.note, date: iso(todayKey) }, iso(todayKey));
    if (res.error) {
      feedback("error", "error");
      return setError(txnError[res.error]);
    }
    mutate(() => res.state);
    feedback("success", "success");
    analytics.track("split_save");
    analytics.track("core_action", { feature: "split_expense" });
    onClose();
    toast("Split saved", { label: "Undo", onPress: undo });
  };

  return (
    <Sheet visible={!!spec} title="Split expense" onClose={onClose}>
      <View style={styles.splitHead}>
        <Text style={type.label}>Total</Text>
        <Money minor={total} currency={currency} style={[type.title]} />
      </View>
      <View style={styles.splitHead}>
        <Text style={type.label}>{remaining === 0 ? "Fully allocated" : remaining > 0 ? "Left to allocate" : "Over by"}</Text>
        <Money minor={Math.abs(remaining)} currency={currency} style={[type.bodyStrong, { color: remaining === 0 ? palette.success : palette.danger }]} />
      </View>
      <ScrollView style={{ maxHeight: height * 0.44 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: space.sm }}>
        {envs.map((e) => {
          const on = e.id in parts;
          return (
            <View key={e.id} style={[styles.splitRow, on && { borderColor: e.color }]}>
              <Button label={e.name} variant={on ? "secondary" : "ghost"} size="sm" sound="pop" style={{ flex: 1 }} onPress={() => toggle(e.id)} />
              {on ? (
                <TextField
                  label=""
                  placeholder="0"
                  keyboardType="decimal-pad"
                  value={parts[e.id]}
                  onChangeText={(t) => { setParts((p) => ({ ...p, [e.id]: t })); setError(null); }}
                  style={{ width: 110, textAlign: "right" }}
                />
              ) : null}
            </View>
          );
        })}
      </ScrollView>
      {error ? <Text style={[type.caption, { color: palette.danger }]}>{error}</Text> : null}
      <View style={{ gap: space.sm }}>
        {selected.length >= 2 ? <Button label="Split evenly" variant="ghost" size="sm" icon="split" onPress={even} /> : null}
        <Button label="Save split" size="lg" icon="check" disabled={selected.length < 2 || remaining !== 0} onPress={save} />
      </View>
    </Sheet>
  );
}

// ────────────────────────────────── transfer ───────────────────────────────

export function TransferSheet({ visible, onClose, fromId }: { visible: boolean; onClose: () => void; fromId?: string }) {
  const s = useBudget();
  const { height } = useWindowDimensions();
  const todayKey = today();
  const accts = activeAccounts(s);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [expr, setExpr] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      const f = fromId ?? preferredAccountId(s) ?? accts[0]?.id ?? "";
      setFrom(f);
      setTo(accts.find((a) => a.id !== f)?.id ?? "");
      setExpr("");
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const currency = accountById(s, from)?.currency ?? s.prefs.currency;
  const amount = calcToMinor(expr, currency);

  const save = () => {
    if (amount == null || amount <= 0) { feedback("error", "error"); return setError(txnError.bad_amount); }
    const res = addTransfer(s, { amount, accountId: from, accountIdTo: to }, iso(todayKey));
    if (res.error) { feedback("error", "error"); return setError(txnError[res.error]); }
    mutate(() => res.state);
    feedback("success", "success");
    analytics.track("transfer_create");
    onClose();
    toast("Transfer saved", { label: "Undo", onPress: undo });
  };

  return (
    <Sheet visible={visible} title="Transfer" onClose={onClose}>
      <ScrollView style={{ maxHeight: height * 0.62 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: space.md }}>
        <AmountKeypad expr={expr} onExpr={(e) => { setExpr(e); setError(null); }} currency={currency} />
        <Text style={type.label}>From</Text>
        <OptionChips options={accts.map((a) => ({ value: a.id, label: `${a.name} · ${accountTypeLabel[a.type]}` }))} value={from} onChange={(v) => { setFrom(v); if (v === to) setTo(accts.find((a) => a.id !== v)?.id ?? ""); setError(null); }} />
        <Text style={type.label}>To</Text>
        <OptionChips options={accts.filter((a) => a.id !== from).map((a) => ({ value: a.id, label: `${a.name} · ${accountTypeLabel[a.type]}` }))} value={to} onChange={(v) => { setTo(v); setError(null); }} />
        <View style={styles.hintRow}>
          <Icon name="info" size={16} color={palette.inkMuted} />
          <Text style={[type.caption, { flex: 1 }]}>Transfers move money between accounts — never counted as income or expense.</Text>
        </View>
        {error ? <Text style={[type.caption, { color: palette.danger }]}>{error}</Text> : null}
      </ScrollView>
      <Button label="Save transfer" size="lg" icon="swap" disabled={amount == null || amount <= 0 || !to || from === to} onPress={save} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  dateRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  editActions: { flexDirection: "row", gap: space.sm },
  labelTags: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  labelTag: { ...type.caption, color: palette.inkSoft, backgroundColor: palette.surfaceAlt, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, overflow: "hidden" },
  splitHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  previewCard: { backgroundColor: palette.surfaceAlt, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.xs, gap: 2 },
  previewRow: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 40 },
  previewDot: { width: 10, height: 10, borderRadius: 5 },
  previewArrow: { ...type.amount, color: palette.ink },
  amountHint: { textAlign: "center", color: palette.inkMuted, paddingVertical: space.xs },
  splitRow: { flexDirection: "row", alignItems: "center", gap: space.sm, borderWidth: 1, borderColor: palette.border, borderRadius: radius.md, padding: space.sm },
  hintRow: { flexDirection: "row", gap: space.sm, alignItems: "flex-start", backgroundColor: palette.surfaceAlt, borderRadius: radius.md, padding: space.md },
});
