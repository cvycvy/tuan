import { View, Text } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import { listMyOrders, RepairOrder, ORDER_STATUS_TEXT } from '../../utils/api'
import { ensureLogin } from '../../stores/auth'
import './index.css'

const OrdersPage = () => {
  const [orders, setOrders] = useState<RepairOrder[]>([])
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
      const data = await listMyOrders()
      setOrders(data)
    } catch (err: any) {
      setError(err?.message || '查询失败')
    } finally {
      setLoading(false)
    }
  }

  const goDetail = (id: string) => {
    Taro.navigateTo({ url: `/pages/order-detail/index?id=${id}` })
  }

  const statusColor: Record<string, string> = {
    pending: 'bg-orange-100 text-orange-600',
    accepted: 'bg-pink-100 text-pink-600',
    repairing: 'bg-purple-100 text-purple-600',
    completed: 'bg-green-100 text-green-600',
    cancelled: 'bg-gray-100 text-gray-500'
  }

  return (
    <View className="min-h-screen bg-rose-50 pb-8">
      <View className="px-4 pt-4">
        <View className="bg-white rounded-2xl p-4 flex items-center justify-between">
          <View>
            <Text className="block text-sm font-medium text-gray-900">我的协助单</Text>
            <Text className="block text-xs text-gray-400 mt-1">查看你提交的所有烘焙协助进度</Text>
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
            <Text className="text-3xl mb-2">📭</Text>
            <Text className="text-sm text-gray-500">暂无协助记录</Text>
            <Text
              className="text-pink-500 text-sm mt-3"
              onClick={() => Taro.switchTab({ url: '/pages/index/index' })}
            >
              去发起烘焙协助 →
            </Text>
          </View>
        )}

        {orders.map(order => (
          <View
            key={order.id}
            className="bg-white rounded-2xl p-4 mt-3"
            onClick={() => goDetail(order.id)}
          >
            <View className="flex items-center justify-between mb-2">
              <Text className="text-base font-bold text-gray-900">{order.category}</Text>
              <Text className={`text-xs font-medium px-3 py-1 rounded-full ${statusColor[order.status] || 'bg-gray-100 text-gray-500'}`}>
                {ORDER_STATUS_TEXT[order.status]}
              </Text>
            </View>
            <Text className="block text-sm text-gray-600 line-clamp-2">{order.description}</Text>
            <View className="flex items-center justify-between mt-3">
              <Text className="text-xs text-gray-400">{order.address}</Text>
              <Text className="text-pink-500 text-xs">详情 →</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  )
}

export default OrdersPage
