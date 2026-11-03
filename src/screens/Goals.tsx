import { Bar } from '../components/ui';
import { monthsToGoal } from '../domain/calc';
import { addMonths, monthYear } from '../lib/dates';
import { eur } from '../lib/format';
import { useStore } from '../store';

export function goalEta(saved: number, target: number, monthly: number, now = new Date()) {
  const m = monthsToGoal(saved, target, monthly);
  if (m === 0) return 'Obiettivo raggiunto, complimenti!';
  if (!Number.isFinite(m)) return 'Imposta un versamento mensile';
  return 'Ci arrivi a ' + monthYear(addMonths(new Date(now.getFullYear(), now.getMonth(), 1), m));
}

export function Goals() {
  const { data, actions, setUi } = useStore();
  const goals = [...data.goals].sort((a, b) => a.sort - b.sort);
  return (
    <div className="grid">
      {goals.map((g) => {
        const p = g.target ? g.saved / g.target * 100 : 0;
        return (
          <div key={g.id} className="card">
            <div className="between pressable" onClick={() => setUi({ sheet: 'goal', editId: g.id })} style={{ alignItems: 'baseline', gap: 8 }}><span style={{ fontWeight: 600, fontSize: 16 }}>{g.name}</span><span className="mono acc">{Math.round(p)}%</span></div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}><span className="big26">{eur(g.saved)}</span><span className="mono muted">di {eur(g.target)}</span></div>
            <Bar pct={p} h={8} />
            <div className="muted" style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 13 }}><span>Versi {eur(g.monthly)} al mese</span><span>{goalEta(g.saved, g.target, g.monthly)}</span></div>
            <button className="btn-ghost" disabled={g.saved >= g.target} onClick={() => actions.addToGoal(g.id, 100)}>+ Versa €100</button>
          </div>
        );
      })}
      <div className="card" style={{ border: '1px dashed var(--border)', background: 'transparent', justifyContent: 'center' }}>
        <span className="muted pretty" style={{ fontSize: 13 }}>{goals.length ? 'Tocca il nome di un obiettivo per modificarlo.' : 'Imposta un traguardo di risparmio e quanto vuoi versare ogni mese: ti diciamo quando lo raggiungi.'}</span>
        <div><button className="btn sm" onClick={() => setUi({ sheet: 'goal', editId: null })}>+ Nuovo obiettivo</button></div>
      </div>
    </div>
  );
}
