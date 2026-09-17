import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { AuthUser, IS_PUBLIC_KEY, ROLES_KEY } from '@/auth/auth.decorators';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const authorization: string = request.headers?.authorization || '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
    if (!token) {
      throw new UnauthorizedException('未登录，请先登录');
    }

    try {
      const payload = this.jwtService.verify(token) as { sub?: string; role?: 'user' | 'worker' };
      if (!payload?.sub) throw new Error('invalid token payload');
      request.user = { openid: payload.sub, role: payload.role } as AuthUser;
    } catch {
      throw new UnauthorizedException('登录已过期，请重新登录');
    }

    const requiredRoles = this.reflector.getAllAndOverride<Array<'user' | 'worker'>>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (requiredRoles && requiredRoles.length > 0 && !requiredRoles.includes(request.user.role)) {
      throw new ForbiddenException('当前账号无权执行该操作');
    }

    return true;
  }
}
