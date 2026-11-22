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

  // boot.js 在 document_start 盖了一层整屏遮罩，任何「这次不接管」的路径
  // 都要把它撤掉，否则用户会对着 spinner 发呆（boot.js 自己还有 4s 超时兜底）
  function revealBoot(reason) {
    if (GHW.boot && GHW.boot.reveal) GHW.boot.reveal(reason);
  }

  // 刚进页面时 main / 登录 meta 可能还没出来，短时间重试几次再放弃
  var mountTries = 0;

  var state = {
    settings: null,
    app: null,
    root: null,
    pane: null,
    mode: null,
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
    if (p.starred) list.push('starred');
    if (p.issues) list.push('assigned', 'created');
    if (p.review) list.push('review');
    if (p.opened) list.push('opened');
    return list;
  }

  function loadOne(name, force) {
    return API.load(name, state.settings, { force: !!force }).then(
      function (res) {
        if (!state.mounted || !state.app) return;
        state.app.apply(name, res);
        if (name === 'starred') prefetchStarredMeta();
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
  var metaInflight = {};
  var metaQueue = Promise.resolve();

  /**
   * 面板里显示的仓库如果还缺 topics / 元信息（手动添加的仓库），
   * 串行补拉一次。串行是为了别在打开首页时同时打 6 个仓库页。
   */
  function prefetchStarredMeta() {
    if (!state.app) return;
    var targets = state.app.pendingStarredMeta ? state.app.pendingStarredMeta() : [];
    targets.forEach(function (item) {
      var name = item.fullName;
      if (!name || metaInflight[name]) return;
      metaInflight[name] = true;
      metaQueue = metaQueue
        .then(function () {
          return API.repoMeta(name, item).then(
            function (meta) {
              if (state.app) state.app.mergeStarredMeta(meta);
            },
            function () {
              /* 拉不到就只显示仓库名 */
            }
          );
        })
        .then(function () {
          delete metaInflight[name];
        });
    });
  }

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

  /**
   * 决定把工作台挂到哪。
   *
   * 现在的首页是 .application-main > .color-bg-default > .feed-background（flex 行）
   *   ├ aside.feed-left-sidebar      左侧导航
   *   └ div.flex-auto.col-md-8       ← main 埋在这层里面
   *
   * 所以要一路往上找到 .feed-background 的直接子节点，整块藏掉、工作台占它的位置，
   * 否则挂在 main 旁边只能拿到 680px 宽，右边空一大片。
   *
   * insertBefore 必须容错：GitHub 的层级经常变，之前就是参照节点不是直接子节点
   * 导致抛 NotFoundError，整个脚本在挂载那一步就崩了。
   */
  function planMount() {
    var main = document.querySelector('main');
    if (!main) {
      var fallbackHost = hostEl();
      return fallbackHost ? { mode: 'append', host: fallbackHost, before: null, pane: null } : null;
    }

    var row = main.closest('.feed-background') || document.querySelector('.color-bg-default');

    var pane = main;
    while (row && pane.parentElement && pane.parentElement !== row) {
      pane = pane.parentElement;
    }

    if (row && pane.parentElement === row) {
      return { mode: 'replace-pane', host: row, before: pane, pane: pane };
    }
    if (main.parentElement) {
      return { mode: 'replace-main', host: main.parentElement, before: main, pane: main };
    }
    return { mode: 'append', host: hostEl() || document.body, before: null, pane: null };
  }

  function mount() {
    if (state.mounted || !isHome()) return;

    var login = API.getLogin();
    if (!login) return; // 没登录就不接管首页

    // 首页内容可能是客户端渲染的：main 还没出来就先等下一轮重试，
    // 别往 .application-main 里插了又被 React 冲掉
    if (!document.querySelector('main') && document.readyState !== 'complete') return;

    var plan = planMount();
    if (!plan) return;

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
      onSavePicks: function (picks) {
        STORE.saveSettings({ starredPicks: picks }).then(function (s) {
          state.settings = s;
        });
        prefetchStarredMeta();
      },
      onLayout: function (layout) {
        STORE.saveSettings({ layout: layout }).then(function (s) {
          state.settings = s;
        });
      }
    });

    root.appendChild(app.el);
    if (plan.before && plan.before.parentNode === plan.host) {
      plan.host.insertBefore(root, plan.before);
    } else {
      plan.host.appendChild(root);
    }

    // 标记被顶替的那一层，CSS 里按这个类名隐藏，比死认 main 稳
    if (plan.pane) {
      plan.pane.classList.add('ghw-native-pane');
      state.pane = plan.pane;
    }

    state.root = root;
    state.app = app;
    state.mode = plan.mode;
    state.mounted = true;

    // Turbo 换页后会换掉 .application-main，观察器要跟着换到新节点上
    observer.disconnect();
    observer.observe(plan.host, { childList: true });

    applyNativeVisibility();
    // 原生内容已经藏好、工作台已经插进 DOM，这时候撤遮罩才不会有中间帧
    revealBoot('工作台已挂载 · ' + plan.mode);
    loadAll({ force: false });
  }

  function applyNativeVisibility() {
    // 工作台挂载着就接管内容区；关掉扩展时 unmount() 会把类名一起清掉
    var on = !!state.settings.enabled;
    document.documentElement.classList.toggle('ghw-native-hidden', on);
    // 想更宽的版面时，可以把 GitHub 的左侧导航一起收掉
    document.documentElement.classList.toggle('ghw-hide-sidebar', on && !state.settings.keepChrome);
  }

  function unmount() {
    if (state.root && state.root.parentNode) state.root.parentNode.removeChild(state.root);
    if (state.pane) {
      state.pane.classList.remove('ghw-native-pane');
      state.pane = null;
    }
    document.documentElement.classList.remove('ghw-native-hidden');
    document.documentElement.classList.remove('ghw-hide-sidebar');
    state.root = null;
    state.app = null;
    state.mode = null;
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
          revealBoot('总开关已关闭');
          return;
        }
        if (!isHome()) {
          unmount();
          revealBoot('不是首页');
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
        if (state.mounted) {
          mountTries = 0;
          return;
        }
        if (mountTries++ < 20) {
          setTimeout(ensure, 150);
        } else {
          revealBoot('挂载条件一直不满足');
        }
      })
      .finally(function () {
        running = false;
      });
  }

  var lastHref = location.href;

  function tick() {
    if (location.href === lastHref) return;
    lastHref = location.href;
    mountTries = 0;
    if (state.mounted) unmount();
    // 兜底 Turbo 没触发的事件：只要是往首页走，先把遮罩盖回去
    if (GHW.boot && GHW.boot.isHome()) GHW.boot.veil();
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

  // React 重新渲染时可能把我们的节点挤掉，或者把原生内容塞回来
  var observer = new MutationObserver(function () {
    if (!state.mounted) return;
    if (!state.root || !state.root.isConnected) {
      state.mounted = false;
      state.app = null;
      state.root = null;
      state.pane = null;
      ensure();
      return;
    }
    // GitHub 重渲染时会把 className 重置，补回去
    if (state.pane && state.pane.isConnected && !state.pane.classList.contains('ghw-native-pane')) {
      state.pane.classList.add('ghw-native-pane');
    }
    applyNativeVisibility();
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
          (JSON.stringify(state.settings.panels) !== JSON.stringify(s.panels) ||
            state.settings.keepChrome !== s.keepChrome ||
            JSON.stringify(state.settings.layout) !== JSON.stringify(s.layout) ||
            Number(state.settings.listLimit) !== Number(s.listLimit) ||
            Number(state.settings.repoCount) !== Number(s.repoCount));
        state.settings = s;
        if (!s.enabled) {
          unmount();
          revealBoot();
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
