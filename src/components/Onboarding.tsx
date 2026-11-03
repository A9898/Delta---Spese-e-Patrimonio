import { useState } from 'react';
import { useStore } from '../store';
import { NetChart, useAllocation, useNetSeries } from '../screens/Home';
import { useBudgets } from '../screens/Budget';
import { goalEta } from '../screens/Goals';
import { upcomingPayments } from '../screens/Calendar';
import { eur } from '../lib/format';
import { requestNotificationPermission } from '../services/localNotifications';
import { requestWalletAccess } from '../services/walletListener';
import { PrefList } from './Notifications';
import { AutoBadge, Bar, IconTile, Kicker, txMeta } from './ui';

/** Copy esatto dal prototipo (ONB in AppTerminale.dc.html). */
const ONB: [string, string, string, string[]][] = [
  ['Benvenuto', 'Tutto il tuo patrimonio, in un posto solo.', 'Conti, carte, investimenti, fondo pensione e crypto: vedi quanto vale tutto insieme e come cambia nel tempo.', []],
  ['Spese automatiche', 'Paghi con Google Pay, al resto pensiamo noi.', 'Ogni pagamento con la carta collegata viene registrato e categorizzato da solo. Contanti e altre spese li aggiungi in pochi secondi.', ['Categoria assegnata in automatico, la cambi quando vuoi', 'Una notifica per ogni spesa registrata']],
  ['Investimenti', 'Registri cosa possiedi, i prezzi si aggiornano da soli.', 'Nessun collegamento diretto ai broker. Inserisci acquisti e vendite o importa il CSV: il valore si calcola con le quotazioni di mercato.', ['ETF e azioni tramite ISIN o ticker', 'Fondo pensione con il valore quota mensile', 'Crypto da hardware wallet con il solo indirizzo pubblico']],
  ['Budget e obiettivi', 'Sai sempre quanto puoi ancora spendere.', 'Imposta un limite per categoria e un traguardo di risparmio. Vedi a che punto sei e quando lo raggiungerai.', ["Avviso quando superi l'80% di una categoria"]],
  ['Calendario', 'Nessun pagamento ti coglie di sorpresa.', 'Abbonamenti, ricariche, bollette e PAC in un calendario unico, con il totale in uscita del mese.', ['Promemoria il giorno prima di ogni addebito', 'I PAC ti chiedono solo una conferma']],
  ['Notifiche', 'Scegli tu quando sentirci.', 'Ti avvisiamo solo per le cose che contano. Puoi cambiare queste preferenze in qualsiasi momento dalla campanella.', []],
];

function Preview({ step }: { step: number }) {
  const { data, d } = useStore();
  const { vals } = useNetSeries('1A');
  const alloc = useAllocation();
  const budgets = useBudgets(new Date()).slice(0, 3);
  const accName = (id: string) => data.accounts.find((a) => a.id === id)?.name ?? '—';

  if (step === 0) return (
    <div className="card" style={{ gap: 12 }}>
      <Kicker>Patrimonio netto</Kicker>
      <div className="mono" style={{ fontSize: 34, fontWeight: 500, letterSpacing: '-0.03em' }}>{eur(d.net)}</div>
      <NetChart vals={vals} />
      <div className="stacked" style={{ height: 8 }}>{alloc.map((a) => <div key={a.n} style={{ width: `${a.w}%`, background: a.c }} />)}</div>
      <div className="muted" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', fontSize: 12 }}>{alloc.map((a) => <span key={a.n} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 8, height: 8, background: a.c }} />{a.n}</span>)}</div>
    </div>
  );
  if (step === 1) {
    const demo = data.transactions.filter((t) => t.source === 'gpay').sort((a, b) => b.date.localeCompare(a.date) || b.created_at - a.created_at).slice(0, 3);
    const first = demo[0];
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ background: 'var(--hover)', border: '1px solid var(--border)', padding: '14px 16px', display: 'grid', gridTemplateColumns: '32px minmax(0,1fr)', gap: 12, boxShadow: '0 16px 40px rgba(0,0,0,0.4)' }}>
          <IconTile name="credit-card" size={32} bg="var(--accent)" color="var(--on-accent)" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <div className="between"><span style={{ fontWeight: 600 }}>Spesa registrata</span><span className="mono muted" style={{ fontSize: 11 }}>ora</span></div>
            <span className="muted" style={{ fontSize: 13 }}>{first ? `${first.merchant} · ${eur(first.amount)} · categoria ${first.category}` : 'Coop · −€46,85 · categoria Spesa'}</span>
          </div>
        </div>
        <div className="card list">
          {demo.map((t) => (
            <div key={t.id} className="row" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 12, alignItems: 'center', padding: '11px 0' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}><div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><span style={{ fontWeight: 500 }}>{t.merchant}</span><AutoBadge /></div><span className="muted" style={{ fontSize: 12 }}>{txMeta(t, accName(t.account_id))}</span></div>
              <span className="mono">{eur(t.amount, true)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (step === 2) {
    const rows = [
      { n: 'ETF', how: 'Registri le quote · prezzo da ISIN', v: d.etfValue, icon: 'chart-line' },
      { n: 'Fondo pensione', how: 'Quote × valore quota mensile', v: d.fund?.value ?? 0, icon: 'landmark' },
      { n: 'Crypto', how: 'Indirizzo pubblico · saldo dalla blockchain', v: d.cryptoValue, icon: 'wallet' },
    ];
    return (
      <div className="card list">
        {rows.map((r) => (
          <div key={r.n} className="row" style={{ display: 'grid', gridTemplateColumns: '32px minmax(0,1fr) auto', gap: 12, alignItems: 'center', padding: '14px 0' }}>
            <IconTile name={r.icon} size={32} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}><span style={{ fontWeight: 600 }}>{r.n}</span><span className="muted" style={{ fontSize: 12 }}>{r.how}</span></div>
            <span className="mono">{eur(r.v)}</span>
          </div>
        ))}
      </div>
    );
  }
  if (step === 3) {
    const g = [...data.goals].sort((a, b) => a.sort - b.sort)[0];
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {budgets.map((b) => (
          <div key={b.id} className="card" style={{ padding: '14px 18px', gap: 8 }}>
            <div className="between"><span style={{ fontWeight: 600 }}>{b.name}</span><span className="mono" style={{ fontSize: 13 }}>{eur(b.spent)} <span className="muted">/ {eur(b.monthly_budget)}</span></span></div>
            <Bar pct={b.pct} color={b.over ? 'var(--neg)' : undefined} />
          </div>
        ))}
        {g && (
          <div className="card" style={{ padding: '14px 18px', gap: 8 }}>
            <div className="between"><span style={{ fontWeight: 600 }}>{g.name}</span><span className="mono acc">{Math.round(g.saved / g.target * 100)}%</span></div>
            <Bar pct={g.saved / g.target * 100} />
            <span className="muted" style={{ fontSize: 12 }}>{goalEta(g.saved, g.target, g.monthly)}</span>
          </div>
        )}
      </div>
    );
  }
  if (step === 4) {
    const pays = upcomingPayments(data.scheduled_payments).slice(0, 4);
    return (
      <div className="card list">
        {pays.map((p) => (
          <div key={p.id} className="row" style={{ display: 'grid', gridTemplateColumns: '48px 32px minmax(0,1fr) auto', gap: 12, alignItems: 'center', padding: '12px 0' }}>
            <span className="mono muted" style={{ fontSize: 12 }}>{p.when}</span>
            <IconTile name={p.icon} size={32} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}><span>{p.name}</span><span className="muted" style={{ fontSize: 12 }}>{p.kind}</span></div>
            <span className="mono">{eur(p.amount)}</span>
          </div>
        ))}
      </div>
    );
  }
  return <div className="card list"><PrefList pad="12px 0" /></div>;
}

export function Onboarding({ desktop }: { desktop: boolean }) {
  const { ui, setUi, actions } = useStore();
  const step = Math.max(0, ui.onboarding);
  const [busy, setBusy] = useState(false);
  const [title, heading, body, points] = ONB[step];
  const last = step >= ONB.length - 1;
  const finish = async () => {
    setBusy(true);
    // Android 13+: permesso notifiche, poi accesso alle notifiche per leggere i pagamenti di Google Pay.
    await requestNotificationPermission().catch(() => false);
    await requestWalletAccess().catch(() => undefined);
    setBusy(false);
    actions.finishOnboarding();
  };

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 20, background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      <div className="between" style={{ padding: 'calc(18px + env(safe-area-inset-top)) 24px 18px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div className="logo">patrimonio<span className="acc">.</span></div>
        <button className="link muted" onClick={() => actions.finishOnboarding()}>Salta</button>
      </div>
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ width: '100%', maxWidth: 1000, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 40, alignItems: 'center', margin: 'auto 0' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
            <div className="mono acc" style={{ fontSize: 12, letterSpacing: '0.06em' }}>{String(step + 1).padStart(2, '0')} / 06 · {title.toUpperCase()}</div>
            <div className="pretty" style={{ fontSize: 34, fontWeight: 600, lineHeight: 1.15, letterSpacing: '-0.02em' }}>{heading}</div>
            <div className="muted pretty" style={{ fontSize: 15, lineHeight: 1.55 }}>{body}</div>
            {points.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 4 }}>
                {points.map((p) => <div key={p} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14 }}><span style={{ width: 6, height: 6, background: 'var(--accent)', marginTop: 7, flexShrink: 0 }} /><span>{p}</span></div>)}
              </div>
            )}
          </div>
          <div style={{ minWidth: 0 }}><Preview step={step} /></div>
        </div>
      </div>
      <div className="between" style={{ gap: 16, padding: '16px 24px calc(16px + env(safe-area-inset-bottom))', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 4 }}>{ONB.map((_, i) => <span key={i} style={{ width: 22, height: 4, background: i <= step ? 'var(--accent)' : 'var(--border)' }} />)}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {step > 0 && <button className="btn-ghost" style={{ padding: '11px 16px', fontSize: 14 }} onClick={() => setUi({ onboarding: step - 1 })}>Indietro</button>}
          <button className="btn" disabled={busy} style={{ padding: '11px 18px', whiteSpace: 'nowrap' }} onClick={last ? finish : () => setUi({ onboarding: step + 1 })}>
            {last ? (desktop ? 'Attiva notifiche e inizia' : 'Attiva e inizia') : step === 0 ? 'Iniziamo' : 'Avanti'}
          </button>
        </div>
      </div>
    </div>
  );
}
