import { Capacitor, CapacitorHttp } from '@capacitor/core';
import type { Instrument, Price } from '../data/types';

/**
 * Quotazioni da fonti pubbliche.
 * - ETF/azioni: endpoint chart di Yahoo Finance per simbolo (es. VWCE.DE), gratuito e senza chiave.
 *   Se l'utente ha inserito solo l'ISIN, il simbolo si ricava con la ricerca di Yahoo (resolveSymbol).
 * - Crypto: CoinGecko simple/price in EUR con variazione 24h.
 * - Fondo pensione: valore quota inserito dall'utente (nessun fetch).
 * Su Android le richieste passano da CapacitorHttp (HTTP nativo: niente CORS).
 */

export const isNative = () => Capacitor.isNativePlatform();

const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36';

export async function getJson(url: string, timeoutMs = 12000): Promise<any> {
  if (isNative()) {
    const res = await CapacitorHttp.get({ url, headers: { Accept: 'application/json', 'User-Agent': UA }, connectTimeout: timeoutMs, readTimeout: timeoutMs });
    if (res.status < 200 || res.status >= 300) throw new Error(`HTTP ${res.status}`);
    return typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
  }
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

export interface PriceResult {
  prices: Price[];
  /** instrument_id → motivo per cui non è stato aggiornato */
  errors: Record<string, string>;
  /** Simboli trovati automaticamente dall'ISIN/ticker (da salvare sullo strumento). */
  resolved: Record<string, SymbolCandidate>;
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/* ------------------------------------------------------------------ */
/* Ricerca del simbolo da ISIN / ticker                                */
/* ------------------------------------------------------------------ */

export interface SymbolCandidate { symbol: string; name: string; exchange: string }

/** Borse con quotazione in EUR, in ordine di preferenza. */
const EUR_SUFFIX = ['.DE', '.MI', '.AS', '.PA', '.F', '.SG', '.MU', '.DU', '.BE', '.HM', '.VI', '.MC', '.BR', '.LS', '.IR'];

export async function searchSymbols(query: string): Promise<SymbolCandidate[]> {
  const q = query.trim();
  if (!q) return [];
  const data = await getJson(`https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=10&newsCount=0&listsCount=0`);
  const quotes: any[] = data?.quotes ?? [];
  return quotes
    .filter((x) => x?.symbol && ['ETF', 'EQUITY', 'MUTUALFUND', 'INDEX'].includes(String(x.quoteType ?? 'ETF').toUpperCase()))
    .map((x) => ({ symbol: String(x.symbol), name: String(x.longname ?? x.shortname ?? x.symbol), exchange: String(x.exchDisp ?? x.exchange ?? '') }));
}

export function rankEur(c: SymbolCandidate[]): SymbolCandidate[] {
  const score = (s: string) => {
    const i = EUR_SUFFIX.findIndex((suf) => s.toUpperCase().endsWith(suf));
    return i < 0 ? 100 : i;
  };
  return [...c].sort((a, b) => score(a.symbol) - score(b.symbol));
}

export async function resolveSymbol(ins: Instrument): Promise<SymbolCandidate | null> {
  const q = ins.isin || ins.ticker;
  const list = rankEur(await searchSymbols(q));
  return list[0] ?? null;
}

/* ------------------------------------------------------------------ */
/* Provider                                                           */
/* ------------------------------------------------------------------ */

async function yahooMeta(symbol: string) {
  const data = await getJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`);
  const err = data?.chart?.error;
  if (err) throw new Error(err.description ?? `simbolo ${symbol} non trovato`);
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

async function fetchYahoo(instruments: Instrument[], out: PriceResult) {
  const list = instruments.filter((i) => i.kind === 'etf');
  const now = Date.now();
  const fx = new Map<string, Promise<number>>();
  await Promise.all(list.map(async (i) => {
    try {
      let symbol = i.price_symbol;
      if (!symbol) {
        const found = await resolveSymbol(i);
        if (!found) throw new Error(`nessun simbolo trovato per ${i.isin ?? i.ticker}: impostalo a mano`);
        out.resolved[i.id] = found;
        symbol = found.symbol;
      }
      const meta = await yahooMeta(symbol);
      const f = await toEurFactor(meta.currency, fx);
      const price = Number(meta.regularMarketPrice) * f;
      let prev = Number(meta.chartPreviousClose ?? meta.previousClose ?? 0) * f;
      if (!(price > 0)) throw new Error('prezzo non valido');
      if (!(prev > 0)) prev = price;
      out.prices.push({ instrument_id: i.id, price, prev_close: prev, updated_at: now });
    } catch (e) {
      out.errors[i.id] = errMsg(e);
    }
  }));
}

const COINGECKO_IDS: Record<string, string> = { BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', ADA: 'cardano', XRP: 'ripple', DOT: 'polkadot', LTC: 'litecoin', DOGE: 'dogecoin', BNB: 'binancecoin', USDT: 'tether', USDC: 'usd-coin' };

async function fetchCoinGecko(instruments: Instrument[], out: PriceResult) {
  const cr = instruments.filter((i) => i.kind === 'crypto');
  if (!cr.length) return;
  const idOf = (i: Instrument) => i.price_symbol || COINGECKO_IDS[i.ticker.toUpperCase()] || i.ticker.toLowerCase();
  try {
    const ids = [...new Set(cr.map(idOf))].join(',');
    const data = await getJson(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=eur&include_24hr_change=true`);
    const now = Date.now();
    for (const i of cr) {
      const d = data?.[idOf(i)];
      if (!d?.eur) { out.errors[i.id] = `CoinGecko non conosce "${idOf(i)}"`; continue; }
      const ch = Number(d.eur_24h_change ?? 0);
      out.prices.push({ instrument_id: i.id, price: d.eur, prev_close: d.eur / (1 + ch / 100), updated_at: now });
    }
  } catch (e) {
    for (const i of cr) out.errors[i.id] = `CoinGecko: ${errMsg(e)}`;
  }
}

/** Variazioni casuali piccole: solo per lo sviluppo nel browser (come nel prototipo). */
function simulate(instruments: Instrument[], current: Record<string, Price>): Price[] {
  const now = Date.now();
  return instruments.filter((i) => i.kind !== 'fondo' && current[i.id]).map((i) => {
    const c = current[i.id];
    const vol = i.kind === 'crypto' ? 0.008 : 0.003;
    return { ...c, price: +(c.price * (1 + (Math.random() - 0.5) * vol)).toFixed(2), updated_at: now };
  });
}

export const simulating = () => !isNative() && import.meta.env.DEV && import.meta.env.VITE_REAL_PRICES !== '1';

/** Aggiorna tutti i prezzi. Non lancia: gli errori sono per strumento. */
export async function refreshPrices(instruments: Instrument[], current: Record<string, Price>): Promise<PriceResult> {
  if (simulating()) return { prices: simulate(instruments, current), errors: {}, resolved: {} };
  const out: PriceResult = { prices: [], errors: {}, resolved: {} };
  await Promise.all([fetchYahoo(instruments, out), fetchCoinGecko(instruments, out)]);
  return out;
}

/** Intervallo di aggiornamento: 15 minuti (3 secondi nella simulazione di sviluppo). */
export function refreshIntervalMs(): number {
  return simulating() ? 3000 : 15 * 60 * 1000;
}
