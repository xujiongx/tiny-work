(function (WB) {
  const U = WB.util;
  const V = WB.views = WB.views || {};

  function level(count) {
    if (!count) return 0;
    if (count <= 2) return 1;
    if (count <= 5) return 2;
    if (count <= 8) return 3;
    return 4;
  }

  function statLink(value, label, attrs) {
    return `
      <button class="stat stat-link" type="button" ${attrs || ''}>
        <span class="stat-value">${U.esc(value)}</span>
        <span class="stat-label">${U.esc(label)}</span>
      </button>`;
  }

  V.review = {
    el: null,
    root: null,
    ctx: null,
    mode: 'week',
    weekOffset: 0,
    monthOffset: 0,
    customStart: '',
    customEnd: '',

    currentRange() {
      const settings = WB.store.state.settings || {};
      const weekStart = settings.weekStart === 0 ? 0 : 1;
      if (this.mode === 'range') {
        const base = U.startOfWeek(U.todayKey(), weekStart);
        let start = this.customStart || base;
        let end = this.customEnd || U.addDays(start, 6);
        if (end < start) [start, end] = [end, start];
        this.customStart = start;
        this.customEnd = end;
        return {
          mode: 'range',
          start,
          end,
          label: `${U.fmtShort(start)} – ${U.fmtShort(end)}`,
        };
      }
      if (this.mode === 'month') {
        const month = U.addMonths(U.monthKey(U.todayKey()), this.monthOffset);
        const [year, m] = month.split('-').map(Number);
        const start = `${year}-${U.pad2(m)}-01`;
        const last = new Date(year, m, 0);
        const end = `${year}-${U.pad2(m)}-${U.pad2(last.getDate())}`;
        return { mode: 'month', start, end, month, label: U.monthLabel(month) };
      }
      const base = U.startOfWeek(U.todayKey(), weekStart);
      const start = U.addDays(base, this.weekOffset * 7);
      const end = U.addDays(start, 6);
      return {
        mode: 'week',
        start,
        end,
        label: `${U.fmtShort(start)} – ${U.fmtShort(end)}`,
      };
    },

    async render(root, ctx) {
      this.root = root;
      this.ctx = ctx;
      const range = this.currentRange();
      const offset = this.mode === 'week' ? this.weekOffset : this.mode === 'month' ? this.monthOffset : 0;
      this.range = range;

      root.innerHTML = `
        <div class="view">
          <div class="page">
            <header class="page-head">
              <div>
                <p class="page-kicker">${this.mode === 'range' ? '自定义区间' : offset === 0 ? (this.mode === 'week' ? '本周' : '本月') : '回顾'}</p>
                <h1 class="page-title">回顾</h1>
                <p class="page-sub">看清时间花在了哪里，再把一段时间变成一份能交出去的周报。</p>
              </div>
              <div class="head-actions">
                <div class="tabs period-tabs" role="tablist" aria-label="回顾周期">
                  <button class="tab${this.mode === 'week' ? ' is-active' : ''}" type="button" data-mode="week" role="tab" aria-selected="${this.mode === 'week'}">周</button>
                  <button class="tab${this.mode === 'month' ? ' is-active' : ''}" type="button" data-mode="month" role="tab" aria-selected="${this.mode === 'month'}">月</button>
                  <button class="tab${this.mode === 'range' ? ' is-active' : ''}" type="button" data-mode="range" role="tab" aria-selected="${this.mode === 'range'}">自定义</button>
                </div>
                ${this.mode === 'range' ? `
                  <input class="field range-input" type="date" data-range-start value="${range.start}" aria-label="开始日期">
                  <span class="muted small">至</span>
                  <input class="field range-input" type="date" data-range-end value="${range.end}" aria-label="结束日期">
                ` : `
                  <button class="btn ghost icon-btn" type="button" data-step="-1" title="上一个">‹</button>
                  <span class="week-label">${U.esc(range.label)}</span>
                  <button class="btn ghost icon-btn" type="button" data-step="1" title="下一个">›</button>
                  <button class="btn ghost" type="button" data-step="0">${this.mode === 'week' ? '本周' : '本月'}</button>
                `}
              </div>
            </header>

            <div data-slot="overview">${WB.miniEmpty('读取统计…')}</div>

            <div class="review-grid">
              <section class="block">
                <header class="block-head"><h2>项目分布</h2><span class="count">点击筛选记录</span></header>
                <div data-slot="projects">${WB.miniEmpty('读取中…')}</div>
              </section>
              <section class="block">
                <header class="block-head"><h2>类型分布</h2><span class="count">点击筛选记录</span></header>
                <div data-slot="kinds">${WB.miniEmpty('读取中…')}</div>
              </section>
            </div>

            <section class="block">
              <header class="block-head">
                <h2>记录热力图</h2>
                <span class="count">最近 12 周</span>
              </header>
              <div class="heatmap" data-slot="heatmap">${WB.miniEmpty('读取中…')}</div>
              <div class="cal-legend heat-legend">
                <span>少</span><i class="l0"></i><i class="l1"></i><i class="l2"></i><i class="l3"></i><i class="l4"></i><span>多</span>
              </div>
            </section>

            <section class="block">
              <header class="block-head"><h2>标签</h2></header>
              <div data-slot="tags">${WB.miniEmpty('读取中…')}</div>
            </section>

            <section class="block">
              <header class="block-head"><h2>心情与能量</h2><span class="count">来自日报</span></header>
              <div data-slot="moods">${WB.miniEmpty('读取中…')}</div>
            </section>

            <section class="block report-teaser">
              <header class="block-head"><h2>${this.mode === 'week' ? '周报' : this.mode === 'month' ? '月报' : '区间报告'}</h2></header>
              <p class="muted">按完成、进展、风险、数据、下周计划五部分生成 Markdown 草稿。生成后可以继续改，再复制或导出。</p>
              <button class="btn primary" type="button" data-report>生成${this.mode === 'week' ? '周报' : this.mode === 'month' ? '月报' : '区间报告'}</button>
            </section>
          </div>
        </div>`;

      const el = root.firstElementChild;
      this.el = el;

      el.querySelectorAll('[data-mode]').forEach((button) => {
        button.addEventListener('click', () => {
          this.mode = button.dataset.mode;
          this.render(root, ctx);
        });
      });

      el.querySelectorAll('[data-range-start], [data-range-end]').forEach((input) => {
        input.addEventListener('change', () => {
          const start = el.querySelector('[data-range-start]').value;
          const end = el.querySelector('[data-range-end]').value;
          if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return;
          this.customStart = start;
          this.customEnd = end;
          this.render(root, ctx);
        });
      });

      el.querySelectorAll('[data-step]').forEach((button) => {
        button.addEventListener('click', () => {
          const value = Number(button.dataset.step);
          if (this.mode === 'week') {
            this.weekOffset = value === 0 ? 0 : this.weekOffset + value;
          } else if (this.mode === 'month') {
            this.monthOffset = value === 0 ? 0 : this.monthOffset + value;
          }
          this.render(root, ctx);
        });
      });

      el.addEventListener('click', (event) => {
        if (event.target.closest('[data-report]')) {
          this.openReport();
          return;
        }
        const project = event.target.closest('[data-filter-project]');
        if (project) {
          WB.goFiltered({
            projectId: project.dataset.filterProject,
            from: this.range.start,
            to: this.range.end,
          });
          return;
        }
        const kind = event.target.closest('[data-filter-kind]');
        if (kind) {
          WB.goFiltered({
            kind: kind.dataset.filterKind,
            from: this.range.start,
            to: this.range.end,
          });
          return;
        }
        const stat = event.target.closest('[data-stat]');
        if (stat) {
          WB.goFiltered({ from: this.range.start, to: this.range.end });
        }
      });

      await this.load(range);
    },

    async load(range) {
      const el = this.el;
      if (!el || !el.isConnected) return;
      const settings = WB.store.state.settings || {};
      const weekStart = settings.weekStart === 0 ? 0 : 1;

      let overview;
      let breakdown;
      let heat;
      let moods;
      const heatFrom = U.addDays(U.startOfWeek(range.end, weekStart), -77);
      try {
        [overview, breakdown, heat, moods] = await Promise.all([
          WB.api.call('stats.overview', { from: range.start, to: range.end }),
          WB.api.call('stats.breakdown', { from: range.start, to: range.end }),
          WB.api.call('stats.heatmap', { from: heatFrom, to: range.end }),
          WB.api.call('daily.moods', { from: range.start, to: range.end }, { silent: true })
            .catch(() => ({ items: [] })),
        ]);
      } catch {
        return;
      }

      el.querySelector('[data-slot="overview"]').innerHTML = `
        <div class="stat-strip stat-strip-lg">
          ${statLink(overview.entries, '条记录', 'data-stat="entries"')}
          ${statLink(overview.tasksDone, '完成任务', 'data-stat="tasks"')}
          ${statLink(U.fmtMinutes(overview.minutes), '记录耗时', 'data-stat="minutes"')}
          ${statLink(U.fmtMinutes(overview.focusMin), '专注', 'data-stat="focus"')}
          ${statLink(overview.activeDays, '活跃天', 'data-stat="days"')}
        </div>
        <p class="muted small">当前连续记录 ${overview.streak} 天${overview.entries ? '' : ` · 这${range.mode === 'week' ? '周' : '个月'}还没有记录，先从今天开始。`}</p>
      `;

      const projectTotal = breakdown.byProject.reduce((sum, item) => sum + item.count, 0);
      el.querySelector('[data-slot="projects"]').innerHTML = breakdown.byProject.length
        ? breakdown.byProject.slice(0, 8)
          .map((item) => WB.barRow(
            item.name,
            item.count,
            projectTotal,
            item.color,
            item.id ? `data-filter-project="${U.esc(item.id)}" tabindex="0" role="button" title="筛选这个项目"` : ''
          ))
          .join('')
        : WB.miniEmpty('这段时间还没有记录。');

      const kindTotal = breakdown.byKind.reduce((sum, item) => sum + item.count, 0);
      el.querySelector('[data-slot="kinds"]').innerHTML = breakdown.byKind.length
        ? breakdown.byKind.map((item) => WB.barRow(
          WB.kindLabel(item.name),
          item.count,
          kindTotal,
          '',
          `data-filter-kind="${U.esc(item.name)}" tabindex="0" role="button" title="筛选这个类型"`
        )).join('')
        : WB.miniEmpty('这段时间还没有记录。');

      el.querySelector('[data-slot="tags"]').innerHTML = breakdown.byTag.length
        ? `<div class="tag-cloud">${breakdown.byTag.map((item) => (
          `<button class="chip chip-button" type="button" data-filter-tag="${U.esc(item.name)}">#${U.esc(item.name)} <span>${item.count}</span></button>`
        )).join('')}</div>`
        : WB.miniEmpty('这段时间还没有标签。');

      const moodItems = (moods && moods.items) || [];
      el.querySelector('[data-slot="moods"]').innerHTML = moodItems.length
        ? `<div class="mood-list">${moodItems.map((item) => `
            <div class="mood-row">
              <span class="mood-date">${U.fmtShort(item.date)}</span>
              <span class="mood-label">心情</span>
              <span class="mood-track"><i style="width:${Math.max(0, Math.min(5, item.mood || 0)) * 20}%"></i></span>
              <span class="mood-num">${item.mood == null ? '–' : item.mood}</span>
              <span class="mood-label">能量</span>
              <span class="mood-track is-energy"><i style="width:${Math.max(0, Math.min(5, item.energy || 0)) * 20}%"></i></span>
              <span class="mood-num">${item.energy == null ? '–' : item.energy}</span>
            </div>`).join('')}</div>`
        : WB.miniEmpty('写日报时记下心情，就会出现在这里。');

      el.querySelectorAll('[data-filter-tag]').forEach((button) => {
        button.addEventListener('click', () => {
          WB.goFiltered({
            tag: button.dataset.filterTag,
            from: this.range.start,
            to: this.range.end,
          });
        });
      });

      const counts = {};
      for (const day of heat.days) counts[day.date] = day.count;
      const cells = [];
      let cursor = heatFrom;
      let guard = 0;
      while (cursor <= range.end && guard < 400) {
        const count = counts[cursor] || 0;
        cells.push(
          `<span class="heat heat-l${level(count)}${cursor === U.todayKey() ? ' is-today' : ''}" title="${cursor} · ${count} 条"></span>`
        );
        cursor = U.addDays(cursor, 1);
        guard += 1;
      }
      el.querySelector('[data-slot="heatmap"]').innerHTML = cells.join('');
    },

    async openReport() {
      const range = this.range || this.currentRange();
      const label = range.mode === 'month' ? '月报' : range.mode === 'range' ? '区间报告' : '周报';
      let report;
      try {
        report = await WB.api.call('reports.weekly', {
          start: range.start,
          end: range.end,
          label,
        });
      } catch {
        return;
      }
      if (report.empty) {
        WB.toast(`这${range.mode === 'week' ? '周' : range.mode === 'month' ? '个月' : '段时间'}还没有记录，先写几条再来生成。`);
        return;
      }

      const modal = WB.openModal({
        kicker: range.label,
        title: `${label}草稿`,
        className: 'modal-report',
        body: `
          <p class="muted small report-hint">这份草稿由记录确定性拼接。可以让 AI 根据本期记录重写，再直接改文字，复制到飞书/邮件，或导出 .md。</p>
          <textarea class="field report-text" data-report-text spellcheck="false">${U.esc(report.markdown)}</textarea>`,
        footer: `
          <div class="modal-foot-actions">
            <button class="btn ghost" type="button" data-regenerate>重新生成</button>
            <button class="btn ghost ai-action" type="button" data-ai-report>AI 重写</button>
            <span class="save-state" data-report-state>${report.data.completed} 项完成 · ${report.data.progress} 条进展</span>
          </div>
          <div class="modal-foot-actions">
            <button class="btn ghost" type="button" data-copy>复制 Markdown</button>
            <button class="btn ghost" type="button" data-export>导出 .md</button>
            <button class="btn primary" type="button" data-done>完成</button>
          </div>`,
        onMount(el, close) {
          const text = el.querySelector('[data-report-text]');
          const state = el.querySelector('[data-report-state]');
          setTimeout(() => { text.focus(); text.setSelectionRange(0, 0); }, 30);
          el.querySelector('[data-copy]').addEventListener('click', async () => {
            try {
              await tiny.clipboard.write({ text: text.value });
              state.textContent = '已复制';
              WB.toast('周报已复制，可以粘贴了');
            } catch {
              WB.toast('复制失败，请全选后手动复制。', { type: 'error' });
            }
          });
          el.querySelector('[data-export]').addEventListener('click', async () => {
            try {
              const path = await tiny.dialog.saveFile({
                types: ['md'],
                name: `${label}-${range.start}-${range.end}.md`,
              });
              if (!path) return;
              const saved = await WB.api.call('reports.export', { path, markdown: text.value });
              state.textContent = `已导出 · ${U.fmtBytes(saved.size)}`;
              WB.toast('已导出 Markdown 文件');
            } catch {
              // api.call already shows the reason.
            }
          });
          el.querySelector('[data-done]').addEventListener('click', close);
          el.querySelector('[data-ai-report]').addEventListener('click', async (event) => {
            const button = event.currentTarget;
            if (!(await WB.ai.ensure())) return;
            await WB.ai.withButton(button, 'AI 生成中…', async () => {
              const before = text.value;
              const next = await WB.api.call('reports.ai', {
                start: range.start,
                end: range.end,
                label,
                markdown: text.value,
              });
              text.value = next.markdown;
              state.textContent = `AI 已重写 · ${next.inputStats.entries} 条记录 · ${next.model}`;
              const undo = () => {
                text.value = before;
                state.textContent = '已恢复 AI 重写前的文字';
              };
              WB.setUndo('AI 重写周报', undo);
              WB.toast('AI 已重写周报，可继续修改', { actionLabel: '撤销', onAction: undo });
            }).catch(() => {});
          });
          el.querySelector('[data-regenerate]').addEventListener('click', async (event) => {
            event.currentTarget.disabled = true;
            try {
              const next = await WB.api.call('reports.weekly', {
                start: range.start,
                end: range.end,
                label,
              });
              text.value = next.markdown;
              state.textContent = '已重新生成';
            } finally {
              event.currentTarget.disabled = false;
            }
          });
        },
      });
      return modal;
    },

    refresh() {
      if (this.el && this.el.isConnected) {
        return this.load(this.range || this.currentRange());
      }
      return undefined;
    },
  };
})(window.WB = window.WB || {});
