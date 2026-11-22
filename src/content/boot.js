/**
 * boot.js — 首帧遮罩：让首页看起来像「直接打开工作台」，而不是先闪一下原生首页。
 *
 * content script 最早只能注入到 document_start，而工作台要等 DOM 就绪、
 * 设置从 chrome.storage 读出来才能挂。中间这段时间 GitHub 的原生页面已经
 * 画出来了，用户就会看到「首页 → 被替换成工作台」。这里在 document_start
 * 先给 <html> 加 .ghw-booting（配合 boot.css 整屏盖住），index.js 挂载完
 * 再撤掉，观感上就是直接进工作台。
 *
 * 遮罩是「先盖后验」，所以每条异常路径都必须能自己撤：
 *   - 首屏加载阶段无法同步知道是否登录，先盖住；DOMContentLoaded 时看
 *     <meta name="user-login">，没有就立刻撤（未登录的营销首页不受影响）
 *   - 站内 Turbo 跳转时 head 已经稳定，直接按登录态决定盖不盖
 *   - index.js 挂载完成 / 确认不接管后主动撤
 *   - 4 秒还没挂上 → 超时兜底，退回原生首页
 * 宁可闪一下，也不能白屏。
 */
(function () {
  'use strict';

  var GHW = (window.GHW = window.GHW || {});
  var HOME = { '/': 1, '/dashboard': 1 };
  var MAX_HOLD = 4000;

  var html = document.documentElement;
  var holdTimer = 0;
  var verifyBound = false;

  function pathOf(href) {
    try {
      return new URL(href || location.href, location.origin).pathname;
    } catch (e) {
      return location.pathname;
    }
  }

  function isHome(href) {
    var p = pathOf(href).replace(/\/+$/, '');
    return !!HOME[p || '/'];
  }

  /** 首页的登录态标记，服务端渲染在 <head> 里，index.js 也用它 */
  function login() {
    var meta = document.querySelector('meta[name="user-login"]');
    var v = meta && meta.getAttribute('content');
    return v ? v.trim() : '';
  }

  function isVeiled() {
    return !!html && html.classList.contains('ghw-booting');
  }

  function reveal(reason) {
    if (holdTimer) clearTimeout(holdTimer);
    holdTimer = 0;
    if (!isVeiled()) return;
    html.classList.remove('ghw-booting');
    console.info('[GitHub Workbench] 撤掉首帧遮罩' + (reason ? '：' + reason : ''));
  }

  /** head 解析完再确认一次登录态，未登录就把营销首页放出来 */
  function verifyLogin() {
    if (!login()) reveal('未登录');
  }

  /** 盖住页面；href 传目标地址（Turbo 跳转时当前地址还没变） */
  function veil(href, force) {
    if (!html || !isHome(href)) return;

    // bfcache 恢复时工作台还在 DOM 里（脚本不会重跑），别再盖一层白
    if (!force && document.getElementById('ghw-root')) return;

    if (document.readyState === 'loading') {
      // 首屏：head 还没解析完，同步拿不到登录态，先盖住再说
      if (!verifyBound) {
        verifyBound = true;
        document.addEventListener('DOMContentLoaded', verifyLogin, { once: true });
      }
    } else if (!login()) {
      // SPA 跳转：head 已经稳定，不是登录态就别盖
      return;
    }

    if (!isVeiled()) {
      console.info('[GitHub Workbench] 首帧遮罩已加 · ' + pathOf(href || location.href));
    }
    html.classList.add('ghw-booting');
    if (holdTimer) clearTimeout(holdTimer);
    holdTimer = setTimeout(function () {
      reveal('4 秒内没有挂载成功');
    }, MAX_HOLD);
  }

  GHW.boot = { veil: veil, reveal: reveal, isHome: isHome, login: login };

  veil();

  // 总开关关掉时立刻撤，别让用户对着遮罩发呆
  try {
    if (chrome && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get('ghw:settings', function (res) {
        var s = res && res['ghw:settings'];
        if (s && s.enabled === false) reveal('总开关已关闭');
      });
    }
  } catch (e) {
    /* 预览页 / 普通网页调试时没有 chrome.* */
  }

  // Turbo 站内跳转：去首页的路上先盖住，离开首页立刻撤
  document.addEventListener('turbo:visit', function (e) {
    var url = e && e.detail && e.detail.url;
    if (url && isHome(url)) veil(url, true);
    else reveal('离开首页');
  });

  document.addEventListener('turbo:load', function () {
    if (!isHome()) reveal('离开首页');
  });

  document.addEventListener('pjax:end', function () {
    if (!isHome()) reveal('离开首页');
  });

  // 从 bfcache 回来时工作台还在，直接放出来
  window.addEventListener('pageshow', function (e) {
    if (e && e.persisted) reveal('bfcache 恢复');
  });
})();
