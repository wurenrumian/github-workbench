# GitHub Workbench

把 `github.com` 首页换成一块真正能干活的个人工作台：贡献日历、收件箱通知、指派给我 / 我创建的 issue、等我评审的 PR、关注的项目、最近更新的仓库。

[安装](#安装) · [功能](#面板) · [交互](#交互) · [数据从哪来](#数据从哪来) · [工作原理](#工作原理) · [已知限制](#已知限制) · [排查手册](docs/troubleshooting.md)

![效果预览](docs/preview.png)

> 首页越来越像内容流（For you / 推荐 / AI 摘要），想看的东西永远要点三层。
> 社区的旧方案（`old-github-feed`、`bring-github-old-feed-back` 之类）都是给原生 feed 打补丁，
> GitHub 2025-09 那次改版基本把它们全废了。
>
> 这个扩展换了个思路：**不修补原页面，直接接管首页**。数据自己抓、界面自己画。

## 特点

- **零配置**：不需要 Personal Access Token，直接用浏览器里已有的 GitHub 登录态发同源请求。
- **可逆**：弹窗里关掉总开关就完全恢复原生首页，不用卸载扩展；不会出现「工作台和原生流叠在一起」的畸形状态。
- **不闪原生首页**：`document_start` 就先盖住页面，挂载完成后才露出工作台，中间不会闪一下 GitHub 原生 feed。
- **跟着主题走**：颜色全部用 GitHub 自己的 CSS 变量，浅色 / 暗色 / 第三方主题自动适配。
- **数据不出浏览器**：所有请求只发往 `github.com`，结果存在本地 `chrome.storage`。
- **为改版留后手**：解析靠「链接形状 + 相对时间 + class 前缀」这类结构性特征，配了 jsdom 回归测试；哪个入口没了 SSR，见 [docs/data-sources.md](docs/data-sources.md)。

## 面板

| 面板 | 数据来源 |
| --- | --- |
| 左侧身份区 | `/<you>`：头像、bio、关注者 / 正在关注 / 成就 |
| 贡献日历 + 统计 | `/users/<you>/contributions` |
| 通知（收件箱 / 已保存 / 已完成） | `/notifications`、`/notifications?query=is:saved`、`?query=is:done` |
| Issues（指派给我 / 我创建的） | `/search?q=is:issue+…+assignee/@author:@me&type=issues` |
| 等我评审 | `/search?q=is:pr+is:open+review-requested:@me&type=pullrequests` |
| 我开的 PR | `/search?q=is:pr+is:open+author:@me&type=pullrequests` |
| 关注的项目 | `/stars`（可编辑挑选，也能手动填 `owner/repo`） |
| 最近更新 | `/<you>?tab=repositories&sort=updated` |
| 置顶 / 个人信息 | `/<you>` |

贡献日历不是装饰图：它从页面的 `<tool-tip>` 里读每天精确的次数，所以「今日 / 本周 / 连续 / 最长」都是算出来的。宽屏下横向热力图横跨中间两列，保留每天的贡献等级和日期提示；窄屏仍有溢出时默认定位到最新一端。

通知面板按 GitHub 的文件夹分成「收件箱 / 已保存 / 已完成」三个 tab：收件箱随首页一起加载，另外两个点开时才抓。每行带仓库 `#编号`、标题、通知原因（等你评审 / 提到了你 / 你创建的…）和时间，未读的有蓝点和加粗标题。面板头的数字是收件箱未读数。

收件箱右上角的「清空」会先变成「确认清空 N 条？」，再点一次才执行：把这些通知移到 GitHub 的「已完成」（不是删除，可以在已完成里找回）。

issue / PR 每行会带上仓库 `#编号`、作者、评论数、时间（或 opened 时间）、正文摘要，以及状态图标（issue / PR / 已合并 / 已关闭 / 草稿）。

关注的项目卡片会显示 description、topics、语言色、star、fork 和收藏时间；手动添加的仓库会异步补齐这些信息。

## 交互

**拖动排序**：面板按住标题栏拖到任意位置（三列与跨两列区之间也能拖）；「关注的项目」里的仓库卡片也能直接拖动。「关注的项目」的顺序会存进 `starredPicks`，面板布局存进 `layout`，都在 `chrome.storage` 里。拖乱了就去弹窗点「重置面板布局」。

**版面**：宽屏时是「左侧身份区 + 三列面板」，贡献日历横跨中间两列，「最近更新 / 置顶」独立占右侧，通知和 Issues 等放在下方两列。左侧资料、操作按钮和快捷入口合并成一张大卡，浅色主题使用浅中性灰，暗色主题跟随 GitHub 自己的深色表面。窗口不够宽会自动退成两列（贡献日历横跨顶部），再窄就全部堆成一列。只有列表内容真的超过上限时才启用卡片内滚动；短卡片不创建内部滚动容器，滚轮直接滚动整页。

**身份区**：头像和昵称点回个人主页，关注者 / 正在关注 / 成就是可点链接，卡片里还有「编辑资料」「新仓库」「复制链接」「刷新」。

**关注的项目**：点面板右上角「编辑」勾选要显示哪几个；GitHub 的 `/stars` 只服务端渲染最近 10 个，所以还提供了一个输入框，直接填 `owner/repo` 就能加任意仓库。

## 安装

Chrome / Edge：

1. 打开 `chrome://extensions`（Edge 是 `edge://extensions`）
2. 打开右上角「开发者模式」
3. 「加载已解压的扩展程序」→ 选这个仓库的根目录
4. 打开 <https://github.com/>，已经登录的话会直接看到工作台

没有构建步骤。改完代码回扩展页点一下刷新图标，再刷新 GitHub 页面即可。

## 设置

点扩展图标：

- 总开关（关掉就完全恢复原生首页）
- 是否保留左侧原生导航栏
- 每个面板单独开关
- 缓存有效期（2 分钟 ~ 1 小时）、列表条数、仓库卡片数
- 清缓存、重置面板布局

「关注的项目」的挑选在面板里点「编辑」，不在弹窗里。

## 数据从哪来

全部是同源 `fetch` + `DOMParser`，不碰 `api.github.com`：没有 token 时官方 API 只有 60 次/小时，而且跨域拿不到 cookie 登录态。

关键约束是**只认服务端渲染的页面**：

- 2026 版的 `/issues/assigned`、`/pulls`、`/pulls/review-requested` 已经成了纯 React 壳，HTML 里一个 `/pull/123` 链接都没有，所以 issue / PR 统一走 `/search?type=issues|pullrequests`。
- `/notifications` 本身还是服务端渲染的老式列表（`li.notifications-list-item`），收件箱、已保存、已完成都能解析；之前误判成纯壳，是因为当时收件箱刚好为空。
- 仓库主页 2026-11 起也只剩半壳：描述 / topics / star / fork 还在，语言得从 `/search?q=repo:owner/name&type=repositories` 补。

每个入口现在能拿到什么、结构长什么样、怎么验证，单独写在 [docs/data-sources.md](docs/data-sources.md)。

## 工作原理

```
github.com 首页加载
   │
   ├─ boot.js   document_start：只要是首页就先把 .ghw-booting 盖上，
   │             用 boot.css 整屏盖住（背景 + spinner）；DOMContentLoaded 时
   │             看 <meta name="user-login">，没登录就立刻撤。另外任何一个
   │             「不接管」的出口都会撤掉它，还有 4 秒超时兜底
   │
   ├─ index.js   只接管 / 和 /dashboard；从 main 往上找到 .feed-background
   │             的直接子节点，工作台插在同级，给原内容打 .ghw-native-pane 藏掉，
   │             然后撤掉遮罩 —— 用户看到的是「spinner → 工作台」，中间不露原生首页
   │
   ├─ api.js     同源 fetch（带 cookie），按数据源分开发请求、带 TTL 缓存；
   │             某个源失败不影响其它面板，失败时优先用旧缓存
   │
   ├─ parse.js   DOMParser 解析：
   │             贡献日历 → td[data-date] + tool-tip
   │             issue 列表 → /owner/repo/(issues|pull)/123 形式的链接
   │             通知列表 → li.notifications-list-item（未读 class + octicon + reason）
   │             仓库列表 → li[itemprop="owns"] / ul.repo-list
   │             仓库元信息 → 仓库页（描述/topics/计数）+ 搜索结果（语言/时间）
   │
   ├─ store.js   设置 + 缓存（chrome.storage.local），解析结构变了就升 CACHE_PREFIX
   │
   └─ ui.js      纯 DOM 构造（一律 textContent，不拼 innerHTML），icons.js 提供 octicon
```

**为什么不会先闪原生页面**：DOM 内容要等解析完才能替换，所以「替换」这个动作本身注定晚于首帧；能控制的是**让原生内容在首帧就不可见**。遮罩由 `document_start` 的独立入口注入，赶在 GitHub 画出第一帧之前生效；工作台渲染的是骨架屏，数据异步填。遮罩只在「首页 + 已登录 + 总开关打开」时出现，并且 4 秒后无论挂载成功与否都会自动撤掉——宁可闪一下，不能白屏。

挂载点做了容错：`insertBefore` 前先校验父子关系，否则退回 `appendChild`。这个坑踩过一次——`main` 埋在四层里，直接 `insertBefore` 会抛 `NotFoundError`，表现是「页面看起来完全没变化」。

## 目录

```
manifest.json            MV3 清单
src/core/util.js         DOM helper、数字 / 时间格式化
src/core/store.js        设置 + 缓存（chrome.storage.local）
src/core/parse.js        HTML → 结构化数据（所有兜底逻辑都在这）
src/core/api.js          同源抓取、数据源表、缓存策略
src/content/icons.js     octicon 路径
src/content/boot.js      document_start 的首帧遮罩（不闪原生首页）
src/content/boot.css     遮罩样式，和 boot.js 一起在 document_start 注入
src/content/ui.js        工作台渲染、面板 / 卡片拖拽
src/content/index.js     路由监听、挂载 / 卸载、生命周期
src/content/styles.css   样式（走 GitHub 的 CSS 变量）
src/popup/*              设置弹窗
docs/data-sources.md     各数据源的 SSR 现状与结构
docs/troubleshooting.md  常见问题排查
preview/demo.html        纯前端预览，假数据，不装扩展也能看
tests/                   jsdom 回归测试
```

## 本地预览

不用装扩展就能看效果：

```powershell
start preview\demo.html          # 浅色
start "preview\demo.html?dark"   # 暗色
```

预览页加载的是真实的 `ui.js` 和 `styles.css`，数据是 `preview/demo.html` 里的假数据。

## 测试

```powershell
cd tests
npm install
npm test
```

- `parse.test.mjs`：拿真实抓下来的 contributions / repositories 页面 + 手写的 issue、通知、仓库页、仓库搜索 fixture，验证解析和统计。
- `ui.test.mjs`：在 jsdom 里把面板渲染一遍，确认不炸、条目数对、Issues 两个 tab 能切、通知三个 tab 按需加载、拖动排序能落盘、用户可控文本不会被当 HTML 执行。
- `boot.test.mjs`：验证首帧遮罩只在「首页 + 已登录」时出现，Turbo 站内跳转按目标地址盖 / 撤，未登录不遮营销首页。

## 当 GitHub 又改版了

解析层是「主选择器 + 启发式兜底」，大部分改版不会直接挂。如果某个面板空了：

1. 先确认这个页面**还有没有服务端渲染**（`view-source:` 或 `fetch().then(r => r.text())` 看链接在不在）；
2. 没有 SSR 就换入口，参考 [docs/data-sources.md](docs/data-sources.md) 里还能用的页面；
3. 有 SSR 就改 `src/core/parse.js` 对应的一个函数；
4. 往 `tests/fixtures/` 丢一份新页面，加几条断言，跑 `npm test`。

数据源全在 `src/core/api.js` 的 `SOURCES` 表里，加一个源 = 加一个函数 + 一个面板。

## 已知限制

- 依赖 GitHub 网页结构而不是官方 API，有改版风险（上面写了怎么修）。
- 通知只提供「清空收件箱」一个写操作（移到「已完成」，可恢复）；标记已读 / 保存 / 取消订阅仍然交给原生页面。
- 「关注的项目」的候选池只有 `/stars` 首屏 10 个（分页已改成客户端），更多用输入框手动加。
- 拖动依赖 HTML5 拖放，只支持鼠标，没有键盘排序。
- 首屏大约 9 个同源请求；「已保存 / 已完成」通知点开时才抓，关注的项目每个卡片额外 1~2 个（补 topics / 语言），这些额外请求缓存 1 小时，且串行执行。关掉的面板不会发请求。
- 首页之外的页面不注入任何 UI。
- 企业版 / 自托管域名未适配（改 `manifest.json` 的 `matches` 即可）。

## Roadmap

- [ ] 命令面板：`Ctrl/Cmd + K` 搜仓库、issue、PR
- [ ] 键盘拖拽 / 排序
- [ ] 「最近更新」也补 topics
- [ ] 可选 PAT 模式：用 `api.github.com` 拿评审状态、CI 结论
- [ ] 列表字段可配置（标签 / 时间 / 状态）
- [ ] 快捷键在原生首页和工作台之间切换

## License

MIT
