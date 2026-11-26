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
    settings: '/settings',
    editProfile: '/settings/profile',
    newRepo: '/new'
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

  function emptyState(text, hint, iconName) {
    return h(
      'div',
      { class: 'ghw-empty' },
      iconName
        ? h('span', { class: 'ghw-empty-ico', 'aria-hidden': 'true' }, GHW.icons.make(iconName))
        : null,
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
      body.appendChild(emptyState(opts.emptyText || '这里空空如也', opts.emptyHint, opts.emptyIcon));
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

  /* -------------------------------------------------------------- 通知 */

  /** 通知行左侧图标：issue / PR 复用状态图标，讨论 / CI 等用自己的 */
  function notifIcon(it) {
    if (it.type === 'pr' || it.type === 'issue') return stateMeta(it);
    if (it.type === 'discussion') return { name: 'comment-discussion', cls: '' };
    if (it.type === 'check') return { name: 'check-circle', cls: 'is-done' };
    return { name: 'bell', cls: '' };
  }

  function renderNotificationRows(body, items, opts) {
    body.textContent = '';
    opts = opts || {};

    if (!items.length) {
      body.appendChild(emptyState(opts.emptyText || '没有通知', opts.emptyHint, opts.emptyIcon));
      return;
    }

    var frag = document.createDocumentFragment();
    items.forEach(function (it) {
      var meta = notifIcon(it);
      var when = it.updated ? U.relTime(it.updated) : '';

      frag.appendChild(
        h(
          'a',
          {
            class: 'ghw-row ghw-notif ' + (it.unread ? 'is-unread' : 'is-read'),
            href: abs(it.href),
            title: it.title
          },
          h('span', { class: 'ghw-row-icon', 'aria-hidden': 'true' }, GHW.icons.make(meta.name, meta.cls)),
          h(
            'span',
            { class: 'ghw-row-body' },
            h(
              'span',
              { class: 'ghw-row-repo' },
              h('span', {
                class: 'ghw-notif-dot' + (it.unread ? ' is-on' : ''),
                title: it.unread ? '未读' : ''
              }),
              h('span', { text: it.repo || '' }),
              it.number ? h('span', { class: 'ghw-row-number', text: '#' + it.number }) : null
            ),
            h('span', { class: 'ghw-row-title-text', text: it.title }),
            h(
              'span',
              { class: 'ghw-row-foot' },
              it.reasonText ? h('span', { class: 'ghw-reason', text: it.reasonText }) : null,
              when ? h('span', { class: 'ghw-foot-item', text: when }) : null
            )
          )
        )
      );
    });
    body.appendChild(frag);
  }

  /* -------------------------------------------------------------- 仓库卡片 */

  function repoCard(r) {
    // 关注的项目用「收藏时间」，自己的仓库用「更新时间」
    var when = r.starredAt ? U.relTime(r.starredAt) + '收藏' : r.updated ? U.relTime(r.updated) + '更新' : '';
    var topics = (r.topics || []).slice(0, 4);

    return h(
      'a',
      { class: 'ghw-repo', href: abs(r.href), title: r.description || r.fullName, dataset: { repo: r.fullName } },
      h(
        'div',
        { class: 'ghw-repo-head' },
        h('span', { class: 'ghw-repo-title', text: r.fullName }),
        r.visibility && r.visibility !== 'Public'
          ? h('span', { class: 'ghw-badge', text: r.visibility === 'Private' ? '私有' : r.visibility })
          : null
      ),
      r.description
        ? h('p', { class: 'ghw-repo-desc', text: r.description })
        : r.pending
          ? h('p', { class: 'ghw-repo-desc is-pending', text: '正在读取仓库信息…' })
          : null,
      topics.length
        ? h(
            'div',
            { class: 'ghw-repo-topics' },
            topics.map(function (t) {
              return h('span', { class: 'ghw-topic', text: t });
            })
          )
        : null,
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
        r.stars
          ? h(
              'span',
              { class: 'ghw-repo-stat' },
              GHW.icons.make('star', 'ghw-ico-sm'),
              h('span', { text: r.stars })
            )
          : null,
        r.forks
          ? h(
              'span',
              { class: 'ghw-repo-stat' },
              GHW.icons.make('repo-forked', 'ghw-ico-sm'),
              h('span', { text: r.forks })
            )
          : null,
        when ? h('span', { class: 'ghw-dim', text: when }) : null
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

    var heroAvatarImg = h('img', {
      class: 'ghw-avatar',
      src: 'https://github.com/' + encodeURIComponent(login) + '.png?size=160',
      alt: '',
      loading: 'lazy'
    });
    var heroAvatar = h(
      'a',
      { class: 'ghw-avatar-link', href: abs('/' + login), title: '打开 GitHub 个人主页' },
      heroAvatarImg
    );
    var heroNameLink = h('a', { class: 'ghw-name-link', href: abs('/' + login), text: login });
    var heroName = h('h1', { class: 'ghw-name' }, heroNameLink);
    var heroLogin = h('span', { class: 'ghw-login', text: '@' + login });
    var heroBio = h('p', { class: 'ghw-bio is-hidden' });
    var heroChips = h('div', { class: 'ghw-chips' });

    var refreshBtn = h(
      'button',
      { class: 'ghw-btn', type: 'button', onclick: function () { ctx.onRefresh(); } },
      GHW.icons.make('sync', 'ghw-ico-sm'),
      h('span', { text: '刷新' })
    );

    var editProfileBtn = h(
      'a',
      { class: 'ghw-btn', href: abs(LINKS.editProfile), title: '编辑资料、头像、简介' },
      GHW.icons.make('pencil', 'ghw-ico-sm'),
      h('span', { text: '编辑资料' })
    );

    var newRepoBtn = h(
      'a',
      { class: 'ghw-btn', href: abs(LINKS.newRepo), title: '新建仓库' },
      GHW.icons.make('plus', 'ghw-ico-sm'),
      h('span', { text: '新仓库' })
    );

    var copyLabel = h('span', { text: '复制链接' });
    var copyBtn = h(
      'button',
      {
        class: 'ghw-btn',
        type: 'button',
        title: '复制个人主页地址',
        onclick: function () {
          var url = 'https://github.com/' + encodeURIComponent(login);
          function report(ok) {
            copyLabel.textContent = ok ? '已复制' : '复制失败';
            copyBtn.classList.toggle('is-ok', !!ok);
            setTimeout(function () {
              copyLabel.textContent = '复制链接';
              copyBtn.classList.remove('is-ok');
            }, 1600);
          }
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url).then(
              function () { report(true); },
              function () { report(fallbackCopy(url)); }
            );
          } else {
            report(fallbackCopy(url));
          }
        }
      },
      GHW.icons.make('link', 'ghw-ico-sm'),
      copyLabel
    );

    /** 剪贴板 API 不可用（或没有权限）时的兜底 */
    function fallbackCopy(text) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try {
        ok = document.execCommand('copy');
      } catch (err) {
        ok = false;
      }
      document.body.removeChild(ta);
      return ok;
    }

    var quickLinks = h(
      'nav',
      { class: 'ghw-quick', 'aria-label': '工作台快捷入口' },
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
        byName[r.fullName.toLowerCase()] = r;
      });
      return picks.map(function (n) {
        var hit = byName[String(n).toLowerCase()];
        if (hit) return hit;
        // 元信息还没拉回来（或拉失败了）：先给个占位卡片，
        // 保证手动添加的仓库至少显示出来，而不是被静默丢掉
        var parts = String(n).split('/');
        return {
          fullName: n,
          owner: parts[0] || '',
          name: parts[1] || '',
          href: '/' + n,
          description: '',
          language: '',
          languageColor: null,
          stars: '',
          forks: '',
          topics: [],
          starredAt: null,
          updated: null,
          visibility: '',
          pending: true
        };
      });
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
              ' 个来自最近 star；也可以在下面填 owner/repo 加任意仓库）'
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
      if (starredEditing && !starredAll.length && !(settings.starredPicks || []).length) starredEditing = false;

      starredEditBtn.textContent = starredEditing ? '完成' : '编辑';
      starredEditBtn.classList.toggle('is-active', starredEditing);

      body.textContent = '';
      if (starredEditing) {
        body.appendChild(buildStarPicker());
        return;
      }
      var items = pickedStarred();
      if (!items.length) {
        body.appendChild(emptyState('还没有 star 过项目', '在 GitHub 上 star 之后，这里可以直接挑选显示哪些', 'star'));
        return;
      }
      renderRepos(body, items);
      wireStarDrag(body);
    }

    /* 关注的项目：卡片可拖动排序，顺序存进 settings.starredPicks */
    function wireStarDrag(body) {
      var grid = body.querySelector('.ghw-repo-grid');
      if (!grid) return;
      var dragged = null;

      function cards() {
        return Array.prototype.slice.call(grid.querySelectorAll('.ghw-repo'));
      }

      function finish() {
        if (!dragged) return;
        dragged.classList.remove('is-dragging');
        dragged = null;
        var order = cards()
          .map(function (c) {
            return c.getAttribute('data-repo');
          })
          .filter(Boolean);
        if (!order.length) return;
        settings.starredPicks = order;
        if (ctx.onSavePicks) ctx.onSavePicks(order);
      }

      cards().forEach(function (card) {
        card.draggable = true;
        card.classList.add('is-draggable');

        card.addEventListener('dragstart', function (e) {
          e.stopPropagation();
          dragged = card;
          card.classList.add('is-dragging');
          if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = 'move';
            try {
              e.dataTransfer.setData('text/plain', card.getAttribute('data-repo') || '');
            } catch (err) {
              /* 某些浏览器对 setData 有自己的脾气，失败不影响排序 */
            }
          }
        });

        card.addEventListener('dragend', function (e) {
          e.stopPropagation();
          finish();
        });
      });

      grid.addEventListener('dragover', function (e) {
        if (!dragged) return;
        e.stopPropagation();
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
        var target = e.target.closest ? e.target.closest('.ghw-repo') : null;
        if (!target || target === dragged) return;
        var box = target.getBoundingClientRect();
        // 一行两个卡片时，按指针在目标卡片左半/右半决定插到前面还是后面
        var after = e.clientX > box.left + box.width / 2;
        grid.insertBefore(dragged, after ? target.nextSibling : target);
      });

      grid.addEventListener('drop', function (e) {
        e.stopPropagation();
        e.preventDefault();
        finish();
      });
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

    /* --- 通知面板：收件箱 / 已保存 / 已完成，后两个点开才抓 --- */

    var notifState = { active: 'notifications' };
    var notifTabs = {};
    var notifTotal = h('span', { class: 'ghw-count is-hidden' });
    var notifMore = h('a', { class: 'ghw-panel-more', href: abs(LINKS.notifications), text: '全部' });

    var clearArmed = false;
    var clearBusy = false;
    var clearTimer = null;
    var notifClearLabel = h('span', { text: '清空' });
    var notifClearBtn = h(
      'button',
      {
        class: 'ghw-link-btn is-hidden',
        type: 'button',
        title: '把收件箱里的通知全部移到「已完成」（可在 GitHub 找回）',
        onclick: function () {
          onClearClick();
        }
      },
      notifClearLabel
    );

    function disarmClear() {
      clearArmed = false;
      if (clearTimer) {
        clearTimeout(clearTimer);
        clearTimer = null;
      }
      notifClearBtn.classList.remove('is-danger');
      notifClearLabel.textContent = '清空';
    }

    function updateClearBtn() {
      var n = notifTabs.notifications.n || 0;
      var show = notifState.active === 'notifications' && (clearBusy || n > 0);
      notifClearBtn.classList.toggle('is-hidden', !show);
      notifClearBtn.disabled = clearBusy;
    }

    function onClearClick() {
      if (clearBusy) return;
      var n = notifTabs.notifications.n || 0;
      if (!n) return;

      if (!clearArmed) {
        clearArmed = true;
        notifClearBtn.classList.add('is-danger');
        notifClearLabel.textContent = '确认清空 ' + n + ' 条？';
        clearTimer = setTimeout(disarmClear, 4000);
        return;
      }

      if (clearTimer) {
        clearTimeout(clearTimer);
        clearTimer = null;
      }
      clearArmed = false;
      notifClearBtn.classList.remove('is-danger');
      clearBusy = true;
      notifClearBtn.disabled = true;
      notifClearLabel.textContent = '清空中…';

      if (ctx.onClearNotifications) ctx.onClearNotifications();
      else {
        clearBusy = false;
        disarmClear();
        updateClearBtn();
      }
    }

    function updateNotifTotal() {
      var t = notifTabs[notifState.active];
      if (!t || t.n == null) {
        notifTotal.classList.add('is-hidden');
        return;
      }
      // 收件箱显示未读数（这才是需要处理的数量），其它文件夹显示条数
      var n = notifState.active === 'notifications' ? t.unread : t.n;
      notifTotal.title = notifState.active === 'notifications' ? '收件箱未读通知' : '当前文件夹条数';
      notifTotal.textContent = n ? String(n) : '';
      notifTotal.classList.toggle('is-hidden', !n);
    }

    function selectNotifTab(key) {
      notifState.active = key;
      Object.keys(notifTabs).forEach(function (k) {
        notifTabs[k].tab.classList.toggle('is-active', k === key);
        notifTabs[k].pane.classList.toggle('is-active', k === key);
      });
      notifMore.setAttribute('href', abs(notifTabs[key].href));
      if (key !== 'notifications') disarmClear();
      updateNotifTotal();
      updateClearBtn();

      var t = notifTabs[key];
      if (!t.loaded) {
        t.loaded = true; // 先占位，失败时错误块里还有「重试」
        if (ctx.onLoadTab) ctx.onLoadTab(key);
      }
    }

    function notifTab(key, label, href) {
      var countEl = h('span', { class: 'ghw-tab-count' });
      var tab = h(
        'button',
        {
          class: 'ghw-tab' + (key === notifState.active ? ' is-active' : ''),
          type: 'button',
          dataset: { tab: key },
          onclick: function () {
            selectNotifTab(key);
          }
        },
        h('span', { text: label }),
        countEl
      );
      var pane = h(
        'div',
        { class: 'ghw-tab-pane' + (key === notifState.active ? ' is-active' : '') },
        skeletonRows(3)
      );

      bodyEls[key] = pane;
      sections[key] = { count: countEl, body: pane, href: href, section: null };
      notifTabs[key] = { tab: tab, pane: pane, count: countEl, href: href, n: null, unread: 0, loaded: false };
      return tab;
    }

    var notificationsPanelEl = h(
      'section',
      { class: 'ghw-panel', 'data-panel': 'notifications' },
      h(
        'header',
        { class: 'ghw-panel-head' },
        h('h2', { class: 'ghw-panel-title' }, h('span', { text: '通知' }), notifTotal),
        h('div', { class: 'ghw-panel-actions' }, notifClearBtn, notifMore)
      ),
      h(
        'div',
        { class: 'ghw-tabs' },
        notifTab('notifications', '收件箱', LINKS.notifications),
        notifTab('savedNotifications', '已保存', '/notifications?query=is%3Asaved'),
        notifTab('doneNotifications', '已完成', '/notifications?query=is%3Adone')
      ),
      h(
        'div',
        { class: 'ghw-panel-body' },
        Object.keys(notifTabs).map(function (k) {
          return notifTabs[k].pane;
        })
      )
    );

    var mainCol = h(
      'div',
      { class: 'ghw-col ghw-col-main' },
      settings.panels.notifications ? notificationsPanelEl : null,
      settings.panels.starred ? panel('starred', '关注的项目', LINKS.stars, '全部', starEditAction) : null
    );

    var sideCol = h(
      'div',
      { class: 'ghw-col ghw-col-side' },
      settings.panels.issues ? issuesPanelEl : null,
      settings.panels.review ? panel('review', '等我评审', LINKS.review) : null,
      settings.panels.opened ? panel('opened', '我开的 PR', LINKS.pulls) : null
    );

    var thirdCol = h(
      'div',
      { class: 'ghw-col ghw-col-third' },
      settings.panels.contributions ? contributionsPanel : null,
      settings.panels.repos
        ? panel('repos', '最近更新', '/' + login + '?tab=repositories&sort=updated', '全部仓库')
        : null,
      settings.panels.pinned ? panel('pinned', '置顶', '/' + login, '个人主页') : null
    );

    /* --- 面板拖动排序 --- */

    var cols = [
      { el: mainCol, key: 'main' },
      { el: sideCol, key: 'side' },
      { el: thirdCol, key: 'third' }
    ];

    function panelsIn(col) {
      return [].filter.call(col.children, function (n) {
        return n.classList && n.classList.contains('ghw-panel');
      });
    }

    function applyLayout() {
      var layout = settings.layout || {};
      // 两列时代的旧布局没有 third：结构变了就直接回到默认分布，
      // 免得旧数组把所有面板都塞进前两列、第三列空着。
      if (!Array.isArray(layout.third)) layout = {};
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
      var next = { main: [], side: [], third: [] };
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
        .concat(panelsIn(sideCol), panelsIn(thirdCol))
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
            // 面板里还有别的可拖元素（比如关注的项目卡片），
            // 它们的 dragend 也会冒泡到这里，不能顺手把布局存一遍
            if (dragEl !== panel) return;
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

    var rail = h(
      'aside',
      { class: 'ghw-rail' },
      h(
        'header',
        { class: 'ghw-hero' },
        h('div', { class: 'ghw-hero-id' }, heroAvatar, h('div', { class: 'ghw-hero-text' }, heroName, h('div', { class: 'ghw-hero-sub' }, heroLogin, heroChips), heroBio)),
        h('div', { class: 'ghw-hero-actions' }, metaLine, h('div', { class: 'ghw-hero-btns' }, editProfileBtn, newRepoBtn, copyBtn, refreshBtn))
      ),
      quickLinks
    );

    var el = h(
      'div',
      { class: 'ghw-wrap', id: 'ghw-root-inner' },
      rail,
      mainCol,
      sideCol,
      thirdCol,
      footer
    );

    /* 只有内容真的超过上限时才启用卡片内滚动。
       否则保持普通文档流，滚轮直接滚动整页，不会出现「先滚卡片、再滚页面」的两段体验。 */
    var scrollBodies = [];
    var scrollFrame = 0;

    function isScrollCandidate(body) {
      if (!body || (!body.classList.contains('ghw-panel-body') && !body.classList.contains('ghw-tab-pane'))) return false;
      for (var i = 0; i < body.children.length; i++) {
        var child = body.children[i];
        if (child.classList.contains('ghw-row') || child.classList.contains('ghw-repo-grid')) return true;
      }
      return false;
    }

    function syncScrollBody(body) {
      if (!body) return;
      body.classList.toggle('is-scrollable', isScrollCandidate(body) && body.scrollHeight > body.clientHeight + 1);
    }

    function syncScrollBodies() {
      scrollBodies.forEach(syncScrollBody);
    }

    function queueScrollSync() {
      if (scrollFrame) return;
      if (window.requestAnimationFrame) {
        scrollFrame = window.requestAnimationFrame(function () {
          scrollFrame = 0;
          syncScrollBodies();
        });
      } else {
        scrollFrame = setTimeout(function () {
          scrollFrame = 0;
          syncScrollBodies();
        }, 0);
      }
    }

    Object.keys(bodyEls).forEach(function (key) {
      var body = bodyEls[key];
      if (body && scrollBodies.indexOf(body) < 0) scrollBodies.push(body);
    });

    if (typeof ResizeObserver !== 'undefined') {
      var scrollObserver = new ResizeObserver(function (entries) {
        entries.forEach(function (entry) {
          syncScrollBody(entry.target);
        });
      });
      scrollBodies.forEach(function (body) {
        scrollObserver.observe(body);
      });
    } else if (typeof MutationObserver !== 'undefined') {
      var scrollMutationObserver = new MutationObserver(queueScrollSync);
      scrollMutationObserver.observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    }

    window.addEventListener('resize', queueScrollSync);
    queueScrollSync();

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
        // 通知的三个文件夹同理
        if (notifTabs[name]) {
          notifTabs[name].n = n == null ? null : n;
          notifTabs[name].count.textContent = n == null ? '' : String(n);
          notifTabs[name].count.classList.toggle('is-zero', !n);
          updateNotifTotal();
          updateClearBtn();
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
          if (meta.name) heroNameLink.textContent = meta.name;
          if (meta.avatar) heroAvatarImg.src = meta.avatar;
          if (meta.bio) {
            heroBio.textContent = meta.bio;
            heroBio.classList.remove('is-hidden');
          }
          heroChips.textContent = '';
          // 数字 + 标签分开包一层：横版（中等宽度）里读作「16.4k 关注者」，
          // 左侧竖版资料卡里排成「大数字 / 小标签」的统计格子
          function statChip(href, value, label) {
            return h(
              'a',
              { class: 'ghw-chip ghw-chip-link ghw-chip--stat', href: abs(href) },
              h('b', { class: 'ghw-chip-n', text: String(value) }),
              h('span', { class: 'ghw-chip-k', text: ' ' + label })
            );
          }
          if (meta.followers) {
            heroChips.appendChild(statChip('/' + login + '?tab=followers', meta.followers, '关注者'));
          }
          if (meta.following) {
            heroChips.appendChild(statChip('/' + login + '?tab=following', meta.following, '正在关注'));
          }
          if (meta.achievements) {
            heroChips.appendChild(statChip('/' + login + '?tab=achievements', meta.achievements, '项成就'));
          }
          if (meta.location) heroChips.appendChild(h('span', { class: 'ghw-chip ghw-chip--meta', text: meta.location }));
          if (meta.company) heroChips.appendChild(h('span', { class: 'ghw-chip ghw-chip--meta', text: '@' + meta.company }));
          if (meta.website) {
            var site = meta.website;
            var siteText = site.replace(/^https?:\/\//, '').replace(/\/$/, '');
            heroChips.appendChild(
              h('a', {
                class: 'ghw-chip ghw-chip-link ghw-chip--meta',
                href: site,
                target: '_blank',
                rel: 'noreferrer',
                text: siteText
              })
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

        // notifications / savedNotifications / doneNotifications
        if (notifTabs[name]) {
          var notifItems = data || [];
          var tab = notifTabs[name];
          tab.loaded = true;
          tab.unread = notifItems.filter(function (x) {
            return x.unread;
          }).length;
          var notifEmpty = {
            notifications: ['收件箱是空的', 'GitHub 那边也是 All caught up'],
            savedNotifications: ['没有保存的通知', null],
            doneNotifications: ['还没有处理完的通知', null]
          };
          var emptyInfo = notifEmpty[name] || ['没有通知', null];
          renderNotificationRows(body, notifItems.slice(0, settings.listLimit), {
            emptyText: emptyInfo[0],
            emptyHint: emptyInfo[1],
            emptyIcon:
              name === 'notifications'
                ? 'bell'
                : name === 'savedNotifications'
                  ? 'star'
                  : 'check-circle'
          });
          app.setCount(name, notifItems.length);
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
          emptyHint: empty[1],
          emptyIcon: name === 'review' || name === 'opened' ? 'git-pull-request' : 'circle-dot'
        });
        app.setCount(name, items.length);
      },

      /** 「已保存 / 已完成」是按需加载的，刷新时只补已经打开过的 */
      loadedNotifTabs: function () {
        return Object.keys(notifTabs).filter(function (k) {
          return k !== 'notifications' && notifTabs[k].loaded;
        });
      },

      /** 清空收件箱成功：列表、计数、已完成缓存一起归位 */
      notificationsCleared: function (res) {
        clearBusy = false;
        disarmClear();
        var n = (res && res.cleared) || 0;
        var tab = notifTabs.notifications;
        tab.n = 0;
        tab.unread = 0;
        tab.loaded = true;

        renderNotificationRows(bodyEls.notifications, [], {
          emptyText: n ? '收件箱已清空' : '收件箱本来就是空的',
          emptyHint: n ? '已把 ' + n + ' 条移到「已完成」，可以在 GitHub 找回' : null,
          emptyIcon: 'check-circle'
        });
        app.setCount('notifications', 0);

        // 完成列表变了，下次点开重新抓（缓存已经在 API 层清掉）
        notifTabs.doneNotifications.loaded = false;
        notifTabs.doneNotifications.n = null;
        notifTabs.doneNotifications.count.textContent = '';
        notifTabs.doneNotifications.count.classList.add('is-zero');
        if (notifState.active === 'doneNotifications') selectNotifTab('doneNotifications');

        updateClearBtn();
      },

      notificationsClearFailed: function () {
        clearBusy = false;
        notifClearBtn.disabled = false;
        notifClearLabel.textContent = '重试清空';
        notifClearBtn.classList.remove('is-danger');
        updateClearBtn();
      },

      hasStarred: function (fullName) {
        var lower = String(fullName || '').toLowerCase();
        return starredAll.some(function (r) {
          return r.fullName.toLowerCase() === lower;
        });
      },

      /** 面板里正在显示、但还缺元信息（topics 等）的仓库 */
      pendingStarredMeta: function () {
        return pickedStarred().filter(function (r) {
          return !r.topics || !r.topics.length;
        });
      },

      /** 拉到仓库元信息后合并回来（手动添加的整条插入，star 列表里的只补缺字段） */
      mergeStarredMeta: function (meta) {
        if (!meta || !meta.fullName) return;
        var lower = meta.fullName.toLowerCase();
        var existing = null;
        for (var i = 0; i < starredAll.length; i++) {
          if (starredAll[i].fullName.toLowerCase() === lower) {
            existing = starredAll[i];
            break;
          }
        }

        if (!existing) {
          starredAll.push(meta);
          renderStarred();
          return;
        }

        ['description', 'language', 'languageColor', 'stars', 'forks'].forEach(function (k) {
          if (!existing[k] && meta[k]) existing[k] = meta[k];
        });
        if ((!existing.topics || !existing.topics.length) && meta.topics && meta.topics.length) {
          existing.topics = meta.topics;
        }
        if (!existing.updated && meta.updated) existing.updated = meta.updated;
        if (!existing.starredAt && meta.starredAt) existing.starredAt = meta.starredAt;
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



