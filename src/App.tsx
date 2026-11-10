import { useEffect, useState } from 'react';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Icon } from './components/ui';
import { NotificationCenter } from './components/Notifications';
import { Onboarding } from './components/Onboarding';
import { InstrumentSheet, WalletEditSheet } from './components/InstrumentSheet';
import { ImportCashewSheet } from './components/ImportCashewSheet';
import { AccountSheet, ExpenseSheet, GoalSheet, OperationSheet, PaymentSheet, TxSheet } from './components/Sheets';
import type { Screen } from './data/types';
import { Accounts } from './screens/Accounts';
import { Budget } from './screens/Budget';
import { Calendar } from './screens/Calendar';
import { Goals } from './screens/Goals';
import { Home } from './screens/Home';
import { Investments } from './screens/Investments';
import { Backup, More } from './screens/More';
import { Report } from './screens/Report';
import { Transactions } from './screens/Transactions';
import { GpayDiagnostics } from './screens/GpayDiagnostics';
import { useStore } from './store';

function useDesktop() {
  const q = '(min-width: 900px)';
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return m;
}

const NAV: [Screen, string][] = [['home', 'Patrimonio'], ['tx', 'Movimenti'], ['budget', 'Budget'], ['conti', 'Conti e carte'], ['inv', 'Investimenti'], ['goals', 'Obiettivi'], ['cal', 'Calendario'], ['report', 'Report']];
const ALTRO: Screen[] = ['budget', 'conti', 'goals', 'cal', 'report', 'altro', 'backup', 'gpay'];

export function App() {
  const { data, d, ui, setUi, go } = useStore();
  const desktop = useDesktop();
  const name = data.settings.find((s) => s.key === 'user_name')?.value;

  const TITLES: Record<Screen, [string, string]> = {
    home: ['Patrimonio', name ? `Ciao ${name}, ecco il quadro aggiornato del tuo patrimonio.` : 'Il quadro aggiornato del tuo patrimonio.'],
    tx: ['Movimenti', 'Le spese con Google Pay arrivano da sole. Il resto lo aggiungi tu.'],
    budget: ['Budget', 'Quanto hai speso rispetto ai limiti che ti sei dato.'],
    conti: ['Conti e carte', 'Tutti i saldi in un posto solo.'],
    inv: ['Investimenti', 'Tu registri le quantità, i prezzi si aggiornano da soli.'],
    goals: ['Obiettivi', 'Un passo alla volta verso i tuoi traguardi.'],
    cal: ['Calendario', 'Abbonamenti, ricariche e bollette in arrivo.'],
    report: ['Report', 'Come si muovono entrate e uscite nel tempo.'],
    altro: ['Altro', 'Tutte le sezioni della tua app.'],
    backup: ['Backup e dati', 'I tuoi dati restano sul telefono.'],
    gpay: ['Pagamenti automatici', 'Google Pay e Revolut: stato e notifiche ricevute.'],
  };

  // Tasto indietro di Android: chiude overlay, poi torna alla Home.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const h = CapApp.addListener('backButton', () => {
      if (ui.sheet) setUi({ sheet: null });
      else if (ui.notifOpen) setUi({ notifOpen: false });
      else if (ui.onboarding >= 1) setUi({ onboarding: ui.onboarding - 1 });
      else if (ui.screen === 'backup' || ui.screen === 'gpay') go('altro');
      else if (ui.screen !== 'home' && ui.onboarding < 0) go(desktop || !ALTRO.includes(ui.screen) || ui.screen === 'altro' ? 'home' : 'altro');
      else CapApp.minimizeApp();
    });
    return () => { h.then((x) => x.remove()); };
  }, [ui, setUi, go, desktop]);

  const screen = !desktop && ui.screen === 'altro' ? 'altro' : desktop && ui.screen === 'altro' ? 'home' : ui.screen;
  const [title, sub] = TITLES[screen];
  const headLabel = screen === 'inv' ? '+ Nuova operazione' : '+ Aggiungi spesa';

  const tab = (id: Screen, label: string) => {
    const on = id === 'altro' ? ALTRO.includes(screen) : screen === id;
    return <button key={id} className={`tab${on ? ' on' : ''}`} onClick={() => go(id)}>{label}</button>;
  };

  return (
    <div className="app">
      {desktop && (
        <nav className="sidebar">
          <div className="sidebar-head">
            <div className="logo">patrimonio<span className="acc">.</span></div>
            {name && <div className="muted" style={{ fontSize: 12 }}>{name}</div>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', padding: '10px 0', flex: 1 }}>
            {NAV.map(([id, l]) => (
              <button key={id} className={`nav-item${screen === id ? ' on' : ''}`} onClick={() => go(id)}><span className="mark" /><span>{l}</span></button>
            ))}
            <button className={`nav-item${screen === 'backup' ? ' on' : ''}`} onClick={() => go('backup')}><span className="mark" /><span>Backup e dati</span></button>
          </div>
          <div className="muted" style={{ padding: '16px 20px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
            {data.accounts.some((a) => a.gpay_linked) && <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 7, height: 7, background: 'var(--accent)' }} />Google Pay sincronizzato</div>}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 7, height: 7, background: ui.priceError ? 'var(--muted)' : 'var(--accent)' }} />{ui.priceError ? 'Prezzi non aggiornati' : 'Prezzi di mercato aggiornati'}</div>
            <button className="link muted" style={{ fontSize: 12, padding: '6px 0 0', textAlign: 'left' }} onClick={() => setUi({ onboarding: 0, notifOpen: false })}>Rivedi introduzione →</button>
          </div>
        </nav>
      )}

      <div className="main">
        <header className="header">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
            <div className="header-title">{title}</div>
            <div className="header-sub">{sub}</div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
            <button aria-label={`Notifiche, ${d.unread} non lette`} onClick={() => setUi({ notifOpen: true })} className="pressable"
              style={{ position: 'relative', width: 40, height: 40, background: 'transparent', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
              <Icon name="bell" size={18} color="var(--text)" />
              {d.unread > 0 && (
                <span className="mono" style={{ position: 'absolute', top: -7, right: -7, minWidth: 18, height: 18, padding: '0 4px', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{d.unread}</span>
              )}
            </button>
            {desktop && <button className="btn sm" style={{ padding: '10px 16px' }} onClick={() => setUi({ sheet: screen === 'inv' ? 'op' : 'expense' })}>{headLabel}</button>}
          </div>
        </header>

        <main className="content">
          {screen === 'home' && <Home />}
          {screen === 'tx' && <Transactions />}
          {screen === 'budget' && <Budget />}
          {screen === 'conti' && <Accounts />}
          {screen === 'inv' && <Investments desktop={desktop} />}
          {screen === 'goals' && <Goals />}
          {screen === 'cal' && <Calendar />}
          {screen === 'report' && <Report />}
          {screen === 'altro' && <More />}
          {screen === 'backup' && <Backup />}
          {screen === 'gpay' && <GpayDiagnostics />}
        </main>

        {!desktop && (
          <nav className="tabbar">
            {tab('home', 'Home')}
            {tab('tx', 'Movimenti')}
            <div className="tab-plus"><button className="plus" aria-label="Aggiungi spesa" onClick={() => setUi({ sheet: 'expense' })}>+</button></div>
            {tab('inv', 'Investimenti')}
            {tab('altro', 'Altro')}
          </nav>
        )}
      </div>

      {ui.sheet === 'expense' && <ExpenseSheet desktop={desktop} />}
      {(ui.sheet === 'op' || ui.sheet === 'wallet') && <OperationSheet desktop={desktop} initialMode={ui.sheet === 'wallet' ? 'wallet' : 'op'} />}
      {ui.sheet === 'account' && <AccountSheet key={ui.editAccount ?? 'new'} desktop={desktop} />}
      {ui.sheet === 'payment' && <PaymentSheet key={ui.editId ?? 'new'} desktop={desktop} />}
      {ui.sheet === 'instrument' && <InstrumentSheet key={ui.editId ?? ''} desktop={desktop} />}
      {ui.sheet === 'walletEdit' && <WalletEditSheet key={ui.editId ?? ''} desktop={desktop} />}
      {ui.sheet === 'importCashew' && <ImportCashewSheet desktop={desktop} />}
      {ui.sheet === 'goal' && <GoalSheet key={ui.editId ?? 'new'} desktop={desktop} />}
      {ui.sheet && typeof ui.sheet === 'object' && <TxSheet txId={ui.sheet.tx} desktop={desktop} />}
      {ui.notifOpen && <NotificationCenter desktop={desktop} />}
      {ui.onboarding >= 0 && <Onboarding desktop={desktop} />}
    </div>
  );
}
