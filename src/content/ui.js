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

  /** 类型 + 状态 → 图标名和颜色，语义跟 GitHub 一致 */
  function stateMeta(it) {
    var state = it.state || 'open';
    if (it.type === 'pr') {
      if (state === 'merged') return { name: 'git-merge', cls: 'is-merged' };
      if (state === 'closed') return { name: 'git-pull-request-closed', cls: 'is-closed' };
      if (state === 'draft') return { name: 'git-pull-request', cls: 'is-draft' };
      return { name: 'git-pull-request', cls: 'is-open' };
    }
    if (state === 'closed') return { name: 'issue-closed', cls: 'is-done' };
    return { name: 'circle-dot', cls: 'is-open' };
  }

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
          style: { left: c * 12 + 'px' },
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
      var meta = stateMeta(it);
      var when = it.updated ? U.relTime(it.updated) : U.relText(it.openedText);

      // 对齐方式：图标独占一列，正文（仓库 / 标题 / 摘要 / 页脚）整体左对齐
      var foot = [];
      if (it.author) foot.push(h('span', { class: 'ghw-foot-item', text: it.author }));
      if (it.comments) {
        foot.push(
          h('span', { class: 'ghw-foot-item ghw-foot-item--icon' }, GHW.icons.make('comment-discussion', 'ghw-ico-sm'), h('span', { text: String(it.comments) }))
        );
      }
      if (when) foot.push(h('span', { class: 'ghw-foot-item', text: when }));
      if (it.number) foot.push(h('span', { class: 'ghw-foot-item', text: '#' + it.number }));

      frag.appendChild(
        h(
          'a',
          { class: 'ghw-row', href: abs(it.href), title: it.title },
          h('span', { class: 'ghw-row-icon', 'aria-hidden': 'true' }, GHW.icons.make(meta.name, meta.cls)),
          h(
            'span',
            { class: 'ghw-row-body' },
            h('span', { class: 'ghw-row-repo', text: it.repoFullName || it.repo || '' }),
            h('span', { class: 'ghw-row-title-text', text: it.title }),
            it.excerpt ? h('span', { class: 'ghw-row-excerpt', text: it.excerpt }) : null,
            foot.length
              ? h(
                  'span',
                  { class: 'ghw-row-foot' },
                  it.avatar ? h('img', { class: 'ghw-mini-avatar', src: it.avatar, alt: '', loading: 'lazy' }) : null,
                  foot
                )
              : null
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

    function panel(name, title, href, moreText, extraActions) {
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
          h(
            'div',
            { class: 'ghw-panel-actions' },
            extraActions || null,
            href ? h('a', { class: 'ghw-panel-more', href: abs(href), text: moreText || '全部' }) : null
          )
        ),
        body
      );
      sections[name] = { section: section, count: count, body: body };
      return section;
    }

    /* --- 关注的项目：可编辑，从 star 列表里挑 --- */

    var starredAll = [];
    var starredEditing = false;

    var starredEditBtn = h(
      'button',
      {
        class: 'ghw-link-btn',
        type: 'button',
        onclick: function () {
          starredEditing = !starredEditing;
          renderStarred();
        }
      },
      '编辑'
    );

    var pickedStarred = function () {
      var picks = settings.starredPicks || [];
      if (!picks.length) return starredAll.slice(0, settings.starredCount || 6);
      var byName = {};
      starredAll.forEach(function (r) {
        byName[r.fullName] = r;
      });
      return picks
        .map(function (n) {
          return byName[n];
        })
        .filter(Boolean);
    };

    function buildStarPicker() {
      // draft 是有序的选中列表，顺序就是面板里的顺序
      var draft = settings.starredPicks && settings.starredPicks.length
        ? settings.starredPicks.slice()
        : pickedStarred().map(function (r) {
            return r.fullName;
          });

      var poolNames = starredAll.map(function (r) {
        return r.fullName;
      });

      function allNames() {
        var out = draft.slice();
        poolNames.forEach(function (n) {
          if (out.indexOf(n) < 0) out.push(n);
        });
        return out;
      }

      var list = h('div', { class: 'ghw-picker' });

      function paint() {
        list.textContent = '';
        var names = allNames();
        if (!names.length) {
          list.appendChild(
            h('div', { class: 'ghw-picker-empty', text: 'star 列表是空的，可以在下面手动添加仓库' })
          );
        }
        names.forEach(function (n) {
          var inDraft = draft.indexOf(n) >= 0;
          var manual = poolNames.indexOf(n) < 0;

          var cb = h('input', { type: 'checkbox', value: n });
          cb.checked = inDraft;
          cb.addEventListener('change', function () {
            if (cb.checked) {
              if (draft.indexOf(n) < 0) draft.push(n);
            } else {
              draft = draft.filter(function (x) {
                return x !== n;
              });
            }
          });

          list.appendChild(
            h(
              'label',
              { class: 'ghw-pick' },
              cb,
              h('span', { class: 'ghw-pick-name', text: n }),
              manual ? h('span', { class: 'ghw-pick-tag', text: '手动' }) : null
            )
          );
        });
      }
      paint();

      var input = h('input', {
        class: 'ghw-pick-input',
        type: 'text',
        placeholder: 'owner/repo，回车添加',
        spellcheck: 'false'
      });

      function addTyped() {
        var v = (input.value || '')
          .trim()
          .replace(/^https?:\/\/(www\.)?github\.com\//i, '')
          .replace(/\/+$/, '');
        if (!/^[\w.-]+\/[\w.-]+$/.test(v)) {
          input.classList.add('is-bad');
          return;
        }
        input.classList.remove('is-bad');
        if (draft.indexOf(v) < 0) draft.push(v);
        input.value = '';
        paint();
      }

      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          addTyped();
        }
      });

      return h(
        'div',
        { class: 'ghw-picker-wrap' },
        h(
          'div',
          { class: 'ghw-picker-hint' },
          h('span', {
            text:
              '勾选要显示的（' +
              starredAll.length +
              ' 个来自最近 star，可自由增删）'
          })
        ),
        list,
        h(
          'div',
          { class: 'ghw-picker-add' },
          input,
          h('button', { class: 'ghw-btn ghw-btn-sm', type: 'button', onclick: addTyped }, '添加')
        ),
        h(
          'div',
          { class: 'ghw-picker-foot' },
          h(
            'button',
            {
              class: 'ghw-btn ghw-btn-sm',
              type: 'button',
              onclick: function () {
                starredEditing = false;
                renderStarred();
              }
            },
            '取消'
          ),
          h(
            'button',
            {
              class: 'ghw-btn ghw-btn-sm is-primary',
              type: 'button',
              onclick: function () {
                var names = draft.slice();
                settings.starredPicks = names;
                if (ctx.onSavePicks) ctx.onSavePicks(names);
                starredEditing = false;
                renderStarred();
              }
            },
            '保存'
          )
        )
      );
    }

    function renderStarred() {
      var body = bodyEls.starred;
      if (!body) return;
      if (starredEditing && !starredAll.length) starredEditing = false;

      starredEditBtn.textContent = starredEditing ? '完成' : '编辑';
      starredEditBtn.classList.toggle('is-active', starredEditing);

      body.textContent = '';
      if (starredEditing) {
        body.appendChild(buildStarPicker());
        return;
      }
      var items = pickedStarred();
      if (!items.length) {
        body.appendChild(emptyState('还没有 star 过项目', '在 GitHub 上 star 之后，这里可以直接挑选显示哪些'));
        return;
      }
      renderRepos(body, items);
    }
    var starEditAction = settings.panels.starred ? starredEditBtn : null;

    var contributionsPanel = panel('contributions', '贡献日历', '/' + login, '个人主页');

    /* --- Issues 面板：一个面板两个 tab，指派给我 / 我创建的 --- */

    var issueState = { active: 'assigned', picked: false };
    var issueTabs = {};
    var issuesTotal = h('span', { class: 'ghw-count is-hidden' });
    var issuesMore = h('a', { class: 'ghw-panel-more', href: abs(LINKS.assigned), text: '全部' });

    function issueTab(key, label, href) {
      var countEl = h('span', { class: 'ghw-tab-count' });
      var tab = h(
        'button',
        {
          class: 'ghw-tab' + (key === issueState.active ? ' is-active' : ''),
          type: 'button',
          dataset: { tab: key },
          onclick: function () {
            issueState.picked = true;
            selectIssueTab(key);
          }
        },
        h('span', { text: label }),
        countEl
      );
      var pane = h('div', { class: 'ghw-tab-pane' + (key === issueState.active ? ' is-active' : '') }, skeletonRows(3));

      bodyEls[key] = pane;
      sections[key] = { count: countEl, body: pane, href: href, section: null };
      issueTabs[key] = { tab: tab, pane: pane, count: countEl, href: href, n: null };
      return tab;
    }

    function refreshIssuesTotal() {
      var sum = 0;
      var any = false;
      Object.keys(issueTabs).forEach(function (k) {
        var n = issueTabs[k].n;
        if (n == null) return;
        any = true;
        sum += n;
      });
      issuesTotal.textContent = any ? String(sum) : '';
      issuesTotal.classList.toggle('is-hidden', !any || sum === 0);

      // 两个 tab 都没数据、或者用户手动选过，就别自作主张
      if (issueState.picked) return;
      var other = issueState.active === 'assigned' ? 'created' : 'assigned';
      var activeN = issueTabs[issueState.active].n;
      var otherN = issueTabs[other].n;
      if (activeN === 0 && otherN > 0) selectIssueTab(other);
      else if (activeN > 0 && otherN === 0) selectIssueTab(issueState.active);
    }

    function selectIssueTab(key) {
      issueState.active = key;
      Object.keys(issueTabs).forEach(function (k) {
        issueTabs[k].tab.classList.toggle('is-active', k === key);
        issueTabs[k].pane.classList.toggle('is-active', k === key);
      });
      issuesMore.setAttribute('href', abs(issueTabs[key].href));
    }

    var issuesPanelEl = h(
      'section',
      { class: 'ghw-panel', 'data-panel': 'issues' },
      h(
        'header',
        { class: 'ghw-panel-head' },
        h('h2', { class: 'ghw-panel-title' }, h('span', { text: 'Issues' }), issuesTotal),
        issuesMore
      ),
      h(
        'div',
        { class: 'ghw-tabs' },
        issueTab('assigned', '指派给我', LINKS.assigned),
        issueTab('created', '我创建的', LINKS.issues + '?q=is%3Aissue+is%3Aopen+author%3A%40me')
      ),
      h(
        'div',
        { class: 'ghw-panel-body' },
        Object.keys(issueTabs).map(function (k) {
          return issueTabs[k].pane;
        })
      )
    );

    var mainCol = h(
      'div',
      { class: 'ghw-col ghw-col-main' },
      settings.panels.contributions ? contributionsPanel : null,
      settings.panels.repos
        ? panel('repos', '最近更新', '/' + login + '?tab=repositories&sort=updated', '全部仓库')
        : null,
      settings.panels.starred ? panel('starred', '关注的项目', LINKS.stars, '全部', starEditAction) : null,
      settings.panels.pinned ? panel('pinned', '置顶', '/' + login, '个人主页') : null
    );

    var sideCol = h(
      'div',
      { class: 'ghw-col ghw-col-side' },
      settings.panels.issues ? issuesPanelEl : null,
      settings.panels.review ? panel('review', '等我评审', LINKS.review) : null,
      settings.panels.opened ? panel('opened', '我开的 PR', LINKS.pulls) : null
    );

    /* --- 面板拖动排序 --- */

    var cols = [
      { el: mainCol, key: 'main' },
      { el: sideCol, key: 'side' }
    ];

    function panelsIn(col) {
      return [].filter.call(col.children, function (n) {
        return n.classList && n.classList.contains('ghw-panel');
      });
    }

    function applyLayout() {
      var layout = settings.layout || {};
      var all = {};
      cols.forEach(function (c) {
        panelsIn(c.el).forEach(function (p) {
          all[p.dataset.panel] = p;
        });
      });

      var placed = {};
      cols.forEach(function (c) {
        (layout[c.key] || []).forEach(function (n) {
          if (all[n] && !placed[n]) {
            c.el.appendChild(all[n]);
            placed[n] = 1;
          }
        });
      });

      // 没出现在保存顺序里的（新增面板、第一次加载）留在原来的列，保持相对顺序
      var rest = [];
      cols.forEach(function (c) {
        panelsIn(c.el).forEach(function (p) {
          if (placed[p.dataset.panel]) return;
          placed[p.dataset.panel] = 1;
          rest.push({ col: c, el: p });
        });
      });
      rest.forEach(function (r) {
        r.col.el.appendChild(r.el);
      });
    }

    function persistLayout() {
      var next = { main: [], side: [] };
      cols.forEach(function (c) {
        next[c.key] = panelsIn(c.el).map(function (p) {
          return p.dataset.panel;
        });
      });
      settings.layout = next;
      if (ctx.onLayout) ctx.onLayout(next);
    }

    var dragEl = null;

    function insertPoint(col, y) {
      var list = panelsIn(col).filter(function (p) {
        return p !== dragEl;
      });
      for (var i = 0; i < list.length; i++) {
        var r = list[i].getBoundingClientRect();
        if (y < r.top + r.height / 2) return list[i];
      }
      return null;
    }

    function wireDrag() {
      panelsIn(mainCol)
        .concat(panelsIn(sideCol))
        .forEach(function (panel) {
          var head = panel.querySelector('.ghw-panel-head');
          if (!head) return;

          // 只在按住头部时才允许拖，否则会影响正文选中文字
          head.addEventListener('pointerdown', function () {
            panel.draggable = true;
          });
          head.addEventListener('pointerup', function () {
            panel.draggable = false;
          });

          panel.addEventListener('dragstart', function (e) {
            if (!panel.draggable || (e.target.closest && e.target.closest('a, button, input'))) {
              e.preventDefault();
              return;
            }
            dragEl = panel;
            panel.classList.add('is-dragging');
            e.dataTransfer.effectAllowed = 'move';
            try {
              e.dataTransfer.setData('text/plain', panel.dataset.panel || '');
            } catch (err) {
              /* 某些浏览器不许写 dataTransfer，无所谓 */
            }
          });

          panel.addEventListener('dragend', function () {
            panel.draggable = false;
            panel.classList.remove('is-dragging');
            dragEl = null;
            persistLayout();
          });
        });

      cols.forEach(function (c) {
        c.el.addEventListener('dragover', function (e) {
          if (!dragEl) return;
          e.preventDefault();
          try {
            e.dataTransfer.dropEffect = 'move';
          } catch (err) {
            /* noop */
          }
          var after = insertPoint(c.el, e.clientY);
          if (after === null) c.el.appendChild(dragEl);
          else if (after !== dragEl) c.el.insertBefore(dragEl, after);
        });
        c.el.addEventListener('drop', function (e) {
          e.preventDefault();
        });
      });
    }

    applyLayout();
    wireDrag();

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
        h('div', { class: 'ghw-hero-actions' }, metaLine, h('div', { class: 'ghw-hero-btns' }, refreshBtn))
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
        // Issues 面板的两个 tab 始终显示数字（0 也是有意义的信息）
        if (issueTabs[name]) {
          issueTabs[name].n = n == null ? null : n;
          issueTabs[name].count.textContent = n == null ? '' : String(n);
          issueTabs[name].count.classList.toggle('is-zero', !n);
          refreshIssuesTotal();
          return;
        }
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

        if (name === 'starred') {
          starredAll = data || [];
          renderStarred();
          app.setCount(name, null);
          return;
        }

        // assigned / created / review / opened
        var items = data || [];
        var EMPTY = {
          assigned: ['没有指派给你的 issue', '难得清静'],
          created: ['你还没有创建 issue', null],
          review: ['没有等你评审的 PR', null],
          opened: ['你没有开着的 PR', null]
        };
        var empty = EMPTY[name] || ['暂无', null];
        renderIssueRows(body, items.slice(0, settings.listLimit), {
          emptyText: empty[0],
          emptyHint: empty[1]
        });
        app.setCount(name, items.length);
      },

      hasStarred: function (fullName) {
        return starredAll.some(function (r) {
          return r.fullName === fullName;
        });
      },

      /** 手动添加的仓库拉到元信息后补进来 */
      addStarredMeta: function (meta) {
        if (!meta || !meta.fullName) return;
        if (app.hasStarred(meta.fullName)) return;
        starredAll.push(meta);
        renderStarred();
      },

      setFooter: function (text, stale) {
        metaLine.textContent = text;
        metaLine.classList.toggle('is-stale', !!stale);
      }
    };

    return app;
  }

  return { create: create };
})();



