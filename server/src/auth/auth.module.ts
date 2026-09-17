import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { AuthController } from '@/auth/auth.controller';
import { AuthService } from '@/auth/auth.service';
import { JwtAuthGuard } from '@/auth/jwt-auth.guard';
import { loadEnv } from '@/storage/database/supabase-client';

const DEV_JWT_SECRET = 'dev-insecure-jwt-secret-change-me';

@Module({
  imports: [
    JwtModule.registerAsync({
      global: true,
      useFactory: async () => {
        await loadEnv();
        let secret = process.env.JWT_SECRET;
        if (!secret) {
          if (process.env.NODE_ENV === 'production') {
            throw new Error('JWT_SECRET 未配置：生产环境必须设置 JWT_SECRET 环境变量');
          }
          console.warn('[auth] 未配置 JWT_SECRET，正在使用开发默认值，请勿用于生产环境');
          secret = DEV_JWT_SECRET;
        }
        return {
          secret,
          signOptions: { expiresIn: process.env.JWT_EXPIRES_IN || '7d' },
        } as JwtModuleOptions;
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    // 全局守卫：默认所有接口都需要登录，公开接口使用 @Public() 放行
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AuthModule {}
