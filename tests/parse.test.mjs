/**
 * parse.test.mjs — 解析层的回归测试。
 *
 * 之所以需要它：解析的是 GitHub 的 HTML，看不见就改很容易把兜底逻辑写坏。
 * 这里有真实抓下来的页面（contributions / repositories），
 * 以及按 GitHub 现有结构手写的 issue 列表 fixture。
 *
 * 跑法：cd tests && npm test
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const fixtures = path.join(__dirname, 'fixtures');

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

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: 期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`);
}

/** 在 jsdom 里加载扩展的 core 脚本，返回 window.GHW */
function bootstrap(html) {
  const dom = new JSDOM(html || '<!doctype html><html><body></body></html>', {
    runScripts: 'outside-only',
    url: 'https://github.com/'
  });
  const { window } = dom;
  for (const f of ['util.js', 'store.js', 'parse.js']) {
    window.eval(fs.readFileSync(path.join(root, 'src/core', f), 'utf8'));
  }
  return window;
}

const parseDoc = (window, file) =>
  new window.DOMParser().parseFromString(fs.readFileSync(file, 'utf8'), 'text/html');

/* ------------------------------------------------------------------ 用例 */

console.log('\n[贡献日历]');
{
  const window = bootstrap();
  const doc = parseDoc(window, path.join(fixtures, 'contributions.html'));
  const raw = window.GHW.parse.parseContributions(doc);
  const summary = window.GHW.parse.summarizeContributions(raw);

  check('解析出 365 个格子', () => assertEqual(raw.days.length, 365, 'days'));
  check('日期升序且不重复', () => {
    for (let i = 1; i < raw.days.length; i++) {
      assert(raw.days[i].date > raw.days[i - 1].date, `第 ${i} 个日期顺序不对: ${raw.days[i].date}`);
    }
  });
  check('格子 level 在 0..4', () => {
    for (const d of raw.days) assert(d.level >= 0 && d.level <= 4, `${d.date} level=${d.level}`);
  });
  check('总贡献数 > 0', () => assert(summary.total > 0, `total=${summary.total}`));
  check('有贡献的天数不超过 365', () => assert(summary.activeDays <= 365, `active=${summary.activeDays}`));
  check('当前连续天数 <= 最长连续', () =>
    assert(summary.currentStreak <= summary.longestStreak, `${summary.currentStreak} > ${summary.longestStreak}`));
  check('本周贡献 >= 今日贡献', () => assert(summary.weekTotal >= summary.todayCount, 'week < today'));
  check('能读到 tool-tip 里的精确次数', () => {
    const exact = raw.days.filter((d) => d.count > d.level || d.count === 0);
    assert(exact.length > 0, '没有一个格子的 count 来自 tool-tip');
  });
}

console.log('\n[仓库列表]');
{
  const window = bootstrap();
  const doc = parseDoc(window, path.join(fixtures, 'repositories.html'));
  const repos = window.GHW.parse.parseRepoList(doc, 20);

  check('至少解析出 5 个仓库', () => assert(repos.length >= 5, `只拿到 ${repos.length} 个`));
  check('第一个是 torvalds/linux', () => assertEqual(repos[0].fullName, 'torvalds/linux', 'fullName'));
  check('带上了语言和 star', () => {
    assertEqual(repos[0].language, 'C', 'language');
    assert(repos[0].stars.length > 0, 'stars 为空');
  });
  check('语言有颜色', () => assertEqual(repos[0].languageColor, '#555555', 'languageColor'));
  check('带上了更新时间', () => assert(/^\d{4}-\d{2}-\d{2}/.test(repos[0].updated), `updated=${repos[0].updated}`));
  check('fullName 形如 owner/name', () => {
    for (const r of repos) assert(/^[^/]+\/[^/]+$/.test(r.fullName), `坏掉的 fullName: ${r.fullName}`);
  });
  const limited = window.GHW.parse.parseRepoList(doc, 3);
  check('limit 生效', () => assertEqual(limited.length, 3, 'length'));
}

console.log('\n[issue / PR 列表]');
{
  const window = bootstrap();
  const doc = parseDoc(window, path.join(fixtures, 'issues.html'));
  const list = window.GHW.parse.parseIssueList(doc);

  check('解析出 3 条', () => assertEqual(list.length, 3, '条数'));
  check('列表页链接 / 评论锚点被忽略', () =>
    assert(!list.some((i) => /#/.test(i.href)), '混进了带 # 的链接'));

  const first = list.find((i) => i.number === 12345);
  check('标题去掉了 #编号前缀', () => assertEqual(first.title, 'Fix the thing', 'title'));
  check('repo / number 正确', () => {
    assertEqual(first.repoFullName, 'facebook/react', 'repoFullName');
    assertEqual(first.type, 'issue', 'type');
  });
  check('解析出多个标签', () => assertEqual(first.labels.join(','), 'bug,good first issue', 'labels'));
  check('解析出状态', () => assertEqual(first.state, 'open', 'state'));
  check('解析出时间', () => assertEqual(first.updated, '2026-11-20T10:00:00Z', 'updated'));
  check('按时间倒序', () => {
    for (let i = 1; i < list.length; i++) {
      assert(Date.parse(list[i - 1].updated) >= Date.parse(list[i].updated), '排序不对');
    }
  });

  const pr = list.find((i) => i.type === 'pr');
  check('识别出 PR', () => assert(!!pr, '没有识别到 PR'));
  check('PR 状态 merged', () => assertEqual(pr.state, 'merged', 'state'));

  const limited = window.GHW.parse.parseIssueList(doc, 2);
  check('limit 生效', () => assertEqual(limited.length, 2, 'length'));
}

console.log('\n[通知列表]');
{
  const window = bootstrap();
  const doc = parseDoc(window, path.join(fixtures, 'notifications.html'));
  const list = window.GHW.parse.parseNotifications(doc, 20);

  check('解析出 2 条通知', () => assertEqual(list.length, 2, '条数'));
  check('未读状态正确', () => {
    assertEqual(list[0].unread, true, '第一条 unread');
    assertEqual(list[1].unread, false, '第二条 unread');
  });
  check('链接补全成绝对地址', () =>
    assert(list.every((n) => n.url.startsWith('https://github.com/')), '有相对链接'));
}

console.log('\n[未读角标]');
{
  const window = bootstrap(`<!doctype html><html><body>
    <a href="/notifications" aria-label="You have 12 unread notifications"><span class="Counter">12</span></a>
  </body></html>`);
  const n = window.GHW.parse.unreadCountFromPage(window.document);
  check('从顶栏读出未读数', () => assertEqual(n, 12, 'count'));
}

console.log('\n[单个仓库页]');
{
  const window = bootstrap(`<!doctype html><html><body>
    <p class="SidebarAbout-module_eqNI3a_description prc-Text-Text-9mHv3">把 GitHub 首页换成工作台</p>
    <a class="prc-TopicTag-TopicTag-LS-jX" href="/topics/chrome-extension">chrome-extension</a>
    <a class="prc-TopicTag-TopicTag-LS-jX" href="/topics/github">github</a>
    <a href="/wurenrumian/github-workbench/stargazers">0 stars</a>
    <a href="/wurenrumian/github-workbench/forks">0 forks</a>
    <script>var p = {stargazerCount:78033,watcherCount:1296,forksCount:14998};</script>
  </body></html>`);
  const doc = new window.DOMParser().parseFromString(window.document.documentElement.outerHTML, 'text/html');
  const meta = window.GHW.parse.parseRepoHeader(doc);

  check('读到描述', () => assertEqual(meta.description, '把 GitHub 首页换成工作台', 'description'));
  check('star / fork 来自内联 props', () => {
    assertEqual(meta.stars, '78k', 'stars');
    assertEqual(meta.forks, '15k', 'forks');
  });
  check('读到 topics', () => assertEqual(meta.topics.join(','), 'chrome-extension,github', 'topics'));
}

console.log('\n[仓库搜索结果]');
{
  const window = bootstrap(`<!doctype html><html><body>
    <div class="Result__Of4h7n"><div class="resultRow__BjR5Xh">
      <h3 class="header__ZqTG4W"><div class="search-title"><a href="/wurenrumian/github-workbench">wurenrumian/github-workbench</a></div></h3>
      <div class="Content__agXLbn">把 GitHub 首页换成工作台</div>
      <div class="tokenList__w65Lup"><a href="/topics/github">github</a></div>
      <ul class="footer__evnOBN">
        <li><span aria-label="JavaScript language">JavaScript</span>
            <div class="languageCircle__eF82_7" style="background-color:#f1e05a"></div></li>
        <li><a href="/wurenrumian/github-workbench/stargazers"><span>13,149</span></a></li>
        <li><span>Updated <div title="Nov 22, 2026, 8:57 AM UTC"><span title="Nov 22, 2026, 8:57 AM UTC">7 minutes ago</span></div></span></li>
      </ul>
    </div></div>
  </body></html>`);
  const doc = new window.DOMParser().parseFromString(window.document.documentElement.outerHTML, 'text/html');
  const meta = window.GHW.parse.parseRepoSearch(doc, 'wurenrumian/github-workbench');

  check('读到语言和颜色', () => {
    assertEqual(meta.language, 'JavaScript', 'language');
    assertEqual(meta.languageColor, '#f1e05a', 'languageColor');
  });
  check('star 数格式化成短格式', () => assertEqual(meta.stars, '13.1k', 'stars'));
  check('读到更新时间', () => assertEqual(meta.updated, '2026-11-22T08:57:00.000Z', 'updated'));
  check('读到 topics', () => assertEqual(meta.topics.join(','), 'github', 'topics'));
  check('仓库名对不上时返回空', () =>
    assertEqual(window.GHW.parse.parseRepoSearch(doc, 'someone/else').description, '', 'description'));
}

console.log('\n[空输入不崩]');
{
  const window = bootstrap();
  const doc = new window.DOMParser().parseFromString('<html><body></body></html>', 'text/html');
  check('parseContributions 返回 null', () =>
    assertEqual(window.GHW.parse.parseContributions(doc), null, 'result'));
  check('summarizeContributions(null) 返回 null', () =>
    assertEqual(window.GHW.parse.summarizeContributions(null), null, 'result'));
  check('parseIssueList 返回空数组', () =>
    assertEqual(window.GHW.parse.parseIssueList(doc).length, 0, 'length'));
  check('parseRepoList 返回空数组', () =>
    assertEqual(window.GHW.parse.parseRepoList(doc).length, 0, 'length'));
}

console.log('');
if (failures) {
  console.log(`✗ ${failures} 个用例失败\n`);
  process.exit(1);
}
console.log('✓ 全部通过\n');
