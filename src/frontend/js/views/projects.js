(function (WB) {
  const U = WB.util;
  const V = WB.views = WB.views || {};

  const COLORS = [
    { id: 'moss', label: '苔绿' },
    { id: 'clay', label: '陶土' },
    { id: 'ochre', label: '赭黄' },
    { id: 'indigo', label: '靛青' },
    { id: 'plum', label: '梅紫' },
  ];

  V.projects = {
    el: null,
    root: null,
    ctx: null,

    async render(root, ctx) {
      this.root = root;
      this.ctx = ctx;

      root.innerHTML = `
        <div class="view">
          <div class="page">
            <header class="page-head">
              <div>
                <p class="page-kicker">记录有归处</p>
                <h1 class="page-title">项目</h1>
                <p class="page-sub">给正在做的事起个名字，记录和待办就能按项目聚起来。</p>
              </div>
            </header>

            <form class="project-create" data-create>
              <input class="field" data-name maxlength="40" autocomplete="off"
                     placeholder="新项目名称，如：工作台" aria-label="项目名称">
              <div class="swatches" role="radiogroup" aria-label="项目颜色">
                ${COLORS.map((color, index) => `
                  <label class="swatch swatch-${color.id}" title="${color.label}">
                    <input type="radio" name="color" value="${color.id}"${index === 0 ? ' checked' : ''}>
                    <span aria-hidden="true"></span>
                    <span class="sr-only">${color.label}</span>
                  </label>
                `).join('')}
              </div>
              <button class="btn primary" type="submit">新建项目</button>
            </form>

            <section class="block">
              <header class="block-head">
                <h2>进行中</h2>
                <span class="count" data-active-count></span>
              </header>
              <div class="project-list" data-slot="active">${WB.miniEmpty('读取中…')}</div>
            </section>

            <section class="block" data-archived-block hidden>
              <header class="block-head">
                <h2>已归档</h2>
                <span class="count" data-archived-count></span>
              </header>
              <div class="project-list is-muted" data-slot="archived"></div>
            </section>
          </div>
        </div>`;

      const el = root.firstElementChild;
      this.el = el;

      const form = el.querySelector('[data-create]');
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const nameField = form.querySelector('[data-name]');
        const name = nameField.value.trim();
        if (!name) {
          nameField.focus();
          return;
        }
        const color = form.querySelector('input[name="color"]:checked').value;
        const button = form.querySelector('[type="submit"]');
        button.disabled = true;
        try {
          await WB.api.call('projects.create', { name, color });
          nameField.value = '';
          await this.reload();
        } catch {
          nameField.focus();
        } finally {
          button.disabled = false;
        }
      });

      el.addEventListener('click', async (event) => {
        const open = event.target.closest('[data-project-open]');
        if (open) {
          await WB.openProjectDetail(open.dataset.projectOpen, { onSaved: () => this.reload() });
          return;
        }

        const archive = event.target.closest('[data-archive]');
        if (archive) {
          const id = archive.dataset.archive;
          const archived = archive.dataset.archived === 'true';
          archive.disabled = true;
          try {
            await WB.api.call('projects.archive', { id, archived: !archived });
            await this.reload();
            WB.toast(archived ? '已恢复项目' : '项目已归档');
          } catch {
            archive.disabled = false;
          }
          return;
        }

        const remove = event.target.closest('[data-remove]');
        if (remove) {
          const id = remove.dataset.remove;
          const name = remove.dataset.name || '这个项目';
          const confirmed = await tiny.dialog.confirm(
            `删除项目“${name}”？`,
            { detail: '项目下的记录和任务不会删除，会变成“未归类”。', ok: '删除', cancel: '取消' }
          );
          if (!confirmed) return;
          remove.disabled = true;
          try {
            await WB.api.call('projects.remove', { id });
            await this.reload();
            WB.toast('项目已删除');
          } catch {
            remove.disabled = false;
          }
        }
      });

      await this.load();
    },

    rangeParams() {
      const settings = WB.store.state.settings || {};
      const weekStart = settings.weekStart === 0 ? 0 : 1;
      const from = U.startOfWeek(U.todayKey(), weekStart);
      return {
        includeArchived: true,
        weekFrom: from,
        weekTo: U.addDays(from, 6),
      };
    },

    async reload() {
      try {
        const data = await WB.api.call('projects.list', this.rangeParams());
        WB.store.set({ projects: data.items.filter((project) => project.status === 'active') });
      } catch {
        // Keep the current list if the refresh fails.
      }
      return this.load();
    },

    async load() {
      const el = this.el;
      if (!el || !el.isConnected) return;

      let data;
      try {
        data = await WB.api.call('projects.list', this.rangeParams());
      } catch {
        return;
      }

      const active = data.items.filter((project) => project.status === 'active');
      const archived = data.items.filter((project) => project.status === 'archived');
      WB.store.set({ projects: active });

      el.querySelector('[data-active-count]').textContent = active.length ? `${active.length} 个` : '';
      el.querySelector('[data-slot="active"]').innerHTML = active.length
        ? active.map((project) => this.row(project, false)).join('')
        : WB.emptyState('还没有项目。', '给正在做的事起个名字，记录才有归处。');

      const block = el.querySelector('[data-archived-block]');
      block.hidden = archived.length === 0;
      el.querySelector('[data-archived-count]').textContent = archived.length ? `${archived.length} 个` : '';
      el.querySelector('[data-slot="archived"]').innerHTML = archived
        .map((project) => this.row(project, true)).join('');
    },

    row(project, archived) {
      const last = project.lastEntryAt ? `最近 ${U.fmtDateTime(project.lastEntryAt)}` : '还没有记录';
      return `
        <article class="project-row" data-project-row="${U.esc(project.id)}">
          <div class="project-main" data-project-open="${U.esc(project.id)}" tabindex="0" role="button"
               aria-label="打开项目 ${U.esc(project.name)}">
            <p class="project-name">${WB.projectDot(project.color)}${U.esc(project.name)}</p>
            <p class="project-meta">
              <span>本周 ${project.weekEntryCount || 0} 条</span>
              <span>${project.openTaskCount} 个待办</span>
              <span>${U.esc(last)}</span>
            </p>
            ${project.description ? `<p class="project-desc">${U.esc(project.description)}</p>` : ''}
          </div>
          <div class="project-actions">
            <button class="btn ghost" type="button" data-project-open="${U.esc(project.id)}">详情</button>
            <button class="btn ghost" type="button" data-archive="${U.esc(project.id)}"
                    data-archived="${archived}">${archived ? '恢复' : '归档'}</button>
            <button class="btn ghost danger-text" type="button" data-remove="${U.esc(project.id)}"
                    data-name="${U.esc(project.name)}">删除</button>
          </div>
        </article>`;
    },

    refresh() {
      return this.load();
    },
  };
})(window.WB = window.WB || {});
