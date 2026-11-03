import { Capacitor } from '@capacitor/core';
import type { Instrument, Price } from '../data/types';

/**
 * Quotazioni da fonti pubbliche.
 * - ETF: endpoint chart di Yahoo Finance per simbolo (es. VWCE.DE). Gratuito, senza chiave.
 *   Nel browser è bloccato dal CORS: su Android le richieste passano da CapacitorHttp (vedi capacitor.config.ts).
 * - Crypto: CoinGecko simple/price in EUR con variazione 24h.
 * - Fondo pensione: valore quota inserito dall'utente (nessun fetch).
 */
export interface PriceProvider {
  readonly name: string;
  fetch(instruments: Instrument[], current: Record<string, Price>): Promise<Price[]>;
}

async function getJson(url: string, timeoutMs = 10000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

export const coinGeckoProvider: PriceProvider = {
  name: 'CoinGecko',
  async fetch(instruments) {
    const cr = instruments.filter((i) => i.kind === 'crypto' && i.price_symbol);
    if (!cr.length) return [];
    const ids = cr.map((i) => i.price_symbol).join(',');
    const data = await getJson(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=eur&include_24hr_change=true`);
    const now = Date.now();
    return cr.flatMap((i) => {
      const d = data?.[i.price_symbol!];
      if (!d?.eur) return [];
      const ch = Number(d.eur_24h_change ?? 0);
      return [{ instrument_id: i.id, price: d.eur, prev_close: d.eur / (1 + ch / 100), updated_at: now }];
    });
  },
};

async function yahooMeta(symbol: string) {
  const data = await getJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`);
  const meta = data?.chart?.result?.[0]?.meta;
  if (!meta?.regularMarketPrice) throw new Error(`nessun prezzo per ${symbol}`);
  return meta as { regularMarketPrice: number; chartPreviousClose?: number; previousClose?: number; currency?: string };
}

/** Fattore per convertire in EUR una quotazione in altra valuta (GBp = pence). */
async function toEurFactor(currency: string | undefined, cache: Map<string, Promise<number>>): Promise<number> {
  if (!currency || currency === 'EUR') return 1;
  const pence = currency === 'GBp' || currency === 'GBX';
  const cur = pence ? 'GBP' : currency.toUpperCase();
  if (!cache.has(cur)) cache.set(cur, yahooMeta(`${cur}EUR=X`).then((m) => Number(m.regularMarketPrice)));
  const rate = await cache.get(cur)!;
  return pence ? rate / 100 : rate;
}

export const yahooProvider: PriceProvider = {
  name: 'Yahoo Finance',
  async fetch(instruments) {
    const etf = instruments.filter((i) => i.kind === 'etf' && i.price_symbol);
    const now = Date.now();
    const fx = new Map<string, Promise<number>>();
    const out = await Promise.allSettled(etf.map(async (i) => {
      const meta = await yahooMeta(i.price_symbol!);
      const f = await toEurFactor(meta.currency, fx);
      const price = Number(meta.regularMarketPrice) * f;
      let prev = Number(meta.chartPreviousClose ?? meta.previousClose ?? 0) * f;
      if (!(price > 0)) throw new Error('prezzo non valido');
      if (!(prev > 0)) prev = price;
      return { instrument_id: i.id, price, prev_close: prev, updated_at: now } satisfies Price;
    }));
    return out.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
  },
};

/** Variazioni casuali piccole: solo per lo sviluppo nel browser (come nel prototipo). */
export const simulatedProvider: PriceProvider = {
  name: 'Simulazione',
  async fetch(instruments, current) {
    const now = Date.now();
    return instruments.filter((i) => i.kind !== 'fondo' && current[i.id]).map((i) => {
      const c = current[i.id];
      const vol = i.kind === 'crypto' ? 0.008 : 0.003;
      return { ...c, price: +(c.price * (1 + (Math.random() - 0.5) * vol)).toFixed(2), updated_at: now };
    });
  },
};

export const isNative = () => Capacitor.isNativePlatform();

/** Aggiorna tutti i prezzi; se le fonti reali non rispondono (es. browser senza CORS) usa la simulazione in sviluppo. */
export async function refreshPrices(instruments: Instrument[], current: Record<string, Price>): Promise<{ prices: Price[]; source: string }> {
  const useSim = !isNative() && import.meta.env.DEV;
  if (useSim) return { prices: await simulatedProvider.fetch(instruments, current), source: simulatedProvider.name };
  const results = await Promise.allSettled([yahooProvider.fetch(instruments, current), coinGeckoProvider.fetch(instruments, current)]);
  const prices = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  return { prices, source: 'quotazioni pubbliche' };
}

/** Intervallo di aggiornamento: 15 minuti (3 secondi nella simulazione di sviluppo). */
export function refreshIntervalMs(): number {
  return !isNative() && import.meta.env.DEV ? 3000 : 15 * 60 * 1000;
}
