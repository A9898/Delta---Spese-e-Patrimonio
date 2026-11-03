import type {
  Account, AppNotification, Category, Goal, Instrument, MerchantRule, NetworthSnapshot,
  NotificationPref, Operation, Price, ScheduledPayment, Setting, Transaction, Wallet,
} from './types';

/** Righe di ogni tabella. */
export interface Rows {
  accounts: Account;
  transactions: Transaction;
  categories: Category;
  merchant_rules: MerchantRule;
  instruments: Instrument;
  operations: Operation;
  wallets: Wallet;
  prices: Price;
  scheduled_payments: ScheduledPayment;
  goals: Goal;
  notifications: AppNotification;
  notification_prefs: NotificationPref;
  networth_snapshots: NetworthSnapshot;
  settings: Setting;
}

export type TableName = keyof Rows;

type ColType = 'TEXT' | 'REAL' | 'INTEGER' | 'BOOL';

export interface TableDef<T> {
  key: keyof T & string;
  columns: Record<keyof T & string, ColType>;
}

type Defs = { [K in TableName]: TableDef<Rows[K]> };

export const SCHEMA: Defs = {
  accounts: { key: 'id', columns: { id: 'TEXT', name: 'TEXT', subtitle: 'TEXT', type: 'TEXT', balance_manual: 'REAL', balance_as_of: 'INTEGER', card_last4: 'TEXT', gpay_linked: 'BOOL', sort: 'INTEGER' } },
  transactions: { key: 'id', columns: { id: 'TEXT', date: 'TEXT', merchant: 'TEXT', category: 'TEXT', account_id: 'TEXT', amount: 'REAL', source: 'TEXT', note: 'TEXT', created_at: 'INTEGER' } },
  categories: { key: 'id', columns: { id: 'TEXT', name: 'TEXT', monthly_budget: 'REAL', sort: 'INTEGER' } },
  merchant_rules: { key: 'merchant_pattern', columns: { merchant_pattern: 'TEXT', category: 'TEXT' } },
  instruments: { key: 'id', columns: { id: 'TEXT', kind: 'TEXT', ticker: 'TEXT', isin: 'TEXT', name: 'TEXT', color: 'TEXT', price_symbol: 'TEXT' } },
  operations: { key: 'id', columns: { id: 'TEXT', instrument_id: 'TEXT', date: 'TEXT', side: 'TEXT', qty: 'REAL', price: 'REAL', fees: 'REAL' } },
  wallets: { key: 'id', columns: { id: 'TEXT', network: 'TEXT', address_or_xpub: 'TEXT', label: 'TEXT', cached_balance: 'REAL', balance_updated_at: 'INTEGER', cost_basis: 'REAL' } },
  prices: { key: 'instrument_id', columns: { instrument_id: 'TEXT', price: 'REAL', prev_close: 'REAL', updated_at: 'INTEGER' } },
  scheduled_payments: { key: 'id', columns: { id: 'TEXT', name: 'TEXT', amount: 'REAL', day_of_month: 'INTEGER', kind: 'TEXT', icon: 'TEXT', account_id: 'TEXT', is_pac: 'BOOL', instrument_id: 'TEXT' } },
  goals: { key: 'id', columns: { id: 'TEXT', name: 'TEXT', saved: 'REAL', target: 'REAL', monthly: 'REAL', sort: 'INTEGER' } },
  notifications: { key: 'id', columns: { id: 'TEXT', type: 'TEXT', title: 'TEXT', body: 'TEXT', created_at: 'INTEGER', read: 'BOOL', action: 'TEXT', action_ref: 'TEXT', done: 'BOOL', target_screen: 'TEXT', icon: 'TEXT', dedupe_key: 'TEXT' } },
  notification_prefs: { key: 'key', columns: { key: 'TEXT', enabled: 'BOOL' } },
  networth_snapshots: { key: 'date', columns: { date: 'TEXT', total: 'REAL' } },
  settings: { key: 'key', columns: { key: 'TEXT', value: 'TEXT' } },
};

export const TABLES = Object.keys(SCHEMA) as TableName[];

/** DDL per SQLite, generato dalle definizioni sopra. */
export function schemaSql(): string {
  return TABLES.map((t) => {
    const def = SCHEMA[t] as TableDef<Record<string, unknown>>;
    const cols = Object.entries(def.columns).map(([c, ty]) => {
      const sqlTy = ty === 'BOOL' ? 'INTEGER' : ty;
      return `${c} ${sqlTy}${c === def.key ? ' PRIMARY KEY NOT NULL' : ''}`;
    });
    return `CREATE TABLE IF NOT EXISTS ${t} (${cols.join(', ')});`;
  }).join('\n') + '\nCREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(date);\nCREATE INDEX IF NOT EXISTS idx_ops_instrument ON operations(instrument_id);';
}
