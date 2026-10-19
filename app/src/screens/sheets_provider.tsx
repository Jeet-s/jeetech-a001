import { createContext, useContext, useMemo, useState } from "react";
import { SplitSheet, TransactionSheet, TransferSheet, type TxnDraft } from "./txn";
import type { Minor } from "../core/money";

/**
 * Host for the shared money sheets (add/edit transaction, split, transfer) so
 * any screen can open them through one imperative API — and the transaction
 * sheet's "Split" button can hand off to the split sheet cleanly.
 */
interface SheetsApi {
  openTxn: (draft: TxnDraft) => void;
  openTransfer: (fromId?: string) => void;
}

const Ctx = createContext<SheetsApi>({ openTxn: () => {}, openTransfer: () => {} });
export const useSheets = () => useContext(Ctx);

export function SheetsProvider({ children }: { children: React.ReactNode }) {
  const [txn, setTxn] = useState<TxnDraft | null>(null);
  const [split, setSplit] = useState<{ accountId: string; total: Minor; note: string } | null>(null);
  const [transfer, setTransfer] = useState<{ fromId?: string } | null>(null);

  const api = useMemo<SheetsApi>(
    () => ({ openTxn: setTxn, openTransfer: (fromId) => setTransfer({ fromId }) }),
    [],
  );

  return (
    <Ctx.Provider value={api}>
      {children}
      <TransactionSheet draft={txn} onClose={() => setTxn(null)} onSplit={(ctx) => { setTxn(null); setSplit(ctx); }} />
      <SplitSheet spec={split} onClose={() => setSplit(null)} />
      <TransferSheet visible={!!transfer} fromId={transfer?.fromId} onClose={() => setTransfer(null)} />
    </Ctx.Provider>
  );
}
