# ============================================================
# 一键打包部署产物（在项目根目录执行）
#
#   powershell -ExecutionPolicy Bypass -File scripts\package-release.ps1
#
# 输出：
#   release\hongbei\       宝塔服务器部署包（上传到 /www/wwwroot/hongbei/）
#   release\miniprogram\   微信小程序包（用微信开发者工具导入并上传）
#
# 微信小程序构建依赖根目录 .env.local 中的 TARO_APP_API_BASE，
# 未配置时自动跳过小程序构建（仅产出 H5 + 后端包）。
# 参考 .env.local.example 创建该文件。
# ============================================================

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host '==> [1/5] 构建 H5 前端 (dist-web)...' -ForegroundColor Cyan
pnpm build:web
if ($LASTEXITCODE -ne 0) { throw '前端构建失败' }

Write-Host '==> [2/5] 构建 NestJS 后端 (server/dist)...' -ForegroundColor Cyan
pnpm --filter server build
if ($LASTEXITCODE -ne 0) { throw '后端构建失败' }

# 读取 .env.local 判断小程序是否具备构建条件
$envLocal = Join-Path $root '.env.local'
$apiBase = ''
$appid = ''
if (Test-Path $envLocal) {
  foreach ($line in Get-Content $envLocal) {
    if ($line -match '^\s*(?:export\s+)?TARO_APP_API_BASE\s*=\s*(.+?)\s*$') { $apiBase = $Matches[1].Trim('"').Trim("'") }
    if ($line -match '^\s*(?:export\s+)?TARO_APP_WEAPP_APPID\s*=\s*(.+?)\s*$') { $appid = $Matches[1].Trim('"').Trim("'") }
  }
}

$builtMp = $false
if ($apiBase) {
  Write-Host '==> [3/5] 构建微信小程序 (dist)...' -ForegroundColor Cyan
  pnpm build:weapp
  if ($LASTEXITCODE -ne 0) { throw '微信小程序构建失败' }
  $builtMp = $true
} else {
  Write-Host '==> [3/5] 跳过微信小程序构建（.env.local 缺少 TARO_APP_API_BASE）' -ForegroundColor Yellow
}

$release = Join-Path $root 'release\hongbei'
Write-Host "==> [4/5] 暂存服务器部署包到 $release ..." -ForegroundColor Cyan
if (Test-Path $release) { Remove-Item $release -Recurse -Force }
New-Item -ItemType Directory -Force -Path "$release\server" | Out-Null

Copy-Item 'dist-web' "$release\dist-web" -Recurse
Copy-Item 'server\dist' "$release\server\dist" -Recurse
Copy-Item 'server\package.json' "$release\server\package.json"
Copy-Item 'server\ecosystem.config.cjs' "$release\server\ecosystem.config.cjs"
Copy-Item 'server\.env.example' "$release\server\.env.example"
Copy-Item 'deploy\nginx.conf' "$release\nginx.conf"
Copy-Item 'deploy\README.md' "$release\README.md"

if ($builtMp) {
  $mp = Join-Path $root 'release\miniprogram'
  if (Test-Path $mp) { Remove-Item $mp -Recurse -Force }
  Copy-Item 'dist' $mp -Recurse
  Write-Host "==> [5/5] 微信小程序包已输出 release\miniprogram\（AppID: $(if ($appid) { $appid } else { '未配置，导入后手动选择' })）" -ForegroundColor Green
} else {
  Write-Host '==> [5/5] 完成（未产出小程序包）' -ForegroundColor Green
}

Write-Host ''
Write-Host '部署包内容：' -ForegroundColor Yellow
Get-ChildItem $release -Recurse -Depth 1 -File |
  ForEach-Object { '  ' + $_.FullName.Substring($release.Length + 1) } |
  Sort-Object | Select-Object -First 12
Write-Host ''
Write-Host '后续步骤：' -ForegroundColor Yellow
Write-Host '  1. 上传 release\hongbei 内容到服务器 /www/wwwroot/hongbei/'
Write-Host '  2. 复制 server\.env.example 为 server\.env 并填写生产配置'
Write-Host '  3. cd /www/wwwroot/hongbei/server && npm install --omit=dev'
Write-Host '  4. pm2 start ecosystem.config.cjs && pm2 save'
Write-Host '  5. 宝塔站点引用 nginx.conf 模板并配置 SSL'
if ($builtMp) {
  Write-Host '  6. 微信开发者工具导入 release\miniprogram → 上传 → 提交审核'
}
