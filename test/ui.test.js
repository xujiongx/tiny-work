// Self-driving UI smoke test. Run inside tinyjs:
//   TINYJS_HTML=/abs/path/test/ui.html tinyjs dev
// Results are printed to the dev terminal with tiny.log().

(function () {
  const marker = 'UI 测试记录 ' + Date.now();
  const editedMarker = marker + ' · 编辑后';
  const taskTitle = 'UI 测试任务 ' + Date.now();
  const projectName = 'UI 测试项目 ' + Date.now();
  const snippetTitle = 'UI 测试片段 ' + Date.now();
  const perfTitle = 'UI 测试绩效 ' + Date.now();
  const dailyText = 'UI 测试日报 ' + Date.now();
  let passed = 0;
  let failed = 0;
  let testProject = null;
  let testSnippet = null;
  let testPerformance = null;
  let dailyBefore = null;
  let themeBefore = 'light';
  let dailyCaptured = false;
  let themeCaptured = false;

  function report(ok, message) {
    if (ok) passed += 1; else failed += 1;
    const line = `${ok ? 'ok  ' : 'FAIL'} ${message}`;
    if (window.tiny && tiny.log) tiny.log('[ui-test] ' + line);
    console.log('[ui-test] ' + line);
  }

  function waitFor(fn, label, timeout) {
    return new Promise((resolve, reject) => {
      const started = Date.now();
      const limit = timeout || 8000;
      (function tick() {
        let value = null;
        try { value = fn(); } catch { value = null; }
        if (value) return resolve(value);
        if (Date.now() - started > limit) return reject(new Error('timeout: ' + label));
        setTimeout(tick, 60);
      })();
    });
  }

  function text(selector) {
    const node = document.querySelector(selector);
    return node ? node.textContent.trim() : '';
  }

  async function step(name, fn) {
    try {
      await fn();
      report(true, name);
    } catch (error) {
      report(false, name + ' — ' + (error && error.message ? error.message : error));
    }
  }

  function todayKey() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  function findTaskRow(title) {
    return Array.from(document.querySelectorAll('.task-row'))
      .find((node) => node.querySelector('.task-title') && node.querySelector('.task-title').textContent === title);
  }

  function waitUntil(fn, label, timeout) {
    return new Promise((resolve, reject) => {
      const started = Date.now();
      const limit = timeout || 8000;
      (async function tick() {
        try {
          if (await fn()) return resolve(true);
        } catch {
          // keep polling
        }
        if (Date.now() - started > limit) return reject(new Error('timeout: ' + label));
        setTimeout(tick, 80);
      })();
    });
  }

  function setValue(field, value) {
    field.value = value;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
  }

  async function run() {
    await step('today page renders capture box', async () => {
      await waitFor(() => document.querySelector('[data-capture-text]'), 'capture box');
      try {
        dailyBefore = await tiny.api.call('daily.get', { date: todayKey() });
        dailyCaptured = true;
      } catch { dailyBefore = null; }
      try {
        themeBefore = (await tiny.api.call('settings.get', {})).theme || 'light';
        themeCaptured = true;
      } catch { themeBefore = 'light'; }
    });

    await step('record can be created from the capture box', async () => {
      const input = document.querySelector('[data-capture-text]');
      input.value = marker;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('[data-capture]').requestSubmit();
      await waitFor(() => {
        const nodes = Array.from(document.querySelectorAll('[data-slot="timeline"] .tl-content'));
        return nodes.some((node) => node.textContent === marker);
      }, 'new entry in timeline');
    });

    await step('new record is persisted', async () => {
      const data = await tiny.api.call('entries.list', { date: todayKey(), query: marker });
      if (!data.items.length) throw new Error('entry not found through api');
    });

    await step('entry can be edited with kind, project and time fields', async () => {
      const article = Array.from(document.querySelectorAll('.tl-item'))
        .find((node) => node.textContent.includes(marker));
      if (!article) throw new Error('entry row missing');
      article.querySelector('[data-entry-edit]').click();
      await waitFor(() => document.querySelector('[data-entry-form]'), 'entry editor');
      const editor = document.querySelector('[data-entry-form]');
      const content = editor.querySelector('[name="content"]');
      setValue(content, editedMarker);
      if (!editor.querySelector('[name="entryDate"]').value) throw new Error('date field missing');
      if (!editor.querySelector('[name="occurredTime"]').value) throw new Error('time field missing');
      document.querySelector('.modal-entry button[type="submit"]').click();
      await waitFor(() => !document.querySelector('[data-entry-form]'), 'entry editor closed');
      await waitFor(() => text('[data-slot="timeline"]').includes(editedMarker), 'edited entry in timeline');
      const data = await tiny.api.call('entries.list', { date: todayKey(), query: marker });
      if (!data.items.some((item) => item.content === editedMarker)) throw new Error('entry edit not saved');
    });

    await step('daily report can be opened, saved and generated', async () => {
      document.querySelector('[data-daily-open]').click();
      await waitFor(() => document.querySelector('[data-daily-summary]'), 'daily drawer');
      if (!document.querySelector('[data-daily-ai]')) throw new Error('daily AI button missing');
      const summary = document.querySelector('[data-daily-summary]');
      setValue(summary, dailyText);
      document.querySelector('[data-daily-generate]').click();
      await waitUntil(async () => {
        const daily = await tiny.api.call('daily.get', { date: todayKey() });
        return daily.exists && daily.summary === dailyText;
      }, 'daily saved');
      document.querySelector('[data-daily-close]').click();
      await waitFor(() => !document.querySelector('[data-daily-summary]'), 'daily drawer closed');
      if (!text('[data-slot="daily"]').includes(dailyText)) throw new Error('daily summary card not refreshed');

      const autoText = dailyText + ' · 关闭时自动保存';
      document.querySelector('[data-daily-open]').click();
      await waitFor(() => document.querySelector('[data-daily-summary]'), 'daily drawer reopened');
      setValue(document.querySelector('[data-daily-summary]'), autoText);
      document.querySelector('[data-daily-close]').click();
      await waitUntil(async () => {
        const daily = await tiny.api.call('daily.get', { date: todayKey() });
        return daily.summary === autoText;
      }, 'daily saved on close');
    });

    await step('today task can be added', async () => {
      const form = document.querySelector('[data-task-form]');
      const input = form.querySelector('[data-task-input]');
      input.value = taskTitle;
      form.requestSubmit();
      await waitFor(() => findTaskRow(taskTitle), 'new task in sidebar');
    });

    await step('task can be edited (priority and project fields)', async () => {
      const row = findTaskRow(taskTitle);
      row.querySelector('[data-task-edit]').click();
      await waitFor(() => document.querySelector('.modal [data-task-form]'), 'task editor');
      const form = document.querySelector('.modal [data-task-form]');
      const priority = form.querySelector('[name="priority"]');
      setValue(priority, '2');
      if (!form.querySelector('[name="plannedDate"]')) throw new Error('planned date field missing');
      document.querySelector('.modal button[type="submit"]').click();
      await waitFor(() => !document.querySelector('.modal [data-task-form]'), 'task editor closed');
      const tasks = await tiny.api.call('tasks.list', { view: 'all', date: todayKey() });
      const saved = tasks.items.find((task) => task.title === taskTitle);
      if (!saved || saved.priority !== 2) throw new Error('task priority not saved');
    });

    await step('task can be completed and writes an entry', async () => {
      const row = findTaskRow(taskTitle);
      row.querySelector('[data-task-toggle]').click();
      await waitFor(() => !findTaskRow(taskTitle), 'task disappears after completion');
      const done = await tiny.api.call('tasks.list', { view: 'done', date: todayKey() });
      if (!done.items.some((task) => task.title === taskTitle)) throw new Error('task is not marked done');
      const entries = await tiny.api.call('entries.list', { date: todayKey(), query: '完成：' + taskTitle });
      if (!entries.items.length) throw new Error('completion entry missing');
    });

    await step('focus block renders', async () => {
      const slot = document.querySelector('[data-slot="focus"]');
      if (!slot || slot.textContent.includes('读取中')) throw new Error('focus block missing');
    });

    await step('journal page renders calendar and filters', async () => {
      location.hash = '#/journal?date=' + todayKey();
      await waitFor(() => document.querySelector('.cal-grid .cal-day'), 'calendar');
      if (!document.querySelector('[data-slot="list"] .tl-item')) throw new Error('journal list is empty');
      if (!document.querySelector('.cal-day.is-selected')) throw new Error('selected day missing');
      if (document.querySelectorAll('.filter-bar .field').length < 4) throw new Error('filter controls missing');
    });

    await step('journal search finds the record', async () => {
      const search = document.querySelector('[data-search]');
      search.value = marker;
      search.dispatchEvent(new Event('input', { bubbles: true }));
      await waitFor(() => {
        const groups = document.querySelectorAll('.date-group');
        return groups.length && document.querySelector('[data-slot="list"]').textContent.includes(marker);
      }, 'search result');
    });

    await step('journal filters can be combined', async () => {
      const range = document.querySelector('[data-filter-range]');
      setValue(range, 'week');
      const kind = document.querySelector('[data-filter-kind]');
      setValue(kind, 'log');
      await waitFor(() => document.querySelector('[data-slot="list"]').textContent.includes(marker), 'filtered result');
      document.querySelector('[data-filter-clear]').click();
      await waitFor(() => document.querySelector('[data-filter-range]').value === 'day', 'filters cleared');
    });

    await step('tasks page renders all four tabs and draggable rows', async () => {
      location.hash = '#/tasks';
      await waitFor(() => document.querySelector('[data-add-input]'), 'task add input');
      if (document.querySelectorAll('[data-tab]').length !== 4) throw new Error('tab count is not 4');
      const row = document.querySelector('.task-row');
      if (row && row.getAttribute('draggable') !== 'true') throw new Error('task row is not draggable');
    });

    await step('project can be created and detail edited', async () => {
      testProject = await tiny.api.call('projects.create', {
        name: projectName,
        color: 'plum',
        description: 'UI 测试项目描述',
      });
      await tiny.api.call('entries.create', {
        content: marker + ' · 项目记录',
        kind: 'log',
        projectId: testProject.id,
        entryDate: todayKey(),
      });
      location.hash = '#/projects';
      await waitFor(() => document.querySelector(`[data-project-open="${testProject.id}"]`), 'project row');
      document.querySelector(`[data-project-open="${testProject.id}"]`).click();
      await waitFor(() => document.querySelector('.modal-project'), 'project detail');
      const form = document.querySelector('.modal-project form');
      if (!form.querySelector('textarea[name="description"]')) throw new Error('description field missing');
      setValue(form.querySelector('textarea[name="description"]'), 'UI 测试项目描述 · 已修改');
      document.querySelector('.modal-project button[type="submit"]').click();
      await waitFor(() => !document.querySelector('.modal-project'), 'project detail closed');
      const project = await tiny.api.call('projects.get', { id: testProject.id });
      if (!project.description.includes('已修改')) throw new Error('project detail not saved');
    });

    await step('review page renders stats and heatmap', async () => {
      location.hash = '#/review';
      await waitFor(() => document.querySelectorAll('.stat-value').length >= 4, 'review stats');
      if (!document.querySelectorAll('.heat').length) throw new Error('heatmap is empty');
      if (!document.querySelector('[data-filter-project]')) throw new Error('project drill-down missing');
    });

    await step('review supports a custom date range', async () => {
      document.querySelector('[data-mode="range"]').click();
      await waitFor(() => document.querySelector('[data-range-start]'), 'custom range inputs');
      const start = document.querySelector('[data-range-start]').value;
      const end = document.querySelector('[data-range-end]').value;
      if (!start || !end) throw new Error('range values missing');
      document.querySelector('[data-mode="week"]').click();
      await waitFor(() => !document.querySelector('[data-range-start]') && document.querySelector('[data-mode="week"]').classList.contains('is-active'), 'back to week mode');
    });

    await step('weekly report modal shows all five sections', async () => {
      document.querySelector('[data-report]').click();
      await waitFor(() => document.querySelector('[data-report-text]'), 'report modal');
      if (!document.querySelector('[data-ai-report]')) throw new Error('report AI button missing');
      const report = document.querySelector('[data-report-text]').value;
      for (const heading of ['一、本周完成', '二、关键进展', '三、问题与风险', '四、数据', '五、下周计划']) {
        if (!report.includes(heading)) throw new Error('missing section: ' + heading);
      }
      document.querySelector('.modal-report [data-done]').click();
      await waitFor(() => !document.querySelector('[data-report-text]'), 'report modal closed');
    });

    await step('performance review can be selected, read and edited', async () => {
      testPerformance = await tiny.api.call('performance.create', {
        title: perfTitle,
        employeeName: 'UI 测试员工',
        period: '2026 Q4',
        grade: 'A',
        dimensions: [{
          name: 'UI 测试维度',
          items: [{ comment: 'UI 测试评语', expectation: 'UI 测试期望' }],
        }],
      });
      location.hash = '#/performance';
      await waitFor(() => document.querySelector('.perf-sheet'), 'performance sheet');
      const select = document.querySelector('[data-review-select]');
      if (select) {
        setValue(select, testPerformance.id);
      }
      await waitFor(() => text('.perf-title') === perfTitle, 'test performance selected');
      if (!text('.perf-table').includes('UI 测试评语')) throw new Error('performance comment missing');
      const before = await tiny.api.call('performance.markdown', { id: testPerformance.id });
      if (!before.markdown.includes('UI 测试评语')) throw new Error('performance markdown missing comment');

      document.querySelector('[data-edit]').click();
      await waitFor(() => document.querySelector('.modal-performance [data-perf-form]'), 'performance editor');
      if (!document.querySelector('.modal-performance [data-ai-draft]')) throw new Error('performance AI button missing');
      const form = document.querySelector('.modal-performance [data-perf-form]');
      setValue(form.querySelector('[name="title"]'), perfTitle + ' · 已修改');
      setValue(form.querySelector('[name="grade"]'), 'S');
      setValue(form.querySelector('[data-item-comment]'), 'UI 测试评语 · 已修改');
      document.querySelector('.modal-performance [data-save]').click();
      await waitFor(() => !document.querySelector('.modal-performance'), 'performance editor closed');
      await waitFor(() => text('.perf-title').includes('已修改'), 'performance title refreshed');
      const saved = await tiny.api.call('performance.get', { id: testPerformance.id });
      if (saved.grade !== 'S') throw new Error('performance grade not saved');
      if (!saved.dimensions[0].items[0].comment.includes('已修改')) throw new Error('performance comment not saved');
    });

    await step('snippet can be created and searched', async () => {
      location.hash = '#/snippets';
      await waitFor(() => document.querySelector('[data-snippet-new]'), 'snippets page');
      document.querySelector('[data-snippet-new]').click();
      await waitFor(() => document.querySelector('.modal-snippet form'), 'snippet editor');
      const form = document.querySelector('.modal-snippet form');
      setValue(form.querySelector('[name="title"]'), snippetTitle);
      setValue(form.querySelector('[name="content"]'), 'tinyjs build\nopen dist');
      setValue(form.querySelector('[name="kind"]'), 'command');
      document.querySelector('.modal-snippet button[type="submit"]').click();
      await waitFor(() => Array.from(document.querySelectorAll('.snippet-card'))
        .some((node) => node.textContent.includes(snippetTitle)), 'snippet card');
      const list = await tiny.api.call('snippets.list', { query: snippetTitle });
      if (!list.items.length) throw new Error('snippet not saved');
      testSnippet = list.items[0];
      const card = Array.from(document.querySelectorAll('.snippet-card'))
        .find((node) => node.textContent.includes(snippetTitle));
      if (!card) throw new Error('snippet card missing');
      card.querySelector('[data-snippet-edit]').click();
      await waitFor(() => document.querySelector('.modal-snippet form'), 'snippet edit form');
      document.querySelector('.modal-snippet [data-cancel]').click();
    });

    await step('settings theme can switch and data controls exist', async () => {
      location.hash = '#/settings';
      await waitFor(() => document.querySelector('[data-setting="theme"]'), 'settings page');
      const theme = document.querySelector('[data-setting="theme"]');
      setValue(theme, 'dark');
      await waitFor(() => document.documentElement.dataset.theme === 'dark', 'dark theme applied');
      setValue(theme, themeBefore || 'light');
      await waitUntil(async () => (await tiny.api.call('settings.get', {})).theme === (themeBefore || 'light'), 'theme restored');
      if (!document.querySelector('[data-export]')) throw new Error('export button missing');
      if (!document.querySelector('[data-import]')) throw new Error('import button missing');
      if (!document.querySelector('[data-setting="autoTaskEntry"]')) throw new Error('auto entry setting missing');
      if (!document.querySelector('[data-import-lines]')) throw new Error('legacy note import button missing');
      if (!document.querySelector('[data-ai-enabled]')) throw new Error('AI enable setting missing');
      if (!document.querySelector('[data-ai-base-url]')) throw new Error('AI endpoint setting missing');
      if (!document.querySelector('[data-ai-model]')) throw new Error('AI model setting missing');
      if (!document.querySelector('[data-ai-key]')) throw new Error('AI key field missing');
      if (!document.querySelector('[data-ai-test]')) throw new Error('AI test button missing');
      if (!document.querySelector('[data-ai-save]')) throw new Error('AI save button missing');
    });

    await step('test data can be cleaned up', async () => {
      const entries = await tiny.api.call('entries.list', { date: todayKey(), query: marker });
      for (const entry of entries.items) await tiny.api.call('entries.remove', { id: entry.id });
      const completionEntries = await tiny.api.call('entries.list', { date: todayKey(), query: '完成：' + taskTitle });
      for (const entry of completionEntries.items) await tiny.api.call('entries.remove', { id: entry.id });
      const tasks = await tiny.api.call('tasks.list', { view: 'done', date: todayKey() });
      for (const task of tasks.items.filter((item) => item.title === taskTitle)) {
        await tiny.api.call('tasks.remove', { id: task.id });
      }
      const allProjects = await tiny.api.call('projects.list', { includeArchived: true });
      for (const project of allProjects.items.filter((item) => item.name.startsWith('UI 测试项目 '))) {
        await tiny.api.call('projects.remove', { id: project.id });
      }
      const testSnippets = await tiny.api.call('snippets.list', { query: 'UI 测试片段 ' });
      for (const snippet of testSnippets.items.filter((item) => item.title.startsWith('UI 测试片段 '))) {
        await tiny.api.call('snippets.remove', { id: snippet.id });
      }
      if (testPerformance) {
        await tiny.api.call('performance.remove', { id: testPerformance.id });
      }
      const staleDaily = dailyBefore && dailyBefore.exists
        && String(dailyBefore.summary || '').startsWith('UI 测试日报 ');
      if (dailyCaptured && dailyBefore && dailyBefore.exists && !staleDaily) {
        await tiny.api.call('daily.save', {
          date: todayKey(),
          patch: {
            summary: dailyBefore.summary,
            highlights: dailyBefore.highlights,
            blockers: dailyBefore.blockers,
            planNext: dailyBefore.planNext,
            mood: dailyBefore.mood,
            energy: dailyBefore.energy,
          },
        });
      } else if (dailyCaptured) {
        await tiny.api.call('daily.remove', { date: todayKey() });
      }
      if (themeCaptured) await tiny.api.call('settings.set', { patch: { theme: themeBefore } });
    });

    if (window.tiny && tiny.log) {
      tiny.log(`[ui-test] RESULT ${passed} passed, ${failed} failed`);
    }
    console.log(`[ui-test] RESULT ${passed} passed, ${failed} failed`);
    document.title = failed ? 'UI TEST FAILED' : 'UI TEST PASSED';
  }

  run().catch((error) => {
    console.error(error);
    if (window.tiny && tiny.log) tiny.log('[ui-test] FATAL ' + (error && error.stack ? error.stack : error));
    document.title = 'UI TEST CRASHED';
  });
})();
