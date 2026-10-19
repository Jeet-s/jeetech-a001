import { useEffect, useState } from "react";
import { Keyboard, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import {
  Button,
  Icon,
  IconButton,
  Segmented,
  Sheet,
  TextField,
  Toggle,
  feedback,
  palette,
  radius,
  space,
  toast,
  type,
} from "../ui";
import { AmountKeypad, OptionChips, WEEKDAY_OPTS, recurringError, scheduleKindLabel } from "./kit";
import { mutate, today, useBudget } from "../state";
import { accountById, activeAccounts, activeEnvelopes, type EditScope, type ScheduleKind } from "../core/model";
import { addRecurring, editRecurring, nextOccurrence } from "../core/recurring";
import { preferredAccountId } from "../core/prefs";
import { calcToMinor, fromMinor } from "../core/money";
import { WEEKDAY, MONTHS, addDays, addMonths } from "../core/dates";
import { analytics } from "../modules/analytics";

const iso = (day: string) => `${day}T12:00:00.000`;
const fmtDay = (day: string) => {
  const [, m, d] = day.split("-").map(Number);
  return `${WEEKDAY[new Date(day + "T12:00").getDay()]} ${MONTHS[m - 1]} ${d}`;
};

const KINDS: ScheduleKind[] = ["weekly", "biweekly", "semiMonthly", "monthly", "nDays", "firstWeekday", "lastWeekday", "nthWeekday"];

function DayStepper({ label, day, onDay, min }: { label: string; day: string; onDay: (d: string) => void; min?: string }) {
  return (
    <View style={styles.dateRow}>
      <Text style={[type.label, { flex: 1 }]}>{label}</Text>
      <IconButton icon="chevronLeft" label="Earlier week" size={38} onPress={() => { const n = addDays(day, -7); if (!min || n >= min) onDay(n); }} />
      <Text style={[type.bodyStrong, { minWidth: 110, textAlign: "center" }]}>{fmtDay(day)}</Text>
      <IconButton icon="chevronRight" label="Later week" size={38} onPress={() => onDay(addDays(day, 7))} />
    </View>
  );
}

export type RecurringDraft = { mode: "add" } | { mode: "edit"; id: string } | null;

export function RecurringEditorSheet({ draft, onClose }: { draft: RecurringDraft; onClose: () => void }) {
  const s = useBudget();
  const { height } = useWindowDimensions();
  const todayKey = today();
  const rule = draft?.mode === "edit" ? s.recurring.find((r) => r.id === draft.id) ?? null : null;

  const [name, setName] = useState("");
  const [kind, setKind] = useState<"expense" | "income">("expense");
  const [expr, setExpr] = useState("");
  const [envelopeId, setEnvelopeId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [cadence, setCadence] = useState<ScheduleKind>("monthly");
  const [weekday, setWeekday] = useState(1);
  const [dom, setDom] = useState("1");
  const [nth, setNth] = useState(1);
  const [ndays, setNdays] = useState("10");
  const [start, setStart] = useState(todayKey);
  const [hasEnd, setHasEnd] = useState(false);
  const [end, setEnd] = useState(addMonths(todayKey, 6));
  const [shift, setShift] = useState(false);
  const [pickScope, setPickScope] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const key = draft ? (draft.mode === "edit" ? `e:${draft.id}` : "add") : "";
  useEffect(() => {
    if (!draft) return;
    setError(null);
    setPickScope(false);
    if (draft.mode === "edit" && rule) {
      setName(rule.name);
      setKind(rule.template.type);
      setExpr(String(fromMinor(rule.template.amount, accountById(s, rule.template.accountId)?.currency ?? s.prefs.currency)));
      setEnvelopeId(rule.template.envelopeId ?? "");
      setAccountId(rule.template.accountId);
      setCadence(rule.schedule.kind);
      setWeekday(rule.schedule.params.weekday ?? 1);
      setDom(String(rule.schedule.params.day ?? 1));
      setNth(rule.schedule.params.nth ?? 1);
      setNdays(String(rule.schedule.params.n ?? 10));
      setStart(rule.schedule.startDate);
      setHasEnd(!!rule.schedule.endDate);
      setEnd(rule.schedule.endDate ?? addMonths(rule.schedule.startDate, 6));
      setShift(rule.schedule.shift !== "none");
    } else {
      setName("");
      setKind("expense");
      setExpr("");
      setEnvelopeId("");
      setAccountId(preferredAccountId(s) ?? "");
      setCadence("monthly");
      setWeekday(new Date(todayKey + "T12:00").getDay());
      setDom(String(Number(todayKey.slice(8, 10))));
      setNth(1);
      setNdays("10");
      setStart(todayKey);
      setHasEnd(false);
      setEnd(addMonths(todayKey, 6));
      setShift(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const currency = accountById(s, accountId)?.currency ?? s.prefs.currency;
  const amount = calcToMinor(expr, currency);
  const envs = activeEnvelopes(s);
  const accts = activeAccounts(s);

  const buildParams = () => {
    switch (cadence) {
      case "weekly":
      case "biweekly":
        return { weekday };
      case "monthly":
        return { day: Math.min(31, Math.max(1, Number(dom) || 1)) };
      case "semiMonthly":
        return { days: [1, 15] };
      case "nDays":
        return { n: Math.max(1, Number(ndays) || 1) };
      case "firstWeekday":
      case "lastWeekday":
        return { weekday };
      case "nthWeekday":
        return { weekday, nth };
    }
  };

  /** Create (scope null) or apply an edit with the chosen scope. */
  const doCommit = (scope: EditScope | null) => {
    if (amount == null || amount <= 0) { feedback("error", "error"); return setError(recurringError.bad_amount); }
    const schedule = {
      kind: cadence,
      startDate: start,
      endDate: hasEnd ? end : null,
      params: buildParams(),
      shift: (shift ? "nextWeekday" : "none") as "nextWeekday" | "none",
    };
    const template = { type: kind, amount, envelopeId: envelopeId || null, accountId, note: name };

    if (scope && rule) {
      const effective = nextOccurrence(rule.schedule, todayKey) ?? todayKey;
      const res = editRecurring(s, rule.id, { name, template, schedule }, scope, effective, iso(todayKey));
      if (res.error) { feedback("error", "error"); return setError(recurringError[res.error]); }
      mutate(() => res.state);
      feedback("success", "success");
      analytics.track("recurring_edit_scope", { scope });
      toast(scope === "this" ? "Next occurrence skipped" : "Schedule updated");
      return onClose();
    }
    const res = addRecurring(s, { name, template, schedule }, iso(todayKey));
    if (res.error) { feedback("error", "error"); return setError(recurringError[res.error]); }
    mutate(() => res.state);
    feedback("success", "success");
    analytics.track("recurring_create");
    toast("Scheduled");
    onClose();
  };

  const onSave = () => {
    if (amount == null || amount <= 0) { feedback("error", "error"); return setError(recurringError.bad_amount); }
    if (draft?.mode === "edit") return setPickScope(true);
    doCommit(null);
  };

  const needsWeekday = ["weekly", "biweekly", "firstWeekday", "lastWeekday", "nthWeekday"].includes(cadence);

  return (
    <>
      <Sheet visible={!!draft} title={draft?.mode === "edit" ? "Edit scheduled item" : "New recurring"} onClose={onClose}>
        <ScrollView style={{ maxHeight: height * 0.66 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: space.md }}>
          <TextField label="Name" placeholder="e.g. Rent, Salary" value={name} onChangeText={(t) => { setName(t); setError(null); }} maxLength={40} />
          <Segmented options={[{ value: "expense", label: "Expense" }, { value: "income", label: "Income" }]} value={kind} onChange={setKind} />
          <AmountKeypad expr={expr} onExpr={(e) => { setExpr(e); setError(null); }} currency={currency} tone={kind === "income" ? palette.success : palette.ink} />

          {kind === "expense" ? (
            <>
              <Text style={type.label}>Envelope</Text>
              <OptionChips options={envs.map((e) => ({ value: e.id, label: e.name, color: e.color }))} value={envelopeId} onChange={setEnvelopeId} />
            </>
          ) : null}
          {accts.length > 1 ? (
            <>
              <Text style={type.label}>Account</Text>
              <OptionChips options={accts.map((a) => ({ value: a.id, label: a.name }))} value={accountId} onChange={setAccountId} />
            </>
          ) : null}

          <Text style={type.label}>Repeats</Text>
          <OptionChips options={KINDS.map((k) => ({ value: k, label: scheduleKindLabel[k] }))} value={cadence} onChange={setCadence} />

          {needsWeekday ? (
            <>
              <Text style={type.label}>Day of week</Text>
              <OptionChips options={WEEKDAY_OPTS.map((w) => ({ value: String(w.value), label: w.label }))} value={String(weekday)} onChange={(v) => setWeekday(Number(v))} />
            </>
          ) : null}
          {cadence === "nthWeekday" ? (
            <>
              <Text style={type.label}>Which week</Text>
              <OptionChips options={[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: `${n}` }))} value={String(nth)} onChange={(v) => setNth(Number(v))} />
            </>
          ) : null}
          {cadence === "monthly" ? (
            <TextField label="Day of month" placeholder="1" keyboardType="number-pad" value={dom} onChangeText={setDom} returnKeyType="done" onSubmitEditing={() => Keyboard.dismiss()} />
          ) : null}
          {cadence === "nDays" ? (
            <TextField label="Every how many days" placeholder="10" keyboardType="number-pad" value={ndays} onChangeText={setNdays} returnKeyType="done" onSubmitEditing={() => Keyboard.dismiss()} />
          ) : null}

          <DayStepper label="Starts" day={start} onDay={setStart} />
          <Toggle label="Move weekends to a weekday" value={shift} onChange={setShift} />
          <Toggle label="Set an end date" value={hasEnd} onChange={setHasEnd} />
          {hasEnd ? <DayStepper label="Ends" day={end} onDay={setEnd} min={start} /> : null}

          {draft?.mode !== "edit" ? (
            <View style={styles.hintRow}>
              <Icon name="info" size={16} color={palette.inkMuted} />
              <Text style={[type.caption, { flex: 1 }]}>Future items preview on the calendar and only post on their due day — they never change today's balances.</Text>
            </View>
          ) : null}
          {error ? <Text style={[type.caption, { color: palette.danger }]}>{error}</Text> : null}
        </ScrollView>
        <Button label={draft?.mode === "edit" ? "Save changes" : "Schedule it"} size="lg" icon="check" disabled={!name.trim() || amount == null || amount <= 0} onPress={onSave} />
      </Sheet>

      <EditScopeSheet visible={pickScope} onClose={() => setPickScope(false)} onPick={(sc) => { setPickScope(false); doCommit(sc); }} />
    </>
  );
}

export function EditScopeSheet({ visible, onClose, onPick }: { visible: boolean; onClose: () => void; onPick: (scope: EditScope) => void }) {
  return (
    <Sheet visible={visible} title="Apply changes to…" onClose={onClose}>
      <Text style={[type.body, { color: palette.inkSoft }]}>Your changes apply to the whole series. Pick "This and future" to split off a new rule from the next due date.</Text>
      <Button label="This and all future" size="lg" onPress={() => onPick("thisAndFuture")} />
      <Button label="All occurrences" variant="secondary" onPress={() => onPick("all")} />
      <Button label="Just skip the next one" variant="ghost" icon="skip" onPress={() => onPick("this")} />
      <Text style={[type.caption, { textAlign: "center" }]}>Skipping doesn't apply edits — it removes only the next occurrence.</Text>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  dateRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  hintRow: { flexDirection: "row", gap: space.sm, alignItems: "flex-start", backgroundColor: palette.surfaceAlt, borderRadius: radius.md, padding: space.md },
});
