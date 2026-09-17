# 宝塔部署指南（烘焙协助 · Taro 微信小程序 + H5 + NestJS + Supabase）

**发布形态（方案 1）**：微信小程序为正式主端（用户通过 `wx.login` 静默登录）；H5 网页作为开发预览/展示端（生产模式下调试登录被禁用，仅非生产可用）。

架构：小程序/H5 → Nginx(80/443 HTTPS) → `/api/*` 反代 → `127.0.0.1:3000`（PM2 守护 NestJS）；数据库使用 Supabase 云服务，服务器无需安装数据库。

## 零、本地联调先行（**不需要宝塔 / Nginx / HTTPS**）

在你本地 Windows 机器上就能把前后端全链路调通，**先把这步跑通**再碰服务器：

```powershell
# 终端 1：后端 NestJS（3000 端口）
cd server && pnpm dev       # 或 pnpm --filter server start:dev

# 终端 2：H5 开发模式（5000 端口，已内置 /api → 3000 代理）
pnpm dev:h5
```
浏览器打开 `http://localhost:5000/#/pages/index/index` 测试 H5 全部功能。

**微信小程序本地联调**：

```powershell
# 根目录 .env.local 只需填这一行（本地不校验域名）
#   TARO_APP_API_BASE=http://127.0.0.1:3000
#   TARO_APP_WEAPP_APPID=wx你的真实AppID
pnpm dev:weapp              # watch 编译到 dist/
```
微信开发者工具「导入项目」→ 选 `dist/` → 「详情 → 本地设置」**勾选「不校验合法域名」** → 真机扫码。

> 结论：**本地联调阶段完全不依赖任何服务器**。宝塔 + Nginx + 域名 + HTTPS 是上线前的最后一步。

### 零、宝塔生产配置预填文件（`hongbei.aaa.com`）

本包已按你提供的域名/目录/后端端口预生成两份文件：

| 文件 | 用途 |
|---|---|
| [nginx-hongbei.aaa.com.conf](nginx-hongbei.aaa.com.conf) | **宝塔粘贴片段**（只含 location / root / gzip，listen/SSL 段让宝塔 UI 自己管） |
| [nginx-hongbei.aaa.com-full.conf](nginx-hongbei.aaa.com-full.conf) | **完整独立模板**（80→443 + HTTPS 段，用于手动配置或对照排查） |

两份文件里 `hongbei.aaa.com`、`/www/wwwroot/hongbei/dist-web`、`127.0.0.1:3000` 均已替换好，直接用。

## 一、打包（本地 Windows）

```powershell
powershell -ExecutionPolicy Bypass -File scripts\package-release.ps1
```

输出：
- `release/hongbei/` —— 宝塔服务器部署包（上传到 `/www/wwwroot/hongbei/`）
- `release/miniprogram/` —— 微信小程序包（用开发者工具导入并上传）

## 二、上传到服务器

```
/www/wwwroot/hongbei/
├── dist-web/                ← 整个目录（H5 静态产物）
└── server/
    ├── dist/                ← 整个目录（NestJS 编译产物）
    ├── package.json
    ├── ecosystem.config.cjs
    ├── .env.example
    └── node_modules/        ← 服务器上 npm install --omit=dev 后生成
```

## 三、后端环境变量

上传完成后，在宝塔「终端」：

```bash
cd /www/wwwroot/hongbei/server
cp .env.example .env        # 然后在宝塔文件管理器里编辑 .env
```

必填：

```ini
NODE_ENV=production
SERVER_PORT=3000
# 生成命令：node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
JWT_SECRET=<强随机字符串>
JWT_EXPIRES_IN=7d

# Supabase（填你开发时用的同一套值，生产与本地可共用）
COZE_SUPABASE_URL=https://xxx.supabase.co
COZE_SUPABASE_ANON_KEY=...
COZE_SUPABASE_SERVICE_ROLE_KEY=...

# 微信小程序登录【生产必填】
WX_APP_ID=wx你的小程序AppID
WX_APP_SECRET=你的小程序AppSecret

# 真实支付未就绪前先开模拟；上线改为 false 并填写微信/支付宝支付凭证
PAYMENT_MOCK=true
```

宝塔文件管理器里把 `.env` 权限设为 **600**（取消其他用户读取）。

3. 安装依赖 + PM2 启动：

```bash
cd /www/wwwroot/hongbei/server
npm install --omit=dev
pm2 start ecosystem.config.cjs
pm2 save
```

## 四、HTTPS 域名与反向代理（宝塔 UI 操作）

### 4.0 前置条件

| 条件 | 说明 | 验证方式 |
|---|---|---|
| 域名已**备案** | 微信小程序强制要求，未备案无法通过 request 域名校验 | 工信部备案查询 |
| 域名 A 记录 → 服务器公网 IP | 阿里云/腾讯云 DNS 或宝塔 DNS 管理添加 | `ping hongbei.aaa.com` 返回服务器 IP |
| 放行 **80 + 443** | 云厂商安全组**和**宝塔「安全」页都要放行 | 浏览器 HTTP/HTTPS 都能连 |
| **3000 端口不对外开放** | 仅让本机 Nginx 反代访问 | 浏览器 `http://服务器IP:3000` 应超时/拒绝 |

### 4.1 创建站点

宝塔「**网站 → 添加站点**」：

- 域名：`hongbei.aaa.com`
- 根目录：`/www/wwwroot/hongbei/dist-web`
- PHP 版本：**纯静态**
- 数据库：**不创建**
- 勾选「不创建 FTP」

### 4.2 粘贴反代配置

站点「**设置 → 配置文件**」，在 `server {}` 内粘贴 [nginx-hongbei.aaa.com.conf](nginx-hongbei.aaa.com.conf) 全文（里面域名/路径/后端端口均已预填好）。

> ⚠️ 不要用 `-full.conf` 整文件覆盖宝塔生成的配置：宝塔自己管理 `listen`/`server_name`/证书路径/强制 HTTPS 段，覆盖会导致证书申请失败。`-full.conf` 仅供手动排查对照。

点「保存」→ 宝塔自动 reload Nginx。保存时报语法错误的话，把报错原文发我。

### 4.3 申请 SSL 证书

站点「**设置 → SSL → Let's Encrypt**」：

1. 证书域名：勾选 `hongbei.aaa.com`，验证方式选 **文件验证**
2. 验证失败就改用 **DNS 验证**（需先绑定 DNS 服务商 API，最稳）
3. 申请成功后开启「**强制 HTTPS**」+「自动续签」
4. 证书部署 → 勾选站点

### 4.4 验证

在**你本地电脑**（不是服务器）执行：

```bash
# 反代是否通：必须返回后端 JSON
curl https://hongbei.aaa.com/api/health

# HTTP 已强制跳 HTTPS：应返回 301
curl -I http://hongbei.aaa.com/

# TLS 版本符合微信要求（支持 1.2/1.3）
curl -sSI --tlsv1.2 https://hongbei.aaa.com/api/health

# 证书链完整
curl -vI https://hongbei.aaa.com/index.html
```

四项通过 → 把 `https://hongbei.aaa.com` 填进小程序 `.env.local` 的 `TARO_APP_API_BASE` 重新构建，并在微信公众平台「request 合法域名」加上 `https://hongbei.aaa.com`。

## 五、发布微信小程序

1. 公众平台 → 开发管理 → 开发设置 → 服务器域名 → request 合法域名添加 `https://hongbei.aaa.com`
2. 本地执行：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\package-release.ps1
```

3. 微信开发者工具 → 导入 `release/miniprogram` → 「上传」→ 填版本号
4. 公众平台 → 版本管理 → 选为体验版 → 添加体验成员扫码测试
5. 全量发布

## 六、版本更新

```powershell
# 本地重新打包
powershell -ExecutionPolicy Bypass -File scripts\package-release.ps1
```

覆盖上传 `dist-web/` 和 `server/dist/`（**不要覆盖 `.env`**），然后：

```bash
pm2 restart hongbei-server --update-env   # 后端需重启；前端浏览器强刷即可
```

小程序重新 `pnpm build:weapp` → 开发者工具上传新版本 → 提交审核。

## 常见问题

| 现象 | 排查 |
|---|---|
| 页面正常、接口 502 | `pm2 status` 看后端是否在线；`curl http://127.0.0.1:3000/api/health` 确认后端本身可用；`pm2 logs hongbei-server` 看启动错误（多为 `.env` 缺失/填错） |
| 接口 404 | 反代 location 未生效，或宝塔保存后没 reload Nginx；`nginx -t` 检查语法 |
| 证书文件验证失败 | 80 端口未放行 / 站点根目录不对 / 有 location 抢走了 `/.well-known/`。改用 DNS 验证最稳 |
| 微信报「证书链不完整」 | 宝塔要选 `fullchain.pem`（含中间证书），不能只配 `cert.pem` |
| 发版后 H5 白屏、资源 404 | 浏览器缓存了旧 `index.html`。确认已加 `location = /index.html` 的 no-cache 规则 |
| 小程序能连但 H5 登录失败 | 正常——生产模式禁用 `/api/auth/dev-login`，H5 属展示端。正式用户走小程序 |
| 登录态频繁失效 | 多实例部署时 `JWT_SECRET` 必须一致；修改密钥后旧 token 全部失效属正常 |
| 小程序报「url not in domain list」 | 未在公众平台配置 request 合法域名；开发期可勾选「不校验合法域名」绕过 |
| 小程序登录失败 AppID 不合法 | `WX_APP_ID` 填成了公众号/开放平台 AppID，需填**小程序**的（后端已回传具体错误码提示） |
| 小程序请求全部失败 | 构建时 `.env.local` 的 `TARO_APP_API_BASE` 未生效，重新构建（编译期注入） |
