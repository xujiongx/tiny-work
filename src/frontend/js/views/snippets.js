(function (WB) {
  const U = WB.util;
  const V = WB.views = WB.views || {};

  const KINDS = [
    { id: 'snippet', label: '片段' },
    { id: 'command', label: '命令' },
    { id: 'link', label: '链接' },
  ];

  function kindLabel(kind) {
    const found = KINDS.find((item) => item.id === kind);
    return found ? found.label : '片段';
  }

  V.snippets = {
    el: null,
    root: null,
    ctx: null,
    query: '',
    kind: '',

    async render(root, ctx) {
      this.root = root;
      this.ctx = ctx;

      root.innerHTML = `
        <div class="view">
          <div class="page">
            <header class="page-head">
              <div>
                <p class="page-kicker">随手可取</p>
                <h1 class="page-title">片段</h1>
                <p class="page-sub">常用句子、命令和链接。记录里沉淀下来的东西，也可以放这里。</p>
              </div>
              <div class="head-actions">
                <input class="field search-field" data-snippet-search type="search"
                       placeholder="搜索片段…" autocomplete="off" aria-label="搜索片段">
                <button class="btn primary" type="button" data-snippet-new>新建片段</button>
              </div>
            </header>

            <div class="filter-bar">
              <select class="field" data-snippet-kind aria-label="片段类型">
                <option value="">全部类型</option>
                ${KINDS.map((kind) => `<option value="${kind.id}">${kind.label}</option>`).join('')}
              </select>
              <span class="count" data-snippet-count></span>
            </div>

            <div class="snippet-list" data-slot="list">${WB.miniEmpty('读取中…')}</div>
          </div>
        </div>`;

      const el = root.firstElementChild;
      this.el = el;

      const search = el.querySelector('[data-snippet-search]');
      search.addEventListener('input', U.debounce(() => {
        this.query = search.value.trim();
        this.load();
      }, 220));

      el.querySelector('[data-snippet-kind]').addEventListener('change', (event) => {
        this.kind = event.target.value;
        this.load();
      });

      el.querySelector('[data-snippet-new]').addEventListener('click', () => {
        this.openEditor(null);
      });

      el.addEventListener('click', async (event) => {
        const copy = event.target.closest('[data-snippet-copy]');
        if (copy) {
          const id = copy.dataset.snippetCopy;
          const item = (this.items || []).find((snippet) => snippet.id === id);
          if (!item) return;
          try {
            await tiny.clipboard.write({ text: item.url || item.content });
            WB.toast(item.url ? '链接已复制' : '内容已复制');
          } catch {
            WB.toast('复制失败，请打开片段手动复制。', { type: 'error' });
          }
          return;
        }

        const open = event.target.closest('[data-snippet-open]');
        if (open) {
          const item = (this.items || []).find((snippet) => snippet.id === open.dataset.snippetOpen);
          if (item && item.url) {
            try {
              await tiny.app.shell.open(item.url);
            } catch {
              WB.toast('没能打开链接。', { type: 'error' });
            }
          } else if (item) {
            try {
              await tiny.clipboard.write({ text: item.content });
              WB.toast('内容已复制');
            } catch {
              WB.toast('复制失败。', { type: 'error' });
            }
          }
          return;
        }

        const edit = event.target.closest('[data-snippet-edit]');
        if (edit) {
          const item = (this.items || []).find((snippet) => snippet.id === edit.dataset.snippetEdit);
          if (item) this.openEditor(item);
          return;
        }

        const remove = event.target.closest('[data-snippet-del]');
        if (remove) {
          const id = remove.dataset.snippetDel;
          remove.disabled = true;
          try {
            await WB.api.call('snippets.remove', { id });
            await this.load();
            const undo = async () => {
              await WB.api.call('snippets.restore', { id });
              await this.load();
            };
            WB.setUndo('删除片段', undo);
            WB.toast('片段已删除', { actionLabel: '撤销', onAction: undo });
          } catch {
            remove.disabled = false;
          }
        }
      });

      await this.load();
    },

    async load() {
      const el = this.el;
      if (!el || !el.isConnected) return;
      const params = {};
      if (this.query) params.query = this.query;
      if (this.kind) params.kind = this.kind;
      let data;
      try {
        data = await WB.api.call('snippets.list', params);
      } catch {
        return;
      }
      this.items = data.items;
      el.querySelector('[data-snippet-count]').textContent = `${data.items.length} 个`;
      const slot = el.querySelector('[data-slot="list"]');
      if (!data.items.length) {
        slot.innerHTML = WB.emptyState('还没有片段。', '把常用的话、命令或链接存进来，下次一键复制。');
        return;
      }
      slot.innerHTML = data.items.map((snippet) => {
        const tags = (snippet.tags || []).map((tag) => WB.chip(tag)).join('');
        return `
          <article class="snippet-card" data-snippet="${U.esc(snippet.id)}">
            <header class="snippet-head">
              <div>
                <p class="snippet-title">
                  <span class="kind">${kindLabel(snippet.kind)}</span>
                  ${U.esc(snippet.title)}
                </p>
                <div class="snippet-meta">
                  ${snippet.language ? `<span>${U.esc(snippet.language)}</span>` : ''}
                  ${snippet.url ? `<span class="snippet-url">${U.esc(snippet.url)}</span>` : ''}
                  ${tags}
                </div>
              </div>
              <div class="row-actions is-visible">
                <button class="icon-action" type="button" data-snippet-copy="${U.esc(snippet.id)}"
                        aria-label="复制片段" title="复制">⧉</button>
                <button class="icon-action" type="button" data-snippet-edit="${U.esc(snippet.id)}"
                        aria-label="编辑片段" title="编辑">✎</button>
                <button class="icon-action" type="button" data-snippet-del="${U.esc(snippet.id)}"
                        aria-label="删除片段" title="删除">×</button>
              </div>
            </header>
            ${snippet.url
              ? `<button class="snippet-link" type="button" data-snippet-open="${U.esc(snippet.id)}">${U.esc(snippet.url)}</button>`
              : `<pre class="snippet-content">${U.esc(snippet.content || '（空）')}</pre>`}
          </article>`;
      }).join('');
    },

    openEditor(snippet) {
      const view = this;
      const current = snippet || {
        id: '', title: '', content: '', kind: 'snippet', language: '', url: '', tags: [],
      };
      const editing = Boolean(snippet);
      const formId = 'snippet-edit-' + Math.random().toString(36).slice(2);
      WB.openModal({
        kicker: '片段',
        title: editing ? '编辑片段' : '新建片段',
        className: 'modal-snippet',
        body: `
          <form id="${formId}" class="edit-form">
            <div class="edit-grid">
              <label class="edit-field">
                <span class="edit-label">标题</span>
                <input class="field" name="title" value="${U.esc(current.title)}" maxlength="120" autofocus required>
              </label>
              <label class="edit-field">
                <span class="edit-label">类型</span>
                <select class="field" name="kind">
                  ${KINDS.map((kind) => `<option value="${kind.id}"${current.kind === kind.id ? ' selected' : ''}>${kind.label}</option>`).join('')}
                </select>
              </label>
              <label class="edit-field">
                <span class="edit-label">语言 / 环境</span>
                <input class="field" name="language" value="${U.esc(current.language || '')}" maxlength="30" placeholder="如 bash">
              </label>
              <label class="edit-field">
                <span class="edit-label">链接</span>
                <input class="field" name="url" value="${U.esc(current.url || '')}" placeholder="https://…">
              </label>
            </div>
            <label class="edit-field">
              <span class="edit-label">内容</span>
              <textarea class="field edit-textarea snippet-editor" name="content" rows="9">${U.esc(current.content || '')}</textarea>
            </label>
            <label class="edit-field">
              <span class="edit-label">标签</span>
              <input class="field" name="tags" value="${U.esc((current.tags || []).join(' '))}" placeholder="#标签，空格分隔">
            </label>
          </form>`,
        footer: `
          <div class="modal-foot-actions">
            <span class="muted small">⌘Enter 保存</span>
          </div>
          <div class="modal-foot-actions">
            <button class="btn ghost" type="button" data-cancel>取消</button>
            <button class="btn primary" type="submit" form="${formId}">保存</button>
          </div>`,
        onMount(el, close) {
          const form = el.querySelector('form');
          const save = async () => {
            const fd = new FormData(form);
            const payload = {
              title: String(fd.get('title') || '').trim(),
              kind: String(fd.get('kind') || 'snippet'),
              language: String(fd.get('language') || ''),
              url: String(fd.get('url') || ''),
              content: String(fd.get('content') || ''),
              tags: U.splitTags(fd.get('tags')),
            };
            if (!payload.title) {
              WB.toast('给片段起个标题吧。', { type: 'error' });
              return;
            }
            if (editing) await WB.api.call('snippets.update', { id: current.id, ...payload });
            else await WB.api.call('snippets.create', payload);
            WB.toast(editing ? '片段已保存' : '片段已创建');
            close();
            view.load();
          };
          form.addEventListener('submit', async (event) => {
            event.preventDefault();
            const button = el.querySelector('[type="submit"]');
            button.disabled = true;
            try {
              await save();
            } catch {
              button.disabled = false;
            }
          });
          form.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              form.requestSubmit();
            }
          });
          el.querySelector('[data-cancel]').addEventListener('click', close);
        },
      });
    },

    refresh() {
      return this.load();
    },
  };
})(window.WB = window.WB || {});
