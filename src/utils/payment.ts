import Taro from '@tarojs/taro'
import { mockPayPowderOrder, payPowderOrder, type PayChannel, type PowderOrder } from './api'

/**
 * 对指定订单发起支付并处理各渠道的客户端动作：
 * - mock：弹出模拟收银台，确认后调用 mock-pay 完成支付（返回已支付订单）
 * - wechat 真实：小程序内唤起 wx.requestPayment
 * - alipay 真实：H5 跳转支付宝收银台
 */
export async function startPayment(orderId: string, channel: PayChannel): Promise<PowderOrder | void> {
  const { payment } = await payPowderOrder(orderId, channel)

  // 模拟支付：确认后立即入账
  if (payment.mode === 'mock' && payment.mock) {
    const res = await Taro.showModal({
      title: `${payment.mock.channelText}（模拟支付）`,
      content: `支付金额：¥${payment.mock.amountYuan}\n${payment.mock.hint}`,
      confirmText: '确认支付',
      cancelText: '取消'
    })
    if (!res.confirm) {
      throw new Error('已取消支付')
    }
    const paid = await mockPayPowderOrder(orderId)
    Taro.showToast({ title: '支付成功', icon: 'success' })
    return paid
  }

  // 真实微信支付（仅微信小程序内可用）
  if (channel === 'wechat' && payment.wxJsapiParams) {
    const env = Taro.getEnv()
    if (env !== Taro.ENV_TYPE.WEAPP) {
      throw new Error('微信支付仅支持在微信小程序中使用')
    }
    await Taro.requestPayment({
      timeStamp: payment.wxJsapiParams.timeStamp,
      nonceStr: payment.wxJsapiParams.nonceStr,
      package: payment.wxJsapiParams.package,
      signType: 'RSA',
      paySign: payment.wxJsapiParams.paySign
    })
    Taro.showToast({ title: '支付成功', icon: 'success' })
    return
  }

  // 真实支付宝（H5 跳转手机网站支付）
  if (channel === 'alipay' && payment.payUrl) {
    if (typeof window !== 'undefined' && window.location) {
      window.location.href = payment.payUrl
      return
    }
    throw new Error('当前环境不支持跳转支付宝')
  }

  throw new Error('该支付方式暂不可用')
}

/** 渠道展示信息 */
export const PAY_CHANNEL_OPTIONS: { key: PayChannel; name: string; desc: string; icon: string }[] = [
  { key: 'wechat', name: '微信支付', desc: '推荐微信用户使用', icon: '💚' },
  { key: 'alipay', name: '支付宝', desc: '支持余额、花呗', icon: '🅰️' },
  { key: 'bankcard', name: '银行卡支付', desc: '支持储蓄卡 / 信用卡', icon: '💳' }
]
