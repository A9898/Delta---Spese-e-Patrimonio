import { Capacitor } from '@capacitor/core';
import { SCHEMA, TABLES, schemaSql, type Rows, type TableDef, type TableName } from './schema';

/** Accesso generico a una tabella. Le implementazioni sono intercambiabili (locale, SQLite, in futuro sync). */
export interface Table<T> {
  all(): Promise<T[]>;
  upsert(rows: T | T[]): Promise<void>;
  remove(key: string): Promise<void>;
  clear(): Promise<void>;
}

export interface Database {
  readonly kind: 'local' | 'sqlite' | 'memory';
  table<K extends TableName>(name: K): Table<Rows[K]>;
}

const keyOf = <T,>(t: TableName, row: T) => String((row as Record<string, unknown>)[SCHEMA[t].key]);

/* ------------------------------------------------------------------ */
/* Memoria (test) e localStorage (browser / sviluppo)                  */
/* ------------------------------------------------------------------ */

class KeyValueTable<T> implements Table<T> {
  constructor(
    private name: TableName,
    private read: () => T[],
    private write: (rows: T[]) => void,
  ) {}
  async all() { return this.read(); }
  async upsert(rows: T | T[]) {
    const list = Array.isArray(rows) ? rows : [rows];
    const cur = this.read();
    const idx = new Map(cur.map((r, i) => [keyOf(this.name, r), i]));
    for (const r of list) {
      const k = keyOf(this.name, r);
      const i = idx.get(k);
      if (i === undefined) { idx.set(k, cur.length); cur.push(r); } else cur[i] = r;
    }
    this.write(cur);
  }
  async remove(key: string) { this.write(this.read().filter((r) => keyOf(this.name, r) !== key)); }
  async clear() { this.write([]); }
}

export function createMemoryDb(): Database {
  const store = new Map<TableName, unknown[]>();
  return {
    kind: 'memory',
    table: <K extends TableName>(name: K) => new KeyValueTable<Rows[K]>(
      name,
      () => [...((store.get(name) as Rows[K][]) ?? [])],
      (rows) => store.set(name, rows),
    ),
  };
}

export function createLocalDb(prefix = 'patrimonio.v1.'): Database {
  return {
    kind: 'local',
    table: <K extends TableName>(name: K) => new KeyValueTable<Rows[K]>(
      name,
      () => {
        try { return JSON.parse(localStorage.getItem(prefix + name) ?? '[]'); } catch { return []; }
      },
      (rows) => localStorage.setItem(prefix + name, JSON.stringify(rows)),
    ),
  };
}

/* ------------------------------------------------------------------ */
/* SQLite sul dispositivo (@capacitor-community/sqlite)                */
/* ------------------------------------------------------------------ */

type SqlConn = {
  query(sql: string, values?: unknown[]): Promise<{ values?: Record<string, unknown>[] }>;
  run(sql: string, values?: unknown[], transaction?: boolean): Promise<unknown>;
  executeSet(set: { statement: string; values: unknown[] }[], transaction?: boolean): Promise<unknown>;
};

function toSql(def: TableDef<Record<string, unknown>>, row: Record<string, unknown>) {
  return Object.entries(def.columns).map(([c, ty]) => {
    const v = row[c];
    if (v === undefined || v === null) return null;
    return ty === 'BOOL' ? (v ? 1 : 0) : v;
  });
}

function fromSql(def: TableDef<Record<string, unknown>>, row: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [c, ty] of Object.entries(def.columns)) {
    const v = row[c];
    out[c] = ty === 'BOOL' ? !!v : v ?? null;
  }
  return out;
}

class SqliteTable<T> implements Table<T> {
  private def: TableDef<Record<string, unknown>>;
  constructor(private conn: SqlConn, private name: TableName) {
    this.def = SCHEMA[name] as TableDef<Record<string, unknown>>;
  }
  async all() {
    const res = await this.conn.query(`SELECT * FROM ${this.name}`);
    return (res.values ?? []).map((r) => fromSql(this.def, r) as T);
  }
  async upsert(rows: T | T[]) {
    const list = Array.isArray(rows) ? rows : [rows];
    if (!list.length) return;
    const cols = Object.keys(this.def.columns);
    const statement = `INSERT OR REPLACE INTO ${this.name} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`;
    await this.conn.executeSet(list.map((r) => ({ statement, values: toSql(this.def, r as Record<string, unknown>) })), true);
  }
  async remove(key: string) { await this.conn.run(`DELETE FROM ${this.name} WHERE ${this.def.key} = ?`, [key]); }
  async clear() { await this.conn.run(`DELETE FROM ${this.name}`); }
}

export async function createSqliteDb(name = 'patrimonio'): Promise<Database> {
  const { CapacitorSQLite, SQLiteConnection } = await import('@capacitor-community/sqlite');
  const sqlite = new SQLiteConnection(CapacitorSQLite);
  await sqlite.checkConnectionsConsistency().catch(() => undefined);
  const exists = (await sqlite.isConnection(name, false)).result;
  const conn = exists
    ? await sqlite.retrieveConnection(name, false)
    : await sqlite.createConnection(name, false, 'no-encryption', 1, false);
  await conn.open();
  await conn.execute(schemaSql());
  const c = conn as unknown as SqlConn;
  return { kind: 'sqlite', table: <K extends TableName>(t: K) => new SqliteTable<Rows[K]>(c, t) };
}

/** Sceglie il backend: SQLite su Android/iOS, localStorage nel browser. */
export async function openDatabase(): Promise<Database> {
  if (Capacitor.isNativePlatform()) {
    try { return await createSqliteDb(); } catch (e) { console.error('SQLite non disponibile, uso localStorage', e); }
  }
  return createLocalDb();
}

export { TABLES };
