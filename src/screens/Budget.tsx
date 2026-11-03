import { useState } from 'react';
import { Bar, Card, Kicker, Seg } from '../components/ui';
import { spentByCategory } from '../domain/calc';
import { capitalize, daysInMonth, monthKey, MONTHS_LONG } from '../lib/dates';
import { eur } from '../lib/format';
import { useStore } from '../store';

export function useBudgets(month: Date) {
  const { data } = useStore();
  const mk = monthKey(month);
  const spent = spentByCategory(data.transactions.filter((t) => t.date.startsWith(mk)));
  return [...data.categories].sort((a, b) => a.sort - b.sort).map((c) => {
    const sp = spent[c.name] ?? 0;
    const over = sp > c.monthly_budget;
    return { ...c, spent: sp, over, pct: c.monthly_budget > 0 ? sp / c.monthly_budget * 100 : 0 };
  });
}

export function Budget() {
  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const [which, setWhich] = useState<'prev' | 'cur'>('cur');
  const month = which === 'cur' ? now : prev;
  const budgets = useBudgets(month);
  const bS = budgets.reduce((a, b) => a + b.spent, 0);
  const bT = budgets.reduce((a, b) => a + b.monthly_budget, 0);
  const pctUsed = bT > 0 ? Math.round(bS / bT * 100) : 0;

  return (
    <div className="stack">
      <Card>
        <div className="between" style={{ flexWrap: 'wrap' }}>
          <Kicker>Totale del mese</Kicker>
          <Seg options={[['prev', capitalize(MONTHS_LONG[prev.getMonth()])], ['cur', capitalize(MONTHS_LONG[now.getMonth()])]]} value={which} onChange={setWhich} />
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <span className="big">{eur(bS)}</span>
          <span className="mono muted">di {eur(bT)}</span>
        </div>
        <Bar pct={bT ? bS / bT * 100 : 0} h={8} color={bS > bT ? 'var(--neg)' : undefined} />
        <div className="muted" style={{ fontSize: 13 }}>
          {which === 'cur'
            ? `Giorno ${now.getDate()} di ${daysInMonth(now)} · hai usato il ${pctUsed}% del budget mensile.`
            : `Mese chiuso · ${bS > bT ? 'sforato di ' + eur(bS - bT) : 'avanzati ' + eur(bT - bS)}.`}
        </div>
      </Card>
      <div className="grid">
        {budgets.map((b) => (
          <div key={b.id} className="card" style={{ padding: '18px 20px', gap: 10 }}>
            <div className="between" style={{ alignItems: 'baseline' }}><span style={{ fontWeight: 600 }}>{b.name}</span><span className="mono muted" style={{ fontSize: 12 }}>{Math.round(b.pct)}%</span></div>
            <Bar pct={b.pct} color={b.over ? 'var(--neg)' : undefined} />
            <div className="between" style={{ gap: 8, fontSize: 13 }}>
              <span className="mono">{eur(b.spent)} <span className="muted">/ {eur(b.monthly_budget)}</span></span>
              <span style={{ color: b.over ? 'var(--neg)' : 'var(--muted)', whiteSpace: 'nowrap' }}>{b.over ? `Sforato di ${eur(b.spent - b.monthly_budget)}` : `Restano ${eur(b.monthly_budget - b.spent)}`}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
