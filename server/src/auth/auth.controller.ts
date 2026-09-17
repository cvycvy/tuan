import { Body, Controller, Post } from '@nestjs/common';
import { AuthService, LoginRole } from '@/auth/auth.service';
import { Public } from '@/auth/auth.decorators';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /** 小程序登录：wx.login 的 code 换 JWT */
  @Public()
  @Post('wx-login')
  wxLogin(@Body() body: { code?: string; role?: LoginRole }) {
    return this.authService.wxLogin(body.code || '', body.role || 'user');
  }

  /** 调试登录（仅非生产环境，供 H5 开发使用） */
  @Public()
  @Post('dev-login')
  devLogin(@Body() body: { role?: LoginRole; openid?: string }) {
    return this.authService.devLogin(body.role || 'user', body.openid);
  }
}
