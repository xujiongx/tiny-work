// Performance fixture test: 10,000 entries, repeated searches.
// Run: ~/.tinyjs/bin/tjs run test/perf.test.js
// Uses a temporary data dir and never touches the real app database.

import { openDb, getDb, newId } from '../src/backend/db.js';
import { listEntries } from '../src/backend/repo/entries.js';

const dir = await tjs.makeTempDir(tjs.tmpDir + '/deskwork-perf-XXXXXX');
const app = {
  paths: async () => ({ data: dir }),
  push: () => {},
  info: async () => ({ version: 'test', tinyjs: 'test' }),
};

await openDb(app);
const db = getDb();
const insert = db.prepare(
  `INSERT INTO entries
     (id, content, kind, project_id, tags, duration_min, source, entry_date, occurred_at,
      created_at, updated_at, deleted_at)
   VALUES (?, ?, 'log', NULL, '[]', 0, 'manual', ?, ?, ?, ?, NULL)`
);

const day = new Date();
const p = (n) => String(n).padStart(2, '0');
const date = `${day.getFullYear()}-${p(day.getMonth() + 1)}-${p(day.getDate())}`;
const base = Date.now();

const seed = db.transaction(() => {
  for (let i = 0; i < 10000; i += 1) {
    const ts = base - i * 1000;
    insert.run(
      newId('perf_'),
      `第 ${i + 1} 条性能测试记录，关键词 ${i % 50 === 0 ? '特别标记' : '普通'}`,
      date,
      ts,
      ts,
      ts
    );
  }
});
seed();

function percentile(values, ratio) {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * ratio) - 1)];
}

function bench(label, params, runs = 20) {
  listEntries(params); // warm up
  const times = [];
  let last = null;
  for (let i = 0; i < runs; i += 1) {
    const started = Date.now();
    last = listEntries(params);
    times.push(Date.now() - started);
  }
  const p95 = percentile(times, 0.95);
  const avg = Math.round(times.reduce((sum, value) => sum + value, 0) / times.length);
  console.log(`  ${label}: avg ${avg} ms · p95 ${p95} ms · ${last.total} matches`);
  return p95;
}

const keyword = bench('search keyword', { query: '特别标记' });
const exact = bench('search unique text', { query: '第 9999 条' });
const broad = bench('search broad', { query: '性能测试' });
const timeline = bench('timeline', { date });

const failed = [keyword, exact, broad, timeline].filter((value) => value >= 100);
await tjs.remove(dir, { recursive: true });

if (failed.length) {
  console.error(`FAIL performance target: ${failed.join(', ')} ms (want p95 < 100 ms)`);
  tjs.exit(1);
} else {
  console.log('ok   10k-entry searches stay under 100 ms p95');
}
