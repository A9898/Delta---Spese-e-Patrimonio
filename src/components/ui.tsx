import type { CSSProperties, ReactNode } from 'react';
import {
  Bell, CalendarCheck, Car, ChartLine, Cloud, CreditCard, Dumbbell, House, Landmark, Music, Receipt, Smartphone,
  TrendingDown, TrendingUp, TriangleAlert, Tv, Wallet, Wifi, Zap, type LucideIcon,
} from 'lucide-react';
import type { Transaction } from '../data/types';
import { shortDate } from '../lib/dates';
import { eur } from '../lib/format';

const ICONS: Record<string, LucideIcon> = {
  bell: Bell, 'trending-up': TrendingUp, 'trending-down': TrendingDown, tv: Tv, smartphone: Smartphone, dumbbell: Dumbbell,
  music: Music, zap: Zap, car: Car, cloud: Cloud, house: House, wifi: Wifi, 'credit-card': CreditCard,
  'calendar-check': CalendarCheck, 'chart-line': ChartLine, landmark: Landmark, wallet: Wallet, 'triangle-alert': TriangleAlert,
  receipt: Receipt,
};

/** Icone dei servizi selezionabili per i pagamenti programmati. */
export const SERVICE_ICONS = ['trending-up', 'tv', 'smartphone', 'dumbbell', 'music', 'zap', 'car', 'cloud', 'house', 'wifi', 'receipt'];

export function Icon({ name, size = 16, color = 'var(--accent)' }: { name: string; size?: number; color?: string }) {
  const C = ICONS[name] ?? Receipt;
  return <C size={size} color={color} strokeWidth={2} aria-hidden />;
}

/** Tile 28–32px con fondo accent 12% e icona accent. */
export function IconTile({ name, size = 32, color, bg }: { name: string; size?: number; color?: string; bg?: string }) {
  return (
    <span className="tile" style={{ width: size, height: size, background: bg }}>
      <Icon name={name} size={size >= 32 ? 16 : 14} color={color} />
    </span>
  );
}

export function Card({ children, list, style, className }: { children: ReactNode; list?: boolean; style?: CSSProperties; className?: string }) {
  return <div className={`card${list ? ' list' : ''}${className ? ' ' + className : ''}`} style={style}>{children}</div>;
}

export function Kicker({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div className="kicker" style={style}>{children}</div>;
}

export function Seg<T extends string>({ options, value, onChange, mono }: { options: [T, string][]; value: T; onChange: (v: T) => void; mono?: boolean }) {
  return (
    <div className={`seg${mono ? ' mono' : ''}`} role="tablist">
      {options.map(([v, l]) => (
        <button key={v} role="tab" aria-selected={v === value} className={v === value ? 'on' : ''} onClick={() => onChange(v)}>{l}</button>
      ))}
    </div>
  );
}

export function Chips<T extends string>({ options, value, onChange }: { options: T[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="chips">
      {options.map((o) => <button key={o} className={`chip${o === value ? ' on' : ''}`} onClick={() => onChange(o)}>{o}</button>)}
    </div>
  );
}

export function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return <button className={`toggle${on ? ' on' : ''}`} role="switch" aria-checked={on} aria-label={label} onClick={onClick}><span /></button>;
}

export function Bar({ pct, color, h = 6 }: { pct: number; color?: string; h?: number }) {
  return <div className="bar" style={{ height: h }}><div style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} /></div>;
}

export function AutoBadge() {
  return <span className="badge">G PAY · AUTO</span>;
}

const SRC_LABEL: Record<string, string> = { prog: ' · Programmato', bonifico: ' · Bonifico', man: ' · Manuale' };

export function txMeta(t: Transaction, accountName: string) {
  return `${t.category} · ${accountName}${SRC_LABEL[t.source] ?? ''}`;
}

/** Riga movimento: data (opzionale), commerciante + badge, meta, importo. */
export function TxRow({ t, accountName, showDate, onClick, plainAmount }: { t: Transaction; accountName: string; showDate?: boolean; onClick?: () => void; plainAmount?: boolean }) {
  return (
    <div
      className={`row${onClick ? ' pressable' : ''}`}
      onClick={onClick}
      style={{ display: 'grid', gridTemplateColumns: showDate ? '52px minmax(0,1fr) auto' : 'minmax(0,1fr) auto', gap: 12, alignItems: 'center', padding: showDate ? '12px 0' : '11px 0' }}
    >
      {showDate && <span className="mono muted" style={{ fontSize: 12 }}>{shortDate(t.date)}</span>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 0 }}>
          <span className="ellipsis" style={{ fontWeight: 500 }}>{t.merchant}</span>
          {t.source === 'gpay' && <AutoBadge />}
        </div>
        <div className="muted ellipsis" style={{ fontSize: 12 }}>{txMeta(t, accountName)}</div>
      </div>
      <div className="mono" style={{ fontSize: 14, whiteSpace: 'nowrap', color: !plainAmount && t.amount > 0 ? 'var(--accent)' : 'var(--text)' }}>{eur(t.amount, true)}</div>
    </div>
  );
}

export function Sheet({ children, onClose, desktop }: { children: ReactNode; onClose: () => void; desktop: boolean }) {
  return (
    <div className={`overlay${desktop ? ' center' : ''}`} onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal>{children}</div>
    </div>
  );
}

export function Field({ label, children, error }: { label: ReactNode; children: ReactNode; error?: string | false | null }) {
  return (
    <div className="field">
      <label className="field-label">{label}</label>
      {children}
      {error && <span className="err">{error}</span>}
    </div>
  );
}
