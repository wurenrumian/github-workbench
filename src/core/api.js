/**
 * api.js — 同源抓页面 + 缓存 + 分发。
 *
 * 每个数据源独立加载：某个页面挂了只影响那一张卡片，其它照常渲染。
 */
var GHW = (window.GHW = window.GHW || {});

GHW.api = (function () {
  'use strict';

  var P = GHW.parse;
  var STORE = GHW.store;
  var inflight = {};

  function getLogin() {
    var meta = document.querySelector('meta[name="user-login"]');
    var v = meta && meta.getAttribute('content');
    return v ? v.trim() : '';
  }

  function fetchHtml(path) {
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, 20000) : null;

    return fetch(path, {
      credentials: 'same-origin',
      headers: { Accept: 'text/html', 'X-Requested-With': 'GitHubWorkbench' },
      cache: 'no-store',
      signal: controller ? controller.signal : undefined
    })
      .then(function (res) {
        if (res.redirected && /\/login/.test(res.url)) {
          var err = new Error('未登录，或这次请求被 GitHub 拦到了登录页');
          err.code = 'NOT_LOGGED_IN';
          throw err;
        }
        if (!res.ok) {
          var e = new Error('HTTP ' + res.status + ' · ' + path);
          e.code = 'HTTP_' + res.status;
          throw e;
        }
        return res.text();
      })
      .then(function (text) {
        if (!/^\s*</.test(text)) {
          var err = new Error('返回的不是 HTML（可能是 GitHub 改了响应格式）');
          err.code = 'NOT_HTML';
          throw err;
        }
        return new DOMParser().parseFromString(text, 'text/html');
      })
      .then(function (doc) {
        if (timer) clearTimeout(timer);
        return doc;
      })
      .catch(function (err) {
        if (timer) clearTimeout(timer);
        throw err;
      });
  }

  /**
   * issue / PR 列表唯一还能拿到服务端渲染数据的入口是 /search。
   * /issues/assigned、/pulls、/pulls/review-requested 在 2026 版里都变成了
   * 纯 React 壳：SSR 的 HTML 里一个 /owner/repo/pull/123 链接都没有，
   * 数据要等客户端 GraphQL 拉回来，而我们拿不到那个请求。
   */
  function searchUrl(query, type) {
    return '/search?q=' + query + '&type=' + type + '&s=updated&o=desc';
  }

  var SOURCES = {
    contributions: function (login) {
      return fetchHtml('/users/' + encodeURIComponent(login) + '/contributions').then(function (doc) {
        var raw = P.parseContributions(doc);
        var summary = P.summarizeContributions(raw);
        if (!summary) throw new Error('贡献日历解析失败');
        return summary;
      });
    },

    profile: function (login) {
      return fetchHtml('/' + encodeURIComponent(login)).then(function (doc) {
        return {
          meta: P.parseProfile(doc),
          pinned: P.parsePinned(doc)
        };
      });
    },

    // 指派给我
    assigned: function () {
      return fetchHtml(searchUrl('is%3Aissue+is%3Aopen+assignee%3A%40me', 'issues')).then(function (doc) {
        return P.parseIssueList(doc);
      });
    },

    // 我创建的 issue
    created: function () {
      return fetchHtml(searchUrl('is%3Aissue+is%3Aopen+author%3A%40me', 'issues')).then(function (doc) {
        return P.parseIssueList(doc);
      });
    },

    review: function () {
      return fetchHtml(searchUrl('is%3Apr+is%3Aopen+review-requested%3A%40me', 'pullrequests')).then(function (doc) {
        return P.parseIssueList(doc);
      });
    },

    opened: function () {
      return fetchHtml(searchUrl('is%3Apr+is%3Aopen+author%3A%40me', 'pullrequests')).then(function (doc) {
        return P.parseIssueList(doc);
      });
    },

    // 关注的项目：/watching 是空壳，/stars 还是老的 SSR 列表
    starred: function () {
      return fetchHtml('/stars?tab=stars').then(function (doc) {
        return P.parseStarredRepos(doc, 60);
      });
    },

    repos: function (login) {
      return fetchHtml('/' + encodeURIComponent(login) + '?tab=repositories&sort=updated').then(function (doc) {
        return P.parseRepoList(doc, 20);
      });
    }
  };

  /**
   * 取一个数据源。有新鲜缓存就直接用，过期则回源，失败时退回过期缓存。
   * @returns {Promise<{data:any, fromCache:boolean, stale?:boolean, at:number, error?:Error}>}
   */
  function load(name, settings, opts) {
    var force = !!(opts && opts.force);
    var ttl = (settings && settings.refreshMinutes) || STORE.DEFAULTS.refreshMinutes;

    if (inflight[name]) return inflight[name];

    var login = getLogin();
    if (!login) {
      return Promise.reject(new Error('当前不是登录状态'));
    }
    if (!SOURCES[name]) {
      return Promise.reject(new Error('未知数据源 ' + name));
    }

    var task = STORE.cacheGet(name, ttl)
      .then(function (hit) {
        if (hit && !hit.stale && !force) {
          return { data: hit.data, fromCache: true, at: hit.at };
        }
        return SOURCES[name](login).then(
          function (data) {
            STORE.cacheSet(name, data);
            return { data: data, fromCache: false, at: Date.now() };
          },
          function (err) {
            if (hit) {
              return { data: hit.data, fromCache: true, stale: true, at: hit.at, error: err };
            }
            throw err;
          }
        );
      })
      .finally(function () {
        delete inflight[name];
      });

    inflight[name] = task;
    return task;
  }

  return {
    getLogin: getLogin,
    load: load,
    sources: Object.keys(SOURCES)
  };
})();
