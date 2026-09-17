import { View, Text } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import {
  listMyPowderOrders,
  PAY_CHANNEL_TEXT,
  POWDER_ORDER_STATUS_TEXT,
  type PayChannel,
  type PowderOrder
} from '../../utils/api'
import { ensureLogin } from '../../stores/auth'
import { PAY_CHANNEL_OPTIONS, startPayment } from '../../utils/payment'
import './index.css'

const PowderOrdersPage = () => {
  const [orders, setOrders] = useState<PowderOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useDidShow(() => {
    void loadOrders()
  })

  const loadOrders = async () => {
    setLoading(true)
    setError('')
    try {
      await ensureLogin('user')
      const data = await listMyPowderOrders()
      setOrders(data)
    } catch (err: any) {
      setError(err?.message || '查询失败')
    } finally {
      setLoading(false)
    }
  }

  /** 待支付订单继续支付：选择渠道后重新发起 */
  const handleRepay = async (order: PowderOrder) => {
    try {
      const res = await Taro.showActionSheet({
        itemList: PAY_CHANNEL_OPTIONS.map(o => o.name)
      })
      const channel: PayChannel = PAY_CHANNEL_OPTIONS[res.tapIndex]?.key
      if (!channel) return
      await startPayment(order.id, channel)
      await loadOrders()
    } catch (err: any) {
      const msg = err?.message || ''
      if (msg && msg !== '已取消支付' && !/cancel/i.test(msg)) {
        Taro.showToast({ title: msg, icon: 'none' })
      }
    }
  }

  const statusColor: Record<string, string> = {
    pending: 'bg-orange-100 text-orange-600',
    paid: 'bg-green-100 text-green-600',
    failed: 'bg-red-100 text-red-600',
    cancelled: 'bg-gray-100 text-gray-500'
  }

  const formatTime = (iso: string | null) => {
    if (!iso) return ''
    return iso.replace('T', ' ').slice(0, 16)
  }

  return (
    <View className="min-h-screen bg-rose-50 pb-8">
      <View className="px-4 pt-4">
        <View className="bg-white rounded-2xl p-4 flex items-center justify-between">
          <View>
            <Text className="block text-sm font-medium text-gray-900">预拌粉购买记录</Text>
            <Text className="block text-xs text-gray-400 mt-1">查看订单状态与支付结果</Text>
          </View>
          <Text
            className={`text-pink-500 text-sm ${loading ? 'opacity-50' : ''}`}
            onClick={loading ? undefined : loadOrders}
          >
            {loading ? '加载中' : '刷新'}
          </Text>
        </View>

        {error && <Text className="block text-sm text-red-500 mt-4">{error}</Text>}

        {loading && (
          <View className="bg-white rounded-2xl p-8 mt-4 flex items-center justify-center">
            <Text className="text-gray-400">加载中...</Text>
          </View>
        )}

        {!loading && !error && orders.length === 0 && (
          <View className="bg-white rounded-2xl p-8 mt-4 flex flex-col items-center">
            <Text className="text-3xl mb-2">🧋</Text>
            <Text className="text-sm text-gray-500">暂无购买记录</Text>
            <Text
              className="text-pink-500 text-sm mt-3"
              onClick={() => Taro.redirectTo({ url: '/pages/powder/index' })}
            >
              去购买预拌粉 →
            </Text>
          </View>
        )}

        {orders.map(order => (
          <View key={order.id} className="bg-white rounded-2xl p-4 mt-3">
            <View className="flex items-center justify-between mb-2">
              <Text className="text-base font-bold text-gray-900">{order.product_name}</Text>
              <Text className={`text-xs font-medium px-3 py-1 rounded-full ${statusColor[order.status] || 'bg-gray-100 text-gray-500'}`}>
                {POWDER_ORDER_STATUS_TEXT[order.status]}
              </Text>
            </View>

            <View className="flex items-center justify-between">
              <Text className="text-xl font-bold text-orange-500">¥{order.amount_yuan}</Text>
              <Text className="text-xs text-gray-400">
                {order.pay_channel ? PAY_CHANNEL_TEXT[order.pay_channel] : '未选择支付方式'}
              </Text>
            </View>

            <View className="border-t border-gray-100 mt-3 pt-3">
              <Text className="block text-xs text-gray-400">订单号：{order.order_no}</Text>
              <Text className="block text-xs text-gray-400 mt-1">
                下单时间：{formatTime(order.created_at)}
              </Text>
              {order.paid_at && (
                <Text className="block text-xs text-gray-400 mt-1">
                  支付时间：{formatTime(order.paid_at)}
                </Text>
              )}
            </View>

            {order.status === 'pending' && (
              <View
                className="mt-3 bg-pink-500 text-white text-center text-sm font-medium py-3 rounded-xl"
                onClick={() => handleRepay(order)}
              >
                继续支付 ¥{order.amount_yuan}
              </View>
            )}
          </View>
        ))}

        <Text
          className="block text-center text-xs text-pink-500 mt-6"
          onClick={() => Taro.redirectTo({ url: '/pages/powder/index' })}
        >
          再去购买 →
        </Text>
      </View>
    </View>
  )
}

export default PowderOrdersPage
