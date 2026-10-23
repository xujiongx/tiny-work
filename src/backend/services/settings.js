import { getDb, parseJson } from '../db.js';

export const DEFAULT_SETTINGS = {
  theme: 'light',
  boundaryHour: 0,
  weekStart: 1,
  reminderEnabled: true,
  reminderTime: '18:30',
  backupKeep: 7,
  defaultKind: 'log',
  autoTaskEntry: true,
  focusMinutes: 25,
  quickHotkey: 'cmd+shift+space',
  aiEnabled: false,
  aiBaseUrl: 'https://apihub.agnes-ai.com/v1',
  aiModel: 'agnes-2.5-flash',
};

const KIND_VALUES = ['log', 'done', 'blocker', 'idea', 'meeting', 'learning'];

export function cleanAiBaseUrl(value) {
  const url = String(value == null ? '' : value).trim().replace(/\/+$/, '');
  if (!/^https?:\/\/[^\s]+$/i.test(url) || url.length > 500) {
    throw new Error('AI 接口地址需要以 http:// 或 https:// 开头。');
  }
  return url;
}

function validate(patch) {
  const out = {};
  if (patch.theme !== undefined) {
    if (!['light', 'dark', 'auto'].includes(patch.theme)) throw new Error('主题设置不对。');
    out.theme = patch.theme;
  }
  if (patch.boundaryHour !== undefined) {
    const n = Number(patch.boundaryHour);
    if (!Number.isInteger(n) || n < 0 || n > 6) throw new Error('一天的分界点需要是 0–6 点。');
    out.boundaryHour = n;
  }
  if (patch.weekStart !== undefined) {
    const n = Number(patch.weekStart);
    if (n !== 0 && n !== 1) throw new Error('每周起始日不对。');
    out.weekStart = n;
  }
  if (patch.reminderEnabled !== undefined) out.reminderEnabled = Boolean(patch.reminderEnabled);
  if (patch.reminderTime !== undefined) {
    if (!/^\d{2}:\d{2}$/.test(String(patch.reminderTime))) throw new Error('提醒时间格式不对。');
    const [hour, minute] = String(patch.reminderTime).split(':').map(Number);
    if (hour > 23 || minute > 59) throw new Error('提醒时间格式不对。');
    out.reminderTime = String(patch.reminderTime);
  }
  if (patch.backupKeep !== undefined) {
    const n = Number(patch.backupKeep);
    if (!Number.isInteger(n) || n < 1 || n > 30) throw new Error('备份保留份数需要是 1–30。');
    out.backupKeep = n;
  }
  if (patch.defaultKind !== undefined) {
    if (!KIND_VALUES.includes(patch.defaultKind)) throw new Error('默认记录类型不对。');
    out.defaultKind = patch.defaultKind;
  }
  if (patch.autoTaskEntry !== undefined) out.autoTaskEntry = Boolean(patch.autoTaskEntry);
  if (patch.focusMinutes !== undefined) {
    const n = Number(patch.focusMinutes);
    if (!Number.isInteger(n) || n < 1 || n > 240) throw new Error('专注时长需要是 1–240 分钟。');
    out.focusMinutes = n;
  }
  if (patch.quickHotkey !== undefined) {
    const key = String(patch.quickHotkey).trim();
    if (!key || key.length > 60) throw new Error('全局快捷键格式不对。');
    out.quickHotkey = key;
  }
  if (patch.aiEnabled !== undefined) out.aiEnabled = Boolean(patch.aiEnabled);
  if (patch.aiBaseUrl !== undefined) out.aiBaseUrl = cleanAiBaseUrl(patch.aiBaseUrl);
  if (patch.aiModel !== undefined) {
    const model = String(patch.aiModel).trim();
    if (!model || model.length > 120) throw new Error('AI 模型名称格式不对。');
    out.aiModel = model;
  }
  return out;
}

export function getSettings() {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const stored = {};
  for (const row of rows) {
    stored[row.key] = parseJson(row.value, null);
  }
  return { ...DEFAULT_SETTINGS, ...stored };
}

export function setSettings(patch = {}) {
  const db = getDb();
  const clean = validate(patch);
  const stmt = db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  );
  const run = db.transaction(() => {
    for (const [key, value] of Object.entries(clean)) {
      stmt.run(key, JSON.stringify(value));
    }
  });
  run();
  return getSettings();
}
