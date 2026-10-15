# 英语小步走 · 注册 + 云端同步方案（MVP）

> 状态：Phase1+2 脚手架已落地（待配置 Firebase）· 未推远程 · 2026-10-15

## 1. 推荐技术栈

| 层 | 选型 | 理由 |
|---|---|---|
| 前端托管 | 继续 GitHub Pages | 零成本，现有仓库不动 |
| 后端 BaaS | **Firebase（推荐）**：Auth + Firestore +（可选）Offline Persistence | 邮箱注册开箱即用；Firestore 有离线缓存与同步；免费额度对个人孩子项目足够；浏览器 SDK 直接接静态站 |
| 备选 | Supabase（Auth + Postgres） | SQL 更清晰，但离线合并要自己写，略重 |

**不做：** 自建 Node/服务器、手机号验证码（MVP 先邮箱）、付费 TTS/短信。

**密钥：** Firebase Web 配置（apiKey 等）可放前端公开配置；真正敏感的是 **Firestore Security Rules** 与（若用 Admin）服务账号。公开仓用 `.env` / GitHub Actions secrets 生成 `config.js`，或把 config 放在未入库文件；仓库 README 写清勿提交密钥文件。Firebase Web apiKey 本身不是私钥，但仍用规则锁数据。

## 2. 认证与模式

1. **游客模式（保留）**：现有 `localStorage` 照旧，可无账号使用。
2. **邮箱注册 / 登录**：Firebase Auth Email+Password；邮件验证可选（MVP 可先关闭，上线后开）。
3. **导入**：登录后弹窗「发现本机进度，是否导入到账号？」→ 合并进云端 → 可选清本地游客数据。
4. **现有 Danny/123 前端锁**：云端上线后改为「家长设置本地 PIN（可选）」或去掉；云端账号才是真身份。**不把 123 迁到云端。**

## 3. 数据结构（Firestore）

```
users/{uid}
  email, createdAt, updatedAt
  profile: { displayName: "小学员" }   // 禁止真名字段

users/{uid}/meta/settings
  tts: { slow, autoRead }
  activeTopicId
  newCapShared: false

users/{uid}/meta/progress
  streak, checkinDays: { "2026-10-15": true, ... }
  litCelebrated: { school: true, ... }
  allLitCelebrated
  sentencesUsedByTopic: { school: 5, ... }
  dailyByTopic: { "2026-10-15": { school: { learned:12, sentences:8, wrap:true }, ... } }
  newLearnStats: { ... }  // 含次日降到 8 等

users/{uid}/cards/{chunkId}
  topicId, intervalIdx, dueAt, errors, stubborn, mastered,
  consecutiveRight, relearnFlags, tomorrowPriority, ...
  updatedAt

users/{uid}/logs/{autoId}   // 可选，最多保留 N 条
  type, itemCount, duration, timestamp, topicId
```

词块内容仍放前端 `topics.json`（公开只读）；云端只存进度与 SRS 状态。

## 4. 同步与冲突策略

| 场景 | 策略 |
|---|---|
| 登录后首次 | 拉云端；若本地有游客数据且云端空 → 导入；若两边都有 → 按字段合并 |
| 卡片 SRS | **按 `updatedAt` 取较新**；若同秒则取更「保守」间隔（更短 due / 更高 errors），避免虚高掌握 |
| 打卡 / 连续天数 | 按日期并集：任一日任一侧完成 → 当天算打卡；streak 按合并后日历重算 |
| 会用句子数 / 点亮 | 取 **max(本地, 云端)** |
| TTS 设置 | 取较新 `updatedAt` |
| 离线 | Firestore 持久化启用；离线写入进队列，联网自动推；冲突仍按上表 |
| 写频率 | 关键动作 debounce 1–2s；打卡完成 / 登出时强制 flush |

## 5. 迁移路径

1. **Phase 0（现有）**：纯 localStorage。
2. **Phase 1**：接入 Firebase，加注册/登录 UI；游客仍可用。
3. **Phase 2**：登录后双向同步 + 导入向导。
4. **Phase 3**：邮件验证、家长重置密码、可选导出 JSON 备份。

线上 Pages 一次发布；未配置 `firebaseConfig` 时自动降级为纯本地（feature flag）。

## 6. 费用与配额（Firebase Spark 免费档，量级）

- Auth：足够个人家庭。
- Firestore：约 5 万读 / 2 万写 / 天免费；一个孩子每天打卡约几十～几百次读写，远低于限额。
- 超限风险低；若以后多孩子再评估 Blaze（按量，仍通常每月几元级）。

**无服务器账单、无短信费。**

## 7. 隐私与安全

- 禁止存孩子真名、学校、手机、照片；`displayName` 默认「小学员」。
- Security Rules：`request.auth.uid == userId` 才能读写自己的文档。
- 公开仓：不提交服务账号 JSON；Web config 可公开但配严规则。
- 现有弱本地锁仅作过渡，文档标明非安全方案。

## 8. 工期（MVP）

| 天 | 内容 |
|---|---|
| D1 | Firebase 项目、规则、前端 Auth UI（注册/登录/退出） |
| D2 | 状态映射 + 首次同步/导入游客数据 |
| D3 | 离线持久化、冲突合并、打卡/点亮/TTS 同步 |
| D0.5 | 自测（双浏览器模拟双设备）+ README + 审包 |

**合计约 3.5 天** 可交可审 MVP。不含：手机号登录、家长后台、多孩账号。

## 9. 风险

1. **中国大陆访问 Firebase**：部分网络不稳定 → 缓解：保留完整游客离线；后续可迁国内兼容 BaaS（需另评估）。
2. **冲突误合并**：用保守 SRS + max 计数；提供「恢复本机备份」入口（导出 JSON）。
3. **apiKey 暴露**：靠 Security Rules，不靠藏 key。
4. **GitHub Pages + 第三方脚本**：需允许 Firebase CDN；CSP 若以后加需放行。
5. **儿童数据**：不做画像广告；仅学习进度。

## 10. 请审事项

请确认：
1. 是否采用 **Firebase Auth + Firestore**（vs Supabase）？
2. MVP 是否 **仅邮箱**、暂不做手机号？
3. 冲突策略（卡片按 updatedAt + 保守间隔；打卡并集；句子数 max）是否同意？
4. 同意后开始实现；**实现完成仍先交审再推 Pages。**
