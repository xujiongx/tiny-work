(function (WB) {
  const U = WB.util;
  const V = WB.views = WB.views || {};

  const MAX_DIMENSIONS = 12;
  const MAX_ITEMS = 20;

  function pad2(value) {
    return String(value).padStart(2, '0');
  }

  function quarterLabel(date) {
    const d = date || new Date();
    return `${d.getFullYear()} Q${Math.floor(d.getMonth() / 3) + 1}`;
  }

  function statusLabel(status) {
    return status === 'final' ? '已定稿' : '草稿';
  }

  function statusClass(status) {
    return status === 'final' ? 'is-final' : 'is-draft';
  }

  function blankReview(employeeName) {
    return {
      id: null,
      title: '个人绩效考核评价表',
      employeeName: employeeName || '',
      period: quarterLabel(),
      grade: 'B',
      status: 'draft',
      managerSignature: '',
      employeeSignature: '',
      dimensions: ['工作完成度', '团队配合', '个人成长及工作态度'].map((name) => ({
        name,
        items: [{ comment: '', expectation: '' }],
      })),
    };
  }

  function pointHTML(value, index) {
    return `
      <div class="perf-point">
        <span class="perf-num">${index + 1}</span>
        ${value
          ? `<p>${U.esc(value)}</p>`
          : '<p class="perf-empty">待填写</p>'}
      </div>`;
  }

  function dimensionRows(dimension, index) {
    const items = dimension.items && dimension.items.length
      ? dimension.items
      : [{ comment: '', expectation: '' }];
    return items.map((item, itemIndex) => `
      <tr>
        ${itemIndex === 0 ? `
          <td class="perf-dim" rowspan="${items.length}">
            <span class="perf-dim-no">${pad2(index + 1)}</span>
            <strong>${U.esc(dimension.name)}</strong>
            <span class="perf-dim-count">${items.length} 条</span>
          </td>` : ''}
        <td class="perf-cell">${pointHTML(item.comment, itemIndex)}</td>
        <td class="perf-cell">${pointHTML(item.expectation, itemIndex)}</td>
      </tr>`).join('');
  }

  function dimensionEditorHTML(dimension, index) {
    const items = dimension.items && dimension.items.length
      ? dimension.items
      : [{ comment: '', expectation: '' }];
    return `
      <section class="perf-dim-edit" data-dim-row data-dim-index="${index}">
        <div class="perf-dim-edit-head">
          <span class="perf-dim-no">${pad2(index + 1)}</span>
          <input class="field" data-dim-name maxlength="60" value="${U.esc(dimension.name)}"
                 aria-label="第 ${index + 1} 个考核维度名称">
          <button class="perf-remove" type="button" data-remove-dim title="删除这个维度" aria-label="删除这个维度">×</button>
        </div>
        <div class="perf-items-edit">
          ${items.map((item, itemIndex) => `
            <div class="perf-item-edit" data-item-row>
              <span class="perf-num">${itemIndex + 1}</span>
              <label class="perf-edit-cell">
                <span class="edit-label">评语</span>
                <textarea class="field edit-textarea" data-item-comment rows="3"
                          maxlength="4000">${U.esc(item.comment)}</textarea>
              </label>
              <label class="perf-edit-cell">
                <span class="edit-label">下季度期望及要求</span>
                <textarea class="field edit-textarea" data-item-expectation rows="3"
                          maxlength="4000">${U.esc(item.expectation)}</textarea>
              </label>
              <button class="perf-remove" type="button" data-remove-item title="删除这一行" aria-label="删除这一行">×</button>
            </div>`).join('')}
        </div>
        <div class="perf-dim-edit-foot">
          <button class="btn ghost perf-small-btn" type="button" data-add-item>+ 添加一条</button>
        </div>
      </section>`;
  }

  V.performance = {
    el: null,
    root: null,
    ctx: null,
    selectedId: null,
    reviews: [],
    templates: [],
    current: null,

    async render(root, ctx) {
      this.root = root;
      this.ctx = ctx;
      await this.load();
    },

    async load() {
      const root = this.root;
      if (!root) return;
      root.innerHTML = `
        <div class="view">
          <div class="page performance-page">
            ${WB.miniEmpty('正在读取绩效评价表…')}
          </div>
        </div>`;
      try {
        const data = await WB.api.call('performance.list', {}, { silent: true });
        this.reviews = data.items || [];
        this.templates = data.templates || [];
        if (!this.reviews.length) {
          this.current = null;
          this.selectedId = null;
          this.paint();
          return;
        }
        if (!this.reviews.some((review) => review.id === this.selectedId)) {
          this.selectedId = this.reviews[0].id;
        }
        this.current = await WB.api.call(
          'performance.get',
          { id: this.selectedId },
          { silent: true }
        );
        this.paint();
      } catch (error) {
        root.innerHTML = `
          <div class="view">
            <div class="page">
              <div class="empty">
                <p class="empty-kicker">绩效</p>
                <p class="empty-title">这一页没有打开。</p>
                <p class="empty-text">${U.esc(error && error.message ? error.message : '读取绩效评价表失败。')}</p>
                <div class="empty-actions">
                  <button class="btn ghost" type="button" data-retry>重试</button>
                </div>
              </div>
            </div>
          </div>`;
        this.el = root.firstElementChild;
        this.bind();
      }
    },

    paint() {
      const root = this.root;
      if (!root || !root.isConnected) return;
      const current = this.current;
      const template = this.templates[0] || null;

      root.innerHTML = `
        <div class="view">
          <div class="page performance-page">
            <header class="page-head">
              <div>
                <p class="page-kicker">${current ? U.esc(current.period) + ' · 绩效考核' : '绩效考核'}</p>
                <h1 class="page-title">绩效</h1>
                <p class="page-sub">整理季度评语与下季度期望，生成一张可复制、可导出的评价表。</p>
              </div>
              ${current ? `
                <div class="head-actions">
                  ${this.reviews.length > 1 ? `
                    <select class="field perf-select" data-review-select aria-label="切换绩效评价表">
                      ${this.reviews.map((review) => `
                        <option value="${U.esc(review.id)}"${review.id === current.id ? ' selected' : ''}>
                          ${U.esc(review.period || '未命名周期')} · ${U.esc(review.employeeName || '未填写姓名')}
                        </option>`).join('')}
                    </select>` : ''}
                  <button class="btn ghost" type="button" data-new>新建</button>
                  <button class="btn ghost" type="button" data-copy>复制 Markdown</button>
                  <button class="btn ghost" type="button" data-export>导出 .md</button>
                  <button class="btn ghost ai-action" type="button" data-ai-review>AI 起草</button>
                  <button class="btn primary" type="button" data-edit>编辑</button>
                </div>` : ''}
            </header>

            ${current ? this.sheetHTML(current) : `
              <div class="empty performance-empty">
                <p class="empty-kicker">绩效</p>
                <p class="empty-title">还没有绩效评价表。</p>
                <p class="empty-text">可以按 2026 Q3 评价表的内容生成一份，也可以从空白表开始整理。</p>
                <div class="empty-actions">
                  ${template ? `
                    <button class="btn primary" type="button" data-seed="${U.esc(template.id)}">
                      生成 ${U.esc(template.label)}
                    </button>` : ''}
                  <button class="btn ghost" type="button" data-new>新建空白评价表</button>
                </div>
              </div>`}
          </div>
        </div>`;

      this.el = root.firstElementChild;
      this.bind();
    },

    sheetHTML(review) {
      return `
        <article class="perf-sheet">
          <header class="perf-head">
            <div class="perf-head-main">
              <p class="perf-org">案头 · 季度绩效</p>
              <h2 class="perf-title">${U.esc(review.title)}</h2>
            </div>
            <div class="perf-head-side">
              <span class="perf-status ${statusClass(review.status)}">${statusLabel(review.status)}</span>
              <button class="perf-status-btn" type="button" data-status>
                ${review.status === 'final' ? '改回草稿' : '标记定稿'}
              </button>
            </div>
          </header>

          <div class="perf-meta">
            <div class="perf-meta-item">
              <span class="perf-meta-label">员工姓名</span>
              <strong>${U.esc(review.employeeName || '—')}</strong>
            </div>
            <div class="perf-meta-item">
              <span class="perf-meta-label">考核周期</span>
              <strong>${U.esc(review.period || '—')}</strong>
            </div>
            <div class="perf-meta-item">
              <span class="perf-meta-label">本次考核评级结果</span>
              <strong class="perf-grade">${U.esc(review.grade || '—')}</strong>
            </div>
            <div class="perf-meta-item">
              <span class="perf-meta-label">最近更新</span>
              <strong>${U.esc(U.fmtDateTime(review.updatedAt))}</strong>
            </div>
          </div>

          <div class="perf-table-wrap">
            <table class="perf-table">
              <caption class="sr-only">${U.esc(review.title)}</caption>
              <colgroup>
                <col class="perf-col-dim">
                <col>
                <col>
              </colgroup>
              <thead>
                <tr>
                  <th scope="col">考核维度</th>
                  <th scope="col">评语</th>
                  <th scope="col">下季度期望及要求</th>
                </tr>
              </thead>
              <tbody>
                ${(review.dimensions || []).map(dimensionRows).join('')}
              </tbody>
            </table>
          </div>

          <footer class="perf-signatures">
            <div class="perf-signature">
              <span>直接上级审批签字：</span>
              ${review.managerSignature
                ? `<strong>${U.esc(review.managerSignature)}</strong>`
                : '<span class="perf-sign-placeholder">待签字</span>'}
            </div>
            <div class="perf-signature">
              <span>员工确认签字：</span>
              ${review.employeeSignature
                ? `<strong>${U.esc(review.employeeSignature)}</strong>`
                : '<span class="perf-sign-placeholder">待签字</span>'}
            </div>
          </footer>
        </article>

        <div class="perf-foot">
          <span>修改会在保存后写入本机数据库，不会上传到任何地方。</span>
          <span>${review.dimensionCount || (review.dimensions || []).length} 个维度 · ${review.itemCount || 0} 条内容</span>
        </div>`;
    },

    bind() {
      const el = this.el;
      if (!el) return;
      const select = el.querySelector('[data-review-select]');
      if (select) {
        select.addEventListener('change', async () => {
          this.selectedId = select.value;
          await this.load();
        });
      }
      el.addEventListener('click', (event) => {
        const seed = event.target.closest('[data-seed]');
        if (seed) {
          this.seed(seed.dataset.seed, seed);
          return;
        }
        if (event.target.closest('[data-new]')) {
          this.openEditor(null);
          return;
        }
        if (event.target.closest('[data-edit]')) {
          this.openEditor(this.current);
          return;
        }
        if (event.target.closest('[data-ai-review]')) {
          this.openEditor(this.current, { autoDraft: true });
          return;
        }
        if (event.target.closest('[data-copy]')) {
          this.copyMarkdown();
          return;
        }
        if (event.target.closest('[data-export]')) {
          this.exportMarkdown();
          return;
        }
        if (event.target.closest('[data-status]')) {
          this.toggleStatus();
          return;
        }
        if (event.target.closest('[data-retry]')) this.load();
      });
    },

    async seed(templateId, button) {
      if (button) button.disabled = true;
      try {
        const review = await WB.api.call('performance.create', { template: templateId });
        this.selectedId = review.id;
        await this.load();
        WB.toast('已按 2026 Q3 评价表生成');
      } catch {
        if (button && button.isConnected) button.disabled = false;
      }
    },

    async toggleStatus() {
      if (!this.current) return;
      const status = this.current.status === 'final' ? 'draft' : 'final';
      try {
        this.current = await WB.api.call('performance.save', {
          id: this.current.id,
          status,
        });
        this.paint();
        WB.toast(status === 'final' ? '已标记为定稿' : '已改回草稿');
      } catch {
        // api.call already shows the reason.
      }
    },

    async copyMarkdown() {
      if (!this.current) return;
      try {
        const data = await WB.api.call('performance.markdown', { id: this.current.id });
        await tiny.clipboard.write({ text: data.markdown });
        WB.toast('评价表已复制为 Markdown');
      } catch {
        WB.toast('复制失败，可以改用导出 .md。', { type: 'error' });
      }
    },

    async exportMarkdown() {
      if (!this.current) return;
      try {
        const data = await WB.api.call('performance.markdown', { id: this.current.id });
        const path = await tiny.dialog.saveFile({
          types: ['md'],
          name: data.filename || '绩效评价.md',
        });
        if (!path) return;
        const saved = await WB.api.call('performance.export', {
          id: this.current.id,
          path,
          markdown: data.markdown,
        });
        WB.toast(`已导出 Markdown · ${U.fmtBytes(saved.size)}`);
      } catch {
        // api.call already shows the reason.
      }
    },

    async openEditor(review, options) {
      const opts = options || {};
      let source = review;
      const isNew = !review;
      if (source && !Array.isArray(source.dimensions)) {
        try {
          source = await WB.api.call('performance.get', { id: source.id });
        } catch {
          return;
        }
      }
      const state = isNew
        ? blankReview(this.current && this.current.employeeName)
        : JSON.parse(JSON.stringify(source));
      if (!Array.isArray(state.dimensions) || !state.dimensions.length) {
        state.dimensions = blankReview().dimensions;
      }

      const formId = 'performance-edit-' + Math.random().toString(36).slice(2);
      const modal = WB.openModal({
        kicker: isNew ? '新建绩效评价' : `${state.period || '绩效'} · ${state.employeeName || '未填写姓名'}`,
        title: isNew ? '新建绩效评价表' : '编辑绩效评价表',
        className: 'modal-performance',
        body: `
          <form id="${formId}" class="perf-form" data-perf-form>
            <div class="perf-form-meta">
              <label class="edit-field perf-field-wide">
                <span class="edit-label">评价表标题</span>
                <input class="field" name="title" maxlength="120" required
                       value="${U.esc(state.title)}" autofocus>
              </label>
              <label class="edit-field">
                <span class="edit-label">员工姓名</span>
                <input class="field" name="employeeName" maxlength="40" required
                       value="${U.esc(state.employeeName)}">
              </label>
              <label class="edit-field">
                <span class="edit-label">考核周期</span>
                <input class="field" name="period" maxlength="30" required
                       value="${U.esc(state.period)}" placeholder="例如 2026 Q3">
              </label>
              <label class="edit-field">
                <span class="edit-label">本次考核评级结果</span>
                <input class="field" name="grade" maxlength="12"
                       value="${U.esc(state.grade)}" placeholder="例如 B">
              </label>
              <label class="edit-field">
                <span class="edit-label">状态</span>
                <select class="field" name="status">
                  <option value="draft"${state.status === 'draft' ? ' selected' : ''}>草稿</option>
                  <option value="final"${state.status === 'final' ? ' selected' : ''}>已定稿</option>
                </select>
              </label>
            </div>

            <div class="perf-form-head">
              <h3>考核维度</h3>
              <div class="perf-form-head-side">
                <span class="count" data-dim-count>${state.dimensions.length} 个维度</span>
                <button class="btn ghost perf-small-btn ai-action" type="button" data-ai-draft>AI 起草</button>
              </div>
            </div>
            <div class="perf-edit-dims" data-dim-list></div>
            <div class="perf-form-add">
              <button class="btn ghost" type="button" data-add-dim>+ 添加考核维度</button>
            </div>

            <div class="perf-form-head">
              <h3>签字</h3>
              <span class="count">可留空，签字后再回来填写</span>
            </div>
            <div class="perf-form-meta">
              <label class="edit-field">
                <span class="edit-label">直接上级审批签字</span>
                <input class="field" name="managerSignature" maxlength="80"
                       value="${U.esc(state.managerSignature)}">
              </label>
              <label class="edit-field">
                <span class="edit-label">员工确认签字</span>
                <input class="field" name="employeeSignature" maxlength="80"
                       value="${U.esc(state.employeeSignature)}">
              </label>
            </div>
          </form>`,
        footer: `
          <div class="modal-foot-actions">
            ${!isNew ? '<button class="btn ghost danger-text" type="button" data-remove-review>删除评价表</button>' : ''}
          </div>
          <div class="modal-foot-actions">
            <button class="btn ghost" type="button" data-cancel>取消</button>
            <button class="btn primary" type="submit" form="${formId}" data-save>${isNew ? '创建' : '保存'}</button>
          </div>`,
        onMount(el, close) {
          const form = el.querySelector(`#${formId}`);
          const list = form.querySelector('[data-dim-list]');
          const dimCount = form.querySelector('[data-dim-count]');
          const collectDimensions = () => Array.from(list.querySelectorAll('[data-dim-row]'))
            .map((row) => ({
              name: row.querySelector('[data-dim-name]').value,
              items: Array.from(row.querySelectorAll('[data-item-row]')).map((itemRow) => ({
                comment: itemRow.querySelector('[data-item-comment]').value,
                expectation: itemRow.querySelector('[data-item-expectation]').value,
              })),
            }));
          const readState = () => {
            state.title = form.querySelector('[name="title"]').value;
            state.employeeName = form.querySelector('[name="employeeName"]').value;
            state.period = form.querySelector('[name="period"]').value;
            state.grade = form.querySelector('[name="grade"]').value;
            state.status = form.querySelector('[name="status"]').value;
            state.managerSignature = form.querySelector('[name="managerSignature"]').value;
            state.employeeSignature = form.querySelector('[name="employeeSignature"]').value;
            state.dimensions = collectDimensions();
            return state;
          };
          const renderDimensions = (focus) => {
            list.innerHTML = state.dimensions.map(dimensionEditorHTML).join('');
            dimCount.textContent = `${state.dimensions.length} 个维度`;
            list.querySelectorAll('textarea').forEach((textarea) => U.autoGrow(textarea, 240));
            if (focus) {
              const row = list.querySelector(`[data-dim-index="${focus.dimIndex}"]`);
              if (row) {
                const item = row.querySelectorAll('[data-item-row]')[focus.itemIndex];
                const target = item && item.querySelector(
                  focus.field === 'expectation' ? '[data-item-expectation]' : '[data-item-comment]'
                );
                if (target) target.focus();
              }
            }
          };

          renderDimensions();

          list.addEventListener('input', (event) => {
            if (event.target.tagName === 'TEXTAREA') U.autoGrow(event.target, 240);
          });

          list.addEventListener('click', (event) => {
            const row = event.target.closest('[data-dim-row]');
            if (!row) return;
            const dimIndex = Number(row.dataset.dimIndex);
            const itemRow = event.target.closest('[data-item-row]');

            if (event.target.closest('[data-add-item]')) {
              readState();
              if (state.dimensions[dimIndex].items.length >= MAX_ITEMS) {
                WB.toast(`每个维度最多 ${MAX_ITEMS} 条内容。`);
                return;
              }
              const itemIndex = state.dimensions[dimIndex].items.length;
              state.dimensions[dimIndex].items.push({ comment: '', expectation: '' });
              renderDimensions({ dimIndex, itemIndex, field: 'comment' });
              return;
            }

            if (event.target.closest('[data-remove-item]') && itemRow) {
              readState();
              const itemIndex = Array.from(row.querySelectorAll('[data-item-row]')).indexOf(itemRow);
              if (state.dimensions[dimIndex].items.length <= 1) {
                WB.toast('每个维度至少保留一行。');
                return;
              }
              state.dimensions[dimIndex].items.splice(itemIndex, 1);
              renderDimensions();
              return;
            }

            if (event.target.closest('[data-remove-dim]')) {
              readState();
              if (state.dimensions.length <= 1) {
                WB.toast('至少保留一个考核维度。');
                return;
              }
              state.dimensions.splice(dimIndex, 1);
              renderDimensions();
            }
          });

          form.querySelector('[data-add-dim]').addEventListener('click', () => {
            readState();
            if (state.dimensions.length >= MAX_DIMENSIONS) {
              WB.toast(`考核维度最多 ${MAX_DIMENSIONS} 个。`);
              return;
            }
            const dimIndex = state.dimensions.length;
            state.dimensions.push({
              name: '新考核维度',
              items: [{ comment: '', expectation: '' }],
            });
            renderDimensions({ dimIndex, itemIndex: 0, field: 'comment' });
            const nameInput = list.querySelector(`[data-dim-index="${dimIndex}"] [data-dim-name]`);
            if (nameInput) {
              nameInput.focus();
              nameInput.select();
            }
          });

          const aiButton = form.querySelector('[data-ai-draft]');
          const openAiPreview = (draft) => {
            const hasExisting = state.dimensions.some((dimension) => dimension.items.some(
              (item) => String(item.comment || '').trim() || String(item.expectation || '').trim()
            ));
            const previewBody = `
              <div class="ai-preview">
                <p class="ai-preview-sub">基于 ${draft.range.label} 的 ${draft.inputStats.entries} 条记录生成${draft.inputStats.previousReview ? '，并参考了历史评价表' : ''}。可以逐条修改，再选择填入方式。</p>
                ${draft.dimensions.map((dimension, dimIndex) => `
                  <section class="ai-preview-section">
                    <header class="ai-preview-section-head">
                      <span class="perf-dim-no">${pad2(dimIndex + 1)}</span>
                      <h3>${U.esc(dimension.name)}</h3>
                      <span class="count">${dimension.items.length} 条</span>
                    </header>
                    ${dimension.items.map((item, itemIndex) => `
                      <div class="ai-preview-item">
                        <label class="ai-preview-field">
                          <span class="edit-label">评语 ${itemIndex + 1}</span>
                          <textarea class="field edit-textarea" rows="3" maxlength="4000"
                                    data-ai-comment="${dimIndex}-${itemIndex}">${U.esc(item.comment)}</textarea>
                        </label>
                        <label class="ai-preview-field">
                          <span class="edit-label">下季度期望及要求 ${itemIndex + 1}</span>
                          <textarea class="field edit-textarea" rows="3" maxlength="4000"
                                    data-ai-expectation="${dimIndex}-${itemIndex}">${U.esc(item.expectation)}</textarea>
                        </label>
                      </div>`).join('')}
                  </section>`).join('')}
                <p class="ai-preview-privacy">这是 AI 建议，填入后不会立刻保存；请检查内容，确认无误再点保存。</p>
              </div>`;

            WB.openModal({
              kicker: `AI 草稿 · ${draft.range.label}`,
              title: '绩效评价草稿',
              className: 'modal-ai-preview modal-performance-ai',
              body: previewBody,
              footer: `
                <div class="modal-foot-actions">
                  <button class="btn ghost" type="button" data-ai-cancel>取消</button>
                  ${hasExisting ? '<button class="btn ghost" type="button" data-ai-fill>只填入空白</button>' : ''}
                  <button class="btn primary" type="button" data-ai-replace>${hasExisting ? '覆盖全部' : '填入表单'}</button>
                </div>`,
              onMount(previewEl, closePreview) {
                previewEl.querySelectorAll('textarea').forEach((textarea) => {
                  U.autoGrow(textarea, 240);
                  textarea.addEventListener('input', () => U.autoGrow(textarea, 240));
                });
                const generatedDimensions = () => state.dimensions.map((dimension, dimIndex) => ({
                  name: dimension.name,
                  items: dimension.items.map((original, itemIndex) => {
                    const commentNode = previewEl.querySelector(`[data-ai-comment="${dimIndex}-${itemIndex}"]`);
                    const expectationNode = previewEl.querySelector(`[data-ai-expectation="${dimIndex}-${itemIndex}"]`);
                    return {
                      comment: commentNode ? commentNode.value : original.comment,
                      expectation: expectationNode ? expectationNode.value : original.expectation,
                    };
                  }),
                }));
                const applyDraft = (mode) => {
                  const before = JSON.parse(JSON.stringify(state.dimensions));
                  const generated = generatedDimensions();
                  state.dimensions = generated.map((dimension, dimIndex) => ({
                    name: state.dimensions[dimIndex] ? state.dimensions[dimIndex].name : dimension.name,
                    items: dimension.items.map((item, itemIndex) => {
                      const original = before[dimIndex] && before[dimIndex].items[itemIndex]
                        ? before[dimIndex].items[itemIndex]
                        : { comment: '', expectation: '' };
                      if (mode === 'fill') {
                        return {
                          comment: String(original.comment || '').trim() ? original.comment : item.comment,
                          expectation: String(original.expectation || '').trim()
                            ? original.expectation
                            : item.expectation,
                        };
                      }
                      return item;
                    }),
                  }));
                  renderDimensions();
                  closePreview();
                  const undo = () => {
                    state.dimensions = before;
                    renderDimensions();
                  };
                  WB.setUndo('AI 绩效草稿', undo);
                  WB.toast('AI 草稿已填入，保存前可以继续修改', {
                    actionLabel: '撤销',
                    onAction: undo,
                  });
                };
                previewEl.querySelector('[data-ai-cancel]').addEventListener('click', closePreview);
                previewEl.querySelector('[data-ai-replace]').addEventListener('click', () => applyDraft('replace'));
                const fill = previewEl.querySelector('[data-ai-fill]');
                if (fill) fill.addEventListener('click', () => applyDraft('fill'));
              },
            });
          };

          const runAiDraft = async () => {
            if (!aiButton) return;
            if (!(await WB.ai.ensure())) return;
            await WB.ai.withButton(aiButton, 'AI 起草中…', async () => {
              readState();
              const draft = await WB.api.call('performance.aiDraft', {
                id: state.id || undefined,
                title: state.title,
                employeeName: state.employeeName,
                period: state.period,
                grade: state.grade,
                dimensions: state.dimensions,
              });
              openAiPreview(draft);
            }).catch(() => {});
          };

          if (aiButton) aiButton.addEventListener('click', runAiDraft);
          if (opts.autoDraft) setTimeout(runAiDraft, 160);

          form.addEventListener('submit', async (event) => {
            event.preventDefault();
            const saveButton = el.querySelector('[data-save]');
            const oldLabel = saveButton.textContent;
            saveButton.disabled = true;
            saveButton.textContent = '保存中…';
            try {
              const payload = readState();
              const saved = isNew
                ? await WB.api.call('performance.create', payload)
                : await WB.api.call('performance.save', { id: state.id, ...payload });
              close();
              this.selectedId = saved.id;
              await this.load();
              WB.toast(isNew ? '绩效评价表已创建' : '绩效评价表已保存');
            } catch {
              saveButton.disabled = false;
              saveButton.textContent = oldLabel;
            }
          });

          el.querySelector('[data-cancel]').addEventListener('click', close);

          const remove = el.querySelector('[data-remove-review]');
          if (remove) {
            remove.addEventListener('click', async () => {
              const confirmed = await tiny.dialog.confirm('删除这张绩效评价表？', {
                detail: '删除后 60 秒内可以撤销。评价内容会保留在数据库里，不会被立刻清空。',
                ok: '删除',
                cancel: '取消',
              });
              if (!confirmed) return;
              const id = state.id;
              remove.disabled = true;
              try {
                await WB.api.call('performance.remove', { id });
                close();
                this.selectedId = null;
                await this.load();
                const undo = async () => {
                  const restored = await WB.api.call('performance.restore', { id });
                  this.selectedId = restored.id;
                  await this.load();
                };
                WB.setUndo('删除绩效评价表', undo);
                WB.toast('绩效评价表已删除', { actionLabel: '撤销', onAction: undo });
              } catch {
                remove.disabled = false;
              }
            });
          }
        },
      });
      return modal;
    },

    refresh() {
      if (this.el && this.el.isConnected) return this.load();
      return undefined;
    },
  };
})(window.WB = window.WB || {});
