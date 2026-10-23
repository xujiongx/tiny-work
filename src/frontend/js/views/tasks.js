(function (WB) {
  const U = WB.util;
  const V = WB.views = WB.views || {};

  const TABS = [
    { id: 'today', label: '今天' },
    { id: 'upcoming', label: '接下来' },
    { id: 'inbox', label: '收集箱' },
    { id: 'done', label: '已完成' },
  ];

  const EMPTY = {
    today: ['今天还没有安排。', '从收集箱挑一件重要的事，或者直接在下方添加。'],
    upcoming: ['接下来是空的。', '有明确日期但今天不做的任务放这里。'],
    inbox: ['收集箱是空的。', '想到什么先丢进来，晚上再整理。'],
    done: ['还没有完成的任务。', '勾掉一件，就会出现在这里。'],
  };

  V.tasks = {
    el: null,
    root: null,
    ctx: null,
    tab: 'today',

    async render(root, ctx) {
      this.root = root;
      this.ctx = ctx;
      const date = ctx.date || U.todayKey();
      const active = this.tab;

      root.innerHTML = `
        <div class="view">
          <div class="page">
            <header class="page-head">
              <div>
                <p class="page-kicker">${U.esc(U.weekdayCN(date))}</p>
                <h1 class="page-title">任务</h1>
                <p class="page-sub">把要做的事放在今天，把想法先丢进收集箱。</p>
              </div>
            </header>

            <div class="tabs" role="tablist" aria-label="任务分组">
              ${TABS.map((tab) => `
                <button class="tab${tab.id === active ? ' is-active' : ''}" type="button"
                        role="tab" aria-selected="${tab.id === active}" data-tab="${tab.id}">
                  ${tab.label}<span class="tab-count" data-tab-count="${tab.id}"></span>
                </button>
              `).join('')}
            </div>

            <section class="block task-block">
              <header class="block-head">
                <h2 data-task-title>${TABS.find((tab) => tab.id === active).label}</h2>
                <span class="count" data-task-count></span>
              </header>
              <div class="task-list" data-slot="list">${WB.miniEmpty('读取中…')}</div>
              ${active === 'done' ? '' : `
                <form class="inline-add task-add" data-add-form>
                  <input class="field" data-add-input maxlength="200" autocomplete="off"
                         placeholder="${this.placeholder(active)}" aria-label="新建任务">
                </form>
              `}
            </section>
          </div>
        </div>`;

      const el = root.firstElementChild;
      this.el = el;

      el.querySelectorAll('[data-tab]').forEach((button) => {
        button.addEventListener('click', () => {
          this.tab = button.dataset.tab;
          this.render(root, ctx);
        });
      });

      const form = el.querySelector('[data-add-form]');
      if (form) {
        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          const field = form.querySelector('[data-add-input]');
          const title = field.value.trim();
          if (!title) {
            field.focus();
            return;
          }
          const params = { title };
          if (active === 'today') {
            params.plannedDate = date;
          } else if (active === 'upcoming') {
            params.plannedDate = U.addDays(date, 1);
          } else if (active === 'inbox') {
            params.status = 'inbox';
          }
          try {
            await WB.api.call('tasks.create', params);
            field.value = '';
            await this.load();
          } catch {
            field.focus();
          }
        });
      }

      el.addEventListener('click', async (event) => {
        const editBtn = event.target.closest('[data-task-edit], [data-task-open]');
        if (editBtn) {
          const id = editBtn.dataset.taskEdit || editBtn.dataset.taskOpen;
          await WB.openTaskEditor(id, { onSaved: () => this.load() });
          return;
        }

        const toggle = event.target.closest('[data-task-toggle]');
        if (toggle) {
          const id = toggle.dataset.taskToggle;
          const wasDone = toggle.getAttribute('aria-pressed') === 'true';
          toggle.disabled = true;
          try {
            await WB.api.call('tasks.toggle', { id, done: !wasDone });
            await this.load();
            if (!wasDone) {
              const undo = async () => {
                await WB.api.call('tasks.toggle', { id, done: false });
                await this.load();
              };
              WB.setUndo('完成任务', undo);
              WB.toast('完成了', { actionLabel: '撤销', onAction: undo });
            }
          } catch {
            toggle.disabled = false;
          }
          return;
        }

        const deleteBtn = event.target.closest('[data-task-del]');
        if (deleteBtn) {
          const id = deleteBtn.dataset.taskDel;
          deleteBtn.disabled = true;
          try {
            await WB.api.call('tasks.remove', { id });
            await this.load();
            const undo = async () => {
              await WB.api.call('tasks.restore', { id });
              await this.load();
            };
            WB.setUndo('删除任务', undo);
            WB.toast('任务已删除', { actionLabel: '撤销', onAction: undo });
          } catch {
            deleteBtn.disabled = false;
          }
        }
      });

      el.addEventListener('dragstart', (event) => {
        const row = event.target.closest('.task-row');
        if (!row) return;
        this.dragId = row.dataset.task;
        row.classList.add('is-dragging');
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', this.dragId);
        }
      });

      el.addEventListener('dragover', (event) => {
        const row = event.target.closest('.task-row');
        if (!row || !this.dragId) return;
        event.preventDefault();
        if (row.dataset.task === this.dragId) return;
        el.querySelectorAll('.is-drop-target').forEach((node) => node.classList.remove('is-drop-target'));
        row.classList.add('is-drop-target');
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
      });

      el.addEventListener('dragleave', (event) => {
        const row = event.target.closest('.task-row');
        if (row) row.classList.remove('is-drop-target');
      });

      el.addEventListener('drop', async (event) => {
        const row = event.target.closest('.task-row');
        if (!row || !this.dragId) return;
        event.preventDefault();
        row.classList.remove('is-drop-target');
        const source = el.querySelector(`.task-row[data-task="${this.dragId}"]`);
        if (source && source !== row) {
          const rect = row.getBoundingClientRect();
          const after = event.clientY > rect.top + rect.height / 2;
          row.parentNode.insertBefore(source, after ? row.nextSibling : row);
          const ids = Array.from(el.querySelectorAll('.task-row')).map((node) => node.dataset.task);
          try {
            await WB.api.call('tasks.reorder', { ids });
            await this.load();
          } catch {
            await this.load();
          }
        }
        this.dragId = null;
      });

      el.addEventListener('dragend', () => {
        this.dragId = null;
        el.querySelectorAll('.is-dragging, .is-drop-target').forEach((node) => {
          node.classList.remove('is-dragging', 'is-drop-target');
        });
      });

      await this.load();
    },

    placeholder(tab) {
      if (tab === 'upcoming') return '添加到接下来的待办…';
      if (tab === 'inbox') return '想到什么先丢进来…';
      return '添加今天的待办，回车保存…';
    },

    async load() {
      const el = this.el;
      if (!el || !el.isConnected) return;
      const date = (this.ctx && this.ctx.date) || U.todayKey();

      let data;
      try {
        data = await WB.api.call('tasks.list', { view: this.tab, date });
      } catch {
        return;
      }

      el.querySelectorAll('[data-tab-count]').forEach((node) => {
        const key = node.dataset.tabCount;
        const n = data.counts[key] || 0;
        node.textContent = n ? String(n) : '';
      });

      const titleMap = {
        today: '今天', upcoming: '接下来', inbox: '收集箱', done: '已完成',
      };
      el.querySelector('[data-task-title]').textContent = titleMap[this.tab];
      el.querySelector('[data-task-count]').textContent = `${data.items.length} 个`;

      const slot = el.querySelector('[data-slot="list"]');
      if (!data.items.length) {
        const [title, text] = EMPTY[this.tab];
        slot.innerHTML = WB.emptyState(title, text);
        return;
      }

      slot.innerHTML = data.items.map((task) => WB.taskHTML(task)).join('');
    },

    refresh() {
      return this.load();
    },
  };
})(window.WB = window.WB || {});
