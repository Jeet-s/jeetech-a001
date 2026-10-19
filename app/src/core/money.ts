/**
 * Decimal-safe money, as integer MINOR units (e.g. cents). Every amount in the
 * app is stored and computed in minor units so there is never a floating-point
 * rounding surprise. Formatting and parsing bridge to human strings, and the
 * inline calculator (+ - × ÷ and percent) lives here too.
 *
 * Pure TypeScript — no React, no storage, no hidden clock.
 */

export type Minor = number; // integer count of a currency's smallest unit

/** Currencies whose smallest unit is not 1/100. Everything else defaults to 2. */
const MINOR_DIGITS: Record<string, number> = {
  JPY: 0,
  KRW: 0,
  VND: 0,
  CLP: 0,
  ISK: 0,
  HUF: 0,
  BHD: 3,
  KWD: 3,
  OMR: 3,
  TND: 3,
};

const SYMBOLS: Record<string, string> = {
  USD: "$",
  CAD: "$",
  AUD: "$",
  NZD: "$",
  EUR: "€",
  GBP: "£",
  JPY: "¥",
  CNY: "¥",
  INR: "₹",
  KRW: "₩",
  BRL: "R$",
  MXN: "$",
  CHF: "CHF ",
  ZAR: "R",
};

export function minorDigits(currency: string): number {
  return MINOR_DIGITS[(currency || "USD").toUpperCase()] ?? 2;
}

/** 10 ** minorDigits — the number of minor units in one major unit. */
export function minorFactor(currency: string): number {
  return 10 ** minorDigits(currency);
}

export function currencySymbol(currency: string): string {
  return SYMBOLS[(currency || "USD").toUpperCase()] ?? `${(currency || "USD").toUpperCase()} `;
}

/** Round a major-unit number to the nearest whole minor unit (half-away-from-zero).
 *  Out-of-range inputs (NaN/Infinity, or a magnitude past the safe-integer limit)
 *  return 0 rather than storing a non-integer minor value. */
export function toMinor(major: number, currency: string): Minor {
  if (!isFinite(major)) return 0;
  const f = minorFactor(currency);
  // Nudge to avoid 1.005 → 1.00 binary errors, then round half up / down symmetrically.
  const scaled = major * f;
  const result = scaled < 0 ? -Math.round(-scaled + 1e-9) : Math.round(scaled + 1e-9);
  return Number.isSafeInteger(result) ? result : 0;
}

export function fromMinor(minor: Minor, currency: string): number {
  return minor / minorFactor(currency);
}

const GROUP = /\B(?=(\d{3})+(?!\d))/g;

/** "$1,234.50" — tabular, grouped, with the currency's symbol and digit count. */
export function formatMoney(
  minor: Minor,
  currency = "USD",
  opts: { sign?: boolean; symbol?: boolean; grouping?: boolean } = {},
): string {
  const { sign = false, symbol = true, grouping = true } = opts;
  const digits = minorDigits(currency);
  // Take the sign from the rounded magnitude so a value that rounds to zero
  // never prints as "-$0.00" (note: -0 < 0 is false in JS).
  const rounded = Math.round(minor);
  const neg = rounded < 0;
  const abs = Math.abs(rounded);
  const factor = 10 ** digits;
  const whole = Math.floor(abs / factor);
  const frac = abs - whole * factor;
  let wholeStr = String(whole);
  if (grouping) wholeStr = wholeStr.replace(GROUP, ",");
  const fracStr = digits > 0 ? "." + String(frac).padStart(digits, "0") : "";
  const sym = symbol ? currencySymbol(currency) : "";
  const prefix = neg ? "-" : sign ? "+" : "";
  return `${prefix}${sym}${wholeStr}${fracStr}`;
}

/**
 * Parse a human amount string into minor units. Forgiving: strips the currency
 * symbol, spaces and grouping separators, and accepts either "." or "," as the
 * decimal mark (`decimal` picks which — defaults to "."). Returns null if the
 * string has no digits or is malformed.
 */
export function parseAmount(raw: string, currency = "USD", decimal: "." | "," = "."): Minor | null {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  const negative = /^[-(]/.test(s) || /\)$/.test(s);
  // Drop everything that isn't a digit or a separator.
  s = s.replace(/[^0-9.,]/g, "");
  if (!/[0-9]/.test(s)) return null;
  const thousands = decimal === "." ? "," : ".";
  s = s.split(thousands).join("");
  if (decimal === ",") s = s.replace(",", ".");
  // Any remaining stray separators are invalid.
  if ((s.match(/\./g) || []).length > 1) return null;
  const n = Number(s);
  if (!isFinite(n)) return null;
  const minor = toMinor(n, currency);
  return negative ? -minor : minor;
}

// ─────────────────────────────── calculator ────────────────────────────────

type Tok = { k: "num"; v: number } | { k: "op"; v: "+" | "-" | "*" | "/" } | { k: "pct" };

function tokenize(input: string): Tok[] | null {
  // Map the pretty operator glyphs, but DON'T strip interior whitespace — a
  // space between two bare numbers is a token boundary, so "12 50" must stay two
  // tokens (and be rejected) rather than fusing into 1250.
  const s = input.replace(/×/g, "*").replace(/÷/g, "/").trim();
  if (!s) return null;
  const out: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === " " || c === "\t") {
      i++;
      continue;
    }
    if (c >= "0" && c <= "9") {
      let j = i;
      let dots = 0;
      while (j < s.length && ((s[j] >= "0" && s[j] <= "9") || s[j] === ".")) {
        if (s[j] === ".") dots++;
        j++;
      }
      if (dots > 1) return null;
      const v = Number(s.slice(i, j));
      if (!isFinite(v)) return null;
      out.push({ k: "num", v });
      i = j;
    } else if (c === "." ) {
      // a bare ".5" style number
      let j = i;
      while (j < s.length && ((s[j] >= "0" && s[j] <= "9") || s[j] === ".")) j++;
      const v = Number(s.slice(i, j));
      if (!isFinite(v)) return null;
      out.push({ k: "num", v });
      i = j;
    } else if (c === "+" || c === "-" || c === "*" || c === "/") {
      out.push({ k: "op", v: c });
      i++;
    } else if (c === "%") {
      out.push({ k: "pct" });
      i++;
    } else {
      return null;
    }
  }
  return out;
}

/**
 * Evaluate a calculator expression to a plain number (major units), or null if
 * the expression is malformed/incomplete. Supports + - × ÷ with standard
 * precedence, and percent (%) in the familiar on-screen-calculator sense:
 *   • within a product: "200 × 10%"  → 200 × 0.1 = 20
 *   • as an additive term: "45 + 10%" → 45 + (45 × 0.1) = 49.5  (relative)
 *   • standalone/first:   "10%"       → 0.1
 * A leading "-" is treated as unary negation of the first term.
 */
export function calc(input: string): number | null {
  const toks = tokenize(input ?? "");
  if (!toks) return null;

  let pos = 0;
  const peek = () => toks[pos];
  const next = () => toks[pos++];

  function readFactor(): { value: number; pct: number | null } | null {
    const t = peek();
    if (!t || t.k !== "num") return null;
    next();
    if (peek() && peek().k === "pct") {
      next();
      return { value: t.v / 100, pct: t.v };
    }
    return { value: t.v, pct: null };
  }

  function readTerm(): { value: number; singlePct: number | null } | null {
    const first = readFactor();
    if (!first) return null;
    let value = first.value;
    let factors = 1;
    while (peek() && peek().k === "op" && ((peek() as { v: string }).v === "*" || (peek() as { v: string }).v === "/")) {
      const op = (next() as { v: string }).v;
      const g = readFactor();
      if (!g) return null;
      value = op === "*" ? value * g.value : g.value === 0 ? NaN : value / g.value;
      factors++;
    }
    return { value, singlePct: factors === 1 ? first.pct : null };
  }

  // expr := ('-')? term (('+'|'-') term)*
  let negate = false;
  if (peek() && peek().k === "op" && ((peek() as { v: string }).v === "-" || (peek() as { v: string }).v === "+")) {
    negate = (next() as { v: string }).v === "-";
  }
  const firstTerm = readTerm();
  if (!firstTerm) return null;
  let acc = negate ? -firstTerm.value : firstTerm.value;

  while (peek()) {
    const t = peek();
    if (t.k !== "op" || (t.v !== "+" && t.v !== "-")) return null;
    const op = (next() as { v: "+" | "-" }).v;
    const rhs = readTerm();
    if (!rhs) return null;
    if (rhs.singlePct != null) {
      const delta = acc * (rhs.singlePct / 100);
      acc = op === "+" ? acc + delta : acc - delta;
    } else {
      acc = op === "+" ? acc + rhs.value : acc - rhs.value;
    }
  }

  if (pos !== toks.length) return null;
  if (!isFinite(acc)) return null;
  return acc;
}

/** Evaluate an expression straight to minor units, rounded to the currency. */
export function calcToMinor(input: string, currency = "USD"): Minor | null {
  const n = calc(input);
  if (n == null) return null;
  return toMinor(n, currency);
}
