export const MONTHS_SHORT = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
export const MONTHS_LONG = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

const pad = (n: number) => String(n).padStart(2, '0');

export function iso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseIso(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/** "2026-11" */
export function monthKey(d: Date | string): string {
  const x = typeof d === 'string' ? parseIso(d) : d;
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}`;
}

export function addMonths(d: Date, n: number): Date {
  const y = d.getFullYear(), m = d.getMonth() + n;
  const last = daysInMonth(new Date(y, m, 1));
  return new Date(y, m, Math.min(d.getDate(), last));
}

export function daysInMonth(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

/** "3 nov" */
export function shortDate(s: string): string {
  const d = parseIso(s);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

/** "mag 2030" */
export function monthYear(d: Date): string {
  return `${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Etichetta relativa per le notifiche: "08:00", "ieri", "lun", "12 ott". */
export function relTime(ts: number, now = new Date()): string {
  const d = new Date(ts);
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (ts >= startToday) return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (ts >= startToday - 86400000) return 'ieri';
  if (ts >= startToday - 6 * 86400000) return ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'][d.getDay()];
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

/** Giorno del pagamento in un mese (clamp per i mesi corti). */
export function payDate(month: Date, dayOfMonth: number): Date {
  return new Date(month.getFullYear(), month.getMonth(), Math.min(dayOfMonth, daysInMonth(month)));
}
