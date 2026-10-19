import { useEffect, useMemo, useState } from "react";
import { ScrollView, Share, StyleSheet, Text, View } from "react-native";
import {
  BarChart,
  Button,
  Card,
  Donut,
  EmptyState,
  Icon,
  Screen,
  SectionHeader,
  Segmented,
  Sheet,
  Tappable,
  feedback,
  gradients,
  palette,
  radius,
  space,
  toast,
  type,
} from "../ui";
import { Money, OptionChips } from "./kit";
import { art } from "../art";
import { useSheets } from "./sheets_provider";
import { today, useBudget } from "../state";
import { useSettings } from "../modules/store";
import { canUse } from "../core/prefs";
import { analytics } from "../modules/analytics";
import { envelopeById } from "../core/model";
import { cashFlow, categoryBreakdown, drillDown, monthlyComparison, totals, type Bucket } from "../core/reports";
import { formatMoney } from "../core/money";
import { exportCsv } from "../core/csv";
import { addDays, daysBetween, presetRange, startOfMonth, endOfMonth, MONTHS, type RangePreset } from "../core/dates";

const PRESETS: { value: RangePreset; label: string }[] = [
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "last_3m", label: "3 months" },
  { value: "ytd", label: "Year" },
  { value: "this_period", label: "This period" },
  { value: "custom", label: "Custom" },
];

const barLabel = (dayKey: string, unit: Bucket) => {
  const [, m, d] = dayKey.split("-").map(Number);
  return unit === "month" ? MONTHS[m - 1] : `${d}`;
};

export function ReportsScreen({ bottomInset, onPro }: { bottomInset: number; onPro: (from: string) => void }) {
  const s = useBudget();
  const settings = useSettings();
  const todayKey = today();
  const { openTxn } = useSheets();
  const cur = s.prefs.currency;

  const [preset, setPreset] = useState<RangePreset>("this_month");
  const [custom, setCustom] = useState({ from: startOfMonth(todayKey), to: endOfMonth(todayKey) });
  const [drill, setDrill] = useState<{ envelopeId: string | null; label: string } | null>(null);
  const [metric, setMetric] = useState<"expense" | "income" | "net">("expense");
  const [picked, setPicked] = useState<number | null>(null);

  useEffect(() => { analytics.track("report_view"); }, []);

  const range = presetRange(preset, todayKey, s.prefs.period, custom);
  const spanDays = daysBetween(range.from, range.to) + 1;
  const unit: Bucket = spanDays <= 16 ? "day" : spanDays <= 92 ? "week" : "month";
  const t = totals(s, range.from, range.to);
  const flow = useMemo(() => cashFlow(s, range.from, range.to, unit), [s, range.from, range.to, unit]);
  const cats = useMemo(() => categoryBreakdown(s, range.from, range.to), [s, range.from, range.to]);
  const hasData = t.income > 0 || t.expense > 0;

  const exportNow = async () => {
    feedback("tap", "light");
    const csv = exportCsv(s, { from: range.from, to: range.to });
    analytics.track("export_csv");
    try {
      await Share.share({ message: csv, title: "Envelope Mini export" });
    } catch {
      /* user dismissed */
    }
  };

  return (
    <>
      <Screen title="Reports" bottomInset={bottomInset}>
        <OptionChips options={PRESETS} value={preset} onChange={setPreset} />
        {preset === "custom" ? (
          <Card style={{ gap: space.sm }}>
            <RangeStepper label="From" day={custom.from} onDay={(d) => setCustom((c) => ({ ...c, from: d > c.to ? c.to : d }))} />
            <RangeStepper label="To" day={custom.to} onDay={(d) => setCustom((c) => ({ ...c, to: d < c.from ? c.from : d }))} />
          </Card>
        ) : null}

        {!hasData ? (
          <Card><EmptyState art={art.empty_state_reports} title="Not enough data yet" body="Log a few transactions to see cash flow and category charts for this range." /></Card>
        ) : (
          <>
            <Card style={{ gap: space.md }}>
              <View style={styles.totalsRow}>
                <Toty label="Income" minor={t.income} currency={cur} tone={palette.success} />
                <Toty label="Expense" minor={t.expense} currency={cur} tone={palette.ink} />
                <Toty label="Net" minor={t.net} currency={cur} tone={t.net < 0 ? palette.danger : palette.success} />
              </View>
              <Segmented
                options={[{ value: "expense", label: "Expense" }, { value: "income", label: "Income" }, { value: "net", label: "Net" }]}
                value={metric}
                onChange={(v) => { setMetric(v); setPicked(null); }}
              />
              {(() => {
                const series = flow.map((f) => ({ label: barLabel(f.label, unit), value: metric === "net" ? f.net : metric === "income" ? f.income : f.expense }));
                const grad = metric === "income" ? gradients.brandBright : metric === "net" ? (t.net < 0 ? gradients.danger : gradients.brandBright) : gradients.brandBright;
                const sel = picked != null ? series[picked] : null;
                return (
                  <>
                    <View style={styles.tooltipSlot}>
                      {sel ? (
                        <View style={styles.tooltip} accessibilityLiveRegion="polite">
                          <Text style={[type.caption, { color: palette.onPrimary }]}>{sel.label}</Text>
                          <Money minor={Math.abs(sel.value)} currency={cur} style={[type.bodyStrong, { color: palette.onPrimary }]} sign={sel.value < 0} />
                        </View>
                      ) : (
                        <Text style={[type.caption, { textAlign: "center" }]}>Tap a bar to see its total</Text>
                      )}
                    </View>
                    <BarChart
                      data={series}
                      height={130}
                      gradient={grad}
                      highlight={picked ?? flow.length - 1}
                      onPressBar={(i) => { feedback("tap", "light"); setPicked((p) => (p === i ? null : i)); }}
                      summary={`${metric} by ${unit}. Total ${metric} ${formatMoney(metric === "net" ? Math.abs(t.net) : metric === "income" ? t.income : t.expense, cur)} over this range.`}
                    />
                  </>
                );
              })()}
              <Text style={[type.caption, { textAlign: "center" }]}>{metric === "net" ? "Net" : metric === "income" ? "Income" : "Spending"} by {unit}</Text>
            </Card>

            <SectionHeader title="Where it went" />
            <Card padded={false} style={{ padding: space.md, gap: space.md }}>
              {cats.filter((c) => c.expense > 0).length === 0 ? (
                <View accessible accessibilityRole="text" accessibilityLabel="No spending in this range."><Text style={type.caption}>No spending in this range.</Text></View>
              ) : (
                <>
                <View style={styles.donutWrap}>
                  <Donut
                    slices={cats.filter((c) => c.expense > 0).map((c) => ({ color: envelopeById(s, c.envelopeId)?.color ?? palette.inkMuted, value: c.expense, label: envelopeById(s, c.envelopeId)?.name ?? "Uncategorised" }))}
                    centerValue={formatMoney(t.expense, cur)}
                    centerLabel="spent"
                  />
                </View>
                {/* Compact tappable legend — same colours as the donut, newest share first. */}
                <View style={{ gap: 2 }}>
                  {cats.filter((c) => c.expense > 0).map((c) => {
                    const env = envelopeById(s, c.envelopeId);
                    const color = env?.color ?? palette.inkMuted;
                    return (
                      <Tappable
                        key={c.envelopeId ?? "none"}
                        label={`${env?.name ?? "Uncategorised"}, ${formatMoney(c.expense, cur)}, ${Math.round(c.share * 100)} percent`}
                        onPress={() => setDrill({ envelopeId: c.envelopeId, label: env?.name ?? "Uncategorised" })}
                        scale={0.99}
                        style={styles.legendRow}
                      >
                        <View style={[styles.legendDot, { backgroundColor: color }]} />
                        <Text style={[type.body, { flex: 1 }]} numberOfLines={1}>{env?.name ?? "Uncategorised"}</Text>
                        <Money minor={c.expense} currency={cur} style={type.amount} />
                        <View style={styles.sharePill}><Text style={styles.sharePillTxt}>{Math.round(c.share * 100)}%</Text></View>
                        <Icon name="chevronRight" size={16} color={palette.inkMuted} />
                      </Tappable>
                    );
                  })}
                </View>
                </>
              )}
            </Card>

            {/* Advanced (Pro): multi-month comparison */}
            <SectionHeader title="Compare months" action={!settings.pro ? <Icon name="lock" size={16} color={palette.inkMuted} /> : undefined} />
            {canUse("advanced_reports", settings.pro) ? (
              <Card style={{ gap: space.sm }}>
                {monthlyComparison(s, todayKey, 3).map((m) => (
                  <View key={m.month} style={styles.monthRow}>
                    <Text style={[type.label, { flex: 1 }]}>{MONTHS[Number(m.month.slice(5, 7)) - 1]}</Text>
                    <Money minor={m.expense} currency={cur} style={[type.body, { width: 110, textAlign: "right" }]} />
                    <Money minor={m.net} currency={cur} style={[type.bodyStrong, { width: 110, textAlign: "right", color: m.net < 0 ? palette.danger : palette.success }]} sign />
                  </View>
                ))}
              </Card>
            ) : (
              <Card>
                <Tappable label="Unlock advanced reports" onPress={() => onPro("advanced_reports")} style={styles.lockedRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={type.bodyStrong}>Multi-month comparison</Text>
                    <Text style={type.caption}>Compare spending and net across months with Pro.</Text>
                  </View>
                  <Icon name="chevronRight" size={20} color={palette.inkMuted} />
                </Tappable>
              </Card>
            )}

            <Button label="Export this range (CSV)" variant="secondary" icon="download" onPress={exportNow} />
          </>
        )}
      </Screen>

      <Sheet visible={!!drill} title={drill?.label ?? ""} onClose={() => setDrill(null)}>
        <DrillList
          txns={drill ? drillDown(s, range.from, range.to, { envelopeId: drill.envelopeId }) : []}
          currency={cur}
          onPick={(id) => { setDrill(null); openTxn({ mode: "edit", id }); }}
        />
      </Sheet>
    </>
  );
}

function Toty({ label, minor, currency, tone }: { label: string; minor: number; currency: string; tone: string }) {
  return (
    <View style={{ flex: 1 }} accessible accessibilityLabel={`${label}: ${formatMoney(minor, currency)}`}>
      <Text style={type.caption}>{label}</Text>
      <Money minor={minor} currency={currency} style={[type.bodyStrong, { color: tone }]} />
    </View>
  );
}

function RangeStepper({ label, day, onDay }: { label: string; day: string; onDay: (d: string) => void }) {
  const [, m, d] = day.split("-").map(Number);
  return (
    <View style={styles.monthRow}>
      <Text style={[type.label, { flex: 1 }]}>{label}</Text>
      <Button label="−7d" variant="ghost" size="sm" sound="pop" onPress={() => onDay(addDays(day, -7))} />
      <Text style={[type.bodyStrong, { minWidth: 96, textAlign: "center" }]} accessibilityLabel={`${label} ${MONTHS[m - 1]} ${d}`}>{MONTHS[m - 1]} {d}</Text>
      <Button label="+7d" variant="ghost" size="sm" sound="pop" onPress={() => onDay(addDays(day, 7))} />
    </View>
  );
}

function DrillList({ txns, currency, onPick }: { txns: { id: string; note: string; amount: number; type: string; date: string; currency: string }[]; currency: string; onPick: (id: string) => void }) {
  if (!txns.length) return <View accessible accessibilityRole="text" accessibilityLabel="No transactions here."><Text style={type.caption}>No transactions here.</Text></View>;
  return (
    <ScrollView style={{ maxHeight: 380 }} keyboardShouldPersistTaps="handled">
      {txns.slice(0, 50).map((t) => (
        <Tappable key={t.id} label={t.note || t.type} onPress={() => onPick(t.id)} scale={0.99} style={styles.drillRow}>
          <View style={{ flex: 1 }}>
            <Text style={type.bodyStrong} numberOfLines={1}>{t.note || (t.type === "income" ? "Deposit" : "Expense")}</Text>
            <Text style={type.caption}>{t.date.slice(0, 10)}</Text>
          </View>
          <Money minor={t.amount} currency={t.currency || currency} style={[type.bodyStrong, { color: t.type === "income" ? palette.success : palette.ink }]} />
        </Tappable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  totalsRow: { flexDirection: "row", gap: space.sm },
  donutWrap: { alignItems: "center", paddingVertical: space.sm },
  tooltipSlot: { minHeight: 30, alignItems: "center", justifyContent: "center" },
  tooltip: { flexDirection: "row", alignItems: "center", gap: space.sm, backgroundColor: palette.ink, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 6 },
  legendRow: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 40 },
  legendDot: { width: 12, height: 12, borderRadius: 6 },
  sharePill: { minWidth: 42, alignItems: "center", backgroundColor: palette.surfaceAlt, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  sharePillTxt: { ...type.caption, color: palette.inkSoft, fontVariant: ["tabular-nums"] },
  monthRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  lockedRow: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 48 },
  drillRow: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 52, paddingVertical: space.sm },
});
