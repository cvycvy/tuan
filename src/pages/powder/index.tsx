import { View, Text } from '@tarojs/components'
import { Input } from '@/components/ui/input'
import Taro, { useLoad } from '@tarojs/taro'
import { useState } from 'react'
import { createPowderOrder, type PayChannel } from '../../utils/api'
import { ensureLogin } from '../../stores/auth'
import { PAY_CHANNEL_OPTIONS, startPayment } from '../../utils/payment'
import './index.css'

const QUICK_AMOUNTS = [10, 20, 50, 100]

const PowderPage = () => {
  const [amountText, setAmountText] = useState('')
  const [channel, setChannel] = useState<PayChannel>('wechat')
  const [submitting, setSubmitting] = useState(false)

  useLoad(() => {
    ensureLogin('user').catch(() => {})
  })

  const parsedAmount = Number(amountText)
  const amountValid = Number.isFinite(parsedAmount) && parsedAmount >= 0.01 && parsedAmount <= 900000

  const handleAmountInput = (value: string) => {
    // 仅允许数字和小数点，最多两位小数
    const v = value.replace(/[^\d.]/g, '')
    const parts = v.split('.')
    if (parts.length > 2) {
      setAmountText(`${parts[0]}.${parts.slice(1).join('')}`)
      return
    }
    if (parts[1] && parts[1].length > 2) {
      setAmountText(`${parts[0]}.${parts[1].slice(0, 2)}`)
      return
    }
    setAmountText(v)
  }

  const handleSubmit = async () => {
    if (submitting) return
    if (!amountText || !amountValid) {
      Taro.showToast({ title: '请输入正确的金额（0.01~900000）', icon: 'none' })
      return
    }
    setSubmitting(true)
    try {
      await ensureLogin('user')
      // 微信 JSAPI 单笔上限约 10 万元，超过请引导用户换支付宝/银行卡
      if (channel === 'wechat' && parsedAmount > 99999.99) {
        Taro.showToast({ title: '微信支付单笔上限约10万，请改用支付宝或银行卡', icon: 'none' })
        return
      }
      // 直接传元（后端 purchase.service 内部会统一转分存储）
      const order = await createPowderOrder(Number(parsedAmount.toFixed(2)))
      await startPayment(order.id, channel)
      // 支付完成后跳转购买记录
      Taro.redirectTo({ url: '/pages/powder-orders/index' })
    } catch (err: any) {
      const msg = err?.message || '支付失败'
      if (msg !== '已取消支付') {
        Taro.showToast({ title: msg, icon: 'none' })
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <View className="min-h-screen bg-rose-50 pb-10">
      {/* 商品信息 */}
      <View className="bg-gradient-to-br from-pink-500 to-rose-400 px-6 pt-10 pb-12 rounded-b-3xl">
        <Text className="block text-white text-2xl font-bold">购买预拌粉</Text>
        <Text className="block text-pink-100 text-sm mt-2">
          自定义金额 · 支持微信、支付宝、银行卡支付
        </Text>
      </View>

      {/* 商品卡片 */}
      <View className="px-4 -mt-6">
        <View className="bg-white rounded-2xl shadow-md p-5 flex items-center gap-4">
          <View className="w-16 h-16 rounded-2xl bg-orange-100 flex items-center justify-center">
            <Text className="text-3xl">🧁</Text>
          </View>
          <View className="flex-1">
            <Text className="block text-base font-bold text-gray-900">蛋糕预拌粉</Text>
            <Text className="block text-xs text-gray-400 mt-1">优质原料预拌，开袋即用</Text>
            <Text className="block text-xs text-orange-500 mt-1">按填写金额下单</Text>
          </View>
        </View>
      </View>

      {/* 金额填写 */}
      <View className="px-4 mt-4">
        <View className="bg-white rounded-2xl p-5">
          <Text className="block text-sm font-medium text-gray-900 mb-3">购买金额</Text>

          <View className="flex items-center bg-gray-50 rounded-xl px-4 py-4">
            <Text className="text-2xl font-bold text-gray-900 mr-2">¥</Text>
            <Input
              className="w-auto flex-1 h-auto border-0 bg-transparent px-0 py-0 text-2xl font-bold text-gray-900 focus-within:border-0 focus-within:ring-0"
              type="digit"
              placeholder="请输入金额"
              placeholderStyle="color:#d1d5db"
              value={amountText}
              onInput={e => handleAmountInput(e.detail.value)}
            />
          </View>

          {/* 快捷金额 */}
          <View className="grid grid-cols-4 gap-2 mt-3">
            {QUICK_AMOUNTS.map(v => (
              <View
                key={v}
                className={`text-center text-sm py-2 rounded-xl border ${
                  Number(amountText) === v
                    ? 'border-pink-500 text-pink-500 bg-pink-50 font-medium'
                    : 'border-gray-200 text-gray-600'
                }`}
                onClick={() => setAmountText(String(v))}
              >
                ¥{v}
              </View>
            ))}
          </View>
          <Text className="block text-xs text-gray-400 mt-3">单笔金额 0.01 ~ 900000 元（超 10 万请用支付宝或银行卡）</Text>
        </View>
      </View>

      {/* 支付方式 */}
      <View className="px-4 mt-4">
        <View className="bg-white rounded-2xl p-5">
          <Text className="block text-sm font-medium text-gray-900 mb-3">选择支付方式</Text>
          {PAY_CHANNEL_OPTIONS.map(opt => (
            <View
              key={opt.key}
              className="flex items-center py-3"
              onClick={() => setChannel(opt.key)}
            >
              <Text className="text-2xl mr-3">{opt.icon}</Text>
              <View className="flex-1">
                <Text className="block text-sm font-medium text-gray-900">{opt.name}</Text>
                <Text className="block text-xs text-gray-400 mt-1">{opt.desc}</Text>
              </View>
              <View
                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                  channel === opt.key ? 'border-pink-500' : 'border-gray-300'
                }`}
              >
                {channel === opt.key && <View className="w-3 h-3 rounded-full bg-pink-500" />}
              </View>
            </View>
          ))}
        </View>
      </View>

      {/* 提交按钮 */}
      <View className="px-4 mt-6">
        <View
          className={`text-white text-center text-base font-medium py-4 rounded-2xl ${
            submitting || !amountValid ? 'bg-gray-300' : 'bg-pink-500'
          }`}
          onClick={handleSubmit}
        >
          {submitting
            ? '正在发起支付...'
            : amountValid
              ? `确认支付 ¥${parsedAmount.toFixed(2)}`
              : '确认支付'}
        </View>
        <Text
          className="block text-center text-xs text-pink-500 mt-4"
          onClick={() => Taro.navigateTo({ url: '/pages/powder-orders/index' })}
        >
          查看购买记录 →
        </Text>
      </View>
    </View>
  )
}

export default PowderPage
