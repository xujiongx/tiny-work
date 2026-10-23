(function (WB) {
  const U = WB.util;
  const V = WB.views = WB.views || {};

  V.settings = {
    el: null,
    info: null,

    async render(root) {
      const settings = WB.store.state.settings || {};

      root.innerHTML = `
        <div class="view">
          <div class="page settings-page">
            <header class="page-head">
              <div>
                <p class="page-kicker">本机 · 无账号 · 无云同步</p>
                <h1 class="page-title">设置</h1>
                <p class="page-sub">数据只在这台电脑上。随时可以备份，也可以把整份数据带走。</p>
              </div>
            </header>

            <section class="block settings-section">
              <header class="block-head"><h2>外观</h2></header>
              <div class="setting-row">
                <div>
                  <p class="setting-name">主题</p>
                  <p class="setting-hint">深色模式或跟随系统。</p>
                </div>
                <select class="field" data-setting="theme" aria-label="主题">
                  <option value="light"${settings.theme === 'light' ? ' selected' : ''}>浅色</option>
                  <option value="dark"${settings.theme === 'dark' ? ' selected' : ''}>深色</option>
                  <option value="auto"${settings.theme === 'auto' ? ' selected' : ''}>跟随系统</option>
                </select>
              </div>
            </section>

            <section class="block settings-section">
              <header class="block-head"><h2>记录</h2></header>
              <div class="setting-row">
                <div>
                  <p class="setting-name">一天的分界</p>
                  <p class="setting-hint">凌晨记录归到前一天。默认 0 点。</p>
                </div>
                <select class="field" data-setting="boundaryHour" aria-label="一天的分界">
                  ${[0, 1, 2, 3, 4, 5, 6].map((hour) => `
                    <option value="${hour}"${Number(settings.boundaryHour) === hour ? ' selected' : ''}>${hour}:00</option>
                  `).join('')}
                </select>
              </div>
              <div class="setting-row">
                <div>
                  <p class="setting-name">默认记录类型</p>
                  <p class="setting-hint">快速记录时预先选中的类型。</p>
                </div>
                <select class="field" data-setting="defaultKind" aria-label="默认记录类型">
                  ${WB.kinds.map((kind) => `
                    <option value="${kind.id}"${settings.defaultKind === kind.id ? ' selected' : ''}>${kind.label}</option>
                  `).join('')}
                </select>
              </div>
              <div class="setting-row">
                <div>
                  <p class="setting-name">每周起始日</p>
                  <p class="setting-hint">影响日历与周报的统计范围。</p>
                </div>
                <select class="field" data-setting="weekStart" aria-label="每周起始日">
                  <option value="1"${Number(settings.weekStart) !== 0 ? ' selected' : ''}>周一</option>
                  <option value="0"${Number(settings.weekStart) === 0 ? ' selected' : ''}>周日</option>
                </select>
              </div>
              <div class="setting-row">
                <div>
                  <p class="setting-name">完成任务时自动写一条完成记录</p>
                  <p class="setting-hint">已完成任务和今日页计数会联动；撤销完成时同步删除。</p>
                </div>
                <select class="field" data-setting="autoTaskEntry" aria-label="完成任务生成记录">
                  <option value="true"${settings.autoTaskEntry ? ' selected' : ''}>开启</option>
                  <option value="false"${!settings.autoTaskEntry ? ' selected' : ''}>关闭</option>
                </select>
              </div>
              <div class="setting-row">
                <div>
                  <p class="setting-name">默认专注时长</p>
                  <p class="setting-hint">今日页的专注入口会预选这个时长。</p>
                </div>
                <select class="field" data-setting="focusMinutes" aria-label="默认专注时长">
                  ${[15, 25, 45, 50, 90].map((minutes) => `
                    <option value="${minutes}"${Number(settings.focusMinutes) === minutes ? ' selected' : ''}>${minutes} 分钟</option>
                  `).join('')}
                </select>
              </div>
            </section>

            <section class="block settings-section">
              <header class="block-head"><h2>提醒与快捷键</h2></header>
              <div class="setting-row">
                <div>
                  <p class="setting-name">每日回顾提醒</p>
                  <p class="setting-hint">工作日到点发系统通知，点击打开日报。</p>
                </div>
                <select class="field" data-setting="reminderEnabled" aria-label="每日提醒">
                  <option value="true"${settings.reminderEnabled ? ' selected' : ''}>开启</option>
                  <option value="false"${!settings.reminderEnabled ? ' selected' : ''}>关闭</option>
                </select>
              </div>
              <div class="setting-row">
                <div>
                  <p class="setting-name">提醒时间</p>
                  <p class="setting-hint">只在周一到周五提醒。</p>
                </div>
                <input class="field" type="time" data-setting="reminderTime" value="${U.esc(settings.reminderTime)}" aria-label="提醒时间">
              </div>
              <div class="setting-row">
                <div>
                  <p class="setting-name">全局快速记录</p>
                  <p class="setting-hint">在任何应用前台都能唤起小窗。改完重启应用生效。</p>
                </div>
                <input class="field" data-setting="quickHotkey" value="${U.esc(settings.quickHotkey)}" aria-label="全局快捷键">
              </div>
            </section>

            <section class="block settings-section ai-settings">
              <header class="block-head">
                <h2>AI 助手</h2>
                <span class="ai-badge" data-ai-badge>读取中…</span>
              </header>
              <div class="ai-intro">
                <p>可选功能。配置一个 OpenAI 兼容接口后，日报、周报和绩效可以根据本机记录生成草稿并回填。</p>
                <p class="setting-hint">只有点击「AI 生成」时才会联网；API Key 保存在系统钥匙串，不写进数据库，也不会导出。</p>
              </div>
              <div class="setting-row">
                <div>
                  <p class="setting-name">启用 AI 生成</p>
                  <p class="setting-hint">关闭后所有 AI 按钮都会先提示去配置，不会发出请求。</p>
                </div>
                <select class="field" data-ai-enabled aria-label="启用 AI 生成">
                  <option value="false"${settings.aiEnabled ? '' : ' selected'}>关闭</option>
                  <option value="true"${settings.aiEnabled ? ' selected' : ''}>开启</option>
                </select>
              </div>
              <div class="setting-row">
                <div>
                  <p class="setting-name">接口地址</p>
                  <p class="setting-hint">默认使用 Agnes API Hub，也可以换成任意兼容 /chat/completions 的服务。</p>
                </div>
                <input class="field ai-field-wide" data-ai-base-url value="${U.esc(settings.aiBaseUrl || '')}"
                       aria-label="AI 接口地址" spellcheck="false">
              </div>
              <div class="setting-row">
                <div>
                  <p class="setting-name">模型</p>
                  <p class="setting-hint">例如 agnes-2.5-flash。需要与服务商提供的名称一致。</p>
                </div>
                <input class="field ai-field-wide" data-ai-model value="${U.esc(settings.aiModel || '')}"
                       aria-label="AI 模型" spellcheck="false">
              </div>
              <div class="setting-row">
                <div>
                  <p class="setting-name">API Key</p>
                  <p class="setting-hint" data-ai-key-hint>正在读取钥匙串…</p>
                </div>
                <div class="setting-side ai-key-side">
                  <input class="field ai-field-key" type="password" data-ai-key autocomplete="off"
                         placeholder="粘贴 API Key" aria-label="AI API Key">
                  <button class="btn ghost" type="button" data-ai-clear>清除</button>
                </div>
              </div>
              <div class="setting-row">
                <div>
                  <p class="setting-name">连接与保存</p>
                  <p class="setting-hint" data-ai-status>保存设置后可以测试接口。</p>
                </div>
                <div class="setting-side">
                  <button class="btn ghost" type="button" data-ai-test>测试连接</button>
                  <button class="btn primary" type="button" data-ai-save>保存 AI 设置</button>
                </div>
              </div>
              <p class="ai-privacy">隐私说明：生成时会把你选择范围内的记录内容发送到上面的接口。应用不会在后台自动调用，也不会把数据发到其他地址。</p>
            </section>

            <section class="block settings-section">
              <header class="block-head"><h2>数据</h2></header>
              <div class="setting-row">
                <div>
                  <p class="setting-name">数据文件夹</p>
                  <p class="setting-hint" data-info-path>读取中…</p>
                </div>
                <button class="btn ghost" type="button" data-reveal>在访达中显示</button>
              </div>
              <div class="setting-row">
                <div>
                  <p class="setting-name">数据库</p>
                  <p class="setting-hint"><span data-info-size>—</span> · <span data-info-db>—</span> · <span data-info-counts>—</span></p>
                </div>
                <button class="btn ghost" type="button" data-backup>立即备份</button>
              </div>
              <div class="setting-row">
                <div>
                  <p class="setting-name">最近备份</p>
                  <p class="setting-hint" data-info-backup>读取中…</p>
                </div>
                <div class="setting-side">
                  <span class="setting-value" data-backup-count></span>
                  <select class="field" data-setting="backupKeep" aria-label="备份保留份数">
                    ${[3, 5, 7, 10, 14].map((n) => `<option value="${n}"${Number(settings.backupKeep) === n ? ' selected' : ''}>保留 ${n} 份</option>`).join('')}
                  </select>
                </div>
              </div>
              <div class="setting-row">
                <div>
                  <p class="setting-name">导出全部数据</p>
                  <p class="setting-hint">JSON 包含记录、任务、项目、日报、片段和设置。</p>
                </div>
                <button class="btn ghost" type="button" data-export>导出 JSON</button>
              </div>
              <div class="setting-row">
                <div>
                  <p class="setting-name">导入旧便签</p>
                  <p class="setting-hint">文本或 Markdown 文件，每行作为一条“想法”记录导入今天。</p>
                </div>
                <button class="btn ghost" type="button" data-import-lines>选择 .txt / .md</button>
              </div>
              <div class="setting-row">
                <div>
                  <p class="setting-name">导入数据</p>
                  <p class="setting-hint">合并会保留现有数据；替换会先自动备份再覆盖。</p>
                </div>
                <div class="setting-side">
                  <select class="field" data-import-mode aria-label="导入方式">
                    <option value="merge">合并</option>
                    <option value="replace">替换</option>
                  </select>
                  <button class="btn ghost" type="button" data-import>选择文件导入</button>
                </div>
              </div>
            </section>

            <section class="block settings-section">
              <header class="block-head"><h2>关于</h2></header>
              <div class="setting-row">
                <div>
                  <p class="setting-name">案头 · 个人工作台</p>
                  <p class="setting-hint">本地优先，键盘优先。数据不会离开这台电脑。</p>
                </div>
                <span class="setting-value" data-info-version>—</span>
              </div>
            </section>
          </div>
        </div>`;

      const el = root.firstElementChild;
      this.el = el;

      el.querySelectorAll('[data-setting]').forEach((field) => {
        const eventName = field.dataset.setting === 'quickHotkey' || field.type === 'time' ? 'change' : 'change';
        field.addEventListener(eventName, async () => {
          const key = field.dataset.setting;
          let value = field.value;
          if (key === 'boundaryHour' || key === 'weekStart' || key === 'focusMinutes' || key === 'backupKeep') {
            value = Number(value);
          }
          if (key === 'autoTaskEntry' || key === 'reminderEnabled') value = value === 'true';
          try {
            const updated = await WB.api.call('settings.set', { patch: { [key]: value } });
            WB.store.set({ settings: updated });
            if (WB.applyTheme) WB.applyTheme(updated);
            WB.toast('已保存');
            if (key === 'quickHotkey' && WB.registerGlobalHotkey) {
              await WB.registerGlobalHotkey(updated.quickHotkey);
            }
          } catch {
            field.value = WB.store.state.settings[key];
          }
        });
      });

      const aiPayload = () => ({
        enabled: el.querySelector('[data-ai-enabled]').value === 'true',
        baseUrl: el.querySelector('[data-ai-base-url]').value,
        model: el.querySelector('[data-ai-model]').value,
        apiKey: el.querySelector('[data-ai-key]').value.trim(),
      });

      el.querySelector('[data-ai-save]').addEventListener('click', async (event) => {
        const button = event.currentTarget;
        await WB.ai.withButton(button, '保存中…', async () => {
          const status = await WB.api.call('ai.save', aiPayload());
          WB.ai.setStatus(status);
          WB.store.set({
            settings: {
              ...(WB.store.state.settings || {}),
              aiEnabled: status.enabled,
              aiBaseUrl: status.baseUrl,
              aiModel: status.model,
            },
          });
          await this.loadAi();
          WB.toast('AI 设置已保存');
        }).catch(() => {});
      });

      el.querySelector('[data-ai-test]').addEventListener('click', async (event) => {
        const button = event.currentTarget;
        await WB.ai.withButton(button, '连接中…', async () => {
          const result = await WB.api.call('ai.test', aiPayload());
          const statusNode = el.querySelector('[data-ai-status]');
          if (statusNode) statusNode.textContent = `连接正常 · ${result.model} · ${result.latencyMs}ms`;
          WB.toast(`AI 连接正常 · ${result.model}`);
        }).catch(() => {});
      });

      el.querySelector('[data-ai-clear]').addEventListener('click', async (event) => {
        const confirmed = await tiny.dialog.confirm('清除保存在钥匙串里的 API Key？', {
          detail: '清除后 AI 按钮会提示重新配置。接口地址、模型和其他数据不受影响。',
          ok: '清除',
          cancel: '取消',
        });
        if (!confirmed) return;
        const button = event.currentTarget;
        await WB.ai.withButton(button, '清除中…', async () => {
          const status = await WB.api.call('ai.clearKey', {});
          WB.ai.setStatus(status);
          await this.loadAi();
          WB.toast('API Key 已清除');
        }).catch(() => {});
      });

      el.querySelector('[data-export]').addEventListener('click', async (event) => {
        const button = event.currentTarget;
        button.disabled = true;
        try {
          const name = `案头-导出-${U.dateKeyOf(new Date()).replace(/-/g, '')}.json`;
          const path = await tiny.dialog.saveFile({ types: ['json'], name });
          if (!path) return;
          const result = await WB.api.call('data.exportJson', { path });
          WB.toast(`已导出 · ${U.fmtBytes(result.size)}`);
        } finally {
          button.disabled = false;
        }
      });

      el.querySelector('[data-import-lines]').addEventListener('click', async (event) => {
        const button = event.currentTarget;
        let path;
        try {
          path = await tiny.dialog.openFile({ types: ['txt', 'md'] });
        } catch {
          WB.toast('没能打开文件选择器。', { type: 'error' });
          return;
        }
        if (!path) return;
        const confirmed = await tiny.dialog.confirm('把旧便签导入今天？', {
          detail: '每一行会变成一条“想法”记录，并打上“旧便签”标签。原有数据不会受影响。',
          ok: '导入',
          cancel: '取消',
        });
        if (!confirmed) return;
        button.disabled = true;
        try {
          const result = await WB.api.call('data.importLines', { path, date: U.todayKey() });
          WB.toast(`已导入 ${result.imported} 条旧便签`);
        } finally {
          button.disabled = false;
        }
      });

      el.querySelector('[data-import]').addEventListener('click', async (event) => {
        const button = event.currentTarget;
        const mode = el.querySelector('[data-import-mode]').value;
        let path;
        try {
          path = await tiny.dialog.openFile({ types: ['json'] });
        } catch {
          WB.toast('没能打开文件选择器。', { type: 'error' });
          return;
        }
        if (!path) return;
        const confirmed = await tiny.dialog.confirm(
          mode === 'replace' ? '替换当前全部数据？' : '把文件合并进当前数据？',
          {
            detail: mode === 'replace'
              ? '会先自动备份当前数据库，再用文件里的数据替换。原有记录将不再出现在应用里。'
              : '相同 ID 的记录会被文件里的版本覆盖，其他数据保留。导入前会自动备份。',
            ok: '开始导入',
            cancel: '取消',
          }
        );
        if (!confirmed) return;
        button.disabled = true;
        button.textContent = '导入中…';
        try {
          const result = await WB.api.call('data.importJson', { path, mode });
          const counts = result.imported || {};
          WB.toast(`导入完成：${counts.entries || 0} 条记录 · ${counts.tasks || 0} 个任务`);
          setTimeout(() => window.location.reload(), 500);
        } catch {
          button.disabled = false;
          button.textContent = '选择文件导入';
        }
      });

      el.querySelector('[data-backup]').addEventListener('click', async (event) => {
        const button = event.currentTarget;
        button.disabled = true;
        try {
          const result = await WB.api.call('backup.now', {});
          await this.loadInfo();
          WB.toast(`已备份 · ${U.fmtBytes(result.size)}`);
        } finally {
          button.disabled = false;
        }
      });

      el.querySelector('[data-reveal]').addEventListener('click', async () => {
        if (!this.info) return;
        try {
          await tiny.app.shell.reveal(this.info.dataDir);
        } catch {
          WB.toast('没能打开文件夹。', { type: 'error' });
        }
      });

      await this.loadInfo();
      await this.loadAi();
    },

    async loadAi() {
      const el = this.el;
      if (!el || !el.isConnected) return;
      try {
        const status = await WB.api.call('ai.status', {}, { silent: true });
        this.ai = status;
        WB.ai.setStatus(status);
        const enabled = el.querySelector('[data-ai-enabled]');
        const baseUrl = el.querySelector('[data-ai-base-url]');
        const model = el.querySelector('[data-ai-model]');
        const key = el.querySelector('[data-ai-key]');
        const badge = el.querySelector('[data-ai-badge]');
        const keyHint = el.querySelector('[data-ai-key-hint]');
        const statusNode = el.querySelector('[data-ai-status]');
        if (enabled && document.activeElement !== enabled) {
          enabled.value = status.enabled ? 'true' : 'false';
        }
        if (baseUrl && document.activeElement !== baseUrl) baseUrl.value = status.baseUrl || '';
        if (model && document.activeElement !== model) model.value = status.model || '';
        if (key) {
          key.value = '';
          key.placeholder = status.hasKey
            ? `已保存（${status.keyHint}），留空保持不变`
            : '粘贴 API Key';
        }
        if (badge) {
          badge.className = 'ai-badge'
            + (status.secretError ? ' is-warn' : status.enabled && status.hasKey ? ' is-on' : '');
          badge.textContent = status.secretError
            ? '钥匙串异常'
            : !status.enabled
              ? '未启用'
              : status.hasKey ? '已配置' : '缺少 API Key';
        }
        if (keyHint) {
          keyHint.textContent = status.secretError
            || (status.hasKey
              ? `已保存在系统钥匙串（${status.keyHint}），留空保持不变。`
              : '还没有保存。填写后点「保存 AI 设置」。');
        }
        if (statusNode) {
          statusNode.textContent = status.secretError
            || (!status.enabled
              ? 'AI 生成已关闭。'
              : status.hasKey
                ? `${status.model} · 已就绪`
                : '已启用，但还缺少 API Key。');
        }
        WB.store.set({
          settings: {
            ...(WB.store.state.settings || {}),
            aiEnabled: status.enabled,
            aiBaseUrl: status.baseUrl,
            aiModel: status.model,
          },
        });
      } catch {
        const badge = el.querySelector('[data-ai-badge]');
        if (badge) {
          badge.className = 'ai-badge is-warn';
          badge.textContent = '读取失败';
        }
        const statusNode = el.querySelector('[data-ai-status]');
        if (statusNode) statusNode.textContent = 'AI 设置读取失败，可以稍后重试。';
      }
    },

    async loadInfo() {
      const el = this.el;
      if (!el || !el.isConnected) return;
      try {
        const [info, backups, stats] = await Promise.all([
          WB.api.call('data.info', {}),
          WB.api.call('backup.list', {}),
          WB.api.call('data.stats', {}, { silent: true }),
        ]);
        this.info = info;
        el.querySelector('[data-info-path]').textContent = info.dataDir;
        el.querySelector('[data-info-size]').textContent = U.fmtBytes(info.dbSize);
        el.querySelector('[data-info-db]').textContent = info.dbPath.split('/').pop();
        el.querySelector('[data-info-counts]').textContent = `${stats.entries} 条记录 · ${stats.tasks} 个任务`;
        el.querySelector('[data-info-backup]').textContent = info.backupAt
          ? `${U.fmtDateTime(info.backupAt)} · ${U.fmtBytes(backups.items[0].size)}`
          : '还没有备份';
        el.querySelector('[data-backup-count]').textContent = `${backups.items.length} 份`;
        el.querySelector('[data-info-version]').textContent = `v${info.appVersion} · tinyjs ${info.tinyjsVersion}`;
      } catch {
        el.querySelector('[data-info-path]').textContent = '读取失败';
      }
    },

    refresh() {
      return Promise.all([this.loadInfo(), this.loadAi()]);
    },
  };
})(window.WB = window.WB || {});
