/**
 * popup.js — 设置界面。
 * 复用 ../core/store.js 里的 DEFAULTS / 读写逻辑，避免两份默认值走偏。
 */
(function () {
  'use strict';

  var STORE = window.GHW.store;

  var PANELS = [
    ['contributions', '贡献日历'],
    ['assigned', '指派给我'],
    ['review', '等我评审'],
    ['opened', '我开的 PR'],
    ['notifications', '通知'],
    ['repos', '最近更新'],
    ['pinned', '置顶仓库']
  ];

  var els = {
    enabled: document.getElementById('enabled'),
    hideNative: document.getElementById('hideNative'),
    keepChrome: document.getElementById('keepChrome'),
    panels: document.getElementById('panels'),
    refreshMinutes: document.getElementById('refreshMinutes'),
    listLimit: document.getElementById('listLimit'),
    repoCount: document.getElementById('repoCount'),
    clearCache: document.getElementById('clearCache'),
    note: document.getElementById('note')
  };

  var defaultNote = els.note.textContent;
  var noteTimer = null;

  function flash(text) {
    els.note.textContent = text;
    if (noteTimer) clearTimeout(noteTimer);
    noteTimer = setTimeout(function () {
      els.note.textContent = defaultNote;
    }, 1800);
  }

  function save(patch) {
    STORE.saveSettings(patch).then(function () {
      flash('已保存，刷新 GitHub 首页生效');
    });
  }

  function render(settings) {
    els.enabled.checked = !!settings.enabled;
    els.hideNative.checked = !!settings.hideNative;
    els.keepChrome.checked = !!settings.keepChrome;
    els.refreshMinutes.value = String(settings.refreshMinutes);
    els.listLimit.value = String(settings.listLimit);
    els.repoCount.value = String(settings.repoCount);

    els.panels.textContent = '';
    PANELS.forEach(function (pair) {
      var key = pair[0];
      var id = 'panel-' + key;
      var label = document.createElement('label');
      label.className = 'check';
      var input = document.createElement('input');
      input.type = 'checkbox';
      input.id = id;
      input.checked = !!settings.panels[key];
      input.addEventListener('change', function () {
        var patch = { panels: {} };
        patch.panels[key] = input.checked;
        save(patch);
      });
      label.appendChild(input);
      label.appendChild(document.createTextNode(pair[1]));
      els.panels.appendChild(label);
    });
  }

  els.enabled.addEventListener('change', function () {
    save({ enabled: els.enabled.checked });
  });

  els.hideNative.addEventListener('change', function () {
    save({ hideNative: els.hideNative.checked });
  });

  els.keepChrome.addEventListener('change', function () {
    save({ keepChrome: els.keepChrome.checked });
  });

  els.refreshMinutes.addEventListener('change', function () {
    save({ refreshMinutes: Number(els.refreshMinutes.value) });
  });

  els.listLimit.addEventListener('change', function () {
    save({ listLimit: Number(els.listLimit.value) });
  });

  els.repoCount.addEventListener('change', function () {
    save({ repoCount: Number(els.repoCount.value) });
  });

  els.clearCache.addEventListener('click', function () {
    STORE.clearCache().then(function () {
      flash('缓存已清空');
    });
  });

  STORE.getSettings().then(render);
})();
