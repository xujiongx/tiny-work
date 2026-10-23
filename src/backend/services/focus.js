import { getDb, newId, now } from '../db.js';
import { createEntry } from '../repo/entries.js';

const SELECT = `
  SELECT f.*, p.name AS project_name, p.color AS project_color
  FROM focus_sessions f
  LEFT JOIN projects p ON p.id = f.project_id
`;

function mapSession(row) {
  if (!row) return null;
  const elapsed = Math.max(0, Math.floor((Date.now() - row.started_at) / 1000));
  const plannedSec = row.planned_min * 60;
  return {
    id: row.id,
    startedAt: row.started_at,
    endedAt: row.ended_at || null,
    plannedMin: row.planned_min,
    actualMin: row.actual_min || 0,
    projectId: row.project_id,
    projectName: row.project_name || null,
    projectColor: row.project_color || null,
    entryId: row.entry_id || null,
    status: row.status,
    note: row.note || '',
    elapsedSec: row.status === 'running' ? elapsed : Math.max(0, (row.actual_min || 0) * 60),
    remainingSec: row.status === 'running' ? Math.max(0, plannedSec - elapsed) : 0,
  };
}

function cleanMinutes(value, fallback = 25) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 240) throw new Error('专注时长需要是 1–240 分钟。');
  return n;
}

function cleanProjectId(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new Error('项目不对。');
  const row = getDb().prepare('SELECT id FROM projects WHERE id = ?').all(value)[0];
  if (!row) throw new Error('选择的项目已经不在了。');
  return value;
}

export function currentFocus() {
  const row = getDb().prepare(
    `${SELECT} WHERE f.status = 'running' ORDER BY f.started_at DESC LIMIT 1`
  ).all()[0];
  return mapSession(row);
}

export function startFocus(params = {}) {
  if (currentFocus()) throw new Error('已经有一个专注在进行中，先结束它吧。');
  const db = getDb();
  const minutes = cleanMinutes(params.minutes);
  const projectId = cleanProjectId(params.projectId);
  const note = typeof params.note === 'string' ? params.note.trim().slice(0, 500) : '';
  const id = newId('focus_');
  db.prepare(
    `INSERT INTO focus_sessions
       (id, started_at, planned_min, actual_min, project_id, status, note)
     VALUES (?, ?, ?, 0, ?, 'running', ?)`
  ).run(id, now(), minutes, projectId, note);
  return currentFocus();
}

export function stopFocus(params = {}) {
  const db = getDb();
  let row;
  if (params.id) {
    row = db.prepare(`${SELECT} WHERE f.id = ?`).all(params.id)[0];
    if (!row) throw new Error('这个专注记录已经不在了。');
  } else {
    row = db.prepare(
      `${SELECT} WHERE f.status = 'running' ORDER BY f.started_at DESC LIMIT 1`
    ).all()[0];
  }
  if (!row) throw new Error('现在没有正在进行的专注。');
  if (row.status !== 'running') return mapSession(row);

  const endedAt = now();
  const abandoned = Boolean(params.abandoned);
  const elapsedMin = Math.max(1, Math.round((endedAt - row.started_at) / 60000));
  const actualMin = Math.min(elapsedMin, row.planned_min);
  let entryId = null;

  if (!abandoned) {
    const content = row.note
      ? `${row.note}（专注 ${actualMin} 分钟）`
      : `专注 ${actualMin} 分钟`;
    const entry = createEntry({
      content,
      kind: 'log',
      projectId: row.project_id,
      durationMin: actualMin,
      occurredAt: endedAt,
      source: 'focus',
    });
    entryId = entry.id;
  }

  db.prepare(
    `UPDATE focus_sessions
     SET ended_at = ?, actual_min = ?, status = ?, entry_id = ?
     WHERE id = ?`
  ).run(endedAt, actualMin, abandoned ? 'abandoned' : 'done', entryId, row.id);

  const updated = db.prepare(`${SELECT} WHERE f.id = ?`).all(row.id)[0];
  return mapSession(updated);
}

export function listFocus(params = {}) {
  const db = getDb();
  const limit = Math.min(Math.max(Number(params.limit) || 30, 1), 200);
  const rows = db.prepare(
    `${SELECT} ORDER BY f.started_at DESC LIMIT ?`
  ).all(limit);
  return { items: rows.map(mapSession) };
}
