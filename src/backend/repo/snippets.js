import { getDb, newId, now, likeTerm, parseJson } from '../db.js';

export const SNIPPET_KINDS = ['snippet', 'command', 'link'];

const SELECT = 'SELECT * FROM snippets';

function mapSnippet(row) {
  const tags = parseJson(row.tags, []);
  return {
    id: row.id,
    title: row.title,
    content: row.content || '',
    kind: row.kind,
    language: row.language || '',
    url: row.url || '',
    tags: Array.isArray(tags) ? tags : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at || null,
  };
}

function cleanTitle(value) {
  if (typeof value !== 'string') throw new Error('给片段起个标题吧。');
  const title = value.trim();
  if (!title) throw new Error('给片段起个标题吧。');
  if (title.length > 120) throw new Error('片段标题最多 120 个字。');
  return title;
}

function cleanContent(value) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw new Error('片段内容格式不对。');
  if (value.length > 20000) throw new Error('片段内容最多 20000 个字。');
  return value;
}

function cleanKind(value, fallback = 'snippet') {
  if (value === undefined || value === null || value === '') return fallback;
  if (!SNIPPET_KINDS.includes(value)) throw new Error('片段类型不对。');
  return value;
}

function cleanTags(value) {
  let list = value;
  if (typeof list === 'string') list = list.split(/[,，\s]+/);
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();
  for (const raw of list) {
    if (typeof raw !== 'string') continue;
    const tag = raw.trim().replace(/^#/, '').slice(0, 20);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
    if (out.length >= 8) break;
  }
  return out;
}

function cleanUrl(value) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw new Error('链接格式不对。');
  const url = value.trim().slice(0, 2000);
  if (url && !/^https?:\/\//i.test(url)) throw new Error('链接需要以 http:// 或 https:// 开头。');
  return url;
}

export function getSnippet(id) {
  const row = getDb().prepare(`${SELECT} WHERE id = ?`).all(id)[0];
  if (!row) throw new Error('这个片段已经不在了。');
  return mapSnippet(row);
}

export function listSnippets(params = {}) {
  const db = getDb();
  const where = ['deleted_at IS NULL'];
  const args = [];
  if (params.kind) {
    where.push('kind = ?');
    args.push(cleanKind(params.kind));
  }
  if (params.tag) {
    where.push("tags LIKE ? ESCAPE '\\'");
    args.push(`%"${likeTerm(String(params.tag).replace(/^#/, ''))}"%`);
  }
  if (params.query) {
    const q = `%${likeTerm(String(params.query).trim())}%`;
    where.push("(title LIKE ? ESCAPE '\\' OR content LIKE ? ESCAPE '\\' OR url LIKE ? ESCAPE '\\' OR tags LIKE ? ESCAPE '\\')");
    args.push(q, q, q, q);
  }
  const limit = Math.min(Math.max(Number(params.limit) || 200, 1), 500);
  const rows = db.prepare(
    `${SELECT} WHERE ${where.join(' AND ')} ORDER BY updated_at DESC LIMIT ?`
  ).all(...args, limit);
  return { items: rows.map(mapSnippet), total: rows.length };
}

export function createSnippet(params = {}) {
  const db = getDb();
  const title = cleanTitle(params.title);
  const content = cleanContent(params.content);
  const kind = cleanKind(params.kind);
  const language = typeof params.language === 'string' ? params.language.trim().slice(0, 30) : '';
  const url = cleanUrl(params.url);
  const tags = cleanTags(params.tags);
  const ts = now();
  const id = newId('snip_');
  db.prepare(
    `INSERT INTO snippets
       (id, title, content, kind, language, url, tags, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, title, content, kind, language, url, JSON.stringify(tags), ts, ts);
  return getSnippet(id);
}

export function updateSnippet(id, params = {}) {
  const current = getSnippet(id);
  const sets = [];
  const args = [];
  if (params.title !== undefined) {
    sets.push('title = ?');
    args.push(cleanTitle(params.title));
  }
  if (params.content !== undefined) {
    sets.push('content = ?');
    args.push(cleanContent(params.content));
  }
  if (params.kind !== undefined) {
    sets.push('kind = ?');
    args.push(cleanKind(params.kind, current.kind));
  }
  if (params.language !== undefined) {
    sets.push('language = ?');
    args.push(typeof params.language === 'string' ? params.language.trim().slice(0, 30) : '');
  }
  if (params.url !== undefined) {
    sets.push('url = ?');
    args.push(cleanUrl(params.url));
  }
  if (params.tags !== undefined) {
    sets.push('tags = ?');
    args.push(JSON.stringify(cleanTags(params.tags)));
  }
  if (!sets.length) return current;
  sets.push('updated_at = ?');
  args.push(now(), id);
  getDb().prepare(`UPDATE snippets SET ${sets.join(', ')} WHERE id = ?`).run(...args);
  return getSnippet(id);
}

export function removeSnippet(id) {
  const current = getSnippet(id);
  if (current.deletedAt) return { id, deletedAt: current.deletedAt };
  const ts = now();
  getDb().prepare('UPDATE snippets SET deleted_at = ?, updated_at = ? WHERE id = ?')
    .run(ts, ts, id);
  return { id, deletedAt: ts };
}

export function restoreSnippet(id) {
  getSnippet(id);
  getDb().prepare('UPDATE snippets SET deleted_at = NULL, updated_at = ? WHERE id = ?')
    .run(now(), id);
  return getSnippet(id);
}
