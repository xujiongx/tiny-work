(function (WB) {
  const U = WB.util;

  WB.kinds = [
    { id: 'log', label: '进展' },
    { id: 'done', label: '完成' },
    { id: 'blocker', label: '阻塞' },
    { id: 'idea', label: '想法' },
    { id: 'meeting', label: '会议' },
    { id: 'learning', label: '学习' },
  ];

  WB.kindLabel = function (kind) {
    const found = WB.kinds.find((item) => item.id === kind);
    return found ? found.label : '进展';
  };

  WB.toast = function (message, options) {
    const opts = options || {};
    const root = document.getElementById('toasts');
    if (!root) return;

    const el = document.createElement('div');
    el.className = 'toast' + (opts.type === 'error' ? ' is-error' : '');
    el.setAttribute('role', opts.type === 'error' ? 'alert' : 'status');

    const text = document.createElement('span');
    text.className = 'toast-text';
    text.textContent = message;
    el.appendChild(text);

    let timer = null;
    const dismiss = () => {
      clearTimeout(timer);
      el.classList.add('is-leaving');
      setTimeout(() => el.remove(), 140);
    };

    if (opts.actionLabel && typeof opts.onAction === 'function') {
      const action = document.createElement('button');
      action.type = 'button';
      action.className = 'toast-action';
      action.textContent = opts.actionLabel;
      action.addEventListener('click', async () => {
        dismiss();
        try {
          await opts.onAction();
        } catch {
          // api.call already surfaces the error.
        }
      });
      el.appendChild(action);
    }

    root.replaceChildren(el);
    timer = setTimeout(dismiss, opts.duration || (opts.actionLabel ? 6000 : 2800));
  };

  WB.emptyState = function (title, text) {
    return `
      <div class="empty">
        <p class="empty-mark" aria-hidden="true"></p>
        <p class="empty-title">${U.esc(title)}</p>
        ${text ? `<p class="empty-text">${U.esc(text)}</p>` : ''}
      </div>`;
  };

  WB.miniEmpty = function (text) {
    return `<p class="mini-empty">${U.esc(text)}</p>`;
  };

  WB.chip = function (tag) {
    return `<span class="chip">#${U.esc(tag)}</span>`;
  };

  WB.projectDot = function (color) {
    return `<span class="dot dot-${U.esc(color || 'moss')}" aria-hidden="true"></span>`;
  };

  WB.statCard = function (value, label) {
    return `
      <div class="stat">
        <span class="stat-value">${U.esc(value)}</span>
        <span class="stat-label">${U.esc(label)}</span>
      </div>`;
  };

  WB.entryHTML = function (entry, options) {
    const opts = options || {};
    const tags = Array.isArray(entry.tags) ? entry.tags : [];
    const visibleTags = tags.slice(0, 3).map((tag) => WB.chip(tag)).join('');
    const more = tags.length > 3 ? `<span class="meta-item">+${tags.length - 3}</span>` : '';
    const meta = [`<span class="kind kind-${U.esc(entry.kind)}">${U.esc(WB.kindLabel(entry.kind))}</span>`];

    if (entry.projectName) {
      meta.push(`<span class="meta-item">${WB.projectDot(entry.projectColor)}${U.esc(entry.projectName)}</span>`);
    }
    if (tags.length) meta.push(visibleTags + more);
    if (entry.durationMin) meta.push(`<span class="meta-item">${U.esc(U.fmtMinutes(entry.durationMin))}</span>`);

    const dateLabel = opts.showDate
      ? `${U.fmtShort(entry.entryDate)} ${U.fmtTime(entry.occurredAt)}`
      : U.fmtTime(entry.occurredAt);

    return `
      <article class="tl-item" data-entry="${U.esc(entry.id)}">
        <time class="tl-time">${U.esc(dateLabel)}</time>
        <span class="tl-axis" aria-hidden="true"><span class="tl-dot dot-kind-${U.esc(entry.kind)}"></span></span>
        <div class="tl-body">
          <p class="tl-content" title="双击编辑">${U.esc(entry.content)}</p>
          <div class="tl-meta">${meta.join('')}</div>
        </div>
        <div class="row-actions">
          <button class="icon-action" type="button" data-entry-edit="${U.esc(entry.id)}"
                  aria-label="编辑这条记录" title="编辑">✎</button>
          <button class="icon-action" type="button" data-entry-del="${U.esc(entry.id)}"
                  aria-label="删除这条记录" title="删除">×</button>
        </div>
      </article>`;
  };

  WB.taskHTML = function (task) {
    const done = task.status === 'done';
    const meta = [];

    if (task.projectName) {
      meta.push(`<span>${WB.projectDot(task.projectColor)}${U.esc(task.projectName)}</span>`);
    }
    if (task.dueDate) {
      const overdue = !done && task.dueDate < U.todayKey();
      const days = overdue ? daysBetween(task.dueDate, U.todayKey()) : 0;
      meta.push(
        `<span class="${overdue ? 'is-overdue' : ''}">${overdue ? `逾期 ${days} 天` : `截止 ${U.fmtShort(task.dueDate)}`}</span>`
      );
    } else if (task.plannedDate) {
      meta.push(`<span>${task.plannedDate === U.todayKey() ? '今天' : U.fmtShort(task.plannedDate)}</span>`);
    }
    if (task.estimateMin) meta.push(`<span>${U.esc(U.fmtMinutes(task.estimateMin))}</span>`);
    if (task.note) meta.push('<span>有备注</span>');

    const priority = ['低', '中', '高', '紧急'][task.priority] || '中';

    return `
      <div class="task-row${done ? ' is-done' : ''}" data-task="${U.esc(task.id)}" draggable="true" tabindex="0">
        <button class="check" type="button" data-task-toggle="${U.esc(task.id)}"
                aria-pressed="${done}" aria-label="${done ? '标记未完成' : '标记完成'}">
          <span aria-hidden="true"></span>
        </button>
        <div class="task-main" data-task-open="${U.esc(task.id)}">
          <p class="task-title">${U.esc(task.title)}</p>
          ${meta.length ? `<div class="task-meta">${meta.join('')}</div>` : ''}
        </div>
        <span class="task-pri pri-${task.priority}" title="优先级">${priority}</span>
        <div class="row-actions">
          <button class="icon-action" type="button" data-task-edit="${U.esc(task.id)}"
                  aria-label="编辑任务" title="编辑">✎</button>
          <button class="icon-action" type="button" data-task-del="${U.esc(task.id)}"
                  aria-label="删除任务" title="删除">×</button>
        </div>
      </div>`;
  };

  function daysBetween(from, to) {
    const a = U.parseKey(from);
    const b = U.parseKey(to);
    return Math.max(1, Math.round((b - a) / 86400000));
  }

  WB.barRow = function (name, count, total, color, attrs) {
    const width = U.pct(count, total);
    const extra = attrs ? ` ${attrs}` : '';
    return `
      <div class="bar-row"${extra}>
        <span class="bar-name">${color ? WB.projectDot(color) : ''}${U.esc(name)}</span>
        <span class="bar-track"><span class="bar-fill" style="width:${width}%"></span></span>
        <span class="bar-value">${count}</span>
      </div>`;
  };

  // ---- reusable form pieces ----------------------------------------------
  WB.kindOptions = function (selected) {
    return WB.kinds.map((kind) => (
      `<option value="${kind.id}"${kind.id === selected ? ' selected' : ''}>${kind.label}</option>`
    )).join('');
  };

  WB.projectOptions = function (selected, options) {
    const opts = options || {};
    const projects = (WB.store.state.projects || []);
    const current = opts.projectName
      ? `<option value="${U.esc(opts.projectId || '')}" selected>${U.esc(opts.projectName)}（已归档）</option>`
      : '';
    const active = projects.map((project) => (
      `<option value="${U.esc(project.id)}"${!current && project.id === selected ? ' selected' : ''}>${U.esc(project.name)}</option>`
    )).join('');
    return `<option value=""${!selected && !current ? ' selected' : ''}>未归类</option>${current}${active}`;
  };

  const DURATIONS = [15, 25, 30, 45, 60, 90, 120, 180, 240];
  WB.durationOptions = function (selected, emptyLabel) {
    const value = selected === null || selected === undefined || selected === '' ? '' : String(selected);
    const extra = value && !DURATIONS.includes(Number(value))
      ? `<option value="${U.esc(value)}" selected>${U.esc(value)} 分钟</option>`
      : '';
    return `<option value=""${value === '' ? ' selected' : ''}>${U.esc(emptyLabel || '不记耗时')}</option>`
      + DURATIONS.map((minutes) => (
        `<option value="${minutes}"${String(minutes) === value ? ' selected' : ''}>${U.fmtMinutes(minutes)}</option>`
      )).join('') + extra;
  };

  WB.colorSwatches = function (selected) {
    const colors = [
      ['moss', '苔绿'], ['clay', '陶土'], ['ochre', '赭黄'], ['indigo', '靛青'], ['plum', '梅紫'],
    ];
    return colors.map(([id, label]) => `
      <label class="swatch swatch-${id}" title="${label}">
        <input type="radio" name="color" value="${id}"${id === selected ? ' checked' : ''}>
        <span aria-hidden="true"></span>
        <span class="sr-only">${label}</span>
      </label>
    `).join('');
  };

  function timeOf(ts) {
    return U.fmtTime(ts);
  }

  function dateTimeToTs(date, time) {
    const d = U.parseKey(date);
    const parts = String(time || '00:00').split(':').map(Number);
    d.setHours(parts[0] || 0, parts[1] || 0, 0, 0);
    return d.getTime();
  }

  WB.setUndo = function (label, run) {
    WB.lastUndo = { label, run, at: Date.now() };
  };

  WB.runUndo = async function () {
    const undo = WB.lastUndo;
    if (!undo || Date.now() - undo.at > 60000) {
      WB.toast('没有可以撤销的操作。');
      return;
    }
    WB.lastUndo = null;
    try {
      await undo.run();
      WB.toast('已撤销');
    } catch {
      // api.call already shows the reason.
    }
  };

  // ---- overlays -----------------------------------------------------------
  WB.openModal = function (options) {
    const opts = options || {};
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <section class="modal ${opts.className || ''}" role="dialog" aria-modal="true" aria-label="${U.esc(opts.title || '编辑')}">
        <header class="modal-head">
          <div>
            ${opts.kicker ? `<p class="modal-kicker">${U.esc(opts.kicker)}</p>` : ''}
            <h2 class="modal-title">${U.esc(opts.title || '')}</h2>
          </div>
          <button class="btn ghost icon-btn" type="button" data-modal-close aria-label="关闭">×</button>
        </header>
        <div class="modal-body">${opts.body || ''}</div>
        ${opts.footer ? `<footer class="modal-foot">${opts.footer}</footer>` : ''}
      </section>`;
    document.body.appendChild(backdrop);

    const previous = document.activeElement;
    const close = () => {
      backdrop.remove();
      document.removeEventListener('keydown', onKey);
      if (previous && previous.focus) previous.focus();
      if (typeof opts.onClose === 'function') opts.onClose();
    };
    const onKey = (event) => {
      if (event.key === 'Escape') {
        const overlays = document.querySelectorAll('.modal-backdrop, .drawer-backdrop');
        if (overlays[overlays.length - 1] !== backdrop) return;
        event.preventDefault();
        close();
      }
    };
    document.addEventListener('keydown', onKey);
    backdrop.addEventListener('mousedown', (event) => {
      if (event.target === backdrop) close();
    });
    backdrop.querySelector('[data-modal-close]').addEventListener('click', close);
    const dialog = backdrop.querySelector('.modal');
    setTimeout(() => {
      const target = dialog.querySelector('[autofocus]') || dialog.querySelector('input, textarea, select, button');
      if (target) target.focus();
    }, 30);
    if (typeof opts.onMount === 'function') opts.onMount(dialog, close);
    return { close, el: dialog };
  };

  WB.openDrawer = function (options) {
    const opts = options || {};
    const backdrop = document.createElement('div');
    backdrop.className = 'drawer-backdrop';
    backdrop.innerHTML = `
      <aside class="drawer" role="dialog" aria-modal="true" aria-label="${U.esc(opts.title || '面板')}">
        <header class="drawer-head">
          <div>
            ${opts.kicker ? `<p class="modal-kicker">${U.esc(opts.kicker)}</p>` : ''}
            <h2 class="modal-title">${U.esc(opts.title || '')}</h2>
            ${opts.sub ? `<p class="drawer-sub">${opts.sub}</p>` : ''}
          </div>
          <button class="btn ghost icon-btn" type="button" data-drawer-close aria-label="关闭">×</button>
        </header>
        <div class="drawer-body">${opts.body || ''}</div>
        ${opts.footer ? `<footer class="drawer-foot">${opts.footer}</footer>` : ''}
      </aside>`;
    document.body.appendChild(backdrop);
    const previous = document.activeElement;
    let closing = false;
    const close = async () => {
      if (closing) return;
      closing = true;
      if (typeof opts.beforeClose === 'function') {
        try {
          const allowed = await opts.beforeClose();
          if (allowed === false) {
            closing = false;
            return;
          }
        } catch {
          closing = false;
          return;
        }
      }
      backdrop.remove();
      document.removeEventListener('keydown', onKey);
      if (previous && previous.focus) previous.focus();
      if (typeof opts.onClose === 'function') opts.onClose();
    };
    const onKey = (event) => {
      if (event.key === 'Escape') {
        const overlays = document.querySelectorAll('.modal-backdrop, .drawer-backdrop');
        if (overlays[overlays.length - 1] !== backdrop) return;
        event.preventDefault();
        close();
      }
    };
    document.addEventListener('keydown', onKey);
    backdrop.addEventListener('mousedown', (event) => {
      if (event.target === backdrop) close();
    });
    backdrop.querySelector('[data-drawer-close]').addEventListener('click', close);
    if (typeof opts.onMount === 'function') opts.onMount(backdrop.querySelector('.drawer'), close);
    return { close, el: backdrop.querySelector('.drawer') };
  };

  // ---- edit entry ---------------------------------------------------------
  WB.openEntryEditor = async function (id, options) {
    const opts = options || {};
    let entry;
    try {
      entry = await WB.api.call('entries.get', { id });
    } catch {
      return null;
    }
    const formId = 'entry-edit-' + Math.random().toString(36).slice(2);
    const modal = WB.openModal({
      kicker: '记录',
      title: '编辑这条记录',
      className: 'modal-entry',
      body: `
        <form id="${formId}" class="edit-form" data-entry-form>
          <label class="edit-field">
            <span class="edit-label">内容</span>
            <textarea class="field edit-textarea" name="content" rows="4" maxlength="4000" autofocus>${U.esc(entry.content)}</textarea>
          </label>
          <div class="edit-grid">
            <label class="edit-field">
              <span class="edit-label">类型</span>
              <select class="field" name="kind">${WB.kindOptions(entry.kind)}</select>
            </label>
            <label class="edit-field">
              <span class="edit-label">项目</span>
              <select class="field" name="projectId">${WB.projectOptions(entry.projectId, {
                projectId: entry.projectId,
                projectName: entry.projectName,
              })}</select>
            </label>
            <label class="edit-field">
              <span class="edit-label">日期</span>
              <input class="field" type="date" name="entryDate" value="${U.esc(entry.entryDate)}" required>
            </label>
            <label class="edit-field">
              <span class="edit-label">时间</span>
              <input class="field" type="time" name="occurredTime" value="${U.esc(timeOf(entry.occurredAt))}">
            </label>
            <label class="edit-field">
              <span class="edit-label">耗时</span>
              <select class="field" name="durationMin">${WB.durationOptions(entry.durationMin)}</select>
            </label>
            <label class="edit-field">
              <span class="edit-label">标签</span>
              <input class="field" name="tags" value="${U.esc((entry.tags || []).join(' '))}" placeholder="#标签，空格分隔">
            </label>
          </div>
        </form>`,
      footer: `
        <div class="modal-foot-actions">
          <button class="btn ghost" type="button" data-convert-task>转成任务</button>
          <button class="btn ghost" type="button" data-to-snippet>存为片段</button>
        </div>
        <div class="modal-foot-actions">
          <button class="btn ghost" type="button" data-cancel>取消</button>
          <button class="btn primary" type="submit" form="${formId}">保存</button>
        </div>`,
      onMount(el, close) {
        const form = el.querySelector('form');
        const values = () => {
          const fd = new FormData(form);
          const entryDate = String(fd.get('entryDate') || entry.entryDate);
          const occurredTime = String(fd.get('occurredTime') || timeOf(entry.occurredAt));
          return {
            content: String(fd.get('content') || '').trim(),
            kind: String(fd.get('kind') || 'log'),
            projectId: String(fd.get('projectId') || '') || null,
            tags: WB.util.splitTags(fd.get('tags')),
            durationMin: fd.get('durationMin') || null,
            entryDate,
            occurredAt: dateTimeToTs(entryDate, occurredTime),
          };
        };
        const save = async () => {
          const payload = values();
          if (!payload.content) {
            WB.toast('先写一句吧。', { type: 'error' });
            form.querySelector('[name="content"]').focus();
            return null;
          }
          const updated = await WB.api.call('entries.update', { id: entry.id, ...payload });
          WB.toast('已保存');
          if (typeof opts.onSaved === 'function') opts.onSaved(updated);
          return updated;
        };
        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          const button = el.querySelector('[type="submit"]');
          button.disabled = true;
          try {
            await save();
            close();
          } catch {
            button.disabled = false;
          }
        });
        el.querySelector('[data-cancel]').addEventListener('click', close);
        el.querySelector('[data-convert-task]').addEventListener('click', async (event) => {
          event.currentTarget.disabled = true;
          try {
            const payload = values();
            const updated = await save();
            await WB.api.call('tasks.create', {
              title: payload.content.slice(0, 200),
              note: payload.content,
              projectId: updated ? updated.projectId : payload.projectId,
              plannedDate: U.todayKey(),
            });
            WB.toast('已转成今天的任务');
            close();
          } catch {
            event.currentTarget.disabled = false;
          }
        });
        el.querySelector('[data-to-snippet]').addEventListener('click', async (event) => {
          event.currentTarget.disabled = true;
          try {
            const payload = values();
            await WB.api.call('snippets.create', {
              title: payload.content.split('\n')[0].slice(0, 80),
              content: payload.content,
              tags: payload.tags,
            });
            WB.toast('已存进片段库');
            close();
          } catch {
            event.currentTarget.disabled = false;
          }
        });
      },
    });
    return modal;
  };

  // ---- edit task ----------------------------------------------------------
  WB.openTaskEditor = async function (id, options) {
    const opts = options || {};
    let task;
    try {
      task = await WB.api.call('tasks.get', { id });
    } catch {
      return null;
    }
    const formId = 'task-edit-' + Math.random().toString(36).slice(2);
    const modal = WB.openModal({
      kicker: '任务',
      title: '编辑任务',
      body: `
        <form id="${formId}" class="edit-form" data-task-form>
          <label class="edit-field">
            <span class="edit-label">标题</span>
            <input class="field" name="title" value="${U.esc(task.title)}" maxlength="200" autofocus required>
          </label>
          <label class="edit-field">
            <span class="edit-label">备注</span>
            <textarea class="field edit-textarea" name="note" rows="3" maxlength="2000">${U.esc(task.note || '')}</textarea>
          </label>
          <div class="edit-grid">
            <label class="edit-field">
              <span class="edit-label">状态</span>
              <select class="field" name="status">
                ${[['inbox', '收集箱'], ['todo', '待办'], ['doing', '进行中'], ['done', '已完成'], ['dropped', '已放弃']]
                  .map(([value, label]) => `<option value="${value}"${task.status === value ? ' selected' : ''}>${label}</option>`).join('')}
              </select>
            </label>
            <label class="edit-field">
              <span class="edit-label">优先级</span>
              <select class="field" name="priority">
                ${[['0', '低'], ['1', '中'], ['2', '高'], ['3', '紧急']]
                  .map(([value, label]) => `<option value="${value}"${Number(task.priority) === Number(value) ? ' selected' : ''}>${label}</option>`).join('')}
              </select>
            </label>
            <label class="edit-field">
              <span class="edit-label">计划日期</span>
              <input class="field" type="date" name="plannedDate" value="${U.esc(task.plannedDate || '')}">
            </label>
            <label class="edit-field">
              <span class="edit-label">截止日期</span>
              <input class="field" type="date" name="dueDate" value="${U.esc(task.dueDate || '')}">
            </label>
            <label class="edit-field">
              <span class="edit-label">项目</span>
              <select class="field" name="projectId">${WB.projectOptions(task.projectId, {
                projectId: task.projectId,
                projectName: task.projectName,
              })}</select>
            </label>
            <label class="edit-field">
              <span class="edit-label">预计耗时</span>
              <select class="field" name="estimateMin">${WB.durationOptions(task.estimateMin)}</select>
            </label>
          </div>
        </form>`,
      footer: `
        <div class="modal-foot-actions">
          <button class="btn ghost" type="button" data-convert-entry>转成记录</button>
        </div>
        <div class="modal-foot-actions">
          <button class="btn ghost" type="button" data-cancel>取消</button>
          <button class="btn primary" type="submit" form="${formId}">保存</button>
        </div>`,
      onMount(el, close) {
        const form = el.querySelector('form');
        const values = () => {
          const fd = new FormData(form);
          return {
            title: String(fd.get('title') || '').trim(),
            note: String(fd.get('note') || ''),
            status: String(fd.get('status') || 'inbox'),
            priority: Number(fd.get('priority') || 1),
            plannedDate: String(fd.get('plannedDate') || '') || null,
            dueDate: String(fd.get('dueDate') || '') || null,
            projectId: String(fd.get('projectId') || '') || null,
            estimateMin: fd.get('estimateMin') || null,
          };
        };
        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          const payload = values();
          if (!payload.title) {
            WB.toast('先写一件要做的事。', { type: 'error' });
            return;
          }
          const button = el.querySelector('[type="submit"]');
          button.disabled = true;
          try {
            const updated = await WB.api.call('tasks.update', { id: task.id, ...payload });
            WB.toast('任务已保存');
            if (typeof opts.onSaved === 'function') opts.onSaved(updated);
            close();
          } catch {
            button.disabled = false;
          }
        });
        el.querySelector('[data-cancel]').addEventListener('click', close);
        el.querySelector('[data-convert-entry]').addEventListener('click', async (event) => {
          event.currentTarget.disabled = true;
          try {
            const payload = values();
            await WB.api.call('entries.create', {
              content: payload.title,
              kind: 'log',
              projectId: payload.projectId,
              durationMin: payload.estimateMin ? Number(payload.estimateMin) : null,
              entryDate: U.todayKey(),
              occurredAt: Date.now(),
            });
            WB.toast('已记到今天的记录里');
            close();
          } catch {
            event.currentTarget.disabled = false;
          }
        });
      },
    });
    return modal;
  };

  // ---- project detail -----------------------------------------------------
  WB.openProjectDetail = async function (id, options) {
    const opts = options || {};
    let project;
    let entries;
    let tasks;
    try {
      [project, entries, tasks] = await Promise.all([
        WB.api.call('projects.get', { id }),
        WB.api.call('entries.list', { projectId: id, limit: 8 }),
        WB.api.call('tasks.list', { view: 'all', projectId: id, includeDone: false }),
      ]);
    } catch {
      return null;
    }
    const formId = 'project-edit-' + Math.random().toString(36).slice(2);
    const entryRows = entries.items.length
      ? entries.items.map((entry) => `
          <li class="detail-entry">
            <span class="detail-date">${U.esc(U.fmtShort(entry.entryDate))}</span>
            <span class="detail-text">${U.esc(entry.content)}</span>
          </li>`).join('')
      : '<li class="mini-empty">项目下还没有记录。</li>';
    const taskRows = tasks.items.length
      ? tasks.items.slice(0, 8).map((task) => `
          <li class="detail-entry">
            <span class="kind">${task.status === 'doing' ? '进行中' : '待办'}</span>
            <span class="detail-text">${U.esc(task.title)}</span>
          </li>`).join('')
      : '<li class="mini-empty">没有未完成的任务。</li>';

    WB.openModal({
      kicker: '项目',
      title: project.name,
      className: 'modal-project',
      body: `
        <div class="stat-strip detail-stats">
          ${WB.statCard(project.weekEntryCount || 0, '条本周记录')}
          ${WB.statCard(project.openTaskCount, '个未完成')}
          ${WB.statCard(project.lastEntryAt ? U.fmtShort(U.dateKeyOf(new Date(project.lastEntryAt))) : '—', '最近记录')}
        </div>
        <form id="${formId}" class="edit-form project-edit-form">
          <div class="edit-grid">
            <label class="edit-field">
              <span class="edit-label">项目名</span>
              <input class="field" name="name" value="${U.esc(project.name)}" maxlength="40" required>
            </label>
            <label class="edit-field">
              <span class="edit-label">颜色</span>
              <div class="swatches">${WB.colorSwatches(project.color)}</div>
            </label>
          </div>
          <label class="edit-field">
            <span class="edit-label">描述</span>
            <textarea class="field edit-textarea" name="description" rows="2" maxlength="400">${U.esc(project.description || '')}</textarea>
          </label>
        </form>
        <div class="detail-columns">
          <section>
            <h3 class="detail-title">最近记录</h3>
            <ul class="detail-list">${entryRows}</ul>
          </section>
          <section>
            <h3 class="detail-title">未完成任务</h3>
            <ul class="detail-list">${taskRows}</ul>
          </section>
        </div>`,
      footer: `
        <div class="modal-foot-actions">
          <button class="btn ghost" type="button" data-project-filter>在记录中查看</button>
        </div>
        <div class="modal-foot-actions">
          <button class="btn ghost" type="button" data-cancel>取消</button>
          <button class="btn primary" type="submit" form="${formId}">保存项目</button>
        </div>`,
      onMount(el, close) {
        const form = el.querySelector('form');
        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          const fd = new FormData(form);
          const button = el.querySelector('[type="submit"]');
          button.disabled = true;
          try {
            const updated = await WB.api.call('projects.update', {
              id: project.id,
              name: String(fd.get('name') || '').trim(),
              description: String(fd.get('description') || ''),
              color: String(fd.get('color') || 'moss'),
            });
            WB.toast('项目已保存');
            if (typeof opts.onSaved === 'function') opts.onSaved(updated);
            close();
          } catch {
            button.disabled = false;
          }
        });
        el.querySelector('[data-cancel]').addEventListener('click', close);
        el.querySelector('[data-project-filter]').addEventListener('click', () => {
          close();
          if (typeof WB.goFiltered === 'function') {
            WB.goFiltered({ projectId: project.id });
          } else {
            location.hash = `#/journal?projectId=${encodeURIComponent(project.id)}`;
          }
        });
      },
    });
  };
})(window.WB = window.WB || {});
