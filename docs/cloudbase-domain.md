# CloudBase 域名策略（MVP）

> envId: `english-little-steps-d0a2b84764b` · 上海 `ap-shanghai`  
> 体验版**无法**把 `dannywang0822.github.io` 加进安全域名；默认可用 `*.tcloudbaseapp.com`。

## Option A · MVP 推荐：静态托管到 CloudBase

把同一套静态文件部署到 CloudBase **静态网站托管**，用默认域名访问（形如 `https://<envId>-xxxx.tcloudbaseapp.com`）。该域名已在安全来源白名单内，大陆可直连注册/登录/同步。

### Danny 部署步骤（需腾讯云登录，本 Bot 未代登）

```bash
# 1) 安装 CLI（本机一次）
npm i -g @cloudbase/cli

# 2) 浏览器登录腾讯云（交互，需 Danny）
tcb login
# 或: cloudbase login

# 3) 确认静态托管已开通（控制台「静态网站托管」或按 CLI 提示开通）
tcb hosting detail -e english-little-steps-d0a2b84764b

# 4) 在仓库根目录部署（纯静态，无 build）
cd /path/to/english-little-steps
tcb hosting deploy . -e english-little-steps-d0a2b84764b \
  --ignore "shot-*.png,.git/**,docs/**,firebase-config.js,firestore.rules,firestore.indexes.json,firebase.json,.firebaserc,.github/**"

# 5) 打开控制台给出的默认域名，确认：
#    - 页面 HTTP 200
#    - 角标「云端已就绪」
#    - 能注册/登录（集合与规则就绪后）并能同步
```

也可在控制台「静态网站托管 → 上传文件」手动上传 `index.html`、`js/`、`data/`、`cloudbase-config.js`、`.nojekyll` 等。

**GitHub Pages 可继续作展示/备份**；在体验版下 **Auth 会因安全域名失败**，不要指望 Pages 域名上完成注册。

## Option B · 升付费后继续用 GitHub Pages

升级 CloudBase 套餐（约 ¥119+/月级，以控制台报价为准）后，把安全域名加上：

- `dannywang0822.github.io`
- `localhost` / `127.0.0.1`（本地调试）

然后现有 Pages 地址即可直连 Auth + 文档库，无需搬托管。

## 结论

| 路径 | 大陆注册同步 | 费用 | MVP |
|---|---|---|---|
| A. CloudBase 静态托管域名 | ✅ | 体验额度内通常可撑家庭用量 | **采用** |
| B. 付费 + Pages 白名单 | ✅ | 付费套餐 | 后续可选 |
| 仅 GitHub Pages（体验版） | ❌ Auth 被拦 | 0 | 不可作云端入口 |

游客模式在任意域名下始终可用（纯 localStorage）。
