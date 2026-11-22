# 数据从哪来

这个扩展不调用 `api.github.com`，而是用你浏览器里已有的登录态，同源 `fetch` 几个 GitHub 页面，再自己解析 HTML。原因很简单：没有 token 时官方 API 只有 60 次/小时，而且它是跨域接口，拿不到 `github.com` 的 cookie。

代价是**依赖网页结构**。这份文档记录 2026-11 实测下来「哪些页面还能拿到数据」，改版时先看这里。

> 页面结构会变。解析函数在 `src/core/parse.js`，每个都是「主选择器 + 兜底启发式」，改版后先确认对应入口还有没有服务端渲染。

## 一览

| 目标 | 请求 | 现状 |
| --- | --- | --- |
| 贡献日历 | `/users/<login>/contributions` | ✅ SSR。`td[data-date]` 给日期和等级，配对的 `<tool-tip>` 给精确次数 |
| 个人信息 | `/<login>` | ✅ 大体 SSR。名字 / bio / 关注数 / 头像 / 成就徽章都有；「Joined」日期是客户端渲染，拿不到 |
| 最近更新的仓库 | `/<login>?tab=repositories&sort=updated` | ✅ SSR。`li[itemprop="owns"]` 结构稳定 |
| 关注的项目（star） | `/stars?tab=stars` | ⚠️ SSR，但只渲染第一页 10 个；`page=` / `sort=` 被忽略 |
| Issue / PR 列表 | `/search?q=…&type=issues\|pullrequests` | ✅ SSR。链接、标题、摘要、作者、评论数、时间都在 |
| 单个仓库元信息 | `/<owner>/<repo>` | ⚠️ 半壳。描述 / topics / star / fork 还在，语言是骨架屏 |
| 仓库元信息补充 | `/search?q=repo:owner/name&type=repositories` | ✅ SSR。语言、颜色、star、更新时间 |
| 通知 | `/notifications` | ❌ 纯客户端渲染；`?format=json` 406；`/_graphql` 需要 CSRF token |
| 关注（watch） | `/watching` | ❌ 空壳，只有自己的仓库侧栏 |

## 为什么 Issue / PR 走 `/search`

2026 版的 `/issues/assigned`、`/pulls`、`/pulls/review-requested` 已经变成纯 React 壳：服务端返回的 HTML 里**一个 `/owner/repo/pull/123` 链接都没有**，列表要等客户端用 GraphQL 拉，而那个请求需要 CSRF token。

只有 `/search?q=…&type=issues|pullrequests` 还是服务端渲染的。搜索结果的单行大致长这样：

```html
<div class="Result__Of4h7n">
  <a href="/owner/repo">owner/repo</a>
  <div class="search-title">
    <span class="issueIcon__…"><svg class="octicon-issue-opened"/></span>
    <a href="/owner/repo/issues/123">标题</a>
  </div>
  <div class="Content__agXLbn">正文摘要…</div>
  <ul class="footer__evnOBN">
    <li><img alt="">作者</li>
    <li><svg class="octicon-comment-discussion"/>12</li>
    <li>Opened 19 hours ago</li>
    <li>#46345</li>
  </ul>
</div>
```

几个容易踩的点：

- 类名是 CSS Modules 的 hash 后缀，只能按前缀匹配（`[class*="footer__"]`）；
- 头像 `alt` 是空的，作者名是 footer 里第一个「非数字、非 `#编号`」的 `li`；
- 评论数没有 "comments" 字样，是带 `comment-discussion` 图标的那个 `li` 里的数字；
- 时间是英文纯文本（`Opened 19 hours ago`），没有 `<relative-time>`，需要自己转中文。

## 仓库页只剩半壳

以前抓 `[itemprop="description"]`、`.repo-language-color`、`#repo-stars-counter-star` 就够了；现在这些都没了，SSR 里只剩：

```html
<p class="SidebarAbout-module_…_description">描述</p>
<a class="prc-TopicTag-TopicTag-…" href="/topics/github">github</a>
<script>var p = {stargazerCount:78033, forksCount:14998};</script>
```

- 描述：`[class*="SidebarAbout"][class*="description"]`
- topics：`a[href^="/topics/"]`（同一组会出现两遍，要去重）
- star / fork：脚本里的 `stargazerCount:` / `forksCount:`，DOM 兜底是 `a[href$="/stargazers"]` 的「0 stars」
- **语言是骨架屏**，必须去搜索结果页补

搜索结果里的颜色圆点有个坑：颜色挂在 `languageCircle` 上，但外层 `languageCircleWrapper` 的 class 也包含 `languageCircle` 且没有 style。`querySelector` 会取到外层，拿到 `null`，卡片就会回落成灰色。正确做法是遍历所有匹配项，取第一个带 `background` 的。

## 缓存

- 数据源缓存 key 前缀 `ghw:cache:v7:`，默认 10 分钟（弹窗里可调 2 分钟 ~ 1 小时）；
- 单个仓库的元信息单独缓存 1 小时（`repo:<owner>/<name>`）；
- **解析结构一变就升版本号**（`src/core/store.js` 的 `CACHE_PREFIX`），否则旧缓存会带着缺字段的数据渲染，看起来像「代码没生效」。

## 怎么验证某个入口还有没有 SSR

登录状态下打开对应页面，在控制台里：

```js
fetch('/search?q=is%3Aissue+assignee%3A%40me&type=issues')
  .then(r => r.text())
  .then(t => console.log(t.includes('/issues/'), t.length));
```

或者在地址栏用 `view-source:` 看原始 HTML（不是 Elements 面板——那里是客户端渲染后的结果）。关键是看**链接和数字是否直接出现在 HTML 里**：没有就说明这个入口已经变成壳，改解析器没用，得换页面。
