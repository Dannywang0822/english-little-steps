# 英语小步走 🚀

从 KET 起步、长期目标雅思 8 的轻量英语词块学习 H5（移动端优先）。数据只存在浏览器 `localStorage`，无账号。

## 在线打开

三个入口如下。GitHub Pages 用 Firebase。自建门户用门户自己的登录，不走 CloudBase。CloudBase 静态托管仍只在 `tcloudbaseapp.com` 这个主机名上。

| 入口 | 地址 | 说明 |
|---|---|---|
| GitHub Pages | https://dannywang0822.github.io/english-little-steps/ | Firebase 邮箱密码。不走 CloudBase，也不走门户 |
| 自建门户（国内） | http://43.142.236.188/apps/english-little-steps/ | 先在门户登录。进度走 `/api/els/progress`，可选练习走 `/api/els/chat` |
| CloudBase 静态托管 | https://english-little-steps-d0a2b84764b-1408940790.tcloudbaseapp.com/ | 只有这个主机名继续用 CloudBase 邮箱验证码 |

手机浏览器直接打开即可；电脑可用 Chrome 开发者工具切换手机模式（约 390×844）。

## 周六俱乐部（KET 季）

首页打卡卡片上方有入口 **「周六俱乐部」**，点进去会打开故事封面（也可从旧测试链接 `/saturday-club-test/` 跳转过来）。

- 这是同一世界观里的周末短篇系列，帮助孩子用已学词块读完整故事。
- **节奏**：每两天一篇，KET 季先排 **30 篇**（约两个月）。第 1 篇打开就能读。之后每一篇都要上一篇已经读完，并且完成日按 **Asia/Shanghai** 再过两个自然日（读完当天是 D，最早 D+2）才解锁；没有正文的篇目不解锁。读得慢也不会一次放出积压的好几篇。读过的可以随时再读。
- **第 1–30 篇故事已在 GitHub Pages 和 CloudBase 正式站发布。** 顺序解锁不变（D → D+2，Asia/Shanghai）。GitHub Pages 用 Firebase 邮箱密码。`43.142.236.188`、`*.dannywang.cloud`，以及路径 `/apps/english-little-steps/`，用自建门户，不用 CloudBase。`tcloudbaseapp.com` 仍是 CloudBase。公开网页配置已放进仓库供审阅；现有 Pages 流水线只在推送到 `main` 时上传 git 树，所以合并之前 Pages 仍不会连上 Firebase，也不会去连 CloudBase。Pages、CloudBase、门户不会自动互相同步，相同邮箱也不等于同一个账号。还没有部署。
- 30 篇有正文也不等于可以连着读完：下一篇仍然要等上一篇读完，并且按上海时区再过两个自然日才解锁。
- 第 6–30 篇每篇另有 6 句可选拼句，放在原来的造句里抽几句用，不要求 6 句全部做完，也不单独算一项打卡。理解题只给参考答案，不按逐字对错计分。
- 人物名用英文：**Leo / Mia / Jay**，第 2 篇起有同校学生 **Alex**，第 4 篇有配角 **Ben**（两个同名男孩不分开记）。中文里也用英文名，不另起中文名。
- 读故事算当天的「新学」：读完后，本篇里还没学过的新词进入原有复习间隔（1-3-7-14-30-60）；已经学过的词只按原来的间隔复习，不重置、不当成新学。当天和次日的新学记为完成，不用再滑这批新卡；第二天可做约 2 分钟的可选回顾（不算新学、不改间隔）。没有可读新篇时，仍走原来的主题新学（每主题 12 张）。
- 读后三问和复述可跳过，不影响打卡。造句仍用现有词库造句，并优先本篇目标词。
- 词表来源只链到官方 PDF，本仓库和页面都不提供完整封闭词表：[A2 Key vocabulary list (August 2025)](https://www.cambridgeenglish.org/images/506886-a2-key-2020-vocabulary-list.pdf)

## 本地打开

```bash
# 方式一：直接用浏览器打开 index.html
# 方式二：本地静态服务
python3 -m http.server 8765
# 访问 http://127.0.0.1:8765/
```

## 功能概要

- **路线图**：阶段0 基础启蒙 → 阶段1 KET → … → 目标雅思 8
- **主题**：学校生活 / 家庭与日常 / 食物与爱好；另有词义网主题，以及独立入口的 **周六俱乐部**（不是第五项打卡）
- **每日四步**（硬顶 40 分钟）：复习 12–16 分钟（左滑没记住 / 右滑记住了）→ 新学每主题 8–12 个词块（每主题日顶 12，进阶词全站每天最多 1 个；若当日有可读的俱乐部故事，新学改为读故事）→ 词库造句 8–10 句 → 收工
- **保护规则**：预计复习超过 24 分钟时暂停新学，并显示提示横幅
- **过关标准**不变
- **面板**：会用的句子数、主题点亮、连续天数
- **进阶词**：话题中自然出现的少量词汇，每天最多 1 个，只要求认得

## 首页：每日打卡

- 首页顺序：**周六俱乐部入口 → 今日打卡 → 主题点亮 → 路线图**（学习记录、退出登录在最下方）。俱乐部入口不是第五项打卡。
- 「今日打卡」顶部写「今天学：某主题」（可切换），新学和造句只用这个主题。
- 四行：复习到期卡 / 新学词块 / 词库造句 / 收工，各显示 未开始·进行中·✅已完成 和进度（如 新学 5/12、造句 3/8、复习 已做/到期）；没完成的行用醒目颜色。
- **每个主题各自新学 12 个**（`NEW_CAP_SHARED = false`，Danny 选定）：该主题前一天左滑过半则该主题次日降为 8；重学卡不占名额。第 2 行显示「新学 x/12」，主题按钮显示「新学 x/12 · 造句 y/8」。把常量改成 `true` 即变为三个主题共用 12 个。进阶词（AWL）仍全站每天最多 1 个。
- 造句（x/8）和收工按当前主题分别统计；复习（全部主题到期卡）是全局的，没有到期卡时显示「今日无到期」✅。
- 某一行只有真实进度达标才显示 ✅：新学 = 本主题名额已用完，或本主题词块已学完且今天在本主题学了 ≥1 个；造句 ≥8（或本主题句子已写完且至少写了 1 句），0/8 绝不显示 ✅；收工在前 3 项完成前显示「未开始·先完成前 3 项」。
- **任意一个主题 4 项全完成就算今天打卡**，显示「今日已打卡 ✅」并计入连续打卡；只做一部分不算。下方显示最近 7 天 ✅/❌。
- 旧数据迁移：今天已有的进度归到当时选中的主题。
- 「主题点亮」是长期进度：每个主题会用句子 x/5，完成每日造句后累计。

## 左滑回炉与记忆规则（专家参数）

常量都在 `index.html` 顶部（`REQUEUE_GAP` 等），可调整。

**复习（当天）**
- 左滑 → 立刻下一张；这张卡隔 **4 张**后再出现（剩余不足 4 张就放最后）。
- 同一张卡每天最多回炉 **3 次**；第 3 次回炉仍左滑 → 今天移出，标「明日优先」，明天复习排第一。
- 回炉时右滑只算「当天找回」，**不推进**跨天间隔。
- 接近 40 分钟上限时，未完成的回炉卡全部转为明日优先，不加时。

**跨天间隔**
- 左滑 → 重置为 1 天；右滑 → 1→3→7→14→30→60 天。
- 累计错 **3 次** → 「顽固词」，间隔 1→2→4→7→14 天，之后并回主序列；顽固词每天单独复习一次，计入复习时间。
- 「已掌握」= 连续 3 次跨天右滑 + 当前间隔 ≥14 天 + 至少 1 句正确造句；之后 30/60 天抽查，抽查左滑则取消掌握、重置为 1 天。

**新学**
- 左滑不算错，也不计入顽固词；同样隔 4 张再出现，每天最多 3 次。
- 当天任一次右滑 → 学会，明天首次复习。
- 3 次都左滑 → 明天作为新卡重学，**不占**新词名额。
- 当天新卡左滑比例 >50% → 第二天新学上限降为 **8**。

## 隐私

页面与仓库不含真实姓名等家庭隐私信息。学习进度仅保存在本机浏览器。

## 发音（浏览器自带 Web Speech API，免费）

- 只用 `speechSynthesis`，不接任何付费 TTS。优先 en-GB 语音，没有就用 en-US；会监听 `voiceschanged`，语音列表异步加载完再选。
- 🔊 按钮放在：单词、每个搭配、例句、句框旁边。造句页另有「🔊 读我写的句子」。
- 设置：🐢 慢速（rate 0.7）/ 正常（0.95）；新学卡默认自动读一遍，可以关掉。设置保存在 `localStorage`（`ket_tts_settings_v1`）。
- iOS Safari / 安卓微信：只在用户手势里发声。第一次点屏幕时解锁，解锁之后才会自动朗读。浏览器不支持时隐藏 🔊，并显示一行小提示。
- 点 🔊 不会触发左右滑卡（按下事件不再往卡片传，滑卡逻辑也会忽略从 🔊 上开始的拖动）。朗读不计入 40 分钟时长。


## 自建门户（国内，非 GitHub Pages）

页面在下面任一情况会走门户，不加载 CloudBase，也不出现验证码注册：

- 主机名是 `43.142.236.188`
- 主机名是 `dannywang.cloud` 或其子域
- 路径是 `/apps/english-little-steps/`（`github.io` 除外，Pages 始终是 Firebase）
- 本机调试：地址加上 `?portal=1`，或在脚本前设置 `window.__ELS_PORTAL__ = true`

登录用门户已有的邮箱密码和 cookie。应用不再做第二套登录。同一来源请求带上 cookie：

| 方法 | 路径 | 含义 |
|---|---|---|
| GET | `/api/els/progress` | 200：`{ state, logs, tts, updatedAt, updatedAtMs }`，形状与原来的 `user_bundles` 相同。401：未登录。404 且是 JSON：还没有进度。HTML 404 视为接口未开，进度留在本机 |
| PUT | `/api/els/progress` | 同一份 JSON。页面约 1.5 秒防抖后提交。身份和时间由服务端写入。服务端应创建或覆盖，不要把 PUT 的 404 当成空进度 |
| POST | `/api/els/chat` | `{ messages, practice }`。200：`{ reply }`。`messages` 里第一条是系统提示，后面只带最近几轮。`practice` 是给服务端校对范围用的，见下文 |

可选字段：GET 可以多给一个不含孩子姓名的 `uid`（字母、数字、`_`、`-`）。页面不发送密码、TokenHub 或 CloudBase 密钥。

门户登录页默认是同源 `/login`。如果实际路径不同，在页面脚本之前设置 `window.__ELS_PORTAL_LOGIN__ = "/你的登录路径"`（必须以 `/` 开头，不能是别的网站）。

第一次同步仍会问是否把本机进度导入或合并到这个门户账号。CloudBase 旧账号不会迁过来。选过「游客继续」的浏览器会一直只存本机，直到点「停止同步」再刷新。

### 可选练习

首页打卡下面有「可选英语练习」。它不是第五项打卡。一次大约 10 轮或 8 分钟。三种用法：改写贴上的一句、只用已经学过的词块、或只练已解锁的周六俱乐部故事。人物只用 Leo、Mia、Jay、Alex、Sam、Ms. Reed。

服务端应使用下面这段系统提示（页面也会放在 `messages[0]`）。如果服务端换成自己的副本，请保留 `Practice context` 里的模式、词块或故事标题：

```
You are a KET/A2 English practice partner for a child. Use American English. Keep each reply to 1–3 sentences. First recast the child's sentence more naturally. Point out only one key grammar or collocation issue per turn. Give one immediately imitable rewrite. A short Chinese explanation is allowed. In situational or role-play mode, recast with you, not I. In correction mode, you may recast in the first person. Use only these characters: Leo, Mia, Jay, Alex, Sam, Ms. Reed. Do not invent characters. Do not use the child's real name. If you are unsure of a usage, do not teach it. Stay inside the practice context: learned chunks, one unlocked Saturday Club scenario, or one pasted sentence. This is optional practice, not an open chatbot and not a daily check-in.
```

`practice.mode` 为 `rewrite`、`chunks` 或 `scenario`。情景模式用 you 改写；改写和词块模式可以用 I。

### 门户接口部署后怎么试

1. 用门户账号登录，打开 http://43.142.236.188/apps/english-little-steps/ 。
2. 登录页不应再出现「发送验证码」或 CloudBase。已登录时应直接进入，底部状态是「已登录 · 门户」。
3. 学一张卡，等约两秒。再看 `GET /api/els/progress` 是否带回刚才的进度。换一台已登录的浏览器，应能合并或拉下这份进度。
4. 未登录时打开接口应得到 401，页面给出门户登录链接，并仍可「游客继续」。
5. 打开「可选英语练习」，贴一句 `I get up at seven.`。回复应是一两句改写，不是开放聊天。连发到第 10 轮或满 8 分钟后，输入会被停住，打卡四行不变。
6. 打开 https://dannywang0822.github.io/english-little-steps/ ，确认仍是 Firebase 邮箱密码，没有门户练习块。

## 云端同步（腾讯云 CloudBase · 仅 tcloudbaseapp.com）

未配置时应用自动走 **纯 localStorage**。配置 `cloudbase-config.js` 后可用邮箱注册/登录，进度同步到 CloudBase 文档库。

> `tcloudbaseapp.com` 继续用 CloudBase。自建门户不使用下面这套验证码。GitHub Pages 用 Firebase 的准备在这条分支里。`firebase-config.js` 是 English Little Steps 那个 Web app 的公开配置，不是服务账号。`.github/workflows/pages.yml` 没有改：推送到 `main` 时 checkout 仓库并上传 `path: .`，没有构建步骤。文件进了 git 之后，下一次合并到 `main` 才会被现有流水线带上。这次不合并、不发布。不要把网页配置放进 Actions secrets。登录方式和授权域名这次没有读取。

### 一次性配置（Danny / HR）

1. 腾讯云 CloudBase 开通环境（本项目 envId：`english-little-steps-d0a2b84764b`，上海）。
2. 登录方式：开启 **用户名密码**（邮箱+密码登录）；应用内注册还需 **邮箱验证码（内置发信）** 或 SMTP。
3. 文档库创建集合 `user_bundles`，规则仅本人可读写（`_id == auth.uid`）。
4. 根目录已有 `cloudbase-config.js`（`envId` + `region`，可公开）。示例见 `cloudbase-config.example.js`。
5. **域名**：体验版不能加 GitHub Pages → MVP 请部署到 CloudBase 静态托管（`*.tcloudbaseapp.com`）。步骤见 `docs/cloudbase-domain.md`。
6. 密码只存在 CloudBase Auth，**不要**写进仓库。

### 登录页三种方式

| 方式 | 行为 |
|---|---|
| **游客继续** | 只用本机 localStorage，不连云端 |
| **邮箱登录** | CloudBase Auth；登录后拉取/合并云端进度 |
| **注册** | 创建邮箱账号后自动进入并同步（需控制台注册通道就绪） |
| 家长本地锁（折叠） | 旧的前端 PIN，**不是**云端安全；可选 |

同步策略摘要见 `docs/cloud-sync-proposal.md` / `docs/china-cloud-plan.md`（卡片保守合并；打卡并集；句子 max；TTS 取较新；写操作 debounce ~1.5s）。MVP 整包存在 `user_bundles/{uid}`。

### 隐私

- 云端 `displayName` 默认「小学员」，不要存孩子真名/学校/手机。
- 安全规则：仅登录用户可读写自己的 `user_bundles` 文档。
- 不要把 Admin / secret 密钥放进本仓库。

## 登录锁（轻量前端锁 · 可选）

- 打开页面先看到登录页。用户名区分大小写。账号由家长掌握，**README 和代码里都不写明文密码**。
- 页面只保存用户名和密码的 SHA-256 哈希，比对时用 `crypto.subtle`。在 http 等不支持 `crypto.subtle` 的环境下，改用页面内置的小型 JS SHA-256。
- 「记住我」默认勾选，写入 `localStorage`（`ket_auth_v1`，存的是哈希不是密码）。不勾选时只在当前标签页内有效。首页底部有「退出登录」。
- ⚠️ **这只是防小手误点的前端锁，不是真正的安全措施。** 源码公开，简单密码的哈希很容易被反查，懂一点技术的人可以直接绕过。学习数据也只保存在本机浏览器里。
