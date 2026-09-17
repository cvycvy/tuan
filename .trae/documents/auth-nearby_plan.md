# 微信登录鉴权 + 附近订单查询下推数据库 实施计划

## 一、仓库调研结论（Repository Research）

1. **项目形态**：pnpm monorepo（根目录 + `server` 子包），Taro 4（小程序/H5）+ NestJS 10 + Supabase(Postgres)。
2. **现状身份体系**：用户与师傅均仅靠手机号识别；`repair_orders.contact_phone` 下单时写入，`repair_workers.phone` 唯一识别师傅；无任何登录/鉴权代码，CORS 全开放。
3. **附近订单现状**（`server/src/repair/repair.service.ts#listNearbyOrders`）：先 `.eq('status','pending').limit(200)` 拉取最多 200 条，再在 Node 中用 Haversine 算距离、过滤半径、排序。问题：① 计算在应用层，传输与扩展差；② 只看最新 200 条待接单，超出部分永远匹配不到，存在正确性缺陷。
4. **数据库 schema 来源**：`src/storage/database/shared/model.py`（SQLAlchemy）是 Coze 平台建表/同步的 SSOT；自定义 SQL 函数无法通过它下发，需额外提供迁移 SQL 由用户在 Supabase 控制台执行。
5. **网络层**：`src/network.ts` 封装 Taro.request，其文件注释明确允许"添加全局参数，如给所有请求加上 header"——注入 Authorization 合规；禁止改动其 URL 拼接逻辑。
6. **H5 代理**：`config/index.ts` 已将 `/api` 代理到 `http://localhost:${SERVER_PORT||3000}`，前端继续用相对路径即可。
7. **环境**：Node ≥18（可用原生 `fetch` 调微信 API，无需引入 axios）；依赖已安装但 `@nestjs/jwt` 未安装；后端路径别名 `@/* → src/*`。
8. **跨端约束**：`Taro.login` 在微信/抖音小程序可用，H5 不可用——H5 开发态需要免微信的调试入口。

## 二、设计决策

### A. 微信登录 + JWT
- 小程序端 `Taro.login` 取 code → `POST /api/auth/wx-login { code, role }` → 后端调微信 `jscode2session` 拿 openid → upsert 身份 → 签发 JWT（payload `{ sub: openid, role }`，默认 7 天）。
- 后端新增**全局 JWT 守卫**（`APP_GUARD`），用 `@Public()` 放行 auth 接口；其余 `/api/repair/**` 全部需要登录。
- 用户表新建 `repair_users`；师傅在现有 `repair_workers` 上加 `wx_openid`；订单加 `user_id`（可空，保留"联系人+手机号"业务字段，师傅仍靠 contact_phone 联系用户）。
- 老师傅档案迁移：`upsertWorker` 先按 openid 查，查不到再按手机号匹配老档案并**回填 openid**，再没有才新建。
- H5/本地开发：`POST /api/auth/dev-login { role }` 仅当 `NODE_ENV !== 'production'` 时注册，签发调试 JWT；生产环境缺失 `JWT_SECRET` 直接启动失败，开发环境给默认值并打印告警。
- 需要的环境变量（用户配置）：`WX_APP_ID`、`WX_APP_SECRET`、`JWT_SECRET`、`JWT_EXPIRES_IN`（可选）。

### B. 附近查询下推数据库
- 提供 `server/sql/001_nearby_rpc.sql`：创建 PL/pgSQL 函数 `repair_nearby_orders(p_lat, p_lng, p_radius_km, p_limit)`，**不依赖 PostGIS/earthdistance 扩展**（避免扩展权限问题），在 SQL 内完成状态过滤 + Haversine 半径过滤 + 距离升序，顺带消除"仅最新 200 条"的缺陷。
- Service 改为 `supabase.rpc('repair_nearby_orders', ...)`；当 RPC 返回"函数不存在"（PG 42883/42P01 或 PostgREST 202）时**自动降级**为现有应用层 Haversine，保证未执行迁移时系统照常工作。

## 三、文件与改动清单

### 新增（后端）
- `server/src/auth/auth.module.ts`：JwtModule 注册（密钥/有效期读 env，全局导出）。
- `server/src/auth/auth.controller.ts`：`POST /auth/wx-login`、`POST /auth/dev-login`（仅非生产）。
- `server/src/auth/auth.service.ts`：jscode2session（原生 fetch）、openid upsert、JWT 签发、参数校验。
- `server/src/auth/jwt-auth.guard.ts`：全局 Bearer 守卫，支持 `@Public()` 元数据。
- `server/src/auth/auth.decorators.ts`：`@Public()`、`@CurrentUser()`、`@Roles()`。
- `server/sql/001_nearby_rpc.sql`：迁移 SQL（函数 + 状态索引说明），需用户在 Supabase SQL 编辑器执行。

### 修改（后端）
- `server/package.json`：新增依赖 `@nestjs/jwt`（用 `pnpm --filter server add` 安装，不手改）。
- `server/src/app.module.ts`：引入 AuthModule、注册全局守卫。
- `server/src/repair/repair.controller.ts`：接口加守卫/角色/当前用户；接单与状态流转从 JWT 推导 worker_id；新增 `GET orders/worker/mine`、`GET workers/mine` 改为读 token。
- `server/src/repair/repair.service.ts`：
  - 附近单：RPC 优先 + 应用层降级；
  - `createOrder` 写入 `user_id`；`listMyOrders` 按 user_id（phone 可选兼容）；
  - `acceptOrder`/`updateOrderStatus` 校验 worker 身份与归属（越权返回 403）；
  - `upsertWorker` 支持 openid 并做手机号回填；`getWorkerByOpenid`。
- `src/storage/database/shared/model.py`：新增 `RepairUser`（repair_users 表）；`RepairWorker` 加 `wx_openid`；`RepairOrder` 加 `user_id` FK（均可空，含唯一/普通索引）。

### 新增（前端）
- `src/stores/auth.ts`：Zustand auth store——token 持久化（`Taro.setStorageSync('auth_token')`）、`ensureLogin(role)` 单例 Promise（小程序走 `Taro.login`+wx-login；H5 走 dev-login）、`logout()`。

### 修改（前端）
- `src/network.ts`：仅给 request/uploadFile/downloadFile 注入 `Authorization` header（从 storage 同步读取）；收到 401 时清除失效 token。不动 URL 逻辑。
- `src/utils/api.ts`：新增 `wxLogin`/`devLogin`；`acceptOrder(id, scheduledAt?)` 去掉 workerId；`listWorkerOrders()`、`getMyWorkerProfile()`、`listMyOrders()` 改为无参（身份来自 token）；错误解析识别 401。
- `src/app.tsx`：启动时静默 `ensureLogin('user')`，失败不阻塞页面（业务调用时会再尝试）。
- `src/pages/report/index.tsx`：`useLoad` 调 `ensureLogin('user')`；表单与提交流程不变。
- `src/pages/orders/index.tsx`：进入页面 `ensureLogin('user')` 后自动拉取"我的协助单"；移除手机号查询输入框（身份即账号）；保留空态与跳详情逻辑。
- `src/pages/order-detail/index.tsx`：`useLoad` 先 `ensureLogin` 再取详情；其余展示不变（含联系师傅电话）。
- `src/pages/worker/index.tsx`：`ensureLogin('worker')`；档案改用 `getMyWorkerProfile()`（无 openid 档案时落到表单，按手机号回填老档案）；接单不再传 workerId；"我接的单"按 token 加载。

## 四、实施步骤（按依赖顺序）

1. 安装后端依赖 `pnpm --filter server add @nestjs/jwt`。
2. 更新 `model.py`（新表/新字段），编写 `server/sql/001_nearby_rpc.sql`。
3. 实现后端 auth 模块（decorators → guard → service → controller → module）。
4. `app.module.ts` 接入；明确生产环境 JWT_SECRET 校验逻辑。
5. 改造 repair service（RPC+降级、user_id/openid 归属逻辑）与 controller（守卫、当前用户、角色）。
6. 前端实现 auth store；改造 network.ts 注入 token/401 处理。
7. 更新 `utils/api.ts` 签名；逐个调整 4 个业务页面（report → orders → order-detail → worker）。
8. 全量校验与自查（见第五节）。

## 五、验证（Validation）

- `pnpm tsc`：前端 TypeScript 零错误。
- `pnpm --filter server build`（nest build）：后端编译零错误。
- `pnpm lint:build`：ESLint 0 warning（遵守 AGENTS.md：不手搓通用 UI、Tailwind 优先、无硬编码 px）。
- 代码走查：未登录访问受保护接口返回 401；非本人订单/非接单师傅操作返回 403；RPC 不存在时降级路径可走通。
- 用户侧后续手动验证（本环境无法完成）：在 Coze/Supabase 环境变量配置 `WX_APP_ID`、`WX_APP_SECRET`、`JWT_SECRET`；在 Supabase SQL 编辑器执行 `001_nearby_rpc.sql`；小程序端真机走登录→下单→接单闭环。

## 六、风险与应对

| 风险 | 应对 |
|---|---|
| Coze 平台未立即同步 model.py 的新表/字段 | 新列均可空；service 对 user/openid 缺列场景不强依赖；RPC 失败自动降级 |
| 用户未执行 SQL 迁移 | RPC 调用捕获"函数不存在"后降级应用层 Haversine，功能不受损 |
| H5 无 Taro.login | 非生产环境提供 dev-login；生产 H5 如需微信网页授权另行扩展 |
| 全局守卫误伤现有调用 | 前端启动静默登录、各页面 ensureLogin；auth 路由 @Public |
| 老师傅档案没有 openid | upsertWorker 按手机号匹配并回填 openid，不产生重复档案 |
| 生产忘配 JWT_SECRET/微信密钥 | JWT_SECRET 缺失时生产启动直接报错；微信接口失败返回明确中文错误 |
| network.ts 的"禁止修改"约束 | 仅增加其注释中明确允许的全局 Authorization header，不改 URL/域名逻辑 |

## 七、不在本次范围

- 微信网页授权（H5 公众号 OAuth）、支付、消息订阅推送。
- 手机验证码/账号密码体系。
- README/AGENTS 文档更新（如需要可在代码完成后另行处理）。
