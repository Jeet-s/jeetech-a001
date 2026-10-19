import { useEffect, useState } from "react";
import { Alert, ScrollView, Share, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import {
  Button,
  Card,
  Icon,
  ListItem,
  Screen,
  SectionHeader,
  Segmented,
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
import { CURRENCIES, OptionChips } from "./kit";
import { AccountsSheet } from "./accounts_sheets";
import { useSheets } from "./sheets_provider";
import { PinSheet } from "./security";
import { mutate, resetHistory, today, useBudget } from "../state";
import { budgetStore } from "../core/data";
import { store, useSettings } from "../modules/store";
import { iap } from "../modules/iap";
import { analytics } from "../modules/analytics";
import { activeAccounts, accountById } from "../core/model";
import {
  disableLock,
  setCurrency,
  setDefaultAccount,
  setLockTimeout,
  setMonthlyPeriod,
  setCustomPeriod,
} from "../core/prefs";
import type { PeriodPattern } from "../core/dates";
import { addDays, MONTHS, WEEKDAY } from "../core/dates";
import { exportCsv, exportSummary, importCsvText } from "../core/csv";
import product from "../../product.json";

const PATTERN_LABEL: Record<PeriodPattern, string> = {
  monthly: "Monthly",
  semiMonthly: "Twice a month",
  biweekly: "Every 2 weeks",
  weekly: "Weekly",
  nDays: "Every N days",
};

export function SettingsScreen({ bottomInset, onPro }: { bottomInset: number; onPro: (from: string) => void }) {
  const s = useBudget();
  const settings = useSettings();
  const { openTransfer } = useSheets();
  const [sheet, setSheet] = useState<null | "currency" | "period" | "default" | "accounts" | "import" | "privacy" | "pin">(null);

  const periodLabel = s.prefs.period.type === "monthly" ? "Monthly" : PATTERN_LABEL[s.prefs.period.pattern ?? "monthly"];
  const defAcc = accountById(s, s.prefs.defaultAccountId);

  const exportNow = async () => {
    feedback("tap", "light");
    const summary = exportSummary(s);
    analytics.track("export_csv");
    try {
      await Share.share({ message: exportCsv(s), title: `Envelope Mini — ${summary.transactions} transactions` });
    } catch { /* dismissed */ }
  };

  const enableLock = () => {
    analytics.track("lock_enable");
    setSheet("pin");
  };
  const disableLockNow = () => {
    Alert.alert("Turn off app lock?", "You won't need a PIN to open the app.", [
      { text: "Cancel", style: "cancel" },
      { text: "Turn off", style: "destructive", onPress: () => { mutate((st) => disableLock(st)); feedback("pop", "light"); toast("App lock off"); } },
    ]);
  };

  const deleteAll = () => {
    Alert.alert("Delete all data?", "This permanently removes every envelope, account and transaction from this phone. It can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete everything",
        style: "destructive",
        onPress: () => {
          budgetStore.reset();
          resetHistory();
          store.set({ onboarded: false });
          feedback("pop", "warning");
          toast("All data deleted");
        },
      },
    ]);
  };

  return (
    <>
      <Screen title="Settings" bottomInset={bottomInset}>
        {/* Pro */}
        <Card padded={false} style={styles.card}>
          {settings.pro ? (
            <ListItem icon="star" iconTint={palette.accent} title="Pro unlocked" subtitle="Thanks for supporting an ad-free, offline app!" />
          ) : (
            <ListItem icon="star" iconTint={palette.accent} title="Upgrade to Pro" subtitle="Advanced reports, bulk edit, multiple books" onPress={() => onPro("settings")} />
          )}
        </Card>

        <SectionHeader title="Budgeting" />
        <Card padded={false} style={styles.card}>
          <ListItem icon="wallet" title="Currency" value={s.prefs.currency} onPress={() => setSheet("currency")} />
          <ListItem icon="calendar" title="Budget period" value={periodLabel} onPress={() => setSheet("period")} />
          <ListItem icon="bank" title="Accounts" value={`${activeAccounts(s).length}`} onPress={() => setSheet("accounts")} />
          <ListItem icon="card" title="Default account" value={defAcc?.name ?? "First account"} onPress={() => setSheet("default")} />
        </Card>

        <SectionHeader title="Security" />
        <Card padded={false} style={styles.card}>
          <Toggle
            label="App lock"
            description="Require a PIN to open the app"
            value={s.prefs.security.pinEnabled}
            onChange={(v) => (v ? enableLock() : disableLockNow())}
          />
          {s.prefs.security.pinEnabled ? (
            <>
              <ListItem icon="lock" title="Change PIN" onPress={() => setSheet("pin")} />
              <View style={{ paddingVertical: space.sm, gap: 6 }}>
                <Text style={type.label}>Lock after</Text>
                <Segmented
                  options={[
                    { value: "0", label: "Immediately" },
                    { value: "60", label: "1 min" },
                    { value: "300", label: "5 min" },
                  ]}
                  value={String(s.prefs.security.lockTimeoutSec >= 300 ? 300 : s.prefs.security.lockTimeoutSec >= 60 ? 60 : 0)}
                  onChange={(v) => mutate((st) => setLockTimeout(st, Number(v)))}
                />
              </View>
            </>
          ) : null}
        </Card>

        <SectionHeader title="Feedback" />
        <Card padded={false} style={styles.card}>
          <Toggle label="Haptics" description="A gentle tap on every action" value={settings.haptics !== false} onChange={(v) => store.set({ haptics: v })} />
          <Toggle label="Sounds" description="Subtle confirmation sounds" value={settings.sound === true} onChange={(v) => store.set({ sound: v })} />
        </Card>

        <SectionHeader title="Your data" />
        <Card padded={false} style={styles.card}>
          <ListItem icon="download" title="Export data (CSV)" subtitle="Share a backup of every transaction" onPress={exportNow} />
          <ListItem icon="upload" title="Import from CSV" subtitle="Paste a CSV to bring data in" onPress={() => { analytics.track("import_start"); setSheet("import"); }} />
          <ListItem icon="trash" title="Delete all data" destructive onPress={deleteAll} />
        </Card>

        <SectionHeader title="Purchases" />
        <Card padded={false} style={styles.card}>
          <ListItem icon="repeat" title="Restore purchases" onPress={async () => { const n = await iap.restore().catch(() => 0); toast(n ? "Purchases restored" : "No purchases found"); }} />
          {!settings.adsRemoved && !settings.pro ? <ListItem icon="close" title="Remove ads" onPress={() => onPro("settings_remove_ads")} /> : null}
          <ListItem icon="shield" title="Privacy" subtitle="Offline-first — no account, no tracking" onPress={() => setSheet("privacy")} />
        </Card>

        <View style={{ alignItems: "center", gap: 2, marginTop: space.sm }}>
          <Text style={type.caption}>Envelope Mini</Text>
          <Text style={type.caption}>Your data never leaves this phone.</Text>
        </View>
      </Screen>

      <CurrencySheet visible={sheet === "currency"} current={s.prefs.currency} onClose={() => setSheet(null)} onPick={(c) => { mutate((st) => setCurrency(st, c)); feedback("pop", "select"); setSheet(null); }} />
      <PeriodSheet visible={sheet === "period"} onClose={() => setSheet(null)} />
      <DefaultAccountSheet visible={sheet === "default"} onClose={() => setSheet(null)} />
      <AccountsSheet visible={sheet === "accounts"} onClose={() => setSheet(null)} onTransfer={() => { setSheet(null); openTransfer(); }} />
      <ImportSheet visible={sheet === "import"} onClose={() => setSheet(null)} />
      <PinSheet visible={sheet === "pin"} onClose={() => setSheet(null)} />
      <Sheet visible={sheet === "privacy"} title="Privacy" onClose={() => setSheet(null)}>
        <Text style={[type.body, { color: palette.inkSoft }]}>
          Envelope Mini is offline-first. All of your budgets, accounts and transactions stay on this device — there's no
          account to create, nothing is uploaded, and there are no bank connections or trackers. Export a CSV any time to
          keep your own backup.
        </Text>
        <Button label="Got it" onPress={() => setSheet(null)} />
      </Sheet>
    </>
  );
}

function CurrencySheet({ visible, current, onClose, onPick }: { visible: boolean; current: string; onClose: () => void; onPick: (c: string) => void }) {
  const { height } = useWindowDimensions();
  return (
    <Sheet visible={visible} title="Currency" onClose={onClose}>
      <ScrollView style={{ maxHeight: height * 0.5 }}>
        {CURRENCIES.map((c) => (
          <Tappable key={c} label={c} onPress={() => onPick(c)} scale={0.99} style={styles.pickRow}>
            <Text style={[type.bodyStrong, { flex: 1 }]}>{c}</Text>
            {c === current ? <Icon name="check" size={20} color={palette.primary} /> : null}
          </Tappable>
        ))}
      </ScrollView>
    </Sheet>
  );
}

function PeriodSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const s = useBudget();
  const todayKey = today();
  const [mode, setMode] = useState<"monthly" | "custom">(s.prefs.period.type);
  const [pattern, setPattern] = useState<PeriodPattern>(s.prefs.period.pattern && s.prefs.period.pattern !== "monthly" ? s.prefs.period.pattern : "biweekly");
  const [start, setStart] = useState(s.prefs.period.startDate ?? todayKey);
  const [n, setN] = useState(String(s.prefs.period.n ?? 10));

  // Re-sync the form to saved prefs each time the sheet opens (discard a prior cancel).
  useEffect(() => {
    if (!visible) return;
    setMode(s.prefs.period.type);
    setPattern(s.prefs.period.pattern && s.prefs.period.pattern !== "monthly" ? s.prefs.period.pattern : "biweekly");
    setStart(s.prefs.period.startDate ?? todayKey);
    setN(String(s.prefs.period.n ?? 10));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const apply = () => {
    if (mode === "monthly") {
      mutate((st) => setMonthlyPeriod(st));
    } else {
      mutate((st) => setCustomPeriod(st, pattern, start, pattern === "nDays" ? Math.max(1, Number(n) || 1) : undefined));
      if (pattern === "biweekly") analytics.track("period_type_biweekly");
    }
    analytics.track("period_change");
    feedback("success", "success");
    onClose();
  };

  const fmt = (day: string) => { const [, m, d] = day.split("-").map(Number); return `${WEEKDAY[new Date(day + "T12:00").getDay()]} ${MONTHS[m - 1]} ${d}`; };

  return (
    <Sheet visible={visible} title="Budget period" onClose={onClose}>
      <Segmented options={[{ value: "monthly", label: "Monthly" }, { value: "custom", label: "Paycheck cycle" }]} value={mode} onChange={setMode} />
      {mode === "custom" ? (
        <>
          <Text style={type.label}>Cycle</Text>
          <OptionChips
            options={(["semiMonthly", "biweekly", "weekly", "nDays"] as PeriodPattern[]).map((p) => ({ value: p, label: PATTERN_LABEL[p] }))}
            value={pattern}
            onChange={setPattern}
          />
          {pattern === "nDays" ? <TextField label="Days per cycle" keyboardType="number-pad" value={n} onChangeText={setN} /> : null}
          {pattern !== "semiMonthly" ? (
            <View style={styles.dateRow}>
              <Text style={[type.label, { flex: 1 }]}>Starts</Text>
              <Button label="−7d" variant="ghost" size="sm" sound="pop" onPress={() => setStart(addDays(start, -7))} />
              <Text style={[type.bodyStrong, { minWidth: 96, textAlign: "center" }]}>{fmt(start)}</Text>
              <Button label="+7d" variant="ghost" size="sm" sound="pop" onPress={() => setStart(addDays(start, 7))} />
            </View>
          ) : null}
          <Text style={type.caption}>Switching the cycle only changes how periods are shown — your transactions are never altered.</Text>
        </>
      ) : (
        <Text style={[type.body, { color: palette.inkSoft }]}>Budgets and reports follow calendar months.</Text>
      )}
      <Button label="Save period" size="lg" icon="check" onPress={apply} />
    </Sheet>
  );
}

function DefaultAccountSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const s = useBudget();
  const accts = activeAccounts(s);
  return (
    <Sheet visible={visible} title="Default account" onClose={onClose}>
      <Text style={[type.body, { color: palette.inkSoft }]}>New transactions start with this account.</Text>
      <OptionChips
        options={accts.map((a) => ({ value: a.id, label: a.name }))}
        value={s.prefs.defaultAccountId}
        onChange={(id) => { mutate((st) => setDefaultAccount(st, id)); analytics.track("settings_change_default_account"); feedback("pop", "select"); onClose(); }}
      />
    </Sheet>
  );
}

function ImportSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const s = useBudget();
  const todayKey = today();
  const [text, setText] = useState("");

  useEffect(() => { if (visible) setText(""); }, [visible]);

  const run = () => {
    if (!text.trim()) return;
    const res = importCsvText(s, text, `${todayKey}T12:00:00.000`, s.prefs.currency);
    mutate(() => res.state);
    analytics.track("import_complete", { imported: res.imported, skipped: res.skipped });
    feedback(res.imported ? "success" : "error", res.imported ? "success" : "warning");
    onClose();
    setText("");
    toast(res.imported ? `Imported ${res.imported}${res.skipped ? `, skipped ${res.skipped}` : ""}` : "Nothing to import");
  };

  return (
    <Sheet visible={visible} title="Import from CSV" onClose={onClose}>
      <Text style={[type.caption]}>Paste a CSV with a header row (Date, Type, Amount, Account, Envelope, Note). Common column names are recognised automatically.</Text>
      <TextField label="CSV text" placeholder={"Date,Type,Amount,Account,Envelope\n2026-03-01,expense,23.45,Cash,Groceries"} value={text} onChangeText={setText} multiline numberOfLines={6} style={{ height: 130, textAlignVertical: "top", paddingTop: space.sm }} />
      <Button label="Import" size="lg" icon="upload" disabled={!text.trim()} onPress={run} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  card: { paddingHorizontal: space.lg },
  pickRow: { flexDirection: "row", alignItems: "center", minHeight: 48, paddingVertical: space.sm },
  dateRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
});
