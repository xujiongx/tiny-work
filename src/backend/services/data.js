import { getDb, getDataDir, getDbPath, now, isDateKey, logicalDate } from '../db.js';
import { createEntry } from '../repo/entries.js';
import { backupNow } from './backup.js';

const TABLES = {
  projects: ['id', 'name', 'color', 'description', 'status', 'sort_order', 'created_at', 'updated_at'],
  tasks: [
    'id', 'title', 'note', 'status', 'priority', 'planned_date', 'due_date', 'project_id',
    'estimate_min', 'sort_order', 'completed_at', 'created_at', 'updated_at', 'deleted_at',
  ],
  entries: [
    'id', 'entry_date', 'occurred_at', 'content', 'kind', 'project_id', 'tags',
    'duration_min', 'source', 'task_id', 'created_at', 'updated_at', 'deleted_at',
  ],
  daily: ['date', 'summary', 'highlights', 'blockers', 'plan_next', 'mood', 'energy', 'created_at', 'updated_at'],
  snippets: [
    'id', 'title', 'content', 'kind', 'language', 'url', 'tags', 'created_at', 'updated_at', 'deleted_at',
  ],
  focus_sessions: [
    'id', 'started_at', 'ended_at', 'planned_min', 'actual_min', 'project_id', 'entry_id', 'status', 'note',
  ],
  performance_reviews: [
    'id', 'title', 'employee_name', 'period', 'grade', 'status',
    'manager_signature', 'employee_signature', 'source', 'created_at', 'updated_at', 'deleted_at',
  ],
  performance_dimensions: [
    'id', 'review_id', 'name', 'sort_order', 'created_at', 'updated_at',
  ],
  performance_items: [
    'id', 'dimension_id', 'comment', 'expectation', 'sort_order', 'created_at', 'updated_at',
  ],
  settings: ['key', 'value'],
};

const INSERT_ORDER = [
  'projects', 'tasks', 'entries', 'daily', 'snippets', 'focus_sessions',
  'performance_reviews', 'performance_dimensions', 'performance_items', 'settings',
];
const DELETE_ORDER = [
  'performance_items', 'performance_dimensions', 'performance_reviews',
  'focus_sessions', 'entries', 'tasks', 'daily', 'snippets', 'projects', 'settings',
];

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function tableRows(name) {
  return getDb().prepare(`SELECT * FROM ${name}`).all();
}

export async function exportJson(params = {}) {
  const db = getDb();
  const data = {};
  const counts = {};
  for (const name of Object.keys(TABLES)) {
    const rows = tableRows(name);
    data[name] = rows;
    counts[name] = rows.length;
  }

  const payload = {
    format: 'deskwork',
    version: 2,
    app: '案头',
    exportedAt: now(),
    generator: 'deskwork/0.1.0',
    counts,
    data,
  };

  let path = typeof params.path === 'string' ? params.path.trim() : '';
  if (!path) {
    const dir = getDataDir() + '/exports';
    await tjs.makeDir(dir, { recursive: true });
    path = `${dir}/deskwork-${stamp()}.json`;
  }
  const text = JSON.stringify(payload, null, 2);
  await tjs.writeFile(path, text);
  const info = await tjs.stat(path);
  return { path, size: info.size, at: Date.now(), counts };
}

function normalisePayload(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('这个文件不是有效的 JSON。');
  }
  if (!parsed || parsed.format !== 'deskwork') throw new Error('这不是案头导出的数据文件。');
  if (Number(parsed.version) > 2) throw new Error('这个文件来自更新的版本，当前应用还读不了。');
  const data = parsed.data || parsed;
  if (!data || typeof data !== 'object') throw new Error('导入文件缺少数据。');
  for (const name of Object.keys(TABLES)) {
    if (data[name] !== undefined && !Array.isArray(data[name])) throw new Error(`导入文件里的 ${name} 格式不对。`);
  }
  return data;
}

export async function importJson(params = {}) {
  const path = typeof params.path === 'string' ? params.path.trim() : '';
  if (!path) throw new Error('没有选择要导入的文件。');
  const mode = params.mode === 'replace' ? 'replace' : 'merge';
  let raw;
  try {
    const bytes = await tjs.readFile(path);
    raw = new TextDecoder().decode(bytes);
  } catch {
    throw new Error('读取导入文件失败，请确认文件还在。');
  }
  const data = normalisePayload(raw);

  // Always keep a consistent copy before touching the current database.
  let backupPath = null;
  try {
    const backup = await backupNow();
    backupPath = backup.path;
  } catch {
    throw new Error('导入前备份失败，已取消导入，数据没有变化。');
  }

  const db = getDb();
  const imported = {};
  const skipped = {};

  const run = db.transaction(() => {
    if (mode === 'replace') {
      for (const name of DELETE_ORDER) db.prepare(`DELETE FROM ${name}`).run();
    }
    for (const name of INSERT_ORDER) {
      const rows = Array.isArray(data[name]) ? data[name] : [];
      const cols = TABLES[name];
      const stmt = db.prepare(
        `INSERT OR REPLACE INTO ${name} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`
      );
      let count = 0;
      let bad = 0;
      for (const row of rows) {
        if (!row || typeof row !== 'object') {
          bad += 1;
          continue;
        }
        const values = cols.map((col) => (row[col] === undefined ? null : row[col]));
        try {
          stmt.run(...values);
          count += 1;
        } catch {
          bad += 1;
        }
      }
      imported[name] = count;
      if (bad) skipped[name] = bad;
    }
  });

  try {
    run();
  } catch (error) {
    throw new Error('导入没有完成：' + (error && error.message ? error.message : '数据格式不兼容'));
  }

  const check = db.prepare('PRAGMA integrity_check').all()[0] || {};
  const integrity = Object.values(check)[0];
  return {
    path,
    mode,
    backupPath,
    imported,
    skipped,
    integrity: integrity === 'ok' ? 'ok' : String(integrity || 'unknown'),
  };
}

export async function importLines(params = {}) {
  const path = typeof params.path === 'string' ? params.path.trim() : '';
  if (!path) throw new Error('没有选择要导入的文件。');
  const date = isDateKey(params.date)
    ? params.date
    : logicalDate(Date.now(), 0);
  let raw;
  try {
    const bytes = await tjs.readFile(path);
    raw = new TextDecoder().decode(bytes);
  } catch {
    throw new Error('读取旧便签文件失败，请确认文件还在。');
  }
  const lines = raw.split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-*+]\s+/, '').trim())
    .filter((line) => line && !line.startsWith('#'))
    .slice(0, 10000);
  if (!lines.length) throw new Error('这个文件里没有可导入的文字。');
  const db = getDb();
  let imported = 0;
  let skipped = 0;
  const run = db.transaction(() => {
    for (const line of lines) {
      try {
        createEntry({
          content: line.slice(0, 4000),
          kind: 'idea',
          entryDate: date,
          source: 'import',
          tags: ['旧便签'],
        });
        imported += 1;
      } catch {
        skipped += 1;
      }
    }
  });
  run();
  return { path, date, imported, skipped };
}

export function dataStats() {
  const db = getDb();
  const count = (sql) => db.prepare(sql).all()[0].n;
  const range = db.prepare(
    `SELECT MIN(entry_date) AS oldest, MAX(entry_date) AS newest
     FROM entries WHERE deleted_at IS NULL`
  ).all()[0] || {};
  return {
    dbPath: getDbPath(),
    entries: count('SELECT COUNT(*) AS n FROM entries WHERE deleted_at IS NULL'),
    tasks: count('SELECT COUNT(*) AS n FROM tasks WHERE deleted_at IS NULL'),
    projects: count('SELECT COUNT(*) AS n FROM projects'),
    snippets: count('SELECT COUNT(*) AS n FROM snippets WHERE deleted_at IS NULL'),
    daily: count('SELECT COUNT(*) AS n FROM daily'),
    performance: count('SELECT COUNT(*) AS n FROM performance_reviews WHERE deleted_at IS NULL'),
    oldest: range.oldest || null,
    newest: range.newest || null,
  };
}
