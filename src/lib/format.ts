/** Formattazione numeri in stile italiano: €69.543,21, segno meno tipografico, +1,52%. */

export const MINUS = '−';

export function num(v: number, d = 2): string {
  const [i, f] = Math.abs(v).toFixed(d).split('.');
  return i.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (f ? ',' + f : '');
}

export function eur(v: number, sign = false): string {
  const r = Math.round(v * 100) / 100;
  return (r < 0 ? MINUS : sign && r > 0 ? '+' : '') + '€' + num(r);
}

export function pct(v: number, d = 2): string {
  return (v < 0 ? MINUS : '+') + num(v, d) + '%';
}

/** Interpreta un importo scritto dall'utente: "1.234,56", "12,5", "12.50", "€ 3". */
export function parseAmount(raw: string): number {
  let s = String(raw).replace(/[€\s]/g, '');
  if (!s) return NaN;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  return Number(s);
}

/** Quantità / prezzi: accetta sia la virgola sia il punto come separatore decimale. */
export function parseDecimal(raw: string): number {
  const s = String(raw).replace(/[€\s]/g, '');
  if (!s) return NaN;
  if (s.includes(',')) return Number(s.replace(/\./g, '').replace(',', '.'));
  return Number(s);
}

/** Quote ETF: fino a 3 decimali, senza zeri inutili ("220", "2,164"). */
export function qty(v: number): string {
  const s = num(v, 3);
  return s.replace(/0+$/, '').replace(/,$/, '');
}

/** Quantità crypto come nel design: 4 decimali sotto l'unità, 2 sopra. */
export function cryptoQty(v: number): string {
  return num(v, v < 1 ? 4 : 2);
}
