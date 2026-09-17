import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { RepairService } from '@/repair/repair.service';
import { AuthUser, CurrentUser, Roles } from '@/auth/auth.decorators';

type OrderStatus = 'pending' | 'accepted' | 'repairing' | 'completed' | 'cancelled';

@Controller('repair')
export class RepairController {
  constructor(private readonly repairService: RepairService) {}

  /** 用户一键发起协助 */
  @Roles('user')
  @Post('orders')
  createOrder(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      category: string;
      description: string;
      address: string;
      contact_name: string;
      contact_phone: string;
      latitude: number;
      longitude: number;
    },
  ) {
    return this.repairService.createOrder(body, user);
  }

  /** 我的协助单（登录用户按身份查询，可附带手机号兼容历史单） */
  @Roles('user')
  @Get('orders/mine')
  listMyOrders(@CurrentUser() user: AuthUser, @Query('phone') phone?: string) {
    return this.repairService.listMyOrders(user, phone || undefined);
  }

  /** 附近待接单协助单（烘焙师视角，按距离升序），登录后可查 */
  @Get('orders/nearby')
  listNearbyOrders(
    @Query('lat') lat: string,
    @Query('lng') lng: string,
    @Query('radius') radius?: string,
  ) {
    const radiusNum = radius ? Number(radius) : 20;
    return this.repairService.listNearbyOrders(Number(lat), Number(lng), Number.isNaN(radiusNum) ? 20 : radiusNum);
  }

  /** 当前登录烘焙师已接订单 */
  @Roles('worker')
  @Get('orders/worker/mine')
  listMyWorkerOrders(@CurrentUser() user: AuthUser) {
    return this.repairService.listWorkerOrders(user.openid);
  }

  /** 协助单详情（本人或接单烘焙师可查看） */
  @Get('orders/:id')
  getOrderDetail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.repairService.getOrderDetail(id, user);
  }

  /** 烘焙师接单 */
  @Roles('worker')
  @Post('orders/:id/accept')
  acceptOrder(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { scheduled_at?: string },
  ) {
    return this.repairService.acceptOrder(id, user.openid, body?.scheduled_at);
  }

  /** 更新协助单状态（仅接单烘焙师本人） */
  @Roles('worker')
  @Post('orders/:id/status')
  updateOrderStatus(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { status: OrderStatus },
  ) {
    return this.repairService.updateOrderStatus(id, body.status, user.openid);
  }

  /** 撤销协助（退单）：已接单/协助中 → 待接单，订单重新开放给其他烘焙师 */
  @Roles('worker')
  @Post('orders/:id/release')
  releaseOrder(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.repairService.releaseOrder(id, user.openid);
  }

  /** 创建或更新烘焙师档案（按登录 openid 识别） */
  @Roles('worker')
  @Post('workers')
  upsertWorker(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      name: string;
      phone: string;
      trade: string;
      latitude: number;
      longitude: number;
      online?: boolean;
    },
  ) {
    return this.repairService.upsertWorker(body, user.openid);
  }

  /** 查询当前登录烘焙师的档案 */
  @Roles('worker')
  @Get('workers/mine')
  getMyWorkerProfile(@CurrentUser() user: AuthUser) {
    return this.repairService.getWorkerByOpenid(user.openid);
  }
}
