#!/usr/bin/env bash
# ================================================================
# 烘焙协助 · 服务器一键部署脚本（宝塔 Linux，全新机器 0 → 跑起来）
#
# 使用方法：
#   cd /www/wwwroot/hongbei          # 或任何你想部署的目录
#   git clone https://github.com/cvycvy/tuan.git .   # 先把代码拉下来
#   bash deploy/install.sh
#
# 需要你事先在脚本顶部填的：
#   HOST_USER       服务器 SSH 用户名（可选，仅用于 pm2 startup 提示）
#   DOMAIN           你的域名（用于 nginx 配置与提示）
#   JWT_SECRET       随机长字符串（node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"）
#   COZE_SUPABASE_*  从 Supabase Dashboard → Settings → API 复制
#   WX_APP_ID / WX_APP_SECRET  仅生产/小程序登录需要
#
# 注意：本脚本只负责安装 Node/pnpm/pm2 + 构建 + 启动后端。
#       不自动配置宝塔站点/SSL——宝塔 UI 操作更稳，详见最后输出的指引。
# ================================================================
set -euo pipefail

# ====================== 你需要填的（生产前必须替换） ======================
APP_NAME="hongbei-server"
APP_PORT=3000
DEPLOY_DIR="$(cd "$(dirname "$0")/.." && pwd)"   # 脚本所在上级 = 项目根
DOMAIN="hongbei.aaa.com"

# ------- 复制 server/.env.example 为 server/.env 后编辑以下值 -------
JWT_SECRET="REPLACE_ME_WITH_random_base64_96_chars"
COZE_SUPABASE_URL="https://xxx.supabase.co"
COZE_SUPABASE_ANON_KEY="REPLACE_ME"
COZE_SUPABASE_SERVICE_ROLE_KEY="REPLACE_ME"
WX_APP_ID=""            # 小程序生产必填；开发期留空
WX_APP_SECRET=""        # 同上
# =======================================================================

echo "🍰 烘焙协助 · 一键部署"
echo "========================================"
echo "  deploy dir : $DEPLOY_DIR"
echo "  app name   : $APP_NAME"
echo "  port       : $APP_PORT"
echo "  domain     : $DOMAIN"
echo ""

# -------------------- 1. 基础环境检测 --------------------
echo "📦 [1/7] 环境检测"
command -v node >/dev/null 2>&1 || { echo "❌ Node.js 未安装，宝塔「软件商店」搜 Node.js 20.x 先装上"; exit 1; }
NODE_VER=$(node -v | sed 's/v//')
echo "  Node.js: $NODE_VER"
NODE_MAJOR=$(echo "$NODE_VER" | cut -d. -f1)
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "❌ Node.js 需要 18+，当前 $NODE_VER"
  exit 1
fi

# pnpm：没装就用 npm 自带 corepack 启用
if ! command -v pnpm >/dev/null 2>&1; then
  echo "  pnpm 未安装，正在启用 corepack..."
  corepack enable
  corepack prepare pnpm@latest --activate
fi
echo "  pnpm: $(pnpm -v)"

# pm2：没装就全局装
if ! command -v pm2 >/dev/null 2>&1; then
  echo "  pm2 未安装，正在安装..."
  npm i -g pm2
fi
echo "  pm2: $(pm2 -v)"
echo "  ✓ 基础环境 OK"

# -------------------- 2. 检查目录结构 --------------------
echo ""
echo "📁 [2/7] 检查项目"
cd "$DEPLOY_DIR"
for f in "server/package.json" "server/src/main.ts" "ecosystem.config.cjs" ".git"; do
  if [ ! -e "$f" ]; then
    echo "❌ 缺少 $f — 请在项目根目录执行本脚本（deploy/install.sh）"
    exit 1
  fi
done
echo "  ✓ 项目结构完整"

# -------------------- 3. 后端依赖 --------------------
echo ""
echo "🛠 [3/7] 后端依赖（仅生产依赖）"
cd "$DEPLOY_DIR/server"
pnpm install --omit=dev 2>&1 | tail -3
echo "  ✓ server/node_modules 安装完成"

# -------------------- 4. 配置 .env --------------------
echo ""
echo "🔐 [4/7] 配置 .env"
ENV_FILE="$DEPLOY_DIR/server/.env"
if [ -f "$ENV_FILE" ]; then
  echo "  ⚠  已有 server/.env，跳过（保留你本地编辑的内容）"
else
  cat > "$ENV_FILE" <<ENVEOF
NODE_ENV=production
SERVER_PORT=$APP_PORT
JWT_SECRET=$JWT_SECRET
JWT_EXPIRES_IN=7d

COZE_SUPABASE_URL=$COZE_SUPABASE_URL
COZE_SUPABASE_ANON_KEY=$COZE_SUPABASE_ANON_KEY
COZE_SUPABASE_SERVICE_ROLE_KEY=$COZE_SUPABASE_SERVICE_ROLE_KEY

WX_APP_ID=$WX_APP_ID
WX_APP_SECRET=$WX_APP_SECRET

PAYMENT_MOCK=true
ENVEOF
  chmod 600 "$ENV_FILE"
  echo "  ✓ 已生成 $ENV_FILE（权限 600）"
  echo "  ⚠  请打开宝塔文件管理器，确认里面的 JWT_SECRET / Supabase / 微信凭证都填对了再继续"
  read -p "  填好后回车继续..." _ 2>/dev/null || true
fi

# -------------------- 5. 构建 --------------------
echo ""
echo "🏗 [5/7] 构建"
cd "$DEPLOY_DIR"
echo "  — H5 前端 —"
pnpm build:web 2>&1 | tail -3
echo "  — 后端 NestJS —"
pnpm --filter server build 2>&1 | tail -3
echo "  ✓ 构建完成"

# -------------------- 6. PM2 启动 --------------------
echo ""
echo "🚀 [6/7] 启动服务"
cd "$DEPLOY_DIR/server"

# 停旧实例（如果之前存在）
if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  pm2 delete "$APP_NAME" >/dev/null 2>&1
fi

pm2 start ecosystem.config.cjs
pm2 save >/dev/null
pm2 startup systemd -u "$(whoami)" --hp "$HOME" 2>/dev/null || true
echo "  ✓ pm2 启动：$APP_NAME"
pm2 status | grep "$APP_NAME" || echo "  ⚠  pm2 status 没找到，检查是否有启动报错：pm2 logs $APP_NAME"

# -------------------- 7. 健康检查 --------------------
echo ""
echo "❤️ [7/7] 健康检查"
for i in 1 2 3 4 5; do
  if curl -fsS "http://127.0.0.1:$APP_PORT/api/health" >/dev/null 2>&1; then
    echo "  ✓ http://127.0.0.1:$APP_PORT/api/health 返回 200"
    break
  fi
  echo "  等待后端就绪... ($i/5)"
  sleep 2
done

echo ""
echo "========================================"
echo "✅ 后端部署完成！"
echo ""
echo "📌 下一步：在宝塔 UI 做站点配置"
echo ""
echo "  1. 网站 → 添加站点"
echo "     域名：$DOMAIN"
echo "     根目录：$DEPLOY_DIR/dist-web"
echo "     PHP 版本：纯静态"
echo "     数据库：不创建"
echo ""
echo "  2. 站点 → 设置 → 配置文件 → server{} 内粘贴："
echo "──────────────── nginx.conf snippet ────────────────"
cat "$DEPLOY_DIR/deploy/nginx-hongbei.aaa.com.conf"
echo "─────────────────────────────────────────────────────"
echo ""
echo "  3. 站点 → 设置 → SSL → Let's Encrypt"
echo "     文件验证（失败就 DNS 验证）→ 开启「强制 HTTPS」+「自动续签」"
echo ""
echo "  4. 防火墙/安全组放行 80 + 443（3000 不能放）"
echo ""
echo "  5. 微信公众平台 → 开发管理 → 开发设置"
echo "     request 合法域名添加 https://$DOMAIN"
echo ""
echo "🔧 运维速查："
echo "  pm2 logs $APP_NAME          # 看后端日志"
echo "  pm2 restart $APP_NAME       # 重启"
echo "  pm2 status                  # 看运行状态"
echo "  tail -f /www/wwwlogs/$(echo $DOMAIN | tr '.' '_').error.log"
echo ""
echo "📦 更新版本：bash deploy/update.sh"
echo "📖 详细部署手册：cat deploy/README.md"
echo ""
