import { useCallback, useEffect, useState } from 'react';
import { Card, Kicker } from '../components/ui';
import { explainWalletNotification, PACKAGE_LABELS, WALLET_PACKAGES } from '../services/gpayParser';
import { isWalletAccessEnabled, walletListenerAvailable, walletPlugin, type LogEntry } from '../services/walletListener';
import { useStore } from '../store';

const fmt = (ts: number) => new Date(ts).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' });

/** Stato dell'accesso alle notifiche, registro delle notifiche ricevute ed esito del riconoscimento. */
export function GpayDiagnostics() {
  const { data, actions } = useStore();
  const available = walletListenerAvailable();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [diagUntil, setDiagUntil] = useState(0);
  const [lastEventAt, setLastEventAt] = useState(0);
  const [results, setResults] = useState<Record<number, string>>({});
  const [test, setTest] = useState({ title: '', text: '' });
  const [testOut, setTestOut] = useState<string | null>(null);
  const custom = data.settings.find((s) => s.key === 'gpay_regex')?.value;

  const reload = useCallback(async () => {
    setEnabled(await isWalletAccessEnabled());
    if (!available) return;
    try {
      const r = await walletPlugin.getLog();
      setLog([...r.items].reverse());
      setDiagUntil(r.diagnosticUntil);
      setLastEventAt(r.lastEventAt);
    } catch { /* plugin non disponibile */ }
  }, [available]);

  useEffect(() => {
    reload();
    const onVis = () => { if (document.visibilityState === 'visible') reload(); };
    document.addEventListener('visibilitychange', onVis);
    const id = setInterval(reload, 5000);
    return () => { document.removeEventListener('visibilitychange', onVis); clearInterval(id); };
  }, [reload]);

  const diagOn = diagUntil > Date.now();
  const retry = async (i: number, e: LogEntry) => setResults({ ...results, [i]: await actions.ingestWalletNotification(e, { anyPackage: true }) });

  return (
    <div className="stack">
      <Card>
        <Kicker>Accesso alle notifiche</Kicker>
        {!available ? (
          <div className="muted pretty" style={{ fontSize: 13 }}>Disponibile solo nell'app Android.</div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
              <span style={{ width: 8, height: 8, background: enabled ? 'var(--accent)' : 'var(--neg)' }} />
              {enabled === null ? 'Controllo…' : enabled ? 'Attivo: l\'app riceve le notifiche di pagamento' : 'Non attivo: le spese non vengono registrate'}
            </div>
            {!enabled && (
              <ol className="muted pretty" style={{ fontSize: 13, margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <li>Tocca <b>Apri accesso alle notifiche</b> e attiva <b>Patrimonio</b>.</li>
                <li>Se l'interruttore è grigio o compare "Impostazione con restrizioni": tocca <b>Apri info app</b>, poi il menu <b>⋮</b> in alto a destra › <b>Consenti impostazioni con restrizioni</b>, e ripeti il passo 1.</li>
              </ol>
            )}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn sm" onClick={() => walletPlugin.openSettings()}>Apri accesso alle notifiche</button>
              <button className="btn-ghost" onClick={() => walletPlugin.openAppSettings()}>Apri info app</button>
              {enabled && <button className="btn-ghost" onClick={() => walletPlugin.rebind().then(reload)}>Ricollega il servizio</button>}
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              App ascoltate: {WALLET_PACKAGES.map((p) => PACKAGE_LABELS[p] ?? p).join(', ')}.
              {lastEventAt ? ` Ultimo segnale dal servizio: ${fmt(lastEventAt)}.` : ''}
            </div>
          </>
        )}
      </Card>

      {available && (
        <Card>
          <div className="between">
            <Kicker>Notifiche ricevute</Kicker>
            <button className="link" onClick={() => walletPlugin.clearLog().then(reload)}>Svuota</button>
          </div>
          <div className="muted pretty" style={{ fontSize: 12 }}>
            Le ultime notifiche delle app di pagamento, con l'esito del riconoscimento. Restano solo sul telefono.
          </div>
          <div>
            <button className="btn-ghost" onClick={async () => { const r = await walletPlugin.setDiagnostic({ minutes: diagOn ? 0 : 10 }); setDiagUntil(r.diagnosticUntil); }}>
              {diagOn ? `Ferma la registrazione di tutte le app (fino alle ${new Date(diagUntil).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })})` : 'Registra le notifiche di tutte le app per 10 minuti'}
            </button>
          </div>
          {diagOn && <div className="muted pretty" style={{ fontSize: 12 }}>Utile se la tua banca non è tra le app ascoltate: fai un pagamento e guarda qui il nome dell'app e il testo della notifica.</div>}
          {log.length === 0 && <div className="muted" style={{ fontSize: 13 }}>Nessuna notifica registrata. Fai un pagamento con il telefono e torna qui.</div>}
          {log.map((e, i) => {
            const r = explainWalletNotification(e, custom);
            return (
              <div key={i} style={{ borderTop: '1px solid var(--row)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div className="between" style={{ fontSize: 12 }}>
                  <span className="mono muted">{PACKAGE_LABELS[e.packageName] ?? e.packageName}</span>
                  <span className="mono muted">{fmt(e.postedAt)}</span>
                </div>
                <div style={{ fontWeight: 600, fontSize: 13, wordBreak: 'break-word' }}>{e.title || '(senza titolo)'}</div>
                <div className="muted" style={{ fontSize: 13, wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>{e.text}{e.subText ? `\n${e.subText}` : ''}</div>
                <div style={{ fontSize: 12, color: r.ok ? 'var(--accent)' : 'var(--neg)' }}>
                  {r.ok ? `Riconosciuta: ${r.payment.merchant} · ${r.payment.amount.toFixed(2).replace('.', ',')} €` : `Non riconosciuta: ${r.reason}`}
                  {e.payment && !e.forwarded && ' · in coda (app chiusa)'}
                </div>
                {r.ok && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button className="btn-ghost xs" onClick={() => retry(i, e)}>Registra questa spesa</button>
                    {results[i] && <span className="muted" style={{ fontSize: 12 }}>{results[i]}</span>}
                  </div>
                )}
              </div>
            );
          })}
        </Card>
      )}

      <Card>
        <Kicker>Prova un testo</Kicker>
        <div className="muted pretty" style={{ fontSize: 12 }}>Incolla titolo e testo di una notifica per vedere se viene riconosciuta.</div>
        <input className="input" placeholder="Titolo, es. Bar Centrale" value={test.title} onChange={(e) => setTest({ ...test, title: e.target.value })} />
        <input className="input" placeholder="Testo, es. 3,20 € con Revolut ••1234" value={test.text} onChange={(e) => setTest({ ...test, text: e.target.value })} />
        <div><button className="btn-ghost" onClick={() => {
          const r = explainWalletNotification({ packageName: 'test', title: test.title, text: test.text, postedAt: Date.now() }, custom);
          setTestOut(r.ok ? `Riconosciuta: ${r.payment.merchant} · ${r.payment.amount.toFixed(2).replace('.', ',')} €` : `Non riconosciuta: ${r.reason}`);
        }}>Prova</button></div>
        {testOut && <div style={{ fontSize: 13, color: testOut.startsWith('Ricon') ? 'var(--accent)' : 'var(--neg)' }}>{testOut}</div>}
      </Card>
    </div>
  );
}
