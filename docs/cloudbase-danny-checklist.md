# Danny 开通腾讯云 CloudBase 清单（转 HR）

MVP 需要下列信息，开通后把「envId」等回传即可开始适配（邮箱+密码，不双写 Firebase）。

## 1. 开通
1. 用 Danny 腾讯云账号实名登录 [CloudBase 控制台](https://console.cloud.tencent.com/tcb)
2. 新建**环境**（建议地域：上海或广州；环境名可如 `english-little-steps`）
3. 记下 **环境 ID（envId）**，形如 `english-xxxx`

## 2. 登录方式
1. 登录方式里开启 **邮箱登录**（邮箱+密码，不要只用验证码）
2. 按控制台指引配置发信（SMTP / 邮件代发），保证能完成注册流程
3. 确认允许 Web 端调用（非仅小程序）

## 3. 安全域名 / 来源
把下列域名加入 Web 安全域名 / HTTP 访问来源（名称以控制台为准）：
- `dannywang0822.github.io`
- `localhost`（本地调试）
- `127.0.0.1`（本地调试）

## 4. 数据库与权限
1. 开通文档型数据库（默认即可）
2. 安全规则：仅登录用户可读写**自己的**数据（`auth.uid` 隔离），**不要**把 Admin / 密钥写进前端仓库

## 5. 回传给 H5 业务 Bot 的字段
- `envId`（必须）
- 地域（可选）
- 是否已开邮箱+密码（确认）
- 是否已加 `dannywang0822.github.io` 安全域名（确认）

收到后即可做 KetCloud → CloudBase 驱动适配并交审。
