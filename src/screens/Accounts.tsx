import { Card, Kicker } from '../components/ui';
import { eur } from '../lib/format';
import { useStore } from '../store';

export function Accounts() {
  const { data, d, setUi } = useStore();
  const accounts = [...data.accounts].sort((a, b) => a.sort - b.sort);
  const card = accounts.find((a) => a.gpay_linked);
  const lastGpay = data.transactions.filter((t) => t.source === 'gpay').sort((a, b) => b.created_at - a.created_at)[0];
  const syncLabel = lastGpay
    ? new Date(lastGpay.created_at).toDateString() === new Date().toDateString()
      ? `oggi alle ${new Date(lastGpay.created_at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}`
      : new Date(lastGpay.created_at).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })
    : null;

  return (
    <div className="stack">
      <div className="grid">
        <Card style={{ gap: 8 }}>
          <Kicker>Liquidità totale</Kicker>
          <div className="big">{eur(d.liquidity)}</div>
          <div className="muted" style={{ fontSize: 13 }}>{accounts.length} conti, carte e portafogli</div>
        </Card>
        <Card style={{ gap: 10 }}>
          <div className="between">
            <Kicker>Google Pay</Kicker>
            <span className="badge" style={card ? undefined : { background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)' }}>{card ? 'ATTIVO' : 'NON COLLEGATO'}</span>
          </div>
          <div style={{ fontWeight: 600 }}>{card ? `${card.name} ···${card.card_last4}` : 'Nessuna carta collegata'}</div>
          <div className="muted pretty" style={{ fontSize: 13 }}>
            {card
              ? `Ogni pagamento viene registrato e categorizzato da solo.${syncLabel ? ` Ultima sincronizzazione ${syncLabel}.` : ''}`
              : 'Aggiungi una carta e attiva "Collegata a Google Pay" per registrare le spese in automatico.'}
          </div>
        </Card>
      </div>
      <div className="card list">
        {accounts.map((a) => {
          const bal = d.balances[a.id] ?? 0;
          return (
            <div key={a.id} className="row pressable" onClick={() => setUi({ sheet: 'account', editAccount: a.id })} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 12, alignItems: 'center', padding: '14px 0' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                <span style={{ fontWeight: 500 }}>{a.name}</span>
                <span className="muted" style={{ fontSize: 12 }}>{a.subtitle}</span>
              </div>
              <span className="mono" style={{ fontSize: 15, color: bal < 0 ? 'var(--neg)' : 'var(--text)' }}>{eur(bal)}</span>
            </div>
          );
        })}
        <div style={{ padding: '14px 0' }}>
          <button className="btn-ghost" onClick={() => setUi({ sheet: 'account', editAccount: null })}>+ Aggiungi conto o carta</button>
        </div>
      </div>
    </div>
  );
}
