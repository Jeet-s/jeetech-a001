import { useMemo, useState } from "react";
import { Alert, FlatList, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import {
  Button,
  Card,
  EmptyState,
  Icon,
  IconButton,
  Screen,
  Segmented,
  Sheet,
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
} from "../ui";
import { EnvelopeGlyph, Money, OptionChips } from "./kit";
import { art } from "../art";
import { useSheets } from "./sheets_provider";
import { useBannerHeight } from "../modules/layout";
import { mutate, undo, redo, useBudget, useUndo } from "../state";
import { canUse } from "../core/prefs";
import { useSettings } from "../modules/store";
import { accountById, activeAccounts, activeEnvelopes, envelopeById, type Transaction, type TxnType } from "../core/model";
import { bulkDelete, bulkEdit, queryTransactions } from "../core/transactions";
import { formatMoney } from "../core/money";
import { MONTHS } from "../core/dates";

const txnTypeWord: Record<TxnType, string> = { expense: "expense", income: "deposit", transfer: "transfer" };

type TypeFilter = "all" | TxnType;

function fmtDate(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}

export function TransactionsScreen({ bottomInset, onPro }: { bottomInset: number; onPro: (from: string) => void }) {
  const s = useBudget();
  const settings = useSettings();
  const { openTxn } = useSheets();
  const { canUndo, canRedo } = useUndo();
  const insets = useSafeAreaInsets();
  const banner = useBannerHeight();

  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [text, setText] = useState("");
  const [accountId, setAccountId] = useState<string>("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const results = useMemo(
    () =>
      queryTransactions(s, {
        text: text || undefined,
        types: typeFilter === "all" ? undefined : [typeFilter],
        accountId: accountId || undefined,
      }),
    [s, text, typeFilter, accountId],
  );

  const selecting = selected.size > 0;
  const toggleSelect = (id: string) => {
    feedback("pop", "select");
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const clearSel = () => setSelected(new Set());

  const removeSelected = () => {
    const ids = [...selected];
    const doDelete = () => {
      mutate((st) => bulkDelete(st, ids));
      clearSel();
      feedback("pop", "warning");
      toast(`Deleted ${ids.length}`, { label: "Undo", onPress: undo });
    };
    Alert.alert(
      `Delete ${ids.length} transaction${ids.length > 1 ? "s" : ""}?`,
      "You can undo this right after from the toast.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: doDelete },
      ],
    );
  };

  const moveSelected = (envelopeId: string) => {
    const ids = [...selected];
    const res = bulkEdit(s, ids, { envelopeId }, new Date().toISOString());
    mutate(() => res.state);
    setMoveOpen(false);
    clearSel();
    feedback("success", "success");
    toast(`Moved ${res.changed}`, { label: "Undo", onPress: undo });
  };

  const onMovePress = () => {
    if (!canUse("bulk_edit", settings.pro)) return onPro("bulk_edit");
    setMoveOpen(true);
  };

  const renderItem = ({ item: t }: { item: Transaction }) => {
    const env = envelopeById(s, t.envelopeId);
    const acc = accountById(s, t.accountId);
    const isSel = selected.has(t.id);
    const title = t.note || (t.type === "transfer" ? `Transfer → ${accountById(s, t.accountIdTo)?.name ?? ""}` : env?.name ?? (t.type === "income" ? "Deposit" : "Expense"));
    const sub = `${acc?.name ?? ""} · ${fmtDate(t.date)}`;
    const tone = t.type === "income" ? palette.success : t.type === "transfer" ? palette.inkMuted : palette.ink;
    return (
      <Tappable
        label={`${title}, ${txnTypeWord[t.type]} ${formatMoney(t.amount, t.currency)}, ${sub}${isSel ? ", selected" : ""}`}
        onPress={() => (selecting ? toggleSelect(t.id) : openTxn({ mode: "edit", id: t.id }))}
        onLongPress={() => toggleSelect(t.id)}
        scale={0.995}
        style={[styles.row, isSel && styles.rowSel]}
      >
        {t.type === "transfer" ? (
          <View style={[styles.glyph, { backgroundColor: palette.surfaceAlt }]}><Icon name="swap" size={20} color={palette.inkSoft} /></View>
        ) : env ? (
          <EnvelopeGlyph icon={env.icon} color={env.color} size={42} />
        ) : (
          <View style={[styles.glyph, { backgroundColor: palette.successSoft }]}><Icon name="arrowUp" size={20} color={palette.success} /></View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={type.bodyStrong} numberOfLines={1}>{title}</Text>
          <Text style={type.caption} numberOfLines={1}>{sub}</Text>
        </View>
        {isSel ? (
          <View style={styles.checkOn}><Icon name="check" size={18} color="#fff" /></View>
        ) : (
          <Money minor={t.amount} currency={t.currency} style={[type.bodyStrong, { color: tone }]} />
        )}
      </Tappable>
    );
  };

  const header = (
    <View style={{ gap: space.md, paddingBottom: space.sm }}>
      <Segmented
        options={[
          { value: "all", label: "All" },
          { value: "expense", label: "Expense" },
          { value: "income", label: "Deposit" },
          { value: "transfer", label: "Transfer" },
        ]}
        value={typeFilter}
        onChange={setTypeFilter}
      />
      <TextField label="" placeholder="Search notes" value={text} onChangeText={setText} returnKeyType="search" autoCorrect={false} autoCapitalize="none" clearButtonMode="while-editing" />
      {accountId ? (
        <Tappable label="Clear account filter" sound="pop" onPress={() => setAccountId("")} style={styles.activeFilter}>
          <Icon name="filter" size={16} color={palette.primary} />
          <Text style={[type.label, { color: palette.primary, flex: 1 }]}>Account: {accountById(s, accountId)?.name}</Text>
          <Icon name="close" size={16} color={palette.primary} />
        </Tappable>
      ) : null}
    </View>
  );

  return (
    <>
      <Screen
        title="Transactions"
        scroll={false}
        bottomInset={bottomInset}
        right={
          <View style={styles.headerBtns}>
            <IconButton icon="repeat" label="Undo" size={40} disabled={!canUndo} onPress={undo} style={{ transform: [{ scaleX: -1 }] }} />
            <IconButton icon="repeat" label="Redo" size={40} disabled={!canRedo} onPress={redo} />
            {activeAccounts(s).length > 1 ? <IconButton icon="filter" label="Filter" size={40} onPress={() => setFilterOpen(true)} /> : null}
          </View>
        }
      >
        {results.length === 0 ? (
          <>
            {header}
            <Card>
              {s.transactions.some((t) => !t.deleted) ? (
                <EmptyState icon="search" title="No matching transactions" body="Try a different filter or search." />
              ) : (
                <EmptyState art={art.empty_state_transactions} title="No transactions yet" body="Add your first expense from the Envelopes tab." />
              )}
            </Card>
          </>
        ) : (
          <FlatList
            style={{ flex: 1 }}
            data={results}
            keyExtractor={(t) => t.id}
            renderItem={renderItem}
            ListHeaderComponent={header}
            ItemSeparatorComponent={() => <View style={{ height: space.sm }} />}
            contentContainerStyle={{ paddingBottom: bottomInset + 80 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            windowSize={11}
            removeClippedSubviews
          />
        )}
      </Screen>

      {selecting ? (
        <Animated.View entering={FadeInDown.duration(160)} style={[styles.selBar, { bottom: bottomInset + insets.bottom + banner + 12 }]}>
          <Tappable label="Clear selection" sound="pop" onPress={clearSel} style={styles.selClose}><Icon name="close" size={20} color={palette.onPrimary} /></Tappable>
          <Text style={[type.bodyStrong, { color: palette.onPrimary, flex: 1 }]}>{selected.size} selected</Text>
          <Button label="Move" variant="secondary" size="sm" icon="envelope" onPress={onMovePress} />
          <Button label="Delete" variant="danger" size="sm" icon="trash" onPress={removeSelected} />
        </Animated.View>
      ) : null}

      <Sheet visible={filterOpen} title="Filter by account" onClose={() => setFilterOpen(false)}>
        <OptionChips
          options={[{ value: "", label: "All accounts" }, ...activeAccounts(s).map((a) => ({ value: a.id, label: a.name }))]}
          value={accountId}
          onChange={(v) => { setAccountId(v); setFilterOpen(false); }}
        />
      </Sheet>

      <Sheet visible={moveOpen} title="Move to envelope" onClose={() => setMoveOpen(false)}>
        <OptionChips options={activeEnvelopes(s).map((e) => ({ value: e.id, label: e.name, color: e.color }))} value={null} onChange={moveSelected} />
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  headerBtns: { flexDirection: "row", alignItems: "center", gap: space.xs },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, backgroundColor: palette.surface, borderRadius: radius.lg, padding: space.md, minHeight: 64, ...shadow },
  rowSel: { borderWidth: 1.5, borderColor: palette.primary },
  glyph: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  checkOn: { width: 28, height: 28, borderRadius: 14, backgroundColor: palette.primary, alignItems: "center", justifyContent: "center" },
  activeFilter: { flexDirection: "row", alignItems: "center", gap: space.sm, backgroundColor: palette.primarySoft, borderRadius: radius.md, paddingHorizontal: space.md, minHeight: 40 },
  selBar: { position: "absolute", left: space.lg, right: space.lg, flexDirection: "row", alignItems: "center", gap: space.sm, backgroundColor: palette.ink, borderRadius: radius.lg, padding: space.sm, paddingLeft: space.md, ...shadowStrong },
  selClose: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
});
