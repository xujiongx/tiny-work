import { getDb, isDateKey, prevDateKey, nextDateKey, now, parseJson, logicalDate } from '../db.js';
import { getSettings } from './settings.js';
import { overview, breakdown } from './stats.js';

function requireRange(params = {}) {
  const start = params.start || params.from;
  const end = params.end || params.to;
  if (!isDateKey(start) || !isDateKey(end)) throw new Error('报告日期范围不对。');
  if (start > end) throw new Error('开始日期不能晚于结束日期。');
  return { start, end };
}

function oneLine(value, max) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > max ? text.slice(0, max) + '…' : text;
}

function projectKey(entry) {
  return entry.projectName || '未归类';
}

function groupByProject(items) {
  const groups = new Map();
  for (const item of items) {
    const key = item.project || '未归类';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return [...groups.entries()].sort((a, b) => {
    if (a[0] === '未归类') return 1;
    if (b[0] === '未归类') return -1;
    return b[1].length - a[1].length || a[0].localeCompare(b[0]);
  });
}

function fmtMinutes(minutes) {
  const n = Number(minutes) || 0;
  if (!n) return '0 分钟';
  if (n < 60) return `${n} 分钟`;
  const hours = n / 60;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} 小时`;
}

function renderSection(title, groups, emptyText) {
  const lines = [`## ${title}`, ''];
  if (!groups.length) {
    lines.push(emptyText, '');
    return lines;
  }
  for (const [project, items] of groups) {
    if (project !== '未归类' || groups.length > 1) lines.push(`### ${project}`, '');
    const seen = new Set();
    for (const item of items) {
      const text = oneLine(item.text, 220);
      if (!text || seen.has(text)) continue;
      seen.add(text);
      lines.push(`- ${text}`);
    }
    lines.push('');
  }
  return lines;
}

export function buildReport(params = {}) {
  const { start, end } = requireRange(params);
  const label = typeof params.label === 'string' && params.label.trim()
    ? params.label.trim().slice(0, 20)
    : '周报';
  const db = getDb();
  const settings = getSettings();

  const entries = db.prepare(
    `SELECT e.*, p.name AS project_name, p.color AS project_color
     FROM entries e
     LEFT JOIN projects p ON p.id = e.project_id
     WHERE e.deleted_at IS NULL AND e.entry_date BETWEEN ? AND ?
     ORDER BY e.occurred_at ASC`
  ).all(start, end);

  const tasksDone = db.prepare(
    `SELECT t.*, p.name AS project_name, p.color AS project_color
     FROM tasks t
     LEFT JOIN projects p ON p.id = t.project_id
     WHERE t.deleted_at IS NULL AND t.status = 'done'
       AND t.completed_at IS NOT NULL
       AND strftime('%Y-%m-%d', t.completed_at / 1000, 'unixepoch', 'localtime') BETWEEN ? AND ?
     ORDER BY t.completed_at ASC`
  ).all(start, end);

  const dailyRows = db.prepare(
    'SELECT * FROM daily WHERE date BETWEEN ? AND ? ORDER BY date ASC'
  ).all(start, end);

  const nextStart = nextDateKey(end);
  const nextEnd = (() => {
    let cursor = nextStart;
    for (let i = 0; i < 6; i += 1) cursor = nextDateKey(cursor);
    return cursor;
  })();
  const nextTasks = db.prepare(
    `SELECT t.*, p.name AS project_name
     FROM tasks t
     LEFT JOIN projects p ON p.id = t.project_id
     WHERE t.deleted_at IS NULL AND t.status IN ('inbox','todo','doing')
       AND (
         (t.planned_date IS NOT NULL AND t.planned_date BETWEEN ? AND ?)
         OR (t.planned_date IS NULL)
         OR (t.due_date IS NOT NULL AND t.due_date <= ?)
       )
     ORDER BY
       CASE WHEN t.due_date IS NOT NULL AND t.due_date <= ? THEN 0 ELSE 1 END,
       t.priority DESC, t.sort_order ASC
     LIMIT 15`
  ).all(nextStart, nextEnd, end, logicalDate(Date.now(), settings.boundaryHour));

  const taskById = new Map(tasksDone.map((task) => [task.id, task]));
  const seenTaskIds = new Set();

  const completed = [];
  const progress = [];
  const risks = [];
  const seenText = new Set();

  for (const entry of entries) {
    const text = entry.content;
    if (entry.kind === 'done') {
      if (entry.task_id && seenTaskIds.has(entry.task_id)) continue;
      if (entry.task_id) seenTaskIds.add(entry.task_id);
      const task = entry.task_id ? taskById.get(entry.task_id) : null;
      const finalText = task ? task.title : text;
      const dedupe = `${entry.entry_date}|${finalText.trim()}|completed`;
      if (seenText.has(dedupe)) continue;
      seenText.add(dedupe);
      completed.push({ project: task ? (task.project_name || '未归类') : projectKey(entry), text: finalText });
    } else if (entry.kind === 'blocker') {
      const dedupe = `${entry.entry_date}|${text.trim()}|risk`;
      if (seenText.has(dedupe)) continue;
      seenText.add(dedupe);
      risks.push({ project: projectKey(entry), text });
    } else if (entry.kind === 'log' || entry.kind === 'meeting' || entry.kind === 'learning') {
      const dedupe = `${entry.entry_date}|${text.trim()}|progress`;
      if (seenText.has(dedupe)) continue;
      seenText.add(dedupe);
      progress.push({ project: projectKey(entry), text });
    }
  }

  for (const task of tasksDone) {
    if (seenTaskIds.has(task.id)) continue;
    seenTaskIds.add(task.id);
    completed.push({ project: task.project_name || '未归类', text: task.title });
  }

  const next = [];
  const dailyPlans = [];
  for (const row of dailyRows) {
    const list = parseJson(row.plan_next, []);
    if (Array.isArray(list)) {
      for (const item of list) {
        if (typeof item === 'string' && item.trim()) dailyPlans.push(item.trim());
      }
    }
    const blockers = parseJson(row.blockers, []);
    if (Array.isArray(blockers)) {
      for (const item of blockers) {
        if (typeof item === 'string' && item.trim()) {
          risks.push({ project: '日报 · ' + row.date, text: item.trim() });
        }
      }
    }
  }
  for (const task of nextTasks) {
    next.push({ project: task.project_name || '未归类', text: task.title });
  }
  for (const item of dailyPlans) {
    next.push({ project: '日报计划', text: item });
  }

  const stats = overview({ from: start, to: end });
  const split = breakdown({ from: start, to: end });
  const projectText = split.byProject
    .filter((item) => item.count)
    .slice(0, 8)
    .map((item) => `${item.name} ${item.count}`)
    .join(' · ');

  const empty = entries.length === 0 && tasksDone.length === 0 && dailyRows.length === 0;
  const lines = [];
  if (empty) {
    lines.push(`# ${label} · ${start} – ${end}`, '', '这段时间还没有记录，先写几条再来生成吧。');
  } else {
    lines.push(`# ${label} · ${start} – ${end}`, '');
    lines.push(...renderSection('一、本周完成', groupByProject(completed), '这周没有标记完成的记录。'));
    lines.push(...renderSection('二、关键进展', groupByProject(progress), '这周没有补充进展记录。'));
    lines.push(...renderSection('三、问题与风险', groupByProject(risks), '这周没有记录阻塞或风险。'));
    lines.push('## 四、数据', '');
    lines.push(
      `- 记录 ${stats.entries} 条 · 完成 ${stats.doneEntries} 条 · 完成任务 ${stats.tasksDone} 个`
    );
    lines.push(
      `- 投入 ${fmtMinutes(stats.minutes)} · 专注 ${fmtMinutes(stats.focusMin)} · 活跃 ${stats.activeDays} 天`
    );
    if (projectText) lines.push(`- 项目分布：${projectText}`);
    lines.push('');
    lines.push(...renderSection('五、下周计划', groupByProject(next), '还没有安排下周的任务。'));
  }

  const markdown = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  return {
    markdown,
    data: {
      start,
      end,
      label,
      entries: entries.length,
      completed: completed.length,
      progress: progress.length,
      risks: risks.length,
      next: next.length,
      stats,
    },
    empty,
    generatedAt: now(),
  };
}

export function exportReport(params = {}) {
  const markdown = typeof params.markdown === 'string' ? params.markdown : '';
  const path = typeof params.path === 'string' ? params.path : '';
  if (!path) throw new Error('没有选择保存位置。');
  if (!markdown.trim()) throw new Error('报告还是空的，先生成或写一点内容吧。');
  return tjs.writeFile(path, markdown).then(async () => {
    const info = await tjs.stat(path);
    return { path, size: info.size, at: Date.now() };
  });
}

export function nextWeekRange(end) {
  const start = nextDateKey(end);
  let cursor = start;
  for (let i = 0; i < 6; i += 1) cursor = nextDateKey(cursor);
  return { start, end: cursor, previous: prevDateKey(start) };
}
