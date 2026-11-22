/**
 * index.js — 启动、路由监听、挂载/卸载。
 *
 * 只在 github.com/ 和 github.com/dashboard 上生效，其余页面什么都不做。
 * GitHub 是 Turbo 驱动的 SPA，所以既监听 turbo 事件，也做一次低成本的
 * location 轮询兜底（400ms 读一次字符串，几乎无开销）。
 */
(function () {
  'use strict';

  var GHW = window.GHW;
  if (!GHW || !GHW.api || !GHW.ui) return;

  var STORE = GHW.store;
  var API = GHW.api;
  var UI = GHW.ui;
  var h = GHW.util.h;

  var ROOT_ID = 'ghw-root';
  var HOME = { '/': 1, '/dashboard': 1 };

  var state = {
    settings: null,
    app: null,
    root: null,
    mounted: false,
    seq: 0
  };

  /* ------------------------------------------------------------ 路由判断 */

  function isHome() {
    var p = location.pathname.replace(/\/+$/, '');
    return !!HOME[p || '/'];
  }

  function hostEl() {
    return (
      document.querySelector('.application-main') ||
      (document.querySelector('main') && document.querySelector('main').parentElement) ||
      document.body
    );
  }

  /* ------------------------------------------------------------- 数据加载 */

  function activeSources() {
    var p = state.settings.panels;
    var list = ['profile'];
    if (p.contributions) list.unshift('contributions');
    if (p.repos) list.push('repos');
    if (p.assigned) list.push('assigned');
    if (p.review) list.push('review');
    if (p.opened) list.push('opened');
    if (p.notifications) list.push('notifications');
    return list;
  }

  function loadOne(name, force) {
    return API.load(name, state.settings, { force: !!force }).then(
      function (res) {
        if (!state.mounted || !state.app) return;
        state.app.apply(name, res);
        if (res.error) {
          state.app.setFooter('部分数据是旧缓存（' + (res.error.message || '抓取失败') + '）', true);
        }
      },
      function (err) {
        if (!state.mounted || !state.app) return;
        state.app.setError(name, err);
        state.app.setFooter('部分数据加载失败', true);
      }
    );
  }

  var pending = 0;

  function loadAll(opts) {
    opts = opts || {};
    var names = activeSources();
    pending = names.length;

    if (opts.force && state.app) {
      names.forEach(function (n) {
        state.app.setBusy(n);
      });
    }
    if (state.app) state.app.setFooter(opts.force ? '正在刷新…' : '正在加载…');

    names.forEach(function (name) {
      loadOne(name, opts.force).then(function () {
        pending--;
        if (pending > 0 || !state.mounted || !state.app) return;
        var t = new Date();
        var hh = String(t.getHours()).padStart(2, '0');
        var mm = String(t.getMinutes()).padStart(2, '0');
        if (!state.app.el.querySelector('.is-stale')) {
          state.app.setFooter('更新于 ' + hh + ':' + mm + ' · 缓存 ' + state.settings.refreshMinutes + ' 分钟');
        }
      });
    });
  }

  /* --------------------------------------------------------- 挂载 / 卸载 */

  function mount() {
    if (state.mounted || !isHome()) return;

    var login = API.getLogin();
    if (!login) return; // 没登录就不接管首页

    var host = hostEl();
    if (!host) return;

    var root = h('div', { id: ROOT_ID, class: 'ghw-root' });

    var app = UI.create({
      login: login,
      settings: state.settings,
      onRefresh: function () {
        loadAll({ force: true });
      },
      onRetry: function (name) {
        if (state.app) state.app.setBusy(name);
        loadOne(name, true);
      },
      onToggleNative: function () {
        var next = !state.settings.hideNative;
        STORE.saveSettings({ hideNative: next }).then(function (s) {
          state.settings = s;
          applyNativeVisibility();
        });
      }
    });

    root.appendChild(app.el);
    host.insertBefore(root, host.querySelector('main') || host.firstChild);

    state.root = root;
    state.app = app;
    state.mounted = true;

    // Turbo 换页后会换掉 .application-main，观察器要跟着换到新节点上
    observer.disconnect();
    observer.observe(host, { childList: true });

    applyNativeVisibility();
    loadAll({ force: false });
  }

  function applyNativeVisibility() {
    // 关掉 hideNative 时不是卸载，而是把原生内容露出来放到工作台下面 ——
    // 这样那个开关永远是双向可逆的，不用再去点扩展图标。
    var hide = !!state.settings.hideNative;
    document.documentElement.classList.toggle('ghw-native-hidden', hide);
    if (state.app) state.app.setNativeVisible(!hide);
  }

  function unmount() {
    if (state.root && state.root.parentNode) state.root.parentNode.removeChild(state.root);
    document.documentElement.classList.remove('ghw-native-hidden');
    state.root = null;
    state.app = null;
    state.mounted = false;
  }

  /* ---------------------------------------------------------- 生命周期 */

  var running = false;

  function ensure() {
    if (running) return;
    running = true;

    STORE.getSettings()
      .then(function (settings) {
        state.settings = settings;

        if (!settings.enabled) {
          unmount();
          return;
        }
        if (!isHome()) {
          unmount();
          return;
        }
        if (state.mounted && (!state.root || !state.root.isConnected)) {
          // 页面被 Turbo 换掉了，原来的节点已经不在文档里
          state.mounted = false;
          state.app = null;
          state.root = null;
        }
        if (state.mounted) {
          applyNativeVisibility();
          return;
        }
        mount();
      })
      .finally(function () {
        running = false;
      });
  }

  var lastHref = location.href;

  function tick() {
    if (location.href === lastHref) return;
    lastHref = location.href;
    if (state.mounted) unmount();
    // 等 GitHub 把新页面渲染完
    setTimeout(ensure, 120);
  }

  setInterval(tick, 400);
  document.addEventListener('turbo:load', ensure);
  document.addEventListener('turbo:render', ensure);
  document.addEventListener('pjax:end', ensure);
  document.addEventListener('turbo:before-render', function () {
    if (state.mounted) unmount();
  });

  // React 重新渲染时可能把我们的节点挤掉，或者又把原生内容塞回来
  var observer = new MutationObserver(function () {
    if (state.mounted && (!state.root || !state.root.isConnected)) {
      state.mounted = false;
      state.app = null;
      state.root = null;
      ensure();
      return;
    }
    if (state.mounted && state.settings.hideNative) {
      if (!document.documentElement.classList.contains('ghw-native-hidden')) {
        document.documentElement.classList.add('ghw-native-hidden');
      }
    }
  });

  function startObserving() {
    var host = hostEl();
    if (host) observer.observe(host, { childList: true });
  }

  // 扩展弹窗里改了设置，立即生效
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area !== 'local' || !changes['ghw:settings']) return;
      STORE.getSettings().then(function (s) {
        var needRemount =
          state.settings &&
          JSON.stringify(state.settings.panels) !== JSON.stringify(s.panels);
        state.settings = s;
        if (!s.enabled) {
          unmount();
          return;
        }
        if (needRemount) {
          unmount();
          ensure();
        } else if (state.mounted) {
          applyNativeVisibility();
        } else {
          ensure();
        }
      });
    });
  }

  ensure();
  startObserving();
  console.info('[GitHub Workbench] 已启动');
})();
