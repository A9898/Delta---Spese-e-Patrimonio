import { useState } from 'react';
import { Card, Icon, IconTile, Kicker } from '../components/ui';
import type { ScheduledPayment } from '../data/types';
import { capitalize, daysInMonth, MONTHS_LONG, MONTHS_SHORT, payDate } from '../lib/dates';
import { eur } from '../lib/format';
import { useStore } from '../store';

export interface UpcomingPay extends ScheduledPayment { day: number; when: string; rel: string }

/** Pagamenti del mese da oggi in poi, ordinati per giorno. */
export function upcomingPayments(payments: ScheduledPayment[], now = new Date()): UpcomingPay[] {
  const today = now.getDate();
  return payments
    .map((p) => ({ ...p, day: payDate(now, p.day_of_month).getDate() }))
    .filter((p) => p.day >= today)
    .sort((a, b) => a.day - b.day)
    .map((p) => ({ ...p, when: `${p.day} ${MONTHS_SHORT[now.getMonth()]}`, rel: p.day === today ? 'oggi' : `tra ${p.day - today} gg` }));
}

export function Calendar() {
  const { data, setUi } = useStore();
  const edit = (id: string | null) => setUi({ sheet: 'payment', editId: id });
  const now = new Date();
  const today = now.getDate();
  const [sel, setSel] = useState(today);
  const dim = daysInMonth(now);
  const lead = (new Date(now.getFullYear(), now.getMonth(), 1).getDay() + 6) % 7; // settimana da lunedì
  const byDay = new Map<number, ScheduledPayment[]>();
  data.scheduled_payments.forEach((p) => {
    const d = payDate(now, p.day_of_month).getDate();
    byDay.set(d, [...(byDay.get(d) ?? []), p]);
  });
  const up = upcomingPayments(data.scheduled_payments, now);
  const dayPays = byDay.get(sel) ?? [];
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: dim }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);

  return (
    <div className="grid-300" style={{ alignItems: 'start' }}>
      <Card>
        <div className="between" style={{ alignItems: 'baseline' }}>
          <span style={{ fontWeight: 600, fontSize: 16 }}>{capitalize(MONTHS_LONG[now.getMonth()])} {now.getFullYear()}</span>
          <span className="mono muted" style={{ fontSize: 12 }}>{eur(up.reduce((a, p) => a + p.amount, 0))} in arrivo</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4, fontSize: 11, color: 'var(--muted)', textAlign: 'center', fontWeight: 600, letterSpacing: '0.06em' }}>
          {['LUN', 'MAR', 'MER', 'GIO', 'VEN', 'SAB', 'DOM'].map((d) => <span key={d}>{d}</span>)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 }}>
          {cells.map((c, i) => {
            if (c === null) return <span key={i} />;
            const pay = byDay.get(c)?.[0];
            const isSel = c === sel;
            const cls = ['cal-cell', isSel ? 'sel' : '', c === today && !isSel ? 'today' : '', c < today && !isSel ? 'past' : ''].join(' ');
            return (
              <button key={i} className={cls} onClick={() => setSel(c)} aria-label={`${c} ${MONTHS_LONG[now.getMonth()]}${pay ? ', ' + pay.name : ''}`}>
                <span>{c}</span>
                <span style={{ width: 12, height: 12, display: 'flex' }}>{pay && <Icon name={pay.icon} size={12} color={isSel ? 'var(--on-accent)' : 'var(--accent)'} />}</span>
              </button>
            );
          })}
        </div>
        <div style={{ borderTop: '1px solid var(--row)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Kicker>{sel} {MONTHS_LONG[now.getMonth()]}</Kicker>
          {dayPays.map((p) => (
            <div key={p.id} className="between pressable" onClick={() => edit(p.id)}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <IconTile name={p.icon} size={28} />
                <span>{p.name} <span className="muted" style={{ fontSize: 12 }}>· {p.kind}</span></span>
              </span>
              <span className="mono">{eur(p.amount)}</span>
            </div>
          ))}
          {dayPays.length === 0 && <div className="muted" style={{ fontSize: 13 }}>Nessun pagamento previsto. Giornata tranquilla.</div>}
        </div>
      </Card>
      <Card list>
        <div className="kicker" style={{ padding: '14px 0 10px' }}>In arrivo</div>
        {up.map((p) => (
          <div key={p.id} className="row pressable" onClick={() => edit(p.id)} style={{ display: 'grid', gridTemplateColumns: '56px 32px minmax(0,1fr) auto', gap: 12, alignItems: 'center', padding: '11px 0' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><span className="mono" style={{ fontSize: 13 }}>{p.when}</span><span className="muted" style={{ fontSize: 11 }}>{p.rel}</span></div>
            <IconTile name={p.icon} size={32} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}><span className="ellipsis">{p.name}</span><span className="muted" style={{ fontSize: 12 }}>{p.kind}</span></div>
            <span className="mono">{eur(p.amount)}</span>
          </div>
        ))}
        {up.length === 0 && <div className="muted row" style={{ fontSize: 13 }}>{data.scheduled_payments.length ? 'Nessun altro pagamento questo mese.' : 'Aggiungi abbonamenti, bollette e ricariche: ti avvisiamo il giorno prima.'}</div>}
        <div style={{ padding: '14px 0' }}><button className="btn-ghost" onClick={() => edit(null)}>+ Aggiungi pagamento</button></div>
      </Card>
    </div>
  );
}
