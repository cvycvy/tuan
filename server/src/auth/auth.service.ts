import { BadRequestException, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { getSupabaseClient, loadEnv } from '@/storage/database/supabase-client';

export type LoginRole = 'user' | 'worker';

export interface LoginResult {
  token: string;
  openid: string;
  role: LoginRole;
  profile_completed: boolean;
}

interface UserRow {
  id: string;
  openid: string;
}

interface WorkerRow {
  id: string;
  wx_openid: string | null;
}

interface WxSessionResponse {
  openid?: string;
  unionid?: string;
  session_key?: string;
  errcode?: number;
  errmsg?: string;
}

/** jscode2session 常见错误码 → 可直接定位配置问题的中文提示 */
const WX_LOGIN_ERROR_TEXT: Record<number, string> = {
  [-1]: '微信服务器系统繁忙，请稍后重试',
  40001: 'AppSecret 无效或已失效，请重新获取',
  40013: 'AppID 不合法，请检查 server/.env 的 WX_APP_ID 是否为小程序 AppID',
  40029: '登录凭证 code 无效，请重新进入小程序重试',
  40125: 'AppSecret 不正确，请在微信公众平台重置后更新 server/.env',
  40226: '该用户无权限登录（小程序未发布或处于审核状态）',
  45011: '登录频率限制，请稍后重试',
};

@Injectable()
export class AuthService {
  constructor(private readonly jwtService: JwtService) {}

  /** 小程序 wx.login 换 openid 并签发 JWT */
  async wxLogin(code: string, role: LoginRole): Promise<LoginResult> {
    if (!code || typeof code !== 'string') {
      throw new BadRequestException('缺少登录凭证 code');
    }
    if (role !== 'user' && role !== 'worker') {
      throw new BadRequestException('登录角色不合法');
    }

    await loadEnv();
    const appId = process.env.WX_APP_ID;
    const appSecret = process.env.WX_APP_SECRET;
    if (!appId || !appSecret) {
      throw new ServiceUnavailableException('服务端未配置微信 AppID/AppSecret，请联系管理员');
    }

    const url =
      `https://api.weixin.qq.com/sns/jscode2session?appid=${encodeURIComponent(appId)}` +
      `&secret=${encodeURIComponent(appSecret)}&js_code=${encodeURIComponent(code)}&grant_type=authorization_code`;

    let session: WxSessionResponse;
    try {
      const resp = await fetch(url);
      session = (await resp.json()) as WxSessionResponse;
    } catch {
      throw new ServiceUnavailableException('微信登录服务暂时不可用，请稍后重试');
    }

    if (session.errcode || !session.openid) {
      throw new UnauthorizedException(
        `微信登录失败: ${WX_LOGIN_ERROR_TEXT[session.errcode ?? -1] || session.errmsg || '未获取到 openid'}`,
      );
    }

    return this.buildLogin(session.openid, role);
  }

  /** 仅非生产环境可用的免微信调试登录（H5 开发态使用） */
  async devLogin(role: LoginRole, openid?: string): Promise<LoginResult> {
    if (process.env.NODE_ENV === 'production') {
      throw new UnauthorizedException('调试登录在生产环境不可用');
    }
    if (role !== 'user' && role !== 'worker') {
      throw new BadRequestException('登录角色不合法');
    }
    const fakeOpenid = openid && /^[a-zA-Z0-9_-]{4,64}$/.test(openid) ? openid : `dev-${role}-local`;
    return this.buildLogin(fakeOpenid, role);
  }

  /** 按 openid 准备身份档案并签发 token */
  private async buildLogin(openid: string, role: LoginRole): Promise<LoginResult> {
    let profileCompleted = true;

    if (role === 'user') {
      await this.ensureUser(openid);
    } else {
      const worker = await this.findWorkerByOpenid(openid);
      // 烘焙师档案需要在“我的档案”页补全姓名/擅长领域等信息
      profileCompleted = !!worker;
    }

    const token = await this.jwtService.signAsync({ sub: openid, role });
    return { token, openid, role, profile_completed: profileCompleted };
  }

  /** 用户按 openid 建档（不存在则创建） */
  private async ensureUser(openid: string): Promise<UserRow> {
    const client = await getSupabaseClient();
    const { data: existing, error: queryError } = await client
      .from('repair_users')
      .select('id, openid')
      .eq('openid', openid)
      .maybeSingle();
    if (queryError) {
      // repair_users 表尚未随 schema 同步时，登录不应被阻塞，user_id 写入会自动降级
      if (queryError.code === '42P01') {
        return { id: '', openid };
      }
      throw new Error(`查询用户失败: ${queryError.message}`);
    }
    if (existing) {
      return existing as UserRow;
    }

    const { data, error } = await client
      .from('repair_users')
      .insert({ openid })
      .select('id, openid')
      .maybeSingle();
    if (error) {
      if (error.code === '42P01') {
        return { id: '', openid };
      }
      throw new Error(`创建用户失败: ${error.message}`);
    }
    return (data || { id: '', openid }) as UserRow;
  }

  private async findWorkerByOpenid(openid: string): Promise<WorkerRow | null> {
    const client = await getSupabaseClient();
    const { data, error } = await client
      .from('repair_workers')
      .select('id, wx_openid')
      .eq('wx_openid', openid)
      .maybeSingle();
    if (error) {
      // wx_openid 列尚未随 schema 同步：视为档案未建立，前端引导完善档案
      if (error.code === '42703' || error.code === '42P01') {
        return null;
      }
      throw new Error(`查询烘焙师档案失败: ${error.message}`);
    }
    return (data || null) as WorkerRow | null;
  }
}
