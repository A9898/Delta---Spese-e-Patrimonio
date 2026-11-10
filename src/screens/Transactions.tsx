import { useEffect, useState } from 'react';
import { isWalletAccessEnabled, walletListenerAvailable } from '../services/walletListener';
import { Seg, TxRow } from '../components/ui';
import { monthKey } from '../lib/dates';
import { useStore } from '../store';

type Filter = 'tutti' | 'auto' | 'man';

export function Transactions() {
  const { data, setUi, go } = useStore();
  const [access, setAccess] = useState<boolean | null>(null);
  useEffect(() => {
    if (!walletListenerAvailable()) return;
    const check = () => { isWalletAccessEnabled().then(setAccess); };
    check();
    document.addEventListener('visibilitychange', check);
    return () => document.removeEventListener('visibilitychange', check);
  }, []);
  const [filter, setFilter] = useState<Filter>('tutti');
  const card = data.accounts.find((a) => a.gpay_linked);
  const mk = monthKey(new Date());
  const all = [...data.transactions].sort((a, b) => b.date.localeCompare(a.date) || b.created_at - a.created_at);
  const list = filter === 'auto' ? all.filter((t) => t.source === 'gpay') : filter === 'man' ? all.filter((t) => t.source !== 'gpay') : all;
  const autoCount = all.filter((t) => t.source === 'gpay' && t.date.startsWith(mk)).length;
  const accName = (id: string) => data.accounts.find((a) => a.id === id)?.name ?? (id ? '—' : 'Conto titoli');

  return (
    <div className="stack">
      {access === false ? (
        <div className="pressable" onClick={() => go('gpay')} style={{ border: '1px solid var(--border)', background: 'var(--neg-tint)', padding: '14px 16px', display: 'flex', gap: 12, alignItems: 'flex-start', cursor: 'pointer' }}>
          <span style={{ width: 8, height: 8, background: 'var(--neg)', marginTop: 6, flexShrink: 0 }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ fontWeight: 600 }}>Spese automatiche non attive</div>
            <div className="muted pretty" style={{ fontSize: 13 }}>L'app non ha l'accesso alle notifiche, quindi i pagamenti con Google Pay e Revolut non vengono registrati. Tocca per attivarlo.</div>
          </div>
        </div>
      ) : access ? (
        <div className="pressable" onClick={() => go('gpay')} style={{ border: '1px solid var(--border)', background: 'var(--a12)', padding: '14px 16px', display: 'flex', gap: 12, alignItems: 'flex-start', cursor: 'pointer' }}>
          <span style={{ width: 8, height: 8, background: 'var(--accent)', marginTop: 6, flexShrink: 0 }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ fontWeight: 600 }}>Google Pay è collegato</div>
            <div className="muted pretty" style={{ fontSize: 13 }}>
              Quando paghi con {card ? `la carta ···${card.card_last4}` : 'Google Pay o Revolut'} la spesa compare qui con categoria già assegnata. {autoCount} movimenti registrati in automatico questo mese.
            </div>
          </div>
        </div>
      ) : null}
      <div className="between" style={{ flexWrap: 'wrap' }}>
        <Seg options={[['tutti', 'Tutti'], ['auto', 'Google Pay'], ['man', 'Altri']]} value={filter} onChange={setFilter} />
        <div className="mono muted" style={{ fontSize: 12 }}>{list.length} movimenti</div>
      </div>
      <div className="card list">
        {list.map((t) => <TxRow key={t.id} t={t} showDate accountName={accName(t.account_id)} onClick={() => setUi({ sheet: { tx: t.id } })} />)}
        {list.length === 0 && <div className="row muted" style={{ fontSize: 13 }}>Nessun movimento.</div>}
      </div>
    </div>
  );
}
