import { useEffect, useState } from 'react';
import { Card, Kicker } from '../components/ui';
import { parseIso } from '../lib/dates';
import { cryptoQty, eur, num, parseDecimal, pct, qty } from '../lib/format';
import { parseOperationsCsv } from '../services/csvImport';
import { pickFile } from '../services/backup';
import { useStore } from '../store';

const pn = (v: number) => (v < 0 ? 'var(--neg)' : 'var(--accent)');

export function LiveDot() {
  const [dim, setDim] = useState(false);
  useEffect(() => { const id = setInterval(() => setDim((x) => !x), 2500); return () => clearInterval(id); }, []);
  return <span style={{ width: 7, height: 7, background: 'var(--accent)', display: 'inline-block', opacity: dim ? 0.4 : 1, transition: 'opacity .4s' }} />;
}

export function Investments({ desktop }: { desktop: boolean }) {
  const { d, data, ui, setUi, actions } = useStore();
  const [csvMsg, setCsvMsg] = useState<string | null>(null);
  const [navEdit, setNavEdit] = useState<string | null>(null);
  const time = new Date(ui.pricesAt).toLocaleTimeString('it-IT');
  const pl = d.etfValue - d.etfCost;
  const fundPrice = d.fund ? data.prices.find((p) => p.instrument_id === d.fund!.instrument.id) : undefined;
  const fundDate = fundPrice ? parseIso(new Date(fundPrice.updated_at).toISOString().slice(0, 10)) : null;
  const crPl = d.cryptoValue - d.cryptoCost;
  const fundOps = d.fund ? data.operations.filter((o) => o.instrument_id === d.fund!.instrument.id).length : 0;

  const importCsv = async () => {
    const f = await pickFile('.csv,text/csv');
    if (!f) return;
    const { ops, errors } = parseOperationsCsv(await f.text());
    if (ops.length) await actions.importOperations(ops);
    setCsvMsg(ops.length ? `Importate ${ops.length} operazioni.${errors.length ? ` ${errors.length} righe ignorate.` : ''}` : errors[0] ?? 'Nessuna operazione trovata.');
  };

  return (
    <div className="stack">
      <Card>
        <div className="between" style={{ flexWrap: 'wrap' }}>
          <Kicker>ETF · Conto titoli</Kicker>
          <div className="mono muted" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}><LiveDot /><span>PREZZI · {time}</span></div>
        </div>
        <div className="hero">{eur(d.etfValue)}</div>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 13 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><span className="muted">Guadagno totale</span><span className="mono" style={{ color: pn(pl) }}>{eur(pl, true)} ({pct(d.etfCost ? pl / d.etfCost * 100 : 0)})</span></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><span className="muted">Oggi</span><span className="mono" style={{ color: pn(d.etfDayAbs) }}>{eur(d.etfDayAbs, true)} ({pct(d.etfValue - d.etfDayAbs ? d.etfDayAbs / (d.etfValue - d.etfDayAbs) * 100 : 0)})</span></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><span className="muted">Capitale investito</span><span className="mono">{eur(d.etfCost)}</span></div>
        </div>
        <div className="stacked" style={{ height: 10 }}>{d.etf.map((h) => <div key={h.instrument.id} style={{ width: `${d.etfValue ? h.value / d.etfValue * 100 : 0}%`, background: h.instrument.color }} />)}</div>
        <div className="muted" style={{ fontSize: 12 }}>Quantità registrate da te · prezzi da quotazioni pubbliche per ISIN</div>
        {ui.priceError && <div className="muted" style={{ fontSize: 12 }}>{ui.priceError}</div>}
      </Card>

      <div className="card list">
        {desktop ? (
          <>
            <div className="kicker" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2.4fr) 1fr 1fr 1fr 1.2fr 1.2fr', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
              <span>Titolo</span><span style={{ textAlign: 'right' }}>Quote</span><span style={{ textAlign: 'right' }}>Prezzo</span><span style={{ textAlign: 'right' }}>Oggi</span><span style={{ textAlign: 'right' }}>Valore</span><span style={{ textAlign: 'right' }}>P/L</span>
            </div>
            {d.etf.map((h) => (
              <div key={h.instrument.id} className="row mono" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2.4fr) 1fr 1fr 1fr 1.2fr 1.2fr', gap: 12, padding: '14px 0', alignItems: 'center', fontSize: 13 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, fontFamily: 'var(--sans)' }}>
                  <span style={{ width: 8, height: 8, background: h.instrument.color, flexShrink: 0 }} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                    <span className="mono" style={{ fontWeight: 600 }}>{h.instrument.ticker}</span>
                    <span className="muted ellipsis" style={{ fontSize: 12 }}>{h.instrument.name} · {h.instrument.isin ?? '—'}</span>
                  </div>
                </div>
                <span style={{ textAlign: 'right' }}>{qty(h.qty)}</span>
                <span style={{ textAlign: 'right' }}>{eur(h.price)}</span>
                <span style={{ textAlign: 'right', color: pn(h.dayPct) }}>{pct(h.dayPct)}</span>
                <span style={{ textAlign: 'right' }}>{eur(h.value)}</span>
                <span style={{ textAlign: 'right', color: pn(h.pl) }}>{pct(h.plPct)}</span>
              </div>
            ))}
          </>
        ) : (
          d.etf.map((h) => (
            <div key={h.instrument.id} className="row" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: '6px 12px', padding: '14px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <span style={{ width: 8, height: 8, background: h.instrument.color, flexShrink: 0 }} />
                <span className="mono" style={{ fontWeight: 600 }}>{h.instrument.ticker}</span>
                <span className="muted ellipsis" style={{ fontSize: 12 }}>{h.instrument.name}</span>
              </div>
              <span className="mono" style={{ textAlign: 'right' }}>{eur(h.value)}</span>
              <span className="mono muted" style={{ fontSize: 12 }}>{qty(h.qty)} × {eur(h.price)}</span>
              <span className="mono" style={{ fontSize: 12, textAlign: 'right', color: pn(h.dayPct) }}>{pct(h.dayPct)} oggi</span>
            </div>
          ))
        )}
        {d.etf.length === 0 && <div className="row muted" style={{ fontSize: 13 }}>Nessun ETF registrato.</div>}
      </div>

      <div className="grid-300">
        {d.fund && (
          <Card style={{ gap: 12 }}>
            <div className="between">
              <Kicker>Previdenza · Fondo Cometa</Kicker>
              <button className="badge outline" style={{ cursor: 'pointer' }} onClick={() => setNavEdit(num(d.fund!.price))}>QUOTA MENSILE</button>
            </div>
            <div className="big28">{eur(d.fund.value)}</div>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 13 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><span className="muted">Rendimento</span><span className="mono" style={{ color: pn(d.fund.pl) }}>{eur(d.fund.pl, true)} ({pct(d.fund.plPct)})</span></div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><span className="muted">Posizione</span><span className="mono">{num(d.fund.qty)} quote × {eur(d.fund.price)}</span></div>
            </div>
            {navEdit !== null && (
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="input mono" style={{ flex: 1 }} inputMode="decimal" value={navEdit} onChange={(e) => setNavEdit(e.target.value)} aria-label="Valore quota" />
                <button className="btn xs" onClick={async () => { const v = parseDecimal(navEdit); if (v > 0) { await actions.setFundNav(v); setNavEdit(null); } }}>Aggiorna quota</button>
              </div>
            )}
            <div className="muted" style={{ borderTop: '1px solid var(--row)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
              <span>Comparto Reddito · versi €125 al mese più TFR e quota azienda</span>
              <span style={{ fontSize: 12 }}>Quote registrate da te ({fundOps} versamenti) · valore quota dal sito del fondo{fundDate ? ` (${fundDate.toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })})` : ''}</span>
            </div>
          </Card>
        )}
        <Card style={{ gap: 12 }}>
          <div className="between">
            <Kicker>Crypto</Kicker>
            <button className="link" onClick={() => setUi({ sheet: 'wallet' })}>+ Aggiungi wallet</button>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <span className="big28">{eur(d.cryptoValue)}</span>
            <span className="mono" style={{ fontSize: 13, color: pn(crPl) }}>{eur(crPl, true)} ({pct(d.cryptoCost ? (d.cryptoValue / d.cryptoCost - 1) * 100 : 0)})</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {d.crypto.map((c) => (
              <div key={c.key} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: '4px 12px', padding: '10px 0', borderTop: '1px solid var(--row)' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}><span className="mono" style={{ fontWeight: 600 }}>{c.instrument.ticker}</span><span className="muted" style={{ fontSize: 12 }}>{c.label}</span></div>
                <span className="mono" style={{ textAlign: 'right' }}>{eur(c.value)}</span>
                <span className="mono muted" style={{ fontSize: 12 }}>{cryptoQty(c.qty)} {c.instrument.ticker} × {eur(c.price)}</span>
                <span className="mono" style={{ fontSize: 12, textAlign: 'right', color: pn(c.dayPct) }}>{pct(c.dayPct)} 24h</span>
                <span className="muted" style={{ gridColumn: '1 / -1', fontSize: 11 }}>{c.source}</span>
              </div>
            ))}
            {d.crypto.length === 0 && <div className="muted" style={{ fontSize: 13 }}>Nessuna crypto registrata.</div>}
          </div>
        </Card>
      </div>

      <div style={{ border: '1px dashed var(--border)', padding: '18px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxWidth: 480 }}>
          <span style={{ fontWeight: 600 }}>Aggiorna il portafoglio</span>
          <span className="muted pretty" style={{ fontSize: 13 }}>Nessun collegamento diretto ai broker: registri tu acquisti e vendite, oppure importi il CSV esportato dal broker. Per le crypto basta l'indirizzo pubblico del wallet.</span>
          {csvMsg && <span className="acc" style={{ fontSize: 12 }}>{csvMsg}</span>}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button className="btn sm" onClick={() => setUi({ sheet: 'op' })}>+ Nuova operazione</button>
          <button className="btn-ghost" onClick={importCsv}>Importa CSV</button>
        </div>
      </div>
    </div>
  );
}
