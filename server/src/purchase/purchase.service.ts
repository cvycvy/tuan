import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { AuthUser } from '@/auth/auth.decorators';
import { PaymentService } from './payment.service';
import type { CreatePaymentResult, PayChannel } from './payment.types';
import { PAY_CHANNELS } from './payment.types';

/** 对外返回的预拌粉订单（金额同时给分与元，前端直接展示） */
export interface PowderOrderDto {
  id: string;
  order_no: string;
  user_id: string | null;
  product_name: string;
  amount_fen: number;
  amount_yuan: string;
  pay_channel: PayChannel | null;
  status: 'pending' | 'paid' | 'failed' | 'cancelled';
  transaction_no: string | null;
  remark: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string | null;
}

interface PowderOrderRow {
  id: string;
  order_no: string;
  user_id: string | null;
  product_name: string;
  amount_fen: number | string;
  pay_channel: PayChannel | null;
  status: string;
  transaction_no: string | null;
  remark: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string | null;
}

/** 单笔金额上限（元）：90 万。与 payment.service.MAX_PAY_AMOUNT_FEN/100 对齐。
 *  注意：微信 JSAPI 单渠道上限仅约 10 万元，超过时在发起支付阶段拦截并提示用户换支付宝/银行卡。 */
const MAX_AMOUNT_YUAN = 900_000;

@Injectable()
export class PurchaseService {
  constructor(private readonly paymentService: PaymentService) {}

  /** 创建预拌粉购买订单（自定义金额，单位：元） */
  async createOrder(
    user: AuthUser,
    payload: { amount?: number; amount_yuan?: number; remark?: string },
  ): Promise<PowderOrderDto> {
    const amountFen = this.parseAmount(payload.amount ?? payload.amount_yuan);
    const userId = await this.getUserIdByOpenid(user.openid);

    const row = {
      order_no: await this.generateOrderNo(),
      user_id: userId,
      product_name: '预拌粉',
      amount_fen: amountFen,
      status: 'pending',
      remark: payload.remark?.slice(0, 255) || null,
    };

    const client = await getSupabaseClient();
    const { data, error } = await client
      .from('powder_orders')
      .insert(row)
      .select()
      .maybeSingle();
    if (error) {
      throw new BadRequestException(`创建订单失败: ${error.message}`);
    }
    return this.toDto(data as PowderOrderRow);
  }

  /** 发起支付：返回模拟收银台信息或真实渠道支付参数 */
  async initiatePay(
    user: AuthUser,
    id: string,
    channel: PayChannel,
  ): Promise<{ order: PowderOrderDto; payment: CreatePaymentResult }> {
    if (!PAY_CHANNELS.includes(channel)) {
      throw new BadRequestException('不支持的支付方式');
    }
    const order = await this.getOwnedOrder(user, id);
    if (order.status === 'paid') {
      throw new BadRequestException('订单已支付，请勿重复支付');
    }
    if (order.status !== 'pending') {
      throw new BadRequestException(`当前订单状态（${order.status}）不可支付`);
    }

    const payment = await this.paymentService.createPayment(
      {
        orderNo: order.order_no,
        amountFen: order.amount_fen,
        productName: order.product_name,
        openid: user.openid,
      },
      channel,
    );

    const client = await getSupabaseClient();
    await client.from('powder_orders').update({ pay_channel: channel }).eq('id', id);

    return { order: { ...order, pay_channel: channel }, payment };
  }

  /** 模拟支付确认（仅允许 mock 的环境；与真实回调共用同一幂等入账逻辑） */
  async mockPay(user: AuthUser, id: string): Promise<PowderOrderDto> {
    if (!this.paymentService.isMockAllowed()) {
      throw new ForbiddenException('当前环境已禁用模拟支付');
    }
    const order = await this.getOwnedOrder(user, id);
    if (order.status === 'paid') return order;
    return this.confirmPaid(order.order_no, this.paymentService.buildMockTransactionNo());
  }

  /** 第三方异步通知入口（微信/支付宝，公开接口） */
  async handleNotify(channel: PayChannel, body: Record<string, any>, headers: Record<string, any>): Promise<boolean> {
    const parsed = await this.paymentService.parseNotify(channel, body, headers);
    if (parsed.success) {
      await this.confirmPaid(parsed.orderNo, parsed.transactionNo);
    }
    return parsed.success;
  }

  /** 幂等入账：仅 pending → paid 一次，第三方重复通知不会重复入账 */
  async confirmPaid(orderNo: string, transactionNo: string): Promise<PowderOrderDto> {
    const client = await getSupabaseClient();
    const { data, error } = await client
      .from('powder_orders')
      .update({ status: 'paid', transaction_no: transactionNo, paid_at: new Date().toISOString() })
      .eq('order_no', orderNo)
      .eq('status', 'pending')
      .select()
      .maybeSingle();
    if (error) {
      throw new BadRequestException(`支付入账失败: ${error.message}`);
    }
    if (data) {
      return this.toDto(data as PowderOrderRow);
    }
    // 未更新到：可能已支付（幂等返回）或订单不存在
    const { data: existing } = await client
      .from('powder_orders')
      .select()
      .eq('order_no', orderNo)
      .maybeSingle();
    if (!existing) {
      throw new NotFoundException(`订单不存在: ${orderNo}`);
    }
    return this.toDto(existing as PowderOrderRow);
  }

  /** 我的购买记录 */
  async listMine(user: AuthUser): Promise<PowderOrderDto[]> {
    const client = await getSupabaseClient();
    const userId = await this.getUserIdByOpenid(user.openid);
    let query = client
      .from('powder_orders')
      .select()
      .order('created_at', { ascending: false })
      .limit(100);
    if (userId) {
      query = query.eq('user_id', userId);
    }
    const { data, error } = await query;
    if (error) {
      throw new BadRequestException(`查询订单失败: ${error.message}`);
    }
    return (data as PowderOrderRow[]).map(row => this.toDto(row));
  }

  /** 订单详情（仅本人） */
  async getDetail(user: AuthUser, id: string): Promise<PowderOrderDto> {
    return this.getOwnedOrder(user, id);
  }

  // -------------------------------- 内部方法 --------------------------------

  private async getOwnedOrder(user: AuthUser, id: string): Promise<PowderOrderDto> {
    const client = await getSupabaseClient();
    const { data, error } = await client
      .from('powder_orders')
      .select()
      .eq('id', id)
      .maybeSingle();
    if (error) {
      throw new BadRequestException(`查询订单失败: ${error.message}`);
    }
    if (!data) {
      throw new NotFoundException('订单不存在');
    }
    const order = this.toDto(data as PowderOrderRow);
    const userId = await this.getUserIdByOpenid(user.openid);
    if (order.user_id && userId && order.user_id !== userId) {
      throw new ForbiddenException('只能查看自己的订单');
    }
    return order;
  }

  private async getUserIdByOpenid(openid: string): Promise<string | null> {
    const client = await getSupabaseClient();
    const { data } = await client
      .from('repair_users')
      .select('id')
      .eq('openid', openid)
      .maybeSingle();
    return data?.id || null;
  }

  /** 金额（元）→ 分，含格式与范围校验 */
  private parseAmount(amount: unknown): number {
    const n = Number(amount);
    if (!Number.isFinite(n)) {
      throw new BadRequestException('金额必须是数字');
    }
    if (n < 0.01) {
      throw new BadRequestException('最低支付金额为 0.01 元');
    }
    if (n > MAX_AMOUNT_YUAN) {
      throw new BadRequestException(`单笔金额不能超过 ${MAX_AMOUNT_YUAN} 元`);
    }
    return Math.round(n * 100);
  }

  /** 业务订单号：P + 14 位时间 + 6 位随机，冲突时重试一次 */
  private async generateOrderNo(): Promise<string> {
    const client = await getSupabaseClient();
    for (let attempt = 0; attempt < 2; attempt++) {
      const now = new Date();
      const p = (v: number) => v.toString().padStart(2, '0');
      const ts =
        `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}` +
        `${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
      const rand = Math.floor(Math.random() * 0xffffff)
        .toString(16)
        .padStart(6, '0')
        .toUpperCase();
      const orderNo = `P${ts}${rand}`;
      const { data } = await client
        .from('powder_orders')
        .select('id')
        .eq('order_no', orderNo)
        .maybeSingle();
      if (!data) return orderNo;
    }
    throw new BadRequestException('订单号生成冲突，请重试');
  }

  private toDto(row: PowderOrderRow): PowderOrderDto {
    const amountFen = Number(row.amount_fen);
    return {
      id: row.id,
      order_no: row.order_no,
      user_id: row.user_id,
      product_name: row.product_name,
      amount_fen: amountFen,
      amount_yuan: (amountFen / 100).toFixed(2),
      pay_channel: row.pay_channel,
      status: row.status as PowderOrderDto['status'],
      transaction_no: row.transaction_no,
      remark: row.remark,
      paid_at: row.paid_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}
