(function (WB) {
  const U = WB.util;

  let cached = null;

  async function status(force) {
    if (cached && !force) return cached;
    const next = await WB.api.call('ai.status', {}, { silent: true });
    cached = next;
    return next;
  }

  function invalidate() {
    cached = null;
  }

  function setStatus(next) {
    if (next) cached = next;
  }

  async function ensure() {
    let current;
    try {
      current = await status(true);
    } catch (error) {
      WB.toast(error && error.message ? error.message : 'AI 设置读取失败。', { type: 'error' });
      return false;
    }
    if (current.enabled && current.hasKey) return true;

    const reason = current.secretError
      || (!current.enabled
        ? 'AI 助手还没有启用。'
        : '还没有保存 API Key。');
    WB.openModal({
      kicker: 'AI 助手',
      title: current.enabled ? '还差一个 API Key' : '先启用 AI 助手',
      className: 'modal-ai-setup',
      body: `
        <div class="ai-setup">
          <p class="ai-setup-text">${U.esc(reason)}</p>
          <p class="ai-setup-text">AI 生成是可选的。只有你点击生成按钮时，所选范围的记录才会发送给你配置的接口。API Key 保存在系统钥匙串，不会写进数据库。</p>
          <div class="ai-setup-steps">
            <span>1. 在设置里启用 AI 助手</span>
            <span>2. 填写 OpenAI 兼容接口地址与模型</span>
            <span>3. 保存 API Key，再回来生成</span>
          </div>
        </div>`,
      footer: `
        <div class="modal-foot-actions">
          <button class="btn ghost" type="button" data-ai-later>取消</button>
          <button class="btn primary" type="button" data-ai-settings>去设置</button>
        </div>`,
      onMount(el, close) {
        el.querySelector('[data-ai-later]').addEventListener('click', close);
        el.querySelector('[data-ai-settings]').addEventListener('click', () => {
          close();
          WB.go('settings');
          setTimeout(() => {
            const section = document.querySelector('.ai-settings');
            if (section) section.scrollIntoView({ block: 'center', behavior: 'smooth' });
          }, 120);
        });
      },
    });
    return false;
  }

  async function withButton(button, label, task) {
    const oldLabel = button ? button.textContent : '';
    if (button) {
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      button.textContent = label;
    }
    try {
      return await task();
    } finally {
      if (button && button.isConnected) {
        button.disabled = false;
        button.removeAttribute('aria-busy');
        button.textContent = oldLabel;
      }
    }
  }

  function preview(options) {
    const opts = options || {};
    const fields = Array.isArray(opts.fields) ? opts.fields : [];
    const body = `
      <div class="ai-preview">
        ${opts.sub ? `<p class="ai-preview-sub">${U.esc(opts.sub)}</p>` : ''}
        ${fields.map((field, index) => `
          <label class="ai-preview-field">
            <span class="edit-label">${U.esc(field.label || '')}</span>
            <textarea class="field edit-textarea" data-ai-field="${index}" rows="${field.rows || 4}"
                      maxlength="${field.maxlength || 4000}"
                      placeholder="${U.esc(field.placeholder || '')}">${U.esc(field.value || '')}</textarea>
            ${field.help ? `<span class="setting-hint">${U.esc(field.help)}</span>` : ''}
          </label>`).join('')}
        <p class="ai-preview-privacy">这是 AI 建议，填入后仍可以继续修改；不会自动上传或保存到别处。</p>
      </div>`;

    return WB.openModal({
      kicker: opts.kicker || 'AI 建议',
      title: opts.title || 'AI 草稿',
      className: 'modal-ai-preview',
      body,
      footer: `
        <div class="modal-foot-actions">
          <button class="btn ghost" type="button" data-ai-cancel>取消</button>
          <button class="btn primary" type="button" data-ai-apply>${U.esc(opts.applyLabel || '填入表单')}</button>
        </div>`,
      onMount(el, close) {
        fields.forEach((field, index) => {
          const node = el.querySelector(`[data-ai-field="${index}"]`);
          if (node && field.rows) U.autoGrow(node, 260);
        });
        el.querySelector('[data-ai-cancel]').addEventListener('click', close);
        const apply = el.querySelector('[data-ai-apply]');
        apply.addEventListener('click', async () => {
          const values = {};
          fields.forEach((field, index) => {
            const node = el.querySelector(`[data-ai-field="${index}"]`);
            const raw = node ? node.value : '';
            values[field.key] = field.lines
              ? raw.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)
              : raw.trim();
          });
          apply.disabled = true;
          apply.textContent = '填入中…';
          try {
            if (typeof opts.onApply === 'function') await opts.onApply(values);
            close();
          } catch {
            apply.disabled = false;
            apply.textContent = opts.applyLabel || '填入表单';
          }
        });
      },
    });
  }

  WB.ai = {
    status,
    ensure,
    invalidate,
    setStatus,
    withButton,
    preview,
  };
})(window.WB = window.WB || {});
