import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { AuthUser } from '@/auth/auth.decorators';

export interface RepairOrder {
  id: string;
  category: string;
  description: string;
  address: string;
  contact_name: string;
  contact_phone: string;
  latitude: number;
  longitude: number;
  status: string;
  user_id: string | null;
  worker_id: string | null;
  scheduled_at: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface RepairWorker {
  id: string;
  name: string;
  phone: string;
  trade: string;
  latitude: number;
  longitude: number;
  online: boolean;
  wx_openid: string | null;
  created_at: string;
}

const ORDER_STATUS = ['pending', 'accepted', 'repairing', 'completed', 'cancelled'] as const;
type OrderStatus = (typeof ORDER_STATUS)[number];

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: '待接单',
  accepted: '已接单',
  repairing: '协助中',
  completed: '已完成',
  cancelled: '已取消',
};

/** 烘焙师端允许的正向状态流转：已接单 → 协助中 → 已完成 */
const ALLOWED_STATUS_TRANSITIONS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  accepted: ['repairing'],
  repairing: ['completed'],
};

/** 新列/新表尚未随 schema 同步时的错误码 */
function isMissingSchemaError(error: { code?: string } | null | undefined): boolean {
  return !!error && (error.code === '42703' || error.code === '42P01');
}

/** 数据库 RPC 函数不存在（未执行迁移 SQL） */
function isMissingFunctionError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === '42883' || error.code === 'PGRST202') return true;
  return /function .* (does not exist|不存在)|could not find the function/i.test(error.message || '');
}

/** Haversine 距离（公里） */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function isValidLatLng(lat: number, lng: number): boolean {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    lat >= -90 && lat <= 90 &&
    lng >= -180 && lng <= 180
  );
}

@Injectable()
export class RepairService {
  /** 按 openid 查询用户主键；用户表尚未同步时返回 null（下单自动降级） */
  private async getUserIdByOpenid(openid: string): Promise<string | null> {
    const client = await getSupabaseClient();
    const { data, error } = await client
      .from('repair_users')
      .select('id')
      .eq('openid', openid)
      .maybeSingle();
    if (error) {
      if (isMissingSchemaError(error)) return null;
      throw new Error(`查询用户失败: ${error.message}`);
    }
    return (data?.id as string) || null;
  }

  /** 按 openid 查询烘焙师；wx_openid 列尚未同步时返回 null */
  private async findWorkerByOpenid(openid: string): Promise<RepairWorker | null> {
    const client = await getSupabaseClient();
    const { data, error } = await client
      .from('repair_workers')
      .select('*')
      .eq('wx_openid', openid)
      .maybeSingle();
    if (error) {
      if (isMissingSchemaError(error)) return null;
      throw new Error(`查询烘焙师档案失败: ${error.message}`);
    }
    return (data || null) as RepairWorker | null;
  }

  /** 接单等操作要求烘焙师档案必须已绑定当前登录账号 */
  private async requireWorkerByOpenid(openid: string): Promise<RepairWorker> {
    const worker = await this.findWorkerByOpenid(openid);
    if (!worker) {
      throw new BadRequestException('烘焙师档案未绑定登录账号，请先在“我的档案”中完善档案');
    }
    return worker;
  }

  /** 创建协助单 */
  async createOrder(
    payload: {
      category: string;
      description: string;
      address: string;
      contact_name: string;
      contact_phone: string;
      latitude: number;
      longitude: number;
    },
    user: AuthUser,
  ): Promise<RepairOrder> {
    if (!payload.category || !payload.description || !payload.address) {
      throw new BadRequestException('协助类型、描述和地址不能为空');
    }
    if (!payload.contact_name || !/^1\d{10}$/.test(payload.contact_phone || '')) {
      throw new BadRequestException('联系人姓名或手机号格式不正确');
    }
    if (!isValidLatLng(payload.latitude, payload.longitude)) {
      throw new BadRequestException('定位坐标无效');
    }

    const userId = await this.getUserIdByOpenid(user.openid);
    const client = await getSupabaseClient();

    const insert = async (includeUserId: boolean) => {
      const row: Record<string, unknown> = {
        category: payload.category,
        description: payload.description,
        address: payload.address,
        contact_name: payload.contact_name,
        contact_phone: payload.contact_phone,
        latitude: payload.latitude,
        longitude: payload.longitude,
        status: 'pending',
      };
      if (includeUserId && userId) {
        row.user_id = userId;
      }
      return client.from('repair_orders').insert(row).select().maybeSingle();
    };

    let { data, error } = await insert(true);
    // user_id 列尚未随 schema 同步时，降级为不带 user_id 写入
    if (error && isMissingSchemaError(error)) {
      ({ data, error } = await insert(false));
    }
    if (error) throw new Error(`创建协助单失败: ${error.message}`);
    if (!data) throw new Error('创建协助单失败: 未返回数据');
    return data as RepairOrder;
  }

  /** 查询我的协助单：按登录用户 user_id，可选附带手机号兼容历史数据 */
  async listMyOrders(user: AuthUser, phone?: string): Promise<RepairOrder[]> {
    if (phone !== undefined && !/^1\d{10}$/.test(phone)) {
      throw new BadRequestException('手机号格式不正确');
    }
    const userId = await this.getUserIdByOpenid(user.openid);
    const client = await getSupabaseClient();

    const query = (byUser: boolean) => {
      let builder = client.from('repair_orders').select('*');
      if (byUser && userId) {
        const filter = phone
          ? `user_id.eq.${userId},contact_phone.eq.${phone}`
          : `user_id.eq.${userId}`;
        builder = builder.or(filter);
      } else {
        if (!phone) return Promise.resolve({ data: [], error: null });
        builder = builder.eq('contact_phone', phone);
      }
      return builder.order('created_at', { ascending: false }).limit(100);
    };

    let { data, error } = await query(true);
    if (error && isMissingSchemaError(error)) {
      ({ data, error } = await query(false));
    }
    if (error) throw new Error(`查询协助单失败: ${error.message}`);
    return (data || []) as RepairOrder[];
  }

  /** 查询附近待接单的协助单（烘焙师视角）：优先走数据库 RPC，未迁移时降级应用层计算 */
  async listNearbyOrders(
    lat: number,
    lng: number,
    radiusKm = 20,
  ): Promise<Array<RepairOrder & { distance_km: number }>> {
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      throw new BadRequestException('缺少定位坐标');
    }
    const radius = Number.isNaN(radiusKm) ? 20 : radiusKm;
    const client = await getSupabaseClient();

    const { data: rpcData, error: rpcError } = await client.rpc('repair_nearby_orders', {
      p_lat: lat,
      p_lng: lng,
      p_radius_km: radius,
      p_limit: 200,
    });
    if (!rpcError) {
      return (rpcData || []) as Array<RepairOrder & { distance_km: number }>;
    }
    if (!isMissingFunctionError(rpcError)) {
      throw new Error(`查询附近协助单失败: ${rpcError.message}`);
    }

    // 降级路径：应用层 Haversine（保持未执行 SQL 迁移时可用）
    const { data, error } = await client
      .from('repair_orders')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw new Error(`查询附近协助单失败: ${error.message}`);

    const orders = (data || []) as RepairOrder[];
    return orders
      .map((o) => ({ ...o, distance_km: Math.round(haversineKm(lat, lng, o.latitude, o.longitude) * 10) / 10 }))
      .filter((o) => o.distance_km <= radius)
      .sort((a, b) => a.distance_km - b.distance_km);
  }

  /** 查询协助单详情，附带接单烘焙师信息；仅本人或接单烘焙师可查看 */
  async getOrderDetail(id: string, user: AuthUser): Promise<RepairOrder & { worker: RepairWorker | null }> {
    const client = await getSupabaseClient();
    const { data, error } = await client.from('repair_orders').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(`查询协助单失败: ${error.message}`);
    if (!data) throw new NotFoundException('协助单不存在');
    const order = data as RepairOrder;

    if (user.role === 'user') {
      if (order.user_id) {
        const userId = await this.getUserIdByOpenid(user.openid);
        if (userId && order.user_id !== userId) {
          throw new ForbiddenException('只能查看自己的协助单');
        }
      }
    } else {
      // worker：已被其他烘焙师接走的单不可见
      if (order.worker_id) {
        const worker = await this.findWorkerByOpenid(user.openid);
        if (!worker || order.worker_id !== worker.id) {
          throw new ForbiddenException('该协助单已被其他烘焙师接单');
        }
      }
    }

    let worker: RepairWorker | null = null;
    if (order.worker_id) {
      const { data: workerData, error: workerError } = await client
        .from('repair_workers')
        .select('*')
        .eq('id', order.worker_id)
        .maybeSingle();
      if (workerError) throw new Error(`查询烘焙师失败: ${workerError.message}`);
      worker = (workerData || null) as RepairWorker | null;
    }
    return { ...order, worker };
  }

  /** 烘焙师接单：校验状态并写入接单烘焙师与约定上门时间 */
  async acceptOrder(
    id: string,
    workerOpenid: string,
    scheduledAt?: string,
  ): Promise<RepairOrder> {
    const worker = await this.requireWorkerByOpenid(workerOpenid);
    const client = await getSupabaseClient();

    const { data: orderData, error: orderError } = await client
      .from('repair_orders')
      .select('status')
      .eq('id', id)
      .maybeSingle();
    if (orderError) throw new Error(`查询协助单失败: ${orderError.message}`);
    if (!orderData) throw new NotFoundException('协助单不存在');
    if (orderData.status !== 'pending') {
      throw new BadRequestException('该协助单已被接单或已结束');
    }

    const { data, error } = await client
      .from('repair_orders')
      .update({
        status: 'accepted',
        worker_id: worker.id,
        scheduled_at: scheduledAt || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('status', 'pending')
      .select()
      .maybeSingle();
    if (error) throw new Error(`接单失败: ${error.message}`);
    if (!data) throw new BadRequestException('接单失败，订单状态可能已变化');
    return data as RepairOrder;
  }

  /** 烘焙师更新协助单状态（只能操作自己接的单） */
  async updateOrderStatus(id: string, status: OrderStatus, workerOpenid: string): Promise<RepairOrder> {
    if (!ORDER_STATUS.includes(status)) {
      throw new BadRequestException('无效的订单状态');
    }
    const worker = await this.requireWorkerByOpenid(workerOpenid);
    const client = await getSupabaseClient();

    const { data: existing, error: queryError } = await client
      .from('repair_orders')
      .select('worker_id,status')
      .eq('id', id)
      .maybeSingle();
    if (queryError) throw new Error(`查询协助单失败: ${queryError.message}`);
    if (!existing) throw new NotFoundException('协助单不存在');
    if (!existing.worker_id || existing.worker_id !== worker.id) {
      throw new ForbiddenException('只能操作自己接的协助单');
    }

    const currentStatus = existing.status as OrderStatus;
    const allowedNext = ALLOWED_STATUS_TRANSITIONS[currentStatus] || [];
    if (!allowedNext.includes(status)) {
      throw new BadRequestException(
        `当前状态为「${STATUS_LABELS[currentStatus] || currentStatus}」，不能变更为「${STATUS_LABELS[status] || status}」`,
      );
    }

    const { data, error } = await client
      .from('repair_orders')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) throw new Error(`更新协助单失败: ${error.message}`);
    if (!data) throw new NotFoundException('协助单不存在');
    return data as RepairOrder;
  }

  /**
   * 烘焙师撤销协助（退单）：已接单/协助中 → 待接单。
   * 原子释放：清空接单烘焙师与约定时间，订单重新进入附近接单池，其他烘焙师可接。
   */
  async releaseOrder(id: string, workerOpenid: string): Promise<RepairOrder> {
    const worker = await this.requireWorkerByOpenid(workerOpenid);
    const client = await getSupabaseClient();

    const { data: existing, error: queryError } = await client
      .from('repair_orders')
      .select('worker_id,status')
      .eq('id', id)
      .maybeSingle();
    if (queryError) throw new Error(`查询协助单失败: ${queryError.message}`);
    if (!existing) throw new NotFoundException('协助单不存在');
    if (!existing.worker_id || existing.worker_id !== worker.id) {
      throw new ForbiddenException('只能撤销自己接的协助单');
    }
    const currentStatus = existing.status as OrderStatus;
    if (currentStatus !== 'accepted' && currentStatus !== 'repairing') {
      throw new BadRequestException(
        `当前状态为「${STATUS_LABELS[currentStatus] || currentStatus}」，不能撤销协助`,
      );
    }

    const { data, error } = await client
      .from('repair_orders')
      .update({
        status: 'pending',
        worker_id: null,
        scheduled_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('worker_id', worker.id)
      .in('status', ['accepted', 'repairing'])
      .select()
      .maybeSingle();
    if (error) throw new Error(`撤销协助失败: ${error.message}`);
    if (!data) throw new BadRequestException('撤销协助失败，订单状态可能已变化');
    return data as RepairOrder;
  }

  /** 创建或更新烘焙师档案：按 openid 识别；手机号命中老档案时回填 openid */
  async upsertWorker(
    payload: {
      name: string;
      phone: string;
      trade: string;
      latitude: number;
      longitude: number;
      online?: boolean;
    },
    openid: string,
  ): Promise<RepairWorker> {
    if (!payload.name || !/^1\d{10}$/.test(payload.phone || '')) {
      throw new BadRequestException('姓名或手机号格式不正确');
    }
    if (!payload.trade) {
      throw new BadRequestException('请选择擅长领域');
    }
    if (!isValidLatLng(payload.latitude, payload.longitude)) {
      throw new BadRequestException('定位坐标无效');
    }
    const client = await getSupabaseClient();

    const update = async (id: string, includeOpenid: boolean) => {
      const row: Record<string, unknown> = {
        name: payload.name,
        trade: payload.trade,
        latitude: payload.latitude,
        longitude: payload.longitude,
        online: payload.online ?? true,
      };
      if (includeOpenid) row.wx_openid = openid;
      return client.from('repair_workers').update(row).eq('id', id).select().maybeSingle();
    };

    // 1. openid 已绑定档案 → 直接更新
    const byOpenid = await this.findWorkerByOpenid(openid);
    if (byOpenid) {
      const { data, error } = await update(byOpenid.id, true);
      if (error) throw new Error(`更新烘焙师失败: ${error.message}`);
      if (!data) throw new Error('更新烘焙师失败: 未返回数据');
      return data as RepairWorker;
    }

    // 2. 手机号命中历史档案：未绑定 openid 则回填；已绑定其他账号则拒绝
    const { data: byPhone, error: phoneError } = await client
      .from('repair_workers')
      .select('*')
      .eq('phone', payload.phone)
      .maybeSingle();
    if (phoneError && !isMissingSchemaError(phoneError)) {
      throw new Error(`查询烘焙师失败: ${phoneError.message}`);
    }
    if (byPhone) {
      const existing = byPhone as RepairWorker;
      if (existing.wx_openid && existing.wx_openid !== openid) {
        throw new BadRequestException('该手机号已被其他账号绑定，请更换手机号');
      }
      const { data, error } = await update(existing.id, true);
      if (error && isMissingSchemaError(error)) {
        // wx_openid 列尚未同步：仅更新资料
        const retry = await update(existing.id, false);
        if (retry.error) throw new Error(`更新烘焙师失败: ${retry.error.message}`);
        return retry.data as RepairWorker;
      }
      if (error) throw new Error(`更新烘焙师失败: ${error.message}`);
      if (!data) throw new Error('更新烘焙师失败: 未返回数据');
      return data as RepairWorker;
    }

    // 3. 新建档案
    const insert = async (includeOpenid: boolean) => {
      const row: Record<string, unknown> = {
        name: payload.name,
        phone: payload.phone,
        trade: payload.trade,
        latitude: payload.latitude,
        longitude: payload.longitude,
        online: payload.online ?? true,
      };
      if (includeOpenid) row.wx_openid = openid;
      return client.from('repair_workers').insert(row).select().maybeSingle();
    };

    let { data, error } = await insert(true);
    if (error && isMissingSchemaError(error)) {
      ({ data, error } = await insert(false));
    }
    if (error) throw new Error(`创建烘焙师失败: ${error.message}`);
    if (!data) throw new Error('创建烘焙师失败: 未返回数据');
    return data as RepairWorker;
  }

  /** 查询当前登录烘焙师的档案 */
  async getWorkerByOpenid(openid: string): Promise<RepairWorker | null> {
    return this.findWorkerByOpenid(openid);
  }

  /** 查询当前登录烘焙师已接订单 */
  async listWorkerOrders(openid: string): Promise<RepairOrder[]> {
    const worker = await this.requireWorkerByOpenid(openid);
    const client = await getSupabaseClient();
    const { data, error } = await client
      .from('repair_orders')
      .select('*')
      .eq('worker_id', worker.id)
      .in('status', ['accepted', 'repairing', 'completed'])
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw new Error(`查询烘焙师订单失败: ${error.message}`);
    return (data || []) as RepairOrder[];
  }
}
