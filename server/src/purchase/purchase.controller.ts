import { Body, Controller, Get, Headers, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AuthUser, CurrentUser, Public, Roles } from '@/auth/auth.decorators';
import { PurchaseService } from './purchase.service';
import type { PayChannel } from './payment.types';

/** 预拌粉购买（用户侧） */
@Controller('purchase/powder')
export class PurchaseController {
  constructor(private readonly purchaseService: PurchaseService) {}

  /** 创建购买订单（自定义金额，单位元） */
  @Roles('user')
  @Post('orders')
  createOrder(
    @CurrentUser() user: AuthUser,
    @Body() body: { amount?: number; amount_yuan?: number; remark?: string },
  ) {
    return this.purchaseService.createOrder(user, body);
  }

  /** 我的购买记录 */
  @Roles('user')
  @Get('orders/mine')
  listMyOrders(@CurrentUser() user: AuthUser) {
    return this.purchaseService.listMine(user);
  }

  /** 订单详情 */
  @Roles('user')
  @Get('orders/:id')
  getOrderDetail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.purchaseService.getDetail(user, id);
  }

  /** 发起支付：channel = wechat | alipay | bankcard */
  @Roles('user')
  @Post('orders/:id/pay')
  payOrder(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { channel: PayChannel }) {
    return this.purchaseService.initiatePay(user, id, body?.channel);
  }

  /** 模拟支付确认（开发/测试环境；生产环境需 PAYMENT_MOCK=true） */
  @Roles('user')
  @Post('orders/:id/mock-pay')
  mockPay(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.purchaseService.mockPay(user, id);
  }
}

/** 支付异步回调（第三方服务器调用，公开接口，内部验签） */
@Controller('purchase/callback')
export class PurchaseCallbackController {
  constructor(private readonly purchaseService: PurchaseService) {}

  /** 微信支付 V3 异步通知，应答 JSON */
  @Public()
  @Post('wechat')
  async wechatNotify(@Req() req: Request, @Headers() headers: Record<string, any>) {
    const ok = await this.purchaseService.handleNotify('wechat', req.body as Record<string, any>, headers);
    // 微信要求失败返回非 2xx 触发重试，成功返回 code:SUCCESS
    return { code: ok ? 'SUCCESS' : 'FAIL', message: ok ? '成功' : '业务失败' };
  }

  /** 支付宝异步通知，应答纯文本 success（非 success 会触发重试） */
  @Public()
  @Post('alipay')
  async alipayNotify(@Req() req: Request, @Headers() headers: Record<string, any>) {
    const ok = await this.purchaseService.handleNotify('alipay', req.body as Record<string, any>, headers);
    return ok ? 'success' : 'fail';
  }
}
