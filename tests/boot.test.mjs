/**
 * boot.test.mjs — 首帧遮罩的边界测试。
 *
 * boot.js 是「先盖后验」，所以重点不是「首页会盖」，而是：
 *   1. 解析阶段先盖，DOMContentLoaded 时发现未登录要立刻撤（营销首页不能被遮）；
 *   2. 非首页不盖；
 *   3. Turbo 站内跳转按目标 URL 决定盖 / 撤（此时 head 已稳定，直接看登录态）；
 *   4. reveal() 一定能撤掉。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/content/boot.js'), 'utf8');

let failures = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    failures++;
    console.log(`  FAIL ${name}\n       ${err.message}`);
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

/**
 * @param {string} url
 * @param {boolean} loggedIn 是否在 head 里放 <meta name="user-login">
 * @param {{forceLoading?: boolean}} [opts] 强制模拟「head 还在解析」的阶段
 */
function boot(url, loggedIn, opts = {}) {
  const head = loggedIn ? '<meta name="user-login" content="octocat">' : '';
  const dom = new JSDOM(`<!doctype html><html><head>${head}</head><body></body></html>`, {
    runScripts: 'outside-only',
    url
  });
  const { window } = dom;
  if (opts.forceLoading) {
    Object.defineProperty(window.document, 'readyState', { get: () => 'loading' });
  }
  window.eval(source);
  return window;
}

const veiled = (win) => win.document.documentElement.classList.contains('ghw-booting');
const domReady = (win) => win.document.dispatchEvent(new win.Event('DOMContentLoaded'));

console.log('\n[首帧遮罩]');

check('解析阶段先盖住', () => {
  const win = boot('https://github.com/', true, { forceLoading: true });
  assert(veiled(win), '解析阶段没有加 ghw-booting');
});

check('DOMContentLoaded 有登录标记 → 保留遮罩', () => {
  const win = boot('https://github.com/', true, { forceLoading: true });
  domReady(win);
  assert(veiled(win), '登录态下遮罩被提前撤掉了');
});

check('DOMContentLoaded 没有登录标记 → 立刻撤', () => {
  const win = boot('https://github.com/', false, { forceLoading: true });
  domReady(win);
  assert(!veiled(win), '未登录的营销首页被遮住了');
});

check('dashboard 也算首页', () => {
  const win = boot('https://github.com/dashboard', true, { forceLoading: true });
  assert(veiled(win), 'dashboard 没有加 ghw-booting');
});

check('非首页 → 不盖', () => {
  const win = boot('https://github.com/octocat', true, { forceLoading: true });
  assert(!veiled(win), '仓库页被遮住了');
});

check('reveal 能撤掉遮罩', () => {
  const win = boot('https://github.com/', true, { forceLoading: true });
  win.GHW.boot.reveal();
  assert(!veiled(win), 'reveal 之后还有 ghw-booting');
});

check('turbo:visit 按目标 URL 盖 / 撤（已登录）', () => {
  const win = boot('https://github.com/octocat', true);
  const go = (url) =>
    win.document.dispatchEvent(new win.CustomEvent('turbo:visit', { detail: { url } }));

  go('https://github.com/');
  assert(veiled(win), '跳去首页时没有盖');

  go('https://github.com/octocat/Hello-World');
  assert(!veiled(win), '离开首页后遮罩没撤');
});

check('未登录时 turbo 跳转去首页也不盖', () => {
  const win = boot('https://github.com/octocat', false);
  win.document.dispatchEvent(
    new win.CustomEvent('turbo:visit', { detail: { url: 'https://github.com/' } })
  );
  assert(!veiled(win), '未登录时 turbo 跳转把页面盖住了');
});

check('工作台已在 DOM 里（bfcache）→ 不重复盖', () => {
  const win = boot('https://github.com/', true);
  const root = win.document.createElement('div');
  root.id = 'ghw-root';
  win.document.body.appendChild(root);

  win.GHW.boot.reveal();
  win.GHW.boot.veil();
  assert(!veiled(win), '已有工作台还盖了一层白');

  // 站内真的换页（Turbo）时旧工作台马上会被移除，这时候要盖
  win.document.dispatchEvent(
    new win.CustomEvent('turbo:visit', { detail: { url: 'https://github.com/dashboard' } })
  );
  assert(veiled(win), 'Turbo 换页时没有盖');
});

if (failures) {
  console.log(`\n✗ ${failures} 项失败`);
  process.exit(1);
}
console.log('\n✓ 全部通过');
