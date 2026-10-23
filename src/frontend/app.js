(function (WB) {
  const U = WB.util;
  const ORDER = ['today', 'journal', 'tasks', 'projects', 'review', 'performance', 'settings'];

  function parseHash() {
    const raw = (location.hash || '#/today').replace(/^#\/?/, '');
    const [name, query] = raw.split('?');
    const view = WB.views[name] ? name : 'today';
    const params = new URLSearchParams(query || '');
    const date = params.get('date');
    const filters = {};
    for (const key of ['from', 'to', 'projectId', 'kind', 'tag', 'query']) {
      const value = params.get(key);
      if (value) filters[key] = value;
    }
    return {
      view,
      date: /^\d{4}-\d{2}-\d{2}$/.test(date || '') ? date : U.todayKey(),
      params: filters,
    };
  }

  function go(view, date) {
    const safeView = WB.views[view] ? view : 'today';
    let hash = `#/${safeView}`;
    if (date) {
      const hide = safeView === 'today' && date === U.todayKey();
      if (!hide) hash += `?date=${date}`;
    }
    if (location.hash === hash) route();
    else location.hash = hash;
  }

  function goFiltered(filters) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters || {})) {
      if (value) params.set(key, value);
    }
    const query = params.toString();
    location.hash = `#/journal${query ? '?' + query : ''}`;
  }

  WB.go = go;
  WB.goFiltered = goFiltered;

  async function route() {
    if (!location.hash) {
      try {
        history.replaceState(null, '', '#/today');
      } catch {
        location.hash = '#/today';
      }
    }
    const { view, date, params } = parseHash();
    WB.store.state.view = view;

    document.querySelectorAll('[data-nav]').forEach((link) => {
      link.classList.toggle('is-active', link.dataset.nav === view);
    });

    const root = document.getElementById('view');
    root.innerHTML = '<div class="page"><p class="muted">加载中…</p></div>';
    document.querySelector('.main').scrollTop = 0;

    try {
      await WB.views[view].render(root, { date, params });
    } catch (error) {
      root.innerHTML = `
        <div class="page">
          <div class="empty">
            <p class="empty-title">这一页没有打开。</p>
            <p class="empty-text">${U.esc(error && error.message ? error.message : '未知错误')}</p>
            <p class="empty-text">可以切到其他页面，或重新打开应用。</p>
          </div>
        </div>`;
    }
  }

  function renderRail() {
    const counts = WB.store.state.counts || {};
    const node = document.querySelector('[data-rail-counts]');
    if (node) {
      node.textContent = `${counts.entriesToday || 0} 条记录 · ${counts.tasksOpen || 0} 个待办 · 连续 ${counts.streak || 0} 天`;
    }
    updateTray();
  }

  function markSaved() {
    const node = document.querySelector('[data-saved]');
    if (node) node.textContent = `已保存 · ${U.fmtTime(Date.now())}`;
  }

  async function applyTheme(settings) {
    const opts = settings || WB.store.state.settings || {};
    const theme = opts.theme || 'light';
    let dark = theme === 'dark';
    if (theme === 'auto') {
      try {
        const system = await tiny.theme.get();
        dark = Boolean(system && system.dark);
      } catch {
        dark = false;
      }
    }
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  }

  WB.applyTheme = applyTheme;

  let hotkeyRegistered = null;
  let focusTrayLabel = '';

  async function registerGlobalHotkey(accelerator) {
    const combo = accelerator || (WB.store.state.settings || {}).quickHotkey || 'cmd+shift+space';
    try {
      if (hotkeyRegistered && hotkeyRegistered !== combo) {
        try { tiny.hotkey.unregister('quick-capture'); } catch { /* ignore */ }
      }
      tiny.hotkey.register('quick-capture', combo);
      hotkeyRegistered = combo;
      return true;
    } catch {
      WB.toast('全局快捷键被占用了，可以在设置里换一个。', { type: 'error' });
      return false;
    }
  }

  WB.registerGlobalHotkey = registerGlobalHotkey;

  async function openQuick() {
    try {
      const windows = await tiny.win.windows();
      const hasQuick = Array.isArray(windows) && windows.some((win) => (
        win === 'quick' || (win && typeof win === 'object' && win.id === 'quick')
      ));
      if (hasQuick) {
        const result = await WB.api.call('quick.focus', {}, { silent: true });
        if (result && result.open) return;
      }
      await tiny.win.open('quick', {
        page: 'quick.html',
        title: '快速记录 · 案头',
        size: '560x320',
        minSize: '420x240',
        chrome: { frame: false },
      });
    } catch (error) {
      console.warn('[deskwork] quick window failed', error);
      WB.toast('没能打开快速记录窗，可以先用 ⌘N。', { type: 'error' });
    }
  }

  WB.openQuick = openQuick;

  function traySpec() {
    const counts = WB.store.state.counts || {};
    const isMac = /Mac/i.test(navigator.platform || navigator.userAgent || '');
    const isWin = /Win/i.test(navigator.platform || navigator.userAgent || '');
    return {
      icon: isMac ? 'sf:square.and.pencil' : isWin ? 'emoji:📝' : undefined,
      title: focusTrayLabel || '案头',
      tooltip: focusTrayLabel || `${counts.entriesToday || 0} 条记录 · ${counts.tasksOpen || 0} 个待办`,
      menu: [
        { id: 'stats', label: `${counts.entriesToday || 0} 条记录 · ${counts.tasksOpen || 0} 个待办`, enabled: false },
        { separator: true },
        { id: 'quick', label: '快速记录…' },
        { id: 'daily', label: '写今天的日报' },
        { id: 'today', label: '打开今日' },
        { id: 'review', label: '回顾与周报' },
        { id: 'performance', label: '绩效评价' },
        { separator: true },
        { id: 'settings', label: '设置…' },
      ],
    };
  }

  async function setupTray() {
    try {
      await tiny.tray.set(traySpec());
      tiny.tray.on(async (id) => {
        if (id === 'quick') return openQuick();
        if (id === 'daily' || id === 'today' || id === 'review' || id === 'performance' || id === 'settings') {
          try { await tiny.win.show(); } catch { /* the window may already be visible */ }
          if (id === 'daily') WB.openDaily();
          else go(id === 'settings' ? 'settings' : id);
          return undefined;
        }
        return undefined;
      });
    } catch (error) {
      console.warn('[deskwork] tray setup failed', error);
    }
  }

  function updateTray() {
    try {
      tiny.tray.set(traySpec());
    } catch {
      // A missing tray icon should not break the app.
    }
  }

  WB.setFocusTray = function (label) {
    const next = label || '';
    if (next === focusTrayLabel) return;
    focusTrayLabel = next;
    updateTray();
  };

  const refreshCounts = U.debounce(async () => {
    try {
      const data = await WB.api.call('bootstrap', {}, { silent: true });
      WB.store.set({
        date: data.date,
        settings: data.settings,
        projects: data.projects,
        counts: data.counts,
      });
      renderRail();
      if (WB.store.state.view === 'today') WB.views.today.renderSub();
    } catch {
      // A failed count refresh should never interrupt the page.
    }
  }, 350);

  function focusSoon(selector) {
    setTimeout(() => {
      const node = document.querySelector(selector);
      if (node) node.focus();
    }, 40);
  }

  function newEntry() {
    go('today');
    focusSoon('[data-capture-text]');
  }

  function newTask() {
    WB.views.tasks.tab = 'inbox';
    go('tasks');
    focusSoon('[data-add-input]');
  }

  function search() {
    go('journal');
    focusSoon('[data-search]');
  }

  async function handleMenu(id) {
    if (id === 'new-entry') return newEntry();
    if (id === 'new-task') return newTask();
    if (id === 'quick') return openQuick();
    if (id === 'daily') return WB.openDaily();
    if (id === 'search') return search();
    if (id === 'settings') return go('settings');
    if (id === 'about') {
      return tiny.dialog.alert('案头 · 个人工作台', {
        detail: '本地优先的工作记录、任务和回顾工具。数据只保存在这台电脑上。',
        ok: '知道了',
      });
    }
    if (id === 'backup') {
      try {
        const result = await WB.api.call('backup.now', {});
        WB.toast(`已备份 · ${U.fmtBytes(result.size)}`);
      } catch {
        // toast already shown
      }
      return;
    }
    if (id === 'reveal') {
      try {
        const info = await WB.api.call('data.info', {});
        await tiny.app.shell.reveal(info.dataDir);
      } catch {
        // toast already shown
      }
      return;
    }
    if (id.startsWith('go-')) {
      const view = id.slice(3);
      if (WB.views[view]) go(view);
    }
    return;
  }

  async function setupMenu() {
    try {
      await tiny.menu.set([
        {
          role: 'app',
          items: [{ id: 'settings', label: '设置…', key: ',' }],
        },
        {
          title: '文件',
          items: [
            { id: 'new-entry', label: '新建记录', key: 'n' },
            { id: 'new-task', label: '新建任务', key: 'N' },
            { id: 'quick', label: '快速记录小窗' },
            { id: 'daily', label: '写今天的日报' },
            { separator: true },
            { id: 'backup', label: '立即备份' },
            { id: 'reveal', label: '打开数据文件夹' },
          ],
        },
        {
          role: 'edit',
          items: [
            { role: 'standard' },
            { separator: true },
            { id: 'search', label: '搜索…', key: 'k' },
          ],
        },
        {
          title: '前往',
          items: [
            { id: 'go-today', label: '今日', key: '1' },
            { id: 'go-journal', label: '记录', key: '2' },
            { id: 'go-tasks', label: '任务', key: '3' },
            { id: 'go-projects', label: '项目', key: '4' },
            { id: 'go-review', label: '回顾', key: '5' },
            { id: 'go-performance', label: '绩效', key: '6' },
            { id: 'go-snippets', label: '片段', key: '7' },
          ],
        },
        {
          role: 'help',
          items: [{ id: 'about', label: '关于案头' }],
        },
      ]);

      tiny.menu.on(handleMenu);
    } catch (error) {
      console.warn('[deskwork] menu setup failed', error);
    }
  }

  function bindKeys() {
    document.addEventListener('keydown', (event) => {
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key;
      const target = event.target;
      const typing = target && (
        target.tagName === 'INPUT'
        || target.tagName === 'TEXTAREA'
        || target.tagName === 'SELECT'
        || target.isContentEditable
      );

      if (!mod && !typing) {
        if (key.toLowerCase() === 'j' && WB.store.state.view === 'journal') {
          event.preventDefault();
          WB.go('journal', U.addDays(WB.views.journal.date, 1));
          return;
        }
        if (key.toLowerCase() === 'k' && WB.store.state.view === 'journal') {
          event.preventDefault();
          WB.go('journal', U.addDays(WB.views.journal.date, -1));
          return;
        }
        if (key === ' ' && WB.store.state.view === 'tasks') {
          const focused = document.activeElement && document.activeElement.closest
            ? document.activeElement.closest('.task-row')
            : null;
          const row = focused || document.querySelector('.task-row');
          if (row) {
            const toggle = row.querySelector('[data-task-toggle]');
            if (toggle) {
              event.preventDefault();
              toggle.click();
            }
          }
          return;
        }
      }

      if (!mod) return;

      if (key === 'z' && !typing) {
        event.preventDefault();
        WB.runUndo();
        return;
      }

      if (key >= '1' && key <= '6') {
        event.preventDefault();
        go(ORDER[Number(key) - 1]);
        return;
      }
      if (key === '7') {
        event.preventDefault();
        go('snippets');
        return;
      }
      if (key.toLowerCase() === 'n') {
        event.preventDefault();
        if (event.shiftKey) newTask();
        else newEntry();
        return;
      }
      if (key.toLowerCase() === 'k') {
        event.preventDefault();
        search();
        return;
      }
      if (key === ',') {
        event.preventDefault();
        go('settings');
      }
    });
  }

  const refreshCurrent = U.debounce(async () => {
    const view = WB.views[WB.store.state.view];
    if (!view) return;
    try {
      if (typeof view.refresh === 'function') await view.refresh();
    } catch {
      // A failed background refresh leaves the current page as it was.
    }
  }, 260);

  function setupEvents() {
    const bump = () => {
      markSaved();
      refreshCounts();
      refreshCurrent();
    };
    WB.api.on('entries:changed', bump);
    WB.api.on('tasks:changed', bump);
    WB.api.on('projects:changed', bump);
    WB.api.on('snippets:changed', () => refreshCurrent());
    WB.api.on('daily:changed', () => refreshCurrent());
    WB.api.on('focus:changed', () => {
      if (WB.views.today && WB.views.today.el && WB.views.today.el.isConnected) {
        WB.views.today.loadFocus();
      }
    });
    WB.api.on('performance:changed', () => refreshCurrent());
    WB.api.on('data:saved', () => markSaved());
    WB.api.on('settings:changed', (settings) => {
      WB.store.set({ settings });
      applyTheme(settings);
    });
    WB.api.on('data:imported', () => {
      WB.toast('数据已导入');
    });
  }

  function setupGlobalErrors() {
    window.addEventListener('error', (event) => {
      console.error(event.error || event.message);
      if (window.tiny && tiny.log) tiny.log('[deskwork] ' + (event.message || 'unknown error'));
      WB.toast('出了点问题，请重试一次。', { type: 'error' });
    });
    window.addEventListener('unhandledrejection', (event) => {
      console.error(event.reason);
    });
  }

  async function boot() {
    setupGlobalErrors();
    renderRail();
    try {
      const data = await WB.api.call('bootstrap', {}, { silent: true });
      WB.store.set({
        date: data.date,
        settings: data.settings,
        projects: data.projects,
        counts: data.counts,
        dbPath: data.dbPath,
      });
      renderRail();
      await applyTheme(data.settings);
      bindKeys();
      setupEvents();
      await setupMenu();
      await setupTray();
      await registerGlobalHotkey(data.settings.quickHotkey);
      try {
        tiny.hotkey.on((id) => {
          if (id === 'quick-capture') openQuick();
        });
      } catch {
        // Global shortcuts are optional.
      }
      try {
        tiny.theme.on(() => {
          const settings = WB.store.state.settings || {};
          if (settings.theme === 'auto') applyTheme(settings);
        });
      } catch {
        // Theme following is optional.
      }
      await route();
      window.addEventListener('focus', () => {
        refreshCounts();
        refreshCurrent();
      });
    } catch (error) {
      const message = error && error.message ? error.message : '未知错误';
      document.getElementById('view').innerHTML = `
        <div class="page">
          <div class="empty">
            <p class="empty-kicker">案头</p>
            <p class="empty-title">没能打开工作台。</p>
            <p class="empty-text">${U.esc(message)}</p>
            <p class="empty-text">请检查数据文件夹权限，或重新打开应用。</p>
          </div>
        </div>`;
    }
  }

  window.addEventListener('hashchange', route);
  boot();
})(window.WB = window.WB || {});
