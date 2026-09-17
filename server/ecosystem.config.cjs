/**
 * PM2 进程守护配置（宝塔 PM2 管理器 / 命令行通用）
 *
 * 服务器上启动：
 *   cd /www/wwwroot/hongbei/server
 *   pm2 start ecosystem.config.cjs
 *   pm2 save
 * 更新后端后：
 *   pm2 restart hongbei-server --update-env
 */
module.exports = {
  apps: [
    {
      name: 'hongbei-server',
      script: 'dist/main.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        SERVER_PORT: 3000
      }
    }
  ]
};
