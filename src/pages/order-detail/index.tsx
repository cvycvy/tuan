import { View, Text } from '@tarojs/components'
import Taro, { useLoad, useRouter } from '@tarojs/taro'
import { useState } from 'react'
import { getOrderDetail, updateOrderStatus, releaseOrder, RepairOrder, ORDER_STATUS_TEXT } from '../../utils/api'
import { ensureLogin, useAuthStore } from '../../stores/auth'
import './index.css'

const OrderDetailPage = () => {
  const router = useRouter()
  const role = useAuthStore(state => state.role)
  const [order, setOrder] = useState<RepairOrder | null>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [error, setError] = useState('')

  const loadDetail = async (id: string) => {
    const data = await getOrderDetail(id)
    setOrder(data)
  }

  useLoad(async () => {
    const id = router.params.id
    if (!id) {
      setError('缺少订单参数')
      setLoading(false)
      return
    }
    try {
      // 保持进入时的角色（从师傅页进入为 worker，从用户页进入为 user）
      await ensureLogin(role ?? 'user')
      await loadDetail(id)
    } catch (err: any) {
      setError(err?.message || '加载失败')
    } finally {
      setLoading(false)
    }
  })

  const callPhone = (phone: string) => {
    if (!phone) return
    Taro.makePhoneCall({ phoneNumber: phone })
  }

  /** 师傅流转状态：已接单 → 协助中 → 已完成 */
  const handleWorkerAction = async (next: 'repairing' | 'completed') => {
    if (!order) return
    if (next === 'completed') {
      const res = await Taro.showModal({
        title: '完成协助',
        content: `确认「${order.category}」本次协助已全部完成？完成后订单将归档，无法再修改状态。`,
        confirmText: '确认完成',
        confirmColor: '#16a34a'
      })
      if (!res.confirm) return
    }
    setUpdating(true)
    try {
      await ensureLogin('worker')
      await updateOrderStatus(order.id, next)
      Taro.showToast({ title: next === 'repairing' ? '已开始协助' : '协助已完成', icon: 'success' })
      await loadDetail(order.id)
    } catch (err: any) {
      Taro.showToast({ title: err?.message || '状态更新失败', icon: 'none' })
    } finally {
      setUpdating(false)
    }
  }

  /** 撤销协助（退单）：订单回到待接单池 */
  const handleRelease = async () => {
    if (!order) return
    const res = await Taro.showModal({
      title: '撤销协助',
      content:
        order.status === 'repairing'
          ? '该订单已在协助中，确认撤销？撤销后订单将重新开放给其他烘焙师接单，你的协助记录将中止。'
          : '确认撤销本次协助？撤销后订单将重新开放给其他烘焙师接单。',
      confirmText: '确认撤销',
      confirmColor: '#dc2626'
    })
    if (!res.confirm) return
    setUpdating(true)
    try {
      await ensureLogin('worker')
      const released = await releaseOrder(order.id)
      Taro.showToast({ title: '已撤销协助', icon: 'success' })
      setOrder(released)
    } catch (err: any) {
      Taro.showToast({ title: err?.message || '撤销失败', icon: 'none' })
    } finally {
      setUpdating(false)
    }
  }

  const statusColor: Record<string, string> = {
    pending: 'bg-orange-100 text-orange-600',
    accepted: 'bg-pink-100 text-pink-500',
    repairing: 'bg-purple-100 text-purple-600',
    completed: 'bg-green-100 text-green-600',
    cancelled: 'bg-gray-100 text-gray-500'
  }

  if (loading) {
    return (
      <View className="min-h-screen bg-rose-50 flex items-center justify-center">
        <Text className="text-gray-400">加载中...</Text>
      </View>
    )
  }

  if (error || !order) {
    return (
      <View className="min-h-screen bg-rose-50 flex items-center justify-center">
        <Text className="text-red-500">{error || '订单不存在'}</Text>
      </View>
    )
  }

  const isWorker = role === 'worker'
  const steps = [
    { key: 'pending', label: '待接单' },
    { key: 'accepted', label: '已接单' },
    { key: 'repairing', label: '协助中' },
    { key: 'completed', label: '已完成' }
  ]
  const currentStepIndex = steps.findIndex(s => s.key === order.status)

  return (
    <View className="min-h-screen bg-rose-50 pb-8">
      {/* 状态卡 */}
      <View className="bg-white px-4 pt-4 pb-5">
        <View className="flex items-center justify-between">
          <Text className="text-lg font-bold text-gray-900">{order.category}</Text>
          <Text className={`text-xs font-medium px-3 py-1 rounded-full ${statusColor[order.status] || 'bg-gray-100 text-gray-500'}`}>
            {ORDER_STATUS_TEXT[order.status]}
          </Text>
        </View>
        <Text className="block text-sm text-gray-600 mt-2">{order.description}</Text>
        <Text className="block text-xs text-gray-400 mt-2">提交时间：{order.created_at?.replace('T', ' ').slice(0, 16)}</Text>
      </View>

      {/* 进度条 */}
      {order.status !== 'cancelled' && (
        <View className="bg-white px-4 py-4 mt-3">
          <View className="flex items-center">
            {steps.map((step, idx) => (
              <View key={step.key} className="flex items-center flex-1 last:flex-none">
                <View className="flex flex-col items-center">
                  <View
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                      idx <= currentStepIndex ? 'bg-pink-500 text-white' : 'bg-gray-200 text-gray-400'
                    }`}
                  >
                    {idx + 1}
                  </View>
                  <Text className={`text-xs mt-1 ${idx <= currentStepIndex ? 'text-pink-500 font-medium' : 'text-gray-400'}`}>
                    {step.label}
                  </Text>
                </View>
                {idx < steps.length - 1 && (
                  <View className={`flex-1 h-1 mx-1 mt-0 ${idx < currentStepIndex ? 'bg-pink-500' : 'bg-gray-200'}`} />
                )}
              </View>
            ))}
          </View>
        </View>
      )}

      {/* 协助信息 */}
      <View className="bg-white rounded-2xl p-4 mt-3 mx-4">
        <Text className="block text-sm font-medium text-gray-900 mb-3">协助信息</Text>
        <View className="flex gap-2 mb-2">
          <Text className="text-xs text-gray-400 w-16 shrink-0">所在地址</Text>
          <Text className="text-sm text-gray-700 flex-1">{order.address}</Text>
        </View>
        {order.scheduled_at && (
          <View className="flex gap-2 mb-2">
            <Text className="text-xs text-gray-400 w-16 shrink-0">约定时间</Text>
            <Text className="text-sm text-gray-700 flex-1">{order.scheduled_at.replace('T', ' ').slice(0, 16)}</Text>
          </View>
        )}
        <View className="flex gap-2">
          <Text className="text-xs text-gray-400 w-16 shrink-0">联系人</Text>
          <Text className="text-sm text-gray-700 flex-1">{order.contact_name} · {order.contact_phone}</Text>
        </View>
      </View>

      {/* 接单烘焙师信息（求助者视角展示，可拨打电话） */}
      {order.worker && !isWorker && (
        <View className="bg-white rounded-2xl p-4 mt-3 mx-4">
          <Text className="block text-sm font-medium text-gray-900 mb-3">接单烘焙师</Text>
          <View className="flex items-center justify-between">
            <View className="flex items-center gap-3">
              <View className="w-11 h-11 rounded-full bg-pink-100 flex items-center justify-center">
                <Text className="text-pink-500 font-bold text-lg">👩‍🍳</Text>
              </View>
              <View>
                <Text className="block text-sm font-medium text-gray-900">{order.worker.name}</Text>
                <Text className="block text-xs text-gray-500 mt-1">{order.worker.trade} · {order.worker.phone}</Text>
              </View>
            </View>
            <View
              className="bg-pink-500 text-white text-sm font-medium px-4 py-2 rounded-full"
              onClick={() => callPhone(order.worker!.phone)}
            >
              打电话
            </View>
          </View>
        </View>
      )}

      {/* 师傅操作区：联系求助者 + 状态流转 */}
      {isWorker && (order.status === 'accepted' || order.status === 'repairing') && (
        <View className="bg-white rounded-2xl p-4 mt-3 mx-4">
          <Text className="block text-sm font-medium text-gray-900 mb-3">
            {order.status === 'accepted' ? '订单已接单，烘焙师将联系你约定指导时间' : '协助进行中，完成后请及时归档'}
          </Text>
          <View className="flex items-center gap-3">
            <View
              className="flex-1 text-center text-sm font-medium text-pink-500 border border-pink-500 rounded-full py-3"
              onClick={() => callPhone(order.contact_phone)}
            >
              电话联系求助者
            </View>
            {order.status === 'accepted' ? (
              <View
                className={`flex-1 text-center text-sm font-medium text-white bg-purple-600 rounded-full py-3 ${updating ? 'opacity-60' : ''}`}
                onClick={() => !updating && handleWorkerAction('repairing')}
              >
                {updating ? '处理中...' : '开始协助'}
              </View>
            ) : (
              <View
                className={`flex-1 text-center text-sm font-medium text-white bg-green-600 rounded-full py-3 ${updating ? 'opacity-60' : ''}`}
                onClick={() => !updating && handleWorkerAction('completed')}
              >
                {updating ? '提交中...' : '完成协助'}
              </View>
            )}
          </View>
          <View
            className={`text-center text-xs text-red-500 mt-4 ${updating ? 'opacity-50' : ''}`}
            onClick={() => !updating && handleRelease()}
          >
            撤销协助，将订单退回待接单
          </View>
        </View>
      )}

      {/* 待接单提示 */}
      {order.status === 'pending' && (
        <View className="mx-4 mt-3">
          <View className="bg-orange-50 rounded-2xl p-4">
            <Text className="block text-sm text-orange-700">
              {isWorker
                ? '↩️ 已撤销协助，订单已退回待接单池，可由其他烘焙师重新接单'
                : '⏳ 已提交协助，正在等待附近烘焙师接单，请保持手机畅通'}
            </Text>
          </View>
        </View>
      )}

      {/* 已完成提示 */}
      {order.status === 'completed' && (
        <View className="mx-4 mt-3">
          <View className="bg-green-50 rounded-2xl p-4">
            <Text className="block text-sm text-green-700">✅ 本次协助已完成，感谢使用</Text>
          </View>
        </View>
      )}

      <View className="mx-4 mt-5">
        <Text
          className="block text-center text-gray-400 text-sm py-3"
          onClick={() => Taro.navigateBack()}
        >
          ← 返回
        </Text>
      </View>
    </View>
  )
}

export default OrderDetailPage
