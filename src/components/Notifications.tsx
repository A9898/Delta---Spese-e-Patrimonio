import { useState } from 'react';
import type { PrefKey } from '../data/types';
import { relTime } from '../lib/dates';
import { useStore } from '../store';
import { IconTile, Toggle } from './ui';

export const PREF_DEFS: [PrefKey, string, string][] = [
  ['pay', 'Pagamenti in arrivo', 'Il giorno prima di ogni addebito programmato'],
  ['pac', 'Conferma PAC', 'È il momento di registrare il versamento'],
  ['gpay', 'Spese registrate', 'A ogni pagamento con Google Pay'],
  ['budget', 'Budget quasi esaurito', "Quando superi l'80% di una categoria"],
  ['market', 'Movimenti di mercato', 'Variazioni oltre il 3% in un giorno'],
  ['weekly', 'Riepilogo settimanale', 'Ogni lunedì mattina'],
];

export function PrefList({ pad = '13px 0' }: { pad?: string }) {
  const { d, actions } = useStore();
  return (
    <>
      {PREF_DEFS.map(([k, l, desc]) => (
        <div key={k} className="row" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 12, alignItems: 'center', padding: pad }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><span style={{ fontWeight: 500 }}>{l}</span><span className="muted" style={{ fontSize: 12 }}>{desc}</span></div>
          <Toggle label={l} on={d.prefs[k]} onClick={() => actions.setPref(k, !d.prefs[k])} />
        </div>
      ))}
    </>
  );
}

export function NotificationCenter({ desktop }: { desktop: boolean }) {
  const { data, setUi, go, actions } = useStore();
  const [tab, setTab] = useState<'recenti' | 'pref'>('recenti');
  const close = () => setUi({ notifOpen: false });
  const list = [...data.notifications].sort((a, b) => b.created_at - a.created_at);
  const tickerOf = (payId: string | null) => {
    const pay = data.scheduled_payments.find((p) => p.id === payId);
    return data.instruments.find((i) => i.id === pay?.instrument_id)?.ticker ?? '';
  };

  return (
    <div onClick={close} style={{ position: 'absolute', inset: 0, zIndex: 15, background: desktop ? 'rgba(0,0,0,0.35)' : 'var(--bg)', display: 'flex', justifyContent: 'flex-end', alignItems: 'flex-start', padding: desktop ? '72px 20px 20px' : 0 }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Notifiche" style={{ width: desktop ? 400 : '100%', height: desktop ? 'auto' : '100%', maxHeight: '100%', background: 'var(--surface)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: 'var(--shadow)', paddingTop: desktop ? 0 : 'env(safe-area-inset-top)' }}>
        <div style={{ padding: '18px 20px 0', display: 'flex', flexDirection: 'column', gap: 14, borderBottom: '1px solid var(--border)' }}>
          <div className="between"><span style={{ fontSize: 18, fontWeight: 600 }}>Notifiche</span><button className="link muted" onClick={close}>Chiudi</button></div>
          <div style={{ display: 'flex', gap: 20 }}>
            {([['recenti', 'Recenti'], ['pref', 'Preferenze']] as const).map(([v, l]) => (
              <button key={v} onClick={() => setTab(v)} style={{ background: 'none', border: 'none', borderBottom: `2px solid ${tab === v ? 'var(--accent)' : 'transparent'}`, color: tab === v ? 'var(--text)' : 'var(--muted)', fontSize: 13, fontWeight: 500, cursor: 'pointer', padding: '0 0 10px' }}>{l}</button>
            ))}
          </div>
        </div>
        {tab === 'recenti' ? (
          <>
            <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
              {list.map((n) => (
                <div key={n.id} className="pressable"
                  onClick={() => { actions.markRead(n.id); if (!n.action || n.done) go(n.target_screen); }}
                  style={{ display: 'grid', gridTemplateColumns: '3px 32px minmax(0,1fr)', gap: 12, padding: '14px 20px 14px 0', borderBottom: '1px solid var(--row)', background: n.read ? 'transparent' : 'var(--a5)' }}>
                  <span style={{ background: n.read ? 'transparent' : 'var(--accent)' }} />
                  <IconTile name={n.icon} size={32} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                    <div className="between" style={{ gap: 10, alignItems: 'flex-start' }}><span style={{ fontWeight: 600, fontSize: 14 }}>{n.title}</span><span className="mono muted" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{relTime(n.created_at)}</span></div>
                    <span className="muted pretty" style={{ fontSize: 13 }}>{n.body}</span>
                    {n.action && !n.done && (
                      <div style={{ display: 'flex', gap: 8, paddingTop: 4 }}>
                        <button className="btn xs" onClick={(e) => { e.stopPropagation(); if (n.action_ref) actions.confirmPac(n.id, n.action_ref); }}>{n.action}</button>
                        <button className="btn-ghost xs" onClick={(e) => { e.stopPropagation(); actions.markRead(n.id); }}>Più tardi</button>
                      </div>
                    )}
                    {n.done && <span className="acc" style={{ fontSize: 12 }}>Confermato · quote {tickerOf(n.action_ref)} aggiornate</span>}
                  </div>
                </div>
              ))}
              {list.length === 0 && <div className="muted" style={{ padding: 20, fontSize: 13 }}>Nessuna notifica.</div>}
            </div>
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)' }}>
              <button className="link" style={{ fontSize: 13 }} onClick={() => actions.markAllRead()}>Segna tutte come lette</button>
            </div>
          </>
        ) : (
          <div style={{ flex: 1, overflow: 'auto', padding: '4px 20px' }}><PrefList /></div>
        )}
      </div>
    </div>
  );
}
