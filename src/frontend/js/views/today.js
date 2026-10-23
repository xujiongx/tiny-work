(function (WB) {
  const U = WB.util;
  const V = WB.views = WB.views || {};

  const DURATIONS = [
    ['', '耗时'], ['15', '15 分钟'], ['30', '30 分钟'], ['45', '45 分钟'],
    ['60', '1 小时'], ['90', '1.5 小时'], ['120', '2 小时'], ['180', '3 小时'],
  ];

  function kindOptions(selected) {
    return WB.kinds.map((kind) => (
      `<option value="${kind.id}"${kind.id === selected ? ' selected' : ''}>${kind.label}</option>`
    )).join('');
  }

  function projectOptions(projects) {
    return ['<option value="">未归类</option>'].concat(
      projects.map((project) => (
        `<option value="${U.esc(project.id)}">${U.esc(project.name)}</option>`
      ))
    ).join('');
  }

  function durationOptions() {
    return DURATIONS.map(([value, label]) => (
      `<option value="${value}">${label}</option>`
    )).join('');
  }

  function scoreOptions(selected) {
    const labels = ['未记录', '1 · 很低', '2 · 低', '3 · 一般', '4 · 好', '5 · 很好'];
    return labels.map((label, index) => {
      const value = index === 0 ? '' : String(index);
      return `<option value="${value}"${String(selected || '') === value ? ' selected' : ''}>${label}</option>`;
    }).join('');
  }

  V.today = {
    el: null,
    date: U.todayKey(),

    async render(root, ctx) {
      const date = ctx.date || U.todayKey();
      const settings = WB.store.state.settings || {};
      const projects = WB.store.state.projects || [];
      const isToday = date === U.todayKey();
      this.date = date;

      root.innerHTML = `
        <div class="view">
          <div class="page">
            <header class="page-head">
              <div>
                <p class="page-kicker">${U.esc(U.weekdayCN(date))}${isToday ? ' · 今天' : ' · 补记'}</p>
                <h1 class="page-title">${U.esc(U.fmtHead(date))}</h1>
                <p class="page-sub" data-sub>正在读取今天…</p>
              </div>
              <div class="head-actions">
                <button class="btn ghost icon-btn" type="button" data-nav="-1" title="前一天">‹</button>
                <button class="btn ghost" type="button" data-today>今天</button>
                <button class="btn ghost icon-btn" type="button" data-nav="1" title="后一天">›</button>
              </div>
            </header>

            <div class="today-grid">
              <div class="today-main">
                <form class="capture" data-capture>
                  <label class="sr-only" for="capture-text">今天做了什么</label>
                  <textarea class="capture-input" id="capture-text" data-capture-text rows="2" maxlength="4000"
                            placeholder="${isToday ? '今天做了什么？' : '补记这一天做了什么…'}"
                            autocomplete="off"></textarea>
                  <div class="capture-row">
                    <select class="field" data-kind aria-label="记录类型">
                      ${kindOptions(settings.defaultKind || 'log')}
                    </select>
                    <select class="field" data-project aria-label="项目">
                      ${projectOptions(projects)}
                    </select>
                    <input class="field field-tags" data-tags placeholder="#标签，逗号分隔" autocomplete="off" aria-label="标签">
                    <select class="field" data-duration aria-label="耗时">
                      ${durationOptions()}
                    </select>
                    <span class="capture-hint">↵ 保存 · ⇧↵ 换行</span>
                    <button class="btn primary" type="submit">记下</button>
                  </div>
                </form>

                <section class="block">
                  <header class="block-head">
                    <h2>今日记录</h2>
                    <span class="count" data-count>—</span>
                  </header>
                  <div class="timeline" data-slot="timeline">${WB.miniEmpty('读取中…')}</div>
                </section>
              </div>

              <aside class="today-side">
                <section class="block">
                  <header class="block-head">
                    <h2>今日待办</h2>
                    <span class="count" data-task-count></span>
                  </header>
                  <div data-slot="tasks">${WB.miniEmpty('读取中…')}</div>
                  <form class="inline-add" data-task-form>
                    <input class="field" data-task-input placeholder="添加今天的待办…"
                           maxlength="200" autocomplete="off" aria-label="添加今日待办">
                  </form>
                </section>

                <section class="block">
                  <header class="block-head"><h2>今日概览</h2></header>
                  <div data-slot="overview">${WB.miniEmpty('读取中…')}</div>
                </section>

                <section class="block focus-card">
                  <header class="block-head">
                    <h2>专注</h2>
                    <span class="count" data-focus-state></span>
                  </header>
                  <div data-slot="focus">${WB.miniEmpty('读取中…')}</div>
                </section>

                <section class="block daily-card">
                  <header class="block-head"><h2>日报</h2></header>
                  <div data-slot="daily">${WB.miniEmpty('读取中…')}</div>
                </section>
              </aside>
            </div>
          </div>
        </div>`;

      const el = root.firstElementChild;
      this.el = el;

      el.querySelectorAll('[data-nav]').forEach((button) => {
        button.addEventListener('click', () => {
          WB.go('today', U.addDays(date, Number(button.dataset.nav)));
        });
      });
      el.querySelector('[data-today]').addEventListener('click', () => WB.go('today', U.todayKey()));

      const input = el.querySelector('[data-capture-text]');
      U.autoGrow(input);
      input.addEventListener('input', () => U.autoGrow(input));
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey && !U.isComposing(event)) {
          event.preventDefault();
          submitCapture();
        }
      });

      const submitCapture = async () => {
        const content = input.value.trim();
        if (!content) {
          input.focus();
          input.classList.remove('is-nudge');
          void input.offsetWidth;
          input.classList.add('is-nudge');
          return;
        }
        const button = el.querySelector('[type="submit"]');
        button.disabled = true;
        try {
          await WB.api.call('entries.create', {
            content,
            kind: el.querySelector('[data-kind]').value,
            projectId: el.querySelector('[data-project]').value || null,
            tags: el.querySelector('[data-tags]').value,
            durationMin: el.querySelector('[data-duration]').value || null,
            entryDate: date,
          });
          input.value = '';
          el.querySelector('[data-tags]').value = '';
          el.querySelector('[data-duration]').value = '';
          U.autoGrow(input);
          input.focus();
          await V.today.load();
          WB.toast('已记录');
        } catch {
          input.focus();
        } finally {
          button.disabled = false;
        }
      };

      el.querySelector('[data-capture]').addEventListener('submit', (event) => {
        event.preventDefault();
        submitCapture();
      });

      el.querySelector('[data-task-form]').addEventListener('submit', async (event) => {
        event.preventDefault();
        const field = el.querySelector('[data-task-input]');
        const title = field.value.trim();
        if (!title) {
          field.focus();
          return;
        }
        try {
          await WB.api.call('tasks.create', { title, plannedDate: date });
          field.value = '';
          await V.today.load();
        } catch {
          field.focus();
        }
      });

      el.addEventListener('click', async (event) => {
        const editEntryBtn = event.target.closest('[data-entry-edit]');
        if (editEntryBtn) {
          await WB.openEntryEditor(editEntryBtn.dataset.entryEdit, {
            onSaved: () => V.today.load(),
          });
          return;
        }

        const deleteEntryBtn = event.target.closest('[data-entry-del]');
        if (deleteEntryBtn) {
          const id = deleteEntryBtn.dataset.entryDel;
          deleteEntryBtn.disabled = true;
          try {
            await WB.api.call('entries.remove', { id });
            await V.today.load();
            const undo = async () => {
              await WB.api.call('entries.restore', { id });
              await V.today.load();
            };
            WB.setUndo('删除记录', undo);
            WB.toast('已删除', { actionLabel: '撤销', onAction: undo });
          } catch {
            deleteEntryBtn.disabled = false;
          }
          return;
        }

        const editTaskBtn = event.target.closest('[data-task-edit], [data-task-open]');
        if (editTaskBtn) {
          const id = editTaskBtn.dataset.taskEdit || editTaskBtn.dataset.taskOpen;
          await WB.openTaskEditor(id, { onSaved: () => V.today.load() });
          return;
        }

        const toggle = event.target.closest('[data-task-toggle]');
        if (toggle) {
          const id = toggle.dataset.taskToggle;
          const wasDone = toggle.getAttribute('aria-pressed') === 'true';
          toggle.disabled = true;
          try {
            await WB.api.call('tasks.toggle', { id, done: !wasDone });
            await V.today.load();
            if (!wasDone) {
              const undo = async () => {
                await WB.api.call('tasks.toggle', { id, done: false });
                await V.today.load();
              };
              WB.setUndo('完成任务', undo);
              WB.toast('完成了', { actionLabel: '撤销', onAction: undo });
            }
          } catch {
            toggle.disabled = false;
          }
          return;
        }

        const focusStart = event.target.closest('[data-focus-start]');
        if (focusStart) {
          await V.today.startFocus(
            Number(el.querySelector('[data-focus-minutes]').value),
            el.querySelector('[data-focus-project]').value || null
          );
          return;
        }

        const focusStop = event.target.closest('[data-focus-stop]');
        if (focusStop) {
          await V.today.stopFocus(focusStop.dataset.focusStop === 'abandon');
          return;
        }

        if (event.target.closest('[data-daily-open]')) {
          V.today.openDaily(date);
        }
      });

      el.addEventListener('dblclick', (event) => {
        const content = event.target.closest('.tl-content');
        if (!content) return;
        const item = content.closest('[data-entry]');
        if (item) WB.openEntryEditor(item.dataset.entry, { onSaved: () => V.today.load() });
      });

      await this.load();
      await this.loadFocus();
      await this.loadDaily();
      if (date === U.todayKey()) input.focus();
      if (WB.pendingDaily) {
        const pending = WB.pendingDaily;
        WB.pendingDaily = null;
        if (pending === date) this.openDaily(date);
      }
    },

    async load() {
      const el = this.el;
      if (!el || !el.isConnected) return;
      const date = this.date;

      let timeline;
      let tasks;
      try {
        [timeline, tasks] = await Promise.all([
          WB.api.call('entries.timeline', { date }),
          WB.api.call('tasks.list', { view: 'today', date }),
        ]);
      } catch {
        return;
      }

      const sub = el.querySelector('[data-sub]');
      const streak = WB.store.state.counts.streak || 0;
      const isToday = date === U.todayKey();
      this.stats = timeline.stats;
      sub.textContent = isToday
        ? `连续记录 ${streak} 天 · 今天已经写了 ${timeline.stats.count} 条`
        : `这一天共 ${timeline.stats.count} 条记录`;

      el.querySelector('[data-count]').textContent = `${timeline.stats.count} 条`;
      el.querySelector('[data-slot="timeline"]').innerHTML = timeline.items.length
        ? timeline.items.map((entry) => WB.entryHTML(entry)).join('')
        : WB.emptyState('今天还没有记录。', '写下第一句吧。');

      const openTasks = tasks.items.filter((task) => task.status !== 'done');
      el.querySelector('[data-task-count]').textContent = openTasks.length ? `${openTasks.length} 个` : '';
      el.querySelector('[data-slot="tasks"]').innerHTML = openTasks.length
        ? openTasks.map((task) => WB.taskHTML(task)).join('')
        : WB.miniEmpty('今天还没有安排。');

      const overview = el.querySelector('[data-slot="overview"]');
      const projects = timeline.stats.projects || [];
      overview.innerHTML = `
        <div class="stat-strip">
          ${WB.statCard(timeline.stats.count, '条记录')}
          ${WB.statCard(timeline.stats.done, '完成')}
          ${WB.statCard(U.fmtMinutes(timeline.stats.minutes), '投入')}
        </div>
        ${projects.length ? `
          <div class="mini-projects">
            ${projects.map((project) => `
              <span class="mini-project">${WB.projectDot(project.color)}${U.esc(project.name)}<span class="num">${project.count}</span></span>
            `).join('')}
          </div>` : '<p class="muted small" style="margin-top:14px">还没有关联项目。</p>'}
      `;
    },

    async loadFocus() {
      const el = this.el;
      if (!el || !el.isConnected) return;
      const slot = el.querySelector('[data-slot="focus"]');
      if (!slot) return;
      let session;
      try {
        session = await WB.api.call('focus.current', {}, { silent: true });
      } catch {
        slot.innerHTML = WB.miniEmpty('专注不可用。');
        return;
      }
      this.focusSession = session;
      this.renderFocus(session);
    },

    renderFocus(session) {
      const el = this.el;
      if (!el || !el.isConnected) return;
      const slot = el.querySelector('[data-slot="focus"]');
      const state = el.querySelector('[data-focus-state]');
      if (!slot) return;
      const settings = WB.store.state.settings || {};
      if (session) {
        const project = session.projectName
          ? `${WB.projectDot(session.projectColor)}${U.esc(session.projectName)}`
          : '未归类';
        state.textContent = '进行中';
        slot.innerHTML = `
          <div class="focus-running">
            <p class="focus-time" data-focus-time>--:--</p>
            <p class="focus-meta">${project}<span>计划 ${session.plannedMin} 分钟</span></p>
            <div class="focus-actions">
              <button class="btn primary" type="button" data-focus-stop="done">结束并记录</button>
              <button class="btn ghost" type="button" data-focus-stop="abandon">放弃</button>
            </div>
          </div>`;
        this.tickFocus();
        this.ensureFocusTimer();
      } else {
        state.textContent = '';
        if (WB.setFocusTray) WB.setFocusTray('');
        const minutes = Number(settings.focusMinutes) || 25;
        const choices = [15, 25, 45, 50, 90].includes(minutes)
          ? [15, 25, 45, 50, 90]
          : [minutes, 15, 25, 45, 50, 90].sort((a, b) => a - b);
        slot.innerHTML = `
          <div class="focus-idle">
            <p class="muted small">选一段时间，只做一件事。</p>
            <div class="focus-controls">
              <select class="field" data-focus-minutes aria-label="专注时长">
                ${choices.map((value) => `<option value="${value}"${value === minutes ? ' selected' : ''}>${value} 分钟</option>`).join('')}
              </select>
              <select class="field" data-focus-project aria-label="专注项目">
                ${WB.projectOptions('')}
              </select>
              <button class="btn primary" type="button" data-focus-start>开始</button>
            </div>
          </div>`;
      }
    },

    ensureFocusTimer() {
      if (this.focusTimer) return;
      this.focusTimer = setInterval(() => this.tickFocus(), 1000);
    },

    tickFocus() {
      const session = this.focusSession;
      if (!session) {
        if (this.focusTimer) clearInterval(this.focusTimer);
        this.focusTimer = null;
        return;
      }
      const remaining = Math.max(
        0,
        session.plannedMin * 60 - Math.floor((Date.now() - session.startedAt) / 1000)
      );
      const el = this.el;
      if (el && el.isConnected) {
        const node = el.querySelector('[data-focus-time]');
        if (node) {
          node.textContent = `${U.pad2(Math.floor(remaining / 60))}:${U.pad2(remaining % 60)}`;
        }
      }
      if (WB.setFocusTray && remaining > 0) {
        WB.setFocusTray(`专注 ${U.pad2(Math.floor(remaining / 60))}:${U.pad2(remaining % 60)}`);
      }
      if (remaining <= 0 && !this.stoppingFocus) {
        this.stoppingFocus = true;
        this.stopFocus(false, true).finally(() => { this.stoppingFocus = false; });
      }
    },

    async startFocus(minutes, projectId) {
      try {
        const session = await WB.api.call('focus.start', { minutes, projectId });
        this.focusSession = session;
        this.renderFocus(session);
        WB.toast('专注开始，先做这一件事。');
      } catch {
        // The reason is already shown.
      }
    },

    async stopFocus(abandoned, automatic) {
      if (this.focusTimer) clearInterval(this.focusTimer);
      this.focusTimer = null;
      if (WB.setFocusTray) WB.setFocusTray('');
      try {
        const session = await WB.api.call('focus.stop', {
          id: this.focusSession ? this.focusSession.id : undefined,
          abandoned: Boolean(abandoned),
        });
        this.focusSession = null;
        WB.toast(abandoned
          ? '已放弃这次专注'
          : `专注 ${session.actualMin} 分钟已记入记录`);
        await this.loadFocus();
        if (!abandoned) await this.load();
      } catch {
        await this.loadFocus();
      }
      if (automatic) {
        // Keep the completion toast once, even if the user has navigated away.
        WB.toast('专注完成，已自动记入今天的记录');
      }
    },

    async loadDaily() {
      const el = this.el;
      if (!el || !el.isConnected) return;
      const slot = el.querySelector('[data-slot="daily"]');
      if (!slot) return;
      let daily;
      try {
        daily = await WB.api.call('daily.get', { date: this.date }, { silent: true });
      } catch {
        slot.innerHTML = WB.miniEmpty('日报读取失败。');
        return;
      }
      this.daily = daily;
      const hasContent = daily.exists && (
        daily.summary || daily.highlights.length || daily.blockers.length || daily.planNext.length
      );
      slot.innerHTML = hasContent
        ? `
          <p class="daily-summary">${U.esc(daily.summary || daily.highlights[0] || '已经写过日报。').slice(0, 120)}</p>
          ${daily.highlights.length ? `<p class="muted small">${daily.highlights.length} 条亮点 · ${daily.blockers.length} 条阻塞</p>` : ''}
          <button class="btn ghost" type="button" data-daily-open>查看 / 修改日报</button>`
        : `
          <p class="muted small">花 2 分钟，给今天一个句号。</p>
          <button class="btn ghost" type="button" data-daily-open>写今天的日报</button>`;
    },

    openDaily(date) {
      const target = date || this.date;
      const view = this;
      let timer = null;
      let flush = null;
      WB.api.call('daily.get', { date: target }).then((daily) => {
        WB.openDrawer({
          kicker: U.fmtHead(target),
          title: '日报',
          sub: daily.exists ? `上次保存 ${U.fmtDateTime(daily.updatedAt)}` : '从今天的记录开始，也可以直接写。',
          body: `
            <div class="daily-form">
              <label class="edit-field">
                <span class="edit-label">今天的一句话</span>
                <textarea class="field edit-textarea" data-daily-summary rows="3" maxlength="4000"
                          placeholder="今天最想记住的是什么？">${U.esc(daily.summary)}</textarea>
              </label>
              <label class="edit-field">
                <span class="edit-label">亮点（每行一条）</span>
                <textarea class="field edit-textarea" data-daily-highlights rows="4"
                          placeholder="完成了什么、推进了什么">${U.esc((daily.highlights || []).join('\n'))}</textarea>
              </label>
              <label class="edit-field">
                <span class="edit-label">阻塞与风险（每行一条）</span>
                <textarea class="field edit-textarea" data-daily-blockers rows="3"
                          placeholder="卡在哪里、需要谁帮忙">${U.esc((daily.blockers || []).join('\n'))}</textarea>
              </label>
              <label class="edit-field">
                <span class="edit-label">明天计划（每行一条）</span>
                <textarea class="field edit-textarea" data-daily-plan rows="3"
                          placeholder="明天先做哪几件事">${U.esc((daily.planNext || []).join('\n'))}</textarea>
              </label>
              <div class="edit-grid daily-scores">
                <label class="edit-field">
                  <span class="edit-label">心情</span>
                  <select class="field" data-daily-mood>${scoreOptions(daily.mood)}</select>
                </label>
                <label class="edit-field">
                  <span class="edit-label">精力</span>
                  <select class="field" data-daily-energy>${scoreOptions(daily.energy)}</select>
                </label>
              </div>
            </div>`,
          footer: `
            <div class="modal-foot-actions">
              <button class="btn ghost" type="button" data-daily-generate>从今日记录生成</button>
              <button class="btn ghost ai-action" type="button" data-daily-ai>AI 生成</button>
              <button class="btn ghost" type="button" data-daily-remove>清空</button>
              <span class="save-state" data-daily-state>${daily.exists ? '已保存' : '还没保存'}</span>
            </div>
            <div class="modal-foot-actions">
              <button class="btn ghost" type="button" data-daily-close>关闭</button>
              <button class="btn primary" type="button" data-daily-save>保存</button>
            </div>`,
          onMount(el, close) {
            const state = el.querySelector('[data-daily-state]');
            let dirty = false;
            const collect = () => ({
              date: target,
              patch: {
                summary: el.querySelector('[data-daily-summary]').value,
                highlights: el.querySelector('[data-daily-highlights]').value,
                blockers: el.querySelector('[data-daily-blockers]').value,
                planNext: el.querySelector('[data-daily-plan]').value,
                mood: el.querySelector('[data-daily-mood]').value,
                energy: el.querySelector('[data-daily-energy]').value,
              },
            });
            const save = async (quiet) => {
              clearTimeout(timer);
              const payload = collect();
              try {
                await WB.api.call('daily.save', payload, { silent: Boolean(quiet) });
                dirty = false;
                state.textContent = `已保存 · ${U.fmtTime(Date.now())}`;
                if (view.date === target) view.loadDaily();
                return true;
              } catch {
                state.textContent = '保存失败，内容还在';
                return false;
              }
            };
            const debounced = U.debounce(() => save(true), 800);
            flush = () => (dirty ? save(true) : Promise.resolve(true));
            el.querySelectorAll('textarea, select').forEach((field) => {
              const dirtyNow = () => {
                dirty = true;
                state.textContent = '正在保存…';
                debounced();
              };
              field.addEventListener('input', dirtyNow);
              field.addEventListener('change', dirtyNow);
            });
            el.querySelector('[data-daily-save]').addEventListener('click', async (event) => {
              event.currentTarget.disabled = true;
              await save(false);
              event.currentTarget.disabled = false;
            });
            el.querySelector('[data-daily-close]').addEventListener('click', () => { close(); });
            el.querySelector('[data-daily-remove]').addEventListener('click', async (event) => {
              const confirmed = await tiny.dialog.confirm('清空这一天的日报？', {
                detail: '只会删除日报内容，记录和任务不会受影响。',
                ok: '清空',
                cancel: '取消',
              });
              if (!confirmed) return;
              event.currentTarget.disabled = true;
              try {
                clearTimeout(timer);
                dirty = false;
                flush = null;
                await WB.api.call('daily.remove', { date: target });
                WB.toast('日报已清空');
                close();
                if (view.date === target) view.loadDaily();
              } catch {
                event.currentTarget.disabled = false;
              }
            });
            el.querySelector('[data-daily-generate]').addEventListener('click', async (event) => {
              const button = event.currentTarget;
              button.disabled = true;
              try {
                const generated = await WB.api.call('daily.generate', { date: target });
                const highlightsField = el.querySelector('[data-daily-highlights]');
                const blockersField = el.querySelector('[data-daily-blockers]');
                if (highlightsField.value.trim() || blockersField.value.trim()) {
                  const overwrite = await tiny.dialog.confirm('覆盖已经写好的亮点和阻塞？', {
                    detail: '会用今天的记录重新生成这两栏，其他内容不变。',
                    ok: '覆盖',
                    cancel: '取消',
                  });
                  if (!overwrite) return;
                }
                highlightsField.value = generated.highlights.join('\n');
                blockersField.value = generated.blockers.join('\n');
                const summaryField = el.querySelector('[data-daily-summary]');
                if (!summaryField.value.trim()) {
                  summaryField.value = `今天记录了 ${generated.entryCount} 条，完成 ${generated.highlights.length} 条。`;
                }
                dirty = true;
                await save(true);
                WB.toast('已从今日记录填入亮点和阻塞');
              } finally {
                button.disabled = false;
              }
            });

            el.querySelector('[data-daily-ai]').addEventListener('click', async (event) => {
              const button = event.currentTarget;
              if (!(await WB.ai.ensure())) return;
              await WB.ai.withButton(button, 'AI 生成中…', async () => {
                const generated = await WB.api.call('daily.ai', { date: target });
                const before = collect().patch;
                const writePatch = (patch) => {
                  el.querySelector('[data-daily-summary]').value = patch.summary;
                  el.querySelector('[data-daily-highlights]').value = patch.highlights;
                  el.querySelector('[data-daily-blockers]').value = patch.blockers;
                  el.querySelector('[data-daily-plan]').value = patch.planNext;
                };
                WB.ai.preview({
                  kicker: `AI 建议 · ${U.fmtShort(target)}`,
                  title: '日报草稿',
                  sub: `根据 ${generated.inputStats.entries} 条记录生成。可以直接修改，确认后再填入日报。`,
                  applyLabel: '填入日报',
                  fields: [
                    {
                      key: 'summary',
                      label: '今天的一句话',
                      value: generated.summary,
                      rows: 3,
                      help: '概括今天最有价值的进展，而不是流水账。',
                    },
                    {
                      key: 'highlights',
                      label: '亮点（每行一条）',
                      value: generated.highlights.join('\n'),
                      rows: 5,
                      lines: true,
                    },
                    {
                      key: 'blockers',
                      label: '阻塞与风险（每行一条）',
                      value: generated.blockers.join('\n'),
                      rows: 4,
                      lines: true,
                    },
                    {
                      key: 'planNext',
                      label: '明天计划（每行一条）',
                      value: generated.planNext.join('\n'),
                      rows: 4,
                      lines: true,
                    },
                  ],
                  async onApply(values) {
                    const patch = {
                      summary: values.summary,
                      highlights: values.highlights.join('\n'),
                      blockers: values.blockers.join('\n'),
                      planNext: values.planNext.join('\n'),
                    };
                    writePatch(patch);
                    dirty = true;
                    state.textContent = '正在保存…';
                    await save(true);
                    const undo = async () => {
                      if (!el.isConnected) {
                        await WB.api.call('daily.save', { date: target, patch: before });
                        return;
                      }
                      writePatch(before);
                      dirty = true;
                      await save(true);
                    };
                    WB.setUndo('AI 填入日报', undo);
                    WB.toast('AI 内容已填入日报', { actionLabel: '撤销', onAction: undo });
                  },
                });
              }).catch(() => {});
            });
          },
          async beforeClose() {
            clearTimeout(timer);
            return flush ? flush() : true;
          },
        });
      }).catch(() => {
        // The reason is already shown.
      });
    },

    refresh() {
      if (!this.el || !this.el.isConnected) return undefined;
      return Promise.all([this.load(), this.loadFocus(), this.loadDaily()]);
    },

    renderSub() {
      const el = this.el;
      if (!el || !el.isConnected) return;
      const sub = el.querySelector('[data-sub]');
      if (!sub) return;
      const count = this.stats ? this.stats.count : 0;
      const streak = WB.store.state.counts.streak || 0;
      if (this.date === U.todayKey()) {
        sub.textContent = `连续记录 ${streak} 天 · 今天已经写了 ${count} 条`;
      } else {
        sub.textContent = `这一天共 ${count} 条记录`;
      }
    },
  };

  WB.openDaily = function (date) {
    const view = WB.views.today;
    const target = date || (view && view.date) || U.todayKey();
    if (view && view.el && view.el.isConnected && view.date === target) {
      view.openDaily(target);
      return;
    }
    WB.pendingDaily = target;
    WB.go('today', target);
  };
})(window.WB = window.WB || {});
