# GitHub Workbench

把 `github.com` 首页换成一块真正能干活的个人工作台：贡献日历、指派给我 / 我创建的 issue、等你评审的 PR、关注的项目、最近更新的仓库。

> 现状是首页越来越像内容流（For you / 推荐 / AI 摘要），想看的东西永远要点三层。
> 社区的旧方案（`old-github-feed`、`bring-github-old-feed-back` 之类）都是给原生 feed 打补丁，
> GitHub 2025-09 那次改版基本把它们全废了。
>
> 这个扩展换了个思路：**不修补原页面，直接接管首页**。数据自己抓、界面自己画。

![效果预览](docs/preview.png)

## 特点

- **零配置**。不需要 Personal Access Token，直接用你浏览器里已有的 GitHub 登录态发同源请求。
- **不依赖 class 名**。解析靠「链接形状 + 相对时间」这类结构性特征，GitHub 换 React 组件也大概率还能跑。
- **不联网到第三方**。所有请求都发往 `github.com`，数据只存在本地 `chrome.storage`。
- **跟着主题走**。所有颜色都用 GitHub 自己的 CSS 变量，浅色 / 暗色 / 第三方主题自动适配。
- **可逆**。弹窗里关掉总开关就完全恢复原生首页，不用卸载扩展；不会出现「工作台和原生流叠在一起」的畸形状态。

## 接管方式

现在的首页结构是：

```
.application-main > .color-bg-default > .feed-background（flex 行）
   ├ aside.feed-left-sidebar        左侧导航
   └ div.flex-auto.col-md-8         ← main 埋在这层里面
```

扩展会一路往上找到 `.feed-background` 的直接子节点，把那一整块（也就是原生 dashboard 内容）藏掉，工作台插在同级位置占满整行。全局导航、搜索框、头像菜单这些都在 `main` 外面，完全不动。

默认连左侧原生导航一起收起，版面更宽；弹窗里打开「保留左侧原生导航栏」就留着它。

`insertBefore` 的参照节点做了容错——GitHub 的 DOM 层级改了也不会让脚本在挂载那一步抛 `NotFoundError`（这个坑踩过一次：表现是页面「看起来完全没变化」）。

## 面板

| 面板 | 数据来源 |
| --- | --- |
| 贡献日历 + 统计 | `/users/<you>/contributions` |
| Issues（指派给我 / 我创建的） | `/search?q=is:issue+…+assignee/@author:@me&type=issues` |
| 等我评审 | `/search?q=is:pr+is:open+review-requested:@me&type=pullrequests` |
| 我开的 PR | `/search?q=is:pr+is:open+author:@me&type=pullrequests` |
| 关注的项目 | `/stars`（面板里点「编辑」可勾选，也能手动填 `owner/repo` 加任意仓库） |
| 最近更新 | `/<you>?tab=repositories&sort=updated` |
| 置顶 / 个人信息 | `/<you>` |

贡献日历不是截图式的装饰：它从页面的 `<tool-tip>` 里读回每天的精确次数，所以「今日 / 本周 / 连续 / 最长」都是算出来的，不是猜的。

issue / PR 的每一行都会带上：仓库 `#编号`、作者、评论数、更新时间（或 opened 时间），以及正文摘要（两行截断）——这些都从搜索结果的 footer / Content 区块里抠出来。

### 布局

面板可以拖动排序：按住卡片标题栏拖到任意位置（跨左右两列也行），顺序会存进 `chrome.storage`，下次打开还是你排的样子。「关注的项目」里的仓库卡片也能直接拖动调整顺序（顺序存进 `starredPicks`）。

拖乱了就去弹窗点「重置面板布局」。

顶部身份区跟着原生个人主页对齐：头像和昵称都能点回主页，关注者 / 正在关注 / 成就都是可点的链接，右边有「编辑资料」「新仓库」「复制链接」「刷新」。

「关注的项目」点「编辑」可以勾选要显示哪几个；GitHub 的 `/stars` 只服务端渲染最近 10 个，所以还提供了一个输入框，直接填 `owner/repo` 就能加任意仓库。卡片上的 description / topics / 语言 / star / fork / 收藏时间会从 `/stars` 行和仓库页拼起来（仓库页只剩 About 侧栏和计数是服务端渲染的，语言得再从搜索结果页补一次）。

### 为什么 issue 列表走 `/search`

2026 版的 `/issues/assigned`、`/pulls`、`/pulls/review-requested` 已经变成纯 React 壳：服务端返回的 HTML 里**一个 `/owner/repo/pull/123` 链接都没有**，列表要等客户端用 GraphQL 拉回来，而那个请求需要 CSRF token，网页里拿不到。

只有 `/search?q=…&type=issues|pullrequests` 还是服务端渲染的，链接和标题都在 HTML 里。所以 issue / PR 三个面板都走搜索路由。

同理，通知中心（`/notifications`）也是纯壳、`/watching` 也是空的，所以没有通知面板——这个暂时无解，除非你愿意配一个 PAT。

## 安装

Chrome / Edge：

1. 打开 `chrome://extensions`（Edge 是 `edge://extensions`）
2. 打开右上角「开发者模式」
3. 「加载已解压的扩展程序」→ 选这个仓库的根目录
4. 打开 https://github.com/ ，已经登录的话会直接看到工作台

改完代码后回到扩展页点一下刷新图标即可，不需要构建，没有打包步骤。

## 设置

点扩展图标：

- 总开关（关掉就完全恢复原生首页）
- 是否保留左侧原生导航栏
- 每个面板单独开关
- 「关注的项目」在面板里点「编辑」就能挑，选择存在本地
- 缓存有效期（2 分钟 ~ 1 小时）、列表条数
- 清缓存

## 工作原理

```
github.com 首页加载
   │
   ├─ index.js   判断路由（只接管 / 和 /dashboard），定位挂载点：
   │             往上找到 .feed-background 的直接子节点（装着 main 的那层），
   │             工作台插在它同级，给它打上 .ghw-native-pane 让 CSS 藏掉
   │
   ├─ api.js     同源 fetch 上面那几个页面（带 cookie），带 TTL 缓存
   │             某个源失败不影响其它面板，失败时优先用旧缓存
   │
   ├─ parse.js   DOMParser 解析 HTML：
   │             贡献日历 → td[data-date] + tool-tip
   │             issue 列表 → 反查 /owner/repo/(issues|pull)/123 形式的链接
   │             仓库列表 → li[itemprop="owns"] / ul.repo-list
   │
   └─ ui.js      纯 DOM 构造渲染（一律 textContent，不拼 innerHTML）
```

为什么不用 `api.github.com`：浏览器里没有 token 时只有 60 次/小时，而且它是跨域，拿不到 cookie 登录态。同源抓页面反而是零配置下最稳的路子。

## 目录

```
manifest.json            MV3 清单
src/core/util.js         DOM helper、数字/时间格式化
src/core/store.js        设置 + 缓存（chrome.storage.local）
src/core/parse.js        HTML → 结构化数据（所有兜底逻辑都在这）
src/core/api.js          同源抓取 + 缓存策略
src/content/icons.js     octicon 数据（issue / PR / 评论图标）
src/content/ui.js        工作台渲染
src/content/index.js     路由监听、挂载/卸载、生命周期
src/content/styles.css   样式（走 GitHub 的 CSS 变量）
src/popup/*              设置弹窗
preview/demo.html        纯前端预览，假数据，不装扩展也能看效果
tests/                   jsdom 回归测试
```

看效果不用装扩展：

```powershell
start preview\demo.html          # 浅色
start "preview\demo.html?dark"   # 暗色
```

## 测试

```powershell
cd tests
npm install
npm test
```

跑的是两件事：

- `parse.test.mjs`：拿真实抓下来的 contributions / repositories 页面 + 手写的 issue、通知 fixture，验证解析和统计。
- `ui.test.mjs`：在 jsdom 里把所有面板渲染一遍，确认不炸、条目数对、Issues 两个 tab 能切、用户可控文本不会被当 HTML 执行。

## 当 GitHub 又改版了

解析层刻意写成「主选择器 + 启发式兜底」，所以大部分改版不会直接挂。如果某个面板空了：

1. 打开对应页面（比如 `/search?q=is:issue+assignee:@me&type=issues`），看 DOM 结构变了多少；
2. 改 `src/core/parse.js` 里对应的一个函数；
3. 往 `tests/fixtures/` 丢一份新页面，加几条断言，跑 `npm test`。

改之前先确认「这个页面还有没有服务端渲染」——2026 年这波改版把一批页面变成了纯 React 壳（见上文 `/search` 那段），那种页面上链接根本就不存在，改解析器也没用，得换入口。

数据源全在 `src/core/api.js` 的 `SOURCES` 表里，加一个源 = 加一个函数 + 一个面板。

## 已知限制

- 只用 GitHub 的**网页结构**，不是官方 API，所以有改版风险（上面写了怎么修）。
- 没有通知面板：`/notifications` 是纯客户端渲染，拿不到数据。
- 「关注的项目」的候选池只有 `/stars` 首屏那 10 个（分页已改成客户端），更多的用输入框手动加。
- 面板拖动依赖 HTML5 拖放，只支持鼠标，没有做键盘排序。
- 首页之外的页面什么都不做，不会注入任何 UI。
- 每次刷新最多发 6 个同源请求（都有缓存，默认 10 分钟）。嫌多可以把面板关掉，关掉的面板不会发请求。
- 企业版 / GitHub Enterprise 的自托管域名没有适配（改 `manifest.json` 的 `matches` 即可）。

## Roadmap

- [ ] 命令面板：`Ctrl/Cmd + K` 搜仓库、issue、PR
- [ ] 可选 PAT 模式：用 `api.github.com` 拿到更精确的数据（评审状态、CI 结论）
- [ ] 列表项显示的字段可配置（标签 / 时间 / 状态）
- [ ] 快捷键在原生页面和工作台之间来回切

## License

MIT
