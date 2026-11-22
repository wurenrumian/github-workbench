/**
 * util.js — DOM 构造、数字/时间格式化等小工具。
 *
 * 所有模块都挂在一个命名空间 GHW 上（content script 共享同一个 isolated world，
 * 因此这里定义的全局变量可以被后续脚本直接读到）。
 */
var GHW = (window.GHW = window.GHW || {});

GHW.util = (function () {
  'use strict';

  /** 创建元素的小工具：h('div', {class:'x', onclick: fn}, 'text', child) */
  function h(tag, props) {
    var node = document.createElement(tag);
    if (props) {
      for (var key in props) {
        if (!Object.prototype.hasOwnProperty.call(props, key)) continue;
        var val = props[key];
        if (val == null || val === false) continue;
        if (key === 'class' || key === 'className') {
          node.className = val;
        } else if (key === 'dataset') {
          for (var d in val) node.dataset[d] = val[d];
        } else if (key === 'style' && typeof val === 'object') {
          for (var s in val) node.style.setProperty(s, val[s]);
        } else if (key.slice(0, 2) === 'on' && typeof val === 'function') {
          node.addEventListener(key.slice(2).toLowerCase(), val);
        } else if (key === 'text') {
          node.textContent = String(val);
        } else {
          node.setAttribute(key, val === true ? '' : String(val));
        }
      }
    }
    append(node, Array.prototype.slice.call(arguments, 2));
    return node;
  }

  function append(node, children) {
    for (var i = 0; i < children.length; i++) {
      var child = children[i];
      if (child == null || child === false) continue;
      if (Array.isArray(child)) {
        append(node, child);
      } else if (child instanceof Node) {
        node.appendChild(child);
      } else {
        node.appendChild(document.createTextNode(String(child)));
      }
    }
  }

  /** 千分位 + 大数缩写：1234 -> 1,234；1234567 -> 1.2m */
  function fmtNum(n) {
    if (n == null || isNaN(n)) return '–';
    n = Number(n);
    if (n >= 1000000) return trimZero((n / 1000000).toFixed(1)) + 'm';
    if (n >= 10000) return trimZero((n / 1000).toFixed(1)) + 'k';
    return n.toLocaleString('en-US');
  }

  function trimZero(s) {
    return s.replace(/\.0$/, '');
  }

  /** 相对时间：刚刚 / 5 分钟前 / 3 小时前 / 2 天前 / 3 个月前 */
  function relTime(input) {
    var ts = input instanceof Date ? input.getTime() : new Date(input).getTime();
    if (isNaN(ts)) return '';
    var diff = Date.now() - ts;
    var future = diff < 0;
    diff = Math.abs(diff);
    var min = 60 * 1000;
    var hour = 60 * min;
    var day = 24 * hour;
    var out;
    if (diff < 2 * min) out = '刚刚';
    else if (diff < hour) out = Math.floor(diff / min) + ' 分钟';
    else if (diff < day) out = Math.floor(diff / hour) + ' 小时';
    else if (diff < 30 * day) out = Math.floor(diff / day) + ' 天';
    else if (diff < 365 * day) out = Math.floor(diff / (30 * day)) + ' 个月';
    else out = Math.floor(diff / (365 * day)) + ' 年';
    return future ? out + '后' : out + '前';
  }

  /** 本地时区的 YYYY-MM-DD，用来和贡献日历的 data-date 对齐 */
  function dayKey(date) {
    var d = date instanceof Date ? date : new Date(date);
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }

  function addDays(date, n) {
    var d = new Date(date.getTime());
    d.setDate(d.getDate() + n);
    return d;
  }

  /** 把数组切成定长块 */
  function chunk(arr, size) {
    var out = [];
    for (var i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  }

  /** 安全取文本并压掉多余空白 */
  function textOf(node) {
    if (!node) return '';
    return (node.textContent || '').replace(/\s+/g, ' ').trim();
  }

  /** 从 style="background-color: #f1e05a" 里抠出颜色 */
  function colorFromStyle(style) {
    if (!style) return null;
    var m = /(?:background(?:-color)?\s*:\s*)(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|[a-z]+)/.exec(style);
    return m ? m[1] : null;
  }

  return {
    h: h,
    append: append,
    fmtNum: fmtNum,
    relTime: relTime,
    dayKey: dayKey,
    addDays: addDays,
    chunk: chunk,
    textOf: textOf,
    colorFromStyle: colorFromStyle
  };
})();
