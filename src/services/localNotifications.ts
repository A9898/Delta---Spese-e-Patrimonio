import { Capacitor } from '@capacitor/core';
import type { LocalNotificationSchema } from '@capacitor/local-notifications';
import { payDate } from '../lib/dates';
import { eur } from '../lib/format';
import type { PrefKey, ScheduledPayment } from '../data/types';

/**
 * Notifiche locali di sistema (@capacitor/local-notifications), programmate in base alle preferenze:
 * - pagamenti in arrivo: alle 9:00 del giorno prima;
 * - conferma PAC: alle 8:00 del giorno del PAC, con azioni "Conferma PAC" / "Più tardi";
 * - riepilogo settimanale: lunedì alle 9:00.
 * Spese registrate, budget e mercato sono immediate (vedi `notifyNow`).
 */

const native = () => Capacitor.isNativePlatform();
const lib = () => import('@capacitor/local-notifications').then((m) => m.LocalNotifications);

export const PAC_ACTION_TYPE = 'PAC_CONFIRM';
const ID_BASE = { pay: 100000, pac: 200000, weekly: 300000, now: 400000 };
const MONTHS_AHEAD = 2;

export async function requestNotificationPermission(): Promise<boolean> {
  if (!native()) {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      return (await Notification.requestPermission()) === 'granted';
    }
    return false;
  }
  const ln = await lib();
  const r = await ln.requestPermissions();
  return r.display === 'granted';
}

export async function registerActions(): Promise<void> {
  if (!native()) return;
  const ln = await lib();
  await ln.registerActionTypes({
    types: [{ id: PAC_ACTION_TYPE, actions: [{ id: 'confirm', title: 'Conferma PAC', foreground: true }, { id: 'later', title: 'Più tardi' }] }],
  });
}

/** Calcola le notifiche da programmare (funzione pura, testabile). */
export function buildSchedule(payments: ScheduledPayment[], prefs: Record<PrefKey, boolean>, now = new Date()): LocalNotificationSchema[] {
  const out: LocalNotificationSchema[] = [];
  for (let m = 0; m < MONTHS_AHEAD; m++) {
    const month = new Date(now.getFullYear(), now.getMonth() + m, 1);
    payments.forEach((p, idx) => {
      const day = payDate(month, p.day_of_month);
      if (p.is_pac) {
        if (!prefs.pac) return;
        const at = new Date(day); at.setHours(8, 0, 0, 0);
        if (at <= now) return;
        out.push({
          id: ID_BASE.pac + m * 1000 + idx, title: `È il giorno del ${p.name}`,
          body: `${eur(p.amount)} programmati oggi. Confermalo per aggiornare le quote.`,
          schedule: { at, allowWhileIdle: true }, actionTypeId: PAC_ACTION_TYPE, extra: { paymentId: p.id, screen: 'inv' },
        });
      } else {
        if (!prefs.pay) return;
        const at = new Date(day); at.setDate(at.getDate() - 1); at.setHours(9, 0, 0, 0);
        if (at <= now) return;
        out.push({
          id: ID_BASE.pay + m * 1000 + idx, title: `${p.name} domani`,
          body: `${eur(p.amount)} · ${p.kind}.`,
          schedule: { at, allowWhileIdle: true }, extra: { screen: 'cal' },
        });
      }
    });
  }
  if (prefs.weekly) {
    out.push({
      id: ID_BASE.weekly, title: 'Riepilogo settimanale', body: 'Guarda come è andata la settimana.',
      schedule: { on: { weekday: 2, hour: 9, minute: 0 }, allowWhileIdle: true }, extra: { screen: 'report' },
    });
  }
  return out;
}

export async function rescheduleAll(payments: ScheduledPayment[], prefs: Record<PrefKey, boolean>): Promise<void> {
  if (!native()) return;
  const ln = await lib();
  const pending = await ln.getPending();
  const ours = pending.notifications.filter((n) => n.id >= ID_BASE.pay && n.id < ID_BASE.now);
  if (ours.length) await ln.cancel({ notifications: ours.map((n) => ({ id: n.id })) });
  const list = buildSchedule(payments, prefs);
  if (list.length) await ln.schedule({ notifications: list });
}

let seq = 0;
export async function notifyNow(title: string, body: string, screen: string): Promise<void> {
  if (!native()) return;
  const ln = await lib();
  await ln.schedule({ notifications: [{ id: ID_BASE.now + (seq++ % 90000), title, body, extra: { screen } }] });
}

export async function onNotificationAction(cb: (actionId: string, extra: Record<string, string>) => void): Promise<() => void> {
  if (!native()) return () => undefined;
  const ln = await lib();
  const h = await ln.addListener('localNotificationActionPerformed', (e) => cb(e.actionId, (e.notification.extra ?? {}) as Record<string, string>));
  return () => { h.remove(); };
}
