import { useState } from 'react';
import type { Operation } from '../data/types';
import { positionFromOps } from '../domain/calc';
import { shortDate } from '../lib/dates';
import { cryptoQty, eur, num, parseDecimal, qty } from '../lib/format';
import { rankEur, searchSymbols, type SymbolCandidate } from '../services/prices';
import { useStore } from '../store';
import { Chips, Field, Sheet } from './ui';

function OpRow({ op, crypto }: { op: Operation; crypto: boolean }) {
  const { actions } = useStore();
  const [edit, setEdit] = useState(false);
  const [side, setSide] = useState<'Acquisto' | 'Vendita'>(op.side === 'buy' ? 'Acquisto' : 'Vendita');
  const [q, setQ] = useState(num(op.qty, crypto ? 8 : 4).replace(/0+$/, '').replace(/,$/, ''));
  const [p, setP] = useState(num(op.price, 4).replace(/0+$/, '').replace(/,$/, ''));
  const [date, setDate] = useState(op.date);
  const [err, setErr] = useState<string | null>(null);

  if (!edit) {
    return (
      <div className="row pressable" onClick={() => setEdit(true)} style={{ display: 'grid', gridTemplateColumns: '52px minmax(0,1fr) auto', gap: 10, alignItems: 'center', padding: '10px 0' }}>
        <span className="mono muted" style={{ fontSize: 12 }}>{shortDate(op.date)}</span>
        <span className="mono" style={{ fontSize: 13 }}>{op.side === 'buy' ? 'Acquisto' : 'Vendita'} · {crypto ? cryptoQty(op.qty) : qty(op.qty)} × {eur(op.price)}</span>
        <span className="mono" style={{ fontSize: 13 }}>{eur(op.qty * op.price)}</span>
      </div>
    );
  }
  const save = async () => {
    const qv = parseDecimal(q), pv = parseDecimal(p);
    if (!(qv > 0) || !(pv > 0)) return setErr('Quantità e prezzo devono essere maggiori di zero.');
    await actions.updateOperation({ ...op, side: side === 'Acquisto' ? 'buy' : 'sell', qty: qv, price: pv, date });
    setEdit(false);
  };
  return (
    <div className="row" style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '12px 0' }}>
      <Chips options={['Acquisto', 'Vendita'] as const} value={side} onChange={setSide} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <Field label="Quantità"><input className="input mono" inputMode="decimal" value={q} onChange={(e) => { setQ(e.target.value); setErr(null); }} /></Field>
        <Field label="Prezzo"><input className="input mono" inputMode="decimal" value={p} onChange={(e) => { setP(e.target.value); setErr(null); }} /></Field>
      </div>
      <Field label="Data"><input className="input mono" type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ colorScheme: 'dark' }} /></Field>
      {err && <span className="err">{err}</span>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn xs" onClick={save}>Salva operazione</button>
        <button className="btn-ghost xs" onClick={() => setEdit(false)}>Annulla</button>
        <button className="btn-ghost xs" style={{ color: 'var(--neg)' }} onClick={() => { if (confirm('Eliminare questa operazione?')) actions.deleteOperation(op.id); }}>Elimina</button>
      </div>
    </div>
  );
}

export function InstrumentSheet({ desktop }: { desktop: boolean }) {
  const { data, ui, setUi, actions } = useStore();
  const ins = data.instruments.find((i) => i.id === ui.editId);
  const [name, setName] = useState(ins?.name ?? '');
  const [ticker, setTicker] = useState(ins?.ticker ?? '');
  const [isin, setIsin] = useState(ins?.isin ?? '');
  const [symbol, setSymbol] = useState(ins?.price_symbol ?? '');
  const [manual, setManual] = useState('');
  const [cands, setCands] = useState<SymbolCandidate[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const close = () => setUi({ sheet: null, editId: null });
  if (!ins) return null;

  const crypto = ins.kind === 'crypto', fund = ins.kind === 'fondo';
  const ops = data.operations.filter((o) => o.instrument_id === ins.id).sort((a, b) => b.date.localeCompare(a.date));
  const pos = positionFromOps(ins, data.operations);
  const price = data.prices.find((p) => p.instrument_id === ins.id);
  const err = ui.priceErrors[ins.id];

  const search = async () => {
    setSearching(true); setMsg(null);
    try {
      const list = rankEur(await searchSymbols(isin.trim() || ticker.trim() || name.trim()));
      setCands(list);
      if (!list.length) setMsg({ ok: false, t: 'Nessun risultato: prova con il ticker o scrivi il simbolo a mano (es. VWCE.DE).' });
    } catch (e) {
      setMsg({ ok: false, t: `Ricerca non riuscita: ${(e as Error).message}` });
    } finally {
      setSearching(false);
    }
  };

  const save = async () => {
    if (!ticker.trim()) return setMsg({ ok: false, t: 'Il ticker non può essere vuoto.' });
    const isinV = isin.trim().toUpperCase();
    if (isinV && !/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isinV)) return setMsg({ ok: false, t: 'ISIN non valido (12 caratteri, es. IE00BK5BQT80).' });
    const symbolChanged = (symbol.trim() || null) !== ins.price_symbol || isinV !== (ins.isin ?? '');
    await actions.updateInstrument({ ...ins, name: name.trim() || ticker.trim().toUpperCase(), ticker: ticker.trim().toUpperCase(), isin: isinV || null, price_symbol: symbol.trim() || null });
    const mv = parseDecimal(manual);
    if (mv > 0) await actions.setManualPrice(ins.id, mv);
    close();
    if (symbolChanged && !fund) void actions.refreshPricesNow();
  };

  return (
    <Sheet onClose={close} desktop={desktop}>
      <div className="between"><span style={{ fontSize: 18, fontWeight: 600 }}>Modifica {fund ? 'fondo' : 'titolo'}</span><button className="link muted" onClick={close}>Annulla</button></div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span className="big28">{eur(pos.qty * (price?.price ?? pos.pmc))}</span>
        <span className="mono muted" style={{ fontSize: 13 }}>{crypto ? cryptoQty(pos.qty) : qty(pos.qty)} × {price ? eur(price.price) : '—'} · PMC {eur(pos.pmc)}</span>
      </div>
      <div className="muted" style={{ fontSize: 12 }}>
        {price ? `Prezzo aggiornato il ${new Date(price.updated_at).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : 'Nessun prezzo salvato'}
      </div>
      {err && !fund && <div className="warn">Prezzo non aggiornato: {err}</div>}

      <Field label="Nome"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <div style={{ display: 'grid', gridTemplateColumns: fund || crypto ? '1fr' : '1fr 1fr', gap: 10 }}>
        <Field label="Ticker"><input className="input mono" value={ticker} onChange={(e) => setTicker(e.target.value)} autoCapitalize="characters" /></Field>
        {!fund && !crypto && <Field label="ISIN"><input className="input mono" value={isin} onChange={(e) => setIsin(e.target.value)} autoCapitalize="characters" placeholder="IE00…" /></Field>}
      </div>

      {!fund && (
        <Field label={crypto ? 'ID CoinGecko' : 'Simbolo di quotazione'}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="input mono" style={{ flex: 1 }} value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder={crypto ? 'es. bitcoin' : 'es. VWCE.DE (vuoto = automatico)'} autoCapitalize="off" spellCheck={false} />
            {!crypto && <button className="btn-ghost" disabled={searching} onClick={search}>{searching ? 'Cerco…' : 'Cerca'}</button>}
          </div>
        </Field>
      )}
      {cands && cands.length > 0 && (
        <div className="card list" style={{ padding: '0 14px' }}>
          {cands.slice(0, 6).map((c) => (
            <div key={c.symbol} className="row pressable" onClick={() => { setSymbol(c.symbol); if (!name || name === 'Aggiunto da te') setName(c.name); setCands(null); }}
              style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0,1fr) auto', gap: 10, alignItems: 'center', padding: '10px 0' }}>
              <span className="mono" style={{ fontWeight: 600 }}>{c.symbol}</span>
              <span className="muted ellipsis" style={{ fontSize: 12 }}>{c.name}</span>
              <span className="muted" style={{ fontSize: 11 }}>{c.exchange}</span>
            </div>
          ))}
        </div>
      )}

      <Field label={fund ? 'Valore quota' : 'Prezzo manuale (opzionale)'}>
        <input className="input mono" inputMode="decimal" value={manual} onChange={(e) => setManual(e.target.value)} placeholder={price ? num(price.price) : '€ 0,00'} />
      </Field>

      {msg && <span style={{ fontSize: 12, color: msg.ok ? 'var(--accent)' : 'var(--neg)' }}>{msg.t}</span>}
      <button className="btn" onClick={save}>Salva</button>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div className="kicker" style={{ paddingBottom: 4 }}>Operazioni · tocca per modificare</div>
        {ops.map((o) => <OpRow key={o.id} op={o} crypto={crypto} />)}
        {ops.length === 0 && <div className="muted" style={{ fontSize: 13, padding: '8px 0' }}>Nessuna operazione.</div>}
      </div>

      <button className="btn-ghost" style={{ color: 'var(--neg)' }} onClick={() => { if (confirm(`Eliminare ${ins.ticker} e tutte le sue operazioni?`)) actions.deleteInstrument(ins.id); }}>Elimina {fund ? 'fondo' : 'titolo'}</button>
    </Sheet>
  );
}

export function WalletEditSheet({ desktop }: { desktop: boolean }) {
  const { data, ui, setUi, actions } = useStore();
  const w = data.wallets.find((x) => x.id === ui.editId);
  const [label, setLabel] = useState(w?.label ?? '');
  const close = () => setUi({ sheet: null, editId: null });
  if (!w) return null;
  return (
    <Sheet onClose={close} desktop={desktop}>
      <div className="between"><span style={{ fontSize: 18, fontWeight: 600 }}>Wallet {w.network === 'bitcoin' ? 'Bitcoin' : 'Ethereum'}</span><button className="link muted" onClick={close}>Annulla</button></div>
      <Field label="Etichetta"><input className="input" value={label} onChange={(e) => setLabel(e.target.value)} /></Field>
      <Field label="Indirizzo pubblico"><div className="mono muted" style={{ fontSize: 12, wordBreak: 'break-all' }}>{w.address_or_xpub}</div></Field>
      <div className="muted" style={{ fontSize: 12 }}>Saldo letto: {cryptoQty(w.cached_balance)} · {new Date(w.balance_updated_at).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn" style={{ flex: 1 }} onClick={async () => { await actions.updateWallet({ ...w, label: label.trim() || w.label }); close(); }}>Salva</button>
        <button className="btn-ghost" style={{ color: 'var(--neg)' }} onClick={() => { if (confirm('Rimuovere questo wallet?')) actions.deleteWallet(w.id); }}>Rimuovi</button>
      </div>
    </Sheet>
  );
}
