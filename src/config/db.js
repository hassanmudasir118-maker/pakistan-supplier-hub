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

// Always apply schema (idempotent — every statement uses IF NOT EXISTS)
db.exec(fs.readFileSync(SCHEMA_PATH, 'utf8'));

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
