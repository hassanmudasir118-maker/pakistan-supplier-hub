const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', '..', 'database', 'data.sqlite');
const SCHEMA_PATH = path.join(__dirname, '..', '..', 'database', 'schema.sql');
const SEED_PATH = path.join(__dirname, '..', '..', 'database', 'seed.sql');

// Ensure the DB_PATH directory exists (needed when DB_PATH points to a
// mounted volume, e.g. Railway, whose parent folder won't exist on first boot).
// Wrapped: a volume mount permission issue here would otherwise crash the
// whole process before any error handler can log something useful.
try {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
} catch (e) {
  console.error(`[db] FATAL: could not create directory for DB_PATH (${DB_PATH}): ${e.message}`);
  console.error('[db] This usually means the mounted volume has a permissions problem, or DB_PATH points somewhere the app cannot write.');
  throw e;
}

const isNewDb = !fs.existsSync(DB_PATH);
let db;
try {
  db = new DatabaseSync(DB_PATH);
} catch (e) {
  console.error(`[db] FATAL: could not open SQLite database at ${DB_PATH}: ${e.message}`);
  throw e;
}

db.exec('PRAGMA foreign_keys = ON;');

// WAL mode needs proper file-locking support from the underlying filesystem.
// Some network-backed cloud volumes don't support this reliably and will
// throw here — fall back to a compatible journal mode instead of crashing.
try {
  db.exec('PRAGMA journal_mode = WAL;');
} catch (e) {
  console.warn(`[db] WAL journal mode unavailable on this filesystem (${e.message}) — falling back to DELETE mode. This is safe, just slightly slower under heavy concurrent writes.`);
  try { db.exec('PRAGMA journal_mode = DELETE;'); } catch (e2) { console.warn('[db] journal_mode fallback also failed:', e2.message); }
}
try { db.exec('PRAGMA synchronous = NORMAL;'); } catch (e) { console.warn('[db] synchronous pragma failed:', e.message); }
try { db.exec('PRAGMA cache_size = -32000;'); } catch (e) { console.warn('[db] cache_size pragma failed:', e.message); }
try { db.exec('PRAGMA busy_timeout = 5000;'); } catch (e) { console.warn('[db] busy_timeout pragma failed:', e.message); }
try { db.exec('PRAGMA temp_store = MEMORY;'); } catch (e) { console.warn('[db] temp_store pragma failed:', e.message); }

// Always apply schema (idempotent — every statement uses IF NOT EXISTS)
try {
  db.exec(fs.readFileSync(SCHEMA_PATH, 'utf8'));
} catch (e) {
  console.error(`[db] FATAL: failed to apply schema.sql: ${e.message}`);
  throw e;
}

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
  // Commission type support (flat Rs. amount or percent)
  "ALTER TABLE settings ADD COLUMN global_commission_type TEXT DEFAULT 'percent'",
  "ALTER TABLE settings ADD COLUMN global_commission_flat REAL DEFAULT 10",
  "ALTER TABLE vendors ADD COLUMN commission_type TEXT DEFAULT 'percent'",
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
// Volume persistence verified — Sun Jul  5 10:39:26 UTC 2026
