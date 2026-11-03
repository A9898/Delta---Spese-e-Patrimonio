import { describe, expect, it } from 'vitest';
import { createMemoryDb } from '../data/db';
import { createRepos, dumpAll, restoreAll } from '../data/repos';
import { schemaSql } from '../data/schema';
import { buildBaseline, buildSeed } from '../data/seed';
import type { Instrument, Operation } from '../data/types';
import { accountBalance, flowOf, monthsToGoal, positionFromOps, spentByCategory } from '../domain/calc';
import { monthKey } from '../lib/dates';
import { eur, num, parseAmount, parseDecimal, pct, qty } from '../lib/format';
import { decryptBackup, encryptBackup } from '../services/backup';
import { looksLikeSecret, validateAddress } from '../services/blockchain';
import { parseOperationsCsv } from '../services/csvImport';
import { categorize, isDuplicate, parseWalletNotification } from '../services/gpayParser';
import { buildSchedule } from '../services/localNotifications';
import { derive } from '../store';

describe('formato italiano', () => {
  it('formatta euro e percentuali', () => {
    expect(eur(69543.21)).toBe('€69.543,21');
    expect(eur(-412.8)).toBe('−€412,80');
    expect(eur(2450, true)).toBe('+€2.450,00');
    expect(eur(-0.001)).toBe('€0,00');
    expect(pct(1.52)).toBe('+1,52%');
    expect(pct(-0.35)).toBe('−0,35%');
    expect(num(1234567.891)).toBe('1.234.567,89');
    expect(qty(220)).toBe('220');
    expect(qty(2.1646)).toBe('2,165');
    expect(qty(2.5)).toBe('2,5');
  });
  it('interpreta gli importi', () => {
    expect(parseAmount('46,85')).toBe(46.85);
    expect(parseAmount('1.234,50')).toBe(1234.5);
    expect(parseAmount('12.50')).toBe(12.5);
    expect(parseAmount('1.000')).toBe(1000);
    expect(parseAmount('€ 3')).toBe(3);
    expect(parseAmount('')).toBeNaN();
    expect(parseDecimal('0,085')).toBe(0.085);
    expect(parseDecimal('138.6')).toBe(138.6);
  });
});

describe('Google Pay', () => {
  const at = Date.UTC(2026, 10, 3, 12);
  it('estrae commerciante e importo', () => {
    expect(parseWalletNotification({ packageName: 'x', title: 'Coop', text: '€46,85 con Visa ••4821', postedAt: at }))
      .toEqual({ merchant: 'Coop', amount: 46.85, cardLast4: '4821', postedAt: at });
    expect(parseWalletNotification({ packageName: 'x', title: 'Pagamento di 1.046,85 € a Trenitalia', text: '', postedAt: at })?.merchant).toBe('Trenitalia');
    expect(parseWalletNotification({ packageName: 'x', title: 'Pagamento effettuato', text: 'Hai pagato €3,20 presso Bar Centrale con la carta ••4821', postedAt: at }))
      .toMatchObject({ merchant: 'Bar Centrale', amount: 3.2 });
    expect(parseWalletNotification({ packageName: 'x', title: 'Carta aggiunta', text: 'La tua carta è pronta', postedAt: at })).toBeNull();
  });
  it('usa la regex personalizzata', () => {
    const p = parseWalletNotification({ packageName: 'x', title: 'Banca', text: 'Addebito 12,00 EUR esercente FARMACIA ROSSI', postedAt: at }, 'Addebito (?<amount>[0-9.,]+) EUR esercente (?<merchant>.+)');
    expect(p).toMatchObject({ merchant: 'FARMACIA ROSSI', amount: 12 });
  });
  it('deduplica entro 2 minuti', () => {
    const tx = [{ id: '1', date: '2026-11-03', merchant: 'Coop', category: 'Spesa', account_id: 'cdc', amount: -46.85, source: 'gpay' as const, note: null, created_at: at }];
    expect(isDuplicate({ merchant: 'COOP', amount: 46.85, cardLast4: null, postedAt: at + 90_000 }, tx)).toBe(true);
    expect(isDuplicate({ merchant: 'Coop', amount: 46.85, cardLast4: null, postedAt: at + 180_000 }, tx)).toBe(false);
    expect(isDuplicate({ merchant: 'Coop', amount: 46.8, cardLast4: null, postedAt: at }, tx)).toBe(false);
  });
  it('categorizza con regole utente prima di quelle predefinite', () => {
    expect(categorize('Coop Lombardia', [])).toBe('Spesa');
    expect(categorize('Bar Centrale', [])).toBe('Ristoranti');
    expect(categorize('Coop Lombardia', [{ merchant_pattern: 'coop lombardia', category: 'Casa' }])).toBe('Casa');
    expect(categorize('Negozio sconosciuto', [])).toBe('Shopping');
  });
});

describe('calcoli', () => {
  const ins: Instrument = { id: 'v', kind: 'etf', ticker: 'VWCE', isin: null, name: '', color: '', price_symbol: null };
  const op = (side: 'buy' | 'sell', qty: number, price: number, date: string): Operation => ({ id: date + side, instrument_id: 'v', side, qty, price, date, fees: 0 });
  it('PMC come media ponderata degli acquisti', () => {
    const p = positionFromOps(ins, [op('buy', 10, 100, '2026-01-01'), op('buy', 10, 120, '2026-02-01')]);
    expect(p.qty).toBe(20);
    expect(p.pmc).toBe(110);
  });
  it('la vendita riduce il costo al PMC', () => {
    const p = positionFromOps(ins, [op('buy', 10, 100, '2026-01-01'), op('buy', 10, 120, '2026-02-01'), op('sell', 5, 200, '2026-03-01')]);
    expect(p.qty).toBe(15);
    expect(p.pmc).toBeCloseTo(110);
    expect(p.cost).toBeCloseTo(1650);
  });
  it('mesi per raggiungere un obiettivo', () => {
    expect(monthsToGoal(9000, 12000, 300)).toBe(10);
    expect(monthsToGoal(12000, 12000, 300)).toBe(0);
    expect(monthsToGoal(0, 100, 0)).toBe(Infinity);
  });
});

describe('dati di esempio', () => {
  const now = new Date(2026, 10, 3, 14);
  const seed = buildSeed(now);
  const d = derive(seed);
  it('riproducono i valori del prototipo', () => {
    expect(eur(d.liquidity)).toBe('€22.764,50');
    expect(eur(d.etfCost)).toBe('€36.191,50');
    expect(eur(d.etfValue)).toBe('€46.779,00'); // prezzi statici del seed (nel prototipo oscillano)
    expect(eur(d.fund!.value)).toBe('€13.583,03');
    expect(eur(d.cryptoValue)).toBe('€11.558,75');
  });
  it('rispettano i totali di ottobre e novembre', () => {
    const oct = spentByCategory(seed.transactions.filter((t) => t.date.startsWith('2026-10')));
    expect(oct.Spesa).toBeCloseTo(362.4);
    expect(oct.Casa).toBeCloseTo(877.9);
    const f = flowOf(seed.transactions.filter((t) => t.date.startsWith('2026-10')));
    expect(f.income).toBeCloseTo(2600);
    expect(f.spending).toBeCloseTo(1705.15);
    const nov = flowOf(seed.transactions.filter((t) => t.date.startsWith(monthKey(now))));
    expect(nov.income).toBe(2450);
    expect(nov.invested).toBe(300);
    expect(nov.spending).toBeCloseTo(112.95);
  });
  it('si spostano sul mese corrente', () => {
    const later = buildSeed(new Date(2027, 1, 1));
    const feb = later.transactions.filter((t) => t.date.startsWith('2027-02'));
    expect(feb.length).toBe(6);
    expect(feb.every((t) => t.date <= '2027-02-01')).toBe(true);
  });
  it('i movimenti di esempio non alterano i saldi manuali', () => {
    const a = seed.accounts.find((x) => x.id === 'cc')!;
    expect(accountBalance(a, seed.transactions)).toBe(6842.3);
    expect(accountBalance(a, [...seed.transactions, { ...seed.transactions[0], account_id: 'cc', amount: -10, created_at: Date.now() }])).toBeCloseTo(6832.3);
  });
});

describe('database', () => {
  it('upsert, dump e restore', async () => {
    const db = createMemoryDb();
    const r = createRepos(db);
    await restoreAll(db, buildSeed(new Date(2026, 10, 3)));
    await r.goals.upsert({ id: 'g1', name: 'X', saved: 1, target: 2, monthly: 1, sort: 0 });
    const dump = await dumpAll(db);
    expect(dump.goals.find((g) => g.id === 'g1')?.name).toBe('X');
    expect(dump.goals.length).toBe(3);
    await r.goals.remove('g1');
    expect((await r.goals.all()).length).toBe(2);
  });
  it('genera il DDL SQLite', () => {
    const sql = schemaSql();
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS transactions (id TEXT PRIMARY KEY NOT NULL');
    expect(sql).toContain('gpay_linked INTEGER');
  });
});

describe('servizi', () => {
  it('backup cifrato andata e ritorno', async () => {
    const dump = buildSeed(new Date(2026, 10, 3));
    const file = await encryptBackup(dump, 'password-lunga');
    expect(file.data).not.toContain('Coop');
    const back = await decryptBackup(file, 'password-lunga');
    expect(back.transactions.length).toBe(dump.transactions.length);
    await expect(decryptBackup(file, 'sbagliata')).rejects.toThrow('Password errata');
  });
  it('rifiuta seed phrase e chiavi private', () => {
    expect(looksLikeSecret('abandon ability able about above absent absorb abstract absurd abuse access accident')).toBe(true);
    expect(looksLikeSecret('0x' + 'a'.repeat(64))).toBe(true);
    expect(validateAddress('bitcoin', 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq')).toBeNull();
    expect(validateAddress('ethereum', '0x' + 'a'.repeat(40))).toBeNull();
    expect(validateAddress('ethereum', 'ciao')).toBe('Incolla un indirizzo valido.');
  });
  it('importa CSV', () => {
    const { ops, errors } = parseOperationsCsv('Data;ISIN;Tipo;Quantità;Prezzo\n02/11/2026;IE00BK5BQT80;Acquisto;2,164;138,60\n03/11/2026;IE00BK5BQT80;Vendita;1;140\nx;;;;');
    expect(ops).toEqual([
      { date: '2026-11-02', symbol: 'IE00BK5BQT80', side: 'buy', qty: 2.164, price: 138.6 },
      { date: '2026-11-03', symbol: 'IE00BK5BQT80', side: 'sell', qty: 1, price: 140 },
    ]);
    expect(errors.length).toBe(1);
  });
  it('programma le notifiche locali in base alle preferenze', () => {
    const now = new Date(2026, 10, 3, 10);
    const pays = buildSeed(now).scheduled_payments;
    const all = buildSchedule(pays, { pay: true, pac: true, gpay: true, budget: true, market: false, weekly: true }, now);
    const netflix = all.find((n) => n.title === 'Netflix domani')!;
    expect((netflix.schedule!.at as Date).toString()).toBe(new Date(2026, 10, 4, 9).toString());
    expect(all.some((n) => n.actionTypeId === 'PAC_CONFIRM')).toBe(true); // PAC di dicembre
    const none = buildSchedule(pays, { pay: false, pac: false, gpay: true, budget: true, market: false, weekly: false }, now);
    expect(none.length).toBe(0);
  });
});

describe('stato iniziale vuoto', () => {
  it('ha solo categorie, strumenti crypto e preferenze', () => {
    const b = buildBaseline();
    expect(b.accounts.length + b.transactions.length + b.operations.length + b.wallets.length + b.goals.length + b.scheduled_payments.length + b.notifications.length).toBe(0);
    expect(b.categories.map((c) => c.name)).toEqual(['Spesa', 'Ristoranti', 'Trasporti', 'Casa', 'Shopping', 'Salute', 'Abbonamenti']);
    expect(b.instruments.map((i) => i.ticker)).toEqual(['BTC', 'ETH']);
    expect(derive(b).net).toBe(0);
  });
  it('dai dati di esempio tiene preferenze e onboarding, non il nome', () => {
    const b = buildBaseline({ notification_prefs: [{ key: 'market', enabled: true }], settings: [{ key: 'seeded', value: '1' }, { key: 'user_name', value: 'Marco' }, { key: 'onboarded', value: '1' }] });
    expect(b.settings).toEqual([{ key: 'onboarded', value: '1' }]);
    expect(b.notification_prefs).toEqual([{ key: 'market', enabled: true }]);
  });
});
