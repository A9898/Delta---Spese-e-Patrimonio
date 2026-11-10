import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import type { RawNotification } from './gpayParser';

/**
 * Ponte verso il plugin nativo `WalletListener` (Java, NotificationListenerService).
 * Vedi android/app/src/main/java/it/patrimonio/app/WalletListenerPlugin.java.
 */
export interface LogEntry extends RawNotification { payment: boolean; forwarded: boolean }

export interface WalletListenerPlugin {
  /** true se l'utente ha concesso l'accesso alle notifiche. */
  isEnabled(): Promise<{ enabled: boolean }>;
  /** Apre le impostazioni di sistema "Accesso alle notifiche". */
  openSettings(): Promise<void>;
  /** Apre le info dell'app (per "Consenti impostazioni con restrizioni" su Android 13+). */
  openAppSettings(): Promise<void>;
  /** Chiede ad Android di ricollegare il servizio. */
  rebind(): Promise<void>;
  /** Notifiche ricevute mentre l'app era chiusa, poi svuota la coda. */
  drainPending(): Promise<{ items: RawNotification[] }>;
  getLog(): Promise<{ items: LogEntry[]; diagnosticUntil: number; lastEventAt: number }>;
  clearLog(): Promise<void>;
  setDiagnostic(opts: { minutes: number }): Promise<{ diagnosticUntil: number }>;
  addListener(event: 'payment', cb: (n: RawNotification) => void): Promise<PluginListenerHandle>;
}

export const walletPlugin = registerPlugin<WalletListenerPlugin>('WalletListener');

export const walletListenerAvailable = () => Capacitor.getPlatform() === 'android';

export async function isWalletAccessEnabled(): Promise<boolean> {
  if (!walletListenerAvailable()) return false;
  try { return (await walletPlugin.isEnabled()).enabled; } catch { return false; }
}

export async function requestWalletAccess(): Promise<void> {
  if (!walletListenerAvailable()) return;
  if (await isWalletAccessEnabled()) return;
  await walletPlugin.openSettings().catch(() => undefined);
}

/** Consegna le notifiche arrivate ad app chiusa o in background. */
export async function drainPendingPayments(onPayment: (n: RawNotification) => void | Promise<void>): Promise<number> {
  if (!walletListenerAvailable()) return 0;
  try {
    const { items } = await walletPlugin.drainPending();
    for (const n of items) await onPayment(n);
    return items.length;
  } catch {
    return 0;
  }
}

/** Collega il listener, svuota la coda e la risvuota a ogni ritorno in primo piano. */
export async function startWalletListener(onPayment: (n: RawNotification) => void | Promise<void>): Promise<() => void> {
  if (!walletListenerAvailable()) return () => undefined;
  const handle = await walletPlugin.addListener('payment', (n) => { void onPayment(n); });
  await drainPendingPayments(onPayment);
  const onVis = () => { if (document.visibilityState === 'visible') void drainPendingPayments(onPayment); };
  document.addEventListener('visibilitychange', onVis);
  return () => { handle.remove(); document.removeEventListener('visibilitychange', onVis); };
}
