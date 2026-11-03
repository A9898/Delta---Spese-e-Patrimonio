import type { AccountType, Transaction } from '../data/types';

/**
 * Import dall'export CSV di Cashew (colonne: account, amount, amount unpaid, currency, title, note,
 * date, income, type, category name, subcategory name, …).
 * - "Correzione saldo" e trasferimenti non diventano movimenti: servono solo a calcolare il saldo dei conti.
 * - Righe future (rate non ancora pagate) e valute diverse dall'euro vengono saltate.
 * - Gli id sono deterministici: reimportare lo stesso file non crea doppioni.
 */

/** CSV RFC 4180: virgolette, virgole e a capo dentro i campi. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = '', q = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => f !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f !== '')) rows.push(row);
  return rows;
}

export interface CashewTx {
  id: string;
  account: string;
  date: string;
  created_at: number;
  amount: number;
  merchant: string;
  cashewCategory: string;
  note: string | null;
}

export interface CashewAccount { name: string; balance: number; count: number; type: AccountType }
export interface CashewCategory { name: string; count: number; income: boolean; total: number; positive: number }

export interface CashewPlan {
  txs: CashewTx[];
  accounts: CashewAccount[];
  categories: CashewCategory[];
  skipped: { future: number; otherCurrency: string[]; corrections: number };
  from: string;
  to: string;
}

function fnv(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}

export function guessAccountType(name: string): AccountType {
  const n = name.toLowerCase();
  if (/contant|cash|portafogl/.test(n)) return 'contanti';
  if (/deposit|risparm|tesorett/.test(n)) return 'deposito';
  if (/carta|card|visa|master|amex/.test(n)) return 'carta';
  if (/broker|titoli|trading|scalable|degiro|directa|fineco trading/.test(n)) return 'broker_cash';
  return 'conto';
}

const CORRECTION = /correzione saldo|balance correction/i;

export function parseCashew(text: string, today = new Date()): CashewPlan {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error('Il file è vuoto.');
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = (n: string) => head.indexOf(n);
  const iAcc = col('account'), iAmt = col('amount'), iCur = col('currency'), iTitle = col('title'), iNote = col('note'),
    iDate = col('date'), iCat = col('category name'), iSub = col('subcategory name');
  if ([iAcc, iAmt, iDate, iCat].some((i) => i < 0)) throw new Error('Non sembra un export di Cashew: mancano le colonne account, amount, date o category name.');

  const pad = (n: number) => String(n).padStart(2, '0');
  const todayIso = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  const txs: CashewTx[] = [];
  const balances = new Map<string, { balance: number; count: number }>();
  const cats = new Map<string, CashewCategory>();
  const skipped = { future: 0, otherCurrency: [] as string[], corrections: 0 };
  const seen = new Map<string, number>();

  for (const r of rows.slice(1)) {
    const get = (i: number) => (i >= 0 ? (r[i] ?? '').trim() : '');
    const account = get(iAcc) || 'Conto';
    const cur = get(iCur).toUpperCase() || 'EUR';
    const rawAmt = get(iAmt);
    const dateRaw = get(iDate);
    const date = dateRaw.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (!rawAmt || date > todayIso) { skipped.future++; continue; }
    if (cur !== 'EUR') { if (!skipped.otherCurrency.includes(`${account} (${cur})`)) skipped.otherCurrency.push(`${account} (${cur})`); continue; }
    const amount = Math.round(Number(rawAmt) * 100) / 100;
    if (!Number.isFinite(amount)) continue;

    const b = balances.get(account) ?? { balance: 0, count: 0 };
    b.balance += amount;
    balances.set(account, b);

    const category = get(iCat) || 'Altro';
    const note = get(iNote);
    if (CORRECTION.test(category) || /^saldo (aggiornato|trasferito)/i.test(note)) { skipped.corrections++; continue; }
    b.count++;

    const title = get(iTitle), sub = get(iSub);
    const merchant = title || sub || category;
    const [y, m, d] = date.split('-').map(Number);
    const [hh, mm, ss] = (dateRaw.slice(11, 19) || '12:00:00').split(':').map(Number);
    const created_at = new Date(y, m - 1, d, hh || 0, mm || 0, ss || 0).getTime();
    const key = `${account}|${dateRaw}|${amount}|${title}|${note}|${category}`;
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    txs.push({ id: `cashew-${fnv(key)}${n > 1 ? '-' + n : ''}`, account, date, created_at, amount, merchant, cashewCategory: category, note: note || (sub && title ? sub : '') || null });

    const c = cats.get(category) ?? { name: category, count: 0, income: false, total: 0, positive: 0 };
    c.count++; c.total += amount;
    if (amount > 0) c.positive++;
    c.income = c.positive * 2 > c.count; // categoria di entrata se la maggioranza delle righe è positiva
    cats.set(category, c);
  }

  const dates = txs.map((t) => t.date).sort();
  return {
    txs,
    accounts: [...balances.entries()].map(([name, v]) => ({ name, balance: Math.round(v.balance * 100) / 100, count: v.count, type: guessAccountType(name) })),
    categories: [...cats.values()].sort((a, b) => b.count - a.count),
    skipped,
    from: dates[0] ?? '',
    to: dates[dates.length - 1] ?? '',
  };
}

/** Suggerimento di categoria dell'app per una categoria di Cashew. */
export function suggestCategory(cashew: string, income: boolean, appCategories: string[]): string {
  const n = cashew.toLowerCase();
  const has = (c: string) => appCategories.includes(c);
  if (income) return 'Entrate';
  if (/invest|pac|etf|azion|crypto/.test(n)) return 'Investimenti';
  const map: [RegExp, string][] = [
    [/alimentar|spesa|supermerc|grocer/, 'Spesa'],
    [/mangiar|ristor|cibo|bar\b|colazion|pranzo|cena|food|restaurant/, 'Ristoranti'],
    [/benzin|carburant|trasport|auto|treno|bus|taxi|fuel|transport/, 'Trasporti'],
    [/medic|salute|farmac|health/, 'Salute'],
    [/shopping|vestit|abbigl/, 'Shopping'],
    [/abbonam|serviz|ricaric|bollet|subscript|bill/, 'Abbonamenti'],
    [/casa|affitto|mutuo|home|rent/, 'Casa'],
  ];
  for (const [re, c] of map) if (re.test(n) && has(c)) return c;
  const same = appCategories.find((c) => c.toLowerCase() === n);
  return same ?? `+${cashew}`;
}

/** Trasforma il piano in movimenti dell'app (mapping: categoria Cashew → nome categoria app). */
export function toTransactions(plan: CashewPlan, mapping: Record<string, string>, accountIds: Record<string, string>): Transaction[] {
  return plan.txs.map((t) => ({
    id: t.id, date: t.date, merchant: t.merchant,
    category: (mapping[t.cashewCategory] ?? t.cashewCategory).replace(/^\+/, ''),
    account_id: accountIds[t.account] ?? '', amount: t.amount, source: 'man', note: t.note, created_at: t.created_at,
  }));
}
