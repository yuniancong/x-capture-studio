/* Small, local startup sentinel. No page-world dependency, network, canvas or fonts. */
var __XC_STAY_BOOT__ = (function () {
  'use strict';
  var VERSION = '1.0.0-rc.5';
  var root = globalThis;
  try { if (root.__xcStayBootV3) root.__xcStayBootV3.dispose(); } catch (_) {}
  var state = { stage: 'START', error: '', events: [], started: Date.now() };
  var disposed = false, sentinel, timer, handlers = {}, menuFailures = 0;
  function safeError(error) {
    return String(error && error.message || error || '')
      .replace(/https?:\/\/[^\s)]+/g, function (u) { return u.split('?')[0].split('#')[0]; })
      .replace(/(Bearer\s+)[A-Za-z0-9._~+\/-]+/gi, '$1<redacted>')
      .replace(/((?:api[_-]?key|access[_-]?token|authorization|password|cookie)\s*[=:]\s*)[^\s,;]+/gi, '$1<redacted>')
      .slice(0, 350);
  }
  function info() {
    try { return typeof GM_info !== 'undefined' ? GM_info : typeof GM !== 'undefined' ? GM.info || {} : {}; } catch (_) { return {}; }
  }
  function log(stage, message) {
    if (stage !== 'CHECK') state.stage = stage;
    var entry = '[X Capture ' + VERSION + '] ' + stage + (message ? ' ' + message : '');
    state.events.push(entry); if (state.events.length > 12) state.events.shift();
    try { console.info(entry); } catch (_) {}
    try {
      if (typeof GM_log === 'function') {
        var result = GM_log(entry);
        if (result && typeof result.catch === 'function') result.catch(function () {});
      }
    } catch (_) {}
  }
  function report() {
    var host = info(), n = 0, buttons = 0;
    try { n = document.querySelectorAll('article[data-testid="tweet"]').length; buttons = document.querySelectorAll('[data-xcapture-ui="button"]').length; } catch (_) {}
    return 'X Capture ' + VERSION + '\n'
      + '最近执行阶段：' + state.stage + '\n'
      + '管理器：' + String(host.scriptHandler || '未提供') + ' ' + String(host.version || '') + '\n'
      + '网站：' + location.hostname + '\n页面：' + document.readyState + '\n'
      + '帖子容器：' + n + '；帖子按钮：' + buttons + '\n'
      + '独立入口：' + (document.querySelector('[data-xcapture-ui="launcher"]') ? '已挂载' : '未挂载') + '\n'
      + '编辑器：' + (document.querySelector('[data-xcapture-ui="studio"]') ? '已挂载' : '未挂载') + '\n'
      + '菜单注册失败：' + menuFailures + '\n'
      + '最近错误：' + (state.error || '无') + '\n\n'
      + state.events.join('\n') + '\n\n'
      + '本报告不读取 Cookie、登录凭证或帖文正文。';
  }
  function diagnose() {
    log('CHECK', '手动自检');
    alert(report());
  }
  function mountSentinel() {
    if (disposed || document.querySelector('[data-xcapture-ui="launcher"]')) return;
    if (sentinel && sentinel.isConnected) return;
    var parent = document.body || document.documentElement; if (!parent) return;
    sentinel = document.createElement('button'); sentinel.type = 'button';
    sentinel.setAttribute('data-xcapture-ui', 'stay-startup'); sentinel.setAttribute('aria-label', 'X Capture 启动自检');
    sentinel.textContent = state.error ? 'X Capture · 启动错误 · 点此查看' : 'X Capture · 启动检查';
    sentinel.style.cssText = 'all:initial;position:fixed!important;top:72px!important;right:12px!important;z-index:2147483647!important;display:block!important;background:#122b40!important;color:white!important;border:2px solid #38bdf8!important;border-radius:14px!important;padding:12px 16px!important;font:600 14px -apple-system,Arial,sans-serif!important;box-shadow:0 3px 15px #0006!important;pointer-events:auto!important;';
    sentinel.addEventListener('click', diagnose); parent.appendChild(sentinel);
  }
  function register(label, fn) {
    try {
      var modern = typeof GM !== 'undefined' ? GM : undefined;
      var legacy = typeof GM_registerMenuCommand === 'function' ? GM_registerMenuCommand : undefined;
      var result = legacy ? legacy(label, fn) : modern && typeof modern.registerMenuCommand === 'function' ? modern.registerMenuCommand(label, fn) : undefined;
      if (!legacy && !(modern && typeof modern.registerMenuCommand === 'function')) { menuFailures++; return; }
      if (result && typeof result.catch === 'function') result.catch(function () { menuFailures++; });
    } catch (_) { menuFailures++; }
  }
  var api = {
    report: report,
    diagnose: diagnose,
    bind: function (value) { handlers = value; },
    markReady: function () {
      if (!document.querySelector('[data-xcapture-ui="launcher"]')) return;
      if (state.stage === 'START' || state.stage === 'BOOT_ERROR') log('READY', '独立入口已挂载');
      if (sentinel) sentinel.remove(); clearTimeout(timer);
    },
    fail: function (error) { state.error = safeError(error); log('BOOT_ERROR', state.error); mountSentinel(); },
    note: function (stage, message) {
      if (stage === 'OPEN_ERROR') state.error = safeError(message);
      if (stage === 'STUDIO') state.error = '';
      log(stage, safeError(message));
    },
    dispose: function () { disposed = true; clearTimeout(timer); if (sentinel) sentinel.remove(); }
  };
  root.__xcStayBootV3 = api;
  var host = info(); log('START', String(host.scriptHandler || 'userscript') + ' ' + String(host.version || ''));
  register('打开 X Capture', function () {
    if (disposed) return;
    if (typeof handlers.open === 'function') handlers.open(); else diagnose();
  });
  register('X Capture 启动自检', function () { if (!disposed) diagnose(); });
  timer = setTimeout(mountSentinel, 1500);
  return api;
})();
