import { View, Text, Picker } from '@tarojs/components'
import { Input } from '@/components/ui/input'
import Taro, { useDidShow } from '@tarojs/taro'
import { useEffect, useRef, useState } from 'react'
import {
  listNearbyOrders,
  listWorkerOrders,
  acceptOrder,
  updateOrderStatus,
  releaseOrder,
  upsertWorker,
  getMyWorkerProfile,
  RepairOrder,
  RepairWorker,
  ORDER_STATUS_TEXT,
  WORKER_TRADES
} from '../../utils/api'
import { getCurrentLocation, isValidCoord, GeoLocation } from '../../utils/location'
import { ensureLogin, useAuthStore } from '../../stores/auth'
import './index.css'

const WorkerPage = () => {
  const [tab, setTab] = useState<'nearby' | 'mine' | 'profile'>('nearby')
  const [loc, setLoc] = useState<GeoLocation | null>(null)
  const [locating, setLocating] = useState(false)
  const [locError, setLocError] = useState('')

  // 档案
  const [worker, setWorker] = useState<RepairWorker | null>(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [tradeIdx, setTradeIdx] = useState(0)
  const [online, setOnline] = useState(true)
  const [profileSaved, setProfileSaved] = useState(false)

  // 附近订单
  const [nearbyOrders, setNearbyOrders] = useState<RepairOrder[]>([])
  const [nearbyLoading, setNearbyLoading] = useState(false)
  const [nearbyError, setNearbyError] = useState('')

  // 我的接单
  const [myOrders, setMyOrders] = useState<RepairOrder[]>([])
  const [myOrdersLoading, setMyOrdersLoading] = useState(false)
  const [statusUpdatingId, setStatusUpdatingId] = useState('')

  const refreshLocation = async () => {
    setLocating(true)
    setLocError('')
    try {
      const geo = await getCurrentLocation()
      setLoc(geo)
      return geo
    } catch (err: any) {
      setLocError(err?.message || '定位失败')
      return null
    } finally {
      setLocating(false)
    }
  }

  const loadNearby = async (geo?: GeoLocation) => {
    const g = geo || loc
    if (!g || !isValidCoord(g.latitude, g.longitude)) {
      const fresh = await refreshLocation()
      if (!fresh) return
      setNearbyLoading(true)
      try {
        const orders = await listNearbyOrders(fresh.latitude, fresh.longitude)
        setNearbyOrders(orders)
        setNearbyError('')
      } catch (err: any) {
        setNearbyError(err?.message || '加载附近订单失败')
      } finally {
        setNearbyLoading(false)
      }
      return
    }
    setNearbyLoading(true)
    try {
      const orders = await listNearbyOrders(g.latitude, g.longitude)
      setNearbyOrders(orders)
      setNearbyError('')
    } catch (err: any) {
      setNearbyError(err?.message || '加载附近订单失败')
    } finally {
      setNearbyLoading(false)
    }
  }

  const loadMyOrders = async (currentWorker?: RepairWorker | null) => {
    const wRef = currentWorker !== undefined ? currentWorker : worker
    if (!wRef) return
    setMyOrdersLoading(true)
    try {
      const orders = await listWorkerOrders()
      setMyOrders(orders)
    } catch (err: any) {
      Taro.showToast({ title: err?.message || '加载失败', icon: 'none' })
    } finally {
      setMyOrdersLoading(false)
    }
  }

  const loadProfile = async (): Promise<RepairWorker | null> => {
    try {
      const w = await getMyWorkerProfile()
      if (w) {
        setWorker(w)
        setProfileSaved(true)
        setName(w.name)
        setPhone(w.phone)
        setTradeIdx(Math.max(0, WORKER_TRADES.indexOf(w.trade)))
        setOnline(w.online)
      } else {
        setWorker(null)
        setProfileSaved(false)
      }
      return w
    } catch (err: any) {
      Taro.showToast({ title: err?.message || '查询档案失败', icon: 'none' })
      return null
    }
  }

  useEffect(() => {
    const init = async () => {
      try {
        await ensureLogin('worker')
      } catch (err: any) {
        setNearbyError(err?.message || '登录失败')
        return
      }
      const w = await loadProfile()
      await loadNearby()
      if (w) {
        loadMyOrders(w)
      }
    }
    void init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // tabBar 页面常驻，从“我的协助”（user 态）等切回本页时会话可能已变成 user，
  // 每次显示都校正为 worker；角色发生切换时重新拉取师傅档案与已接订单
  const firstShow = useRef(true)
  useDidShow(() => {
    if (firstShow.current) {
      firstShow.current = false
      return
    }
    const prevRole = useAuthStore.getState().role
    void ensureLogin('worker')
      .then(() => {
        if (prevRole !== 'worker') {
          void loadProfile().then(w => {
            if (w) loadMyOrders(w)
          })
        }
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  })

  const switchTab = (t: 'nearby' | 'mine' | 'profile') => {
    setTab(t)
    if (t === 'nearby' && nearbyOrders.length === 0 && !locError) {
      loadNearby()
    }
    if (t === 'mine' && worker) {
      loadMyOrders()
    }
    if (t === 'profile') {
      loadProfile()
    }
  }

  const handleAccept = async (orderId: string) => {
    if (!worker) {
      Taro.showToast({ title: '请先在“我的档案”注册成为烘焙师', icon: 'none' })
      setTab('profile')
      return
    }
    if (!isValidCoord(loc?.latitude, loc?.longitude)) {
      Taro.showToast({ title: '请先获取定位', icon: 'none' })
      return
    }
    try {
      // 关键操作前再次确保 worker 身份（防止会话被用户页覆盖）
      await ensureLogin('worker')
      await acceptOrder(orderId)
      Taro.showToast({ title: '接单成功，请尽快联系求助者', icon: 'success' })
      loadNearby()
      loadMyOrders()
    } catch (err: any) {
      Taro.showToast({ title: err?.message || '接单失败', icon: 'none' })
    }
  }

  /** 状态流转：已接单 → 协助中 → 已完成 */
  const handleUpdateStatus = async (order: RepairOrder, next: 'repairing' | 'completed') => {
    if (next === 'completed') {
      const res = await Taro.showModal({
        title: '完成协助',
        content: `确认「${order.category}」本次协助已全部完成？完成后订单将归档，无法再修改状态。`,
        confirmText: '确认完成',
        confirmColor: '#16a34a'
      })
      if (!res.confirm) return
    }
    setStatusUpdatingId(order.id)
    try {
      await ensureLogin('worker')
      await updateOrderStatus(order.id, next)
      Taro.showToast({ title: next === 'repairing' ? '已开始协助' : '协助已完成', icon: 'success' })
      await loadMyOrders()
    } catch (err: any) {
      Taro.showToast({ title: err?.message || '状态更新失败', icon: 'none' })
    } finally {
      setStatusUpdatingId('')
    }
  }

  const callContact = (phoneNumber: string) => {
    if (!phoneNumber) return
    Taro.makePhoneCall({ phoneNumber })
  }

  /** 撤销协助（退单）：订单回到待接单池；协助中退单需强提示 */
  const handleRelease = async (order: RepairOrder) => {
    const res = await Taro.showModal({
      title: '撤销协助',
      content:
        order.status === 'repairing'
          ? `该订单已在协助中，确认撤销？撤销后订单将重新开放给其他烘焙师接单，你的协助记录将中止。`
          : `确认撤销「${order.category}」的协助？撤销后订单将重新开放给其他烘焙师接单。`,
      confirmText: '确认撤销',
      confirmColor: '#dc2626'
    })
    if (!res.confirm) return
    setStatusUpdatingId(order.id)
    try {
      await ensureLogin('worker')
      await releaseOrder(order.id)
      Taro.showToast({ title: '已撤销协助', icon: 'success' })
      await loadMyOrders()
      loadNearby()
    } catch (err: any) {
      Taro.showToast({ title: err?.message || '撤销失败', icon: 'none' })
    } finally {
      setStatusUpdatingId('')
    }
  }

  const handleSaveProfile = async () => {
    if (!name.trim()) {
      Taro.showToast({ title: '请填写姓名', icon: 'none' })
      return
    }
    if (!/^1\d{10}$/.test(phone)) {
      Taro.showToast({ title: '请填写正确的手机号', icon: 'none' })
      return
    }
    if (!isValidCoord(loc?.latitude, loc?.longitude)) {
      const fresh = await refreshLocation()
      if (!fresh) {
        Taro.showToast({ title: '请先获取定位', icon: 'none' })
        return
      }
    }
    try {
      // 保存前确保 worker 身份
      await ensureLogin('worker')
      const w = await upsertWorker({
        name: name.trim(),
        phone,
        trade: WORKER_TRADES[tradeIdx],
        latitude: loc!.latitude,
        longitude: loc!.longitude,
        online
      })
      setWorker(w)
      setProfileSaved(true)
      Taro.showToast({ title: '档案已保存', icon: 'success' })
      loadMyOrders(w)
    } catch (err: any) {
      Taro.showToast({ title: err?.message || '保存失败', icon: 'none' })
    }
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
      {/* Tab 切换 */}
      <View className="bg-white px-4 pt-3">
        <View className="flex border-b border-gray-100">
          {([
            ['nearby', '附近接单'],
            ['mine', '我的接单'],
            ['profile', '我的档案']
          ] as const).map(([key, label]) => (
            <View
              key={key}
              className={`flex-1 text-center text-sm pb-3 ${tab === key ? 'text-pink-500 font-bold border-b-2 border-pink-500' : 'text-gray-500'}`}
              onClick={() => switchTab(key)}
            >
              {label}
            </View>
          ))}
        </View>
      </View>

      {/* 附近接单 */}
      {tab === 'nearby' && (
        <View className="px-4 pt-4">
          <View className="flex items-center justify-between mb-3">
            <Text className="text-sm font-medium text-gray-900">附近待接烘焙协助</Text>
            <View className="flex items-center gap-2">
              {loc && (
                <Text className="text-xs text-gray-400">
                  {loc.latitude.toFixed(4)}, {loc.longitude.toFixed(4)}
                </Text>
              )}
              <Text
                className={`text-pink-500 text-xs ${locating ? 'opacity-50' : ''}`}
                onClick={() => loadNearby()}
              >
                {locating ? '定位中' : '刷新定位'}
              </Text>
            </View>
          </View>

          {locError && <Text className="block text-xs text-red-500 mb-3">{locError}</Text>}
          {nearbyError && <Text className="block text-xs text-red-500 mb-3">{nearbyError}</Text>}

          {nearbyLoading ? (
            <View className="bg-white rounded-2xl p-8 flex items-center justify-center">
              <Text className="text-gray-400">加载中...</Text>
            </View>
          ) : nearbyOrders.length === 0 ? (
            <View className="bg-white rounded-2xl p-8 flex flex-col items-center">
              <Text className="text-3xl mb-2">🔍</Text>
              <Text className="text-sm text-gray-500">附近暂无待接单的烘焙协助</Text>
              <Text className="text-xs text-gray-400 mt-1">稍后刷新看看</Text>
            </View>
          ) : (
            nearbyOrders.map(order => (
              <View key={order.id} className="bg-white rounded-2xl p-4 mb-3">
                <View className="flex items-center justify-between mb-2">
                  <Text className="text-base font-bold text-gray-900">{order.category}</Text>
                  <Text className="text-xs text-pink-500 font-medium">
                    {order.distance_km !== undefined ? `${order.distance_km}km` : ''}
                  </Text>
                </View>
                <Text className="block text-sm text-gray-600 line-clamp-2">{order.description}</Text>
                <Text className="block text-xs text-gray-400 mt-2">{order.address}</Text>
                <View className="flex items-center justify-between mt-3">
                  <Text className="text-xs text-gray-500">
                    {order.contact_name} · {order.contact_phone}
                  </Text>
                  <View
                    className="bg-pink-500 text-white text-sm font-medium px-5 py-2 rounded-full"
                    onClick={() => handleAccept(order.id)}
                  >
                    接单
                  </View>
                </View>
              </View>
            ))
          )}
        </View>
      )}

      {/* 我的接单 */}
      {tab === 'mine' && (
        <View className="px-4 pt-4">
          {!worker ? (
            <View className="bg-white rounded-2xl p-8 flex flex-col items-center">
              <Text className="text-3xl mb-2">👩‍🍳</Text>
              <Text className="text-sm text-gray-500">请先在“我的档案”注册成为烘焙师</Text>
              <View
                className="mt-4 bg-pink-500 text-white text-sm font-medium px-6 py-3 rounded-full"
                onClick={() => setTab('profile')}
              >
                去注册
              </View>
            </View>
          ) : myOrdersLoading ? (
            <View className="bg-white rounded-2xl p-8 flex items-center justify-center">
              <Text className="text-gray-400">加载中...</Text>
            </View>
          ) : myOrders.length === 0 ? (
            <View className="bg-white rounded-2xl p-8 flex flex-col items-center">
              <Text className="text-3xl mb-2">📭</Text>
              <Text className="text-sm text-gray-500">还没有接单，去附近看看有没有合适的烘焙需求</Text>
            </View>
          ) : (
            myOrders.map(order => (
              <View key={order.id} className="bg-white rounded-2xl p-4 mb-3">
                <View className="flex items-center justify-between mb-2">
                  <Text className="text-base font-bold text-gray-900">{order.category}</Text>
                  <Text className={`text-xs font-medium px-3 py-1 rounded-full ${statusColor[order.status] || 'bg-gray-100 text-gray-500'}`}>
                    {ORDER_STATUS_TEXT[order.status]}
                  </Text>
                </View>
                <Text className="block text-sm text-gray-600 line-clamp-2">{order.description}</Text>
                <View className="flex items-center justify-between mt-3">
                  <Text className="text-xs text-gray-500">
                    {order.contact_name} · {order.contact_phone}
                  </Text>
                  <Text
                    className="text-pink-500 text-xs"
                    onClick={() => Taro.navigateTo({ url: `/pages/order-detail/index?id=${order.id}` })}
                  >
                    详情 →
                  </Text>
                </View>
                {(order.status === 'accepted' || order.status === 'repairing') && (
                  <View className="mt-3 pt-3 border-t border-gray-100">
                    <View className="flex items-center gap-3">
                      <View
                        className="flex-1 text-center text-sm font-medium text-pink-500 border border-pink-500 rounded-full py-2"
                        onClick={() => callContact(order.contact_phone)}
                      >
                        电话联系
                      </View>
                      {order.status === 'accepted' ? (
                        <View
                          className={`flex-1 text-center text-sm font-medium text-white bg-purple-600 rounded-full py-2 ${statusUpdatingId === order.id ? 'opacity-60' : ''}`}
                          onClick={() => statusUpdatingId !== order.id && handleUpdateStatus(order, 'repairing')}
                        >
                          {statusUpdatingId === order.id ? '处理中...' : '开始协助'}
                        </View>
                      ) : (
                        <View
                          className={`flex-1 text-center text-sm font-medium text-white bg-green-600 rounded-full py-2 ${statusUpdatingId === order.id ? 'opacity-60' : ''}`}
                          onClick={() => statusUpdatingId !== order.id && handleUpdateStatus(order, 'completed')}
                        >
                          {statusUpdatingId === order.id ? '提交中...' : '完成协助'}
                        </View>
                      )}
                    </View>
                    <View
                      className={`text-center text-xs text-red-500 mt-3 ${statusUpdatingId === order.id ? 'opacity-50' : ''}`}
                      onClick={() => statusUpdatingId !== order.id && handleRelease(order)}
                    >
                      撤销协助
                    </View>
                  </View>
                )}
              </View>
            ))
          )}
        </View>
      )}

      {/* 我的档案 */}
      {tab === 'profile' && (
        <View className="px-4 pt-4">
          <View className="bg-white rounded-2xl p-4">
            <Text className="block text-sm font-medium text-gray-900 mb-3">烘焙师档案</Text>

            <View className="mb-3">
              <Text className="block text-xs text-gray-400 mb-1">姓名</Text>
              <Input
                className="w-full bg-gray-50 rounded-xl px-4 py-3 text-sm text-gray-900"
                placeholder="你的称呼"
                placeholderStyle="color:#9ca3af"
                value={name}
                onInput={e => setName(e.detail.value)}
              />
            </View>

            <View className="mb-3">
              <Text className="block text-xs text-gray-400 mb-1">手机号</Text>
              <Input
                className="w-full bg-gray-50 rounded-xl px-4 py-3 text-sm text-gray-900"
                placeholder="用于求助者联系你"
                placeholderStyle="color:#9ca3af"
                type="number"
                maxlength={11}
                value={phone}
                onInput={e => setPhone(e.detail.value)}
              />
            </View>

            <View className="mb-3">
              <Text className="block text-xs text-gray-400 mb-1">擅长领域</Text>
              <Picker
                mode="selector"
                range={WORKER_TRADES}
                value={tradeIdx}
                onChange={e => setTradeIdx(Number(e.detail.value))}
              >
                <View className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
                  <Text className="text-sm text-gray-900">{WORKER_TRADES[tradeIdx]}</Text>
                  <Text className="text-gray-400 text-xs">选择 ▾</Text>
                </View>
              </Picker>
            </View>

            <View className="mb-4">
              <Text className="block text-xs text-gray-400 mb-1">当前位置（接单距离按此计算）</Text>
              {loc ? (
                <View className="bg-pink-50 rounded-xl px-4 py-3 flex items-center justify-between">
                  <Text className="text-sm text-pink-700">
                    ✅ 已定位：{loc.latitude.toFixed(5)}, {loc.longitude.toFixed(5)}
                  </Text>
                  <Text className="text-pink-500 text-xs" onClick={refreshLocation}>重定位</Text>
                </View>
              ) : (
                <View className="bg-pink-50 rounded-xl px-4 py-3" onClick={refreshLocation}>
                  <Text className="text-sm text-pink-700">{locating ? '定位中...' : '📍 获取当前位置'}</Text>
                </View>
              )}
              {locError && <Text className="block text-xs text-red-500 mt-2">{locError}</Text>}
            </View>

            <View className="mb-4">
              <View
                className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3"
                onClick={() => setOnline(!online)}
              >
                <Text className="text-sm text-gray-900">在线接单</Text>
                <View className={`w-11 h-6 rounded-full px-1 flex items-center ${online ? 'bg-green-500 justify-end' : 'bg-gray-300 justify-start'}`}>
                  <View className="w-5 h-5 bg-white rounded-full" />
                </View>
              </View>
            </View>

            <View
              className="bg-pink-500 text-white text-center text-sm font-medium py-3 rounded-xl"
              onClick={handleSaveProfile}
            >
              保存档案
            </View>
            {profileSaved && worker && (
              <Text className="block text-center text-xs text-green-600 mt-2">✓ 档案已保存，烘焙师编号 {worker.id.slice(0, 8)}</Text>
            )}
          </View>
        </View>
      )}
    </View>
  )
}

export default WorkerPage
