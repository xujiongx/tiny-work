// Headless backend smoke test.
// Run: ~/.tinyjs/bin/tjs test/backend.test.js
// It uses a temporary data dir and never touches the real app database.

import { api } from '../src/backend/main.js';
import { logicalDate, weekBounds, nextDateKey } from '../src/backend/db.js';
import { ensurePerformanceSeed } from '../src/backend/services/performance.js';
import { Database } from 'tjs:sqlite';

const dir = await tjs.makeTempDir(tjs.tmpDir + '/deskwork-test-XXXXXX');
const events = [];
const secrets = new Map();
const app = {
  paths: async () => ({ data: dir }),
  push: (event, payload) => events.push([event, payload]),
  info: async () => ({ version: 'test', tinyjs: 'test' }),
  secrets: {
    get: async (key) => (secrets.has(key) ? secrets.get(key) : null),
    set: async (key, value) => {
      secrets.set(key, value);
      return true;
    },
    delete: async (key) => secrets.delete(key),
  },
};
const originalFetch = globalThis.fetch;
let aiFetchMode = 'ok';
let aiCalls = [];

let passed = 0;
let failed = 0;

function ok(condition, label, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ok   ${label}`);
  } else {
    failed += 1;
    console.error(`  FAIL ${label}${detail ? ' — ' + detail : ''}`);
  }
}

function eq(actual, expected, label) {
  ok(actual === expected, label, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function pad(n) { return String(n).padStart(2, '0'); }
const today = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
})();

try {
  console.log('deskwork backend smoke');
  console.log('data dir:', dir);

  const boot = await api.bootstrap({ date: today }, app);
  ok(boot && boot.settings && Array.isArray(boot.projects), 'bootstrap returns shape');
  eq(boot.counts.entriesToday, 0, 'starts with zero entries');
  eq(boot.schemaVersion, 2, 'schema version is 2');

  const seed = ensurePerformanceSeed();
  eq(seed.created, true, 'performance seed is created on first run');
  eq(ensurePerformanceSeed().created, false, 'performance seed is idempotent');
  eq((await api['performance.list']({}, app)).total, 1, 'seeded performance review is listed');

  const early = new Date(2026, 9, 23, 2, 30, 0, 0).getTime();
  const late = new Date(2026, 9, 23, 10, 30, 0, 0).getTime();
  eq(logicalDate(early, 4), '2026-10-22', '2:30am belongs to previous day with 4am boundary');
  eq(logicalDate(late, 4), '2026-10-23', '10:30am stays on the same day');
  eq(logicalDate(early, 0), '2026-10-23', 'midnight boundary keeps the calendar day');

  const project = await api['projects.create']({ name: '测试项目', color: 'clay' }, app);
  ok(project.id.startsWith('proj_'), 'project id prefix');
  eq(project.name, '测试项目', 'project name');

  const entry = await api['entries.create']({
    content: '写完数据层 <script>alert(1)</script>',
    kind: 'done',
    projectId: project.id,
    tags: ['文档', ' 数据 ', '文档'],
    durationMin: 45,
    entryDate: today,
  }, app);
  eq(entry.tags.length, 2, 'tags are trimmed and deduped');
  eq(entry.durationMin, 45, 'duration stored');
  eq(entry.projectName, '测试项目', 'entry joins project');

  const archived = await api['projects.create']({ name: '归档项目', color: 'plum' }, app);
  const archivedEntry = await api['entries.create']({
    content: '归档前的记录', projectId: archived.id, entryDate: today,
  }, app);
  await api['projects.archive']({ id: archived.id, archived: true }, app);
  const activeProjects = await api['projects.list']({}, app);
  ok(!activeProjects.items.some((item) => item.id === archived.id), 'archived project leaves active list');
  const allProjects = await api['projects.list']({ includeArchived: true }, app);
  eq(allProjects.items.find((item) => item.id === archived.id).status, 'archived', 'archived project stays available for history');
  eq((await api['entries.get']({ id: archivedEntry.id }, app)).projectName, '归档项目', 'historical entry keeps archived project name');
  await api['entries.remove']({ id: archivedEntry.id }, app);
  await api['projects.remove']({ id: archived.id }, app);

  const listed = await api['entries.list']({ date: today }, app);
  eq(listed.total, 1, 'entry listed for today');

  const updated = await api['entries.update']({
    id: entry.id, content: '改过的内容', tags: ['改'],
  }, app);
  eq(updated.content, '改过的内容', 'entry updated');

  const removed = await api['entries.remove']({ id: entry.id }, app);
  ok(removed.deletedAt > 0, 'entry soft deleted');
  eq((await api['entries.list']({ date: today }, app)).total, 0, 'deleted entry hidden');
  const restored = await api['entries.restore']({ id: entry.id }, app);
  eq(restored.content, '改过的内容', 'entry restored');
  eq((await api['entries.list']({ date: today }, app)).total, 1, 'restored entry visible');

  const tagged = await api['entries.tags']({}, app);
  eq(tagged.items[0].tag, '改', 'tag aggregation');

  const timeline = await api['entries.timeline']({ date: today }, app);
  eq(timeline.stats.count, 1, 'timeline count');
  eq(timeline.stats.done, 1, 'timeline done count');
  eq(timeline.stats.minutes, 45, 'timeline minutes');
  eq(timeline.stats.projects[0].name, '测试项目', 'timeline project breakdown');

  const task = await api['tasks.create']({
    title: '测试任务', plannedDate: today, projectId: project.id,
  }, app);
  eq(task.status, 'todo', 'task with date becomes todo');
  const taskList = await api['tasks.list']({ view: 'today', date: today }, app);
  eq(taskList.items.length, 1, 'task listed for today');
  eq(taskList.counts.today, 1, 'today task count');

  const doneTask = await api['tasks.toggle']({ id: task.id, done: true }, app);
  eq(doneTask.status, 'done', 'task toggled done');
  ok(doneTask.completedAt > 0, 'completedAt set');
  ok(doneTask.entry && doneTask.entry.kind === 'done', 'task completion writes an entry');
  const firstTaskEntryId = doneTask.entry ? doneTask.entry.id : null;
  const reopened = await api['tasks.toggle']({ id: task.id, done: false }, app);
  eq(reopened.status, 'todo', 'done task reopens');
  eq(reopened.entry, null, 'reopening removes the generated entry');
  eq((await api['entries.list']({ date: today }, app)).total, 1, 'reopened task hides its entry');

  const inbox = await api['tasks.create']({ title: '收集箱任务' }, app);
  eq(inbox.status, 'inbox', 'task without date goes to inbox');
  const reordered = await api['tasks.reorder']({ ids: [inbox.id, task.id] }, app);
  ok(reordered.ok, 'tasks reorder');

  await api['tasks.toggle']({ id: task.id, done: true }, app);
  const taskEntry = (await api['entries.list']({ date: today }, app)).items.find((item) => item.source === 'task');
  ok(taskEntry, 're-completing restores the same task entry');
  eq(taskEntry ? taskEntry.id : null, firstTaskEntryId, 'task entry id is stable across undo');

  const autoOff = await api['tasks.create']({ title: '不自动记录', plannedDate: today }, app);
  await api['settings.set']({ patch: { autoTaskEntry: false } }, app);
  const noEntry = await api['tasks.toggle']({ id: autoOff.id, done: true }, app);
  eq(noEntry.entry, null, 'auto task entry can be disabled');
  await api['tasks.toggle']({ id: autoOff.id, done: false }, app);
  await api['settings.set']({ patch: { autoTaskEntry: true } }, app);

  const settings = await api['settings.set']({ patch: { boundaryHour: 4 } }, app);
  eq(settings.boundaryHour, 4, 'settings saved');
  const settings2 = await api['settings.get']({}, app);
  eq(settings2.boundaryHour, 4, 'settings persist');

  const stats = await api['stats.overview']({ from: today, to: today }, app);
  eq(stats.entries, 2, 'stats entry count includes task completion');
  eq(stats.doneEntries, 2, 'stats done count includes task completion');
  eq(stats.tasksDone, 1, 'stats tasks done today');
  eq(stats.streak, 1, 'streak includes today');

  const split = await api['stats.breakdown']({ from: today, to: today }, app);
  ok(split.byProject.length >= 1, 'breakdown by project');
  ok(split.byKind.length >= 1, 'breakdown by kind');
  ok(split.byTag.length >= 1, 'breakdown by tag');

  const heat = await api['stats.heatmap']({ from: today, to: today }, app);
  eq(heat.days.length, 1, 'heatmap has one day');

  const backup = await api['backup.now']({}, app);
  ok(backup.size > 0, 'backup written');
  const backups = await api['backup.list']({}, app);
  eq(backups.items.length, 1, 'backup listed');
  const backupDb = new Database(backups.items[0].path);
  const integrity = backupDb.prepare('PRAGMA integrity_check').all()[0];
  ok(Object.values(integrity)[0] === 'ok', 'backup passes SQLite integrity_check');
  backupDb.close();

  const info = await api['data.info']({}, app);
  ok(info.dbSize > 0, 'db size reported');
  ok(info.dataDir === dir, 'data dir reported');

  // ---- daily -------------------------------------------------------------
  const emptyDaily = await api['daily.get']({ date: today }, app);
  ok(!emptyDaily.exists, 'daily starts empty');
  const savedDaily = await api['daily.save']({
    date: today,
    patch: {
      summary: '今天把剩余的链路补齐了。',
      highlights: '完成数据层\n补了测试',
      blockers: ['需要验证导入导出'],
      planNext: ['明天先写测试'],
      mood: 4,
      energy: 3,
    },
  }, app);
  ok(savedDaily.exists, 'daily saved');
  eq(savedDaily.highlights.length, 2, 'daily highlights saved as lines');
  eq(savedDaily.mood, 4, 'daily mood saved');
  const blocker = await api['entries.create']({
    content: '导入导出还需要验证', kind: 'blocker', projectId: project.id, entryDate: today,
  }, app);
  const generatedDaily = await api['daily.generate']({ date: today }, app);
  ok(generatedDaily.highlights.length >= 2, 'daily generate collects done entries');
  ok(generatedDaily.blockers.length >= 1, 'daily generate collects blockers');
  const moodSeries = await api['daily.moods']({ from: today, to: today }, app);
  eq(moodSeries.items.length, 1, 'daily mood series returns saved days');
  eq(moodSeries.items[0].mood, 4, 'daily mood series keeps mood');

  // ---- reports -----------------------------------------------------------
  const report = await api['reports.weekly']({ start: today, end: today, label: '周报' }, app);
  ok(!report.empty, 'report has content');
  ok(report.markdown.includes('一、本周完成'), 'report has completed section');
  ok(report.markdown.includes('二、关键进展'), 'report has progress section');
  ok(report.markdown.includes('三、问题与风险'), 'report has risk section');
  ok(report.markdown.includes('四、数据'), 'report has data section');
  ok(report.markdown.includes('五、下周计划'), 'report has next plan section');
  eq((report.markdown.match(/测试任务/g) || []).length, 1, 'task completion appears once in report');
  ok(report.markdown.includes('明天先写测试'), 'report includes daily next plan');
  const reportPath = dir + '/week.md';
  const exportedReport = await api['reports.export']({ path: reportPath, markdown: report.markdown }, app);
  ok(exportedReport.size > 0, 'report exported');
  const emptyReport = await api['reports.weekly']({ start: '2000-01-03', end: '2000-01-09' }, app);
  ok(emptyReport.empty, 'empty range returns an empty report');

  // ---- focus -------------------------------------------------------------
  const focus = await api['focus.start']({ minutes: 25, projectId: project.id }, app);
  eq(focus.status, 'running', 'focus starts');
  let duplicateFocus = null;
  try {
    await api['focus.start']({ minutes: 25 }, app);
  } catch (error) {
    duplicateFocus = error;
  }
  ok(duplicateFocus, 'cannot start two focus sessions');
  const running = await api['focus.current']({}, app);
  eq(running.id, focus.id, 'focus current returns running session');
  const abandoned = await api['focus.stop']({ abandoned: true }, app);
  eq(abandoned.status, 'abandoned', 'focus can be abandoned');
  eq((await api['entries.list']({ date: today, query: '专注' }, app)).total, 0, 'abandoned focus writes no entry');
  const focus2 = await api['focus.start']({ minutes: 25, projectId: project.id, note: '补完测试' }, app);
  const finished = await api['focus.stop']({ id: focus2.id }, app);
  eq(finished.status, 'done', 'focus finishes');
  ok(finished.entryId, 'focus finish links an entry');
  const afterFocus = await api['stats.overview']({ from: today, to: today }, app);
  ok(afterFocus.focusMin >= 1, 'stats counts focus minutes');

  // ---- snippets ----------------------------------------------------------
  const snippet = await api['snippets.create']({
    title: '部署命令',
    content: 'npm run build && tinyjs build',
    kind: 'command',
    language: 'bash',
    tags: ['部署', '命令'],
  }, app);
  eq(snippet.kind, 'command', 'snippet created');
  eq((await api['snippets.list']({ query: '部署' }, app)).items.length, 1, 'snippet search');
  const snippetUpdated = await api['snippets.update']({ id: snippet.id, title: '发布命令' }, app);
  eq(snippetUpdated.title, '发布命令', 'snippet updated');
  await api['snippets.remove']({ id: snippet.id }, app);
  eq((await api['snippets.list']({}, app)).items.length, 0, 'snippet soft deleted');
  await api['snippets.restore']({ id: snippet.id }, app);
  eq((await api['snippets.list']({}, app)).items.length, 1, 'snippet restored');

  // ---- filters and drill-down -------------------------------------------
  const filtered = await api['entries.list']({ from: today, to: today, projectId: project.id, kind: 'done' }, app);
  ok(filtered.items.length >= 1, 'entries can filter by project and kind');
  eq((await api['entries.list']({ from: today, to: today, query: '导入导出' }, app)).items.length, 1, 'entries full text search');
  eq((await api['entries.list']({ from: today, to: today, tag: '改' }, app)).items.length, 1, 'entries filter by tag');

  // ---- performance -------------------------------------------------------
  const perfList = await api['performance.list']({}, app);
  eq(perfList.total, 1, 'one seeded performance review');
  eq(perfList.templates.length, 1, 'performance template metadata is exposed');
  eq(perfList.templates[0].dimensionCount, 3, 'template has three dimensions');

  const seededPerf = await api['performance.get']({ id: perfList.items[0].id }, app);
  eq(seededPerf.employeeName, '徐炯', 'seed keeps employee name');
  eq(seededPerf.period, '2026 Q3', 'seed keeps period');
  eq(seededPerf.grade, 'B', 'seed keeps grade');
  eq(seededPerf.dimensions.length, 3, 'seed has three dimensions');
  eq(seededPerf.dimensions[0].name, '工作完成度', 'seed dimension name');
  eq(seededPerf.dimensions[0].items.length, 3, 'seed dimension has three rows');
  eq(seededPerf.dimensions[2].name, '个人成长及工作态度', 'seed third dimension');
  ok(seededPerf.dimensions[0].items[0].comment.includes('文创小程序'), 'seed comment copied from xlsx');

  const seededMd = await api['performance.markdown']({ id: seededPerf.id }, app);
  ok(seededMd.markdown.includes('青牛智胜2026年Q3个人绩效考核评价表'), 'markdown keeps sheet title');
  ok(seededMd.markdown.includes('工作完成度'), 'markdown has dimension');
  ok(seededMd.markdown.includes('下季度期望及要求'), 'markdown has expectation heading');
  ok(seededMd.markdown.includes('直接上级审批签字'), 'markdown has signature line');
  const perfPath = dir + '/performance.md';
  const perfExport = await api['performance.export']({ id: seededPerf.id, path: perfPath }, app);
  ok(perfExport.size > 0, 'performance markdown exported');

  const createdPerf = await api['performance.create']({
    title: '测试绩效评价表',
    employeeName: '测试员工',
    period: '2026 Q4',
    grade: 'A',
    dimensions: [{
      name: '交付质量',
      items: [{ comment: '完成 A 项目', expectation: '继续提升 B 能力' }],
    }],
  }, app);
  ok(createdPerf.id.startsWith('perf_'), 'performance id prefix');
  eq(createdPerf.status, 'draft', 'new performance review starts as draft');

  const savedPerf = await api['performance.save']({
    id: createdPerf.id,
    status: 'final',
    grade: 'S',
    managerSignature: '张三',
    employeeSignature: '李四',
    dimensions: [{
      name: '交付质量',
      items: [
        { comment: '完成 A 项目 · 更新', expectation: '继续提升 B 能力 · 更新' },
        { comment: '补充一条评语', expectation: '' },
      ],
    }],
  }, app);
  eq(savedPerf.status, 'final', 'performance status saved');
  eq(savedPerf.grade, 'S', 'performance grade saved');
  eq(savedPerf.dimensions[0].items.length, 2, 'performance rows can be added');
  eq(savedPerf.managerSignature, '张三', 'manager signature saved');
  const savedMd = await api['performance.markdown']({ id: savedPerf.id }, app);
  ok(savedMd.markdown.includes('完成 A 项目 · 更新'), 'edited comment appears in markdown');
  ok(savedMd.markdown.includes('张三'), 'signature appears in markdown');

  const perfTemplate = await api['performance.create']({ template: 'q3-2026' }, app);
  eq(perfTemplate.dimensions.length, 3, 'template can create another review');
  ok(perfTemplate.dimensions[1].items[2].comment.includes('及时响应业务'), 'template copies all rows');

  const removedPerf = await api['performance.remove']({ id: createdPerf.id }, app);
  ok(removedPerf.deletedAt > 0, 'performance review soft deleted');
  ok(!(await api['performance.list']({}, app)).items.some((item) => item.id === createdPerf.id), 'deleted performance hidden');
  const restoredPerf = await api['performance.restore']({ id: createdPerf.id }, app);
  eq(restoredPerf.grade, 'S', 'performance review restored');
  const performanceCount = (await api['performance.list']({}, app)).total;
  eq(performanceCount, 3, 'seed plus two test reviews remain');

  // ---- AI assistant ------------------------------------------------------
  const aiInitial = await api['ai.status']({}, app);
  eq(aiInitial.enabled, false, 'AI starts disabled');
  eq(aiInitial.hasKey, false, 'AI starts without a key');

  const aiSaved = await api['ai.save']({
    enabled: true,
    baseUrl: 'https://ai.example.test/v1/',
    model: 'test-model',
    apiKey: 'sk-test-key',
  }, app);
  eq(aiSaved.enabled, true, 'AI can be enabled');
  eq(aiSaved.hasKey, true, 'AI key is stored');
  eq(aiSaved.baseUrl, 'https://ai.example.test/v1', 'AI base url is normalized');
  ok(!JSON.stringify(aiSaved).includes('sk-test-key'), 'AI status never exposes the key');
  eq(secrets.get('ai.apiKey'), 'sk-test-key', 'AI key lives in the secret store');
  const aiSettings = await api['settings.get']({}, app);
  eq(aiSettings.aiModel, 'test-model', 'AI model is saved in settings');
  ok(!JSON.stringify(aiSettings).includes('sk-test-key'), 'AI key is not written to settings');

  globalThis.fetch = async (url, init) => {
    aiCalls.push({
      url: String(url),
      headers: init && init.headers ? init.headers : {},
      body: init && init.body ? JSON.parse(init.body) : {},
    });
    if (aiFetchMode === 'error') {
      return new Response('{"error":{"message":"upstream failed"}}', {
        status: 500,
        headers: { 'content-type': 'application/json' },
      });
    }
    const body = init && init.body ? JSON.parse(init.body) : {};
    const prompt = (body.messages || []).map((message) => message.content).join('\n');
    let content = '连接正常';
    if (aiFetchMode === 'badjson') {
      content = '这不是 JSON';
    } else if (prompt.includes('中文日报')) {
      content = JSON.stringify({
        summary: '今天完成了数据层和测试。',
        highlights: ['完成数据层', '补了测试'],
        blockers: ['还需要验证导入导出'],
        planNext: ['明天先写测试'],
      });
    } else if (prompt.includes('中文周报')) {
      content = [
        '# 周报 · 测试',
        '',
        '## 一、本周完成',
        '- 完成数据层',
        '## 二、关键进展',
        '- 补了测试',
        '## 三、问题与风险',
        '- 还需要验证导入导出',
        '## 四、数据',
        '- 记录 2 条 · 完成 2 条',
        '## 五、下周计划',
        '- 明天先写测试',
      ].join('\n');
    } else if (prompt.includes('绩效考核评价表')) {
      content = JSON.stringify({
        dimensions: [{
          name: '交付质量',
          items: [{ comment: 'AI 绩效评语', expectation: 'AI 绩效期望' }],
        }],
      });
    }
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const aiTest = await api['ai.test']({}, app);
  eq(aiTest.ok, true, 'AI connection test succeeds');
  eq(aiTest.model, 'test-model', 'AI test reports the model');
  eq(aiCalls[0].url, 'https://ai.example.test/v1/chat/completions', 'AI uses the compatible chat endpoint');
  eq(aiCalls[0].headers.Authorization, 'Bearer sk-test-key', 'AI sends the key only in the Authorization header');

  const aiDaily = await api['daily.ai']({ date: today }, app);
  eq(aiDaily.summary, '今天完成了数据层和测试。', 'daily AI returns a summary');
  eq(aiDaily.highlights.length, 2, 'daily AI returns highlights');
  ok(aiDaily.inputStats.entries >= 1, 'daily AI reports input stats');
  eq(aiDaily.source, 'ai', 'daily AI marks its source');

  const aiReport = await api['reports.ai']({
    start: today,
    end: today,
    label: '周报',
    markdown: report.markdown,
  }, app);
  ok(aiReport.markdown.includes('一、本周完成'), 'report AI keeps section one');
  ok(aiReport.markdown.includes('五、下周计划'), 'report AI keeps section five');
  eq(aiReport.model, 'test-model', 'report AI reports the model');

  const [todayYear, todayMonth] = today.split('-').map(Number);
  const currentQuarter = `${todayYear} Q${Math.floor((todayMonth - 1) / 3) + 1}`;
  const aiPerf = await api['performance.aiDraft']({
    id: createdPerf.id,
    employeeName: '徐炯',
    period: currentQuarter,
    dimensions: [{
      name: '交付质量',
      items: [{ comment: '', expectation: '' }],
    }],
  }, app);
  eq(aiPerf.dimensions.length, 1, 'performance AI keeps the dimension count');
  eq(aiPerf.dimensions[0].name, '交付质量', 'performance AI keeps the dimension name');
  eq(aiPerf.dimensions[0].items[0].comment, 'AI 绩效评语', 'performance AI fills a comment');
  eq(aiPerf.dimensions[0].items[0].expectation, 'AI 绩效期望', 'performance AI fills an expectation');
  ok(aiPerf.inputStats.entries >= 1, 'performance AI reports its input scope');

  let missingKey = null;
  await api['ai.save']({ clearKey: true }, app);
  try {
    await api['daily.ai']({ date: today }, app);
  } catch (error) {
    missingKey = error;
  }
  ok(missingKey && String(missingKey).includes('API Key'), 'AI generation asks for a key when missing');
  await api['ai.save']({ apiKey: 'sk-test-key' }, app);

  aiFetchMode = 'error';
  let upstreamError = null;
  try {
    await api['daily.ai']({ date: today }, app);
  } catch (error) {
    upstreamError = error;
  }
  ok(upstreamError && String(upstreamError).includes('暂时不可用'), 'AI reports upstream failures clearly');

  aiFetchMode = 'badjson';
  let formatError = null;
  try {
    await api['daily.ai']({ date: today }, app);
  } catch (error) {
    formatError = error;
  }
  ok(formatError && String(formatError).includes('格式'), 'AI rejects malformed output');
  aiFetchMode = 'ok';

  // ---- export / import ---------------------------------------------------
  const exportPath = dir + '/all.json';
  const exported = await api['data.exportJson']({ path: exportPath }, app);
  ok(exported.size > 0, 'json export written');
  const exportedText = new TextDecoder().decode(await tjs.readFile(exportPath));
  ok(!exportedText.includes('sk-test-key'), 'json export never contains the AI key');
  ok(exportedText.includes('test-model'), 'json export keeps non-secret AI settings');
  ok(exported.counts.entries >= (await api['entries.list']({}, app)).total, 'export counts entry rows');
  const beforeVisible = (await api['entries.list']({}, app)).total;
  await api['entries.create']({ content: '导入前多出来的一条', entryDate: today }, app);
  ok((await api['entries.list']({}, app)).total === beforeVisible + 1, 'extra entry before import');
  const imported = await api['data.importJson']({ path: exportPath, mode: 'replace' }, app);
  eq(imported.integrity, 'ok', 'import keeps database integrity');
  eq((await api['entries.list']({}, app)).total, beforeVisible, 'replace import restores counts');
  eq((await api['performance.list']({}, app)).total, performanceCount, 'replace import restores performance reviews');
  eq((await api['settings.get']({}, app)).boundaryHour, 4, 'import restores settings');
  eq((await api['daily.get']({ date: today }, app)).summary, '今天把剩余的链路补齐了。', 'import restores daily');
  ok((await api['snippets.list']({}, app)).items.length === 1, 'import restores snippets');
  eq((await api['focus.list']({}, app)).items.length, 2, 'import restores focus sessions');
  const merged = await api['data.importJson']({ path: exportPath, mode: 'merge' }, app);
  ok(merged.imported.entries > 0, 'merge import reports counts');
  eq((await api['entries.list']({}, app)).total, beforeVisible, 'merge import does not duplicate rows');
  const dataStats = await api['data.stats']({}, app);
  eq(dataStats.entries, beforeVisible, 'data stats reports visible entries');
  eq(dataStats.performance, performanceCount, 'data stats reports performance reviews');
  await api['daily.remove']({ date: today }, app);
  ok(!(await api['daily.get']({ date: today }, app)).exists, 'daily can be cleared');

  const week = weekBounds(today, 1);
  const projectList = await api['projects.list']({ includeArchived: true, weekFrom: week.from, weekTo: week.to }, app);
  ok(projectList.items[0].weekEntryCount >= 1, 'project reports this week entry count');

  const notesPath = dir + '/old-notes.md';
  await tjs.writeFile(notesPath, '# 旧便签\n- 第一条便签\n\n第二条便签\n* 第三条便签\n');
  const lineImport = await api['data.importLines']({ path: notesPath, date: today }, app);
  eq(lineImport.imported, 3, 'legacy note import reads each non-empty line');
  const importedIdeas = await api['entries.list']({ date: today, tag: '旧便签' }, app);
  eq(importedIdeas.items.length, 3, 'legacy notes become tagged ideas');
  ok(importedIdeas.items.every((item) => item.kind === 'idea'), 'legacy notes use idea kind');

  const earlyTs = new Date();
  earlyTs.setHours(2, 30, 0, 0);
  const earlyEntry = await api['entries.create']({
    content: '凌晨边界测试',
    occurredAt: earlyTs.getTime(),
  }, app);
  eq(earlyEntry.entryDate, logicalDate(earlyTs.getTime(), 4), 'entry without date follows 4am boundary');
  await api['entries.remove']({ id: earlyEntry.id }, app);

  await api['projects.remove']({ id: project.id }, app);
  const orphaned = await api['entries.list']({ date: today }, app);
  eq(orphaned.items[0].projectId, null, 'removing project unclassifies entries');

  const burst = [];
  for (let i = 0; i < 10; i += 1) {
    burst.push(await api['entries.create']({ content: `连续记录 ${i + 1}`, entryDate: today }, app));
  }
  const burstList = await api['entries.list']({ date: today, query: '连续记录' }, app);
  eq(burstList.total, 10, 'ten rapid entries are all saved');
  eq(new Set(burstList.items.map((item) => item.id)).size, 10, 'rapid entries are not duplicated');
  const tomorrow = nextDateKey(today);
  const moved = await api['entries.update']({ id: burst[0].id, entryDate: tomorrow }, app);
  eq(moved.entryDate, tomorrow, 'entry date can be changed');
  eq((await api['entries.list']({ date: tomorrow, query: '连续记录' }, app)).total, 1, 'moved entry appears on target date');
  eq((await api['entries.list']({ date: today, query: '连续记录' }, app)).total, 9, 'moved entry leaves source date');
  for (const item of burst) await api['entries.remove']({ id: item.id }, app);

  ok(events.length > 10, 'events emitted');
} catch (error) {
  failed += 1;
  console.error('  FATAL', error && error.stack ? error.stack : error);
} finally {
  globalThis.fetch = originalFetch;
  try { await tjs.remove(dir); } catch { /* ignore */ }
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) tjs.exit(1);
}
