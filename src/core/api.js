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

    assigned: function () {
      return fetchHtml('/issues/assigned').then(function (doc) {
        return P.parseIssueList(doc).filter(function (i) {
          return i.type === 'issue';
        });
      });
    },

    review: function () {
      return fetchHtml('/pulls/review-requested').then(function (doc) {
        return P.parseIssueList(doc);
      });
    },

    opened: function () {
      return fetchHtml('/pulls').then(function (doc) {
        return P.parseIssueList(doc).filter(function (i) {
          return i.type === 'pr';
        });
      });
    },

    notifications: function () {
      return fetchHtml('/notifications').then(function (doc) {
        return P.parseNotifications(doc, 20);
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
