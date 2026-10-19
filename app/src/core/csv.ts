/**
 * Forgiving, on-device CSV import/export that round-trips: export your data,
 * wipe the app, re-import, and every total, envelope and account comes back.
 * No server — the UI just hands the string to a file/share module. Amounts are
 * written in major units with a configurable decimal mark (locale-aware), and
 * the importer maps common headers and reports bad rows instead of failing the
 * whole file.
 */
import {
  type BudgetState,
  type TxnType,
  activeAccounts,
  activeEnvelopes,
  envelopeById,
  accountById,
  liveTxns,
} from "./model";
import { addAccount } from "./accounts";
import { addEnvelope } from "./envelopes";
import { addTransaction, addTransfer, addLabel } from "./transactions";
import { dayOf, type DateKey, type ISODateTime } from "./dates";
import { formatMoney, parseAmount, type Minor } from "./money";

export const CSV_COLUMNS = ["Date", "Type", "Amount", "Account", "To Account", "Envelope", "Note", "Labels", "Currency"] as const;
export type CsvColumn = (typeof CSV_COLUMNS)[number];

function escape(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export interface ExportOptions {
  from?: DateKey;
  to?: DateKey;
  columns?: CsvColumn[];
  accountId?: string;
  decimal?: "." | ",";
}

export function exportCsv(s: BudgetState, opts: ExportOptions = {}): string {
  const columns = opts.columns ?? [...CSV_COLUMNS];
  const decimal = opts.decimal ?? ".";
  const labelName = (id: string) => s.labels.find((l) => l.id === id)?.name ?? "";
  const rows = liveTxns(s)
    .filter((t) => {
      const d = dayOf(t.date);
      if (opts.from && d < opts.from) return false;
      if (opts.to && d > opts.to) return false;
      if (opts.accountId && t.accountId !== opts.accountId && t.accountIdTo !== opts.accountId) return false;
      return true;
    })
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const cell = (t: (typeof rows)[number], col: CsvColumn): string => {
    switch (col) {
      case "Date":
        return dayOf(t.date);
      case "Type":
        return t.type;
      case "Amount": {
        const major = formatMoney(t.amount, t.currency, { symbol: false, grouping: false });
        return decimal === "," ? major.replace(".", ",") : major;
      }
      case "Account":
        return accountById(s, t.accountId)?.name ?? "";
      case "To Account":
        return accountById(s, t.accountIdTo)?.name ?? "";
      case "Envelope":
        return envelopeById(s, t.envelopeId)?.name ?? "";
      case "Note":
        return t.note;
      case "Labels":
        return t.labels.map(labelName).filter(Boolean).join("|");
      case "Currency":
        return t.currency;
    }
  };

  const lines = [columns.join(",")];
  for (const t of rows) lines.push(columns.map((c) => escape(cell(t, c))).join(","));
  return lines.join("\n");
}

// ─────────────────────────────── parsing ───────────────────────────────────

/** RFC-4180-ish CSV parse: quoted fields, escaped quotes, CRLF tolerant. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

export type Mapping = Partial<Record<CsvColumn, number>>;

const HEADER_ALIASES: Record<CsvColumn, string[]> = {
  Date: ["date", "day", "posted", "transaction date"],
  Type: ["type", "kind"],
  Amount: ["amount", "value", "sum", "total"],
  Account: ["account", "from account", "from"],
  "To Account": ["to account", "to", "destination", "transfer to"],
  Envelope: ["envelope", "category", "categories", "bucket"],
  Note: ["note", "notes", "memo", "description", "payee"],
  Labels: ["labels", "tags", "label", "tag"],
  Currency: ["currency", "ccy"],
};

/** Auto-map a header row to our columns by common aliases. */
export function detectMapping(header: string[]): Mapping {
  const norm = header.map((h) => h.trim().toLowerCase());
  const mapping: Mapping = {};
  for (const col of CSV_COLUMNS) {
    const idx = norm.findIndex((h) => HEADER_ALIASES[col].includes(h));
    if (idx >= 0) mapping[col] = idx;
  }
  return mapping;
}

export interface PreviewRow {
  index: number;
  date: DateKey;
  type: TxnType;
  amount: Minor;
  account: string;
  toAccount: string;
  envelope: string;
  note: string;
  labels: string[];
  currency: string;
  error: string | null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}/;

function normalizeType(raw: string): TxnType {
  const v = raw.trim().toLowerCase();
  if (v.startsWith("inc") || v === "deposit" || v === "credit") return "income";
  if (v.startsWith("tra")) return "transfer";
  return "expense";
}

/** Validate and shape data rows for the import preview (does not mutate state). */
export function previewImport(
  dataRows: string[][],
  mapping: Mapping,
  opts: { currency?: string; decimal?: "." | "," } = {},
): PreviewRow[] {
  const decimal = opts.decimal ?? ".";
  const defCurrency = opts.currency ?? "USD";
  const at = (row: string[], col: CsvColumn): string => {
    const i = mapping[col];
    return i == null ? "" : (row[i] ?? "").trim();
  };
  return dataRows.map((row, index) => {
    const date = at(row, "Date");
    const type = normalizeType(at(row, "Type"));
    const currency = at(row, "Currency") || defCurrency;
    const amount = parseAmount(at(row, "Amount"), currency, decimal);
    const account = at(row, "Account");
    const toAccount = at(row, "To Account");
    const envelope = at(row, "Envelope");
    const labels = at(row, "Labels")
      .split(/[|;]/)
      .map((l) => l.trim())
      .filter(Boolean);

    let error: string | null = null;
    if (!DATE_RE.test(date)) error = "invalid date";
    else if (amount == null || amount <= 0) error = "invalid amount";
    else if (!account) error = "missing account";
    else if (type === "transfer" && !toAccount) error = "transfer needs a destination account";

    return {
      index,
      date: date.slice(0, 10),
      type,
      amount: amount ?? 0,
      account,
      toAccount,
      envelope,
      note: at(row, "Note"),
      labels,
      currency,
      error,
    };
  });
}

export interface ImportResult {
  state: BudgetState;
  imported: number;
  skipped: number;
  createdAccounts: number;
  createdEnvelopes: number;
}

/** Apply the valid preview rows, creating accounts/envelopes by name as needed. */
export function applyImport(
  s: BudgetState,
  preview: PreviewRow[],
  now: ISODateTime,
): ImportResult {
  let state = s;
  let imported = 0;
  let skipped = 0;
  let createdAccounts = 0;
  let createdEnvelopes = 0;

  const accountId = (name: string): string | null => {
    const existing = state.accounts.find((a) => a.name.toLowerCase() === name.toLowerCase());
    if (existing) return existing.id;
    const res = addAccount(state, { name });
    if (!res.id) return null;
    state = res.state;
    createdAccounts += 1;
    return res.id;
  };
  const envelopeId = (name: string): string | null => {
    if (!name) return null;
    const existing = state.envelopes.find((e) => e.name.toLowerCase() === name.toLowerCase());
    if (existing) return existing.id;
    const res = addEnvelope(state, { name });
    if (!res.id) return null;
    state = res.state;
    createdEnvelopes += 1;
    return res.id;
  };
  const labelIds = (names: string[]): string[] => {
    const ids: string[] = [];
    for (const name of names) {
      const existing = state.labels.find((l) => l.name.toLowerCase() === name.toLowerCase());
      if (existing) {
        ids.push(existing.id);
        continue;
      }
      const res = addLabel(state, { name });
      if (res.id) {
        state = res.state;
        ids.push(res.id);
      }
    }
    return ids;
  };

  for (const r of preview) {
    if (r.error) {
      skipped += 1;
      continue;
    }
    const from = accountId(r.account);
    if (!from) {
      skipped += 1;
      continue;
    }
    if (r.type === "transfer") {
      const to = accountId(r.toAccount);
      if (!to || to === from) {
        skipped += 1;
        continue;
      }
      const res = addTransfer(state, { amount: r.amount, accountId: from, accountIdTo: to, date: r.date + "T12:00:00.000", note: r.note }, now);
      if (res.error) {
        skipped += 1;
        continue;
      }
      state = res.state;
      imported += 1;
    } else {
      const env = envelopeId(r.envelope);
      if (r.type === "expense" && !env) {
        skipped += 1;
        continue;
      }
      // Resolve labels first — it may create new Label records in `state`, which
      // must be committed before the (immutable) state is passed to addTransaction.
      const labels = labelIds(r.labels);
      const res = addTransaction(
        state,
        {
          type: r.type,
          amount: r.amount,
          accountId: from,
          envelopeId: env,
          date: r.date + "T12:00:00.000",
          note: r.note,
          currency: r.currency,
          labels,
        },
        now,
      );
      if (res.error) {
        skipped += 1;
        continue;
      }
      state = res.state;
      imported += 1;
    }
  }

  return { state, imported, skipped, createdAccounts, createdEnvelopes };
}

/** Convenience for a known-good export string: parse → map → preview → apply.
 *  Pass the same `decimal` mark used on export so a "," export round-trips. */
export function importCsvText(
  s: BudgetState,
  text: string,
  now: ISODateTime,
  currency = "USD",
  decimal: "." | "," = ".",
): ImportResult {
  const rows = parseCsv(text);
  if (!rows.length) return { state: s, imported: 0, skipped: 0, createdAccounts: 0, createdEnvelopes: 0 };
  const mapping = detectMapping(rows[0]);
  const preview = previewImport(rows.slice(1), mapping, { currency, decimal });
  return applyImport(s, preview, now);
}

export const exportSummary = (s: BudgetState) => ({
  transactions: liveTxns(s).length,
  accounts: activeAccounts(s).length,
  envelopes: activeEnvelopes(s).length,
});
