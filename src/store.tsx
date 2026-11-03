import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { openDatabase, type Database } from './data/db';
import { createRepos, dumpAll, restoreAll, type Dump, type Repos } from './data/repos';
import { buildSeed } from './data/seed';
import type {
  Account, AppNotification, Goal, Instrument, Network, Operation, PrefKey, Price, Screen, Transaction, Wallet,
} from './data/types';
import { accountBalance, cryptoRows, positionFromOps, spentByCategory, valuePosition } from './domain/calc';
import { iso, monthKey, parseIso } from './lib/dates';
import { eur } from './lib/format';
import { fetchBalance } from './services/blockchain';
import { categorize, isDuplicate, parseWalletNotification, rulePatternFor, WALLET_PACKAGES, type RawNotification } from './services/gpayParser';
import { notifyNow, onNotificationAction, registerActions, rescheduleAll } from './services/localNotifications';
import { refreshIntervalMs, refreshPrices } from './services/prices';
import { startWalletListener } from './services/walletListener';

const uid = (p: string) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export interface Derived {
  balances: Record<string, number>;
  liquidity: number;
  etf: ReturnType<typeof valuePosition>[];
  etfValue: number;
  etfCost: number;
  etfDayAbs: number;
  fund: ReturnType<typeof valuePosition> | null;
  crypto: ReturnType<typeof cryptoRows>;
  cryptoValue: number;
  cryptoCost: number;
  net: number;
  prices: Record<string, Price>;
  prefs: Record<PrefKey, boolean>;
  unread: number;
}

interface UI {
  screen: Screen;
  sheet: null | 'expense' | 'op' | 'wallet' | 'account' | { tx: string };
  notifOpen: boolean;
  onboarding: number; // -1 = chiuso
  pricesAt: number;
  priceError: string | null;
  editAccount: string | null;
}

interface Store {
  ready: boolean;
  data: Dump;
  d: Derived;
  ui: UI;
  setUi: (p: Partial<UI>) => void;
  go: (s: Screen) => void;
  actions: ReturnType<typeof makeActions>;
}

const Ctx = createContext<Store | null>(null);
export const useStore = () => {
  const s = useContext(Ctx);
  if (!s) throw new Error('StoreProvider mancante');
  return s;
};

const EMPTY: Dump = {
  accounts: [], transactions: [], categories: [], merchant_rules: [], instruments: [], operations: [], wallets: [],
  prices: [], scheduled_payments: [], goals: [], notifications: [], notification_prefs: [], networth_snapshots: [], settings: [],
};

export function derive(data: Dump): Derived {
  const prices = Object.fromEntries(data.prices.map((p) => [p.instrument_id, p]));
  const balances = Object.fromEntries(data.accounts.map((a) => [a.id, accountBalance(a, data.transactions)]));
  const liquidity = Object.values(balances).reduce((a, b) => a + b, 0);
  const etf = data.instruments.filter((i) => i.kind === 'etf')
    .map((i) => valuePosition(positionFromOps(i, data.operations), prices[i.id]))
    .filter((p) => p.qty > 0);
  const etfValue = etf.reduce((a, p) => a + p.value, 0);
  const etfCost = etf.reduce((a, p) => a + p.cost, 0);
  const etfDayAbs = etf.reduce((a, p) => a + p.dayAbs, 0);
  const fi = data.instruments.find((i) => i.kind === 'fondo');
  const fund = fi ? valuePosition(positionFromOps(fi, data.operations), prices[fi.id]) : null;
  const crypto = cryptoRows(data.instruments, data.operations, data.wallets, prices);
  const cryptoValue = crypto.reduce((a, c) => a + c.value, 0);
  const cryptoCost = crypto.reduce((a, c) => a + c.cost, 0);
  const prefs = { pay: true, pac: true, gpay: true, budget: true, market: false, weekly: true } as Record<PrefKey, boolean>;
  data.notification_prefs.forEach((p) => { prefs[p.key] = p.enabled; });
  return {
    balances, liquidity, etf, etfValue, etfCost, etfDayAbs, fund, crypto, cryptoValue, cryptoCost,
    net: liquidity + etfValue + (fund?.value ?? 0) + cryptoValue,
    prices, prefs, unread: data.notifications.filter((n) => !n.read).length,
  };
}

type SetData = (fn: (d: Dump) => Dump) => void;

function upsertIn<T>(list: T[], row: T, key: keyof T): T[] {
  const i = list.findIndex((r) => r[key] === row[key]);
  if (i < 0) return [...list, row];
  const c = [...list]; c[i] = row; return c;
}

function makeActions(repos: Repos, get: () => Dump, set: SetData, setUi: (p: Partial<UI>) => void) {
  const notify = async (n: Omit<AppNotification, 'id' | 'created_at' | 'read' | 'done' | 'action' | 'action_ref' | 'dedupe_key'> & Partial<AppNotification>, system = true) => {
    const d = get();
    if (n.dedupe_key && d.notifications.some((x) => x.dedupe_key === n.dedupe_key)) return;
    const row: AppNotification = { id: uid('n'), created_at: Date.now(), read: false, done: false, action: null, action_ref: null, dedupe_key: null, ...n };
    await repos.notifications.upsert(row);
    set((x) => ({ ...x, notifications: [row, ...x.notifications] }));
    if (system) notifyNow(row.title, row.body, row.target_screen).catch(() => undefined);
  };

  /** Avviso quando una categoria supera l'80% del budget (una volta per categoria e mese). */
  const checkBudget = async (category: string, date: string) => {
    const d = get();
    if (!derive(d).prefs.budget) return;
    const cat = d.categories.find((c) => c.name === category);
    if (!cat || cat.monthly_budget <= 0) return;
    const mk = monthKey(date);
    const spent = spentByCategory(d.transactions.filter((t) => t.date.startsWith(mk)))[category] ?? 0;
    if (spent / cat.monthly_budget < 0.8) return;
    await notify({
      type: 'budget', icon: 'triangle-alert', target_screen: 'budget', dedupe_key: `budget:${category}:${mk}`,
      title: `Budget ${category} all'${Math.round(spent / cat.monthly_budget * 100)}%`,
      body: `Hai speso ${eur(spent)} su ${eur(cat.monthly_budget)}. Restano ${eur(Math.max(0, cat.monthly_budget - spent))}.`,
    });
  };

  const addTransaction = async (t: Omit<Transaction, 'id' | 'created_at'> & { created_at?: number }) => {
    const row: Transaction = { id: uid('tx'), created_at: Date.now(), ...t };
    await repos.transactions.upsert(row);
    set((x) => ({ ...x, transactions: [row, ...x.transactions] }));
    if (row.amount < 0) await checkBudget(row.category, row.date);
    return row;
  };

  const addOperation = async (op: Omit<Operation, 'id'>) => {
    const row: Operation = { id: uid('op'), ...op };
    await repos.operations.upsert(row);
    set((x) => ({ ...x, operations: [...x.operations, row] }));
    return row;
  };

  const setPrice = async (p: Price) => {
    await repos.prices.upsert(p);
    set((x) => ({ ...x, prices: upsertIn(x.prices, p, 'instrument_id') }));
  };

  return {
    addTransaction,

    async addExpense(amount: number, merchant: string, category: string, accountId: string) {
      await addTransaction({ date: iso(new Date()), merchant: merchant.trim() || category, category, account_id: accountId, amount: -Math.abs(amount), source: 'man', note: null });
      setUi({ sheet: null, screen: 'tx' });
    },

    /** Cambio categoria: per i commercianti registrati in automatico crea una regola. */
    async setTxCategory(txId: string, category: string) {
      const t = get().transactions.find((x) => x.id === txId);
      if (!t) return;
      const row = { ...t, category };
      await repos.transactions.upsert(row);
      set((x) => ({ ...x, transactions: x.transactions.map((y) => (y.id === txId ? row : y)) }));
      if (t.source === 'gpay') {
        const rule = { merchant_pattern: rulePatternFor(t.merchant), category };
        await repos.merchantRules.upsert(rule);
        set((x) => ({ ...x, merchant_rules: upsertIn(x.merchant_rules, rule, 'merchant_pattern') }));
      }
      if (row.amount < 0) await checkBudget(category, row.date);
    },

    async deleteTx(txId: string) {
      await repos.transactions.remove(txId);
      set((x) => ({ ...x, transactions: x.transactions.filter((t) => t.id !== txId) }));
    },

    /** Notifica di Google Wallet ricevuta dal listener nativo. */
    async ingestWalletNotification(n: RawNotification) {
      if (!WALLET_PACKAGES.includes(n.packageName)) return;
      const d = get();
      const custom = d.settings.find((s) => s.key === 'gpay_regex')?.value;
      const p = parseWalletNotification(n, custom);
      if (!p || isDuplicate(p, d.transactions)) return;
      const card = d.accounts.find((a) => a.gpay_linked && (!p.cardLast4 || a.card_last4 === p.cardLast4)) ?? d.accounts.find((a) => a.gpay_linked);
      const category = categorize(p.merchant, d.merchant_rules);
      await addTransaction({ date: iso(new Date(p.postedAt)), merchant: p.merchant, category, account_id: card?.id ?? d.accounts[0]?.id ?? '', amount: -p.amount, source: 'gpay', note: null, created_at: p.postedAt });
      if (derive(get()).prefs.gpay) {
        await notify({ type: 'gpay', icon: 'credit-card', target_screen: 'tx', title: `Spesa registrata: ${p.merchant}`, body: `${eur(-p.amount)} · ${category}. Tocca per cambiare categoria.` });
      }
    },

    async saveAccount(a: Omit<Account, 'id' | 'sort' | 'balance_as_of'> & { id?: string }) {
      const d = get();
      const prev = a.id ? d.accounts.find((x) => x.id === a.id) : undefined;
      const row: Account = { ...a, id: a.id ?? uid('acc'), sort: prev?.sort ?? d.accounts.length, balance_as_of: Date.now() };
      await repos.accounts.upsert(row);
      set((x) => ({ ...x, accounts: upsertIn(x.accounts, row, 'id') }));
      setUi({ sheet: null });
    },

    async saveOperation(o: { side: 'buy' | 'sell'; kind: 'ETF' | 'Crypto' | 'Fondo pensione'; symbol: string; qty: number; price: number; date: string; monthly: boolean }) {
      const d = get();
      const T = o.symbol.trim().toUpperCase();
      let ins: Instrument | undefined;
      if (o.kind === 'Fondo pensione') ins = d.instruments.find((i) => i.kind === 'fondo');
      else if (o.kind === 'ETF') ins = d.instruments.find((i) => i.kind === 'etf' && (i.ticker === T || i.isin === T));
      else ins = d.instruments.find((i) => i.kind === 'crypto' && i.ticker === T);
      if (!ins) {
        const isIsin = /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(T);
        const ticker = o.kind === 'Fondo pensione' ? 'FONDO' : isIsin ? T.slice(-6) : T;
        ins = {
          id: uid('ins'), kind: o.kind === 'ETF' ? 'etf' : o.kind === 'Crypto' ? 'crypto' : 'fondo', ticker,
          isin: isIsin ? T : null, name: o.kind === 'Fondo pensione' ? 'Fondo pensione' : 'Aggiunto da te',
          color: 'rgba(95,191,138,0.15)',
          price_symbol: o.kind === 'Crypto' ? ({ BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', ADA: 'cardano' } as Record<string, string>)[T] ?? T.toLowerCase() : o.kind === 'ETF' && !isIsin ? T : null,
        };
        await repos.instruments.upsert(ins);
        const newIns = ins;
        set((x) => ({ ...x, instruments: [...x.instruments, newIns] }));
      }
      const pos = positionFromOps(ins, d.operations);
      const q = o.side === 'sell' ? Math.min(o.qty, pos.qty) : o.qty;
      if (q <= 0) return;
      await addOperation({ instrument_id: ins.id, date: o.date, side: o.side, qty: q, price: o.price, fees: 0 });
      if (!d.prices.find((p) => p.instrument_id === ins!.id) || ins.kind === 'fondo') {
        await setPrice({ instrument_id: ins.id, price: o.price, prev_close: o.price, updated_at: Date.now() });
      }
      const sg = o.side === 'buy' ? 1 : -1;
      const broker = d.accounts.find((a) => a.type === 'broker_cash');
      await addTransaction({
        date: o.date, merchant: `${o.side === 'buy' ? 'Acquisto' : 'Vendita'} ${ins.kind === 'fondo' ? 'Fondo Cometa' : ins.ticker}`,
        category: 'Investimenti', account_id: broker?.id ?? '', amount: -sg * q * o.price, source: 'man', note: null,
      });
      if (o.monthly && o.side === 'buy') {
        const pay = {
          id: uid('pay'), name: `PAC ${ins.ticker}`, amount: +(q * o.price).toFixed(2), day_of_month: parseIso(o.date).getDate(),
          kind: 'PAC · da confermare', icon: 'trending-up', account_id: d.accounts.find((a) => a.type === 'conto')?.id ?? '', is_pac: true, instrument_id: ins.id,
        };
        await repos.payments.upsert(pay);
        set((x) => ({ ...x, scheduled_payments: [...x.scheduled_payments, pay] }));
      }
      setUi({ sheet: null, screen: 'inv' });
    },

    async importOperations(rows: { date: string; symbol: string; side: 'buy' | 'sell'; qty: number; price: number }[]) {
      for (const r of rows) {
        const crypto = /^(BTC|ETH|SOL|ADA|XRP|DOT|LTC)$/.test(r.symbol);
        await this.saveOperation({ side: r.side, kind: crypto ? 'Crypto' : 'ETF', symbol: r.symbol, qty: r.qty, price: r.price, date: r.date, monthly: false });
      }
    },

    async addWallet(network: Network, address: string, label: string) {
      const d = get();
      const ins = d.instruments.find((i) => i.kind === 'crypto' && i.ticker === (network === 'bitcoin' ? 'BTC' : 'ETH'));
      let bal = 0;
      try { bal = await fetchBalance(network, address); } catch (e) { console.warn('Saldo non disponibile', e); }
      const px = ins ? (d.prices.find((p) => p.instrument_id === ins.id)?.price ?? 0) : 0;
      const w: Wallet = { id: uid('w'), network, address_or_xpub: address.trim(), label: label || (network === 'bitcoin' ? 'Bitcoin' : 'Ethereum'), cached_balance: bal, balance_updated_at: Date.now(), cost_basis: bal * px };
      await repos.wallets.upsert(w);
      set((x) => ({ ...x, wallets: [...x.wallets, w] }));
      setUi({ sheet: null, screen: 'inv' });
    },

    async refreshWallets() {
      for (const w of get().wallets) {
        try {
          const bal = await fetchBalance(w.network, w.address_or_xpub);
          const row = { ...w, cached_balance: bal, balance_updated_at: Date.now() };
          await repos.wallets.upsert(row);
          set((x) => ({ ...x, wallets: x.wallets.map((y) => (y.id === w.id ? row : y)) }));
        } catch { /* offline o indirizzo dimostrativo: si tiene il saldo in cache */ }
      }
    },

    async updatePrices(list: Price[]) {
      if (!list.length) return;
      const d = get();
      const before = Object.fromEntries(d.prices.map((p) => [p.instrument_id, p]));
      await repos.prices.upsert(list);
      set((x) => {
        let prices = x.prices;
        for (const p of list) prices = upsertIn(prices, p, 'instrument_id');
        return { ...x, prices };
      });
      // Movimenti di mercato: variazione giornaliera oltre il 3% (una volta al giorno per titolo).
      if (derive(get()).prefs.market) {
        for (const p of list) {
          const ch = (p.price / p.prev_close - 1) * 100;
          const was = before[p.instrument_id];
          if (Math.abs(ch) < 3 || (was && Math.abs(was.price / was.prev_close - 1) * 100 >= 3)) continue;
          const ins = d.instruments.find((i) => i.id === p.instrument_id);
          await notify({ type: 'market', icon: ch < 0 ? 'trending-down' : 'trending-up', target_screen: 'inv', dedupe_key: `market:${p.instrument_id}:${iso(new Date())}`, title: `${ins?.ticker ?? ''} ${ch < 0 ? '−' : '+'}${Math.abs(ch).toFixed(1).replace('.', ',')}% oggi`, body: 'È solo per tenerti informato: nessuna azione richiesta.' });
        }
      }
    },

    async setFundNav(nav: number) {
      const fi = get().instruments.find((i) => i.kind === 'fondo');
      if (fi && nav > 0) await setPrice({ instrument_id: fi.id, price: nav, prev_close: nav, updated_at: Date.now() });
    },

    async addToGoal(goalId: string, amount: number) {
      const g = get().goals.find((x) => x.id === goalId);
      if (!g) return;
      const row: Goal = { ...g, saved: Math.min(g.target, g.saved + amount) };
      await repos.goals.upsert(row);
      set((x) => ({ ...x, goals: x.goals.map((y) => (y.id === goalId ? row : y)) }));
    },

    async setPref(key: PrefKey, enabled: boolean) {
      await repos.prefs.upsert({ key, enabled });
      set((x) => ({ ...x, notification_prefs: upsertIn(x.notification_prefs, { key, enabled }, 'key') }));
    },

    async markRead(id: string) {
      const n = get().notifications.find((x) => x.id === id);
      if (!n || n.read) return;
      const row = { ...n, read: true };
      await repos.notifications.upsert(row);
      set((x) => ({ ...x, notifications: x.notifications.map((y) => (y.id === id ? row : y)) }));
    },

    async markAllRead() {
      const rows = get().notifications.map((n) => ({ ...n, read: true }));
      await repos.notifications.upsert(rows);
      set((x) => ({ ...x, notifications: rows }));
    },

    /** Conferma PAC: aggiunge quote pari a importo / prezzo corrente. */
    async confirmPac(notifId: string | null, paymentId: string) {
      const d = get();
      const pay = d.scheduled_payments.find((p) => p.id === paymentId);
      const ins = pay?.instrument_id ? d.instruments.find((i) => i.id === pay.instrument_id) : undefined;
      if (!pay || !ins) return;
      const px = d.prices.find((p) => p.instrument_id === ins.id)?.price ?? 0;
      if (px <= 0) return;
      await addOperation({ instrument_id: ins.id, date: iso(new Date()), side: 'buy', qty: +(pay.amount / px).toFixed(3), price: px, fees: 0 });
      const n = notifId ? d.notifications.find((x) => x.id === notifId) : d.notifications.find((x) => x.action_ref === paymentId && !x.done);
      if (n) {
        const row = { ...n, read: true, done: true };
        await repos.notifications.upsert(row);
        set((x) => ({ ...x, notifications: x.notifications.map((y) => (y.id === row.id ? row : y)) }));
      }
    },

    async finishOnboarding() {
      await repos.settings.upsert({ key: 'onboarded', value: '1' });
      set((x) => ({ ...x, settings: upsertIn(x.settings, { key: 'onboarded', value: '1' }, 'key') }));
      setUi({ onboarding: -1, screen: 'home' });
    },

    async exportDump(): Promise<Dump> { return dumpAll(repos.db); },

    async importDump(dump: Dump) {
      await restoreAll(repos.db, dump);
      set(() => ({ ...EMPTY, ...dump }));
    },

    /** Cancella tutto tranne categorie/budget e preferenze notifiche. */
    async resetToEmpty() {
      const cur = get();
      const next: Dump = { ...EMPTY, categories: cur.categories, notification_prefs: cur.notification_prefs, settings: [{ key: 'onboarded', value: '1' }] };
      await restoreAll(repos.db, next);
      set(() => next);
    },

    async setSetting(key: string, value: string) {
      await repos.settings.upsert({ key, value });
      set((x) => ({ ...x, settings: upsertIn(x.settings, { key, value }, 'key') }));
    },

    /** PAC del mese corrente da confermare: crea la notifica in app il giorno del PAC. */
    async ensurePacReminders() {
      const d = get();
      if (!derive(d).prefs.pac) return;
      const now = new Date();
      for (const p of d.scheduled_payments.filter((x) => x.is_pac)) {
        if (p.day_of_month > now.getDate()) continue;
        const mk = monthKey(now);
        const month = now.toLocaleString('it-IT', { month: 'long' });
        await notify({
          type: 'pac', icon: 'trending-up', target_screen: 'inv', action: 'Conferma PAC', action_ref: p.id, dedupe_key: `pac:${p.id}:${mk}`,
          title: `Hai fatto il PAC di ${month}?`, body: `${p.name.replace(/^PAC\s*/, '')} · ${eur(p.amount)} programmati il ${p.day_of_month} ${month}. Confermalo per aggiornare le quote.`,
        }, false);
      }
    },

    async snapshotNetWorth() {
      const d = get();
      const row = { date: iso(new Date()), total: +derive(d).net.toFixed(2) };
      await repos.snapshots.upsert(row);
      set((x) => ({ ...x, networth_snapshots: upsertIn(x.networth_snapshots, row, 'date') }));
    },
  };
}

export function StoreProvider({ children, db: injected }: { children: ReactNode; db?: Database }) {
  const [ready, setReady] = useState(false);
  const [data, setData] = useState<Dump>(EMPTY);
  const [ui, setUiState] = useState<UI>({ screen: 'home', sheet: null, notifOpen: false, onboarding: -1, pricesAt: Date.now(), priceError: null, editAccount: null });
  const dataRef = useRef(data);
  dataRef.current = data;
  const reposRef = useRef<Repos | null>(null);

  const set: SetData = useCallback((fn) => setData((d) => { const n = fn(d); dataRef.current = n; return n; }), []);
  const setUi = useCallback((p: Partial<UI>) => setUiState((u) => ({ ...u, ...p })), []);
  const go = useCallback((screen: Screen) => setUiState((u) => ({ ...u, screen, sheet: null, notifOpen: false })), []);

  const [actions, setActions] = useState<ReturnType<typeof makeActions> | null>(null);

  // Avvio: apre il database, crea i dati di esempio al primo avvio.
  useEffect(() => {
    let alive = true;
    (async () => {
      const db = injected ?? (await openDatabase());
      const repos = createRepos(db);
      reposRef.current = repos;
      let dump = await dumpAll(db);
      const fresh = !dump.settings.length;
      if (fresh && import.meta.env.VITE_DEMO_SEED !== '0') {
        dump = buildSeed();
        await restoreAll(db, dump);
      }
      if (!alive) return;
      dataRef.current = dump;
      setData(dump);
      const a = makeActions(repos, () => dataRef.current, set, setUi);
      setActions(a);
      const onboarded = dump.settings.some((s) => s.key === 'onboarded');
      const params = new URLSearchParams(location.search);
      setUiState((u) => ({
        ...u,
        onboarding: params.has('onboarding') ? 0 : onboarded ? -1 : 0,
        notifOpen: params.has('notifiche'),
        screen: (params.get('screen') as Screen) || u.screen,
      }));
      setReady(true);
      await a.ensurePacReminders();
      await a.snapshotNetWorth();
    })().catch((e) => console.error(e));
    return () => { alive = false; };
  }, [injected, set, setUi]);

  // Prezzi: all'apertura e poi a intervalli.
  useEffect(() => {
    if (!actions) return;
    let stop = false;
    const tick = async () => {
      try {
        const d = dataRef.current;
        const { prices } = await refreshPrices(d.instruments, Object.fromEntries(d.prices.map((p) => [p.instrument_id, p])));
        if (stop) return;
        await actions.updatePrices(prices);
        setUi({ pricesAt: Date.now(), priceError: prices.length ? null : 'Quotazioni non raggiungibili, mostro gli ultimi prezzi salvati.' });
      } catch {
        setUi({ priceError: 'Quotazioni non raggiungibili, mostro gli ultimi prezzi salvati.' });
      }
    };
    tick();
    actions.refreshWallets();
    const id = setInterval(tick, refreshIntervalMs());
    return () => { stop = true; clearInterval(id); };
  }, [actions, setUi]);

  // Google Pay (listener nativo) e azioni delle notifiche di sistema.
  useEffect(() => {
    if (!actions) return;
    const offs: (() => void)[] = [];
    registerActions().catch(() => undefined);
    startWalletListener((n) => { actions.ingestWalletNotification(n); }).then((off) => offs.push(off));
    onNotificationAction((actionId, extra) => {
      if (actionId === 'confirm' && extra.paymentId) actions.confirmPac(null, extra.paymentId);
      else if (extra.screen) go(extra.screen as Screen);
    }).then((off) => offs.push(off));
    return () => offs.forEach((f) => f());
  }, [actions, go]);

  const d = useMemo(() => derive(data), [data]);

  // Riprogramma le notifiche locali quando cambiano pagamenti o preferenze.
  const prefsKey = JSON.stringify(d.prefs);
  useEffect(() => {
    if (!ready) return;
    rescheduleAll(data.scheduled_payments, JSON.parse(prefsKey)).catch(() => undefined);
  }, [ready, data.scheduled_payments, prefsKey]);

  if (!actions || !ready) return <div className="boot">patrimonio<span className="acc">.</span></div>;
  return <Ctx.Provider value={{ ready, data, d, ui, setUi, go, actions }}>{children}</Ctx.Provider>;
}
