import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';

/** 标记接口为公开接口，跳过全局 JWT 守卫 */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** 接口允许的角色 */
export const ROLES_KEY = 'roles';
export const Roles = (...roles: Array<'user' | 'worker'>) => SetMetadata(ROLES_KEY, roles);

/** JWT 中解析出的当前登录身份 */
export interface AuthUser {
  openid: string;
  role: 'user' | 'worker';
}

/** 从请求中取出当前登录用户 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user as AuthUser;
  },
);
