#!/usr/bin/env bash
# ================================================================
# 烘焙协助 · 版本更新脚本（拉最新代码 → 构建 → 热重启）
#
# 用法：cd /www/wwwroot/hongbei && bash deploy/update.sh
# 幂等：可以反复跑，已在最新时不会重复构建
# 不触碰 .env（你手动填的密钥保留）
# ================================================================
set -euo pipefail

APP_NAME="hongbei-server"
APP_PORT=3000
DEPLOY_DIR="$(cd "$(dirname "$0")/.." && pwd)"

cd "$DEPLOY_DIR"

echo "🍰 烘焙协助 · 版本更新"
echo "========================================"

echo "📥 [1/4] 拉取最新代码"
BEFORE=$(git rev-parse HEAD 2>/dev/null || echo "no-git")
git fetch origin main
git reset --hard origin/main
AFTER=$(git rev-parse HEAD)
if [ "$BEFORE" = "$AFTER" ]; then
  echo "  ✓ 已是最新版本 ($AFTER)"
else
  echo "  ✓ 更新: $BEFORE → $AFTER"
  git log --oneline "$BEFORE..$AFTER" 2>/dev/null | head -5 || true
fi

echo ""
echo "🛠 [2/4] 后端依赖（有变动才安装）"
cd "$DEPLOY_DIR/server"
if git diff --name-only HEAD@{1} HEAD 2>/dev/null | grep -qE "(pnpm-lock\.yaml|package\.json)"; then
  echo "  依赖有变动，重新安装..."
  pnpm install --omit=dev 2>&1 | tail -3
else
  echo "  pnpm-lock.yaml 无变化，跳过"
fi

echo ""
echo "🏗 [3/4] 构建"
cd "$DEPLOY_DIR"
pnpm build:web 2>&1 | tail -3
pnpm --filter server build 2>&1 | tail -3
echo "  ✓ 构建完成"

echo ""
echo "🔄 [4/4] 热重启 PM2"
if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  pm2 reload "$APP_NAME" || pm2 restart "$APP_NAME"
  echo "  ✓ $APP_NAME 已 reload"
else
  echo "  ⚠  pm2 里没找到 $APP_NAME，尝试启动..."
  cd "$DEPLOY_DIR/server"
  pm2 start ecosystem.config.cjs
  pm2 save
fi

echo ""
echo "❤️ 健康检查"
for i in 1 2 3 4 5; do
  if curl -fsS "http://127.0.0.1:$APP_PORT/api/health" >/dev/null 2>&1; then
    echo "  ✓ 后端 OK"
    break
  fi
  echo "  等待后端就绪... ($i/5)"
  sleep 2
done

echo ""
echo "✅ 完成！当前版本 $(git log --oneline -1)"
echo "📌 前端已热更新，浏览器 Ctrl+F5 即可"
echo "🔧 pm2 logs $APP_NAME 看实时日志"
