import { getDb, newId, now, isDateKey } from '../db.js';

export const PROJECT_COLORS = ['moss', 'clay', 'ochre', 'indigo', 'plum'];

const SELECT = `
  SELECT p.*,
    (SELECT COUNT(*) FROM entries e
      WHERE e.project_id = p.id AND e.deleted_at IS NULL) AS entry_count,
    (SELECT COUNT(*) FROM tasks t
      WHERE t.project_id = p.id AND t.deleted_at IS NULL
        AND t.status NOT IN ('done', 'dropped')) AS open_task_count,
    (SELECT MAX(e.occurred_at) FROM entries e
      WHERE e.project_id = p.id AND e.deleted_at IS NULL) AS last_entry_at
  FROM projects p
`;

function mapProject(row) {
  return {
    id: row.id,
    name: row.name,
    color: PROJECT_COLORS.includes(row.color) ? row.color : 'moss',
    description: row.description || '',
    status: row.status,
    sortOrder: row.sort_order,
    entryCount: row.entry_count || 0,
    weekEntryCount: row.week_entry_count || 0,
    openTaskCount: row.open_task_count || 0,
    lastEntryAt: row.last_entry_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function cleanName(value) {
  if (typeof value !== 'string') throw new Error('给项目起个名字吧。');
  const name = value.trim();
  if (!name) throw new Error('给项目起个名字吧。');
  if (name.length > 40) throw new Error('项目名最多 40 个字。');
  return name;
}

function cleanDescription(value) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, 400);
}

function cleanColor(value) {
  return PROJECT_COLORS.includes(value) ? value : 'moss';
}

export function listProjects(params = {}, includeArchived = false) {
  const db = getDb();
  const all = params.includeArchived === true || includeArchived === true;
  const rows = db.prepare(
    `${SELECT}
     ${all ? '' : "WHERE p.status = 'active'"}
     ORDER BY CASE p.status WHEN 'active' THEN 0 ELSE 1 END,
              p.sort_order ASC, p.created_at ASC`
  ).all();
  const items = rows.map(mapProject);
  if (isDateKey(params.weekFrom) && isDateKey(params.weekTo)) {
    const stmt = db.prepare(
      `SELECT COUNT(*) AS n FROM entries
       WHERE project_id = ? AND deleted_at IS NULL AND entry_date BETWEEN ? AND ?`
    );
    for (const item of items) {
      item.weekEntryCount = stmt.all(item.id, params.weekFrom, params.weekTo)[0].n;
    }
  }
  return { items };
}

export function getProject(id) {
  const db = getDb();
  const row = db.prepare(`${SELECT} WHERE p.id = ?`).all(id)[0];
  if (!row) throw new Error('这个项目已经不在了。');
  return mapProject(row);
}

export function createProject(params = {}) {
  const db = getDb();
  const name = cleanName(params.name);
  const description = cleanDescription(params.description) || '';
  const color = cleanColor(params.color);
  const ts = now();
  const id = newId('proj_');
  const order = db.prepare(
    'SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM projects'
  ).all()[0].n;

  db.prepare(
    `INSERT INTO projects (id, name, color, description, status, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'active', ?, ?, ?)`
  ).run(id, name, color, description, order, ts, ts);

  return getProject(id);
}

export function updateProject(id, params = {}) {
  const db = getDb();
  const current = getProject(id);
  const sets = [];
  const args = [];

  if (params.name !== undefined) {
    sets.push('name = ?');
    args.push(cleanName(params.name));
  }
  if (params.color !== undefined) {
    sets.push('color = ?');
    args.push(cleanColor(params.color));
  }
  if (params.description !== undefined) {
    sets.push('description = ?');
    args.push(cleanDescription(params.description) || '');
  }
  if (params.archived !== undefined) {
    sets.push('status = ?');
    args.push(params.archived ? 'archived' : 'active');
  }

  if (!sets.length) return current;
  sets.push('updated_at = ?');
  args.push(now(), id);
  db.prepare(`UPDATE projects SET ${sets.join(', ')} WHERE id = ?`).run(...args);
  return getProject(id);
}

export function removeProject(id) {
  const db = getDb();
  getProject(id);
  db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  return { id };
}
