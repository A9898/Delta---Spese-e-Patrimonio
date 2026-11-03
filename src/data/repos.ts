import type { Database, Table } from './db';
import { TABLES, type Rows, type TableName } from './schema';
import type {
  Account, AppNotification, Category, Goal, Instrument, MerchantRule, NetworthSnapshot,
  NotificationPref, Operation, Price, ScheduledPayment, Setting, Transaction, Wallet,
} from './types';

/**
 * Livello repository: la UI parla solo con queste interfacce.
 * Per aggiungere la sincronizzazione (fase 2) basta un'altra implementazione di `Database`.
 */
export interface TransactionsRepo extends Table<Transaction> {}
export interface AccountsRepo extends Table<Account> {}
export interface CategoriesRepo extends Table<Category> {}
export interface MerchantRulesRepo extends Table<MerchantRule> {}
export interface InstrumentsRepo extends Table<Instrument> {}
export interface HoldingsRepo extends Table<Operation> {}
export interface WalletsRepo extends Table<Wallet> {}
export interface PricesRepo extends Table<Price> {}
export interface ScheduledPaymentsRepo extends Table<ScheduledPayment> {}
export interface GoalsRepo extends Table<Goal> {}
export interface NotificationsRepo extends Table<AppNotification> {}
export interface NotificationPrefsRepo extends Table<NotificationPref> {}
export interface SnapshotsRepo extends Table<NetworthSnapshot> {}
export interface SettingsRepo extends Table<Setting> {}

export interface Repos {
  db: Database;
  accounts: AccountsRepo;
  transactions: TransactionsRepo;
  categories: CategoriesRepo;
  merchantRules: MerchantRulesRepo;
  instruments: InstrumentsRepo;
  operations: HoldingsRepo;
  wallets: WalletsRepo;
  prices: PricesRepo;
  payments: ScheduledPaymentsRepo;
  goals: GoalsRepo;
  notifications: NotificationsRepo;
  prefs: NotificationPrefsRepo;
  snapshots: SnapshotsRepo;
  settings: SettingsRepo;
}

export function createRepos(db: Database): Repos {
  return {
    db,
    accounts: db.table('accounts'),
    transactions: db.table('transactions'),
    categories: db.table('categories'),
    merchantRules: db.table('merchant_rules'),
    instruments: db.table('instruments'),
    operations: db.table('operations'),
    wallets: db.table('wallets'),
    prices: db.table('prices'),
    payments: db.table('scheduled_payments'),
    goals: db.table('goals'),
    notifications: db.table('notifications'),
    prefs: db.table('notification_prefs'),
    snapshots: db.table('networth_snapshots'),
    settings: db.table('settings'),
  };
}

/** Tutti i dati in memoria: per un'app personale a utente singolo è piccolo e comodo. */
export type Dump = { [K in TableName]: Rows[K][] };

export async function dumpAll(db: Database): Promise<Dump> {
  const out = {} as Dump;
  for (const t of TABLES) (out as Record<string, unknown>)[t] = await db.table(t).all();
  return out;
}

export async function restoreAll(db: Database, data: Partial<Dump>): Promise<void> {
  for (const t of TABLES) {
    const tbl = db.table(t);
    await tbl.clear();
    const rows = data[t];
    if (rows?.length) await tbl.upsert(rows as never);
  }
}
