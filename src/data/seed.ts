import { addMonths, daysInMonth, iso, parseIso } from '../lib/dates';
import type { Dump } from './repos';
import type { Transaction } from './types';

/**
 * Dati di esempio del prototipo (AppTerminale.dc.html), utili in sviluppo.
 * Le date originali sono relative al 3 novembre 2026; qui vengono spostate sul mese corrente
 * così che "questo mese" abbia sempre dei dati.
 */
const ANCHOR = new Date(2026, 10, 3);

export function buildSeed(now = new Date()): Dump {
  const monthShift = (now.getFullYear() - ANCHOR.getFullYear()) * 12 + now.getMonth() - ANCHOR.getMonth();
  const shift = (s: string) => {
    const d = addMonths(parseIso(s), monthShift);
    const sameMonth = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    if (sameMonth && d.getDate() > now.getDate()) d.setDate(now.getDate());
    return iso(d);
  };
  const ts = (s: string, h = 12) => { const d = parseIso(s); d.setHours(h); return d.getTime(); };
  const base = ts(iso(now), 0) - 1; // i movimenti di esempio sono già inclusi nei saldi manuali

  const accounts: Dump['accounts'] = [
    { id: 'cc', name: 'Conto corrente', subtitle: 'IBAN ···7730', type: 'conto', balance_manual: 6842.3, balance_as_of: base, card_last4: null, gpay_linked: false, sort: 0 },
    { id: 'dep', name: 'Conto deposito', subtitle: 'Vincolato fino a giugno 2027 · 3,1% lordo', type: 'deposito', balance_manual: 15000, balance_as_of: base, card_last4: null, gpay_linked: false, sort: 1 },
    { id: 'cdc', name: 'Carta di credito', subtitle: '···4821 · collegata a Google Pay', type: 'carta', balance_manual: -412.8, balance_as_of: base, card_last4: '4821', gpay_linked: true, sort: 2 },
    { id: 'broker', name: 'Liquidità conto titoli', subtitle: 'Saldo aggiornato da te', type: 'broker_cash', balance_manual: 1250, balance_as_of: base, card_last4: null, gpay_linked: false, sort: 3 },
    { id: 'cash', name: 'Contanti', subtitle: 'Portafoglio', type: 'contanti', balance_manual: 85, balance_as_of: base, card_last4: null, gpay_linked: false, sort: 4 },
  ];

  const categories: Dump['categories'] = [
    ['Spesa', 400], ['Ristoranti', 150], ['Trasporti', 120], ['Casa', 850], ['Shopping', 150], ['Salute', 60], ['Abbonamenti', 60],
  ].map(([n, b], i) => ({ id: String(n).toLowerCase(), name: String(n), monthly_budget: Number(b), sort: i }));

  let n = 0;
  const tx = (date: string, merchant: string, category: string, account_id: string, amount: number, source: Transaction['source'], h = 12): Transaction =>
    ({ id: `seed-${++n}`, date: shift(date), merchant, category, account_id, amount, source, note: null, created_at: ts(shift(date), h) - 86400000 });

  const recent: Transaction[] = [
    tx('2026-11-03', 'Bar Centrale', 'Ristoranti', 'cdc', -3.2, 'gpay', 13),
    tx('2026-11-03', 'Coop', 'Spesa', 'cdc', -46.85, 'gpay', 12),
    tx('2026-11-02', 'PAC VWCE', 'Investimenti', 'cc', -300, 'prog'),
    tx('2026-11-02', 'Trenitalia', 'Trasporti', 'cdc', -24.9, 'gpay'),
    tx('2026-11-01', 'Stipendio', 'Entrate', 'cc', 2450, 'bonifico', 8),
    tx('2026-11-01', 'Pizzeria da Gino', 'Ristoranti', 'cdc', -38, 'gpay', 21),
    tx('2026-10-31', 'Farmacia San Marco', 'Salute', 'cash', -12.4, 'man'),
    tx('2026-10-31', 'Amazon', 'Shopping', 'cdc', -29.99, 'gpay'),
    tx('2026-10-30', 'Internet casa', 'Casa', 'cc', -27.9, 'prog'),
    tx('2026-10-29', 'Distributore Esso', 'Trasporti', 'cdc', -55, 'gpay'),
  ];

  // Storico: ottobre con i totali per categoria del prototipo, giugno–settembre con i totali mensili.
  const oct: Record<string, number> = { Spesa: 362.4, Ristoranti: 178, Trasporti: 74.5, Casa: 877.9, Shopping: 119.99, Salute: 24.4, Abbonamenti: 67.96 };
  const merchants: Record<string, [string, string, Transaction['source']][]> = {
    Spesa: [['Esselunga', 'cdc', 'gpay'], ['Coop', 'cdc', 'gpay'], ['Mercato rionale', 'cash', 'man']],
    Ristoranti: [['Trattoria Al Portico', 'cdc', 'gpay'], ['Bar Centrale', 'cdc', 'gpay']],
    Trasporti: [['Abbonamento ATM', 'cdc', 'gpay'], ['Trenitalia', 'cdc', 'gpay']],
    Casa: [['Affitto', 'cc', 'prog'], ['Bolletta luce', 'cc', 'prog'], ['Internet casa', 'cc', 'prog']],
    Shopping: [['Decathlon', 'cdc', 'gpay'], ['Amazon', 'cdc', 'gpay']],
    Salute: [['Farmacia San Marco', 'cash', 'man']],
    Abbonamenti: [['Netflix', 'cdc', 'prog'], ['Spotify', 'cdc', 'prog'], ['Palestra', 'cc', 'prog']],
  };
  const fixedOct = recent.filter((t) => t.date.slice(0, 7) === shift('2026-10-15').slice(0, 7));
  const history: Transaction[] = [];
  const fill = (monthDate: string, totals: Record<string, number>, income: number, already: Transaction[]) => {
    const m0 = parseIso(monthDate);
    history.push(tx(iso(new Date(m0.getFullYear(), m0.getMonth(), 1)), 'Stipendio', 'Entrate', 'cc', 2450, 'bonifico', 8));
    if (income > 2450) history.push(tx(iso(new Date(m0.getFullYear(), m0.getMonth(), 20)), 'Rimborso spese', 'Entrate', 'cc', +(income - 2450).toFixed(2), 'bonifico'));
    history.push(tx(iso(new Date(m0.getFullYear(), m0.getMonth(), 2)), 'PAC VWCE', 'Investimenti', 'cc', -300, 'prog'));
    for (const [cat, total] of Object.entries(totals)) {
      const left = total - already.filter((t) => t.category === cat).reduce((s, t) => s - t.amount, 0);
      const ms = merchants[cat];
      const parts = cat === 'Casa' ? [Math.min(750, left), left - Math.min(750, left)] : ms.map((_, i) => (i < ms.length - 1 ? +(left / ms.length).toFixed(2) : 0));
      if (cat !== 'Casa') parts[parts.length - 1] = +(left - parts.slice(0, -1).reduce((a, b) => a + b, 0)).toFixed(2);
      parts.forEach((p, i) => {
        if (p <= 0.004) return;
        const [mName, acc, src] = ms[i % ms.length];
        const day = Math.min(daysInMonth(m0), 4 + ((i * 7 + cat.length * 3) % 24));
        history.push(tx(iso(new Date(m0.getFullYear(), m0.getMonth(), day)), mName, cat, acc, -+p.toFixed(2), src));
      });
    }
  };
  // Ottobre: i movimenti recenti di fine ottobre fanno già parte dei totali, si completa il resto.
  fill('2026-10-01', oct, 2600, fixedOct);
  const octSum = Object.values(oct).reduce((a, b) => a + b, 0);
  ([['2026-06-01', 1690], ['2026-07-01', 2120], ['2026-08-01', 1980], ['2026-09-01', 1610]] as const).forEach(([m, tot]) => {
    const scaled: Record<string, number> = {};
    for (const [k, v] of Object.entries(oct)) scaled[k] = +(v / octSum * tot).toFixed(2);
    fill(m, scaled, 2450, []);
  });
  const transactions = [...recent, ...history];

  const instruments: Dump['instruments'] = [
    { id: 'vwce', kind: 'etf', ticker: 'VWCE', isin: 'IE00BK5BQT80', name: 'Vanguard FTSE All-World', color: '#5fbf8a', price_symbol: 'VWCE.DE' },
    { id: 'eimi', kind: 'etf', ticker: 'EIMI', isin: 'IE00BKM4GZ66', name: 'iShares Core MSCI EM IMI', color: 'rgba(95,191,138,0.7)', price_symbol: 'EIMI.L' },
    { id: 'aggh', kind: 'etf', ticker: 'AGGH', isin: 'IE00BDBRDM35', name: 'iShares Core Global Aggregate Bond', color: 'rgba(95,191,138,0.45)', price_symbol: 'AGGH.MI' },
    { id: 'igln', kind: 'etf', ticker: 'IGLN', isin: 'IE00B4ND3602', name: 'iShares Physical Gold', color: 'rgba(95,191,138,0.25)', price_symbol: 'IGLN.L' },
    { id: 'cometa', kind: 'fondo', ticker: 'COMETA', isin: null, name: 'Fondo Cometa · Comparto Reddito', color: 'rgba(95,191,138,0.6)', price_symbol: null },
    { id: 'btc', kind: 'crypto', ticker: 'BTC', isin: null, name: 'Bitcoin', color: 'rgba(95,191,138,0.3)', price_symbol: 'bitcoin' },
    { id: 'eth', kind: 'crypto', ticker: 'ETH', isin: null, name: 'Ethereum', color: 'rgba(95,191,138,0.3)', price_symbol: 'ethereum' },
  ];
  const d0 = shift('2026-01-15');
  const operations: Dump['operations'] = [
    { id: 'op-vwce', instrument_id: 'vwce', date: d0, side: 'buy', qty: 220, price: 104.2, fees: 0 },
    { id: 'op-eimi', instrument_id: 'eimi', date: d0, side: 'buy', qty: 300, price: 29.1, fees: 0 },
    { id: 'op-aggh', instrument_id: 'aggh', date: d0, side: 'buy', qty: 450, price: 4.95, fees: 0 },
    { id: 'op-igln', instrument_id: 'igln', date: d0, side: 'buy', qty: 60, price: 38.5, fees: 0 },
    { id: 'op-cometa', instrument_id: 'cometa', date: d0, side: 'buy', qty: 612.4, price: 12400 / 612.4, fees: 0 },
    { id: 'op-eth', instrument_id: 'eth', date: d0, side: 'buy', qty: 1.2, price: 2900 / 1.2, fees: 0 },
  ];
  const nowTs = now.getTime();
  const prices: Dump['prices'] = [
    ['vwce', 138.6, 138.1], ['eimi', 34.25, 34.4], ['aggh', 5.12, 5.11], ['igln', 61.8, 61.2],
    ['btc', 92150, 90880], ['eth', 3105, 3142], ['cometa', 22.18, 22.18],
  ].map(([id, p, pc]) => ({ instrument_id: String(id), price: Number(p), prev_close: Number(pc), updated_at: id === 'cometa' ? new Date(2026, 8, 30).getTime() : nowTs }));

  const wallets: Dump['wallets'] = [
    { id: 'w-ledger', network: 'bitcoin', address_or_xpub: 'bc1qdemo0000000000000000000000000000007f3k', label: 'Ledger', cached_balance: 0.085, balance_updated_at: nowTs, cost_basis: 5200 },
  ];

  const payments: Dump['scheduled_payments'] = [
    [2, 'PAC VWCE', 300, 'PAC · da confermare', 'trending-up', 'cc', true, 'vwce'],
    [5, 'Netflix', 13.99, 'Streaming', 'tv', 'cdc', false, null],
    [8, 'Ricarica telefono', 10, 'Ricarica', 'smartphone', 'cdc', false, null],
    [10, 'Palestra', 39, 'Abbonamento', 'dumbbell', 'cc', false, null],
    [12, 'Spotify', 10.99, 'Musica', 'music', 'cdc', false, null],
    [15, 'Bolletta luce', 58.4, 'Bolletta', 'zap', 'cc', false, null],
    [16, 'Assicurazione auto', 42.1, 'Assicurazione', 'car', 'cc', false, null],
    [20, 'iCloud+', 2.99, 'Cloud', 'cloud', 'cdc', false, null],
    [27, 'Affitto', 750, 'Casa', 'house', 'cc', false, null],
    [30, 'Internet casa', 27.9, 'Bolletta', 'wifi', 'cc', false, null],
  ].map(([d, name, a, k, i, acc, pac, ins], idx) => ({
    id: `pay-${idx + 1}`, name: String(name), amount: Number(a), day_of_month: Number(d), kind: String(k), icon: String(i),
    account_id: String(acc), is_pac: Boolean(pac), instrument_id: (ins as string | null) ?? null,
  }));

  const goals: Dump['goals'] = [
    { id: 'g1', name: 'Fondo emergenza', saved: 9000, target: 12000, monthly: 300, sort: 0 },
    { id: 'g2', name: 'Viaggio in Giappone', saved: 2100, target: 4500, monthly: 250, sort: 1 },
    { id: 'g3', name: 'Anticipo casa', saved: 15000, target: 40000, monthly: 600, sort: 2 },
  ];

  const at = (daysAgo: number, h: number, m = 0) => { const d = new Date(now); d.setDate(d.getDate() - daysAgo); d.setHours(h, m, 0, 0); return d.getTime(); };
  const pacDay = shift('2026-11-02');
  const notifications: Dump['notifications'] = [
    { id: 'n-pac', type: 'pac', icon: 'trending-up', title: `Hai fatto il PAC di ${monthLong(now)}?`, body: `VWCE · €300 programmati il ${parseIso(pacDay).getDate()} ${monthLong(now)}. Confermalo per aggiornare le quote.`, created_at: at(0, 8), read: false, action: 'Conferma PAC', action_ref: 'pay-1', done: false, target_screen: 'inv', dedupe_key: `pac:pay-1:${pacDay.slice(0, 7)}` },
    { id: 'n-nfx', type: 'pay', icon: 'tv', title: 'Netflix tra 2 giorni', body: '€13,99 dalla carta ···4821.', created_at: at(0, 9), read: false, action: null, action_ref: null, done: false, target_screen: 'cal', dedupe_key: null },
    { id: 'n-coop', type: 'gpay', icon: 'credit-card', title: 'Spesa registrata: Coop', body: '−€46,85 · Spesa. Tocca per cambiare categoria.', created_at: at(0, 12, 41), read: false, action: null, action_ref: null, done: false, target_screen: 'tx', dedupe_key: null },
    { id: 'n-btc', type: 'market', icon: 'trending-down', title: 'BTC −2,1% nelle ultime 24 ore', body: 'Il valore delle tue crypto è sceso, nulla da fare: è solo per tenerti informato.', created_at: at(1, 18), read: true, action: null, action_ref: null, done: false, target_screen: 'inv', dedupe_key: null },
    { id: 'n-week', type: 'weekly', icon: 'calendar-check', title: 'Riepilogo settimanale', body: 'Hai speso €113 questa settimana, il 18% in meno della tua media.', created_at: at(2, 9), read: true, action: null, action_ref: null, done: false, target_screen: 'report', dedupe_key: null },
  ];

  const notification_prefs: Dump['notification_prefs'] = (['pay', 'pac', 'gpay', 'budget', 'market', 'weekly'] as const)
    .map((key) => ({ key, enabled: key !== 'market' }));

  // Snapshot mensili degli ultimi 24 mesi (andamento del prototipo); l'app ne aggiunge uno al giorno.
  const hist: number[] = [];
  for (let i = 0; i < 24; i++) hist.push(46000 + i * 1000 + Math.sin(i * 1.7) * 1500 + Math.cos(i * 0.6) * 900);
  const k = 94670 / hist[23];
  const networth_snapshots: Dump['networth_snapshots'] = hist.slice(0, 23).map((v, i) => ({
    date: iso(addMonths(new Date(now.getFullYear(), now.getMonth(), 1), i - 23)), total: +(v * k).toFixed(2),
  }));

  return {
    accounts, transactions, categories, merchant_rules: [], instruments, operations, wallets, prices,
    scheduled_payments: payments, goals, notifications, notification_prefs, networth_snapshots,
    settings: [{ key: 'user_name', value: 'Marco' }, { key: 'seeded', value: '1' }],
  };
}

function monthLong(d: Date) {
  return ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'][d.getMonth()];
}
