/**
 * store.js — 设置与数据缓存。
 *
 * 用 chrome.storage.local 存两类东西：
 *   ghw:settings  用户设置（结构见 DEFAULTS）
 *   ghw:cache:<k> 数据源缓存，带写入时间戳，过期后才重新抓
 *
 * 缓存的意义：首页每次打开都抓 5 个页面太蠢，而且是同源请求，
 * 刷新太快也容易撞上 GitHub 的限流。
 */
var GHW = (window.GHW = window.GHW || {});

GHW.store = (function () {
  'use strict';

  var SETTINGS_KEY = 'ghw:settings';
  // 解析结果改结构时升版本号，让旧缓存自动作废
  var CACHE_PREFIX = 'ghw:cache:v2:';

  var DEFAULTS = {
    // 总开关：开 = 接管内容区，关 = 完全不介入（没有「半接管」这种中间状态）
    enabled: true,
    // 保留 GitHub 左侧原生导航栏（默认收起，版面更宽）
    keepChrome: false,
    // 缓存有效期（分钟）
    refreshMinutes: 10,
    // 每个列表最多显示多少条
    listLimit: 8,
    // 最近更新仓库显示多少个
    repoCount: 8,
    // 关注的项目显示多少个（没手动挑选时）
    starredCount: 6,
    // 手动挑选要显示的关注项目（["owner/name", ...]，空数组 = 用上面那个默认数量）
    starredPicks: [],
    // 面板顺序（拖动后保存）：{ main: [...], side: [...] }
    layout: { main: [], side: [] },
    panels: {
      contributions: true,
      issues: true,
      review: true,
      opened: true,
      starred: true,
      repos: true,
      pinned: true
    }
  };

  // chrome.* 在扩展环境里一定存在；用 localStorage 兜底是为了能在普通网页里调试
  var hasChrome = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;

  function readRaw(key) {
    if (hasChrome) {
      return new Promise(function (resolve) {
        chrome.storage.local.get(key, function (res) {
          resolve(res ? res[key] : undefined);
        });
      });
    }
    try {
      var v = localStorage.getItem(key);
      return Promise.resolve(v ? JSON.parse(v) : undefined);
    } catch (e) {
      return Promise.resolve(undefined);
    }
  }

  function writeRaw(key, value) {
    if (hasChrome) {
      var obj = {};
      obj[key] = value;
      return new Promise(function (resolve) {
        chrome.storage.local.set(obj, resolve);
      });
    }
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      /* 配额满了就算了，缓存不是关键数据 */
    }
    return Promise.resolve();
  }

  function removeRaw(keys) {
    if (hasChrome) {
      return new Promise(function (resolve) {
        chrome.storage.local.remove(keys, resolve);
      });
    }
    keys.forEach(function (k) {
      localStorage.removeItem(k);
    });
    return Promise.resolve();
  }

  /** 深合并默认值，保证老版本设置里缺的键能补上 */
  function withDefaults(saved) {
    var out = JSON.parse(JSON.stringify(DEFAULTS));
    if (!saved || typeof saved !== 'object') return out;
    for (var k in saved) {
      if (!Object.prototype.hasOwnProperty.call(saved, k)) continue;
      if (k === 'layout' && saved.layout && typeof saved.layout === 'object') {
        out.layout = {
          main: Array.isArray(saved.layout.main) ? saved.layout.main.slice() : [],
          side: Array.isArray(saved.layout.side) ? saved.layout.side.slice() : []
        };
      } else if (k === 'panels' && saved.panels && typeof saved.panels === 'object') {
        for (var p in saved.panels) out.panels[p] = !!saved.panels[p];
      } else {
        out[k] = saved[k];
      }
    }
    return out;
  }

  function getSettings() {
    return readRaw(SETTINGS_KEY).then(withDefaults);
  }

  function saveSettings(patch) {
    return getSettings().then(function (current) {
      var next = Object.assign({}, current, patch || {});
      if (patch && patch.panels) {
        next.panels = Object.assign({}, current.panels, patch.panels);
      }
      return writeRaw(SETTINGS_KEY, next).then(function () {
        return next;
      });
    });
  }

  function cacheGet(name, ttlMinutes) {
    return readRaw(CACHE_PREFIX + name).then(function (entry) {
      if (!entry || !entry.at || !entry.data) return null;
      var ttl = (ttlMinutes == null ? DEFAULTS.refreshMinutes : ttlMinutes) * 60 * 1000;
      if (Date.now() - entry.at > ttl) return { data: entry.data, stale: true, at: entry.at };
      return { data: entry.data, stale: false, at: entry.at };
    });
  }

  function cacheSet(name, data) {
    return writeRaw(CACHE_PREFIX + name, { at: Date.now(), data: data });
  }

  function clearCache() {
    if (hasChrome) {
      return new Promise(function (resolve) {
        chrome.storage.local.get(null, function (all) {
          var keys = Object.keys(all || {}).filter(function (k) {
            return k.indexOf(CACHE_PREFIX) === 0;
          });
          if (!keys.length) return resolve();
          chrome.storage.local.remove(keys, resolve);
        });
      });
    }
    Object.keys(localStorage)
      .filter(function (k) {
        return k.indexOf(CACHE_PREFIX) === 0;
      })
      .forEach(function (k) {
        localStorage.removeItem(k);
      });
    return Promise.resolve();
  }

  return {
    DEFAULTS: DEFAULTS,
    getSettings: getSettings,
    saveSettings: saveSettings,
    cacheGet: cacheGet,
    cacheSet: cacheSet,
    clearCache: clearCache
  };
})();
