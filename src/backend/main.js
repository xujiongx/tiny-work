// 案头 / Deskwork — backend entry.
// The page calls these via tiny.api.call('name', { ... }).
// All functions receive (params, app); keep params and return values JSON-safe.

import { openDb, getDb, getDbPath, logicalDate, weekBounds } from './db.js'; // getDb used by countRow
import {
  listProjects, createProject, updateProject, removeProject, getProject,
} from './repo/projects.js';
import {
  listEntries, createEntry, updateEntry, removeEntry, restoreEntry,
  entryTags, entryTimeline, getEntry,
} from './repo/entries.js';
import {
  listTasks, createTask, updateTask, toggleTask, reorderTasks,
  removeTask, restoreTask, getTask,
} from './repo/tasks.js';
import {
  getSnippet, listSnippets, createSnippet, updateSnippet, removeSnippet, restoreSnippet,
} from './repo/snippets.js';
import { getSettings, setSettings } from './services/settings.js';
import { overview, breakdown, heatmap } from './services/stats.js';
import { getDaily, saveDaily, generateDaily, removeDaily, listDailies } from './services/daily.js';
import { buildReport, exportReport } from './services/report.js';
import {
  startFocus, stopFocus, currentFocus, listFocus,
} from './services/focus.js';
import { exportJson, importJson, importLines, dataStats } from './services/data.js';
import {
  backupNow, listBackups, systemInfo, shouldBackupToday, pruneOnStartup,
} from './services/backup.js';
import {
  listPerformance, getPerformance, createPerformance, savePerformance,
  removePerformance, restorePerformance, performanceMarkdown, exportPerformance,
  ensurePerformanceSeed,
} from './services/performance.js';
import {
  aiStatus, saveAiSettings, clearAiKey, testAi, aiDaily, aiReport, aiPerformanceDraft,
} from './services/ai.js';

function emit(app, event, payload) {
  try {
    app.push(event, payload);
  } catch (error) {
    console.error(`[deskwork] push ${event} failed:`, error);
  }
}

function countRow(sql, ...args) {
  return getDb().prepare(sql).all(...args)[0].n;
}

function getMeta(key) {
  const row = getDb().prepare('SELECT value FROM meta WHERE key = ?').all(key)[0];
  return row ? row.value : null;
}

function setMeta(key, value) {
  getDb().prepare(
    `INSERT INTO meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, String(value));
}

function taskDoneToday(date) {
  return countRow(
    `SELECT COUNT(*) AS n FROM tasks
     WHERE deleted_at IS NULL AND status = 'done' AND completed_at IS NOT NULL
       AND strftime('%Y-%m-%d', completed_at / 1000, 'unixepoch', 'localtime') = ?`,
    date
  );
}

export const api = {
  async bootstrap(params = {}, app) {
    await openDb(app);
    const settings = getSettings();
    const date = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date)
      ? params.date
      : logicalDate(Date.now(), settings.boundaryHour);

    const stats = overview({ from: date, to: date });
    const week = weekBounds(date, settings.weekStart === 0 ? 0 : 1);
    return {
      date,
      settings,
      projects: listProjects({ weekFrom: week.from, weekTo: week.to }).items,
      counts: {
        entriesToday: countRow(
          'SELECT COUNT(*) AS n FROM entries WHERE deleted_at IS NULL AND entry_date = ?',
          date
        ),
        tasksOpen: countRow(
          "SELECT COUNT(*) AS n FROM tasks WHERE deleted_at IS NULL AND status IN ('inbox','todo','doing')"
        ),
        tasksDoneToday: taskDoneToday(date),
        streak: stats.streak,
      },
      dbPath: getDbPath(),
      schemaVersion: 2,
    };
  },

  // ---- projects -----------------------------------------------------------
  async 'projects.list'(params) {
    return listProjects(params || {});
  },
  async 'projects.get'(params = {}) {
    return getProject(params.id);
  },
  async 'projects.create'(params, app) {
    const project = createProject(params || {});
    emit(app, 'projects:changed', { id: project.id, action: 'create' });
    return project;
  },
  async 'projects.update'(params = {}, app) {
    const project = updateProject(params.id, params);
    emit(app, 'projects:changed', { id: project.id, action: 'update' });
    return project;
  },
  async 'projects.archive'(params = {}, app) {
    const project = updateProject(params.id, { archived: Boolean(params.archived) });
    emit(app, 'projects:changed', { id: project.id, action: 'archive' });
    return project;
  },
  async 'projects.remove'(params = {}, app) {
    const result = removeProject(params.id);
    emit(app, 'projects:changed', { id: result.id, action: 'remove' });
    return result;
  },

  // ---- entries ------------------------------------------------------------
  async 'entries.list'(params) {
    return listEntries(params || {});
  },
  async 'entries.get'(params = {}) {
    return getEntry(params.id);
  },
  async 'entries.create'(params, app) {
    const entry = createEntry(params || {});
    emit(app, 'entries:changed', { id: entry.id, action: 'create', date: entry.entryDate });
    return entry;
  },
  async 'entries.update'(params = {}, app) {
    const entry = updateEntry(params.id, params);
    emit(app, 'entries:changed', { id: entry.id, action: 'update', date: entry.entryDate });
    return entry;
  },
  async 'entries.remove'(params = {}, app) {
    const result = removeEntry(params.id);
    emit(app, 'entries:changed', { id: result.id, action: 'remove' });
    return result;
  },
  async 'entries.restore'(params = {}, app) {
    const entry = restoreEntry(params.id);
    emit(app, 'entries:changed', { id: entry.id, action: 'restore', date: entry.entryDate });
    return entry;
  },
  async 'entries.tags'(params) {
    return entryTags(params || {});
  },
  async 'entries.timeline'(params) {
    return entryTimeline(params || {});
  },

  // ---- tasks --------------------------------------------------------------
  async 'tasks.list'(params) {
    return listTasks(params || {});
  },
  async 'tasks.get'(params = {}) {
    return getTask(params.id);
  },
  async 'tasks.create'(params, app) {
    const task = createTask(params || {});
    emit(app, 'tasks:changed', { id: task.id, action: 'create' });
    return task;
  },
  async 'tasks.update'(params = {}, app) {
    const task = updateTask(params.id, params);
    emit(app, 'tasks:changed', { id: task.id, action: 'update' });
    return task;
  },
  async 'tasks.toggle'(params = {}, app) {
    const result = toggleTask(params.id, Boolean(params.done));
    emit(app, 'tasks:changed', { id: result.id, action: 'toggle' });
    if (result.entry) {
      emit(app, 'entries:changed', {
        id: result.entry.id, action: 'create', date: result.entry.entryDate, source: 'task',
      });
    }
    return result;
  },
  async 'tasks.reorder'(params = {}, app) {
    const result = reorderTasks(params.ids);
    emit(app, 'tasks:changed', { action: 'reorder' });
    return result;
  },
  async 'tasks.remove'(params = {}, app) {
    const result = removeTask(params.id);
    emit(app, 'tasks:changed', { id: result.id, action: 'remove' });
    return result;
  },
  async 'tasks.restore'(params = {}, app) {
    const task = restoreTask(params.id);
    emit(app, 'tasks:changed', { id: task.id, action: 'restore' });
    return task;
  },

  // ---- daily --------------------------------------------------------------
  async 'daily.get'(params) {
    return getDaily(params || {});
  },
  async 'daily.save'(params = {}, app) {
    const daily = saveDaily(params);
    emit(app, 'daily:changed', { date: daily.date });
    emit(app, 'data:saved', { at: Date.now() });
    return daily;
  },
  async 'daily.generate'(params) {
    return generateDaily(params || {});
  },
  async 'daily.ai'(params = {}, app) {
    return aiDaily(params, app);
  },
  async 'daily.moods'(params = {}) {
    return listDailies(params);
  },
  async 'daily.remove'(params = {}, app) {
    const result = removeDaily(params);
    emit(app, 'daily:changed', { date: result.date, action: 'remove' });
    return result;
  },

  // ---- reports ------------------------------------------------------------
  async 'reports.weekly'(params) {
    return buildReport(params || {});
  },
  async 'reports.preview'(params) {
    return buildReport(params || {});
  },
  async 'reports.export'(params) {
    return exportReport(params || {});
  },
  async 'reports.ai'(params = {}, app) {
    return aiReport(params, app);
  },

  // ---- performance --------------------------------------------------------
  async 'performance.list'(params) {
    return listPerformance(params || {});
  },
  async 'performance.get'(params = {}) {
    return getPerformance(params);
  },
  async 'performance.create'(params = {}, app) {
    const review = createPerformance(params);
    emit(app, 'performance:changed', { id: review.id, action: 'create' });
    return review;
  },
  async 'performance.save'(params = {}, app) {
    const review = savePerformance(params);
    emit(app, 'performance:changed', { id: review.id, action: 'update' });
    return review;
  },
  async 'performance.remove'(params = {}, app) {
    const result = removePerformance(params);
    emit(app, 'performance:changed', { id: result.id, action: 'remove' });
    return result;
  },
  async 'performance.restore'(params = {}, app) {
    const review = restorePerformance(params);
    emit(app, 'performance:changed', { id: review.id, action: 'restore' });
    return review;
  },
  async 'performance.markdown'(params = {}) {
    return performanceMarkdown(params);
  },
  async 'performance.export'(params = {}) {
    return exportPerformance(params);
  },
  async 'performance.aiDraft'(params = {}, app) {
    return aiPerformanceDraft(params, app);
  },

  // ---- focus --------------------------------------------------------------
  async 'focus.start'(params = {}, app) {
    const session = startFocus(params);
    emit(app, 'focus:changed', { id: session.id, action: 'start' });
    return session;
  },
  async 'focus.stop'(params = {}, app) {
    const session = stopFocus(params);
    emit(app, 'focus:changed', { id: session.id, action: 'stop' });
    if (session.entryId) {
      emit(app, 'entries:changed', { id: session.entryId, action: 'create', source: 'focus' });
    }
    return session;
  },
  async 'focus.current'() {
    return currentFocus();
  },
  async 'focus.list'(params) {
    return listFocus(params || {});
  },

  // ---- snippets -----------------------------------------------------------
  async 'snippets.list'(params) {
    return listSnippets(params || {});
  },
  async 'snippets.get'(params = {}) {
    return getSnippet(params.id);
  },
  async 'snippets.create'(params = {}, app) {
    const snippet = createSnippet(params);
    emit(app, 'snippets:changed', { id: snippet.id, action: 'create' });
    return snippet;
  },
  async 'snippets.update'(params = {}, app) {
    const snippet = updateSnippet(params.id, params);
    emit(app, 'snippets:changed', { id: snippet.id, action: 'update' });
    return snippet;
  },
  async 'snippets.remove'(params = {}, app) {
    const result = removeSnippet(params.id);
    emit(app, 'snippets:changed', { id: result.id, action: 'remove' });
    return result;
  },
  async 'snippets.restore'(params = {}, app) {
    const snippet = restoreSnippet(params.id);
    emit(app, 'snippets:changed', { id: snippet.id, action: 'restore' });
    return snippet;
  },

  // ---- quick capture window ----------------------------------------------
  async 'quick.focus'(_params, app) {
    try {
      const win = app.window('quick');
      await win.show();
      await win.eval('setTimeout(() => { const node = document.querySelector("[data-quick-text]"); if (node) node.focus(); }, 30);');
      return { open: true };
    } catch {
      return { open: false };
    }
  },

  // ---- settings -----------------------------------------------------------
  async 'settings.get'() {
    return getSettings();
  },
  async 'settings.set'(params = {}, app) {
    const settings = setSettings(params.patch || params);
    emit(app, 'settings:changed', settings);
    return settings;
  },

  // ---- AI assistant -------------------------------------------------------
  async 'ai.status'(_params, app) {
    return aiStatus(app);
  },
  async 'ai.save'(params = {}, app) {
    const status = await saveAiSettings(params, app);
    emit(app, 'settings:changed', getSettings());
    return status;
  },
  async 'ai.clearKey'(_params, app) {
    return clearAiKey(app);
  },
  async 'ai.test'(params = {}, app) {
    return testAi(params, app);
  },

  // ---- stats --------------------------------------------------------------
  async 'stats.overview'(params) {
    return overview(params || {});
  },
  async 'stats.breakdown'(params) {
    return breakdown(params || {});
  },
  async 'stats.heatmap'(params) {
    return heatmap(params || {});
  },

  // ---- data & backups -----------------------------------------------------
  async 'data.info'(_params, app) {
    await openDb(app);
    return systemInfo(app);
  },
  async 'data.stats'() {
    return dataStats();
  },
  async 'data.exportJson'(params) {
    return exportJson(params || {});
  },
  async 'data.importLines'(params = {}, app) {
    const result = await importLines(params);
    if (result.imported) emit(app, 'entries:changed', { action: 'import-lines' });
    return result;
  },
  async 'data.importJson'(params = {}, app) {
    const result = await importJson(params);
    emit(app, 'data:imported', result);
    emit(app, 'projects:changed', { action: 'import' });
    emit(app, 'entries:changed', { action: 'import' });
    emit(app, 'tasks:changed', { action: 'import' });
    return result;
  },
  async 'backup.now'(_params, app) {
    const result = await backupNow();
    emit(app, 'data:saved', { at: result.at });
    return result;
  },
  async 'backup.list'() {
    return listBackups();
  },
};

export function init(app) {
  (async () => {
    await openDb(app);
    ensurePerformanceSeed();
    if (await shouldBackupToday()) await backupNow();
    await pruneOnStartup();
    startReminderLoop(app);
  })().catch((error) => {
    console.error('[deskwork] init failed:', error);
  });
}

let reminderTimer = null;

function localDayKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

async function reminderTick(app) {
  try {
    const settings = getSettings();
    if (!settings.reminderEnabled) return;
    const nowDate = new Date();
    const day = nowDate.getDay();
    if (day === 0 || day === 6) return;
    const [hour, minute] = String(settings.reminderTime || '18:30').split(':').map(Number);
    if (nowDate.getHours() < hour) return;
    if (nowDate.getHours() === hour && nowDate.getMinutes() < minute) return;
    const today = localDayKey(nowDate);
    if (getMeta('lastReminder') === today) return;
    setMeta('lastReminder', today);
    try {
      await app.notify('该回顾今天了', '花两分钟写一份日报，把今天收个尾。', {
        id: 'daily-reminder',
        subtitle: '案头',
      });
    } catch {
      // Notification permission may be denied; the rest of the app is unaffected.
    }
  } catch {
    // Reminders are best effort and never block startup.
  }
}

function startReminderLoop(app) {
  if (reminderTimer) clearInterval(reminderTimer);
  setTimeout(() => reminderTick(app), 6000);
  reminderTimer = setInterval(() => reminderTick(app), 60 * 1000);
}

export function onNotificationClick(info, app) {
  const id = typeof info === 'string' ? info : info && (info.id || info.notification);
  if (id && id !== 'daily-reminder') return;
  try {
    app.win.show();
  } catch {
    // The main window may already be visible.
  }
  try {
    app.win.eval(
      "if (window.WB && WB.openDaily) { WB.openDaily(); } else { location.hash = '#/today'; }"
    );
  } catch {
    // If the page is not ready, opening the app is still useful.
  }
}
