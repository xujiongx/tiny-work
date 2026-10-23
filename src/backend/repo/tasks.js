import { getDb, newId, now, isDateKey, logicalDate } from '../db.js';
import { getSettings } from '../services/settings.js';
import { createEntry, getEntry, removeEntry, restoreEntry } from './entries.js';

export const TASK_STATUSES = ['inbox', 'todo', 'doing', 'done', 'dropped'];

const SELECT = `
  SELECT t.*, p.name AS project_name, p.color AS project_color
  FROM tasks t
  LEFT JOIN projects p ON p.id = t.project_id
`;

function mapTask(row) {
  return {
    id: row.id,
    title: row.title,
    note: row.note || '',
    status: row.status,
    priority: row.priority,
    plannedDate: row.planned_date || null,
    dueDate: row.due_date || null,
    projectId: row.project_id,
    projectName: row.project_name || null,
    projectColor: row.project_color || null,
    estimateMin: row.estimate_min ?? null,
    sortOrder: row.sort_order,
    completedAt: row.completed_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at || null,
  };
}

function cleanTitle(value) {
  if (typeof value !== 'string') throw new Error('先写一件要做的事。');
  const title = value.trim();
  if (!title) throw new Error('先写一件要做的事。');
  if (title.length > 200) throw new Error('任务标题最多 200 个字。');
  return title;
}

function cleanNote(value) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, 2000);
}

function cleanStatus(value, fallback = 'inbox') {
  if (value === undefined || value === null || value === '') return fallback;
  if (!TASK_STATUSES.includes(value)) throw new Error('任务状态不对。');
  return value;
}

function cleanPriority(value) {
  if (value === undefined || value === null || value === '') return 1;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 3) throw new Error('优先级不对。');
  return n;
}

function cleanDate(value, field = '日期') {
  if (value === undefined || value === null || value === '') return null;
  if (!isDateKey(value)) throw new Error(`${field}格式不对。`);
  return value;
}

function cleanEstimate(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 10080) throw new Error('预计耗时不对。');
  return Math.round(n);
}

function cleanProjectId(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new Error('项目不对。');
  const row = getDb().prepare('SELECT id FROM projects WHERE id = ?').all(value)[0];
  if (!row) throw new Error('选择的项目已经不在了。');
  return value;
}

export function getTask(id) {
  const db = getDb();
  const row = db.prepare(`${SELECT} WHERE t.id = ?`).all(id)[0];
  if (!row) throw new Error('这个任务已经不在了。');
  return mapTask(row);
}

export function createTask(params = {}) {
  const db = getDb();
  const title = cleanTitle(params.title);
  const note = cleanNote(params.note) || '';
  const plannedDate = cleanDate(params.plannedDate, '计划日期');
  const dueDate = cleanDate(params.dueDate, '截止日期');
  const projectId = cleanProjectId(params.projectId);
  const priority = cleanPriority(params.priority);
  const estimateMin = cleanEstimate(params.estimateMin);
  const status = cleanStatus(params.status, plannedDate ? 'todo' : 'inbox');
  const ts = now();
  const id = newId('task_');
  const order = db.prepare(
    'SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM tasks WHERE deleted_at IS NULL'
  ).all()[0].n;

  db.prepare(
    `INSERT INTO tasks
       (id, title, note, status, priority, planned_date, due_date, project_id,
        estimate_min, sort_order, completed_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id, title, note, status, priority, plannedDate, dueDate, projectId,
    estimateMin, order, status === 'done' ? ts : null, ts, ts
  );

  return getTask(id);
}

export function updateTask(id, params = {}) {
  const db = getDb();
  const current = getTask(id);
  const sets = [];
  const args = [];

  if (params.title !== undefined) {
    sets.push('title = ?');
    args.push(cleanTitle(params.title));
  }
  if (params.note !== undefined) {
    sets.push('note = ?');
    args.push(cleanNote(params.note) || '');
  }
  if (params.priority !== undefined) {
    sets.push('priority = ?');
    args.push(cleanPriority(params.priority));
  }
  if (params.plannedDate !== undefined) {
    sets.push('planned_date = ?');
    args.push(cleanDate(params.plannedDate, '计划日期'));
  }
  if (params.dueDate !== undefined) {
    sets.push('due_date = ?');
    args.push(cleanDate(params.dueDate, '截止日期'));
  }
  if (params.projectId !== undefined) {
    sets.push('project_id = ?');
    args.push(cleanProjectId(params.projectId));
  }
  if (params.estimateMin !== undefined) {
    sets.push('estimate_min = ?');
    args.push(cleanEstimate(params.estimateMin));
  }
  if (params.status !== undefined) {
    const status = cleanStatus(params.status);
    sets.push('status = ?');
    args.push(status);
    if (status === 'done' && current.status !== 'done') {
      sets.push('completed_at = ?');
      args.push(now());
    } else if (status !== 'done') {
      sets.push('completed_at = NULL');
    }
  }

  if (!sets.length) return current;
  sets.push('updated_at = ?');
  args.push(now(), id);
  db.prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`).run(...args);
  return getTask(id);
}

export function toggleTask(id, done) {
  const db = getDb();
  const current = getTask(id);
  const settings = getSettings();
  const ts = now();
  let entry = null;

  if (done) {
    db.prepare("UPDATE tasks SET status = 'done', completed_at = ?, updated_at = ? WHERE id = ?")
      .run(ts, ts, id);

    if (settings.autoTaskEntry) {
      const linked = db.prepare(
        `SELECT id, deleted_at FROM entries
         WHERE task_id = ? AND source = 'task'
         ORDER BY created_at ASC LIMIT 1`
      ).all(id)[0];
      if (linked) {
        entry = linked.deleted_at ? restoreEntry(linked.id) : getEntry(linked.id);
      } else {
        entry = createEntry({
          content: `完成：${current.title}`,
          kind: 'done',
          projectId: current.projectId,
          durationMin: current.estimateMin,
          occurredAt: ts,
          entryDate: logicalDate(ts, settings.boundaryHour),
          source: 'task',
          taskId: id,
        });
      }
    }
  } else {
    const status = current.plannedDate ? 'todo' : 'inbox';
    db.prepare('UPDATE tasks SET status = ?, completed_at = NULL, updated_at = ? WHERE id = ?')
      .run(status, ts, id);
    const linked = db.prepare(
      `SELECT id FROM entries
       WHERE task_id = ? AND source = 'task' AND deleted_at IS NULL
       ORDER BY created_at ASC LIMIT 1`
    ).all(id)[0];
    if (linked) {
      removeEntry(linked.id);
      entry = null;
    }
  }

  return { ...getTask(id), entry };
}

export function listTasks(params = {}) {
  const db = getDb();
  const view = params.view || 'today';
  const date = params.date || logicalDate(Date.now(), getSettings().boundaryHour);
  if ((view === 'today' || view === 'upcoming') && !isDateKey(date)) {
    throw new Error('日期格式不对。');
  }

  const count = (sql, args = []) => db.prepare(sql).all(...args)[0].n;
  const counts = {
    today: count(
      `SELECT COUNT(*) AS n FROM tasks t
       WHERE t.deleted_at IS NULL AND t.status IN ('todo','doing')
         AND (t.planned_date = ? OR (t.due_date IS NOT NULL AND t.due_date <= ?))`,
      [date, date]
    ),
    upcoming: count(
      `SELECT COUNT(*) AS n FROM tasks t
       WHERE t.deleted_at IS NULL AND t.status IN ('todo','doing')
         AND t.planned_date > ?`,
      [date]
    ),
    inbox: count(
      "SELECT COUNT(*) AS n FROM tasks t WHERE t.deleted_at IS NULL AND t.status = 'inbox'"
    ),
    done: count(
      "SELECT COUNT(*) AS n FROM tasks t WHERE t.deleted_at IS NULL AND t.status = 'done'"
    ),
  };

  let where = 't.deleted_at IS NULL';
  const args = [];
  let order = 't.sort_order ASC, t.created_at ASC';
  let limit = 200;

  if (view === 'today') {
    where += " AND t.status IN ('todo','doing') AND (t.planned_date = ? OR (t.due_date IS NOT NULL AND t.due_date <= ?))";
    args.push(date, date);
  } else if (view === 'upcoming') {
    where += " AND t.status IN ('todo','doing') AND t.planned_date > ?";
    args.push(date);
  } else if (view === 'inbox') {
    where += " AND t.status = 'inbox'";
  } else if (view === 'done') {
    where += " AND t.status = 'done'";
    order = 'CASE WHEN t.completed_at IS NULL THEN 1 ELSE 0 END, t.completed_at DESC, t.updated_at DESC';
    limit = 100;
  } else if (view !== 'all') {
    throw new Error('任务视图不对。');
  }

  if (params.projectId) {
    where += ' AND t.project_id = ?';
    args.push(params.projectId);
  }
  if (params.includeDone === false) {
    where += " AND t.status NOT IN ('done','dropped')";
  }

  const rows = db.prepare(
    `${SELECT} WHERE ${where} ORDER BY ${order} LIMIT ?`
  ).all(...args, limit);

  return { items: rows.map(mapTask), counts };
}

export function reorderTasks(ids) {
  if (!Array.isArray(ids)) throw new Error('排序数据不对。');
  const db = getDb();
  const stmt = db.prepare('UPDATE tasks SET sort_order = ?, updated_at = ? WHERE id = ?');
  const ts = now();
  const run = db.transaction(() => {
    ids.forEach((id, index) => stmt.run(index, ts, id));
  });
  run();
  return { ok: true };
}

export function removeTask(id) {
  const db = getDb();
  const current = getTask(id);
  if (current.deletedAt) return { id, deletedAt: current.deletedAt };
  const deletedAt = now();
  db.prepare('UPDATE tasks SET deleted_at = ?, updated_at = ? WHERE id = ?')
    .run(deletedAt, deletedAt, id);
  return { id, deletedAt };
}

export function restoreTask(id) {
  const db = getDb();
  getTask(id);
  db.prepare('UPDATE tasks SET deleted_at = NULL, updated_at = ? WHERE id = ?')
    .run(now(), id);
  return getTask(id);
}
