# 英语小步走 · 大陆可达云端迁移方案

> 状态：**已拍板 CloudBase；驱动已本地实现（待 HR 审后推送/托管）** · 2026-10-15  
> 背景：Firebase Auth/Firestore 在中国大陆常不可达；注册/登录报网络错误。HR 已拍板腾讯云 CloudBase；止血文案已上线；本轮切驱动、不双写 Firebase。
>
> **域名：** 体验版不能加 GitHub Pages → MVP 用 CloudBase 静态托管（见 `docs/cloudbase-domain.md`）。
>
> **MVP 存储：** 集合 `user_bundles`，文档 `_id = uid`，整包 `{ state, logs, tts, updatedAt, updatedAtMs, email }`（单文档加速上线；日后可再拆 cards/logs）。

---

## 1. 问题简述

- 线上站：静态 GitHub Pages [`dannywang0822.github.io/english-little-steps`](https://dannywang0822.github.io/english-little-steps/)
- 云端：Firebase 项目 `english-subject-ket`（Auth 邮箱密码 + Firestore，按 `uid` 隔离）
- 现象：大陆网络下 SDK/CDN（`gstatic.com` / Firebase 后端）不稳定 → 注册失败，`cloudMsg` 现文案含「大陆可能需代理」
- 约束：保留游客本地进度；长期必须**国内直连可注册可同步**；不自建重后端（优先 BaaS）

---

## 2. 现状与可复用部分

### 2.1 KetCloud API 面（`js/cloud-sync.js`）

对外稳定接口，迁移时应**尽量原样保留**，只换底层驱动：

| 方法 / 字段 | 作用 |
|---|---|
| `bootstrap()` | 读配置 → 初始化 SDK → `enabled` |
| `register` / `login` / `logout` / `currentUser` | 邮箱账号 |
| `syncAfterLogin` | 拉云端 → 导入/合并向导 → `applyMerged` |
| `schedulePush` / `flush` | debounce 1.5s 推本地 bundle |
| `_mergeBundles` 及 merge 助手 | 卡片保守合并、打卡并集、句子 max、TTS 取新 |
| `mode`: `local` \| `guest` \| `cloud` | 与 UI 一致 |
| hooks: `getLocalBundle` / `applyMerged` / `onAuth` / `confirmImport` | `index.html` 已接好 |

### 2.2 本地进度结构（不变）

| Key | 内容 |
|---|---|
| `ket_mvp_state_v4` | `state`：cards / daily / streak / checkins / sentences / lit… |
| `ket_mvp_log_v4` | 学习日志，最多约 120 条 |
| `ket_tts_settings_v1` | TTS 设置 |
| `ket_auth_mode_v1` | `guest` \| `pin` \| `cloud`（session + local） |
| `ket_auth_v1` | 旧本地 PIN / 游客标记 |

Bundle 形态：`{ state, logs, tts, updatedAt }` — **迁移后仍用同一 bundle**，合并逻辑零改。

### 2.3 云端路径（Firebase 现状 → 映射目标）

```
users/{uid}                         → 用户根（email, profile）
users/{uid}/meta/settings           → tts, activeTopicId, newCapShared
users/{uid}/meta/progress           → streak, checkinDays, lit…, daily, updatedAtMs
users/{uid}/cards/{chunkId}         → SRS 卡片
users/{uid}/logs/{id}               → 日志（限条）
users/{uid}/sentences/{id}          → 会用句子
```

Rules：`request.auth.uid == userId` 才能读写自己的树（`firestore.rules`）。新 BaaS 需等价安全规则 / ACL。

### 2.4 已有提案

`docs/cloud-sync-proposal.md` 已落地 Phase1+2；其中「大陆访问 Firebase」列为已知风险，本文件即该风险的落地方案。

---

## 3. 方案对比表

| 方案 | 大陆可达性 | 邮箱注册 | 静态 H5 友好 | 费用（个人量级） | 迁移量 | 主要风险 |
|---|---|---|---|---|---|---|
| **A. 腾讯云 CloudBase**（独立环境，非微信小程序云） | **高**（国内节点） | **有**（邮箱+密码 / 验证码；需配 SMTP 或邮件代发） | **高**（`@cloudbase/js-sdk`，域名白名单即可） | 免费体验环境有额度；个人版约几十元/月级可撑家庭用量 | **中**（换 Auth + 文档库读写，KetCloud 外壳保留） | 控制台/实名；邮箱链路需 SMTP；GitHub Pages 域名要加安全来源 |
| **B. 阿里云 RDS Supabase / PolarDB-X BaaS** | **高** | **有**（supabase-js 邮箱密码，需 SMTP） | **中高**（前端 SDK 直连；实例 IP 白名单需处理） | RDS/包年，明显高于纯 BaaS 免费档 | **中高**（表结构 + RLS；运维更重） | 成本与运维；白名单对静态站出口 IP 不友好（宜开公网+鉴权） |
| **C. 国内 VPS 自建 Supabase** | **高**（机房在国内） | **有** | **中**（需域名 HTTPS、SMTP、备份） | VPS 约几十～百元/月 + 运维时间 | **高** | Danny 运维负担；备案/合规若用国内域名 |
| **D. LeanCloud 国内版** | 高（历史最优之一） | 有 | 高 | 开发版免费档曾够用 | 中 | **不可选为新建**：2026-01-12 起停新用户/新应用；**2027-01-12 全面停服** |
| **E. Cloudflare Workers + D1** | **低～不稳定**（`workers.dev` 常受干扰；中国网络需 Enterprise+ICP） | 需自写 Auth | 中（自写 REST） | 免费档有，但达不到「大陆直连」目标 | 中高 | **HR 已提示不稳则放弃**；不作主路径 |
| **F. 继续 Firebase** | **低**（现状） | 有 | 高 | 免费 | 0 | 不解决大陆问题；仅可作海外双写可选 |

**不做：** 仅改文案让用户开代理；微信登录强制（孩子/家长邮箱场景不合适作唯一入口）。

---

## 4. 推荐栈

### 主推：**腾讯云 CloudBase（独立 Web/H5 环境）**

理由：

1. **大陆直连**可靠，符合「长期必须国内可注册同步」。
2. **H5 不依赖微信登录**；文档明确支持邮箱登录（配 SMTP / 邮件代发）与域名安全白名单 → 适配现有 GitHub Pages。
3. 文档型数据库 + Web SDK，与现有「按 uid 分文档树」心智接近；可把 `users/{uid}/…` 映射为集合 + `uid` 字段或按路径拆集合。
4. 相对阿里云 RDS / 自建 Supabase，**开通与运维更轻**，适合家庭学习小项目。
5. LeanCloud 本最贴合，但**已无法新建应用**，不能再主推。

### 备选：**阿里云 RDS Supabase（或 PolarDB-X BaaS）**

理由：API 接近 Supabase，邮箱密码模型熟；大陆机房。代价是费用与白名单/运维更重。仅当 CloudBase 邮箱链路或配额不满足时启用。

**明确不主推：** CF Workers+D1（大陆可达性风险）；LeanCloud 新建（停服日程）；纯 Firebase（现状问题）。

---

## 5. 迁移成本

| 项 | 说明 |
|---|---|
| **代码改动面** | 主要 `js/cloud-sync.js` 的 `_init*` / `register` / `login` / `logout` / `_pullBundle` / `_pushBundle`；`index.html` 的 `cloudMsg` 与配置加载文案；新增 `cloudbase-config.js`（或通用 `cloud-config.js`），保留无配置 → 纯本地降级。**合并逻辑、localStorage、游客 UI 不动。** |
| **账号** | 新 BaaS 新用户体系；**无法直接继承 Firebase 密码哈希**。已用 `oppodanny@gmail.com` 等 Firebase 账号需在 CloudBase **重新注册同邮箱**（或家长重置）。 |
| **数据** | Firebase 上若已有进度：可控制台导出 JSON → 一次性导入脚本（可选，非 MVP 必需）。本机游客/`ket_mvp_state_v4` **不受影响**，登录后仍走现有「导入/合并」向导。 |
| **是否丢 Firebase 账号** | **会失去「直接用原 Firebase 会话登录」**；不等于丢本地进度。可选：迁移窗口内保留 Firebase 只读导出，迁移完成后下线 Firebase 依赖。 |
| **托管** | 继续 GitHub Pages；仅 API 指向国内 BaaS。 |
| **合规** | CloudBase 需腾讯云实名；生产建议把 Pages 域名加入安全来源。若日后自有备案域名可再绑自定义域（非 MVP 阻塞）。 |

工作量粗估（实现阶段，本方案通过后）：**约 2～3.5 人日** MVP（Auth + 进度读写 + 合并复用 + 文案 + 双浏览器自测）。

---

## 6. 是否复用现有进度结构

**Yes — 完整复用。**

- 本地：`STATE_KEY` / `LOG_KEY` / `TTS_KEY` / bundle 形状 **零改**。
- 合并：`_mergeBundles` / `mergeCard` / `mergeDaily` / `mergeSentences` **零改**。
- 云端：逻辑字段 1:1 映射，仅存储引擎从 Firestore 换成 CloudBase 文档库（或备选 Postgres 表）。

建议 CloudBase 集合映射（示例）：

| 原 Firestore | CloudBase |
|---|---|
| `users/{uid}` | `users` 文档 `_id = uid` |
| `meta/settings` | `user_settings`：`_id = uid` 或 `uid` 字段 |
| `meta/progress` | `user_progress` |
| `cards/{chunkId}` | `cards`：`_id = uid_chunkId` 或复合查询 `uid + chunkId` |
| `logs` / `sentences` | 同理 + `uid`，安全规则限制仅本人 |

安全规则等价：`auth.uid == doc.uid`（或 docId 前缀）。禁止 Admin 密钥进前端（与现审结论一致）。

---

## 7. 工期

| 阶段 | 内容 | 预估 |
|---|---|---|
| **短期止血**（可先上线） | 改网络错误文案（去掉「请开代理」）；强调游客可用；可选弱化「必须注册」引导 | **0.5 日**（改 `cloudMsg` + 一句登录页提示；交审后推） |
| **中期 MVP** | 开通 CloudBase → 配邮箱登录与域名白名单 → 实现 KetCloud 驱动适配 → 合并/导入复测 | **2～3 日** |
| **验收** | 大陆网络（无代理）注册/登录/同步；游客导入；双设备合并；Pages 200；HR 审截图 | **0.5～1 日** |
| **合计** | 止血 + MVP + 验收 | **约 3～4.5 日** |

不在本轮：手机号登录、家长后台、海外 Firebase 双写（见拍板项）。

---

## 8. 短期止血（错误文案 + 游客）

**原则：** 不提代理/VPN；说明云端暂不可用 + 引导游客；本地进度不丢。

### 建议文案（实现时替换现有 `cloudMsg` 网络分支）

**主文案（注册/登录失败 · 网络类）：**

> 暂时连不上云端，请先点「游客继续」——进度会保存在本机；云端恢复后可用同一邮箱注册并选择导入。

**登录页常驻弱提示（云端 enabled 但易失败时，可选）：**

> 云端同步正在迁移到国内服务，若注册失败不影响学习，可用游客模式。

**同步中途失败（已登录但 flush/pull 失败）：**

> 云端暂存失败，本机进度已保存，稍后再试同步。

**明确废弃：**  
`网络不通（大陆可能需代理），可先用游客继续` ← 当前线上文案，止血时删除「需代理」表述。

> 本阶段 **只改文案与引导，不切 BaaS**（HR：先方案后实现）。

---

## 9. 需要 Danny / HR 拍板的点

1. **是否采用主推 CloudBase？** 若否，备选阿里云 RDS Supabase / 自建是否可接受费用与运维？
2. **邮箱登录形态：** 接受「邮箱+密码」（接近现状）还是 CloudBase v2 常见的「邮箱验证码」？（影响 UI 多一步验证码。）
3. **已有 Firebase 账号：** 接受「同邮箱重新注册」+ 本地/导出导入？是否需要一次性数据迁移脚本？
4. **是否保留 Firebase 作海外双写？** 建议 **MVP 不双写**（复杂度高、孩子场景无必要）；迁移验收后移除 Firebase SDK 依赖。
5. **腾讯云实名账号：** 用 Danny 现有账号还是新建？环境地域（上海等）是否有偏好？
6. **短期止血文案**是否按第 8 节上线（可与中期并行：先推文案，再开 CloudBase）？

---

## 10. 请审结论（给 HR）

| 项 | 结论 |
|---|---|
| 推荐 | **主推腾讯云 CloudBase**；备选阿里云 RDS Supabase |
| 复用 | **是**：KetCloud API、localStorage、合并逻辑全复用；仅换驱动 |
| 工期 | 止血 0.5 日；MVP+验收约 3～4.5 日 |
| 账号 | Firebase 会话不迁移；本地进度可导入新账号 |
| 禁止项 | 不把「开代理」当方案；不新建 LeanCloud；不以 CF Workers 作大陆主路径 |

**通过后实现顺序建议：** ① 止血文案交审上线 → ② 开通 CloudBase 出适配 PoC → ③ 完整 MVP 再交审推 Pages。


---

## 11. 实现备注（2026-10-15）

- 驱动：`js/cloud-sync.js` → CloudBase Web SDK CDN `3.0.1`（`cloudbase.full.js`）
- 配置：`cloudbase-config.js`（`envId` + `region`）；Firebase 配置不再加载
- Auth：`signInWithPassword({ email, password })`；`signUp` 若控制台要求 OTP 会返回明确文案（需开邮箱验证码/内置发信）
- DB：`user_bundles/{uid}` 整包读写；合并逻辑未改
- 域名：见 `docs/cloudbase-domain.md` Option A
- **未推送 / 未代登 CLI 部署**（需 Danny `tcb login`）
