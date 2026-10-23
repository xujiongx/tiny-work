(function (WB) {
  const U = {};

  U.esc = function (value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  };

  U.qs = (selector, root) => (root || document).querySelector(selector);
  U.qsa = (selector, root) => Array.from((root || document).querySelectorAll(selector));

  U.pad2 = (n) => String(n).padStart(2, '0');

  U.dateKeyOf = function (date) {
    return `${date.getFullYear()}-${U.pad2(date.getMonth() + 1)}-${U.pad2(date.getDate())}`;
  };

  U.todayKey = function () {
    const d = new Date();
    const settings = WB.store && WB.store.state ? WB.store.state.settings : null;
    const boundary = settings ? Number(settings.boundaryHour) || 0 : 0;
    if (boundary > 0 && d.getHours() < boundary) d.setDate(d.getDate() - 1);
    return U.dateKeyOf(d);
  };

  U.parseKey = function (key) {
    const [y, m, d] = String(key).split('-').map(Number);
    return new Date(y, m - 1, d);
  };

  U.addDays = function (key, days) {
    const d = U.parseKey(key);
    d.setDate(d.getDate() + days);
    return U.dateKeyOf(d);
  };

  U.weekdayCN = function (key) {
    return ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][U.parseKey(key).getDay()];
  };

  U.weekdayShort = function (key) {
    return ['日', '一', '二', '三', '四', '五', '六'][U.parseKey(key).getDay()];
  };

  U.fmtHead = function (key) {
    const d = U.parseKey(key);
    return `${d.getMonth() + 1} 月 ${d.getDate()} 日 · ${U.weekdayCN(key)}`;
  };

  U.fmtShort = function (key) {
    const d = U.parseKey(key);
    return `${U.pad2(d.getMonth() + 1)}-${U.pad2(d.getDate())}`;
  };

  U.fmtTime = function (ts) {
    const d = new Date(ts);
    return `${U.pad2(d.getHours())}:${U.pad2(d.getMinutes())}`;
  };

  U.fmtDateTime = function (ts) {
    if (!ts) return '—';
    const d = new Date(ts);
    return `${U.fmtShort(U.dateKeyOf(d))} ${U.fmtTime(ts)}`;
  };

  U.fmtMinutes = function (minutes) {
    const n = Number(minutes) || 0;
    if (!n) return '0';
    if (n < 60) return `${n} 分钟`;
    const hours = n / 60;
    return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} 小时`;
  };

  U.fmtBytes = function (bytes) {
    const n = Number(bytes) || 0;
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
  };

  U.startOfWeek = function (key, weekStart) {
    const start = weekStart === 0 ? 0 : 1;
    const d = U.parseKey(key);
    const diff = (d.getDay() - start + 7) % 7;
    d.setDate(d.getDate() - diff);
    return U.dateKeyOf(d);
  };

  U.monthKey = (key) => String(key).slice(0, 7);

  U.monthLabel = function (monthKey) {
    const [y, m] = String(monthKey).split('-').map(Number);
    return `${y} 年 ${m} 月`;
  };

  U.addMonths = function (monthKey, delta) {
    const [y, m] = String(monthKey).split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return `${d.getFullYear()}-${U.pad2(d.getMonth() + 1)}`;
  };

  U.monthMatrix = function (monthKey, weekStart) {
    const [y, m] = String(monthKey).split('-').map(Number);
    const first = new Date(y, m - 1, 1);
    const start = weekStart === 0 ? 0 : 1;
    const offset = (first.getDay() - start + 7) % 7;
    const cursor = new Date(y, m - 1, 1 - offset);
    const days = [];
    for (let i = 0; i < 42; i += 1) {
      days.push({
        key: U.dateKeyOf(cursor),
        day: cursor.getDate(),
        inMonth: cursor.getMonth() === m - 1,
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    return days;
  };

  U.weekdayHeaders = function (weekStart) {
    const labels = ['一', '二', '三', '四', '五', '六', '日'];
    if (weekStart === 0) return ['日', '一', '二', '三', '四', '五', '六'];
    return labels;
  };

  U.debounce = function (fn, wait) {
    let timer = null;
    return function debounced(...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), wait);
    };
  };

  U.autoGrow = function (textarea, max) {
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, max || 180) + 'px';
  };

  U.isComposing = function (event) {
    return event.isComposing || event.keyCode === 229;
  };

  U.splitTags = function (value) {
    return String(value || '')
      .split(/[,，\s]+/)
      .map((tag) => tag.trim().replace(/^#/, ''))
      .filter(Boolean);
  };

  U.pct = function (part, total) {
    if (!total) return 0;
    return Math.max(2, Math.round((part / total) * 100));
  };

  WB.util = U;
})(window.WB = window.WB || {});
