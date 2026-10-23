import { Database } from 'tjs:sqlite';
import { SCHEMA_V1, SCHEMA_V2, SCHEMA_VERSION } from './schema.js';

let db = null;
let dbPath = null;
let dataDir = null;

/**
 * Open (and migrate) the local database. Safe to call on every api request:
 * after the first call it just returns the cached connection.
 */
export async function openDb(app) {
  if (db) return db;

  const paths = await app.paths();
  dataDir = paths.data;
  await tjs.makeDir(dataDir, { recursive: true });
  await tjs.makeDir(dataDir + '/backups', { recursive: true });

  dbPath = dataDir + '/workbench.db';
  db = new Database(dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA synchronous = NORMAL;');

  const row = db.prepare('PRAGMA user_version').all()[0] || {};
  const version = Number(row.user_version || 0);

  if (version < SCHEMA_VERSION) {
    const migrate = db.transaction(() => {
      if (version < 1) db.exec(SCHEMA_V1);
      if (version < 2) db.exec(SCHEMA_V2);
      db.exec(`PRAGMA user_version = ${SCHEMA_VERSION};`);
    });
    migrate();
  }

  return db;
}

export function getDb() {
  if (!db) throw new Error('数据库还没有准备好，请重新打开应用。');
  return db;
}

export function getDbPath() {
  return dbPath;
}

export function getDataDir() {
  return dataDir;
}

/** Unix epoch milliseconds. */
export function now() {
  return Date.now();
}

const ALPHABET = '0123456789abcdef';

/** 32-char hex id with a readable prefix, e.g. ent_9f2c… */
export function newId(prefix = '') {
  const bytes = new Uint8Array(16);
  try {
    crypto.getRandomValues(bytes);
  } catch {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  let out = '';
  for (const byte of bytes) out += ALPHABET[byte >> 4] + ALPHABET[byte & 15];
  return prefix + out;
}

/** Local date key (YYYY-MM-DD). */
export function localDate(ts = Date.now()) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * Logical day key: before `boundaryHour` (0–6) the timestamp still belongs
 * to the previous day. A 2am entry with boundary 4 lands on yesterday.
 */
export function logicalDate(ts = Date.now(), boundaryHour = 0) {
  const d = new Date(ts);
  const boundary = Number(boundaryHour);
  if (Number.isFinite(boundary) && boundary > 0 && d.getHours() < boundary) {
    d.setDate(d.getDate() - 1);
  }
  return localDate(d.getTime());
}

export function isDateKey(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

export function requireDateKey(value, field = '日期') {
  if (!isDateKey(value)) throw new Error(`${field}格式不对。`);
  return value;
}

export function pad2(n) {
  return String(n).padStart(2, '0');
}

export function prevDateKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export function weekBounds(key, weekStart = 1) {
  const [year, month, day] = String(key).split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const startDay = weekStart === 0 ? 0 : 1;
  const diff = (date.getDay() - startDay + 7) % 7;
  date.setDate(date.getDate() - diff);
  const from = `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  date.setDate(date.getDate() + 6);
  const to = `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  return { from, to };
}

export function nextDateKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export function parseJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

/** Escape LIKE wildcards; pair with `ESCAPE '\\'` in SQL. */
export function likeTerm(value) {
  return String(value).replace(/[\\%_]/g, (c) => '\\' + c);
}
