import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import {
  Button,
  EmptyState,
  Icon,
  Segmented,
  Sheet,
  Tappable,
  TextField,
  feedback,
  palette,
  radius,
  space,
  toast,
  type,
} from "../ui";
import { Money, accountError, accountTypeLabel } from "./kit";
import { mutate, today, undo, useBudget } from "../state";
import { activeAccounts } from "../core/model";
import type { AccountType } from "../core/model";
import { accountBalance, addAccount, canDeleteAccount, deleteAccount, editAccount } from "../core/accounts";
import { parseAmount, fromMinor, formatMoney } from "../core/money";
import { CURRENCIES } from "./kit";

const TYPE_ICON: Record<AccountType, "wallet" | "card" | "bank"> = {
  cash: "wallet",
  checking: "bank",
  savings: "bank",
  credit: "card",
};

type EditDraft = { mode: "add" } | { mode: "edit"; id: string } | null;

export function AccountsSheet({ visible, onClose, onTransfer }: { visible: boolean; onClose: () => void; onTransfer: () => void }) {
  const s = useBudget();
  const { height } = useWindowDimensions();
  const todayKey = today();
  const accts = activeAccounts(s);
  const [edit, setEdit] = useState<EditDraft>(null);

  return (
    <>
      <Sheet visible={visible} title="Accounts" onClose={onClose}>
        <ScrollView style={{ maxHeight: height * 0.5 }} contentContainerStyle={{ gap: space.sm }}>
          {accts.length === 0 ? (
            <EmptyState icon="wallet" title="No accounts yet" body="Add your first account — cash, checking or a card — to start tracking balances." />
          ) : null}
          {accts.map((a) => (
            <Tappable key={a.id} label={`${a.name}, ${accountTypeLabel[a.type]}`} onPress={() => setEdit({ mode: "edit", id: a.id })} scale={0.99} style={styles.row}>
              <View style={styles.iconWrap}><Icon name={TYPE_ICON[a.type]} size={20} color={palette.primary} /></View>
              <View style={{ flex: 1 }}>
                <Text style={type.bodyStrong} numberOfLines={1}>{a.name}</Text>
                <Text style={type.caption}>{accountTypeLabel[a.type]} · {a.currency}</Text>
              </View>
              <Money minor={accountBalance(s, a.id, todayKey)} currency={a.currency} style={[type.bodyStrong, { color: accountBalance(s, a.id, todayKey) < 0 ? palette.danger : palette.ink }]} />
            </Tappable>
          ))}
        </ScrollView>
        {accts.length >= 2 ? <Button label="Transfer between accounts" variant="secondary" icon="swap" onPress={() => { onClose(); onTransfer(); }} /> : null}
        <Button label="New account" size="lg" icon="plus" onPress={() => setEdit({ mode: "add" })} />
      </Sheet>
      <AccountEditorSheet draft={edit} onClose={() => setEdit(null)} />
    </>
  );
}

function AccountEditorSheet({ draft, onClose }: { draft: EditDraft; onClose: () => void }) {
  const s = useBudget();
  const acc = draft?.mode === "edit" ? s.accounts.find((a) => a.id === draft.id) ?? null : null;
  const [name, setName] = useState("");
  const [kind, setKind] = useState<AccountType>("cash");
  const [bal, setBal] = useState("");
  const [error, setError] = useState<string | null>(null);

  const key = draft ? (draft.mode === "edit" ? `e:${draft.id}` : "add") : "";
  useEffect(() => {
    if (!draft) return;
    setError(null);
    if (draft.mode === "edit" && acc) {
      setName(acc.name);
      setKind(acc.type);
      setBal(String(fromMinor(acc.startingBalance, acc.currency)));
    } else {
      setName("");
      setKind("cash");
      setBal("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const currency = acc?.currency ?? s.prefs.currency;
  const startingBalance = bal.trim() ? parseAmount(bal, currency) ?? 0 : 0;

  const save = () => {
    if (draft?.mode === "edit" && acc) {
      const res = editAccount(s, acc.id, { name, type: kind, startingBalance });
      if (res.error) { feedback("error", "light"); return setError(accountError[res.error]); }
      mutate(() => res.state);
      feedback("success", "success");
      toast("Account updated");
      return onClose();
    }
    const res = addAccount(s, { name, type: kind, startingBalance });
    if (res.error) { feedback("error", "light"); return setError(accountError[res.error]); }
    mutate(() => res.state);
    feedback("success", "success");
    toast("Account added");
    onClose();
  };

  const remove = () => {
    if (!acc) return;
    // Accounts with history are archived (kept out of harm's way), not hard-deleted.
    const archived = !canDeleteAccount(s, acc.id);
    mutate((st) => deleteAccount(st, acc.id));
    feedback("pop", "warning");
    onClose();
    toast(archived ? `Archived "${acc.name}" (it has transactions)` : `Removed "${acc.name}"`, { label: "Undo", onPress: undo });
  };

  return (
    <Sheet visible={!!draft} title={draft?.mode === "edit" ? "Edit account" : "New account"} onClose={onClose}>
      <TextField label="Name" placeholder="e.g. Cash, Checking" value={name} onChangeText={(t) => { setName(t); setError(null); }} maxLength={40} autoFocus={draft?.mode === "add"} />
      <View style={{ gap: 6 }}>
        <Text style={type.label}>Type</Text>
        <Segmented
          options={(["cash", "checking", "savings", "credit"] as AccountType[]).map((t) => ({ value: t, label: accountTypeLabel[t] }))}
          value={kind}
          onChange={setKind}
        />
      </View>
      <TextField label="Starting balance" placeholder="0" keyboardType="decimal-pad" value={bal} onChangeText={setBal} returnKeyType="done" helper={bal.trim() ? formatMoney(startingBalance, currency) : `${currency} · e.g. 100.50`} />
      {error ? <Text style={[type.caption, { color: palette.danger }]}>{error}</Text> : null}
      <Button label={draft?.mode === "edit" ? "Save account" : "Add account"} size="lg" icon="check" disabled={!name.trim()} onPress={save} />
      {draft?.mode === "edit" ? <Button label="Delete account" variant="danger" icon="trash" onPress={remove} /> : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.md, backgroundColor: palette.surfaceAlt, borderRadius: radius.md, padding: space.md, minHeight: 60 },
  iconWrap: { width: 38, height: 38, borderRadius: 10, backgroundColor: palette.primarySoft, alignItems: "center", justifyContent: "center" },
});
