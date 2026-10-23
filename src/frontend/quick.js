(function (WB) {
  const U = WB.util;
  const kinds = [
    ['log', '进展'], ['done', '完成'], ['blocker', '阻塞'],
    ['idea', '想法'], ['meeting', '会议'], ['learning', '学习'],
  ];
  const input = document.querySelector('[data-quick-text]');
  const form = document.querySelector('[data-quick-form]');
  const kind = document.querySelector('[data-quick-kind]');
  const project = document.querySelector('[data-quick-project]');
  const status = document.querySelector('[data-quick-status]');
  const submit = form.querySelector('[type="submit"]');

  function fillKinds(selected) {
    kind.innerHTML = kinds.map(([value, label]) => (
      `<option value="${value}"${value === selected ? ' selected' : ''}>${label}</option>`
    )).join('');
  }

  function fillProjects(projects) {
    project.innerHTML = '<option value="">未归类</option>' + projects.map((item) => (
      `<option value="${U.esc(item.id)}">${U.esc(item.name)}</option>`
    )).join('');
  }

  async function applyTheme(settings) {
    const theme = (settings && settings.theme) || 'light';
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

  function fail(message) {
    status.textContent = message || '没能保存，请重试。';
    status.classList.add('is-error');
    input.focus();
  }

  function close() {
    try { tiny.win.close(); } catch { window.close(); }
  }

  async function boot() {
    fillKinds('log');
    try {
      const data = await tiny.api.call('bootstrap', {});
      applyTheme(data.settings);
      fillKinds((data.settings && data.settings.defaultKind) || 'log');
      fillProjects(data.projects || []);
      status.textContent = `${data.counts.entriesToday || 0} 条今天`;
    } catch (error) {
      fail(error && error.message ? error.message : '读取设置失败');
    }
    setTimeout(() => input.focus(), 60);
  }

  async function save() {
    const content = input.value.trim();
    if (!content) {
      input.classList.remove('is-nudge');
      void input.offsetWidth;
      input.classList.add('is-nudge');
      input.focus();
      return;
    }
    submit.disabled = true;
    status.classList.remove('is-error');
    status.textContent = '保存中…';
    try {
      await tiny.api.call('entries.create', {
        content,
        kind: kind.value,
        projectId: project.value || null,
      });
      status.textContent = '已记下';
      input.value = '';
      setTimeout(close, 180);
    } catch (error) {
      submit.disabled = false;
      fail(error && error.message ? error.message : '没能保存，请重试。');
    }
  }

  try {
    tiny.api.on('settings:changed', (settings) => applyTheme(settings));
  } catch {
    // Theme following is optional in this small window.
  }

  input.addEventListener('input', () => {
    U.autoGrow(input, 120);
    status.textContent = '';
    status.classList.remove('is-error');
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey && !U.isComposing(event)) {
      event.preventDefault();
      save();
    }
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    save();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });

  document.querySelector('[data-quick-close]').addEventListener('click', close);
  document.querySelector('[data-quick-text]').addEventListener('focus', function onFocus() {
    U.autoGrow(this, 120);
  });

  boot();
})(window.WB = window.WB || {});
