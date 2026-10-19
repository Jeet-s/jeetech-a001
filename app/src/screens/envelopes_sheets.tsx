import { useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import {
  Button,
  Icon,
  Pill,
  Sheet,
  Tappable,
  TextField,
  Toggle,
  feedback,
  palette,
  radius,
  space,
  toast,
  type,
} from "../ui";
import { EnvelopeBar, EnvelopeGlyph, Money, envelopeError, iconFor } from "./kit";
import { mutate, today, undo, useBudget } from "../state";
import {
  ENVELOPE_COLORS,
  ENVELOPE_ICONS,
  activeEnvelopes,
  envelopeById,
} from "../core/model";
import {
  addEnvelope,
  contrastRatio,
  deleteEnvelope,
  editEnvelope,
  hideEnvelope,
} from "../core/envelopes";
import { plannedFor, setBudget, envelopeSummary, spentFraction } from "../core/budget";
import { queryTransactions } from "../core/transactions";
import { parseAmount, fromMinor, formatMoney } from "../core/money";
import { MONTHS, WEEKDAY, periodLabel, type Period } from "../core/dates";
import type { TxnDraft } from "./txn";

export type EnvelopeEditDraft = { mode: "add"; parentId?: string | null } | { mode: "edit"; id: string };

export function EnvelopeEditorSheet({
  draft,
  period,
  onClose,
}: {
  draft: EnvelopeEditDraft | null;
  period: Period;
  onClose: () => void;
}) {
  const s = useBudget();
  const { height } = useWindowDimensions();
  const env = draft?.mode === "edit" ? envelopeById(s, draft.id) : null;

  const [name, setName] = useState("");
  const [icon, setIcon] = useState("cart");
  const [color, setColor] = useState(ENVELOPE_COLORS[0]);
  const [rollover, setRollover] = useState(false);
  const [planned, setPlanned] = useState("");
  const [error, setError] = useState<string | null>(null);

  const key = draft ? (draft.mode === "edit" ? `e:${draft.id}` : "add") : "";
  useEffect(() => {
    if (!draft) return;
    setError(null);
    if (draft.mode === "edit" && env) {
      setName(env.name);
      setIcon(env.icon);
      setColor(env.color);
      setRollover(env.rolloverEnabled);
      const p = plannedFor(s, env.id, period);
      setPlanned(p ? String(fromMinor(p, s.prefs.currency)) : "");
    } else {
      setName("");
      setIcon("cart");
      setColor(ENVELOPE_COLORS[0]);
      setRollover(false);
      setPlanned("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const plannedMinor = planned.trim() ? Math.max(0, parseAmount(planned, s.prefs.currency) ?? 0) : 0;
  const lowContrast = contrastRatio(color, "#FFFFFF") < 1.6;

  const save = () => {
    if (draft?.mode === "edit" && env) {
      const res = editEnvelope(s, env.id, { name, icon, color, rolloverEnabled: rollover });
      if (res.error) { feedback("error", "error"); return setError(envelopeError[res.error]); }
      const withBudget = setBudget(res.state, env.id, period, plannedMinor);
      mutate(() => withBudget);
      feedback("success", "success");
      toast("Envelope updated");
      return onClose();
    }
    const res = addEnvelope(s, { name, icon, color, rolloverEnabled: rollover, parentId: draft?.mode === "add" ? draft.parentId ?? null : null });
    if (res.error) { feedback("error", "error"); return setError(envelopeError[res.error]); }
    const withBudget = res.id ? setBudget(res.state, res.id, period, plannedMinor) : res.state;
    mutate(() => withBudget);
    feedback("success", "success");
    toast("Envelope created");
    onClose();
  };

  const remove = () => {
    if (!env) return;
    const name = env.name;
    Alert.alert(
      `Delete "${name}"?`,
      "Its transactions stay, but lose this envelope. You can undo straight after.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            mutate((st) => deleteEnvelope(st, env.id));
            feedback("pop", "warning");
            onClose();
            toast(`Deleted "${name}"`, { label: "Undo", onPress: undo });
          },
        },
      ],
    );
  };

  const hide = () => {
    if (!env) return;
    mutate((st) => hideEnvelope(st, env.id));
    feedback("pop", "light");
    onClose();
    toast(`Hid "${env.name}"`, { label: "Undo", onPress: undo });
  };

  return (
    <Sheet visible={!!draft} title={draft?.mode === "edit" ? "Edit envelope" : "New envelope"} onClose={onClose}>
      <ScrollView style={{ maxHeight: height * 0.62 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: space.md }}>
      <View style={styles.previewRow}>
        <EnvelopeGlyph icon={icon} color={color} size={52} />
        <View style={{ flex: 1 }}>
          <Text style={type.heading} numberOfLines={1}>{name || "New envelope"}</Text>
          <Text style={type.caption}>{periodLabel(period, s.prefs.period)}</Text>
        </View>
      </View>
      <TextField label="Name" placeholder="e.g. Groceries" value={name} onChangeText={(t) => { setName(t); setError(null); }} maxLength={40} autoFocus={draft?.mode === "add"} />

      <Text style={type.label}>Icon</Text>
      <View style={styles.grid}>
        {ENVELOPE_ICONS.map((ic) => (
          <Tappable key={ic} label={ic} sound="pop" onPress={() => setIcon(ic)} style={[styles.swatch, icon === ic && { borderColor: palette.ink, borderWidth: 2 }]}>
            <Icon name={iconFor(ic)} size={22} color={palette.inkSoft} />
          </Tappable>
        ))}
      </View>

      <Text style={type.label}>Colour</Text>
      <View style={styles.grid}>
        {ENVELOPE_COLORS.map((c) => (
          <Tappable key={c} label={`colour ${c}`} sound="pop" onPress={() => setColor(c)} style={[styles.color, { backgroundColor: c }, color === c && styles.colorOn]}>
            {color === c ? <Icon name="check" size={18} color="#fff" /> : null}
          </Tappable>
        ))}
      </View>
      {lowContrast ? <Text style={type.caption}>Tip: a brighter colour keeps the bar easy to read.</Text> : null}

      <TextField label="Monthly budget (optional)" placeholder="0" keyboardType="decimal-pad" value={planned} onChangeText={setPlanned} />
      <Toggle label="Roll over leftover" description="Carry what's left (or overspent) into the next period" value={rollover} onChange={setRollover} />

      {error ? <Text style={[type.caption, { color: palette.danger }]}>{error}</Text> : null}
      </ScrollView>
      <Button label={draft?.mode === "edit" ? "Save envelope" : "Create envelope"} size="lg" icon="check" disabled={!name.trim()} onPress={save} />
      {draft?.mode === "edit" ? (
        <View style={styles.editActions}>
          <Button label="Hide" variant="ghost" icon="close" style={{ flex: 1 }} onPress={hide} />
          <Button label="Delete" variant="danger" icon="trash" style={{ flex: 1 }} onPress={remove} />
        </View>
      ) : null}
    </Sheet>
  );
}

// ─────────────────────────────── envelope detail ───────────────────────────

export function EnvelopeDetailSheet({
  id,
  period,
  onClose,
  onAdd,
  onEditTxn,
  onEditEnvelope,
}: {
  id: string | null;
  period: Period;
  onClose: () => void;
  onAdd: (draft: TxnDraft) => void;
  onEditTxn: (id: string) => void;
  onEditEnvelope: (id: string) => void;
}) {
  const s = useBudget();
  const env = envelopeById(s, id);
  if (!env) return <Sheet visible={!!id} onClose={onClose}><View /></Sheet>;
  const sum = envelopeSummary(s, env.id, period, s.prefs.period, today());
  const recent = queryTransactions(s, { envelopeId: env.id, from: period.start, to: period.end }).slice(0, 8);
  const cur = s.prefs.currency;
  const frac = spentFraction(sum);
  const status: { label: string; tone: "success" | "warning" | "danger" } = sum.overspent
    ? { label: `Over by ${formatMoney(Math.abs(sum.available), cur)}`, tone: "danger" }
    : frac >= 0.85
      ? { label: "Nearly spent", tone: "warning" }
      : { label: "On track", tone: "success" };

  // Group this period's transactions under date headers (newest first).
  const groups: { day: string; items: typeof recent }[] = [];
  for (const t of recent) {
    const day = t.date.slice(0, 10);
    const g = groups[groups.length - 1];
    if (g && g.day === day) g.items.push(t);
    else groups.push({ day, items: [t] });
  }
  const fmtDate = (isoDay: string) => {
    const [, m, d] = isoDay.split("-").map(Number);
    return `${WEEKDAY[new Date(isoDay + "T12:00").getDay()]} · ${MONTHS[m - 1]} ${d}`;
  };

  return (
    <Sheet visible={!!id} title={env.name} onClose={onClose}>
      <View style={[styles.detailHero, { backgroundColor: env.color + "14" }]}>
        <View style={styles.previewRow}>
          <EnvelopeGlyph icon={env.icon} color={env.color} size={56} />
          <View style={{ flex: 1, gap: 4 }}>
            <Money minor={sum.available} currency={cur} style={[type.display, { color: sum.overspent ? palette.danger : palette.ink }]} />
            <View style={styles.detailStatusRow}>
              <Pill label={status.label} tone={status.tone} />
              <Text style={type.caption} numberOfLines={1}>{sum.overspent ? "overspent" : "left"} · {periodLabel(period, s.prefs.period)}</Text>
            </View>
          </View>
        </View>
        <EnvelopeBar fraction={frac} color={env.color} overspent={sum.overspent} height={10} />
        {/* Transparent carry math: exactly how Planned + Carry In − Spent lands
            on Available, and what rolls forward — so "available" is never a
            mystery number. */}
        <View style={styles.ledger}>
          <LedgerRow label="Planned" minor={sum.planned} currency={cur} />
          {env.rolloverEnabled ? (
            <LedgerRow label="Carry in" minor={sum.carryIn} currency={cur} sign tone={sum.carryIn < 0 ? palette.danger : palette.success} />
          ) : null}
          <LedgerRow label="Spent" minor={sum.netSpent} currency={cur} />
          <View style={styles.ledgerDivider} />
          <LedgerRow label="Available" minor={sum.available} currency={cur} strong tone={sum.overspent ? palette.danger : palette.ink} />
          {env.rolloverEnabled ? (
            <LedgerRow label="Projected carry" caption="rolls into next period" minor={sum.carryOut} currency={cur} sign tone={sum.carryOut < 0 ? palette.danger : palette.success} />
          ) : null}
        </View>
      </View>

      {/* One primary action (Add expense); Deposit is secondary. */}
      <Button label="Add expense" icon="arrowDown" onPress={() => onAdd({ mode: "add", type: "expense", envelopeId: env.id })} />
      <View style={styles.editActions}>
        <Button label="Deposit" variant="secondary" icon="arrowUp" style={{ flex: 1 }} onPress={() => onAdd({ mode: "add", type: "income", envelopeId: env.id })} />
        <Button label="Edit" variant="ghost" icon="edit" style={{ flex: 1 }} onPress={() => { onClose(); onEditEnvelope(env.id); }} />
      </View>

      <Text style={type.label}>This period</Text>
      {recent.length === 0 ? (
        <Text style={type.caption}>No transactions yet this period.</Text>
      ) : (
        <View style={{ gap: space.sm }}>
          {groups.map((g) => (
            <View key={g.day} style={{ gap: 2 }}>
              <Text style={styles.dateHeader}>{fmtDate(g.day)}</Text>
              <View style={styles.txnCard}>
                {g.items.map((t, i) => (
                  <Tappable key={t.id} label={`${t.note || env.name}, ${t.type}`} onPress={() => onEditTxn(t.id)} scale={0.99} style={[styles.txnRow, i > 0 && styles.txnRowDivider]}>
                    <View style={[styles.txnDot, { backgroundColor: t.type === "income" ? palette.success : env.color }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={type.bodyStrong} numberOfLines={1}>{t.note || (t.type === "income" ? "Deposit" : env.name)}</Text>
                    </View>
                    <Money minor={t.amount} currency={t.currency} style={[type.amount, { color: t.type === "income" ? palette.success : palette.ink }]} sign={t.type === "income"} />
                  </Tappable>
                ))}
              </View>
            </View>
          ))}
        </View>
      )}
    </Sheet>
  );
}

function LedgerRow({
  label,
  caption,
  minor,
  currency,
  sign = false,
  strong = false,
  tone,
}: {
  label: string;
  caption?: string;
  minor: number;
  currency: string;
  sign?: boolean;
  strong?: boolean;
  tone?: string;
}) {
  return (
    <View style={styles.ledgerRow} accessible accessibilityLabel={`${label}: ${formatMoney(minor, currency, { sign })}`}>
      <View style={{ flex: 1 }}>
        <Text style={strong ? type.bodyStrong : type.label} numberOfLines={1}>{label}</Text>
        {caption ? <Text style={type.caption} numberOfLines={1}>{caption}</Text> : null}
      </View>
      <Money minor={minor} currency={currency} sign={sign} style={[type.amount, ...(strong ? [{ fontSize: 18 }] : []), ...(tone ? [{ color: tone }] : [])]} />
    </View>
  );
}

const styles = StyleSheet.create({
  previewRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  swatch: { width: 48, height: 48, borderRadius: radius.md, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface, alignItems: "center", justifyContent: "center" },
  color: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  colorOn: { borderWidth: 2, borderColor: palette.ink },
  editActions: { flexDirection: "row", gap: space.sm },
  detailHero: { borderRadius: radius.lg, padding: space.md, gap: space.md },
  detailStatusRow: { flexDirection: "row", alignItems: "center", gap: space.sm, flexWrap: "wrap" },
  ledger: { backgroundColor: palette.surface, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.xs },
  ledgerRow: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 40, paddingVertical: 6 },
  ledgerDivider: { height: StyleSheet.hairlineWidth, backgroundColor: palette.border, marginVertical: 2 },
  dateHeader: { ...type.caption, color: palette.inkSoft, textTransform: "uppercase", letterSpacing: 0.5, marginLeft: space.xs },
  txnCard: { backgroundColor: palette.surface, borderRadius: radius.md, borderWidth: 1, borderColor: palette.border, paddingHorizontal: space.md },
  txnRow: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 52, paddingVertical: space.sm },
  txnRowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border },
  txnDot: { width: 8, height: 8, borderRadius: 4 },
});
