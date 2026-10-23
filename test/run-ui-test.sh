#!/bin/sh
# Run the self-driving UI test in a real tinyjs window.
#
# tinyjs copies TINYJS_HTML into a temp dir and the WebView may not read files
# outside that dir, so the page is generated as ONE self-contained HTML file:
# CSS and every frontend script are inlined. No external requests.

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
OUT="$TMP/ui.html"
FE="$ROOT/src/frontend"

{
  printf '%s\n' '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">'
  printf '%s\n' '<title>案头 UI 测试</title><style>'
  cat "$FE/style.css"
  printf '%s\n' '</style></head><body>'
  cat <<'HTML'
<aside class="rail">
  <div class="brand"><p class="brand-name">案头</p><p class="brand-sub">UI TEST</p></div>
  <nav class="nav">
    <a href="#/today" data-nav="today">今日</a>
    <a href="#/journal" data-nav="journal">记录</a>
    <a href="#/tasks" data-nav="tasks">任务</a>
    <a href="#/projects" data-nav="projects">项目</a>
    <a href="#/review" data-nav="review">回顾</a>
    <a href="#/performance" data-nav="performance">绩效</a>
    <a href="#/snippets" data-nav="snippets">片段</a>
    <a href="#/settings" data-nav="settings">设置</a>
  </nav>
  <div class="rail-foot">
    <div class="rail-counts" data-rail-counts>—</div>
    <div class="rail-status" data-saved>—</div>
  </div>
</aside>
<main class="main" id="view"></main>
<div id="toasts" class="toasts" aria-live="polite"></div>
HTML

  for f in \
    js/util.js js/api.js js/store.js js/components.js js/ai.js \
    js/views/today.js js/views/journal.js js/views/tasks.js \
    js/views/projects.js js/views/review.js js/views/performance.js js/views/snippets.js js/views/settings.js \
    app.js
  do
    printf '<script>\n'
    cat "$FE/$f"
    printf '\n</script>\n'
  done

  printf '<script>\n'
  cat "$ROOT/test/ui.test.js"
  printf '\n</script>\n</body></html>\n'
} > "$OUT"

echo "==> UI test page: $OUT"
TINYJS_HTML="$OUT" tinyjs dev
