/**
 * ui.test.mjs — 渲染层的冒烟测试。
 *
 * 把 ui.js 挂到 jsdom 里，依次灌入每种数据源，确认：
 *   1. 不抛异常（覆盖最容易被写错的那批 DOM 代码）；
 *   2. 渲染出的节点数量/文案符合预期；
 *   3. 用户可控文本走的是 textContent（不会被当成 HTML 执行）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

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

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  runScripts: 'outside-only',
  url: 'https://github.com/'
});
const { window } = dom;
for (const f of ['util.js', 'store.js', 'parse.js']) {
  window.eval(fs.readFileSync(path.join(root, 'src/core', f), 'utf8'));
}
window.eval(fs.readFileSync(path.join(root, 'src/content/ui.js'), 'utf8'));

const { document } = window;
const GHW = window.GHW;

const settings = {
  enabled: true,
  hideNative: true,
  keepChrome: true,
  refreshMinutes: 10,
  listLimit: 8,
  repoCount: 4,
  panels: {
    contributions: true,
    assigned: true,
    review: true,
    opened: true,
    notifications: true,
    repos: true,
    pinned: true
  }
};

const calls = [];
const app = GHW.ui.create({
  login: 'octocat',
  settings,
  onRefresh: () => calls.push('refresh'),
  onRetry: (n) => calls.push('retry:' + n),
  onToggleNative: () => calls.push('toggle')
});
document.body.appendChild(app.el);

const q = (sel) => document.querySelectorAll(sel);

console.log('\n[骨架]');
check('渲染出根容器', () => assert(document.querySelector('#ghw-root-inner'), '没有根节点'));
check('7 个面板都建好了', () => assert(q('.ghw-panel').length === 7, `实际 ${q('.ghw-panel').length}`));
check('面板初始都是骨架屏', () => assert(q('.ghw-skel').length > 0, '没有骨架'));
check('快捷入口有 7 个', () => assert(q('.ghw-quick-link').length === 7, `实际 ${q('.ghw-quick-link').length}`));

console.log('\n[贡献日历]');
{
  const doc = new window.DOMParser().parseFromString(
    fs.readFileSync(path.join(__dirname, 'fixtures/contributions.html'), 'utf8'),
    'text/html'
  );
  const summary = GHW.parse.summarizeContributions(GHW.parse.parseContributions(doc));
  check('apply 不抛异常', () => app.apply('contributions', { data: summary }));
  check('渲染出 365 个格子', () => assert(q('[data-panel="contributions"] .ghw-heat-cell:not(.is-pad)').length === 365, `实际 ${q('[data-panel="contributions"] .ghw-heat-cell:not(.is-pad)').length}`));
  check('有 5 个统计块', () => assert(q('.ghw-stat').length === 5, `实际 ${q('.ghw-stat').length}`));
  check('月份标签不超过 13 个', () => assert(q('.ghw-heat-month').length <= 13, `实际 ${q('.ghw-heat-month').length}`));
  check('格子上有 title 提示', () => {
    const cell = document.querySelector('.ghw-heat-cell[data-level="1"]');
    assert(/次贡献/.test(cell.getAttribute('title')), 'title 缺失');
  });
}

console.log('\n[身份信息 / 置顶]');
{
  app.apply('profile', {
    data: {
      meta: { name: 'The Octocat', bio: 'hi', followers: '16k', following: '9' },
      pinned: [
        { fullName: 'octocat/Hello-World', href: '/octocat/Hello-World', description: 'demo', language: 'Ruby', languageColor: '#701516', stars: '2k' }
      ]
    }
  });
  check('昵称写进 hero', () => assert(document.querySelector('.ghw-name').textContent === 'The Octocat', document.querySelector('.ghw-name').textContent));
  check('bio 显示出来', () => assert(!document.querySelector('.ghw-bio').classList.contains('is-hidden'), 'bio 还藏着'));
  check('粉丝数进了 chip', () => assert(document.querySelector('.ghw-chips').textContent.includes('16k'), '没有粉丝数'));
  check('置顶仓库渲染成卡片', () => assert(q('[data-panel="pinned"] .ghw-repo').length === 1, '置顶卡片数量不对'));
}

console.log('\n[issue / PR]');
{
  const items = [
    { type: 'issue', owner: 'a', repo: 'b', number: 1, title: '第一条', href: '/a/b/issues/1', repoFullName: 'a/b', updated: '2026-11-20T10:00:00Z', state: 'open', labels: ['bug'] },
    { type: 'pr', owner: 'a', repo: 'b', number: 2, title: '第二条', href: '/a/b/pull/2', repoFullName: 'a/b', updated: '2026-11-19T10:00:00Z', state: 'merged', labels: [] }
  ];
  check('apply 不抛异常', () => app.apply('assigned', { data: items }));
  check('渲染出 2 行', () => assert(q('[data-panel="assigned"] .ghw-row').length === 2, `实际 ${q('[data-panel="assigned"] .ghw-row').length}`));
  check('计数角标显示 2', () => assert(document.querySelector('[data-panel="assigned"] .ghw-count').textContent === '2', '角标不对'));
  check('PR 带 PR 标记', () => assert(q('[data-panel="assigned"] .ghw-kind').length === 1, '没有 PR 标记'));
  check('合并状态有对应样式', () => assert(!!document.querySelector('.ghw-state--merged'), '没有 merged 样式'));

  check('空列表走空状态', () => {
    app.apply('review', { data: [] });
    assert(document.querySelector('[data-panel="review"] .ghw-empty'), '没有空状态');
  });
}

console.log('\n[仓库]');
{
  const repos = Array.from({ length: 6 }, (_, i) => ({
    fullName: `o/r${i}`,
    href: `/o/r${i}`,
    description: 'desc',
    language: 'Go',
    languageColor: '#00ADD8',
    stars: '12',
    updated: '2026-11-01T00:00:00Z',
    visibility: i % 2 ? 'Private' : 'Public'
  }));
  app.apply('repos', { data: repos });
  check('repoCount=4 时只渲染 4 个', () => assert(q('[data-panel="repos"] .ghw-repo').length === 4, `实际 ${q('[data-panel="repos"] .ghw-repo').length}`));
  check('私有仓库有徽章', () => assert(q('[data-panel="repos"] .ghw-badge').length === 2, '私有徽章数量不对'));
}

console.log('\n[通知]');
{
  app.apply('notifications', {
    data: [
      { title: '未读的', href: '/a/b/issues/1', url: 'https://github.com/a/b/issues/1', unread: true, repo: 'a/b', updated: '2026-11-22T01:00:00Z' },
      { title: '已读的', href: '/a/b/issues/2', url: 'https://github.com/a/b/issues/2', unread: false, repo: 'a/b', updated: null }
    ]
  });
  check('渲染出 2 条', () => assert(q('[data-panel="notifications"] .ghw-row').length === 2, '数量不对'));
  check('已读的加 is-read', () => assert(q('[data-panel="notifications"] .ghw-row.is-read').length === 1, 'is-read 数量不对'));
}

console.log('\n[错误与安全]');
{
  app.setError('opened', new Error('boom'));
  check('错误信息渲染出来', () => assert(/boom/.test(document.querySelector('[data-panel="opened"]').textContent), '没有错误文案'));
  check('重试按钮触发回调', () => {
    document.querySelector('[data-panel="opened"] .ghw-btn').click();
    assert(calls.includes('retry:opened'), '回调没触发');
  });

  app.apply('assigned', {
    data: [{ type: 'issue', owner: 'x', repo: 'y', number: 3, title: '<img src=x onerror=alert(1)>', href: '/x/y/issues/3', repoFullName: 'x/y', updated: null, state: 'open', labels: ['<b>x</b>'] }]
  });
  check('标题里的 HTML 不会被解析', () => assert(q('[data-panel="assigned"] img').length === 0, '出现了 img 节点，说明用了 innerHTML'));
}

console.log('\n[刷新 / 切换]');
{
  document.querySelector('.ghw-hero-btns .ghw-btn').click();
  check('刷新按钮触发回调', () => assert(calls.includes('refresh'), '回调没触发'));
  app.setNativeVisible(true);
  check('原生页面按钮文案切换', () =>
    assert(document.querySelectorAll('.ghw-hero-btns .ghw-btn')[1].textContent === '回到工作台', '文案没变'));
}

console.log('');
if (failures) {
  console.log(`✗ ${failures} 个用例失败\n`);
  process.exit(1);
}
console.log('✓ 全部通过\n');

