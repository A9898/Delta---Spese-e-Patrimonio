import { parseDecimal } from '../lib/format';

/**
 * Import delle operazioni da CSV esportato dal broker.
 * Colonne riconosciute (intestazione, ordine libero, separatore , o ;):
 *   data | date, isin | ticker | simbolo, tipo | side | type (acquisto/vendita/buy/sell),
 *   quantità | quantita | qty | shares, prezzo | price
 */
export interface CsvOperation {
  date: string;
  symbol: string;
  side: 'buy' | 'sell';
  qty: number;
  price: number;
}

function splitLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
    else if (c === sep && !q) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function normDate(s: string): string | null {
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

export function parseOperationsCsv(text: string): { ops: CsvOperation[]; errors: string[] } {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { ops: [], errors: ['Il file è vuoto.'] };
  const sep = (lines[0].match(/;/g)?.length ?? 0) > (lines[0].match(/,/g)?.length ?? 0) ? ';' : ',';
  const head = splitLine(lines[0], sep).map((h) => h.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''));
  const col = (...names: string[]) => head.findIndex((h) => names.includes(h));
  const iDate = col('data', 'date'), iSym = col('isin', 'ticker', 'simbolo', 'symbol'), iSide = col('tipo', 'side', 'type', 'operazione');
  const iQty = col('quantita', 'qty', 'quantity', 'shares', 'quote'), iPrice = col('prezzo', 'price', 'prezzo unitario');
  if ([iDate, iSym, iQty, iPrice].some((i) => i < 0)) {
    return { ops: [], errors: ['Intestazione non riconosciuta: servono data, isin/ticker, quantità e prezzo.'] };
  }
  const ops: CsvOperation[] = [], errors: string[] = [];
  lines.slice(1).forEach((l, n) => {
    const c = splitLine(l, sep);
    const date = normDate(c[iDate] ?? '');
    const qtyRaw = parseDecimal(c[iQty] ?? '');
    const price = parseDecimal(c[iPrice] ?? '');
    const sideRaw = (iSide >= 0 ? c[iSide] : '').toLowerCase();
    const side: 'buy' | 'sell' = /sell|vend/.test(sideRaw) || qtyRaw < 0 ? 'sell' : 'buy';
    const symbol = (c[iSym] ?? '').toUpperCase();
    if (!date || !symbol || !(Math.abs(qtyRaw) > 0) || !(price > 0)) { errors.push(`Riga ${n + 2} ignorata.`); return; }
    ops.push({ date, symbol, side, qty: Math.abs(qtyRaw), price });
  });
  return { ops, errors };
}
