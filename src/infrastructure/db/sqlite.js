'use strict';

const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS price_lists (
    id TEXT PRIMARY KEY,
    shop TEXT NOT NULL,
    tag TEXT NOT NULL,
    name TEXT NOT NULL,
    currency TEXT NOT NULL,
    status TEXT NOT NULL,
    priority INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(shop, tag)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_price_lists_shop_status
    ON price_lists(shop, status)`,
  `CREATE TABLE IF NOT EXISTS variant_prices (
    id TEXT PRIMARY KEY,
    price_list_id TEXT NOT NULL,
    shopify_variant_id TEXT NOT NULL,
    shopify_product_id TEXT,
    sku TEXT,
    price TEXT NOT NULL,
    compare_at_price TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(price_list_id, shopify_variant_id),
    FOREIGN KEY (price_list_id) REFERENCES price_lists(id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_variant_prices_sku ON variant_prices(sku)`,
  `CREATE TABLE IF NOT EXISTS activity_logs (
    id TEXT PRIMARY KEY,
    shop TEXT NOT NULL,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    payload TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_activity_shop_created
    ON activity_logs(shop, created_at)`,
];

const DROP_LEGACY = [
  'DROP TABLE IF EXISTS variant_prices',
  'DROP TABLE IF EXISTS price_lists',
  'DROP TABLE IF EXISTS customer_segments',
  'DROP TABLE IF EXISTS activity_logs',
];

class SqlJsDatabase {
  constructor(SQL, db, dbPath) {
    this._SQL = SQL;
    this._db = db;
    this._dbPath = dbPath;
  }

  exec(sql) {
    this._db.exec(sql);
    this._persist();
  }

  prepare(sql) {
    const self = this;
    return {
      run(...params) {
        const bound = bindParams(params);
        self._db.run(sql, bound);
        const changes = self._db.getRowsModified();
        self._persist();
        return { changes };
      },
      get(...params) {
        const stmt = self._db.prepare(sql);
        try {
          stmt.bind(bindParams(params));
          if (!stmt.step()) return undefined;
          return rowToObject(stmt);
        } finally {
          stmt.free();
        }
      },
      all(...params) {
        const stmt = self._db.prepare(sql);
        const rows = [];
        try {
          stmt.bind(bindParams(params));
          while (stmt.step()) rows.push(rowToObject(stmt));
          return rows;
        } finally {
          stmt.free();
        }
      },
    };
  }

  close() {
    this._persist();
    this._db.close();
  }

  _persist() {
    const data = this._db.export();
    fs.writeFileSync(this._dbPath, Buffer.from(data));
  }
}

function bindParams(params) {
  if (params.length === 1 && params[0] && typeof params[0] === 'object' && !Array.isArray(params[0])) {
    const obj = params[0];
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      if (k.startsWith('@') || k.startsWith(':') || k.startsWith('$')) out[k] = v;
      else out[`@${k}`] = v;
    }
    return out;
  }
  return params;
}

function rowToObject(stmt) {
  const cols = stmt.getColumnNames();
  const values = stmt.get();
  const row = {};
  cols.forEach((c, i) => {
    row[c] = values[i];
  });
  return row;
}

let _SQLPromise;

function needsLegacyReset(db) {
  try {
    const stmt = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='customer_segments'`
    );
    const has = stmt.step();
    stmt.free();
    if (has) return true;
  } catch {
    /* ignore */
  }
  try {
    const stmt = db.prepare(`PRAGMA table_info(price_lists)`);
    const cols = [];
    while (stmt.step()) {
      const row = rowToObject(stmt);
      cols.push(row.name);
    }
    stmt.free();
    if (cols.length && !cols.includes('tag')) return true;
  } catch {
    /* ignore */
  }
  return false;
}

async function openDatabase(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, 'syspricing.sqlite');
  if (!_SQLPromise) _SQLPromise = initSqlJs();
  const SQL = await _SQLPromise;

  let db;
  if (fs.existsSync(dbPath)) {
    db = new SQL.Database(fs.readFileSync(dbPath));
  } else {
    db = new SQL.Database();
  }

  const wrapper = new SqlJsDatabase(SQL, db, dbPath);
  wrapper._db.run('PRAGMA foreign_keys = ON');

  if (needsLegacyReset(wrapper._db)) {
    console.warn('[db] resetting schema for tag-driven price lists');
    for (const drop of DROP_LEGACY) {
      wrapper._db.run(drop);
    }
  }

  for (const stmt of SCHEMA_STATEMENTS) {
    wrapper._db.run(stmt);
  }
  wrapper._persist();
  return wrapper;
}

module.exports = { openDatabase };
