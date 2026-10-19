import { useState } from "react";
import { View } from "react-native";
import { EnvelopesScreen } from "./screens/EnvelopesScreen";
import { ReportsScreen } from "./screens/ReportsScreen";
import { RecurringScreen } from "./screens/RecurringScreen";
import { ProSheet } from "./screens/ProSheet";
import { TransactionSheet } from "./screens/txn";
import { EnvelopeDetailSheet } from "./screens/envelopes_sheets";
import { TAB_BAR_HEIGHT, TabBar, palette, type IconName } from "./ui";
import { budgetStore } from "./core/data";
import { store } from "./modules/store";
import { emptyState, activeAccounts, activeEnvelopes, type BudgetState } from "./core/model";
import { addAccount } from "./core/accounts";
import { addEnvelope } from "./core/envelopes";
import { addTransaction } from "./core/transactions";
import { addRecurring } from "./core/recurring";
import { setBudget } from "./core/budget";
import { setCurrency } from "./core/prefs";
import { dateKey, addDays, periodFor } from "./core/dates";
import { toMinor } from "./core/money";

/**
 * Screenshot mode: the factory opens <scheme>://shot/<id> on an emulator and
 * captures the real screens with realistic, weeks-in data (never an empty app).
 */
const noop = () => {};

function seed(): BudgetState {
  const t = dateKey(new Date());
  const iso = (daysAgo: number) => `${addDays(t, -daysAgo)}T12:00:00.000`;
  let st = setCurrency(emptyState(), "USD");
  st = addAccount(st, { name: "Cash", type: "cash", startingBalance: toMinor(210, "USD") }).state;
  st = addAccount(st, { name: "Checking", type: "checking", startingBalance: toMinor(1875, "USD") }).state;

  const defs = [
    { name: "Groceries", icon: "cart", color: "#10B981", planned: 520, rollover: true },
    { name: "Eating Out", icon: "food", color: "#EF4444", planned: 160, rollover: true },
    { name: "Fuel", icon: "fuel", color: "#F59E0B", planned: 150, rollover: false },
    { name: "Transport", icon: "car", color: "#3B82F6", planned: 90, rollover: false },
    { name: "Fun", icon: "star", color: "#8B5CF6", planned: 120, rollover: true },
    { name: "Home", icon: "home", color: "#14B8A6", planned: 1200, rollover: false },
  ];
  const period = periodFor(t, st.prefs.period);
  for (const d of defs) {
    const r = addEnvelope(st, { name: d.name, icon: d.icon, color: d.color, rolloverEnabled: d.rollover });
    st = r.state;
    if (r.id) st = setBudget(st, r.id, period, toMinor(d.planned, "USD"));
  }

  const cash = activeAccounts(st)[0].id;
  const checking = activeAccounts(st)[1].id;
  const envId = (name: string) => activeEnvelopes(st).find((e) => e.name === name)!.id;
  const spend = (name: string, amount: number, daysAgo: number, note: string, acct = cash) => {
    st = addTransaction(st, { type: "expense", amount: toMinor(amount, "USD"), accountId: acct, envelopeId: envId(name), note }, iso(daysAgo)).state;
  };

  // A few weeks of realistic activity, weighted to the recent days so every
  // envelope reads as comfortably mid-period (≈50-65% spent) in the screenshots.
  spend("Groceries", 62.4, 14, "Weekly shop");
  spend("Groceries", 48.1, 12, "Market", checking);
  spend("Groceries", 28.1, 9, "Corner store");
  spend("Groceries", 71.5, 6, "Big shop", checking);
  spend("Groceries", 39.8, 2, "Produce run");
  spend("Eating Out", 24.5, 13, "Lunch");
  spend("Eating Out", 18.0, 10, "Coffee & cake");
  spend("Eating Out", 38.0, 5, "Dinner out", checking);
  spend("Eating Out", 22.5, 1, "Takeout");
  spend("Fuel", 46.2, 11, "Gas");
  spend("Fuel", 44.8, 3, "Gas", checking);
  spend("Transport", 12.5, 12, "Bus pass");
  spend("Transport", 24.0, 7, "Rideshare");
  spend("Transport", 18.0, 2, "Parking");
  spend("Fun", 29.99, 8, "Concert tickets", checking);
  spend("Fun", 15.0, 4, "Books");
  spend("Fun", 32.0, 1, "Game night");
  spend("Home", 68.0, 9, "Utilities", checking);
  spend("Home", 42.5, 3, "Household", checking);
  st = addTransaction(st, { type: "income", amount: toMinor(2400, "USD"), accountId: checking, envelopeId: null, note: "Paycheck" }, iso(12)).state;

  st = addRecurring(st, { name: "Rent", schedule: { kind: "monthly", startDate: `${t.slice(0, 8)}01`, params: { day: 1 } }, template: { type: "expense", amount: toMinor(1200, "USD"), envelopeId: envId("Home"), accountId: checking } }, iso(0)).state;
  st = addRecurring(st, { name: "Paycheck", schedule: { kind: "biweekly", startDate: addDays(t, -2), params: {} }, template: { type: "income", amount: toMinor(2400, "USD"), envelopeId: null, accountId: checking } }, iso(0)).state;
  st = addRecurring(st, { name: "Phone bill", schedule: { kind: "monthly", startDate: `${t.slice(0, 8)}18`, params: { day: 18 } }, template: { type: "expense", amount: toMinor(45, "USD"), envelopeId: envId("Home"), accountId: checking } }, iso(0)).state;

  return { ...st, onboarded: true };
}

function Tabs({ active }: { active: string }) {
  const tabs: { id: string; label: string; icon: IconName }[] = [
    { id: "envelopes", label: "Envelopes", icon: "envelope" },
    { id: "transactions", label: "Activity", icon: "list" },
    { id: "reports", label: "Reports", icon: "chart" },
    { id: "recurring", label: "Recurring", icon: "repeat" },
    { id: "settings", label: "Settings", icon: "settings" },
  ];
  return <TabBar tabs={tabs} active={active} onChange={noop} />;
}

export function ScreenshotScene({ id }: { id: string }) {
  useState(() => {
    // The paywall scene renders pre-purchase; everything else shows a Pro, ad-free user.
    const owned = id !== "pro";
    store.set({ onboarded: true, pro: owned, adsRemoved: owned, sessions: 30 });
    budgetStore.set(seed());
    return true;
  });
  const root = { flex: 1, backgroundColor: palette.bg };
  const data = budgetStore.get();
  const period = periodFor(dateKey(new Date()), data.prefs.period);
  const groceries = activeEnvelopes(data).find((e) => e.name === "Groceries")?.id ?? null;

  switch (id) {
    case "reports":
      return (
        <View style={root}>
          <ReportsScreen bottomInset={TAB_BAR_HEIGHT} onPro={noop} />
          <Tabs active="reports" />
        </View>
      );
    case "recurring":
      return (
        <View style={root}>
          <RecurringScreen bottomInset={TAB_BAR_HEIGHT} onPro={noop} />
          <Tabs active="recurring" />
        </View>
      );
    case "add":
      return (
        <View style={root}>
          <EnvelopesScreen bottomInset={TAB_BAR_HEIGHT} onPro={noop} />
          <Tabs active="envelopes" />
          <TransactionSheet draft={{ mode: "add", type: "expense", envelopeId: groceries, amount: 23.45 }} onClose={noop} onSplit={noop} />
        </View>
      );
    case "detail":
      return (
        <View style={root}>
          <EnvelopesScreen bottomInset={TAB_BAR_HEIGHT} onPro={noop} />
          <Tabs active="envelopes" />
          <EnvelopeDetailSheet id={groceries} period={period} onClose={noop} onAdd={noop} onEditTxn={noop} onEditEnvelope={noop} />
        </View>
      );
    case "pro":
      return (
        <View style={root}>
          <EnvelopesScreen bottomInset={TAB_BAR_HEIGHT} onPro={noop} />
          <Tabs active="envelopes" />
          <ProSheet visible from="screenshot" onClose={noop} />
        </View>
      );
    case "envelopes":
    default:
      return (
        <View style={root}>
          <EnvelopesScreen bottomInset={TAB_BAR_HEIGHT} onPro={noop} />
          <Tabs active="envelopes" />
        </View>
      );
  }
}
