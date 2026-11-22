/**
 * ui.js — 工作台的 DOM 渲染。
 *
 * 全部使用原生 DOM 构造（textContent 赋值），不拼 innerHTML，
 * 因为 GitHub 的 issue / 仓库标题是用户可控内容。
 *
 * 配色一律走 GitHub 自己的 CSS 变量（--fgColor-default 等），
 * 这样浅色 / 深色 / 第三方主题都能自动适配，不用自己维护两套色板。
 */
var GHW = (window.GHW = window.GHW || {});

GHW.ui = (function () {
  'use strict';

  var U = GHW.util;
  var h = U.h;

  var MONTHS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

  var LINKS = {
    assigned: '/issues/assigned',
    review: '/pulls/review-requested',
    opened: '/pulls',
    notifications: '/notifications',
    issues: '/issues',
    pulls: '/pulls',
    stars: '/stars',
    explore: '/explore',
    feed: '/dashboard-feed',
    settings: '/settings'
  };

  function abs(path) {
    return path.indexOf('http') === 0 ? path : 'https://github.com' + path;
  }

  /* ---------------------------------------------------------------- 骨架 */

  function skeletonRows(n) {
    var out = [];
    for (var i = 0; i < n; i++) {
      out.push(
        h(
          'div',
          { class: 'ghw-skel' },
          h('span', { class: 'ghw-skel-dot' }),
          h('span', { class: 'ghw-skel-line', style: { width: 55 + ((i * 13) % 35) + '%' } })
        )
      );
    }
    return out;
  }

  function emptyState(text, hint) {
    return h(
      'div',
      { class: 'ghw-empty' },
      h('div', { class: 'ghw-empty-title', text: text }),
      hint ? h('div', { class: 'ghw-empty-hint', text: hint }) : null
    );
  }

  function errorState(err, onRetry) {
    return h(
      'div',
      { class: 'ghw-err' },
      h('div', { class: 'ghw-err-title', text: '数据没拿到' }),
      h('div', { class: 'ghw-err-msg', text: (err && err.message) || String(err) }),
      h(
        'button',
        { class: 'ghw-btn ghw-btn-sm', type: 'button', onclick: onRetry },
        '重试'
      )
    );
  }

  /* ------------------------------------------------------------- 贡献日历 */

  function renderContributions(body, data) {
    body.textContent = '';

    var days = data.days;
    var first = new Date(days[0].date + 'T00:00:00');
    var pad = first.getDay(); // 0=周日，网格行也是从周日开始

    // grid-auto-flow: column + 7 行，前面的空格补到第一列即可对齐星期
    var grid = h('div', { class: 'ghw-heat-grid' });
    for (var p = 0; p < pad; p++) {
      grid.appendChild(h('div', { class: 'ghw-heat-cell is-pad' }));
    }
    for (var i = 0; i < days.length; i++) {
      var d = days[i];
      grid.appendChild(
        h('div', {
          class: 'ghw-heat-cell',
          'data-level': String(d.level),
          title: d.date + ' · ' + (d.count ? d.count + ' 次贡献' : '没有贡献')
        })
      );
    }

    // 月份标签：月份第一次出现的那一列
    var monthRow = h('div', { class: 'ghw-heat-months' });
    var lastMonth = null;
    var colCount = Math.ceil((days.length + pad) / 7);
    for (var c = 0; c < colCount; c++) {
      var idx = c * 7 - pad;
      if (idx < 0) continue;
      var key = days[idx].date.slice(0, 7);
      if (key === lastMonth) continue;
      lastMonth = key;
      var mm = parseInt(key.slice(5, 7), 10);
      monthRow.appendChild(
        h('span', {
          class: 'ghw-heat-month',
          style: { left: c * 13 + 'px' },
          text: MONTHS[mm - 1]
        })
      );
    }

    var weekday = h(
      'div',
      { class: 'ghw-heat-weekdays' },
      h('span', { text: '' }),
      h('span', { text: '一' }),
      h('span', { text: '' }),
      h('span', { text: '三' }),
      h('span', { text: '' }),
      h('span', { text: '五' }),
      h('span', { text: '' })
    );

    body.appendChild(
      h(
        'div',
        { class: 'ghw-heat' },
        monthRow,
        h('div', { class: 'ghw-heat-frame' }, weekday, grid),
        h(
          'div',
          { class: 'ghw-heat-legend' },
          h('span', { text: '少' }),
          h('i', { 'data-level': '0' }),
          h('i', { 'data-level': '1' }),
          h('i', { 'data-level': '2' }),
          h('i', { 'data-level': '3' }),
          h('i', { 'data-level': '4' }),
          h('span', { text: '多' })
        )
      )
    );

    var stats = [
      { k: '近一年', v: U.fmtNum(data.total), s: '次贡献' },
      { k: '今日', v: U.fmtNum(data.todayCount), s: '次' },
      { k: '本周', v: U.fmtNum(data.weekTotal), s: '次' },
      { k: '连续', v: U.fmtNum(data.currentStreak), s: '天' },
      { k: '最长', v: U.fmtNum(data.longestStreak), s: '天' }
    ];

    body.appendChild(
      h(
        'div',
        { class: 'ghw-stats' },
        stats.map(function (s) {
          return h(
            'div',
            { class: 'ghw-stat' },
            h('div', { class: 'ghw-stat-k', text: s.k }),
            h('div', { class: 'ghw-stat-v' }, h('b', { text: s.v }), h('span', { text: s.s }))
          );
        })
      )
    );
  }

  /* ---------------------------------------------------------- issue / PR */

  var STATE_TEXT = { open: '开启', merged: '已合并', closed: '已关闭', draft: '草稿' };

  function renderIssueRows(body, items, opts) {
    body.textContent = '';
    opts = opts || {};

    if (!items.length) {
      body.appendChild(emptyState(opts.emptyText || '这里空空如也', opts.emptyHint));
      return;
    }

    var frag = document.createDocumentFragment();
    items.forEach(function (it) {
      var state = it.state || (it.type === 'pr' ? 'open' : 'open');
      frag.appendChild(
        h(
          'a',
          { class: 'ghw-row', href: abs(it.href), title: it.title },
          h('span', { class: 'ghw-state ghw-state--' + state, 'aria-hidden': 'true' }),
          h(
            'span',
            { class: 'ghw-row-body' },
            h(
              'span',
              { class: 'ghw-row-title' },
              it.type === 'pr' ? h('span', { class: 'ghw-kind', text: 'PR' }) : null,
              h('span', { text: it.title })
            ),
            h(
              'span',
              { class: 'ghw-row-meta' },
              h('span', { class: 'ghw-repo-name', text: it.repoFullName || it.repo || '' }),
              it.number ? h('span', { class: 'ghw-dim', text: '#' + it.number }) : null,
              it.updated ? h('span', { class: 'ghw-dim', text: U.relTime(it.updated) }) : null
            )
          ),
          it.labels && it.labels.length
            ? h(
                'span',
                { class: 'ghw-labels' },
                it.labels.map(function (l) {
                  return h('span', { class: 'ghw-label', text: l });
                })
              )
            : null
        )
      );
    });
    body.appendChild(frag);
  }

  function renderNotifications(body, items) {
    body.textContent = '';
    if (!items.length) {
      body.appendChild(emptyState('没有未读通知', '清空了，去写代码吧'));
      return;
    }
    var frag = document.createDocumentFragment();
    items.forEach(function (it) {
      frag.appendChild(
        h(
          'a',
          { class: 'ghw-row' + (it.unread === false ? ' is-read' : ''), href: abs(it.href), title: it.title },
          h('span', { class: 'ghw-state ghw-state--notify', 'aria-hidden': 'true' }),
          h(
            'span',
            { class: 'ghw-row-body' },
            h('span', { class: 'ghw-row-title', text: it.title }),
            h(
              'span',
              { class: 'ghw-row-meta' },
              it.repo ? h('span', { class: 'ghw-repo-name', text: it.repo }) : null,
              it.reason ? h('span', { class: 'ghw-dim', text: it.reason }) : null,
              it.updated ? h('span', { class: 'ghw-dim', text: U.relTime(it.updated) }) : null
            )
          )
        )
      );
    });
    body.appendChild(frag);
  }

  /* -------------------------------------------------------------- 仓库卡片 */

  function repoCard(r) {
    return h(
      'a',
      { class: 'ghw-repo', href: abs(r.href) },
      h(
        'div',
        { class: 'ghw-repo-head' },
        h('span', { class: 'ghw-repo-title', text: r.fullName }),
        r.visibility && r.visibility !== 'Public'
          ? h('span', { class: 'ghw-badge', text: r.visibility === 'Private' ? '私有' : r.visibility })
          : null
      ),
      r.description ? h('p', { class: 'ghw-repo-desc', text: r.description }) : null,
      h(
        'div',
        { class: 'ghw-repo-meta' },
        r.language
          ? h(
              'span',
              { class: 'ghw-lang' },
              h('i', { style: { background: r.languageColor || 'var(--ghw-muted)' } }),
              h('span', { text: r.language })
            )
          : null,
        r.stars ? h('span', { class: 'ghw-dim', text: '★ ' + r.stars }) : null,
        r.updated ? h('span', { class: 'ghw-dim', text: U.relTime(r.updated) + '更新' }) : null
      )
    );
  }

  function renderRepos(body, items) {
    body.textContent = '';
    if (!items.length) {
      body.appendChild(emptyState('没找到你的仓库', '可能是解析规则失效了，点右上角刷新试试'));
      return;
    }
    body.appendChild(
      h(
        'div',
        { class: 'ghw-repo-grid' },
        items.map(repoCard)
      )
    );
  }

  function renderPinned(body, items) {
    body.textContent = '';
    if (!items.length) {
      body.parentElement.classList.add('is-hidden');
      return;
    }
    body.appendChild(
      h(
        'div',
        { class: 'ghw-repo-grid' },
        items.map(repoCard)
      )
    );
  }

  /* ------------------------------------------------------------------ 组装 */

  function create(ctx) {
    var settings = ctx.settings;
    var login = ctx.login;
    var bodyEls = {};
    var sections = {};

    var heroAvatar = h('img', {
      class: 'ghw-avatar',
      src: 'https://github.com/' + encodeURIComponent(login) + '.png?size=160',
      alt: '',
      loading: 'lazy'
    });
    var heroName = h('h1', { class: 'ghw-name', text: login });
    var heroLogin = h('span', { class: 'ghw-login', text: '@' + login });
    var heroBio = h('p', { class: 'ghw-bio is-hidden' });
    var heroChips = h('div', { class: 'ghw-chips' });

    var refreshBtn = h(
      'button',
      { class: 'ghw-btn', type: 'button', onclick: function () { ctx.onRefresh(); } },
      h('span', { class: 'ghw-btn-ico', text: '⟳' }),
      h('span', { text: '刷新' })
    );

    var nativeToggle = h(
      'button',
      { class: 'ghw-btn ghw-btn-ghost', type: 'button', onclick: function () { ctx.onToggleNative(); } },
      h('span', { text: settings.hideNative ? '显示 GitHub 原生首页' : '回到工作台' })
    );

    var quickLinks = h(
      'nav',
      { class: 'ghw-quick' },
      [
        ['assigned', '指派给我', LINKS.assigned],
        ['review', '待评审', LINKS.review],
        ['issues', 'Issues', LINKS.issues],
        ['pulls', 'Pull requests', LINKS.pulls],
        ['notifications', '通知', LINKS.notifications],
        ['stars', 'Stars', LINKS.stars],
        ['explore', 'Explore', LINKS.explore]
      ].map(function (q) {
        return h('a', { class: 'ghw-quick-link', href: abs(q[2]), text: q[1] });
      })
    );

    /* --- 面板工厂 --- */

    function panel(name, title, href, moreText) {
      var count = h('span', { class: 'ghw-count is-hidden' });
      var body = h('div', { class: 'ghw-panel-body' }, skeletonRows(3));
      bodyEls[name] = body;

      var section = h(
        'section',
        { class: 'ghw-panel', 'data-panel': name },
        h(
          'header',
          { class: 'ghw-panel-head' },
          h('h2', { class: 'ghw-panel-title' }, h('span', { text: title }), count),
          href ? h('a', { class: 'ghw-panel-more', href: abs(href), text: moreText || '全部' }) : null
        ),
        body
      );
      sections[name] = { section: section, count: count, body: body };
      return section;
    }

    var contributionsPanel = panel('contributions', '贡献日历', '/' + login, '个人主页');

    var mainCol = h(
      'div',
      { class: 'ghw-col ghw-col-main' },
      settings.panels.contributions ? contributionsPanel : null,
      settings.panels.repos
        ? panel('repos', '最近更新', '/' + login + '?tab=repositories&sort=updated', '全部仓库')
        : null,
      settings.panels.pinned ? panel('pinned', '置顶', '/' + login, '个人主页') : null
    );

    var sideCol = h(
      'div',
      { class: 'ghw-col ghw-col-side' },
      settings.panels.assigned ? panel('assigned', '指派给我', LINKS.assigned) : null,
      settings.panels.review ? panel('review', '等我评审', LINKS.review) : null,
      settings.panels.opened ? panel('opened', '我开的 PR', LINKS.pulls) : null,
      settings.panels.notifications ? panel('notifications', '通知', LINKS.notifications) : null
    );

    var metaLine = h('div', { class: 'ghw-meta-line' });
    var footer = h(
      'footer',
      { class: 'ghw-foot' },
      h('span', { text: 'GitHub Workbench · 数据来自你自己的登录态，全部在本地处理' }),
      h('a', { class: 'ghw-foot-link', href: abs(LINKS.settings), text: 'GitHub 设置' }),
      h('a', { class: 'ghw-foot-link', href: abs(LINKS.feed), text: '原生 feed' })
    );

    var el = h(
      'div',
      { class: 'ghw-wrap', id: 'ghw-root-inner' },
      h(
        'header',
        { class: 'ghw-hero' },
        h('div', { class: 'ghw-hero-id' }, heroAvatar, h('div', { class: 'ghw-hero-text' }, heroName, h('div', { class: 'ghw-hero-sub' }, heroLogin, heroChips), heroBio)),
        h('div', { class: 'ghw-hero-actions' }, metaLine, h('div', { class: 'ghw-hero-btns' }, refreshBtn, nativeToggle))
      ),
      quickLinks,
      h('div', { class: 'ghw-grid' }, mainCol, sideCol),
      footer
    );

    var app = {
      el: el,

      setBusy: function (name) {
        if (!bodyEls[name]) return;
        bodyEls[name].textContent = '';
        U.append(bodyEls[name], skeletonRows(3));
      },

      setCount: function (name, n) {
        var s = sections[name];
        if (!s) return;
        if (n == null || n <= 0) {
          s.count.classList.add('is-hidden');
          return;
        }
        s.count.classList.remove('is-hidden');
        s.count.textContent = String(n);
      },

      setError: function (name, err) {
        if (!bodyEls[name]) return;
        bodyEls[name].textContent = '';
        bodyEls[name].appendChild(
          errorState(err, function () {
            ctx.onRetry(name);
          })
        );
      },

      /** 统一入口：按数据源把结果塞进对应面板 */
      apply: function (name, res) {
        var data = res && res.data;

        if (res && res.stale) {
          metaLine.dataset.stale = '1';
        }

        // profile 没有独立面板，它喂的是顶部身份区和「置顶」面板
        if (name === 'profile') {
          var meta = (data && data.meta) || {};
          if (meta.name) heroName.textContent = meta.name;
          if (meta.bio) {
            heroBio.textContent = meta.bio;
            heroBio.classList.remove('is-hidden');
          }
          heroChips.textContent = '';
          if (meta.followers) heroChips.appendChild(h('span', { class: 'ghw-chip', text: meta.followers + ' followers' }));
          if (meta.following) heroChips.appendChild(h('span', { class: 'ghw-chip', text: meta.following + ' following' }));
          if (meta.location) heroChips.appendChild(h('span', { class: 'ghw-chip', text: meta.location }));
          if (meta.company) heroChips.appendChild(h('span', { class: 'ghw-chip', text: '@' + meta.company }));
          if (meta.website) {
            var site = meta.website;
            var siteText = site.replace(/^https?:\/\//, '').replace(/\/$/, '');
            heroChips.appendChild(
              h('a', { class: 'ghw-chip ghw-chip-link', href: site, target: '_blank', rel: 'noreferrer', text: siteText })
            );
          }
          if (bodyEls.pinned) {
            sections.pinned.section.classList.remove('is-hidden');
            renderPinned(bodyEls.pinned, (data && data.pinned) || []);
            app.setCount('pinned', ((data && data.pinned) || []).length);
          }
          return;
        }

        var body = bodyEls[name];
        if (!body) return;

        if (name === 'contributions') {
          try {
            renderContributions(body, data);
          } catch (e) {
            app.setError(name, e);
          }
          return;
        }

        if (name === 'repos') {
          renderRepos(body, (data || []).slice(0, settings.repoCount));
          app.setCount(name, null);
          return;
        }

        if (name === 'notifications') {
          renderNotifications(body, data || []);
          app.setCount(name, (data || []).length);
          return;
        }

        // assigned / review / opened
        var items = data || [];
        renderIssueRows(body, items.slice(0, settings.listLimit), {
          emptyText:
            name === 'assigned' ? '没有指派给你的 issue' : name === 'review' ? '没有等你评审的 PR' : '你没有开着的 PR',
          emptyHint: name === 'assigned' ? '难得清静' : null
        });
        app.setCount(name, items.length);
      },

      setFooter: function (text, stale) {
        metaLine.textContent = text;
        metaLine.classList.toggle('is-stale', !!stale);
      },

      setNativeVisible: function (visible) {
        nativeToggle.textContent = visible ? '回到工作台' : '显示 GitHub 原生首页';
      }
    };

    return app;
  }

  return { create: create };
})();
