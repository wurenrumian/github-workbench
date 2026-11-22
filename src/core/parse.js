/**
 * parse.js — 把 GitHub 返回的 HTML 解析成结构化数据。
 *
 * 为什么不用 api.github.com：
 *   1. 浏览器里没有 token 时只有 60 次/小时，且 api.github.com 是跨域，
 *      抓不到 cookie 登录态；
 *   2. 而这些页面（/issues/assigned、/pulls/review-requested、/users/x/contributions）
 *      在 github.com 同源下 fetch 会带上你自己的会话，无需配置。
 *
 * 代价是依赖 HTML 结构，所以每个解析器都做了「主选择器 + 兜底启发式」，
 * 解析失败时返回空数组而不是抛错，由 UI 层降级显示，不会白屏。
 */
var GHW = (window.GHW = window.GHW || {});

GHW.parse = (function () {
  'use strict';

  var U = GHW.util;

  /** 新版 Dashboard 上真正可靠的贡献数据来源 */
  function parseContributions(doc) {
    var cells = doc.querySelectorAll('td[data-date]');
    if (!cells.length) return null;

    // 每个格子的精确次数藏在配对的 <tool-tip> 里：「7 contributions on ...」
    var counts = {};
    var tips = doc.querySelectorAll('tool-tip[for]');
    for (var t = 0; t < tips.length; t++) {
      var id = tips[t].getAttribute('for');
      var txt = U.textOf(tips[t]);
      var m = /^(\d[\d,]*)\s+contribution/.exec(txt);
      counts[id] = m ? parseInt(m[1].replace(/,/g, ''), 10) : 0;
    }

    var days = [];
    for (var i = 0; i < cells.length; i++) {
      var el = cells[i];
      var date = el.getAttribute('data-date');
      if (!date) continue;
      var level = parseInt(el.getAttribute('data-level') || '0', 10);
      var count = counts[el.id];
      if (count == null) count = level;
      days.push({ date: date, level: isNaN(level) ? 0 : level, count: count });
    }
    days.sort(function (a, b) {
      return a.date < b.date ? -1 : 1;
    });
    return { days: days };
  }

  /** 由贡献日历计算今日 / 本周 / 连续天数 / 最长连续 */
  function summarizeContributions(res) {
    var days = (res && res.days) || [];
    if (!days.length) return null;

    var total = 0;
    var active = 0;
    var best = days[0];
    for (var i = 0; i < days.length; i++) {
      total += days[i].count;
      if (days[i].count > 0) active++;
      if (days[i].count > best.count) best = days[i];
    }

    var today = U.dayKey(new Date());
    var todayCount = 0;
    var lastIdx = days.length - 1;

    // 连续天数：从最近一天往回数；今天还没提交不算断（GitHub 也是这么算的）
    var cursor = lastIdx;
    if (days[cursor] && days[cursor].date === today) {
      todayCount = days[cursor].count;
      if (todayCount === 0) cursor--;
    }
    var current = 0;
    for (var s = cursor; s >= 0; s--) {
      if (days[s].count > 0) current++;
      else break;
    }

    var longest = 0;
    var run = 0;
    for (var l = 0; l < days.length; l++) {
      if (days[l].count > 0) {
        run++;
        if (run > longest) longest = run;
      } else {
        run = 0;
      }
    }

    // 本周（周一到周日，取本地时区）
    var now = new Date();
    var monday = U.addDays(now, -((now.getDay() + 6) % 7));
    var weekTotal = 0;
    for (var w = 0; w < 7; w++) {
      var key = U.dayKey(U.addDays(monday, w));
      for (var d = lastIdx; d >= 0; d--) {
        if (days[d].date === key) {
          weekTotal += days[d].count;
          break;
        }
        if (days[d].date < key) break;
      }
    }

    return {
      days: days,
      total: total,
      activeDays: active,
      todayCount: todayCount,
      currentStreak: current,
      longestStreak: longest,
      weekTotal: weekTotal,
      bestDay: best,
      from: days[0].date,
      to: days[lastIdx].date
    };
  }

  var ISSUE_HREF = /^\/([^\/?#]+)\/([^\/?#]+)\/(issues|pull)\/(\d+)\/?(?:[?#].*)?$/;

  /** 往上找一层「像列表项」的容器，用来取时间、标签 */
  function closestRow(node) {
    var el = node.parentElement;
    var depth = 0;
    while (el && depth++ < 8) {
      if (el.querySelector('relative-time, time[datetime]')) return el;
      el = el.parentElement;
    }
    return null;
  }

  /** 搜索结果的行容器（新版 /search 的类名带 hash，用前缀匹配） */
  function searchRow(node) {
    var el = node;
    var depth = 0;
    while (el && depth++ < 6) {
      var cls = typeof el.className === 'string' ? el.className : '';
      if (/Result__|Box-row|issues-row/.test(cls)) return el;
      if (el.tagName === 'LI') return el;
      el = el.parentElement;
    }
    return null;
  }

  function excerptOf(row) {
    if (!row) return '';
    var el = row.querySelector('[class*="Content__"], .search-match + div, p');
    if (!el) return '';
    var txt = U.textOf(el);
    return txt.length > 200 ? txt.slice(0, 200) + '…' : txt;
  }

  function authorOf(row) {
    if (!row) return '';
    // 新版搜索结果：footer 里第一个非数字的 li 就是作者（头像的 alt 是空的）
    var footer = row.querySelector('[class*="footer__"]');
    if (footer) {
      var lis = footer.querySelectorAll('li');
      for (var i = 0; i < lis.length; i++) {
        var t = U.textOf(lis[i]);
        if (t && !/^[\d,]+$/.test(t) && !/^#\d+$/.test(t)) return t.replace(/^@/, '');
      }
    }
    var avatar = row.querySelector('img[alt]');
    if (avatar) {
      var alt = (avatar.getAttribute('alt') || '').trim();
      if (alt && alt.length < 40 && !/\s/.test(alt)) return alt.replace(/^@/, '');
    }
    var link = row.querySelector('ul a[href^="/"]');
    if (link) {
      var href = link.getAttribute('href') || '';
      var m = /^\/([^\/?#]+)$/.exec(href);
      if (m) return m[1];
    }
    return '';
  }

  function commentsOf(row) {
    if (!row) return null;
    // 新版搜索结果：评论数就是带评论图标的那个 li 里的数字
    var icon = row.querySelector('.octicon-comment-discussion, [class*="commentIcon"]');
    var host = icon && icon.closest('li');
    if (host) {
      var n = parseInt(U.textOf(host).replace(/[^\d]/g, ''), 10);
      if (!isNaN(n)) return n;
    }
    var m = /(\d[\d,]*)\s+comments?/i.exec(row.textContent || '');
    return m ? parseInt(m[1].replace(/,/g, ''), 10) : null;
  }

  /** 作者头像（官方列表里作者前面有个小头像） */
  function avatarOf(row) {
    if (!row) return '';
    var footer = row.querySelector('[class*="footer__"]');
    var img = (footer && footer.querySelector('img[src]')) || null;
    if (!img) return '';
    var src = img.getAttribute('src') || '';
    // 缩到 40px，省流量
    return src.replace(/[?&]s=\d+/, '?s=40').replace(/[?&]size=\d+/, '?size=40');
  }

  function openedTextOf(row) {
    if (!row) return '';
    var m = /(?:opened|created)\s+([^·|\n]+)/i.exec(row.textContent || '');
    if (!m) return '';
    return m[1]
      .replace(/^on\s+/i, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 24);
  }

  function cleanTitle(text, number) {
    var s = text || '';
    s = s.replace(/^#\d+\s*/, '');
    s = s.replace(/\s*·\s*(Issue|Pull request)\s*#\d+.*$/i, '');
    return s.trim();
  }

  var STATE_LABELS = /^(open|closed|merged|draft|已合并|已关闭)$/i;

  function rowState(row) {
    if (!row) return null;
    var svg = row.querySelector('svg[aria-label], .octicon');
    if (!svg) return null;
    var label = (svg.getAttribute('aria-label') || '').toLowerCase();
    var cls = (svg.getAttribute('class') || '').toLowerCase();
    if (label === 'merged' || cls.indexOf('git-merge') >= 0) return 'merged';
    if (label === 'closed' || cls.indexOf('issue-closed') >= 0) return 'closed';
    if (label === 'draft') return 'draft';
    if (label === 'pull request' || cls.indexOf('git-pull-request') >= 0) return 'open';
    if (label === 'open' || cls.indexOf('issue-opened') >= 0) return 'open';
    return null;
  }

  function rowLabels(row) {
    if (!row) return [];
    var seen = {};
    var out = [];
    var nodes = row.querySelectorAll('a[href*="/labels/"], span.Label, [data-testid="label"]');
    for (var i = 0; i < nodes.length && out.length < 4; i++) {
      var t = U.textOf(nodes[i]);
      if (!t || t.length > 30 || STATE_LABELS.test(t) || seen[t]) continue;
      seen[t] = 1;
      out.push(t);
    }
    return out;
  }

  function rowTime(row) {
    if (!row) return null;
    var el = row.querySelector('relative-time[datetime], time[datetime]');
    return el ? el.getAttribute('datetime') : null;
  }

  /**
   * 通用 issue / PR 列表解析。
   * 不绑定具体的 class，而是从「形如 /owner/repo/issues/123 的链接」反推列表项，
   * 这样 GitHub 换 React 组件、换样式，只要链接还在就能解析。
   */
  function parseIssueList(doc, limit) {
    var byHref = {};
    var anchors = doc.querySelectorAll('a[href]');

    for (var i = 0; i < anchors.length; i++) {
      var a = anchors[i];
      var href = a.getAttribute('href') || '';
      var m = ISSUE_HREF.exec(href);
      if (!m) continue;
      // 评论锚点、时间线链接都排除
      if (href.indexOf('#') >= 0) continue;

      var title = cleanTitle(U.textOf(a), m[4]);
      if (!title) continue;

      var prev = byHref[href];
      // 同一个链接可能出现多次（图标链接、标题链接），保留文字最完整的那个
      if (prev) {
        if (title.length > prev.title.length) prev.title = title;
        continue;
      }

      var row = searchRow(a) || closestRow(a);
      byHref[href] = {
        type: m[3] === 'pull' ? 'pr' : 'issue',
        owner: m[1],
        repo: m[2],
        number: parseInt(m[4], 10),
        title: title,
        href: href,
        url: 'https://github.com' + href,
        repoFullName: m[1] + '/' + m[2],
        updated: rowTime(row),
        openedText: openedTextOf(row),
        state: rowState(row),
        labels: rowLabels(row),
        excerpt: excerptOf(row),
        author: authorOf(row),
        avatar: avatarOf(row),
        comments: commentsOf(row)
      };
    }

    var list = Object.keys(byHref).map(function (k) {
      return byHref[k];
    });

    list.sort(function (a, b) {
      var ta = a.updated ? Date.parse(a.updated) : 0;
      var tb = b.updated ? Date.parse(b.updated) : 0;
      return tb - ta;
    });

    return limit ? list.slice(0, limit) : list;
  }

  /** 用户主页：昵称、bio、粉丝数、地点/公司/网站 */
  function parseProfile(doc) {
    var out = {};
    var name = doc.querySelector('span.p-name, h1 .p-name, [itemprop="additionalName"]');
    if (name) out.name = U.textOf(name);
    var bio = doc.querySelector('.p-note div, .p-note, [data-bio-text]');
    if (bio) out.bio = U.textOf(bio);

    var followers = doc.querySelector('a[href$="?tab=followers"] .Counter, a[href$="?tab=followers"] .text-bold');
    if (followers) out.followers = U.textOf(followers);
    var following = doc.querySelector('a[href$="?tab=following"] .Counter, a[href$="?tab=following"] .text-bold');
    if (following) out.following = U.textOf(following);

    var location = doc.querySelector('li[itemprop="homeLocation"], [itemprop="homeLocation"]');
    if (location) out.location = U.textOf(location).replace(/^[^\w\u4e00-\u9fa5]+\s*/, '');
    var company = doc.querySelector('li[itemprop="worksFor"], [itemprop="worksFor"]');
    if (company) out.company = U.textOf(company).replace(/^@\s*/, '').trim();
    var site = doc.querySelector('li[itemprop="url"] a, a[itemprop="url"]');
    if (site) out.website = site.getAttribute('href') || U.textOf(site);

    return out;
  }

  /** 置顶仓库（profile 页的 Pinned 区块） */
  function parsePinned(doc) {
    var items = doc.querySelectorAll('ol.js-pinned-items-reorder-list > li, .pinned-item-list-item');
    var out = [];
    for (var i = 0; i < items.length; i++) {
      var li = items[i];
      var link = li.querySelector('span.repo, a[href]');
      var linkEl = li.querySelector('a[href]');
      if (!linkEl) continue;
      var href = linkEl.getAttribute('href') || '';
      var parts = href.replace(/^\//, '').split('/');
      if (parts.length < 2) continue;

      var desc = li.querySelector('p.pinned-item-desc');
      var lang = li.querySelector('a[itemprop="programmingLanguage"], [itemprop="programmingLanguage"]');
      var colorEl = li.querySelector('.repo-language-color');
      var stars = li.querySelector('a[href$="/stargazers"]');

      out.push({
        fullName: parts[0] + '/' + parts[1],
        href: href,
        name: parts[1],
        description: desc ? U.textOf(desc) : '',
        language: lang ? U.textOf(lang) : '',
        languageColor: U.colorFromStyle(colorEl && colorEl.getAttribute('style')),
        stars: stars ? U.textOf(stars) : ''
      });
    }
    return out;
  }

  /**
   * 仓库列表（/<login>?tab=repositories&sort=updated）。
   * 主选择器是 itemprop，比 class 稳；拿不到就退回 _name 链接的启发式。
   */
  function parseRepoList(doc, limit) {
    var out = [];
    var rows = doc.querySelectorAll('#user-repositories-list li, li[itemprop="owns"]');

    for (var i = 0; i < rows.length; i++) {
      var li = rows[i];
      var nameLink = li.querySelector('a[itemprop="name codeRepository"]');
      if (!nameLink) continue;
      var href = nameLink.getAttribute('href') || '';
      var parts = href.replace(/^\//, '').split('/');
      if (parts.length < 2) continue;

      var desc = li.querySelector('p[itemprop="description"]');
      var lang = li.querySelector('span[itemprop="programmingLanguage"]');
      var colorEl = li.querySelector('.repo-language-color');
      var stars = li.querySelector('a[href$="/stargazers"]');
      var timeEl = li.querySelector('relative-time[datetime], time[datetime]');
      var vis = li.querySelector('.Label');

      out.push({
        fullName: parts[0] + '/' + parts[1],
        owner: parts[0],
        name: parts[1],
        href: href,
        description: desc ? U.textOf(desc) : '',
        language: lang ? U.textOf(lang) : '',
        languageColor: U.colorFromStyle(colorEl && colorEl.getAttribute('style')),
        stars: stars ? U.textOf(stars).replace(/[^\d.,km]/gi, '') : '',
        updated: timeEl ? timeEl.getAttribute('datetime') : null,
        visibility: vis ? U.textOf(vis) : ''
      });
    }

    // 兜底：结构大变时，至少把仓库名链接捞出来
    if (!out.length) {
      var links = doc.querySelectorAll('#user-repositories-list a[itemprop="name codeRepository"], [data-filterable-for] a[href]');
      for (var j = 0; j < links.length; j++) {
        var h = links[j].getAttribute('href') || '';
        if (!/^\/[^\/]+\/[^\/]+$/.test(h)) continue;
        var p = h.replace(/^\//, '').split('/');
        out.push({ fullName: p[0] + '/' + p[1], owner: p[0], name: p[1], href: h, description: '', language: '', languageColor: null, stars: '', updated: null, visibility: '' });
      }
    }

    return limit ? out.slice(0, limit) : out;
  }

  /** 通知列表（/notifications） */
  function parseNotifications(doc, limit) {
    var out = [];
    var rows = doc.querySelectorAll('li[id^="notification_"], .notifications-list-item, [data-notification-id]');

    for (var i = 0; i < rows.length; i++) {
      var li = rows[i];
      var link = li.querySelector('.markdown-title, a[href]');
      if (!link) continue;
      var href = link.getAttribute('href') || '';
      if (!href || href === '#') continue;

      var title = U.textOf(link);
      if (!title) continue;

      var timeEl = li.querySelector('relative-time[datetime], time[datetime]');
      var reason = li.querySelector('.notification-list-item-reason, [data-reason]');
      var repoEl = li.querySelector('.notification-list-item-repo, .f6 .Link--primary');

      out.push({
        title: title,
        href: href,
        url: href.indexOf('http') === 0 ? href : 'https://github.com' + href,
        unread: /\bunread\b/.test(li.className || '') || li.getAttribute('data-read') === 'false',
        reason: reason ? U.textOf(reason) : '',
        repo: repoEl ? U.textOf(repoEl) : '',
        updated: timeEl ? timeEl.getAttribute('datetime') : null
      });
    }

    if (!out.length) {
      // 兜底：从通知页里所有 issue/PR 链接反推
      var fallback = parseIssueList(doc, limit);
      out = fallback.map(function (it) {
        return { title: it.title, href: it.href, url: it.url, unread: true, reason: '', repo: it.repoFullName, updated: it.updated };
      });
    }

    return limit ? out.slice(0, limit) : out;
  }

  /**
   * 收藏（star）的仓库：/stars 仍然是服务端渲染的老式列表，结构最稳的一个源。
   * 行：ul.repo-list > li，标题 a[href="/owner/name"]，描述 p，语言 .repo-language-color
   */
  function parseStarredRepos(doc, limit) {
    var out = [];
    var rows = doc.querySelectorAll('ul.repo-list > li, li[class*="border-bottom"]');

    for (var i = 0; i < rows.length; i++) {
      var li = rows[i];
      var link = li.querySelector('h3 a[href], a[href]');
      if (!link) continue;
      var href = link.getAttribute('href') || '';
      if (!/^\/[^\/]+\/[^\/]+\/?$/.test(href)) continue;
      if (/^\/(stars|topics|settings|orgs|users)\//.test(href)) continue;

      var parts = href.replace(/^\//, '').replace(/\/$/, '').split('/');
      var desc = li.querySelector('p');
      var lang = li.querySelector('[itemprop="programmingLanguage"]');
      var colorEl = li.querySelector('.repo-language-color');
      var stars = li.querySelector('a[href$="/stargazers"]');

      out.push({
        fullName: parts[0] + '/' + parts[1],
        owner: parts[0],
        name: parts[1],
        href: href,
        description: desc ? U.textOf(desc) : '',
        language: lang ? U.textOf(lang) : '',
        languageColor: U.colorFromStyle(colorEl && colorEl.getAttribute('style')),
        stars: stars ? U.textOf(stars).replace(/[^\d.,km]/gi, '') : '',
        updated: null,
        visibility: ''
      });
    }

    // 去重（同一个仓库在页面里可能出现两次）
    var seen = {};
    out = out.filter(function (r) {
      if (seen[r.fullName]) return false;
      seen[r.fullName] = 1;
      return true;
    });

    return limit ? out.slice(0, limit) : out;
  }

  /** 单个仓库页的头部信息，用于手动添加的关注项目 */
  function parseRepoHeader(doc) {
    var out = { description: '', language: '', languageColor: null, stars: '' };

    var desc = doc.querySelector('[itemprop="description"], .BorderGrid-cell p, p.f4.my-3');
    if (desc) out.description = U.textOf(desc);

    var lang = doc.querySelector('[itemprop="programmingLanguage"]');
    if (lang) out.language = U.textOf(lang);

    var colorEl = doc.querySelector('.repo-language-color');
    if (colorEl) out.languageColor = U.colorFromStyle(colorEl.getAttribute('style'));

    var stars = doc.querySelector('#repo-stars-counter-star, a[href$="/stargazers"] .Counter');
    if (stars) out.stars = U.textOf(stars).replace(/[^\d.,km]/gi, '');

    return out;
  }

  /** 当前页面顶栏的通知未读数（不用额外发请求） */
  function unreadCountFromPage(doc) {
    var doc2 = doc || document;
    var link = doc2.querySelector('a[href="/notifications"]');
    if (!link) return null;

    var counter = link.querySelector('.Counter, [data-target*="count"], span[class*="Counter"]');
    if (counter) {
      var n = parseInt(U.textOf(counter).replace(/[^\d]/g, ''), 10);
      if (!isNaN(n)) return n;
    }
    var aria = link.getAttribute('aria-label') || '';
    var m = /(\d+)\s+unread/i.exec(aria);
    if (m) return parseInt(m[1], 10);
    // 「You have unread notifications」这种没有数字的，只知道有未读
    if (/unread/i.test(aria)) return -1;
    return 0;
  }

  return {
    parseContributions: parseContributions,
    summarizeContributions: summarizeContributions,
    parseIssueList: parseIssueList,
    parseProfile: parseProfile,
    parsePinned: parsePinned,
    parseRepoList: parseRepoList,
    parseStarredRepos: parseStarredRepos,
    parseRepoHeader: parseRepoHeader,
    parseNotifications: parseNotifications,
    unreadCountFromPage: unreadCountFromPage
  };
})();
