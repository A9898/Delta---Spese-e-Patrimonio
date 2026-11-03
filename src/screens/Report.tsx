import { Card, Kicker } from '../components/ui';
import { flowOf, spentByCategory } from '../domain/calc';
import { addMonths, monthKey, MONTHS_LONG, MONTHS_SHORT } from '../lib/dates';
import { eur, pct } from '../lib/format';
import { useStore } from '../store';

export function Report() {
  const { data, d } = useStore();
  const now = new Date();
  const m0 = new Date(now.getFullYear(), now.getMonth(), 1);
  const months = Array.from({ length: 6 }, (_, i) => addMonths(m0, i - 5));
  const flows = months.map((m) => ({ m, ...flowOf(data.transactions.filter((t) => t.date.startsWith(monthKey(m)))) }));
  const prev = flows[4];
  const savingRate = prev.income > 0 ? Math.round((prev.income - prev.spending) / prev.income * 100) : 0;
  const closed = flows.slice(0, 5).filter((f) => f.income || f.spending);
  const avgOut = closed.length ? closed.reduce((a, f) => a + f.spending, 0) / closed.length : 0;
  const snaps = [...data.networth_snapshots].sort((a, b) => a.date.localeCompare(b.date));
  const yearAgo = monthKey(addMonths(m0, -12));
  const base = snaps.find((s) => monthKey(s.date) >= yearAgo);
  const growth = base?.total ? (d.net / base.total - 1) * 100 : 0;
  const maxFlow = Math.max(1, ...flows.map((f) => Math.max(f.income, f.spending))) * 1.04;
  const prevMonth = months[4];
  const cats = Object.entries(spentByCategory(data.transactions.filter((t) => t.date.startsWith(monthKey(prevMonth))))).sort((a, b) => b[1] - a[1]);
  const catMax = Math.max(1, ...cats.map((c) => c[1]));

  const kpis = [
    { l: `Tasso di risparmio · ${MONTHS_SHORT[prevMonth.getMonth()]}`, v: `${savingRate}%` },
    { l: 'Spesa media mensile', v: eur(avgOut) },
    { l: 'Crescita patrimonio · 12 mesi', v: pct(growth) },
  ];

  return (
    <div className="stack">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 16 }}>
        {kpis.map((k) => (
          <div key={k.l} className="card" style={{ padding: '18px 20px', gap: 6 }}>
            <Kicker>{k.l}</Kicker>
            <div className="big26">{k.v}</div>
          </div>
        ))}
      </div>
      <div className="grid-300">
        <Card>
          <div className="between" style={{ flexWrap: 'wrap' }}>
            <Kicker>Entrate e uscite · 6 mesi</Kicker>
            <div className="muted" style={{ display: 'flex', gap: 12, fontSize: 12 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 8, height: 8, background: 'var(--accent)' }} />Entrate</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 8, height: 8, background: 'var(--muted)' }} />Uscite</span>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 10, height: 170, alignItems: 'end', borderBottom: '1px solid var(--border)' }}>
            {flows.map((f) => (
              <div key={f.m.getMonth()} style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: '100%' }} title={`${MONTHS_LONG[f.m.getMonth()]}: entrate ${eur(f.income)}, uscite ${eur(f.spending)}`}>
                <div style={{ flex: 1, height: `${f.income / maxFlow * 100}%`, background: 'var(--accent)' }} />
                <div style={{ flex: 1, height: `${f.spending / maxFlow * 100}%`, background: 'var(--muted)' }} />
              </div>
            ))}
          </div>
          <div className="mono muted" style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 10, fontSize: 11, textAlign: 'center' }}>
            {flows.map((f) => <span key={f.m.getMonth()}>{MONTHS_SHORT[f.m.getMonth()]}</span>)}
          </div>
        </Card>
        <Card style={{ gap: 12 }}>
          <Kicker>Spese per categoria · {MONTHS_LONG[prevMonth.getMonth()]}</Kicker>
          {cats.map(([n, v]) => (
            <div key={n} style={{ display: 'grid', gridTemplateColumns: '96px minmax(0,1fr) 84px', gap: 10, alignItems: 'center', fontSize: 13 }}>
              <span className="ellipsis">{n}</span>
              <div className="bar" style={{ height: 8 }}><div style={{ width: `${v / catMax * 100}%` }} /></div>
              <span className="mono" style={{ textAlign: 'right' }}>{eur(v)}</span>
            </div>
          ))}
          {cats.length === 0 && <div className="muted" style={{ fontSize: 13 }}>Nessuna spesa registrata.</div>}
        </Card>
      </div>
    </div>
  );
}
