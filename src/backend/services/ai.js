// Optional AI assistant. Everything is explicit: the app only sends records to
// the configured OpenAI-compatible endpoint after the user presses a generate
// button. The API key lives in the OS keychain (app.secrets), never in SQLite
// and never in a response sent to the page.

import { getDb, isDateKey, now, parseJson } from '../db.js';
import { getSettings, setSettings, cleanAiBaseUrl } from './settings.js';
import { buildReport, nextWeekRange } from './report.js';
import { getPerformance } from './performance.js';
import { overview, breakdown } from './stats.js';

export const AI_SECRET_KEY = 'ai.apiKey';

const DEFAULT_BASE_URL = 'https://apihub.agnes-ai.com/v1';
const DEFAULT_MODEL = 'agnes-2.5-flash';
const REQUEST_TIMEOUT = 90 * 1000;
const JSON_SYSTEM_PROMPT = [
  '你是一名严谨的中文职场写作助手。',
  '只根据用户提供的工作数据写作，不编造事实、数字、客户、项目或成果。',
  '表达具体、克制、可执行，不使用空泛的套话。',
  '必须只返回合法 JSON，不要 Markdown 代码围栏，不要额外解释。',
].join('');

const KIND_LABELS = {
  log: '进展',
  done: '完成',
  blocker: '阻塞',
  idea: '想法',
  meeting: '会议',
  learning: '学习',
};

function clip(value, max) {
  const text = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + '…';
}

function limitText(value, max) {
  const text = String(value == null ? '' : value).trim();
  if (text.length <= max) return text;
  const cut = text.lastIndexOf('\n', max);
  return text.slice(0, cut > max * 0.7 ? cut : max) + '\n…（后续内容已截断）';
}

function textValue(value, max) {
  if (typeof value !== 'string') return '';
  return value.replace(/\r\n/g, '\n').trim().slice(0, max);
}

function listValue(value, maxItems, maxChars) {
  let list = value;
  if (typeof value === 'string') list = value.split(/\r?\n/);
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();
  for (const item of list) {
    if (typeof item !== 'string') continue;
    const line = item.trim().replace(/^[-*]\s*/, '').slice(0, maxChars);
    if (!line || seen.has(line)) continue;
    seen.add(line);
    out.push(line);
    if (out.length >= maxItems) break;
  }
  return out;
}

function stripCodeFence(value) {
  return String(value == null ? '' : value)
    .trim()
    .replace(/^```(?:json|markdown|md|text)?\s*\n?/i, '')
    .replace(/\n?```\s*$/i, '')
    .trim();
}

function parseAiJson(value) {
  const text = stripCodeFence(value);
  const candidates = [text];
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) candidates.push(text.slice(start, end + 1));
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch {
      // Try the next, slightly more forgiving candidate.
    }
  }
  throw new Error('AI 返回的内容格式不对，请再试一次。');
}

function localDateKey(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function monthEnd(year, month) {
  const d = new Date(Date.UTC(year, month, 0));
  return d.toISOString().slice(0, 10);
}

const QUARTER_CN = { 一: 1, 二: 2, 三: 3, 四: 4 };

/** Turn "2026 Q3" / "2026年第三季度" / "2026-07" into a date range. */
export function parsePeriodRange(period) {
  const text = String(period == null ? '' : period).trim();
  if (!text) return null;
  let match = text.match(/(\d{4})\s*[-/ ]?\s*Q\s*([1-4])/i);
  if (!match) {
    match = text.match(/(\d{4})\s*年?\s*第?\s*([一二三四1-4])\s*季度/);
  }
  if (match) {
    const year = Number(match[1]);
    const quarter = QUARTER_CN[match[2]] || Number(match[2]);
    if (quarter >= 1 && quarter <= 4) {
      const startMonth = (quarter - 1) * 3 + 1;
      const endMonth = startMonth + 2;
      return {
        start: `${year}-${String(startMonth).padStart(2, '0')}-01`,
        end: monthEnd(year, endMonth),
        label: `${year} Q${quarter}`,
      };
    }
  }
  match = text.match(/^(\d{4})-(\d{2})$/);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (month >= 1 && month <= 12) {
      return {
        start: `${year}-${String(month).padStart(2, '0')}-01`,
        end: monthEnd(year, month),
        label: `${year}-${String(month).padStart(2, '0')}`,
      };
    }
  }
  return null;
}

async function readSecret(app) {
  if (!app || !app.secrets || typeof app.secrets.get !== 'function') {
    return { value: null, error: '当前环境不支持系统钥匙串，无法读取 API Key。' };
  }
  try {
    return { value: await app.secrets.get(AI_SECRET_KEY), error: '' };
  } catch {
    return { value: null, error: '系统钥匙串暂时不可用，无法读取 API Key。' };
  }
}

async function resolveConfig(app, overrides = {}) {
  const settings = getSettings();
  const stored = await readSecret(app);
  const overrideKey = typeof overrides.apiKey === 'string' ? overrides.apiKey.trim() : '';
  return {
    enabled: overrides.enabled === undefined ? Boolean(settings.aiEnabled) : Boolean(overrides.enabled),
    baseUrl: cleanAiBaseUrl(overrides.baseUrl === undefined ? settings.aiBaseUrl : overrides.baseUrl),
    model: String(overrides.model === undefined ? settings.aiModel : overrides.model).trim()
      || DEFAULT_MODEL,
    apiKey: overrideKey || stored.value || '',
    hasStoredKey: Boolean(stored.value),
    secretError: stored.error,
  };
}

export async function aiStatus(app) {
  const config = await resolveConfig(app, {});
  return {
    enabled: config.enabled,
    baseUrl: config.baseUrl,
    model: config.model,
    hasKey: Boolean(config.apiKey),
    keyHint: config.apiKey ? '••••' + config.apiKey.slice(-4) : '',
    secretError: config.secretError,
    defaultBaseUrl: DEFAULT_BASE_URL,
    defaultModel: DEFAULT_MODEL,
  };
}

export async function saveAiSettings(params = {}, app) {
  const patch = {};
  if (params.enabled !== undefined) patch.aiEnabled = Boolean(params.enabled);
  if (params.baseUrl !== undefined) patch.aiBaseUrl = params.baseUrl;
  if (params.model !== undefined) patch.aiModel = params.model;
  if (Object.keys(patch).length) setSettings(patch);

  if (!app || !app.secrets || typeof app.secrets.set !== 'function') {
    throw new Error('当前环境不支持系统钥匙串，API Key 没有保存。');
  }
  try {
    if (params.clearKey) await app.secrets.delete(AI_SECRET_KEY);
    const apiKey = typeof params.apiKey === 'string' ? params.apiKey.trim() : '';
    if (apiKey) await app.secrets.set(AI_SECRET_KEY, apiKey);
  } catch {
    throw new Error('API Key 没有保存成功，请检查系统钥匙串权限。');
  }
  return aiStatus(app);
}

export async function clearAiKey(app) {
  if (!app || !app.secrets || typeof app.secrets.delete !== 'function') {
    throw new Error('当前环境不支持系统钥匙串。');
  }
  try {
    await app.secrets.delete(AI_SECRET_KEY);
  } catch {
    throw new Error('API Key 没有删除成功，请检查系统钥匙串权限。');
  }
  return aiStatus(app);
}

async function requestChat(config, messages, options = {}) {
  if (!config.enabled && options.requireEnabled !== false) {
    throw new Error('AI 助手还没有启用。请到「设置 → AI 助手」打开开关。');
  }
  if (!config.apiKey) {
    throw new Error('还没有填写 AI API Key。请到「设置 → AI 助手」填写。');
  }

  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  let timer = null;
  let timeoutFallback = null;
  const request = fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: options.temperature === undefined ? 0.3 : options.temperature,
      max_tokens: options.maxTokens || 1800,
      stream: false,
    }),
    signal: controller ? controller.signal : undefined,
  });

  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      try {
        if (controller) controller.abort();
      } catch {
        // Abort may be unavailable; the fallback still rejects.
      }
      timeoutFallback = new Error('AI 请求超时了，请稍后重试。');
      reject(timeoutFallback);
    }, REQUEST_TIMEOUT);
  });

  let response;
  try {
    response = await Promise.race([request, timeout]);
  } catch (error) {
    if (timeoutFallback || (error && error.name === 'AbortError')) {
      throw new Error('AI 请求超时了，请稍后重试。');
    }
    throw new Error('没能连接到 AI 服务，请检查网络或接口地址。');
  } finally {
    if (timer) clearTimeout(timer);
  }

  let raw = '';
  try {
    raw = await response.text();
  } catch {
    throw new Error('AI 响应读取失败，请稍后重试。');
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error('AI 服务拒绝了这次请求，API Key 可能无效或没有权限。');
    }
    if (response.status === 404) {
      throw new Error('AI 接口地址或模型名称不对，请检查设置。');
    }
    if (response.status === 429) {
      throw new Error('AI 服务请求太频繁了，请稍后再试。');
    }
    if (response.status >= 500) {
      throw new Error('AI 服务暂时不可用，请稍后再试。');
    }
    throw new Error(`AI 服务拒绝了这次请求（${response.status}），请检查接口地址和模型名称。`);
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error('AI 服务返回的不是有效响应，请检查接口地址。');
  }
  const choice = data && Array.isArray(data.choices) ? data.choices[0] : null;
  let content = choice && choice.message ? choice.message.content : '';
  if (Array.isArray(content)) {
    content = content.map((part) => (
      typeof part === 'string' ? part : (part && typeof part.text === 'string' ? part.text : '')
    )).join('');
  }
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('AI 没有返回内容，请稍后再试。');
  }
  return content.trim();
}

async function chat(app, messages, options = {}) {
  const config = await resolveConfig(app, options.overrides || {});
  if (config.secretError && !config.apiKey) throw new Error(config.secretError);
  const content = await requestChat(config, messages, options);
  return { content, model: config.model };
}

function entryLines(rows) {
  return rows.map((row) => {
    const parts = [`- ${row.entry_date}`, `[${KIND_LABELS[row.kind] || row.kind}]`];
    if (row.project_name) parts.push(`[${row.project_name}]`);
    if (row.duration_min) parts.push(`(${row.duration_min} 分钟)`);
    const tags = parseJson(row.tags, []);
    if (Array.isArray(tags) && tags.length) parts.push(`#${tags.slice(0, 4).join(' #')}`);
    parts.push(`：${clip(row.content, 360)}`);
    return parts.join(' ');
  }).join('\n');
}

function taskLines(rows) {
  return rows.map((row) => {
    const project = row.project_name ? `[${row.project_name}] ` : '';
    return `- ${project}${clip(row.title, 220)}${row.note ? `（备注：${clip(row.note, 160)}）` : ''}`;
  }).join('\n');
}

function dailyLines(rows) {
  return rows.map((row) => {
    const highlights = parseJson(row.highlights, []);
    const blockers = parseJson(row.blockers, []);
    const plan = parseJson(row.plan_next, []);
    const bits = [];
    if (row.summary) bits.push(`总结：${clip(row.summary, 220)}`);
    if (Array.isArray(highlights) && highlights.length) {
      bits.push(`亮点：${highlights.slice(0, 5).map((item) => clip(item, 120)).join('；')}`);
    }
    if (Array.isArray(blockers) && blockers.length) {
      bits.push(`阻塞：${blockers.slice(0, 3).map((item) => clip(item, 120)).join('；')}`);
    }
    if (Array.isArray(plan) && plan.length) {
      bits.push(`计划：${plan.slice(0, 4).map((item) => clip(item, 120)).join('；')}`);
    }
    return `- ${row.date} ${bits.join(' / ') || '（无文字）'}`;
  }).join('\n');
}

function collectDaily(date) {
  const db = getDb();
  const entries = db.prepare(
    `SELECT e.entry_date, e.content, e.kind, e.duration_min, e.tags, p.name AS project_name
       FROM entries e LEFT JOIN projects p ON p.id = e.project_id
      WHERE e.deleted_at IS NULL AND e.entry_date = ?
      ORDER BY e.occurred_at ASC
      LIMIT 60`
  ).all(date);
  const tasksDone = db.prepare(
    `SELECT t.title, t.note, p.name AS project_name
       FROM tasks t LEFT JOIN projects p ON p.id = t.project_id
      WHERE t.deleted_at IS NULL AND t.status = 'done' AND t.completed_at IS NOT NULL
        AND strftime('%Y-%m-%d', t.completed_at / 1000, 'unixepoch', 'localtime') = ?
      ORDER BY t.completed_at ASC
      LIMIT 40`
  ).all(date);
  const tasksOpen = db.prepare(
    `SELECT t.title, t.note, t.status, t.priority, t.due_date, p.name AS project_name
       FROM tasks t LEFT JOIN projects p ON p.id = t.project_id
      WHERE t.deleted_at IS NULL AND t.status IN ('inbox','todo','doing')
        AND (t.planned_date = ? OR (t.due_date IS NOT NULL AND t.due_date <= ?))
      ORDER BY t.priority DESC, t.sort_order ASC
      LIMIT 30`
  ).all(date, date);
  const daily = db.prepare('SELECT * FROM daily WHERE date = ?').all(date)[0] || null;
  const recent = db.prepare(
    `SELECT date, summary, highlights, blockers, plan_next
       FROM daily WHERE date < ? AND date >= ?
       ORDER BY date DESC LIMIT 3`
  ).all(date, localDateKey(Date.now() - 7 * 86400000));
  return { entries, tasksDone, tasksOpen, daily, recent };
}

function formatDailyPayload(date, context) {
  const sections = [`日期：${date}`, `记录 ${context.entries.length} 条：`];
  sections.push(entryLines(context.entries) || '（无）');
  sections.push(`完成的任务 ${context.tasksDone.length} 个：`);
  sections.push(taskLines(context.tasksDone) || '（无）');
  sections.push(`当天相关未完成任务 ${context.tasksOpen.length} 个：`);
  sections.push(taskLines(context.tasksOpen) || '（无）');
  if (context.daily) {
    sections.push('已有日报：');
    sections.push(dailyLines([context.daily]) || '（无）');
  }
  if (context.recent.length) {
    sections.push('最近几天日报摘要（仅用于连续性，不要照抄）：');
    sections.push(dailyLines(context.recent));
  }
  return limitText(sections.join('\n'), 14000);
}

export async function aiDaily(params = {}, app) {
  const date = params.date;
  if (!isDateKey(date)) throw new Error('日期格式不对。');
  const context = collectDaily(date);
  const hasData = context.entries.length || context.tasksDone.length || context.tasksOpen.length
    || (context.daily && (
      context.daily.summary
      || parseJson(context.daily.highlights, []).length
      || parseJson(context.daily.blockers, []).length
      || parseJson(context.daily.plan_next, []).length
    ));
  if (!hasData) throw new Error('这一天还没有记录，先写几条再让 AI 生成吧。');

  const result = await chat(app, [
    { role: 'system', content: JSON_SYSTEM_PROMPT },
    {
      role: 'user',
      content: [
        '请根据下面的工作数据，写一份中文日报。',
        '要求：',
        '1. summary 用 2–4 句话概括今天最有价值的进展，不要流水账。',
        '2. highlights 写 3–6 条具体完成或推进的事项，每条一句话。',
        '3. blockers 写 0–3 条真实阻塞或风险；没有就返回空数组。',
        '4. planNext 写 2–5 条明天可执行的动作；优先使用数据里已有的计划。',
        '5. 不要编造数据中没有的项目、客户、数字或成果。',
        '6. 所有数组元素是纯文本，不要编号，不要 Markdown。',
        '返回 JSON：{"summary":"...","highlights":["..."],"blockers":["..."],"planNext":["..."]}',
        '',
        formatDailyPayload(date, context),
      ].join('\n'),
    },
  ], { maxTokens: 1500, temperature: 0.25 });

  const data = parseAiJson(result.content);
  const summary = textValue(data.summary, 1600);
  const highlights = listValue(data.highlights, 12, 300);
  const blockers = listValue(data.blockers, 8, 300);
  const planNext = listValue(data.planNext, 10, 300);
  if (!summary && !highlights.length && !blockers.length && !planNext.length) {
    throw new Error('AI 没有给出可用的日报内容，请再试一次。');
  }
  return {
    date,
    summary,
    highlights,
    blockers,
    planNext,
    source: 'ai',
    model: result.model,
    generatedAt: now(),
    inputStats: {
      entries: context.entries.length,
      tasksDone: context.tasksDone.length,
      tasksOpen: context.tasksOpen.length,
    },
  };
}

function collectRange(start, end) {
  const db = getDb();
  const entries = db.prepare(
    `SELECT e.entry_date, e.content, e.kind, e.duration_min, e.tags, p.name AS project_name
       FROM entries e LEFT JOIN projects p ON p.id = e.project_id
      WHERE e.deleted_at IS NULL AND e.entry_date BETWEEN ? AND ?
      ORDER BY e.entry_date ASC, e.occurred_at ASC
      LIMIT 260`
  ).all(start, end);
  const tasksDone = db.prepare(
    `SELECT t.title, t.note, p.name AS project_name
       FROM tasks t LEFT JOIN projects p ON p.id = t.project_id
      WHERE t.deleted_at IS NULL AND t.status = 'done' AND t.completed_at IS NOT NULL
        AND strftime('%Y-%m-%d', t.completed_at / 1000, 'unixepoch', 'localtime') BETWEEN ? AND ?
      ORDER BY t.completed_at ASC
      LIMIT 140`
  ).all(start, end);
  const daily = db.prepare(
    `SELECT date, summary, highlights, blockers, plan_next, mood, energy
       FROM daily WHERE date BETWEEN ? AND ? ORDER BY date ASC LIMIT 60`
  ).all(start, end);
  return { entries, tasksDone, daily };
}

function rangeStats(start, end) {
  const stats = overview({ from: start, to: end });
  const split = breakdown({ from: start, to: end });
  const projects = split.byProject.filter((item) => item.count)
    .slice(0, 10)
    .map((item) => `${item.name} ${item.count}`)
    .join(' · ');
  return { stats, projects };
}

export async function aiReport(params = {}, app) {
  const start = params.start || params.from;
  const end = params.end || params.to;
  if (!isDateKey(start) || !isDateKey(end)) throw new Error('报告日期范围不对。');
  if (start > end) throw new Error('开始日期不能晚于结束日期。');
  const label = typeof params.label === 'string' && params.label.trim()
    ? params.label.trim().slice(0, 20)
    : '周报';
  const base = buildReport({ start, end, label });
  const context = collectRange(start, end);
  const stats = rangeStats(start, end);
  const draft = typeof params.markdown === 'string' && params.markdown.trim()
    ? params.markdown.trim()
    : base.markdown;
  const empty = base.empty && !context.daily.length;
  if (empty) throw new Error('这段时间还没有记录，先写几条再让 AI 生成吧。');

  const next = nextWeekRange(end);
  const sections = [
    `报告名称：${label}`,
    `范围：${start} 至 ${end}`,
    `数据：记录 ${stats.stats.entries} 条，完成 ${stats.stats.doneEntries} 条，完成任务 ${stats.stats.tasksDone} 个，投入 ${stats.stats.minutes} 分钟，专注 ${stats.stats.focusMin} 分钟。`,
    stats.projects ? `项目分布：${stats.projects}` : '',
    '',
    '当前草稿（可能包含人工修改）：',
    limitText(draft, 18000),
    '',
    '需要补充参考的日报：',
    dailyLines(context.daily) || '（无）',
    '',
    `下一周参考范围：${next.start} 至 ${next.end}`,
  ].filter((line) => line !== undefined);
  const prompt = [
    '请把下面的周报草稿改写成一份可以直接发到工作群或邮件的中文周报。',
    '要求：',
    '1. 保留五个部分：一、本周完成；二、关键进展；三、问题与风险；四、数据；五、下周计划。',
    '2. 只使用草稿和参考数据中的事实，不要编造项目、客户、数字或成果。',
    '3. 合并重复事项，突出结果与影响；语气客观、简洁，不要空话。',
    '4. 保留当前草稿中人工补充的内容，除非它与数据明显冲突。',
    '5. 直接输出 Markdown 正文，不要代码围栏，不要解释。',
    '',
    limitText(sections.join('\n'), 24000),
  ].join('\n');
  const result = await chat(app, [
    { role: 'system', content: '你是一名严谨的中文职场写作助手，只根据材料写作，不编造事实。' },
    { role: 'user', content: prompt },
  ], { maxTokens: 2600, temperature: 0.3 });
  const markdown = stripCodeFence(result.content);
  if (!markdown.trim()) throw new Error('AI 没有返回周报内容，请再试一次。');
  if (!markdown.includes('本周完成') || !markdown.includes('下周计划')) {
    throw new Error('AI 返回的周报结构不完整，请再试一次。');
  }
  return {
    start,
    end,
    label,
    markdown,
    model: result.model,
    generatedAt: now(),
    source: 'ai',
    inputStats: {
      entries: context.entries.length,
      tasksDone: context.tasksDone.length,
      daily: context.daily.length,
    },
  };
}

function previousReview(employeeName, currentId) {
  if (!employeeName) return null;
  const row = getDb().prepare(
    `SELECT id FROM performance_reviews
      WHERE deleted_at IS NULL AND employee_name = ? AND id != ?
      ORDER BY updated_at DESC LIMIT 1`
  ).all(employeeName, currentId || '')[0];
  if (!row) return null;
  try {
    return getPerformance({ id: row.id });
  } catch {
    return null;
  }
}

export async function aiPerformanceDraft(params = {}, app) {
  let dimensions = Array.isArray(params.dimensions) ? params.dimensions : null;
  let current = null;
  if (!dimensions && params.id) {
    current = getPerformance({ id: params.id });
    dimensions = current.dimensions;
  }
  if (!dimensions || !dimensions.length) throw new Error('先添加至少一个考核维度，再让 AI 起草。');
  dimensions = dimensions.map((dimension) => ({
    name: clip(dimension && dimension.name, 80) || '未命名维度',
    items: (Array.isArray(dimension && dimension.items) ? dimension.items : []).map((item) => ({
      comment: textValue(item && item.comment, 4000),
      expectation: textValue(item && item.expectation, 4000),
    })),
  }));
  if (!dimensions.some((dimension) => dimension.items.length)) {
    throw new Error('每个考核维度至少需要一行内容。');
  }

  const period = typeof params.period === 'string' ? params.period : (current ? current.period : '');
  const range = parsePeriodRange(period);
  if (!range) {
    throw new Error('考核周期需要写成 2026 Q3 这样的格式，才能找到对应的记录。');
  }
  const employeeName = typeof params.employeeName === 'string' ? params.employeeName : '';
  const context = collectRange(range.start, range.end);
  const stats = rangeStats(range.start, range.end);
  const previous = previousReview(employeeName, params.id || (current && current.id) || '');
  const existing = dimensions.some((dimension) => dimension.items.some(
    (item) => item.comment || item.expectation
  ));
  const hasHistory = context.entries.length || context.tasksDone.length || context.daily.length;
  if (!hasHistory && !existing) {
    throw new Error(`${range.label} 还没有记录，先积累一些工作数据再让 AI 起草吧。`);
  }

  const currentText = dimensions.map((dimension, index) => {
    const rows = dimension.items.map((item, itemIndex) => (
      `  ${itemIndex + 1}. 评语：${item.comment || '（空）'}\n     期望：${item.expectation || '（空）'}`
    )).join('\n');
    return `${index + 1}. ${dimension.name}\n${rows}`;
  }).join('\n');

  const sections = [
    `员工：${employeeName || '未填写'}`,
    `考核周期：${range.label}（${range.start} 至 ${range.end}）`,
    `数据：记录 ${stats.stats.entries} 条，完成 ${stats.stats.doneEntries} 条，完成任务 ${stats.stats.tasksDone} 个，投入 ${stats.stats.minutes} 分钟。`,
    stats.projects ? `项目分布：${stats.projects}` : '',
    '',
    '工作记录：',
    entryLines(context.entries) || '（无）',
    '',
    '完成的任务：',
    taskLines(context.tasksDone) || '（无）',
    '',
    '日报摘要：',
    dailyLines(context.daily) || '（无）',
    '',
    '当前评价表内容（可能已有草稿，可参考并补全）：',
    currentText,
  ];
  if (previous) {
    const previousText = previous.dimensions.map((dimension) => {
      const rows = dimension.items.map((item) => (
        `  评语：${clip(item.comment, 420)}\n  期望：${clip(item.expectation, 320)}`
      )).join('\n');
      return `${dimension.name}\n${rows}`;
    }).join('\n');
    sections.push('', `历史评价表（${previous.period || '上一期'}，仅作语气和结构参考，不要照抄）：`);
    sections.push(limitText(previousText, 6000));
  }

  const prompt = [
    '请根据员工在考核周期内的真实工作数据，起草绩效考核评价表。',
    '必须保持给定的考核维度名称和每个维度的条目数量不变。',
    '写作要求：',
    '1. comment 写本期评语，具体、客观，突出交付、协作和成长；每条 80–180 字。',
    '2. expectation 写下季度期望及要求，与评语中的表现对应、可执行；每条 60–120 字。',
    '3. 只使用材料中的事实，不编造数字、客户、项目或成果；信息不足时用克制、概括的表达。',
    '4. 不要出现“AI”“根据记录”“数据显示”等词。',
    '5. 只返回合法 JSON，不要代码围栏，不要解释。',
    '返回格式：{"dimensions":[{"name":"维度名","items":[{"comment":"...","expectation":"..."}]}]}',
    '',
    limitText(sections.filter((line) => line !== undefined).join('\n'), 30000),
  ].join('\n');
  const result = await chat(app, [
    { role: 'system', content: JSON_SYSTEM_PROMPT },
    { role: 'user', content: prompt },
  ], { maxTokens: 4200, temperature: 0.3 });
  const data = parseAiJson(result.content);
  const rawDimensions = Array.isArray(data.dimensions) ? data.dimensions : [];
  if (!rawDimensions.length) throw new Error('AI 没有返回可用的绩效草稿，请再试一次。');

  let produced = 0;
  const nextDimensions = dimensions.map((dimension, dimensionIndex) => {
    const byName = rawDimensions.find((item) => item && item.name === dimension.name);
    const raw = byName || rawDimensions[dimensionIndex] || {};
    const rawItems = Array.isArray(raw.items) ? raw.items : [];
    return {
      name: dimension.name,
      items: dimension.items.map((original, itemIndex) => {
        const item = rawItems[itemIndex] || {};
        const comment = textValue(item.comment, 4000) || original.comment;
        const expectation = textValue(item.expectation, 4000) || original.expectation;
        if (comment !== original.comment || expectation !== original.expectation) produced += 1;
        return { comment, expectation };
      }),
    };
  });
  if (!produced) throw new Error('AI 没有给出可用的绩效评语，请再试一次。');
  return {
    dimensions: nextDimensions,
    range,
    model: result.model,
    generatedAt: now(),
    source: 'ai',
    inputStats: {
      entries: context.entries.length,
      tasksDone: context.tasksDone.length,
      daily: context.daily.length,
      previousReview: Boolean(previous),
    },
  };
}

export async function testAi(params = {}, app) {
  const started = Date.now();
  const result = await chat(app, [
    { role: 'user', content: '请只回复：连接正常' },
  ], {
    maxTokens: 20,
    temperature: 0,
    requireEnabled: false,
    overrides: {
      baseUrl: params.baseUrl,
      model: params.model,
      apiKey: params.apiKey,
      enabled: true,
    },
  });
  return {
    ok: true,
    model: result.model,
    reply: clip(result.content, 80),
    latencyMs: Date.now() - started,
  };
}
