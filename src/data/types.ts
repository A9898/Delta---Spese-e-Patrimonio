// Modello dati dell'app. Rispecchia lo schema SQLite descritto nell'handoff.

export type AccountType = 'conto' | 'deposito' | 'carta' | 'broker_cash' | 'contanti';

export interface Account {
  id: string;
  name: string;
  subtitle: string;
  type: AccountType;
  /** Saldo inserito a mano, valido all'istante `balance_as_of`. */
  balance_manual: number;
  /** I movimenti creati dopo questo istante (ms) si sommano al saldo manuale. */
  balance_as_of: number;
  card_last4: string | null;
  gpay_linked: boolean;
  sort: number;
}

export type TxSource = 'gpay' | 'man' | 'prog' | 'bonifico';

export interface Transaction {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  merchant: string;
  category: string;
  account_id: string;
  /** Negativo = uscita. */
  amount: number;
  source: TxSource;
  note: string | null;
  /** Timestamp di creazione (ms). */
  created_at: number;
}

export interface Category {
  id: string;
  name: string;
  monthly_budget: number;
  sort: number;
}

export interface MerchantRule {
  merchant_pattern: string;
  category: string;
}

export type InstrumentKind = 'etf' | 'fondo' | 'crypto';

export interface Instrument {
  id: string;
  kind: InstrumentKind;
  ticker: string;
  isin: string | null;
  name: string;
  color: string;
  /** Simbolo per il provider di quotazioni (es. VWCE.DE, bitcoin). */
  price_symbol: string | null;
}

export interface Operation {
  id: string;
  instrument_id: string;
  date: string;
  side: 'buy' | 'sell';
  qty: number;
  price: number;
  fees: number;
}

export type Network = 'bitcoin' | 'ethereum';

export interface Wallet {
  id: string;
  network: Network;
  address_or_xpub: string;
  label: string;
  /** Ultimo saldo letto dalla blockchain (cache offline, non inserito a mano). */
  cached_balance: number;
  balance_updated_at: number;
  /** Costo di carico del saldo al momento dell'aggiunta, per calcolare il rendimento. */
  cost_basis: number;
}

export interface Price {
  instrument_id: string;
  price: number;
  prev_close: number;
  updated_at: number;
}

export interface ScheduledPayment {
  id: string;
  name: string;
  amount: number;
  day_of_month: number;
  kind: string;
  icon: string;
  account_id: string;
  is_pac: boolean;
  instrument_id: string | null;
}

export interface Goal {
  id: string;
  name: string;
  saved: number;
  target: number;
  monthly: number;
  sort: number;
}

export type NotifType = 'pay' | 'pac' | 'gpay' | 'budget' | 'market' | 'weekly';
export type Screen = 'home' | 'tx' | 'budget' | 'conti' | 'inv' | 'goals' | 'cal' | 'report' | 'altro' | 'backup' | 'gpay';

export interface AppNotification {
  id: string;
  type: NotifType;
  title: string;
  body: string;
  created_at: number;
  read: boolean;
  /** Etichetta dell'azione principale (es. "Conferma PAC"). */
  action: string | null;
  /** Riferimento dell'azione (es. id del pagamento programmato PAC). */
  action_ref: string | null;
  done: boolean;
  target_screen: Screen;
  icon: string;
  /** Chiave di deduplica (es. budget:Spesa:2026-11). */
  dedupe_key: string | null;
}

export type PrefKey = 'pay' | 'pac' | 'gpay' | 'budget' | 'market' | 'weekly';

export interface NotificationPref {
  key: PrefKey;
  enabled: boolean;
}

export interface NetworthSnapshot {
  date: string;
  total: number;
}

export interface Setting {
  key: string;
  value: string;
}
