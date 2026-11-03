import { describe, expect, it } from 'vitest';
import { parseCashew, parseCsv, suggestCategory, toTransactions } from '../services/cashewImport';

const CSV = `account,amount,amount unpaid,currency,title,note,date,income,type,category name,subcategory name,color,icon,emoji,budget,objective,extra
Banca,,-100.0,EUR,PAC ETF,,2026-12-01 10:41:23.000,false,repetitive,Investimenti,,0XFF26A69A,money-bag,,,,repeat every 1 month
Banca,-100.0,,EUR,PAC ETF,,2026-11-01 10:41:23.000,false,repetitive,Investimenti,,0XFF26A69A,money-bag,,,,repeat every 1 month
Contanti,-1.2,,EUR,,,2026-10-22 08:00:00.000,false,default,Mangiare,Colazione,,cutlery,,,,
Contanti,-1.2,,EUR,,,2026-10-22 08:00:00.000,false,default,Mangiare,Colazione,,cutlery,,,,
Banca,2116.0,,EUR,,,2026-09-25 10:00:00.000,true,default,Stipendio,,,cash,,,,
Contanti,2100.0,,EUR,Contanti Trasferire in,"Saldo trasferito
Banca → Contanti",2026-03-01 10:00:00.000,true,default,Correzione saldo,,,charts,,,,
Banca,-2099.9999999999995,,EUR,Banca Trasferito da,"Saldo trasferito
Banca → Contanti",2026-03-01 10:00:00.000,false,default,Correzione saldo,,,charts,,,,
Crypto,0.14379637,,BTC,,"Saldo aggiornato
Crypto: 0,14379637 ₿",2025-12-26 10:00:00.000,true,default,Correzione saldo,,,charts,,,,
Banca,1000.0,,EUR,,"Saldo aggiornato
Banca: 1.000 €",2025-11-28 10:00:00.000,true,default,Correzione saldo,,,charts,,,,
`;

describe('import Cashew', () => {
  it('legge campi con a capo tra virgolette', () => {
    expect(parseCsv('a,b\n"x\ny","z ""q"""\n')).toEqual([['a', 'b'], ['x\ny', 'z "q"']]);
  });
  const plan = parseCashew(CSV, new Date(2026, 10, 3));
  it('salta futuro, altre valute e correzioni, ma le usa per i saldi', () => {
    expect(plan.skipped.future).toBe(1);
    expect(plan.skipped.otherCurrency).toEqual(['Crypto (BTC)']);
    expect(plan.skipped.corrections).toBe(3);
    expect(plan.txs.length).toBe(4);
    const bal = Object.fromEntries(plan.accounts.map((a) => [a.name, a.balance]));
    expect(bal).toEqual({ Banca: 1000 - 2100 + 2116 - 100, Contanti: 2100 - 2.4 });
    expect(plan.accounts.find((a) => a.name === 'Contanti')!.type).toBe('contanti');
  });
  it('id stabili e distinti per righe identiche', () => {
    const again = parseCashew(CSV, new Date(2026, 10, 3));
    expect(again.txs.map((t) => t.id)).toEqual(plan.txs.map((t) => t.id));
    expect(new Set(plan.txs.map((t) => t.id)).size).toBe(4);
  });
  it('usa la sottocategoria come descrizione e suggerisce le categorie', () => {
    expect(plan.txs.find((t) => t.cashewCategory === 'Mangiare')!.merchant).toBe('Colazione');
    const app = ['Spesa', 'Ristoranti', 'Trasporti', 'Casa', 'Shopping', 'Salute', 'Abbonamenti'];
    expect(suggestCategory('Mangiare', false, app)).toBe('Ristoranti');
    expect(suggestCategory('Benzina', false, app)).toBe('Trasporti');
    expect(suggestCategory('Stipendio', true, app)).toBe('Entrate');
    expect(suggestCategory('Investimenti', false, app)).toBe('Investimenti');
    expect(suggestCategory('Fumare', false, app)).toBe('+Fumare');
    const tx = toTransactions(plan, { Mangiare: 'Ristoranti', Investimenti: 'Investimenti', Stipendio: 'Entrate' }, { Banca: 'b', Contanti: 'c' });
    expect(tx.find((t) => t.amount === 2116)).toMatchObject({ category: 'Entrate', account_id: 'b', source: 'man' });
  });
});
