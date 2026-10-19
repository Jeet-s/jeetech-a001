import { useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import {
  Button,
  Card,
  EmptyState,
  Icon,
  IconButton,
  Pill,
  Screen,
  SectionHeader,
  Sheet,
  Tappable,
  feedback,
  palette,
  radius,
  shadow,
  space,
  toast,
  type,
  type Tone,
} from "../ui";
import { Money, scheduleKindLabel } from "./kit";
import { RecurringEditorSheet, type RecurringDraft } from "./recurring_sheets";
import { mutate, today, undo, useBudget } from "../state";
import { envelopeById, type RecurringRule } from "../core/model";
import { calendarPreview, deleteRecurring, nextOccurrence, pauseRecurring, skipOccurrence } from "../core/recurring";
import { addDays, daysBetween, MONTHS, WEEKDAY } from "../core/dates";

const fmtDay = (day: string) => {
  const [, m, d] = day.split("-").map(Number);
  return `${WEEKDAY[new Date(day + "T12:00").getDay()]}, ${MONTHS[m - 1]} ${d}`;
};

/** Relative "when" pill for an upcoming occurrence. Income is always success. */
function dueStatus(day: string, todayKey: string, income: boolean): { label: string; tone: Tone } {
  const n = daysBetween(todayKey, day);
  const tone: Tone = income ? "success" : n <= 0 ? "warning" : n <= 3 ? "primary" : "neutral";
  const label = n <= 0 ? "Due today" : n === 1 ? "Tomorrow" : n <= 7 ? `In ${n} days` : `In ${Math.round(n / 7)} wk`;
  return { label, tone };
}

function cadenceSummary(r: RecurringRule): string {
  const base = scheduleKindLabel[r.schedule.kind];
  const p = r.schedule.params;
  if (r.schedule.kind === "monthly" && p.day) return `${base} · day ${p.day}`;
  if ((r.schedule.kind === "weekly" || r.schedule.kind === "biweekly") && p.weekday != null) return `${base} · ${WEEKDAY[p.weekday]}`;
  if (r.schedule.kind === "nDays" && p.n) return `Every ${p.n} days`;
  return base;
}

export function RecurringScreen({ bottomInset }: { bottomInset: number; onPro: (from: string) => void }) {
  const s = useBudget();
  const todayKey = today();
  const [editDraft, setEditDraft] = useState<RecurringDraft>(null);
  const [actions, setActions] = useState<string | null>(null);

  const rules = s.recurring;
  const upcoming = calendarPreview(s, todayKey, addDays(todayKey, 45)).filter((c) => !c.posted).slice(0, 8);
  const actionRule = rules.find((r) => r.id === actions) ?? null;

  const pause = (r: RecurringRule) => {
    mutate((st) => pauseRecurring(st, r.id, r.status === "active"));
    feedback("pop", "light");
    setActions(null);
    toast(r.status === "active" ? "Paused" : "Resumed");
  };
  const skipNext = (r: RecurringRule) => {
    const next = nextOccurrence(r.schedule, todayKey);
    if (!next) return;
    mutate((st) => skipOccurrence(st, r.id, next, `${todayKey}T12:00:00.000`));
    feedback("pop", "light");
    setActions(null);
    toast(`Skipped ${fmtDay(next)}`, { label: "Undo", onPress: undo });
  };
  const remove = (r: RecurringRule) => {
    Alert.alert(
      `Delete "${r.name}"?`,
      "This removes the whole schedule. Already-posted transactions stay. You can undo straight after.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            mutate((st) => deleteRecurring(st, r.id));
            feedback("pop", "warning");
            setActions(null);
            toast(`Deleted "${r.name}"`, { label: "Undo", onPress: undo });
          },
        },
      ],
    );
  };

  return (
    <>
      <Screen
        title="Recurring"
        bottomInset={bottomInset}
        right={<IconButton icon="plus" label="New recurring" tone="primary" size={40} onPress={() => setEditDraft({ mode: "add" })} />}
      >
        {rules.length === 0 ? (
          <Card>
            <EmptyState
              icon="repeat"
              title="No scheduled items"
              body="Create your first recurring bill or paycheck. We'll post it automatically on its due day."
              action={<Button label="New recurring" icon="plus" onPress={() => setEditDraft({ mode: "add" })} />}
            />
          </Card>
        ) : (
          <>
            {upcoming.length ? (
              <>
                <SectionHeader title="Coming up" />
                <Card padded={false} style={{ padding: space.md }}>
                  {upcoming.map((c, i) => {
                    const income = c.type === "income";
                    const accent = income ? palette.success : palette.primary;
                    const last = i === upcoming.length - 1;
                    return (
                      <View key={`${c.ruleId}:${c.day}`} style={styles.tlRow}>
                        <View style={styles.tlRail}>
                          <View style={[styles.tlDot, { backgroundColor: accent, borderColor: accent + "33" }]} />
                          {!last ? <View style={styles.tlLine} /> : null}
                        </View>
                        <View style={styles.calDate}>
                          <Text style={styles.calMonth}>{MONTHS[Number(c.day.slice(5, 7)) - 1]}</Text>
                          <Text style={type.heading}>{Number(c.day.slice(8, 10))}</Text>
                        </View>
                        <View style={{ flex: 1, gap: 4 }}>
                          <Text style={type.bodyStrong} numberOfLines={1}>{c.name}</Text>
                          <View style={styles.tlMeta}>
                            {(() => { const st = dueStatus(c.day, todayKey, income); return <Pill label={st.label} tone={st.tone} />; })()}
                            <Text style={type.caption} numberOfLines={1}>{fmtDay(c.day)}</Text>
                          </View>
                        </View>
                        <Money minor={c.amount} currency={s.prefs.currency} style={[styles.tlAmount, { color: income ? palette.success : palette.ink }]} sign={income} />
                      </View>
                    );
                  })}
                </Card>
              </>
            ) : null}

            <SectionHeader title="Scheduled" />
            <View style={{ gap: space.sm }}>
              {rules.map((r) => {
                const env = envelopeById(s, r.template.envelopeId);
                const next = nextOccurrence(r.schedule, todayKey);
                const paused = r.status === "paused";
                return (
                  <Tappable key={r.id} label={`${r.name}, ${cadenceSummary(r)}${paused ? ", paused" : ""}`} onPress={() => setEditDraft({ mode: "edit", id: r.id })} scale={0.995} style={[styles.ruleRow, paused && styles.ruleRowPaused]}>
                    <View style={[styles.ruleIcon, { backgroundColor: (env?.color ?? palette.primary) + "22" }]}>
                      <Icon name={paused ? "close" : r.template.type === "income" ? "arrowUp" : "repeat"} size={20} color={paused ? palette.inkMuted : env?.color ?? palette.primary} />
                    </View>
                    <View style={{ flex: 1, gap: 5 }}>
                      <View style={styles.ruleTitle}>
                        <Text style={[type.bodyStrong, paused && { color: palette.inkMuted }]} numberOfLines={1}>{r.name}</Text>
                        {paused ? <Text style={styles.pausedBadge}>Paused</Text> : null}
                      </View>
                      <View style={styles.ruleMeta}>
                        <View style={[styles.cadenceChip, { backgroundColor: (env?.color ?? palette.primary) + "1A" }]}>
                          <Text style={[styles.cadenceTxt, { color: env?.color ?? palette.primary }]} numberOfLines={1}>{cadenceSummary(r)}</Text>
                        </View>
                        <Text style={type.caption} numberOfLines={1}>
                          {paused ? "paused" : next ? `next ${MONTHS[Number(next.slice(5, 7)) - 1]} ${Number(next.slice(8, 10))}` : "ended"}
                        </Text>
                      </View>
                    </View>
                    <Money minor={r.template.amount} currency={s.prefs.currency} style={[type.bodyStrong, { color: r.template.type === "income" ? palette.success : palette.ink }]} />
                    <IconButton icon="dots" label={`Options for ${r.name}`} size={40} onPress={() => setActions(r.id)} />
                  </Tappable>
                );
              })}
            </View>
            <View style={styles.hintRow}>
              <Icon name="info" size={16} color={palette.inkMuted} />
              <Text style={[type.caption, { flex: 1 }]}>Due items post automatically when you open the app. Future items never change today's balances.</Text>
            </View>
          </>
        )}
      </Screen>

      <RecurringEditorSheet draft={editDraft} onClose={() => setEditDraft(null)} />

      <Sheet visible={!!actionRule} title={actionRule?.name ?? ""} onClose={() => setActions(null)}>
        {actionRule ? (
          <View style={{ gap: space.sm }}>
            <Button label="Edit schedule" icon="edit" onPress={() => { const r = actionRule; setActions(null); setEditDraft({ mode: "edit", id: r.id }); }} />
            <Button label={actionRule.status === "active" ? "Pause" : "Resume"} variant="secondary" icon={actionRule.status === "active" ? "close" : "repeat"} onPress={() => pause(actionRule)} />
            {actionRule.status === "active" ? <Button label="Skip next occurrence" variant="ghost" icon="skip" onPress={() => skipNext(actionRule)} /> : null}
            <Button label="Delete" variant="danger" icon="trash" onPress={() => remove(actionRule)} />
          </View>
        ) : null}
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  tlRow: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 56 },
  tlMeta: { flexDirection: "row", alignItems: "center", gap: space.sm, flexShrink: 1 },
  tlRail: { width: 14, alignSelf: "stretch", alignItems: "center" },
  tlDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 3, marginTop: 20 },
  tlLine: { position: "absolute", top: 36, bottom: -2, width: 2, backgroundColor: palette.border, borderRadius: 1 },
  tlAmount: { fontFamily: type.number.fontFamily, fontSize: 17, lineHeight: 22, letterSpacing: -0.3, fontVariant: ["tabular-nums"] },
  calMonth: { ...type.caption, textTransform: "uppercase", letterSpacing: 0.4 },
  calDate: { width: 40, alignItems: "center" },
  ruleRow: { flexDirection: "row", alignItems: "center", gap: space.md, backgroundColor: palette.surface, borderRadius: radius.lg, padding: space.md, minHeight: 64, ...shadow },
  ruleRowPaused: { backgroundColor: palette.surfaceAlt, opacity: 0.85 },
  ruleTitle: { flexDirection: "row", alignItems: "center", gap: space.sm },
  ruleMeta: { flexDirection: "row", alignItems: "center", gap: space.sm, flexShrink: 1 },
  cadenceChip: { borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 2, flexShrink: 1 },
  cadenceTxt: { fontFamily: type.label.fontFamily, fontSize: 12, lineHeight: 16 },
  pausedBadge: { ...type.caption, color: palette.inkSoft, backgroundColor: palette.border, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, overflow: "hidden", fontSize: 11 },
  ruleIcon: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  hintRow: { flexDirection: "row", gap: space.sm, alignItems: "flex-start", backgroundColor: palette.surfaceAlt, borderRadius: radius.md, padding: space.md },
});
