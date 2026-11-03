import { useState } from 'react';
import { shortDate } from '../lib/dates';
import { eur } from '../lib/format';
import { pickFile } from '../services/backup';
import { parseCashew, suggestCategory, type CashewPlan } from '../services/cashewImport';
import { useStore } from '../store';
import { Kicker, Sheet } from './ui';

const selectStyle = { background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', padding: '7px 8px', fontSize: 13, fontFamily: 'inherit', borderRadius: 0, maxWidth: '100%' } as const;

export function ImportCashewSheet({ desktop }: { desktop: boolean }) {
  const { data, setUi, actions, go } = useStore();
  const [plan, setPlan] = useState<CashewPlan | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const close = () => setUi({ sheet: null });
  const appCats = [...data.categories].sort((a, b) => a.sort - b.sort).map((c) => c.name);

  const choose = async () => {
    setErr(null);
    const f = await pickFile('.csv,text/csv,text/comma-separated-values');
    if (!f) return;
    try {
      const p = parseCashew(await f.text());
      if (!p.txs.length) throw new Error('Nessun movimento da importare nel file.');
      setPlan(p);
      setMapping(Object.fromEntries(p.categories.map((c) => [c.name, suggestCategory(c.name, c.income, appCats)])));
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const run = async () => {
    if (!plan) return;
    setBusy(true);
    try {
      const r = await actions.importCashew(plan, mapping);
      setDone(`Importati ${r.added} movimenti${r.updated ? ` (${r.updated} già presenti, aggiornati)` : ''}. ${r.accounts} conti creati${r.keptAccounts ? `, ${r.keptAccounts} già esistenti lasciati con il loro saldo` : ''}${r.categories ? `, ${r.categories} categorie nuove` : ''}.`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet onClose={close} desktop={desktop}>
      <div className="between"><span style={{ fontSize: 18, fontWeight: 600 }}>Importa da Cashew</span><button className="link muted" onClick={close}>Chiudi</button></div>

      {done ? (
        <>
          <div className="acc pretty" style={{ fontSize: 14 }}>{done}</div>
          <div className="muted pretty" style={{ fontSize: 13 }}>Puoi impostare i limiti delle nuove categorie in Budget. Reimportare lo stesso file non crea doppioni.</div>
          <button className="btn" onClick={() => go('tx')}>Vai ai movimenti</button>
        </>
      ) : !plan ? (
        <>
          <div className="muted pretty" style={{ fontSize: 13 }}>
            In Cashew: Impostazioni › Esporta dati › CSV. Poi scegli qui il file. Prima di importare vedi un riepilogo e puoi decidere come abbinare le categorie.
          </div>
          {err && <span className="err">{err}</span>}
          <button className="btn" onClick={choose}>Scegli il file CSV</button>
        </>
      ) : (
        <>
          <div className="mono" style={{ fontSize: 13 }}>{plan.txs.length} movimenti · dal {shortDate(plan.from)} {plan.from.slice(0, 4)} al {shortDate(plan.to)} {plan.to.slice(0, 4)}</div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <Kicker>Conti</Kicker>
            {plan.accounts.map((a) => {
              const exists = data.accounts.some((x) => x.name.toLowerCase() === a.name.toLowerCase());
              return (
                <div key={a.name} className="row" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 10, alignItems: 'center', padding: '10px 0' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                    <span style={{ fontWeight: 500 }}>{a.name}</span>
                    <span className="muted" style={{ fontSize: 12 }}>{a.count} movimenti · {exists ? 'esiste già: saldo invariato' : 'nuovo conto'}</span>
                  </div>
                  <span className="mono" style={{ color: a.balance < 0 ? 'var(--neg)' : 'var(--text)' }}>{eur(a.balance)}</span>
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <Kicker>Categorie</Kicker>
            {plan.categories.map((c) => {
              const v = mapping[c.name];
              const exists = appCats.some((a) => a.toLowerCase() === c.name.toLowerCase());
              const opts = [...appCats, 'Entrate', 'Investimenti'];
              return (
                <div key={c.name} className="row" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 10, alignItems: 'center', padding: '8px 0' }}>
                  <span className="ellipsis">{c.name} <span className="muted mono" style={{ fontSize: 12 }}>· {c.count}</span></span>
                  <select aria-label={`Categoria per ${c.name}`} value={v} onChange={(e) => setMapping({ ...mapping, [c.name]: e.target.value })} style={selectStyle}>
                    {!exists && <option value={`+${c.name}`}>Nuova: {c.name}</option>}
                    {opts.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              );
            })}
          </div>

          <div className="muted pretty" style={{ fontSize: 12 }}>
            Non importati: {plan.skipped.corrections} correzioni di saldo e trasferimenti (servono solo a calcolare i saldi)
            {plan.skipped.future ? `, ${plan.skipped.future} rate future` : ''}
            {plan.skipped.otherCurrency.length ? `, conti in altra valuta: ${plan.skipped.otherCurrency.join(', ')} (aggiungili da Investimenti › Crypto)` : ''}.
          </div>
          {err && <span className="err">{err}</span>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" style={{ flex: 1 }} disabled={busy} onClick={run}>{busy ? 'Importo…' : `Importa ${plan.txs.length} movimenti`}</button>
            <button className="btn-ghost" onClick={() => setPlan(null)}>Altro file</button>
          </div>
        </>
      )}
    </Sheet>
  );
}
