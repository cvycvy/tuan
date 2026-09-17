# 🍰 烘焙协助 · 蛋糕预拌粉

基于 **Taro + NestJS + Supabase** 的全栈烘焙协助平台，微信小程序为正式主端，H5 作为开发预览端。用户通过发起烘焙协助（配料比换算、打发发酵、烤箱温控等 8 类场景），系统就近匹配认证烘焙师提供线上或上门指导，同时内置预拌粉购买与模拟支付链路。

## ✨ 功能一览

### 用户侧
- 🎂 **发起烘焙协助**：8 类烘焙协助类型（配方配比指导、预拌粉选购建议、烘焙操作教学、打发与发酵指导、烤箱温控指导、成品问题补救、裱花装饰协助、其他烘焙协助）
- 📍 **就近匹配烘焙师**：按地理位置排序，实时展示附近烘焙师列表
- 📋 **我的协助订单**：状态流转（待接单 → 已接单 → 协助中 → 已完成），支持撤销
- 🧁 **蛋糕预拌粉购买**：自定义金额下单，支持微信/支付宝/银行卡模拟支付

### 烘焙师侧
- 👩‍🍳 **烘焙师档案**：7 类擅长领域（蛋糕烘焙师、面包烘焙师、甜品西点师、裱花装饰师、健康烘焙顾问、家庭烘焙顾问、综合烘焙师），注册认证
- 🔧 **接单工作台**：附近待接协助列表，点击接单 → 开始指导 → 完成闭环

### 后端
- 🔐 **双端登录**：微信小程序 `wx.login` → `jscode2session` 换 openid + JWT；开发期 H5 调试登录（生产禁用）
- 💳 **三渠道支付**：微信 JSAPI v3（小程序内 `wx.requestPayment`）、支付宝手机网站支付、银行卡占位；真实凭证可配自动切换
- 🔄 **幂等状态机**：支付回调与模拟支付共用同一入账逻辑，状态非法跳转自动拒绝
- 🔍 **金额三重防线**：API 入口（90 万）→ 支付层按渠道上限（微信 ≈ 10 万 / 支付宝 = 90 万）→ Supabase CHECK 约束

## 🧱 技术栈

| 层 | 选型 | 说明 |
|---|---|---|
| 前端 | Taro 4.1.9 + React 18 + TypeScript | 一套代码编译到 **微信小程序** 和 **H5** |
| 后端 | NestJS 10 + TypeScript | PM2 单实例守护，端口 3000 |
| 数据库 | Supabase (PostgreSQL) | 云托管，开发/生产共用同一项目 |
| 鉴权 | JWT (HS256) | 微信登录签发，7 天有效 |
| 部署 | Nginx + PM2 + 宝塔 | 静态托管 `/api` 反代 3000，Let's Encrypt 自动续签 |

## 📦 项目结构

```
tuan-main/
├── src/                      # Taro 前端源码
│   ├── pages/
│   │   ├── index/           # 首页（烘焙协助入口）
│   │   ├── report/          # 发起协助表单
│   │   ├── orders/          # 我的协助订单
│   │   ├── worker/          # 烘焙师接单工作台
│   │   ├── order-detail/    # 协助订单详情
│   │   ├── powder/          # 预拌粉购买
│   │   └── powder-orders/   # 我的预拌粉订单
│   ├── stores/              # Zustand 状态（登录态、路由）
│   ├── utils/               # API 封装、支付、定位等
│   └── components/ui/       # 共享 UI 组件
├── server/                   # NestJS 后端
│   ├── src/
│   │   ├── auth/            # 微信登录 + JWT Guard
│   │   ├── purchase/        # 预拌粉订单 + 三渠道支付
│   │   ├── repair/          # 协助订单（发起/接单/状态流转）
│   │   └── storage/         # Supabase Client 初始化
│   ├── sql/                 # 建表与迁移 SQL
│   ├── ecosystem.config.cjs # PM2 配置
│   └── .env.example         # 生产环境变量模板
├── config/                   # Taro 多端构建配置
├── deploy/                   # 宝塔部署配置
│   ├── nginx-hongbei.aaa.com.conf    # 粘贴片段
│   ├── nginx-hongbei.aaa.com-full.conf # 完整独立模板
│   └── README.md            # 详细部署手册
├── scripts/package-release.ps1  # 一键打包 H5 + 小程序 + 后端
├── .env.local.example        # 前端构建变量模板
└── package.json
```

## 🚀 快速开始

### 环境要求

- Node.js **18+**（推荐 20 LTS）
- pnpm **8+**（`npm i -g pnpm`）
- Supabase 项目（新建或复用，见「配置 Supabase」）

### 安装

```bash
git clone https://github.com/cvycvy/tuan.git
cd tuan
pnpm install
cp server/.env.example server/.env    # 填 Supabase + JWT_SECRET
```

### 配置 Supabase

1. 打开 [supabase.com](https://supabase.com) 新建项目
2. **Settings → API** 复制 **Project URL** 和 **anon public key**（service_role key 只放服务器）
3. 在项目 SQL Editor 里依次执行：
   - `server/sql/000_init_tables.sql`（用户表 + 协助订单表）
   - `server/sql/001_nearby_rpc.sql`（附近烘焙师检索 RPC）
   - `server/sql/002_powder_orders.sql`（预拌粉订单表）
   - `server/sql/003_alter_powder_amount_limit.sql`（金额上限 90 万）

把 URL 和 anon key 填进 `server/.env` 的 `COZE_SUPABASE_URL` / `COZE_SUPABASE_ANON_KEY`。

### 本地开发

```bash
# 终端 1：后端 NestJS（3000 端口，watch 模式）
pnpm dev:server

# 终端 2：H5 开发（5000 端口，内置 /api → 3000 代理）
pnpm dev:web
# 浏览器打开 http://localhost:5000/index.html#/pages/index/index
```

### 微信小程序本地调试

```bash
# 根目录 .env.local：
#   TARO_APP_API_BASE=http://127.0.0.1:3000
#   TARO_APP_WEAPP_APPID=wx你的真实AppID
pnpm dev:weapp
# 微信开发者工具导入 dist/，勾选「不校验合法域名」
```

### 生产构建

```bash
pnpm build:web              # H5 → dist-web/
pnpm --filter server build  # 后端 → server/dist/

# 或一键打包宝塔部署包：
powershell -ExecutionPolicy Bypass -File scripts\package-release.ps1
# 输出到 release/hongbei/ （上传到宝塔 /www/wwwroot/hongbei/）
```

## 📡 API 端点

| 方法 | 路径 | 鉴权 | 说明 |
|---|---|---|---|
| POST | `/api/auth/wx-login` | 公开 | 微信小程序 `wx.login` 换 code 登录 |
| POST | `/api/auth/dev-login` | 公开 | 开发期调试登录（生产禁用） |
| POST | `/api/repair/orders` | user | 用户发起协助 |
| GET | `/api/repair/orders/mine` | user | 我的协助列表 |
| POST | `/api/repair/workers/:id/accept` | worker | 烘焙师接单 |
| POST | `/api/repair/workers/:id/complete` | worker | 标记已完成 |
| POST | `/api/purchase/powder/orders` | user | 购买预拌粉 |
| POST | `/api/purchase/powder/orders/:id/pay` | user | 发起支付（mock / 微信 / 支付宝） |
| POST | `/api/purchase/powder/orders/:id/mock-pay` | user | 模拟支付确认 |
| POST | `/api/purchase/callback/wechat` | 公开 | 微信支付异步通知 |
| POST | `/api/purchase/callback/alipay` | 公开 | 支付宝支付异步通知 |
| GET | `/api/health` | 公开 | 后端健康检查 |

## 🧾 支付金额限制（三层防线）

```
前端输入    →   后端 parseAmount   →   支付层按渠道   →   Supabase CHECK
≤ 900000 元     ×100 转分          微信 ≤ 9999999 分   amount_fen ≤ 90000000
                                    支付宝 ≤ 90000000 分
```

| 渠道 | 单笔上限（元） | 说明 |
|---|---|---|
| 微信 JSAPI | ≈ 10 万 | 官方硬限制 |
| 支付宝 wap | 90 万 | 项目全局上限 |
| 银行卡 | 90 万 | 暂未接银联聚合，仅 mock |

## 🚢 宝塔部署

详见 [deploy/README.md](deploy/README.md)，核心步骤：

```bash
# 1. 本地打包
pnpm build:web && pnpm --filter server build

# 2. 上传服务器 /www/wwwroot/hongbei/
#    - dist-web/     ← 整个目录
#    - server/dist/   ← 整个目录
#    - server/.env    ← 填入生产 JWT_SECRET + Supabase + （可选）微信/支付宝凭证

# 3. 服务器安装依赖
cd /www/wwwroot/hongbei/server
npm install --omit=dev
pm2 start ecosystem.config.cjs && pm2 save

# 4. 宝塔添加站点：
#    - 域名 hongbei.aaa.com，根目录 /www/wwwroot/hongbei/dist-web，PHP=纯静态
#    - 站点设置 → 配置文件：粘贴 deploy/nginx-hongbei.aaa.com.conf
#    - 站点设置 → SSL：Let's Encrypt 申请证书 + 开启强制 HTTPS
```

## 🛠 环境变量

```ini
# server/.env
NODE_ENV=production
SERVER_PORT=3000
JWT_SECRET=<node -e "console.log(require('crypto').randomBytes(48).toString('base64'))">
JWT_EXPIRES_IN=7d

COZE_SUPABASE_URL=https://xxx.supabase.co
COZE_SUPABASE_ANON_KEY=eyJhbGci...
COZE_SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...

# 微信小程序登录【生产必填】
WX_APP_ID=wx你的小程序AppID
WX_APP_SECRET=你的小程序AppSecret

# 微信支付（可选，接真实链路时填）
WXPAY_APPID=...
WXPAY_MCHID=...
WXPAY_APIV3_KEY=...
WXPAY_SERIAL_NO=...
WXPAY_PRIVATE_KEY_PATH=/path/to/apiclient_key.pem
WXPAY_NOTIFY_URL=https://hongbei.aaa.com/api/purchase/callback/wechat

# 支付宝（可选，接真实链路时填）
ALIPAY_APP_ID=...
ALIPAY_APP_PRIVATE_KEY=...
ALIPAY_PUBLIC_KEY=...
ALIPAY_NOTIFY_URL=https://hongbei.aaa.com/api/purchase/callback/alipay

# PIX 模拟支付 = true（默认）；真实上线改为 false
PAYMENT_MOCK=true
```

## 📱 发布微信小程序

1. `.env.local` 填 `TARO_APP_API_BASE=https://hongbei.aaa.com` 和 `TARO_APP_WEAPP_APPID=wx你的AppID`
2. 公众平台 → 开发管理 → 服务器域名 → request 合法域名添加 `https://hongbei.aaa.com`
3. `pnpm build:weapp` → 微信开发者工具导入 `dist/` → 上传 → 体验版 → 全量发布

## 🔐 安全

- `.env` 已在 `.gitignore`，不要提交任何密钥
- `server/.env` 建议 600 权限（宝塔文件管理器可设）
- JWT_SECRET 必须随机强密钥（不要用默认值）
- 本仓库 GitHub PAT 已作废 —— 你分享到公开上下文的凭证请立即 revoke

## 📄 License

本项目仅供学习和烘焙爱好者互助场景使用。
