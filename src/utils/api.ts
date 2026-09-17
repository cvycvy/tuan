import { Network } from '../network'
import { clearSession, type LoginRole } from './token'

export interface RepairOrder {
  id: string
  category: string
  description: string
  address: string
  contact_name: string
  contact_phone: string
  latitude: number
  longitude: number
  status: 'pending' | 'accepted' | 'repairing' | 'completed' | 'cancelled'
  user_id?: string | null
  worker_id: string | null
  scheduled_at: string | null
  created_at: string
  updated_at: string | null
  distance_km?: number
  worker?: RepairWorker | null
}

export interface RepairWorker {
  id: string
  name: string
  phone: string
  trade: string
  latitude: number
  longitude: number
  online: boolean
  wx_openid?: string | null
  created_at: string
}

export interface LoginResult {
  token: string
  openid: string
  role: LoginRole
  profile_completed: boolean
}

export const ORDER_STATUS_TEXT: Record<RepairOrder['status'], string> = {
  pending: '待接单',
  accepted: '已接单',
  repairing: '协助中',
  completed: '已完成',
  cancelled: '已取消'
}

export const ORDER_CATEGORIES = [
  '配方配比指导',
  '预拌粉选购建议',
  '烘焙操作教学',
  '打发与发酵指导',
  '烤箱温控指导',
  '成品问题补救',
  '裱花装饰协助',
  '其他烘焙协助'
]

export const WORKER_TRADES = [
  '蛋糕烘焙师',
  '面包烘焙师',
  '甜品西点师',
  '裱花装饰师',
  '健康烘焙顾问',
  '家庭烘焙顾问',
  '综合烘焙师'
]

function parseError(err: any): Error {
  // 登录态失效：清除本地会话，页面会在下次调用 ensureLogin 时重新登录
  if (err?.statusCode === 401) {
    clearSession()
    return new Error('登录已过期，请重试')
  }
  if (err?.data?.message) return new Error(err.data.message)
  if (err?.errMsg) return new Error(String(err.errMsg))
  if (err?.message) return new Error(String(err.message))
  return new Error('网络异常，请稍后重试')
}

/** 小程序登录：wx.login code 换 JWT */
export async function wxLogin(code: string, role: LoginRole): Promise<LoginResult> {
  try {
    const res = await Network.request({
      url: '/api/auth/wx-login',
      method: 'POST',
      data: { code, role }
    })
    return res.data as LoginResult
  } catch (err) {
    throw parseError(err)
  }
}

/** H5 开发态调试登录（仅非生产环境后端可用） */
export async function devLogin(role: LoginRole): Promise<LoginResult> {
  try {
    const res = await Network.request({
      url: '/api/auth/dev-login',
      method: 'POST',
      data: { role }
    })
    return res.data as LoginResult
  } catch (err) {
    throw parseError(err)
  }
}

/** 一键协助 */
export async function createOrder(payload: {
  category: string
  description: string
  address: string
  contact_name: string
  contact_phone: string
  latitude: number
  longitude: number
}): Promise<RepairOrder> {
  try {
    const res = await Network.request({
      url: '/api/repair/orders',
      method: 'POST',
      data: payload
    })
    return res.data as RepairOrder
  } catch (err) {
    throw parseError(err)
  }
}

/** 我的协助单（按登录身份，可附带手机号兼容历史单） */
export async function listMyOrders(phone?: string): Promise<RepairOrder[]> {
  try {
    const query = phone ? `?phone=${encodeURIComponent(phone)}` : ''
    const res = await Network.request({
      url: `/api/repair/orders/mine${query}`,
      method: 'GET'
    })
    return res.data as RepairOrder[]
  } catch (err) {
    throw parseError(err)
  }
}

/** 附近待接单协助单（协助员视角） */
export async function listNearbyOrders(lat: number, lng: number, radius = 20): Promise<RepairOrder[]> {
  try {
    const res = await Network.request({
      url: `/api/repair/orders/nearby?lat=${lat}&lng=${lng}&radius=${radius}`,
      method: 'GET'
    })
    return res.data as RepairOrder[]
  } catch (err) {
    throw parseError(err)
  }
}

/** 当前登录协助员已接订单 */
export async function listWorkerOrders(): Promise<RepairOrder[]> {
  try {
    const res = await Network.request({
      url: '/api/repair/orders/worker/mine',
      method: 'GET'
    })
    return res.data as RepairOrder[]
  } catch (err) {
    throw parseError(err)
  }
}

/** 协助单详情 */
export async function getOrderDetail(id: string): Promise<RepairOrder> {
  try {
    const res = await Network.request({
      url: `/api/repair/orders/${id}`,
      method: 'GET'
    })
    return res.data as RepairOrder
  } catch (err) {
    throw parseError(err)
  }
}

/** 协助员接单 */
export async function acceptOrder(id: string, scheduledAt?: string): Promise<RepairOrder> {
  try {
    const res = await Network.request({
      url: `/api/repair/orders/${id}/accept`,
      method: 'POST',
      data: { scheduled_at: scheduledAt }
    })
    return res.data as RepairOrder
  } catch (err) {
    throw parseError(err)
  }
}

/** 更新协助单状态 */
export async function updateOrderStatus(
  id: string,
  status: RepairOrder['status']
): Promise<RepairOrder> {
  try {
    const res = await Network.request({
      url: `/api/repair/orders/${id}/status`,
      method: 'POST',
      data: { status }
    })
    return res.data as RepairOrder
  } catch (err) {
    throw parseError(err)
  }
}

/** 撤销协助（退单）：订单回到待接单池，其他师傅可重新接单 */
export async function releaseOrder(id: string): Promise<RepairOrder> {
  try {
    const res = await Network.request({
      url: `/api/repair/orders/${id}/release`,
      method: 'POST'
    })
    return res.data as RepairOrder
  } catch (err) {
    throw parseError(err)
  }
}

/** 创建或更新协助员档案 */
export async function upsertWorker(payload: {
  name: string
  phone: string
  trade: string
  latitude: number
  longitude: number
  online?: boolean
}): Promise<RepairWorker> {
  try {
    const res = await Network.request({
      url: '/api/repair/workers',
      method: 'POST',
      data: payload
    })
    return res.data as RepairWorker
  } catch (err) {
    throw parseError(err)
  }
}

/** 查询当前登录协助员档案（未完善时返回 null） */
export async function getMyWorkerProfile(): Promise<RepairWorker | null> {
  try {
    const res = await Network.request({
      url: '/api/repair/workers/mine',
      method: 'GET'
    })
    return res.data as RepairWorker | null
  } catch (err) {
    throw parseError(err)
  }
}

// ============================== 预拌粉购买 ==============================

export type PayChannel = 'wechat' | 'alipay' | 'bankcard'

export interface PowderOrder {
  id: string
  order_no: string
  user_id: string | null
  product_name: string
  amount_fen: number
  amount_yuan: string
  pay_channel: PayChannel | null
  status: 'pending' | 'paid' | 'failed' | 'cancelled'
  transaction_no: string | null
  remark: string | null
  paid_at: string | null
  created_at: string
  updated_at: string | null
}

export interface WxJsapiParams {
  timeStamp: string
  nonceStr: string
  package: string
  signType: 'RSA'
  paySign: string
}

export interface PaymentResult {
  mode: 'mock' | 'real'
  channel: PayChannel
  wxJsapiParams?: WxJsapiParams
  payUrl?: string
  mock?: {
    channelText: string
    amountYuan: string
    hint: string
  }
}

export const POWDER_ORDER_STATUS_TEXT: Record<PowderOrder['status'], string> = {
  pending: '待支付',
  paid: '已支付',
  failed: '支付失败',
  cancelled: '已取消'
}

export const PAY_CHANNEL_TEXT: Record<PayChannel, string> = {
  wechat: '微信支付',
  alipay: '支付宝',
  bankcard: '银行卡支付'
}

/** 创建预拌粉购买订单（金额单位：元） */
export async function createPowderOrder(amountYuan: number, remark?: string): Promise<PowderOrder> {
  try {
    const res = await Network.request({
      url: '/api/purchase/powder/orders',
      method: 'POST',
      data: { amount_yuan: amountYuan, remark }
    })
    return res.data as PowderOrder
  } catch (err) {
    throw parseError(err)
  }
}

/** 发起支付，返回支付参数（模拟支付 / 微信 JSAPI / 支付宝跳转） */
export async function payPowderOrder(
  id: string,
  channel: PayChannel
): Promise<{ order: PowderOrder; payment: PaymentResult }> {
  try {
    const res = await Network.request({
      url: `/api/purchase/powder/orders/${id}/pay`,
      method: 'POST',
      data: { channel }
    })
    return res.data as { order: PowderOrder; payment: PaymentResult }
  } catch (err) {
    throw parseError(err)
  }
}

/** 模拟支付确认（开发/测试环境） */
export async function mockPayPowderOrder(id: string): Promise<PowderOrder> {
  try {
    const res = await Network.request({
      url: `/api/purchase/powder/orders/${id}/mock-pay`,
      method: 'POST'
    })
    return res.data as PowderOrder
  } catch (err) {
    throw parseError(err)
  }
}

/** 我的购买记录 */
export async function listMyPowderOrders(): Promise<PowderOrder[]> {
  try {
    const res = await Network.request({
      url: '/api/purchase/powder/orders/mine',
      method: 'GET'
    })
    return res.data as PowderOrder[]
  } catch (err) {
    throw parseError(err)
  }
}

/** 购买订单详情 */
export async function getPowderOrder(id: string): Promise<PowderOrder> {
  try {
    const res = await Network.request({
      url: `/api/purchase/powder/orders/${id}`,
      method: 'GET'
    })
    return res.data as PowderOrder
  } catch (err) {
    throw parseError(err)
  }
}
