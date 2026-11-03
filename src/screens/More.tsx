import { useState } from 'react';
import { Card, Field, Kicker } from '../components/ui';
import type { Screen } from '../data/types';
import { decryptBackup, downloadFile, encryptBackup, pickFile, type BackupFile } from '../services/backup';
import { useStore } from '../store';

export function More() {
  const { go, setUi } = useStore();
  const items: [string, string, () => void][] = [
    ['Budget', 'Limiti di spesa per categoria', () => go('budget')],
    ['Conti e carte', 'Saldi di conti, carte e broker', () => go('conti')],
    ['Obiettivi', 'Quanto manca ai tuoi traguardi', () => go('goals')],
    ['Calendario', 'Pagamenti programmati del mese', () => go('cal')],
    ['Report', 'Andamento di entrate e uscite', () => go('report')],
    ['Backup e dati', 'Esporta o importa un backup cifrato', () => go('backup' as Screen)],
    ['Rivedi introduzione', 'Le funzioni principali in 6 passaggi', () => setUi({ onboarding: 0, notifOpen: false })],
  ];
  return (
    <div className="card" style={{ padding: '0 20px', gap: 0 }}>
      {items.map(([l, d, fn]) => (
        <button key={l} onClick={fn} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, background: 'none', border: 'none', borderBottom: '1px solid var(--row)', color: 'var(--text)', padding: '16px 0', textAlign: 'left', cursor: 'pointer' }}>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}><span style={{ fontSize: 15, fontWeight: 500 }}>{l}</span><span className="muted" style={{ fontSize: 12 }}>{d}</span></span>
          <span className="muted">→</span>
        </button>
      ))}
    </div>
  );
}

const LAST_BACKUP = 'last_backup_at';

export function Backup() {
  const { data, actions } = useStore();
  const [pw, setPw] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [regex, setRegex] = useState(data.settings.find((s) => s.key === 'gpay_regex')?.value ?? '');
  const last = Number(data.settings.find((s) => s.key === LAST_BACKUP)?.value ?? 0);
  const stale = !last || Date.now() - last > 7 * 86400000;

  const run = async (fn: () => Promise<string>) => {
    setBusy(true); setMsg(null);
    try { setMsg({ ok: true, text: await fn() }); } catch (e) { setMsg({ ok: false, text: (e as Error).message }); } finally { setBusy(false); }
  };

  const exportBackup = () => run(async () => {
    const file = await encryptBackup(await actions.exportDump(), pw);
    downloadFile(`patrimonio-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(file));
    await actions.setSetting(LAST_BACKUP, String(Date.now()));
    return 'Backup cifrato creato. Conservalo insieme alla password: senza non si può aprire.';
  });

  const importBackup = () => run(async () => {
    const f = await pickFile('.json,application/json');
    if (!f) return 'Nessun file selezionato.';
    const dump = await decryptBackup(JSON.parse(await f.text()) as BackupFile, pw);
    await actions.importDump(dump);
    return 'Backup ripristinato.';
  });

  return (
    <div className="stack">
      <Card>
        <Kicker>Backup cifrato</Kicker>
        <div className="muted pretty" style={{ fontSize: 13 }}>
          Tutti i dati restano sul telefono. Il backup è un file JSON cifrato con la tua password (AES-256): salvalo in Download o su Google Drive dal selettore file di Android.
        </div>
        <div className="muted" style={{ fontSize: 12 }}>
          {last ? `Ultimo backup: ${new Date(last).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}.` : 'Nessun backup ancora.'}
          {stale && ' Ti consigliamo un backup a settimana.'}
        </div>
        <Field label="Password del backup">
          <input className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Almeno 8 caratteri" autoComplete="new-password" />
        </Field>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn sm" disabled={busy || pw.length < 8} onClick={exportBackup}>Esporta backup</button>
          <button className="btn-ghost" disabled={busy || !pw} onClick={importBackup}>Importa backup</button>
        </div>
        {msg && <div style={{ fontSize: 13, color: msg.ok ? 'var(--accent)' : 'var(--neg)' }}>{msg.text}</div>}
      </Card>
      <Card>
        <Kicker>Google Pay · formato notifiche</Kicker>
        <div className="muted pretty" style={{ fontSize: 13 }}>
          Se la tua banca usa un formato diverso, imposta una regex con i gruppi <span className="mono">merchant</span> e <span className="mono">amount</span>. Lascia vuoto per il riconoscimento automatico.
        </div>
        <input className="input mono" value={regex} onChange={(e) => setRegex(e.target.value)} placeholder="(?<amount>[0-9.,]+) € .* presso (?<merchant>.+)" />
        <div><button className="btn-ghost" onClick={() => actions.setSetting('gpay_regex', regex.trim()).then(() => setMsg({ ok: true, text: 'Formato salvato.' }))}>Salva formato</button></div>
      </Card>
      <Card>
        <Kicker>Dati di esempio</Kicker>
        <div className="muted pretty" style={{ fontSize: 13 }}>Al primo avvio l'app contiene dati dimostrativi. Puoi cancellarli e partire da zero (le preferenze delle notifiche restano).</div>
        <div><button className="btn-ghost" style={{ color: 'var(--neg)' }} onClick={() => { if (confirm('Cancellare tutti i dati? Non si può annullare.')) actions.resetToEmpty(); }}>Cancella tutti i dati</button></div>
      </Card>
    </div>
  );
}
