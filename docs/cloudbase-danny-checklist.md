# Danny / HR · CloudBase 开通与验收清单

envId: `english-little-steps-d0a2b84764b` · 地域：上海 `ap-shanghai`

## 已完成（HR）
- [x] 环境已开通
- [x] 用户名密码登录已启用（邮箱+密码路径）
- [x] 文档型数据库已开
- [ ] 集合 + PRIVATE 规则（进行中）

## 仍需 HR / Danny
1. **集合**（MVP）：创建 `user_bundles`  
   - 文档 `_id` = 用户 `uid`  
   - 字段：`state`, `logs`, `tts`, `updatedAt` / `updatedAtMs`, `email`, `uid`, `profile`  
   - 安全规则等价：仅登录用户可读写 `_id == auth.uid`（或 `doc.uid == auth.uid`）  
   - **不要**把 Admin 密钥写进前端
2. **注册通道**（二选一，否则应用内「注册」会提示验证码/邮件）：  
   - 推荐：开启 **邮箱验证码** + 控制台「内置发信」（零 SMTP）；或  
   - 配置 SMTP，走邮件激活链接  
   - 当前 H5 为邮箱+密码单步 UI；若 `signUp` 返回 OTP 回调，会提示开验证码，游客仍可用
3. **域名（MVP）**：体验版无法加 `dannywang0822.github.io`  
   → 按 `docs/cloudbase-domain.md` **Option A** 部署到 CloudBase 静态托管，用 `*.tcloudbaseapp.com` 验收注册同步  
   → Option B：升付费后再加 Pages 域名
4. **可选**：控制台生成 Publishable Key，写入 `cloudbase-config.js` 的 `accessKey`（若 Web 端要求）

## 前端（业务 Bot 已本地提交，待审）
- [x] `cloudbase-config.js` / example
- [x] `js/cloud-sync.js` CloudBase 驱动（不双写 Firebase）
- [x] `cloudMsg` / 角标文案切到 CloudBase
- [ ] HR 审通过后再 push；托管部署需 Danny `tcb login`

## 验收标准
- CloudBase 托管域名打开 →「云端已就绪」
- 大陆无代理：注册（通道就绪后）/ 登录 / 同步；游客仍可用
- GitHub Pages 在体验版下可展示，但 Auth 可能失败（预期）
