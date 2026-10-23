import { getDb, now, isDateKey, parseJson } from '../db.js';

function cleanLines(value, field, max) {
  let list = value;
  if (value === undefined) return undefined;
  if (typeof value === 'string') list = value.split(/\r?\n/);
  if (!Array.isArray(list)) throw new Error(`${field}格式不对。`);
  const out = [];
  for (const raw of list) {
    if (typeof raw !== 'string') continue;
    const line = raw.trim().replace(/^[-*]\s*/, '');
    if (!line) continue;
    out.push(line.slice(0, 500));
    if (out.length >= max) break;
  }
  return out;
}

function cleanText(value, field, max) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new Error(`${field}格式不对。`);
  const text = value.trim();
  if (text.length > max) throw new Error(`${field}最多 ${max} 个字。`);
  return text;
}

function cleanScore(value, field) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 5) throw new Error(`${field}需要是 1–5。`);
  return n;
}

function emptyDaily(date) {
  return {
    date,
    summary: '',
    highlights: [],
    blockers: [],
    planNext: [],
    mood: null,
    energy: null,
    createdAt: null,
    updatedAt: null,
    exists: false,
  };
}

function mapDaily(row) {
  return {
    date: row.date,
    summary: row.summary || '',
    highlights: parseJson(row.highlights, []),
    blockers: parseJson(row.blockers, []),
    planNext: parseJson(row.plan_next, []),
    mood: row.mood ?? null,
    energy: row.energy ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    exists: true,
  };
}

function requireDate(value) {
  if (!isDateKey(value)) throw new Error('日期格式不对。');
  return value;
}

export function getDaily(params = {}) {
  const date = requireDate(params.date);
  const row = getDb().prepare('SELECT * FROM daily WHERE date = ?').all(date)[0];
  return row ? mapDaily(row) : emptyDaily(date);
}

export function saveDaily(params = {}) {
  const date = requireDate(params.date);
  const patch = params.patch || params;
  const db = getDb();
  const current = getDaily({ date });

  const summary = patch.summary !== undefined
    ? cleanText(patch.summary, '日报摘要', 4000)
    : current.summary;
  const highlights = patch.highlights !== undefined
    ? cleanLines(patch.highlights, '今日亮点', 20)
    : current.highlights;
  const blockers = patch.blockers !== undefined
    ? cleanLines(patch.blockers, '阻塞', 20)
    : current.blockers;
  const planNext = patch.planNext !== undefined
    ? cleanLines(patch.planNext, '明日计划', 20)
    : current.planNext;
  const mood = patch.mood !== undefined ? cleanScore(patch.mood, '心情') : current.mood;
  const energy = patch.energy !== undefined ? cleanScore(patch.energy, '精力') : current.energy;
  const ts = now();

  db.prepare(
    `INSERT INTO daily (date, summary, highlights, blockers, plan_next, mood, energy, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(date) DO UPDATE SET
       summary = excluded.summary,
       highlights = excluded.highlights,
       blockers = excluded.blockers,
       plan_next = excluded.plan_next,
       mood = excluded.mood,
       energy = excluded.energy,
       updated_at = excluded.updated_at`
  ).run(
    date, summary, JSON.stringify(highlights), JSON.stringify(blockers),
    JSON.stringify(planNext), mood, energy, current.createdAt || ts, ts
  );

  return getDaily({ date });
}

export function generateDaily(params = {}) {
  const date = requireDate(params.date);
  const rows = getDb().prepare(
    `SELECT content, kind FROM entries
     WHERE deleted_at IS NULL AND entry_date = ?
     ORDER BY occurred_at ASC`
  ).all(date);
  const highlights = [];
  const blockers = [];
  for (const row of rows) {
    if (row.kind === 'done') highlights.push(row.content.slice(0, 500));
    else if (row.kind === 'blocker') blockers.push(row.content.slice(0, 500));
  }
  return {
    date,
    highlights: highlights.slice(0, 20),
    blockers: blockers.slice(0, 20),
    entryCount: rows.length,
    generatedAt: now(),
  };
}

export function listDailies(params = {}) {
  const from = requireDate(params.from);
  const to = requireDate(params.to);
  const rows = getDb().prepare(
    `SELECT date, mood, energy FROM daily
     WHERE date >= ? AND date <= ? AND (mood IS NOT NULL OR energy IS NOT NULL)
     ORDER BY date ASC`
  ).all(from, to);
  return { items: rows.map((row) => ({ date: row.date, mood: row.mood, energy: row.energy })) };
}

export function removeDaily(params = {}) {
  const date = requireDate(params.date);
  getDb().prepare('DELETE FROM daily WHERE date = ?').run(date);
  return { date, removed: true };
}
