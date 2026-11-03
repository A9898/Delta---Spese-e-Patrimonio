import { useState } from 'react';
import type { AccountType, Network } from '../data/types';
import { iso, shortDate } from '../lib/dates';
import { eur, num, parseAmount, parseDecimal } from '../lib/format';
import { validateAddress } from '../services/blockchain';
import { useStore } from '../store';
import { Chips, Field, Seg, Sheet } from './ui';

const labelStyle = { fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: 'var(--muted)' };

export function ExpenseSheet({ desktop }: { desktop: boolean }) {
  const { data, setUi, actions } = useStore();
  const cats = [...data.categories].sort((a, b) => a.sort - b.sort).map((c) => c.name);
  const ORDER = ['carta', 'conto', 'contanti'];
  const payWith = data.accounts.filter((a) => ORDER.includes(a.type)).sort((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type) || a.sort - b.sort);
  const [amt, setAmt] = useState('');
  const [where, setWhere] = useState('');
  const [cat, setCat] = useState(cats[0] ?? 'Spesa');
  const [acc, setAcc] = useState(payWith.find((a) => a.type === 'carta')?.name ?? payWith[0]?.name ?? '');
  const [err, setErr] = useState(false);
  const close = () => setUi({ sheet: null });
  const save = () => {
    const v = parseAmount(amt);
    if (!(v > 0)) return setErr(true);
    const a = payWith.find((x) => x.name === acc) ?? data.accounts[0];
    actions.addExpense(v, where, cat, a?.id ?? '');
  };
  return (
    <Sheet onClose={close} desktop={desktop}>
      <div className="between"><span style={{ fontSize: 18, fontWeight: 600 }}>Nuova spesa</span><button className="link muted" onClick={close}>Annulla</button></div>
      <div className="field">
        <label style={labelStyle} htmlFor="amt">Importo</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderBottom: `1px solid ${err ? 'var(--neg)' : 'var(--border)'}`, paddingBottom: 6 }}>
          <span className="mono muted" style={{ fontSize: 32 }}>€</span>
          <input id="amt" autoFocus value={amt} onChange={(e) => { setAmt(e.target.value); setErr(false); }} placeholder="0,00" inputMode="decimal"
            style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: 32, padding: 0 }} />
        </div>
        {err && <span className="err">Inserisci un importo maggiore di zero.</span>}
      </div>
      <Field label="Dove"><input className="input" value={where} onChange={(e) => setWhere(e.target.value)} placeholder="es. Panificio Rossi" /></Field>
      <Field label="Categoria"><Chips options={cats} value={cat} onChange={setCat} /></Field>
      <Field label="Pagato con"><Chips options={payWith.map((a) => a.name)} value={acc} onChange={setAcc} /></Field>
      <button className="btn" onClick={save}>Salva spesa</button>
    </Sheet>
  );
}

export function TxSheet({ txId, desktop }: { txId: string; desktop: boolean }) {
  const { data, setUi, actions } = useStore();
  const t = data.transactions.find((x) => x.id === txId);
  const close = () => setUi({ sheet: null });
  if (!t) return null;
  const cats = [...data.categories].sort((a, b) => a.sort - b.sort).map((c) => c.name);
  const options = t.amount < 0 && t.category !== 'Investimenti' ? cats : [t.category];
  const acc = data.accounts.find((a) => a.id === t.account_id);
  return (
    <Sheet onClose={close} desktop={desktop}>
      <div className="between"><span style={{ fontSize: 18, fontWeight: 600 }}>{t.merchant}</span><button className="link muted" onClick={close}>Chiudi</button></div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span className="big" style={{ color: t.amount > 0 ? 'var(--accent)' : 'var(--text)' }}>{eur(t.amount, true)}</span>
        <span className="mono muted">{shortDate(t.date)} · {acc?.name ?? '—'}</span>
      </div>
      <Field label="Categoria"><Chips options={options} value={t.category} onChange={(c) => actions.setTxCategory(t.id, c)} /></Field>
      {t.source === 'gpay' && <div className="muted pretty" style={{ fontSize: 12 }}>Registrato da Google Pay. Se cambi categoria, le prossime spese da {t.merchant} useranno quella nuova.</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn sm" onClick={close}>Fatto</button>
        <button className="btn-ghost" style={{ color: 'var(--neg)' }} onClick={() => { if (confirm('Eliminare questo movimento?')) { actions.deleteTx(t.id); close(); } }}>Elimina</button>
      </div>
    </Sheet>
  );
}

const TYPES: [AccountType, string][] = [['conto', 'Conto corrente'], ['deposito', 'Conto deposito'], ['carta', 'Carta'], ['broker_cash', 'Liquidità broker'], ['contanti', 'Contanti']];

export function AccountSheet({ desktop }: { desktop: boolean }) {
  const { data, d, ui, setUi, actions } = useStore();
  const ex = ui.editAccount ? data.accounts.find((a) => a.id === ui.editAccount) : undefined;
  const [name, setName] = useState(ex?.name ?? '');
  const [sub, setSub] = useState(ex?.subtitle ?? '');
  const [type, setType] = useState<AccountType>(ex?.type ?? 'conto');
  const [bal, setBal] = useState(ex ? num(d.balances[ex.id] ?? 0) : '');
  const [last4, setLast4] = useState(ex?.card_last4 ?? '');
  const [gpay, setGpay] = useState(ex?.gpay_linked ?? false);
  const [err, setErr] = useState<string | null>(null);
  const close = () => setUi({ sheet: null, editAccount: null });
  const save = () => {
    const raw = bal.trim().replace(/^[−-]/, '');
    const v = parseAmount(raw || '0') * (/^[−-]/.test(bal.trim()) ? -1 : 1);
    if (!name.trim()) return setErr('Dai un nome al conto.');
    if (!Number.isFinite(v)) return setErr('Saldo non valido.');
    if (type === 'carta' && last4 && !/^\d{4}$/.test(last4)) return setErr('Le ultime 4 cifre devono essere numeri.');
    actions.saveAccount({ id: ex?.id, name: name.trim(), subtitle: sub.trim() || (type === 'carta' && last4 ? `···${last4}${gpay ? ' · collegata a Google Pay' : ''}` : ''), type, balance_manual: v, card_last4: type === 'carta' ? last4 || null : null, gpay_linked: type === 'carta' && gpay });
  };
  return (
    <Sheet onClose={close} desktop={desktop}>
      <div className="between"><span style={{ fontSize: 18, fontWeight: 600 }}>{ex ? 'Modifica conto' : 'Nuovo conto o carta'}</span><button className="link muted" onClick={close}>Annulla</button></div>
      <Field label="Tipo"><Chips options={TYPES.map((t) => t[1])} value={TYPES.find((t) => t[0] === type)![1]} onChange={(l) => setType(TYPES.find((t) => t[1] === l)![0])} /></Field>
      <Field label="Nome"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="es. Conto corrente" /></Field>
      <Field label="Descrizione"><input className="input" value={sub} onChange={(e) => setSub(e.target.value)} placeholder="es. IBAN ···7730" /></Field>
      <Field label="Saldo attuale"><input className="input mono" inputMode="decimal" value={bal} onChange={(e) => setBal(e.target.value)} placeholder="€ 0,00" /></Field>
      {type === 'carta' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, alignItems: 'end' }}>
          <Field label="Ultime 4 cifre"><input className="input mono" inputMode="numeric" maxLength={4} value={last4} onChange={(e) => setLast4(e.target.value)} placeholder="4821" /></Field>
          <button className={`chip${gpay ? ' on' : ''}`} style={{ padding: '10px 12px' }} onClick={() => setGpay(!gpay)}>{gpay ? '✓ ' : ''}Collegata a Google Pay</button>
        </div>
      )}
      {err && <span className="err">{err}</span>}
      <button className="btn" onClick={save}>Salva</button>
    </Sheet>
  );
}

type Kind = 'ETF' | 'Crypto' | 'Fondo pensione';

export function OperationSheet({ desktop, initialMode }: { desktop: boolean; initialMode: 'op' | 'wallet' }) {
  const { setUi, actions } = useStore();
  const [mode, setMode] = useState(initialMode);
  const [side, setSide] = useState<'Acquisto' | 'Vendita'>('Acquisto');
  const [kind, setKind] = useState<Kind>('ETF');
  const [sym, setSym] = useState('');
  const [q, setQ] = useState('');
  const [p, setP] = useState('');
  const [date, setDate] = useState(iso(new Date()));
  const [pac, setPac] = useState(false);
  const [net, setNet] = useState<'Bitcoin' | 'Ethereum'>('Bitcoin');
  const [addr, setAddr] = useState('');
  const [label, setLabel] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const close = () => setUi({ sheet: null });
  const qv = parseDecimal(q), pv = parseDecimal(p);

  const saveOp = () => {
    if (!(qv > 0) || !(pv > 0) || (kind !== 'Fondo pensione' && !sym.trim())) return setErr('Compila titolo, quantità e prezzo.');
    actions.saveOperation({ side: side === 'Acquisto' ? 'buy' : 'sell', kind, symbol: sym, qty: qv, price: pv, date, monthly: pac });
  };
  const saveWallet = async () => {
    const network: Network = net === 'Bitcoin' ? 'bitcoin' : 'ethereum';
    const e = validateAddress(network, addr);
    if (e) return setErr(e);
    setBusy(true);
    await actions.addWallet(network, addr, label.trim());
    setBusy(false);
  };

  return (
    <Sheet onClose={close} desktop={desktop}>
      <div className="between">
        <Seg options={[['op', 'Operazione'], ['wallet', 'Wallet crypto']]} value={mode} onChange={(m) => { setMode(m); setErr(null); }} />
        <button className="link muted" onClick={close}>Annulla</button>
      </div>
      {mode === 'op' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Chips options={['Acquisto', 'Vendita'] as const} value={side} onChange={setSide} />
          <Field label="Strumento"><Chips options={['ETF', 'Crypto', 'Fondo pensione'] as Kind[]} value={kind} onChange={(k) => { setKind(k); setErr(null); }} /></Field>
          {kind !== 'Fondo pensione' && (
            <Field label="Titolo"><input className="input mono" value={sym} onChange={(e) => { setSym(e.target.value); setErr(null); }} placeholder={kind === 'ETF' ? 'ISIN o ticker, es. IE00BK5BQT80' : 'Simbolo, es. BTC'} /></Field>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Quantità"><input className="input mono" inputMode="decimal" value={q} onChange={(e) => { setQ(e.target.value); setErr(null); }} placeholder="0" /></Field>
            <Field label={kind === 'Fondo pensione' ? 'Valore quota' : 'Prezzo unitario'}><input className="input mono" inputMode="decimal" value={p} onChange={(e) => { setP(e.target.value); setErr(null); }} placeholder="€ 0,00" /></Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, alignItems: 'end' }}>
            <Field label="Data"><input className="input mono" type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ padding: '9px 12px', colorScheme: 'dark' }} /></Field>
            <button onClick={() => setPac(!pac)} disabled={side === 'Vendita'} style={{ display: 'flex', alignItems: 'center', gap: 8, background: pac ? 'var(--accent)' : 'transparent', color: pac ? 'var(--on-accent)' : 'var(--text)', border: `1px solid ${pac ? 'var(--accent)' : 'var(--border)'}`, padding: '10px 12px', fontSize: 13, cursor: 'pointer', textAlign: 'left', whiteSpace: 'nowrap', opacity: side === 'Vendita' ? 0.5 : 1 }}>
              <span style={{ width: 14, height: 14, border: `1px solid ${pac ? 'var(--on-accent)' : 'var(--text)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10 }}>{pac ? '✓' : ''}</span>Ripeti ogni mese
            </button>
          </div>
          <div className="between" style={{ borderTop: '1px solid var(--row)', paddingTop: 12, fontSize: 13 }}><span className="muted">Totale operazione</span><span className="mono">{qv > 0 && pv > 0 ? eur(qv * pv) : '—'}</span></div>
          {err && <span className="err">{err}</span>}
          <div className="muted pretty" style={{ fontSize: 12 }}>Registri solo cosa hai comprato o venduto. Il valore attuale si calcola con le quotazioni di mercato.</div>
          <button className="btn" onClick={saveOp}>Salva operazione</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Field label="Rete"><Chips options={['Bitcoin', 'Ethereum'] as const} value={net} onChange={(n) => { setNet(n); setErr(null); }} /></Field>
          <Field label="Indirizzo pubblico o xpub" error={err}>
            <input className="input mono" value={addr} onChange={(e) => { setAddr(e.target.value); setErr(null); }} placeholder="bc1q… / xpub… / 0x…" autoComplete="off" autoCapitalize="off" spellCheck={false} />
          </Field>
          <Field label="Etichetta"><input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="es. Ledger" /></Field>
          <div className="warn">Serve solo l'indirizzo pubblico, in sola lettura. Non inserire mai la seed phrase o la chiave privata del tuo hardware wallet.</div>
          <div className="muted pretty" style={{ fontSize: 12 }}>Il saldo viene letto dalla blockchain e si aggiorna da solo a ogni movimento del wallet.</div>
          <button className="btn" disabled={busy} onClick={saveWallet}>{busy ? 'Lettura del saldo…' : 'Aggiungi wallet'}</button>
        </div>
      )}
    </Sheet>
  );
}
