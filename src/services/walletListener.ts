import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import type { RawNotification } from './gpayParser';

/**
 * Ponte verso il plugin nativo `WalletListener` (Kotlin, NotificationListenerService).
 * Vedi android/app/src/main/java/it/patrimonio/app/WalletListenerPlugin.kt.
 */
export interface WalletListenerPlugin {
  /** true se l'utente ha concesso l'accesso alle notifiche. */
  isEnabled(): Promise<{ enabled: boolean }>;
  /** Apre le impostazioni di sistema "Accesso alle notifiche". */
  openSettings(): Promise<void>;
  /** Notifiche ricevute mentre l'app era chiusa, poi svuota la coda. */
  drainPending(): Promise<{ items: RawNotification[] }>;
  addListener(event: 'payment', cb: (n: RawNotification) => void): Promise<PluginListenerHandle>;
}

const plugin = registerPlugin<WalletListenerPlugin>('WalletListener');

export const walletListenerAvailable = () => Capacitor.getPlatform() === 'android';

export async function isWalletAccessEnabled(): Promise<boolean> {
  if (!walletListenerAvailable()) return false;
  try { return (await plugin.isEnabled()).enabled; } catch { return false; }
}

export async function requestWalletAccess(): Promise<void> {
  if (!walletListenerAvailable()) return;
  if (await isWalletAccessEnabled()) return;
  await plugin.openSettings().catch(() => undefined);
}

/** Collega il listener e consegna anche le notifiche arrivate ad app chiusa. */
export async function startWalletListener(onPayment: (n: RawNotification) => void): Promise<() => void> {
  if (!walletListenerAvailable()) return () => undefined;
  const handle = await plugin.addListener('payment', onPayment);
  try {
    const { items } = await plugin.drainPending();
    items.forEach(onPayment);
  } catch { /* plugin non ancora concesso */ }
  return () => { handle.remove(); };
}
