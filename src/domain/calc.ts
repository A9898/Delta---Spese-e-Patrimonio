import type { Account, Instrument, Operation, Price, Transaction, Wallet } from '../data/types';

export interface Position {
  instrument: Instrument;
  qty: number;
  /** Prezzo medio di carico (media ponderata degli acquisti). */
  pmc: number;
  cost: number;
}

/**
 * Quantità e PMC derivati dalle operazioni.
 * Gli acquisti aggiornano il PMC (media ponderata); le vendite riducono quantità e costo al PMC corrente.
 */
export function positionFromOps(instrument: Instrument, ops: Operation[]): Position {
  const sorted = ops.filter((o) => o.instrument_id === instrument.id).sort((a, b) => a.date.localeCompare(b.date));
  let q = 0, cost = 0;
  for (const o of sorted) {
    if (o.side === 'buy') {
      cost += o.qty * o.price + (o.fees || 0);
      q += o.qty;
    } else {
      const sold = Math.min(o.qty, q);
      const pmc = q > 0 ? cost / q : 0;
      cost -= sold * pmc;
      q -= sold;
    }
  }
  if (q < 1e-9) { q = 0; cost = 0; }
  return { instrument, qty: q, pmc: q > 0 ? cost / q : 0, cost };
}

export interface Valued extends Position {
  price: number;
  prevClose: number;
  value: number;
  pl: number;
  plPct: number;
  dayPct: number;
  dayAbs: number;
}

export function valuePosition(p: Position, price?: Price): Valued {
  const px = price?.price ?? p.pmc;
  const prev = price?.prev_close || px;
  const value = px * p.qty;
  return {
    ...p, price: px, prevClose: prev, value,
    pl: value - p.cost,
    plPct: p.cost > 0 ? (value / p.cost - 1) * 100 : 0,
    dayPct: prev > 0 ? (px / prev - 1) * 100 : 0,
    dayAbs: (px - prev) * p.qty,
  };
}

/** Saldo di un conto: saldo manuale + movimenti registrati dopo l'ultimo aggiornamento manuale. */
export function accountBalance(a: Account, txs: Transaction[]): number {
  return a.balance_manual + txs
    .filter((t) => t.account_id === a.id && t.created_at > a.balance_as_of)
    .reduce((s, t) => s + t.amount, 0);
}

export interface CryptoRow {
  key: string;
  instrument: Instrument;
  label: string;
  source: string;
  qty: number;
  cost: number;
  price: number;
  value: number;
  dayPct: number;
}

const short = (a: string) => (a.length > 12 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a);

/** Righe crypto: una per wallet (saldo dalla blockchain) e una per posizione registrata a mano. */
export function cryptoRows(instruments: Instrument[], ops: Operation[], wallets: Wallet[], prices: Record<string, Price>): CryptoRow[] {
  const byNet: Record<string, Instrument | undefined> = {
    bitcoin: instruments.find((i) => i.kind === 'crypto' && i.ticker === 'BTC'),
    ethereum: instruments.find((i) => i.kind === 'crypto' && i.ticker === 'ETH'),
  };
  const rows: CryptoRow[] = [];
  for (const w of wallets) {
    const ins = byNet[w.network];
    if (!ins) continue;
    const pr = prices[ins.id];
    const px = pr?.price ?? 0;
    rows.push({
      key: w.id, instrument: ins, label: ins.name, qty: w.cached_balance, cost: w.cost_basis,
      source: `${w.label} · ${short(w.address_or_xpub)} · saldo letto dalla blockchain`,
      price: px, value: px * w.cached_balance, dayPct: pr?.prev_close ? (px / pr.prev_close - 1) * 100 : 0,
    });
  }
  for (const ins of instruments.filter((i) => i.kind === 'crypto')) {
    const p = valuePosition(positionFromOps(ins, ops), prices[ins.id]);
    if (p.qty <= 0) continue;
    rows.push({ key: ins.id, instrument: ins, label: ins.name, qty: p.qty, cost: p.cost, source: 'Registrato a mano', price: p.price, value: p.value, dayPct: p.dayPct });
  }
  return rows;
}

export interface MonthFlow { income: number; spending: number; invested: number }

/** Entrate, spese e investito di un elenco di movimenti (gli investimenti non contano come spesa). */
export function flowOf(txs: Transaction[]): MonthFlow {
  let income = 0, spending = 0, invested = 0;
  for (const t of txs) {
    if (t.category === 'Investimenti') invested -= t.amount;
    else if (t.amount > 0) income += t.amount;
    else spending -= t.amount;
  }
  return { income, spending, invested };
}

export function spentByCategory(txs: Transaction[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of txs) {
    if (t.amount >= 0 || t.category === 'Investimenti') continue;
    out[t.category] = (out[t.category] ?? 0) - t.amount;
  }
  return out;
}

/** Mesi necessari per raggiungere un obiettivo. */
export function monthsToGoal(saved: number, target: number, monthly: number): number {
  if (saved >= target) return 0;
  if (monthly <= 0) return Infinity;
  return Math.ceil((target - saved) / monthly);
}
