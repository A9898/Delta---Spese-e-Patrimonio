import { useMemo, useState } from 'react';
import { Card, IconTile, Kicker, Seg, TxRow } from '../components/ui';
import { flowOf } from '../domain/calc';
import { addMonths, monthKey, MONTHS_LONG, MONTHS_SHORT } from '../lib/dates';
import { eur, pct } from '../lib/format';
import { useStore } from '../store';
import { upcomingPayments } from './Calendar';

type Range = '6M' | '1A' | '2A';

/** Serie del patrimonio: un punto al mese (ultimo snapshot del mese) + il valore attuale. */
export function useNetSeries(range: Range) {
  const { data, d } = useStore();
  return useMemo(() => {
    const months = { '6M': 6, '1A': 12, '2A': 24 }[range];
    const now = new Date();
    const byMonth = new Map<string, number>();
    [...data.networth_snapshots].sort((a, b) => a.date.localeCompare(b.date)).forEach((s) => byMonth.set(monthKey(s.date), s.total));
    const vals: number[] = [];
    let first: Date | null = null;
    for (let i = months - 1; i >= 1; i--) {
      const m = addMonths(new Date(now.getFullYear(), now.getMonth(), 1), -i);
      const v = byMonth.get(monthKey(m));
      if (v !== undefined) { vals.push(v); if (!first) first = m; }
    }
    vals.push(d.net);
    if (!first) first = now;
    return { vals, start: `${MONTHS_SHORT[first.getMonth()]} ${String(first.getFullYear()).slice(2)}` };
  }, [data.networth_snapshots, d.net, range]);
}

export function NetChart({ vals, height = 180 }: { vals: number[]; height?: number }) {
  const n = vals.length;
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const pts = vals.map((v, i) => `${(n > 1 ? i / (n - 1) : 1) * 600},${(160 - (v - lo) / (hi - lo || 1) * 140).toFixed(1)}`).join(' ');
  return (
    <svg viewBox="0 0 600 170" preserveAspectRatio="none" style={{ width: '100%', height, display: 'block' }} role="img" aria-label="Andamento del patrimonio">
      {[0, 1, 2, 3].map((k) => <line key={k} x1={0} x2={600} y1={20 + k * 46.7} y2={20 + k * 46.7} stroke="#1d2321" strokeWidth={1} vectorEffect="non-scaling-stroke" />)}
      <polygon points={`0,170 ${pts} 600,170`} fill="rgba(95,191,138,0.12)" />
      <polyline points={pts} fill="none" stroke="#5fbf8a" strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function useAllocation() {
  const { d } = useStore();
  const net = d.net || 1;
  return [
    { n: 'ETF', v: d.etfValue, c: 'var(--accent)' },
    { n: 'Fondo Cometa', v: d.fund?.value ?? 0, c: 'rgba(95,191,138,0.6)' },
    { n: 'Crypto', v: d.cryptoValue, c: 'rgba(95,191,138,0.3)' },
    { n: 'Liquidità', v: d.liquidity, c: 'var(--muted)' },
  ].map((a) => ({ ...a, w: Math.max(0, a.v / net * 100) }));
}

export function Home() {
  const { data, d, go } = useStore();
  const [range, setRange] = useState<Range>('1A');
  const { vals, start } = useNetSeries(range);
  const ch = vals[vals.length - 1] - vals[0];
  const alloc = useAllocation();
  const now = new Date();
  const mk = monthKey(now);
  const flow = flowOf(data.transactions.filter((t) => t.date.startsWith(mk)));
  const saved = flow.income > 0 ? Math.round((flow.income - flow.spending) / flow.income * 100) : null;
  const pays = upcomingPayments(data.scheduled_payments, now).slice(0, 4);
  const recent = [...data.transactions].sort((a, b) => b.date.localeCompare(a.date) || b.created_at - a.created_at).slice(0, 5);
  const accName = (id: string) => data.accounts.find((a) => a.id === id)?.name ?? '—';

  return (
    <div className="stack">
      <Card>
        <div className="between" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Kicker>Patrimonio netto</Kicker>
            <div className="hero">{eur(d.net)}</div>
            <div className="mono" style={{ fontSize: 13, color: ch < 0 ? 'var(--neg)' : 'var(--accent)' }}>
              {eur(ch, true)} ({pct(vals[0] ? ch / vals[0] * 100 : 0)}){' '}
              <span className="muted" style={{ fontFamily: 'var(--sans)' }}>{{ '6M': 'negli ultimi 6 mesi', '1A': "nell'ultimo anno", '2A': 'negli ultimi 2 anni' }[range]}</span>
            </div>
          </div>
          <Seg mono options={[['6M', '6M'], ['1A', '1A'], ['2A', '2A']]} value={range} onChange={setRange} />
        </div>
        {vals.length > 1 ? (
          <>
            <NetChart vals={vals} />
            <div className="between mono muted" style={{ fontSize: 11 }}><span>{start}</span><span>oggi</span></div>
          </>
        ) : (
          <div className="muted pretty" style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', border: '1px dashed var(--border)', fontSize: 13, padding: 20 }}>
            L'andamento si costruisce da solo: ogni giorno salviamo il valore del patrimonio. Il grafico compare dal mese prossimo.
          </div>
        )}
      </Card>

      <div className="grid">
        <Card>
          <Kicker>Allocazione</Kicker>
          <div className="stacked" style={{ height: 10 }}>{alloc.map((a) => <div key={a.n} style={{ width: `${a.w}%`, background: a.c }} />)}</div>
          {alloc.map((a) => (
            <div key={a.n} className="between">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 8, height: 8, background: a.c }} />{a.n}</div>
              <div className="mono" style={{ display: 'flex', gap: 12, fontSize: 13 }}><span className="muted">{Math.round(a.w)}%</span><span>{eur(a.v)}</span></div>
            </div>
          ))}
        </Card>
        <Card>
          <Kicker>{MONTHS_LONG[now.getMonth()]} finora</Kicker>
          <div className="between"><span className="muted">Entrate</span><span className="mono acc">{eur(flow.income, true)}</span></div>
          <div className="between"><span className="muted">Spese</span><span className="mono">{eur(-flow.spending)}</span></div>
          <div className="between"><span className="muted">Investito</span><span className="mono">{eur(flow.invested)}</span></div>
          <div className="muted pretty" style={{ borderTop: '1px solid var(--row)', paddingTop: 12, fontSize: 13 }}>
            {saved === null
              ? 'Ancora nessuna entrata registrata questo mese.'
              : saved >= 0
                ? `Finora hai messo da parte il ${saved}% di quello che è entrato. ${saved >= 20 ? 'Ottimo inizio di mese.' : 'Tieni d’occhio le spese.'}`
                : `Finora hai speso più di quanto è entrato (${eur(flow.spending - flow.income)}).`}
          </div>
        </Card>
        <Card style={{ gap: 10 }}>
          <div className="between">
            <Kicker>Prossimi pagamenti</Kicker>
            <button className="link" onClick={() => go('cal')}>Calendario →</button>
          </div>
          {pays.length === 0 && <div className="muted" style={{ fontSize: 13 }}>Nessun pagamento in arrivo questo mese.</div>}
          {pays.map((p) => (
            <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '48px 28px minmax(0,1fr) auto', gap: 10, alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--row)' }}>
              <span className="mono muted" style={{ fontSize: 12 }}>{p.when}</span>
              <IconTile name={p.icon} size={28} />
              <span className="ellipsis">{p.name}</span>
              <span className="mono" style={{ fontSize: 13 }}>{eur(p.amount)}</span>
            </div>
          ))}
        </Card>
      </div>

      <Card style={{ gap: 4 }}>
        <div className="between" style={{ paddingBottom: 6 }}>
          <Kicker>Ultimi movimenti</Kicker>
          <button className="link" onClick={() => go('tx')}>Vedi tutti →</button>
        </div>
        {recent.map((t) => <TxRow key={t.id} t={t} accountName={accName(t.account_id)} />)}
        {recent.length === 0 && <div className="muted" style={{ fontSize: 13, padding: '8px 0' }}>Nessun movimento.</div>}
      </Card>
    </div>
  );
}
