(function (WB) {
  const U = WB.util;
  const V = WB.views = WB.views || {};

  function levelFor(count) {
    if (!count) return '';
    if (count <= 2) return ' l1';
    if (count <= 5) return ' l2';
    if (count <= 8) return ' l3';
    return ' l4';
  }

  V.journal = {
    el: null,
    date: U.todayKey(),
    month: '',
    query: '',
    counts: {},
    items: [],
    total: 0,
    hasMore: false,
    offset: 0,
    filters: { kind: '', projectId: '', tag: '', range: 'day', from: '', to: '' },

    async render(root, ctx) {
      const date = ctx.date || U.todayKey();
      const incoming = ctx.params || {};
      this.date = date;
      this.month = U.monthKey(date);
      this.query = '';
      this.items = [];
      this.offset = 0;
      this.filters = {
        kind: incoming.kind || '',
        projectId: incoming.projectId || '',
        tag: incoming.tag || '',
        range: incoming.from && incoming.to ? 'range' : 'day',
        from: incoming.from || '',
        to: incoming.to || '',
      };

      root.innerHTML = `
        <div class="view">
          <div class="page">
            <header class="page-head">
              <div>
                <p class="page-kicker">按天回看</p>
                <h1 class="page-title">记录</h1>
                <p class="page-sub">所有记录都落在某一天。搜索和筛选可以跨天查找。</p>
              </div>
              <div class="head-actions">
                <input class="field search-field" data-search type="search"
                       placeholder="搜索记录、标签、项目…" autocomplete="off" aria-label="搜索记录">
              </div>
            </header>

            <div class="journal-grid">
              <aside class="calendar-panel" aria-label="日历">
                <div class="cal-head">
                  <button class="btn ghost icon-btn" type="button" data-month="-1" title="上个月">‹</button>
                  <span class="cal-title" data-month-label></span>
                  <button class="btn ghost icon-btn" type="button" data-month="1" title="下个月">›</button>
                </div>
                <div class="cal-weekdays" data-weekdays></div>
                <div class="cal-grid" data-cal-grid></div>
                <div class="cal-legend">
                  <span>少</span><i></i><i class="l1"></i><i class="l2"></i><i class="l3"></i><i class="l4"></i><span>多</span>
                </div>
              </aside>

              <section class="block journal-list">
                <header class="block-head">
                  <div class="day-nav">
                    <button class="btn ghost icon-btn" type="button" data-day="-1" title="前一天">‹</button>
                    <h2 data-list-title>—</h2>
                    <button class="btn ghost icon-btn" type="button" data-day="1" title="后一天">›</button>
                  </div>
                  <span class="count" data-list-count></span>
                </header>

                <div class="filter-bar" data-filter-bar>
                  <select class="field" data-filter-kind aria-label="按类型筛选">
                    <option value="">全部类型</option>
                    ${WB.kinds.map((kind) => `<option value="${kind.id}"${this.filters.kind === kind.id ? ' selected' : ''}>${kind.label}</option>`).join('')}
                  </select>
                  <select class="field" data-filter-project aria-label="按项目筛选">
                    <option value="">全部项目</option>
                    ${(WB.store.state.projects || []).map((project) => `
                      <option value="${U.esc(project.id)}"${this.filters.projectId === project.id ? ' selected' : ''}>${U.esc(project.name)}</option>
                    `).join('')}
                  </select>
                  <select class="field" data-filter-tag aria-label="按标签筛选">
                    <option value="">全部标签</option>
                  </select>
                  <select class="field" data-filter-range aria-label="时间范围">
                    <option value="day"${this.filters.range === 'day' ? ' selected' : ''}>这一天</option>
                    <option value="week"${this.filters.range === 'week' ? ' selected' : ''}>这一周</option>
                    <option value="month"${this.filters.range === 'month' ? ' selected' : ''}>这个月</option>
                    <option value="all"${this.filters.range === 'all' ? ' selected' : ''}>全部时间</option>
                    <option value="range"${this.filters.range === 'range' ? ' selected' : ''}>选定范围</option>
                  </select>
                  <button class="btn ghost" type="button" data-filter-clear>清除</button>
                </div>

                <div class="timeline" data-slot="list">${WB.miniEmpty('读取中…')}</div>
                <div class="load-more" data-load-more hidden>
                  <button class="btn ghost" type="button" data-load-more-btn>加载更早的记录</button>
                </div>
              </section>
            </div>
          </div>
        </div>`;

      const el = root.firstElementChild;
      this.el = el;

      const search = el.querySelector('[data-search]');
      search.addEventListener('input', U.debounce(() => {
        this.query = search.value.trim();
        this.loadList();
      }, 240));

      el.querySelectorAll('[data-month]').forEach((button) => {
        button.addEventListener('click', () => {
          this.month = U.addMonths(this.month, Number(button.dataset.month));
          this.loadCalendar();
        });
      });

      el.querySelectorAll('[data-day]').forEach((button) => {
        button.addEventListener('click', () => {
          this.filters.range = 'day';
          this.filters.from = '';
          this.filters.to = '';
          WB.go('journal', U.addDays(this.date, Number(button.dataset.day)));
        });
      });

      el.querySelector('[data-filter-kind]').addEventListener('change', (event) => {
        this.filters.kind = event.target.value;
        this.loadList();
      });
      el.querySelector('[data-filter-project]').addEventListener('change', (event) => {
        this.filters.projectId = event.target.value;
        this.loadList();
      });
      el.querySelector('[data-filter-tag]').addEventListener('change', (event) => {
        this.filters.tag = event.target.value;
        this.loadList();
      });
      el.querySelector('[data-filter-range]').addEventListener('change', (event) => {
        const value = event.target.value;
        if (value === 'range') {
          this.filters.range = 'range';
          if (!this.filters.from || !this.filters.to) {
            const start = U.startOfWeek(this.date, (WB.store.state.settings || {}).weekStart === 0 ? 0 : 1);
            this.filters.from = start;
            this.filters.to = U.addDays(start, 6);
          }
        } else {
          this.filters.range = value;
          this.filters.from = '';
          this.filters.to = '';
        }
        this.loadList();
      });
      el.querySelector('[data-filter-clear]').addEventListener('click', () => {
        this.query = '';
        search.value = '';
        this.filters = { kind: '', projectId: '', tag: '', range: 'day', from: '', to: '' };
        el.querySelector('[data-filter-kind]').value = '';
        el.querySelector('[data-filter-project]').value = '';
        el.querySelector('[data-filter-tag]').value = '';
        el.querySelector('[data-filter-range]').value = 'day';
        this.loadList();
      });
      el.querySelector('[data-load-more-btn]').addEventListener('click', () => this.loadList(true));

      el.addEventListener('click', async (event) => {
        const day = event.target.closest('[data-cal-date]');
        if (day) {
          WB.go('journal', day.dataset.calDate);
          return;
        }

        const editBtn = event.target.closest('[data-entry-edit]');
        if (editBtn) {
          await WB.openEntryEditor(editBtn.dataset.entryEdit, {
            onSaved: () => { this.loadList(); this.loadCalendar(); },
          });
          return;
        }

        const deleteBtn = event.target.closest('[data-entry-del]');
        if (deleteBtn) {
          const id = deleteBtn.dataset.entryDel;
          deleteBtn.disabled = true;
          try {
            await WB.api.call('entries.remove', { id });
            await this.loadList();
            await this.loadCalendar();
            const undo = async () => {
              await WB.api.call('entries.restore', { id });
              await this.loadList();
              await this.loadCalendar();
            };
            WB.setUndo('删除记录', undo);
            WB.toast('已删除', { actionLabel: '撤销', onAction: undo });
          } catch {
            deleteBtn.disabled = false;
          }
        }
      });

      el.addEventListener('dblclick', (event) => {
        const content = event.target.closest('.tl-content');
        if (!content) return;
        const item = content.closest('[data-entry]');
        if (item) WB.openEntryEditor(item.dataset.entry, {
          onSaved: () => { this.loadList(); this.loadCalendar(); },
        });
      });

      await this.loadCalendar();
      await this.loadTags();
      await this.loadList();
    },

    async loadTags() {
      const el = this.el;
      if (!el || !el.isConnected) return;
      let tags;
      try {
        tags = await WB.api.call('entries.tags', { limit: 100 });
      } catch {
        return;
      }
      const select = el.querySelector('[data-filter-tag]');
      if (!select) return;
      const current = this.filters.tag;
      select.innerHTML = '<option value="">全部标签</option>' + tags.items.map((item) => (
        `<option value="${U.esc(item.tag)}"${item.tag === current ? ' selected' : ''}>#${U.esc(item.tag)} · ${item.count}</option>`
      )).join('');
    },

    rangeFor() {
      const settings = WB.store.state.settings || {};
      const weekStart = settings.weekStart === 0 ? 0 : 1;
      if (this.filters.range === 'day') {
        return { date: this.date, from: '', to: '' };
      }
      if (this.filters.range === 'week') {
        const start = U.startOfWeek(this.date, weekStart);
        return { date: '', from: start, to: U.addDays(start, 6) };
      }
      if (this.filters.range === 'month') {
        const [year, month] = U.monthKey(this.date).split('-').map(Number);
        const start = `${year}-${U.pad2(month)}-01`;
        const last = new Date(year, month, 0);
        const end = `${year}-${U.pad2(month)}-${U.pad2(last.getDate())}`;
        return { date: '', from: start, to: end };
      }
      if (this.filters.range === 'range') {
        if (this.filters.from && this.filters.to) {
          return { date: '', from: this.filters.from, to: this.filters.to };
        }
        return { date: '', from: '', to: '' };
      }
      return { date: '', from: '', to: '' };
    },

    async loadList(append) {
      const el = this.el;
      if (!el || !el.isConnected) return;
      const slot = el.querySelector('[data-slot="list"]');
      const title = el.querySelector('[data-list-title]');
      const count = el.querySelector('[data-list-count]');
      const more = el.querySelector('[data-load-more]');
      const moreButton = el.querySelector('[data-load-more-btn]');

      if (!append) {
        this.items = [];
        this.offset = 0;
        slot.innerHTML = WB.miniEmpty('读取中…');
      }
      const range = this.rangeFor();
      const params = {
        limit: 100,
        offset: this.offset,
        order: 'desc',
      };
      if (this.query) params.query = this.query;
      if (this.filters.kind) params.kind = this.filters.kind;
      if (this.filters.projectId) params.projectId = this.filters.projectId;
      if (this.filters.tag) params.tag = this.filters.tag;
      if (range.date) params.date = range.date;
      if (range.from) params.from = range.from;
      if (range.to) params.to = range.to;

      let data;
      try {
        data = await WB.api.call('entries.list', params);
      } catch {
        return;
      }

      this.items = append ? this.items.concat(data.items) : data.items;
      this.total = data.total;
      this.offset = this.items.length;
      this.hasMore = data.hasMore;

      if (this.query) {
        title.textContent = `搜索“${this.query}”`;
      } else if (this.filters.range === 'day') {
        title.textContent = U.fmtHead(this.date);
      } else if (this.filters.range === 'week') {
        title.textContent = `本周 · ${U.fmtShort(range.from)} – ${U.fmtShort(range.to)}`;
      } else if (this.filters.range === 'month') {
        title.textContent = U.monthLabel(U.monthKey(this.date));
      } else if (this.filters.range === 'range') {
        title.textContent = `${U.fmtShort(range.from)} – ${U.fmtShort(range.to)}`;
      } else {
        title.textContent = '全部记录';
      }
      count.textContent = `${this.total} 条`;

      if (!this.items.length) {
        slot.innerHTML = this.query
          ? WB.emptyState('没有找到匹配的记录。', '试试更短的关键词，或清除筛选。')
          : WB.emptyState('这里还没有记录。', '回到今日写一条，或者换一个日期看看。');
        more.hidden = true;
        return;
      }

      const groups = [];
      for (const entry of this.items) {
        let group = groups[groups.length - 1];
        if (!group || group.date !== entry.entryDate) {
          group = { date: entry.entryDate, items: [] };
          groups.push(group);
        }
        group.items.push(entry);
      }

      slot.innerHTML = groups.map((group) => `
        <div class="date-group">
          <p class="date-group-head">${U.esc(U.fmtHead(group.date))}</p>
          ${group.items.map((entry) => WB.entryHTML(entry, {
            showDate: this.filters.range !== 'day' || Boolean(this.query),
          })).join('')}
        </div>
      `).join('');

      more.hidden = !this.hasMore;
      if (moreButton) moreButton.disabled = false;
    },

    async loadCalendar() {
      const el = this.el;
      if (!el || !el.isConnected) return;
      const settings = WB.store.state.settings || {};
      const weekStart = settings.weekStart === 0 ? 0 : 1;
      const days = U.monthMatrix(this.month, weekStart);

      el.querySelector('[data-month-label]').textContent = U.monthLabel(this.month);
      el.querySelector('[data-weekdays]').innerHTML = U.weekdayHeaders(weekStart)
        .map((label) => `<span>${label}</span>`).join('');

      try {
        const heat = await WB.api.call('stats.heatmap', {
          from: days[0].key,
          to: days[days.length - 1].key,
        });
        this.counts = {};
        for (const day of heat.days) this.counts[day.date] = day.count;
      } catch {
        this.counts = {};
      }

      const today = U.todayKey();
      el.querySelector('[data-cal-grid]').innerHTML = days.map((day) => {
        const count = this.counts[day.key] || 0;
        const classes = [
          'cal-day',
          day.inMonth ? '' : 'is-out',
          day.key === today ? 'is-today' : '',
          day.key === this.date ? 'is-selected' : '',
          levelFor(count).trim(),
        ].filter(Boolean).join(' ');
        const label = `${day.key} · ${count} 条记录`;
        return `<button class="${classes}" type="button" data-cal-date="${day.key}" title="${label}" aria-label="${label}">${day.day}</button>`;
      }).join('');
    },

    refresh() {
      return this.loadList();
    },
  };
})(window.WB = window.WB || {});
