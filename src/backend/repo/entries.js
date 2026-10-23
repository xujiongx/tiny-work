import { getDb, newId, now, logicalDate, isDateKey, likeTerm, parseJson } from '../db.js';
import { getSettings } from '../services/settings.js';

export const ENTRY_KINDS = ['log', 'done', 'blocker', 'idea', 'meeting', 'learning'];

const SELECT = `
  SELECT e.*, p.name AS project_name, p.color AS project_color
  FROM entries e
  LEFT JOIN projects p ON p.id = e.project_id
`;

function mapEntry(row) {
  const tags = parseJson(row.tags, []);
  return {
    id: row.id,
    entryDate: row.entry_date,
    occurredAt: row.occurred_at,
    content: row.content,
    kind: row.kind,
    projectId: row.project_id,
    projectName: row.project_name || null,
    projectColor: row.project_color || null,
    tags: Array.isArray(tags) ? tags : [],
    durationMin: row.duration_min ?? null,
    source: row.source,
    taskId: row.task_id || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at || null,
  };
}

function cleanContent(value) {
  if (typeof value !== 'string') throw new Error('先写一句吧。');
  const content = value.trim();
  if (!content) throw new Error('先写一句吧。');
  if (content.length > 4000) throw new Error('一条记录最多 4000 个字。');
  return content;
}

function cleanKind(value, fallback = 'log') {
  if (value === undefined || value === null || value === '') return fallback;
  if (!ENTRY_KINDS.includes(value)) throw new Error('记录类型不对。');
  return value;
}

function cleanTags(value) {
  let list = value;
  if (typeof list === 'string') list = list.split(/[,，\s]+/);
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    if (typeof raw !== 'string') continue;
    const tag = raw.trim().replace(/^#/, '');
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag.slice(0, 20));
    if (out.length >= 8) break;
  }
  return out;
}

function cleanProjectId(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new Error('项目不对。');
  const row = getDb().prepare('SELECT id FROM projects WHERE id = ?').all(value)[0];
  if (!row) throw new Error('选择的项目已经不在了。');
  return value;
}

function cleanDuration(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 1440) throw new Error('耗时需要是 0–1440 分钟。');
  return Math.round(n);
}

function cleanOccurredAt(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) throw new Error('记录时间不对。');
  return Math.round(n);
}

export function getEntry(id) {
  const db = getDb();
  const row = db.prepare(`${SELECT} WHERE e.id = ?`).all(id)[0];
  if (!row) throw new Error('这条记录已经不在了。');
  return mapEntry(row);
}

export function createEntry(params = {}) {
  const db = getDb();
  const content = cleanContent(params.content);
  const kind = cleanKind(params.kind);
  const projectId = cleanProjectId(params.projectId);
  const tags = cleanTags(params.tags);
  const durationMin = cleanDuration(params.durationMin);
  const occurredAt = cleanOccurredAt(params.occurredAt) ?? now();
  let entryDate = params.entryDate;
  if (entryDate === undefined || entryDate === null || entryDate === '') {
    entryDate = logicalDate(occurredAt, getSettings().boundaryHour);
  }
  if (!isDateKey(entryDate)) throw new Error('日期格式不对。');

  const id = newId('ent_');
  const ts = now();
  db.prepare(
    `INSERT INTO entries
       (id, entry_date, occurred_at, content, kind, project_id, tags,
        duration_min, source, task_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id, entryDate, occurredAt, content, kind, projectId, JSON.stringify(tags),
    durationMin, params.source === 'task' || params.source === 'focus' ? params.source : 'manual',
    params.taskId || null, ts, ts
  );

  return getEntry(id);
}

export function listEntries(params = {}) {
  const db = getDb();
  const where = ['e.deleted_at IS NULL'];
  const args = [];

  if (params.date) {
    if (!isDateKey(params.date)) throw new Error('日期格式不对。');
    where.push('e.entry_date = ?');
    args.push(params.date);
  }
  if (params.from) {
    if (!isDateKey(params.from)) throw new Error('开始日期格式不对。');
    where.push('e.entry_date >= ?');
    args.push(params.from);
  }
  if (params.to) {
    if (!isDateKey(params.to)) throw new Error('结束日期格式不对。');
    where.push('e.entry_date <= ?');
    args.push(params.to);
  }
  if (params.projectId) {
    if (params.projectId === 'none') {
      where.push('e.project_id IS NULL');
    } else {
      where.push('e.project_id = ?');
      args.push(params.projectId);
    }
  }
  if (params.kind) {
    where.push('e.kind = ?');
    args.push(cleanKind(params.kind));
  }
  if (params.tag) {
    where.push("e.tags LIKE ? ESCAPE '\\'");
    args.push(`%"${likeTerm(String(params.tag).replace(/^#/, ''))}"%`);
  }
  if (params.query) {
    const q = `%${likeTerm(String(params.query).trim())}%`;
    where.push("(e.content LIKE ? ESCAPE '\\' OR e.tags LIKE ? ESCAPE '\\' OR p.name LIKE ? ESCAPE '\\')");
    args.push(q, q, q);
  }

  const whereSql = where.join(' AND ');
  const countRow = db.prepare(
    `SELECT COUNT(*) AS n FROM entries e LEFT JOIN projects p ON p.id = e.project_id WHERE ${whereSql}`
  ).all(...args)[0];

  const limit = Math.min(Math.max(Number(params.limit) || 100, 1), 500);
  const offset = Math.max(Number(params.offset) || 0, 0);
  const order = params.order === 'asc' ? 'ASC' : 'DESC';
  const rows = db.prepare(
    `${SELECT} WHERE ${whereSql} ORDER BY e.occurred_at ${order} LIMIT ? OFFSET ?`
  ).all(...args, limit, offset);

  const total = countRow.n;
  return {
    items: rows.map(mapEntry),
    total,
    hasMore: offset + rows.length < total,
  };
}

export function updateEntry(id, params = {}) {
  const db = getDb();
  const current = getEntry(id);
  const sets = [];
  const args = [];

  if (params.content !== undefined) {
    sets.push('content = ?');
    args.push(cleanContent(params.content));
  }
  if (params.kind !== undefined) {
    sets.push('kind = ?');
    args.push(cleanKind(params.kind, current.kind));
  }
  if (params.projectId !== undefined) {
    sets.push('project_id = ?');
    args.push(cleanProjectId(params.projectId));
  }
  if (params.tags !== undefined) {
    sets.push('tags = ?');
    args.push(JSON.stringify(cleanTags(params.tags)));
  }
  if (params.durationMin !== undefined) {
    sets.push('duration_min = ?');
    args.push(cleanDuration(params.durationMin));
  }

  const occurredAt = cleanOccurredAt(params.occurredAt);
  if (occurredAt !== null) {
    sets.push('occurred_at = ?');
    args.push(occurredAt);
    if (params.entryDate === undefined) {
      sets.push('entry_date = ?');
      args.push(logicalDate(occurredAt, getSettings().boundaryHour));
    }
  }
  if (params.entryDate !== undefined) {
    if (!isDateKey(params.entryDate)) throw new Error('日期格式不对。');
    sets.push('entry_date = ?');
    args.push(params.entryDate);
  }

  if (!sets.length) return current;
  sets.push('updated_at = ?');
  args.push(now(), id);
  db.prepare(`UPDATE entries SET ${sets.join(', ')} WHERE id = ?`).run(...args);
  return getEntry(id);
}

export function removeEntry(id) {
  const db = getDb();
  const current = getEntry(id);
  if (current.deletedAt) return { id, deletedAt: current.deletedAt };
  const deletedAt = now();
  db.prepare('UPDATE entries SET deleted_at = ?, updated_at = ? WHERE id = ?')
    .run(deletedAt, deletedAt, id);
  return { id, deletedAt };
}

export function restoreEntry(id) {
  const db = getDb();
  getEntry(id);
  db.prepare('UPDATE entries SET deleted_at = NULL, updated_at = ? WHERE id = ?')
    .run(now(), id);
  return getEntry(id);
}

export function entryTags(params = {}) {
  const db = getDb();
  const limit = Math.min(Math.max(Number(params.limit) || 50, 1), 200);
  const rows = db.prepare(
    'SELECT tags FROM entries WHERE deleted_at IS NULL ORDER BY occurred_at DESC LIMIT 5000'
  ).all();
  const counts = new Map();
  for (const row of rows) {
    const tags = parseJson(row.tags, []);
    if (!Array.isArray(tags)) continue;
    for (const tag of tags) {
      if (typeof tag !== 'string' || !tag) continue;
      counts.set(tag, (counts.get(tag) || 0) + 1);
    }
  }
  return {
    items: [...counts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
      .slice(0, limit),
  };
}

export function entryTimeline(params = {}) {
  const date = params.date || logicalDate(Date.now(), getSettings().boundaryHour);
  if (!isDateKey(date)) throw new Error('日期格式不对。');
  const list = listEntries({ date, limit: 500, order: 'desc' });
  const projects = new Map();
  let minutes = 0;
  let done = 0;
  for (const entry of list.items) {
    if (entry.kind === 'done') done += 1;
    if (entry.durationMin) minutes += entry.durationMin;
    if (entry.projectId) {
      const key = entry.projectId;
      const prev = projects.get(key) || {
        id: key,
        name: entry.projectName || '未命名项目',
        color: entry.projectColor || 'moss',
        count: 0,
      };
      prev.count += 1;
      projects.set(key, prev);
    }
  }
  return {
    date,
    items: list.items,
    stats: {
      count: list.total,
      done,
      minutes,
      projects: [...projects.values()].sort((a, b) => b.count - a.count),
    },
  };
}
