import { getDb, isDateKey, prevDateKey, parseJson, logicalDate } from '../db.js';
import { getSettings } from './settings.js';

function requireRange(params = {}) {
  const { from, to } = params;
  if (!isDateKey(from) || !isDateKey(to)) throw new Error('统计日期范围不对。');
  if (from > to) throw new Error('开始日期不能晚于结束日期。');
  return { from, to };
}

export function overview(params = {}) {
  const db = getDb();
  const { from, to } = requireRange(params);

  const entryRow = db.prepare(
    `SELECT COUNT(*) AS n,
            COALESCE(SUM(CASE WHEN kind = 'done' THEN 1 ELSE 0 END), 0) AS done,
            COALESCE(SUM(duration_min), 0) AS minutes,
            COUNT(DISTINCT entry_date) AS active_days
     FROM entries
     WHERE deleted_at IS NULL AND entry_date BETWEEN ? AND ?`
  ).all(from, to)[0];

  const taskRow = db.prepare(
    `SELECT COUNT(*) AS n FROM tasks
     WHERE deleted_at IS NULL AND status = 'done'
       AND completed_at IS NOT NULL
       AND strftime('%Y-%m-%d', completed_at / 1000, 'unixepoch', 'localtime') BETWEEN ? AND ?`
  ).all(from, to)[0];

  const focusRow = db.prepare(
    `SELECT COALESCE(SUM(actual_min), 0) AS minutes FROM focus_sessions
     WHERE status = 'done'
       AND strftime('%Y-%m-%d', started_at / 1000, 'unixepoch', 'localtime') BETWEEN ? AND ?`
  ).all(from, to)[0];

  const today = logicalDate(Date.now(), getSettings().boundaryHour);
  const asOf = to > today ? today : to;

  const dates = db.prepare(
    `SELECT DISTINCT entry_date FROM entries
     WHERE deleted_at IS NULL AND entry_date <= ?
     ORDER BY entry_date DESC LIMIT 400`
  ).all(asOf).map((row) => row.entry_date);

  const set = new Set(dates);
  let cursor = set.has(asOf) ? asOf : prevDateKey(asOf);
  let streak = 0;
  while (set.has(cursor) && streak < 400) {
    streak += 1;
    cursor = prevDateKey(cursor);
  }

  return {
    from,
    to,
    entries: entryRow.n,
    doneEntries: entryRow.done,
    tasksDone: taskRow.n,
    focusMin: focusRow.minutes,
    minutes: entryRow.minutes,
    activeDays: entryRow.active_days,
    streak,
  };
}

export function breakdown(params = {}) {
  const db = getDb();
  const { from, to } = requireRange(params);

  const byProject = db.prepare(
    `SELECT p.id AS id,
            COALESCE(p.name, '未归类') AS name,
            COALESCE(p.color, 'moss') AS color,
            COUNT(*) AS count,
            COALESCE(SUM(e.duration_min), 0) AS minutes
     FROM entries e
     LEFT JOIN projects p ON p.id = e.project_id
     WHERE e.deleted_at IS NULL AND e.entry_date BETWEEN ? AND ?
     GROUP BY p.id, COALESCE(p.name, '未归类'), COALESCE(p.color, 'moss')
     ORDER BY count DESC`
  ).all(from, to);

  const byKind = db.prepare(
    `SELECT kind AS name, COUNT(*) AS count,
            COALESCE(SUM(duration_min), 0) AS minutes
     FROM entries
     WHERE deleted_at IS NULL AND entry_date BETWEEN ? AND ?
     GROUP BY kind
     ORDER BY count DESC`
  ).all(from, to);

  const rows = db.prepare(
    'SELECT tags FROM entries WHERE deleted_at IS NULL AND entry_date BETWEEN ? AND ?'
  ).all(from, to);
  const tags = new Map();
  for (const row of rows) {
    const list = parseJson(row.tags, []);
    if (!Array.isArray(list)) continue;
    for (const tag of list) {
      if (typeof tag === 'string' && tag) tags.set(tag, (tags.get(tag) || 0) + 1);
    }
  }
  const byTag = [...tags.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  return { byProject, byKind, byTag };
}

export function heatmap(params = {}) {
  const db = getDb();
  const { from, to } = requireRange(params);
  const rows = db.prepare(
    `SELECT entry_date AS date, COUNT(*) AS count
     FROM entries
     WHERE deleted_at IS NULL AND entry_date BETWEEN ? AND ?
     GROUP BY entry_date
     ORDER BY entry_date ASC`
  ).all(from, to);
  return { days: rows };
}
