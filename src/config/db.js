const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', '..', 'database', 'data.sqlite');
const SCHEMA_PATH = path.join(__dirname, '..', '..', 'database', 'schema.sql');
const SEED_PATH = path.join(__dirname, '..', '..', 'database', 'seed.sql');

// Ensure the DB_PATH directory exists (needed when DB_PATH points to a
// mounted volume, e.g. Railway, whose parent folder won't exist on first boot)
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const isNewDb = !fs.existsSync(DB_PATH);
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA synchronous = NORMAL;');      // safe with WAL, much faster
db.exec('PRAGMA cache_size = -32000;');        // 32MB page cache
db.exec('PRAGMA busy_timeout = 5000;');        // wait up to 5s if DB locked
db.exec('PRAGMA temp_store = MEMORY;');        // temp tables in RAM

// Always apply schema (idempotent — every statement uses IF NOT EXISTS)
db.exec(fs.readFileSync(SCHEMA_PATH, 'utf8'));

// ---------------------------------------------------------------------------
// Safe column migrations — ALTER TABLE IF NOT EXISTS column (SQLite workaround)
// Each try/catch is intentional: SQLite throws if column already exists.
// ---------------------------------------------------------------------------
const migrations = [
  // Courier tracking on vendor order groups
  "ALTER TABLE order_vendor_groups ADD COLUMN courier_name TEXT",
  "ALTER TABLE order_vendor_groups ADD COLUMN tracking_number TEXT",
  "ALTER TABLE order_vendor_groups ADD COLUMN tracking_url TEXT",
  "ALTER TABLE order_vendor_groups ADD COLUMN shipped_at TEXT",
  "ALTER TABLE order_vendor_groups ADD COLUMN delivered_at TEXT",
  // Auto settlement
  "ALTER TABLE order_vendor_groups ADD COLUMN settlement_due_at TEXT",
  // Vendor public storefront slug
  "ALTER TABLE stores ADD COLUMN slug TEXT",
  "ALTER TABLE stores ADD COLUMN is_public INTEGER NOT NULL DEFAULT 1",
  "ALTER TABLE stores ADD COLUMN social_instagram TEXT",
  "ALTER TABLE stores ADD COLUMN social_facebook TEXT",
  "ALTER TABLE stores ADD COLUMN social_whatsapp TEXT",
  "ALTER TABLE stores ADD COLUMN total_sales INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE stores ADD COLUMN total_reviews INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE stores ADD COLUMN avg_rating REAL NOT NULL DEFAULT 0",
];
for (const sql of migrations) {
  try { db.exec(sql); } catch (_) { /* column already exists */ }
}

// Seed store slugs for existing vendors (one-time)
try {
  db.exec(`UPDATE stores SET slug = vendor_id WHERE slug IS NULL OR slug = ''`);
} catch(_) {}

// Seed structural (non-fake) data only once, on first boot
if (isNewDb) {
  db.exec(fs.readFileSync(SEED_PATH, 'utf8'));
  console.log('[db] Fresh database created and seeded with default categories/settings.');
}

/**
 * Thin helper layer so the rest of the app doesn't repeat prepare() boilerplate.
 * Mirrors the better-sqlite3 API (run/get/all) so swapping the driver later
 * (e.g. to Postgres via a different adapter) only requires changing this file.
 */
const query = {
  run: (sql, params = []) => {
    const stmt = db.prepare(sql);
    return Array.isArray(params) ? stmt.run(...params) : stmt.run(params);
  },
  get: (sql, params = []) => {
    const stmt = db.prepare(sql);
    return Array.isArray(params) ? stmt.get(...params) : stmt.get(params);
  },
  all: (sql, params = []) => {
    const stmt = db.prepare(sql);
    return Array.isArray(params) ? stmt.all(...params) : stmt.all(params);
  },
  exec: (sql) => db.exec(sql),
  raw: db,
};

module.exports = query;
