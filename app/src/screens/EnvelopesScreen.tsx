import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown, FadeOut, LinearTransition, ZoomIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Button,
  Card,
  EmptyState,
  HeroCard,
  Icon,
  IconButton,
  Pill,
  ProgressRing,
  Screen,
  SectionHeader,
  Skeleton,
  TAB_BAR_HEIGHT,
  Tappable,
  TextField,
  feedback,
  palette,
  radius,
  shadow,
  shadowStrong,
  space,
  toast,
  type,
  type Tone,
} from "../ui";
import { EnvelopeBar, EnvelopeGlyph, Money } from "./kit";
import { art } from "../art";
import { useBannerHeight } from "../modules/layout";
import { EnvelopeDetailSheet, EnvelopeEditorSheet, type EnvelopeEditDraft } from "./envelopes_sheets";
import { useSheets } from "./sheets_provider";
import { mutate, today, undo, useBudget, useEnvelopeFlash, useUndo } from "../state";
import { activeEnvelopes, type Envelope } from "../core/model";
import { childEnvelopes, reorderEnvelopes, searchEnvelopes } from "../core/envelopes";
import { seedSamples } from "../core/onboarding";
import { envelopeSummary, periodTotals } from "../core/budget";
import { periodFor, nextPeriod, prevPeriod, periodLabel, daysBetween, type Period } from "../core/dates";
import { formatMoney } from "../core/money";

export function EnvelopesScreen({ bottomInset, booting = false }: { bottomInset: number; onPro: (from: string) => void; booting?: boolean }) {
  const s = useBudget();
  const todayKey = today();
  const insets = useSafeAreaInsets();
  const banner = useBannerHeight();
  const { openTxn } = useSheets();
  const { canUndo } = useUndo();

  const [offset, setOffset] = useState(0);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [manage, setManage] = useState(false);
  const [editDraft, setEditDraft] = useState<EnvelopeEditDraft | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  // A transaction just landed in this envelope → pop a success check on its row.
  const [flashId, setFlashId] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEnvelopeFlash((id) => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
    setFlashId(id);
    flashTimer.current = setTimeout(() => setFlashId(null), 1500);
  });
  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current); }, []);

  const period = useMemo<Period>(() => {
    let p = periodFor(todayKey, s.prefs.period);
    for (let i = 0; i < Math.abs(offset); i++) p = offset > 0 ? nextPeriod(p, s.prefs.period) : prevPeriod(p, s.prefs.period);
    return p;
  }, [offset, todayKey, s.prefs.period]);

  const asOf = offset === 0 ? todayKey : period.end;
  const totals = periodTotals(s, period, s.prefs.period, asOf);
  const all = activeEnvelopes(s);
  const cur = s.prefs.currency;

  // Days remaining in the period — only meaningful for the current period.
  const daysLeft = offset === 0 ? Math.max(0, daysBetween(todayKey, period.end)) : null;

  // Which top-level envelopes to show, and how they split into over-budget first.
  const parents = useMemo(
    () => (query.trim() ? searchEnvelopes(s, query) : all.filter((e) => !e.parentId)),
    [s, query, all],
  );
  const summaryOf = (e: Envelope) => envelopeSummary(s, e.id, period, s.prefs.period, asOf);
  const overList = query.trim() ? [] : parents.filter((e) => summaryOf(e).overspent);
  const okList = query.trim() ? parents : parents.filter((e) => !summaryOf(e).overspent);

  const seedNow = () => {
    mutate((st) => seedSamples(st, todayKey));
    feedback("success", "success");
    toast("Added Groceries, Fuel & Eating Out", { label: "Undo", onPress: undo });
  };

  const move = (e: Envelope, dir: -1 | 1) => {
    const idx = all.findIndex((x) => x.id === e.id);
    mutate((st) => reorderEnvelopes(st, e.id, idx + dir));
    feedback("pop", "light");
  };

  const renderEnvelope = (e: Envelope, child = false, index = 0) => {
    const sum = summaryOf(e);
    const base = sum.planned + sum.carryIn;
    const hasBudget = base > 0;
    const spent = Math.max(0, sum.netSpent);
    const spentFrac = hasBudget ? spent / base : 0;
    const over = sum.overspent;
    const flashing = e.id === flashId;
    return (
      <Animated.View key={e.id} layout={LinearTransition.duration(200)} entering={FadeInDown.duration(260).delay(Math.min(index, 7) * 45)}>
        <Tappable
          label={`${e.name}, ${formatMoney(Math.abs(sum.available), cur)} ${over ? "overspent" : "left"}`}
          onPress={() => setDetailId(e.id)}
          scale={0.98}
          style={[styles.row, child && styles.child, over && styles.rowOver, flashing && styles.rowFlash]}
        >
          {flashing ? (
            <Animated.View entering={ZoomIn.springify().damping(12).stiffness(220)} exiting={FadeOut.duration(220)} style={styles.flashBadge} pointerEvents="none">
              <Icon name="check" size={15} color={palette.onPrimary} />
            </Animated.View>
          ) : null}
          <View style={styles.rowHead}>
            <EnvelopeGlyph icon={e.icon} color={e.color} size={44} />
            <View style={{ flex: 1, gap: 7 }}>
              <View style={styles.rowTop}>
                <Text style={[type.bodyStrong, { flexShrink: 1 }]} numberOfLines={1}>{e.name}</Text>
                <View style={styles.rowAmountWrap}>
                  <Money minor={Math.abs(sum.available)} currency={cur} sign={false} compact style={[styles.rowAmount, { color: over ? palette.danger : palette.ink }]} />
                  <Text style={[styles.rowLeftTag, over && { color: palette.danger }]}>{over ? "over" : "left"}</Text>
                </View>
              </View>
              {hasBudget ? (
                <>
                  <View style={styles.barRow}>
                    <View style={{ flex: 1 }}>
                      <EnvelopeBar fraction={spentFrac} color={e.color} overspent={over} height={8} />
                    </View>
                    <Pill label={`${Math.round(spentFrac * 100)}%`} tone={over ? "danger" : spentFrac >= 0.85 ? "warning" : "success"} />
                  </View>
                  <Text style={[styles.rowMeta, { flexShrink: 1 }]} numberOfLines={1}>
                    Spent <Text style={styles.rowMetaStrong}>{formatMoney(spent, cur)}</Text>
                    {` of ${formatMoney(base, cur)}`}
                    {e.rolloverEnabled && sum.carryIn !== 0 ? `  ·  ${sum.carryIn > 0 ? "+" : "−"}${formatMoney(Math.abs(sum.carryIn), cur)} rolled` : ""}
                  </Text>
                </>
              ) : (
                <Text style={styles.rowMeta} numberOfLines={1}>Tap to set a budget</Text>
              )}
              {over ? (
                <Tappable
                  label={`Add funds to ${e.name}`}
                  sound="pop"
                  onPress={() => openTxn({ mode: "add", type: "income", envelopeId: e.id })}
                  style={styles.addFunds}
                >
                  <Icon name="alert" size={13} color={palette.danger} />
                  <Text style={styles.addFundsTxt}>Add funds</Text>
                </Tappable>
              ) : null}
            </View>
            {manage ? (
              <View style={styles.manageBtns}>
                <IconButton icon="chevronLeft" label={`Move ${e.name} up`} size={40} onPress={() => move(e, -1)} style={{ transform: [{ rotate: "90deg" }] }} />
                <IconButton icon="chevronRight" label={`Move ${e.name} down`} size={40} onPress={() => move(e, 1)} style={{ transform: [{ rotate: "90deg" }] }} />
              </View>
            ) : null}
          </View>
        </Tappable>
      </Animated.View>
    );
  };

  const renderWithChildren = (e: Envelope, i: number) => (
    <View key={e.id} style={{ gap: space.sm }}>
      {renderEnvelope(e, false, i)}
      {!query.trim() ? childEnvelopes(s, e.id).map((c) => renderEnvelope(c, true, i)) : null}
    </View>
  );

  return (
    <>
      <View style={{ flex: 1 }}>
        <Screen
          title="Envelopes"
          bottomInset={bottomInset + (all.length ? 64 : 0)}
          right={
            <View style={styles.headerBtns}>
              {canUndo ? <IconButton icon="repeat" label="Undo" size={40} onPress={() => { undo(); feedback("pop", "light"); }} style={{ transform: [{ scaleX: -1 }] }} /> : null}
              {all.length ? <IconButton icon="search" label="Search envelopes" size={40} onPress={() => { setSearching((v) => !v); setQuery(""); }} /> : null}
              <IconButton icon="plus" label="New envelope" tone="primary" size={40} onPress={() => setEditDraft({ mode: "add" })} />
            </View>
          }
        >
          {/* Period hero — the one figure this screen is about: left to spend. */}
          <PeriodHero
            totals={totals}
            currency={s.prefs.currency}
            label={periodLabel(period, s.prefs.period)}
            daysLeft={daysLeft}
            atNow={offset === 0}
            hasEnvelopes={all.length > 0}
            onPrev={() => setOffset((o) => o - 1)}
            onNext={() => setOffset((o) => o + 1)}
            onReset={() => setOffset(0)}
            onDeposit={() => openTxn({ mode: "add", type: "income" })}
          />

          {searching ? (
            <TextField label="" placeholder="Search envelopes" value={query} onChangeText={setQuery} autoFocus />
          ) : null}

          {booting ? (
            <View style={{ gap: space.sm }} accessible accessibilityLabel="Loading your envelopes">
              {Array.from({ length: 4 }).map((_, i) => (
                <View key={i} style={styles.row}>
                  <View style={styles.rowHead}>
                    <Skeleton width={44} height={44} round={radius.lg} />
                    <View style={{ flex: 1, gap: 8 }}>
                      <View style={styles.rowTop}>
                        <Skeleton width={120} height={14} />
                        <Skeleton width={56} height={14} />
                      </View>
                      <Skeleton width="100%" height={7} round={4} />
                      <Skeleton width={140} height={12} />
                    </View>
                  </View>
                </View>
              ))}
            </View>
          ) : all.length === 0 ? (
            <Card>
              <EmptyState
                art={art.empty_state_envelopes}
                title="Start in one tap"
                body="We'll set up Groceries, Fuel & Eating Out with budgets — then just tap + to log your first expense. Undo anytime."
                action={
                  <View style={{ gap: space.sm, alignSelf: "stretch" }}>
                    <Button label="Create Groceries, Fuel & Eating Out" icon="star" onPress={seedNow} />
                    <Button label="Build my own instead" variant="secondary" icon="plus" onPress={() => setEditDraft({ mode: "add" })} />
                  </View>
                }
              />
            </Card>
          ) : parents.length === 0 ? (
            <Card><EmptyState icon="search" title="No matches" body="No envelopes match your search." /></Card>
          ) : (
            <View style={{ gap: space.sm }}>
              <View style={styles.manageRow}>
                <Text style={type.caption}>{manage ? "Reorder with the arrows" : "Tap an envelope for details"}</Text>
                <Tappable label={manage ? "Done reordering" : "Reorder envelopes"} sound="pop" onPress={() => setManage((v) => !v)}>
                  <Text style={[type.label, { color: palette.primary }]}>{manage ? "Done" : "Reorder"}</Text>
                </Tappable>
              </View>

              {overList.length ? (
                <View style={{ gap: space.sm }}>
                  <View style={styles.overHeader}>
                    <Icon name="alert" size={15} color={palette.danger} />
                    <Text style={styles.overHeaderTxt}>Over budget · {overList.length}</Text>
                  </View>
                  {overList.map((e, i) => renderWithChildren(e, i))}
                </View>
              ) : null}

              {overList.length && okList.length ? <View style={styles.groupGap}><SectionHeader title="On track" /></View> : null}
              {okList.map((e, i) => renderWithChildren(e, i + overList.length))}
            </View>
          )}
        </Screen>

        {all.length && !searching ? (
          <Tappable
            label="Add expense"
            sound="pop"
            onPress={() => openTxn({ mode: "add", type: "expense" })}
            style={[styles.fab, { bottom: insets.bottom + TAB_BAR_HEIGHT + banner + space.md }]}
          >
            <Icon name="plus" size={22} color={palette.onPrimary} />
            <Text style={[type.button, { color: palette.onPrimary }]}>Add expense</Text>
          </Tappable>
        ) : null}
      </View>

      <EnvelopeEditorSheet draft={editDraft} period={period} onClose={() => setEditDraft(null)} />
      <EnvelopeDetailSheet
        id={detailId}
        period={period}
        onClose={() => setDetailId(null)}
        onAdd={(d) => { setDetailId(null); openTxn(d); }}
        onEditTxn={(id) => { setDetailId(null); openTxn({ mode: "edit", id }); }}
        onEditEnvelope={(id) => { setDetailId(null); setEditDraft({ mode: "edit", id }); }}
      />
    </>
  );
}

function PeriodHero({
  totals,
  currency,
  label,
  daysLeft,
  atNow,
  hasEnvelopes,
  onPrev,
  onNext,
  onReset,
  onDeposit,
}: {
  totals: { planned: number; spent: number; deposits: number; available: number; carryIn: number; carryOut: number };
  currency: string;
  label: string;
  daysLeft: number | null;
  atNow: boolean;
  hasEnvelopes: boolean;
  onPrev: () => void;
  onNext: () => void;
  onReset: () => void;
  onDeposit: () => void;
}) {
  const over = totals.available < 0;
  const usedFrac = totals.planned > 0 ? Math.max(0, totals.spent / totals.planned) : 0;
  const pctUsed = Math.round(usedFrac * 100);
  const daysLabel = daysLeft == null ? label : daysLeft === 0 ? "Last day of the period" : daysLeft === 1 ? "1 day left" : `${daysLeft} days left`;
  const statusTone: Tone = over ? "danger" : usedFrac >= 0.85 ? "warning" : "success";
  const statusLabel = over
    ? `Over by ${formatMoney(Math.abs(totals.available), currency)}`
    : usedFrac >= 0.85
      ? "Nearly spent"
      : "On track";

  const nav = (
    <View style={styles.heroTop}>
      <Tappable label="Previous period" sound="pop" onPress={onPrev} style={styles.heroNavBtn}>
        <Icon name="chevronLeft" size={18} color={palette.onGlass} />
      </Tappable>
      <Tappable label="Jump to current period" sound="pop" onPress={onReset} style={styles.periodChip}>
        <Icon name="calendar" size={14} color={palette.onGlass} />
        <Text style={[type.label, { color: palette.onGlass }]} numberOfLines={1}>{label}</Text>
      </Tappable>
      <Tappable label="Next period" sound="pop" onPress={onNext} style={styles.heroNavBtn}>
        <Icon name="chevronRight" size={18} color={palette.onGlass} />
      </Tappable>
    </View>
  );

  const ring = (
    <ProgressRing
      value={Math.min(1, usedFrac)}
      size={96}
      stroke={11}
      color={over ? "#FFFFFF" : palette.mint}
      track={palette.glassTrack}
      label={`${pctUsed}%`}
      sublabel="used"
      labelColor={palette.onPrimary}
      sublabelColor={palette.onGlassSoft}
    />
  );

  return (
    <HeroCard
      top={nav}
      overline={over ? "Overspent by" : "Left to spend"}
      value={formatMoney(Math.abs(totals.available), currency)}
      caption={`${daysLabel}${!atNow ? " · tap to return" : ""}`}
      status={{ label: statusLabel, tone: statusTone }}
      right={ring}
    >
      <View style={styles.heroStats}>
        <HeroStat label="Budgeted" minor={totals.planned} currency={currency} />
        <View style={styles.heroDivider} />
        <HeroStat label="Spent" minor={totals.spent} currency={currency} />
        {totals.deposits > 0 ? (
          <>
            <View style={styles.heroDivider} />
            <HeroStat label="Deposited" minor={totals.deposits} currency={currency} />
          </>
        ) : null}
      </View>

      {/* Rollover carry made explicit, so "available" never looks unexplained. */}
      {totals.carryIn !== 0 || totals.carryOut !== 0 ? (
        <View style={styles.heroCarry}>
          <HeroStat label="Carry in" minor={totals.carryIn} currency={currency} sign />
          <View style={styles.heroDivider} />
          <HeroStat label="Projected carry" minor={totals.carryOut} currency={currency} sign />
        </View>
      ) : null}

      {hasEnvelopes ? (
        <Tappable label="Add deposit" sound="pop" onPress={onDeposit} style={styles.heroCtaGhost}>
          <Icon name="arrowUp" size={18} color={palette.onPrimary} />
          <Text style={[type.button, { color: palette.onPrimary }]}>Deposit</Text>
        </Tappable>
      ) : null}
    </HeroCard>
  );
}

function HeroStat({ label, minor, currency, sign = false }: { label: string; minor: number; currency: string; sign?: boolean }) {
  return (
    <View style={{ flex: 1 }} accessible accessibilityLabel={`${label}: ${formatMoney(minor, currency, { sign })}`}>
      <Text style={[type.caption, { color: palette.onGlassSoft }]}>{label}</Text>
      <Money minor={minor} currency={currency} sign={sign} style={[type.bodyStrong, { color: palette.onGlass }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  headerBtns: { flexDirection: "row", alignItems: "center", gap: space.xs },
  heroTop: { flexDirection: "row", alignItems: "center", gap: space.sm, marginBottom: space.xs },
  heroNavBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: palette.glassFill, alignItems: "center", justifyContent: "center" },
  periodChip: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: palette.glassFill, borderRadius: radius.pill, paddingHorizontal: 12, height: 36 },
  barRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  heroStats: { flexDirection: "row", alignItems: "center", gap: space.md, marginTop: space.xs },
  heroCarry: { flexDirection: "row", alignItems: "center", gap: space.md, marginTop: space.sm, paddingTop: space.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.glassTrack },
  heroDivider: { width: StyleSheet.hairlineWidth, alignSelf: "stretch", backgroundColor: palette.glassTrack },
  heroCtaGhost: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 48, borderRadius: radius.md, borderWidth: 1.5, borderColor: palette.onGlassSoft },
  row: { backgroundColor: palette.surface, borderRadius: radius.lg, padding: space.lg, ...shadow },
  rowHead: { flexDirection: "row", alignItems: "center", gap: space.md },
  rowOver: { backgroundColor: palette.dangerSoft },
  rowFlash: { borderWidth: 1.5, borderColor: palette.success },
  flashBadge: {
    position: "absolute",
    top: -7,
    right: -7,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: palette.success,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: palette.surface,
    zIndex: 2,
    ...shadow,
  },
  rowAmountWrap: { flexDirection: "row", alignItems: "flex-end", gap: 4 },
  rowAmount: { fontFamily: type.number.fontFamily, fontSize: 18, lineHeight: 22, letterSpacing: -0.3, color: palette.ink, fontVariant: ["tabular-nums"] },
  rowLeftTag: { fontFamily: type.caption.fontFamily, fontSize: 11, lineHeight: 15, color: palette.inkMuted },
  rowMeta: { fontFamily: type.caption.fontFamily, fontSize: 13, lineHeight: 18, color: palette.inkMuted },
  rowMetaStrong: { fontFamily: type.label.fontFamily, color: palette.inkSoft },
  addFunds: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 5, backgroundColor: palette.surface, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, marginTop: 2 },
  addFundsTxt: { fontFamily: type.label.fontFamily, fontSize: 12, lineHeight: 15, color: palette.danger },
  child: { marginLeft: space.xl, backgroundColor: palette.surfaceAlt },
  rowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm },
  manageBtns: { gap: space.xs },
  manageRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: space.xs },
  overHeader: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: space.xs, marginTop: space.xs },
  overHeaderTxt: { fontFamily: type.label.fontFamily, fontSize: 13, lineHeight: 18, color: palette.danger, letterSpacing: 0.3, textTransform: "uppercase" },
  groupGap: { marginTop: space.xs },
  fab: {
    position: "absolute",
    right: space.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 52,
    paddingHorizontal: 20,
    borderRadius: radius.pill,
    backgroundColor: palette.primary,
    ...shadowStrong,
    shadowColor: palette.primaryDark,
    shadowOpacity: 0.3,
  },
});
