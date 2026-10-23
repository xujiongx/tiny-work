import { getDb, getDataDir, getDbPath } from '../db.js';
import { getSettings } from './settings.js';

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export async function backupNow() {
  const db = getDb();
  const dir = getDataDir() + '/backups';
  await tjs.makeDir(dir, { recursive: true });
  const path = `${dir}/workbench-${stamp()}.db`;

  try {
    // VACUUM INTO produces a consistent copy without stopping the app.
    db.prepare('VACUUM INTO ?').run(path);
  } catch {
    // Fallback for builds whose SQLite cannot bind the VACUUM target.
    db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
    await tjs.copyFile(getDbPath(), path);
  }

  const info = await tjs.stat(path);
  await pruneOldBackups(getSettings().backupKeep);
  return { path, at: Date.now(), size: info.size };
}

async function backupFiles() {
  const dir = getDataDir() + '/backups';
  const out = [];
  try {
    const iter = await tjs.readDir(dir);
    for await (const item of iter) {
      if (!item.isFile || !item.name.endsWith('.db')) continue;
      out.push(dir + '/' + item.name);
    }
  } catch {
    return out;
  }
  out.sort();
  return out;
}

async function pruneOldBackups(keep) {
  const max = Math.min(Math.max(Number(keep) || 7, 1), 30);
  const files = await backupFiles();
  const remove = files.slice(0, Math.max(0, files.length - max));
  for (const path of remove) {
    try {
      await tjs.remove(path);
    } catch {
      // A backup that cannot be pruned is not worth failing the current one.
    }
  }
}

export async function listBackups() {
  const paths = (await backupFiles()).slice().reverse();
  const items = [];
  for (const path of paths) {
    try {
      const info = await tjs.stat(path);
      items.push({ path, at: info.mtim.getTime(), size: info.size });
    } catch {
      // Skip a file that vanished between listing and stat.
    }
  }
  return { items };
}

export async function systemInfo(app) {
  const paths = await app.paths();
  const appInfo = await app.info();
  let dbSize = 0;
  try {
    dbSize = (await tjs.stat(getDbPath())).size;
  } catch {
    dbSize = 0;
  }
  const backups = await listBackups();
  const latest = backups.items[0] || null;
  return {
    dataDir: paths.data,
    dbPath: getDbPath(),
    dbSize,
    backupAt: latest ? latest.at : null,
    backupPath: latest ? latest.path : null,
    backupDir: paths.data + '/backups',
    appVersion: appInfo.version,
    tinyjsVersion: appInfo.tinyjs,
  };
}

export async function pruneOnStartup() {
  await pruneOldBackups(getSettings().backupKeep);
}

export async function shouldBackupToday() {
  const backups = await listBackups();
  if (!backups.items.length) return true;
  const d = new Date(backups.items[0].at);
  const today = new Date();
  return d.getFullYear() !== today.getFullYear()
    || d.getMonth() !== today.getMonth()
    || d.getDate() !== today.getDate();
}
