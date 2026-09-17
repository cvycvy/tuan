import { View, Text, Picker } from '@tarojs/components'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import Taro, { useLoad } from '@tarojs/taro'
import { useState } from 'react'
import { createOrder, ORDER_CATEGORIES } from '../../utils/api'
import { getCurrentLocation, isValidCoord, GeoLocation } from '../../utils/location'
import { ensureLogin } from '../../stores/auth'
import './index.css'

const ReportPage = () => {
  const [category, setCategory] = useState(0)
  const [description, setDescription] = useState('')
  const [address, setAddress] = useState('')
  const [contactName, setContactName] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [loc, setLoc] = useState<GeoLocation | null>(null)
  const [locating, setLocating] = useState(false)
  const [locError, setLocError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useLoad(() => {
    ensureLogin('user').catch(() => {})
  })

  const handleLocate = async () => {
    setLocating(true)
    setLocError('')
    try {
      const geo = await getCurrentLocation()
      setLoc(geo)
    } catch (err: any) {
      setLocError(err?.message || '定位失败')
    } finally {
      setLocating(false)
    }
  }

  const handleSubmit = async () => {
    if (!isValidCoord(loc?.latitude, loc?.longitude)) {
      Taro.showToast({ title: '请先获取定位', icon: 'none' })
      return
    }
    if (!description.trim()) {
      Taro.showToast({ title: '请填写烘焙问题描述', icon: 'none' })
      return
    }
    if (!address.trim()) {
      Taro.showToast({ title: '请填写所在地址', icon: 'none' })
      return
    }
    if (!contactName.trim()) {
      Taro.showToast({ title: '请填写联系人', icon: 'none' })
      return
    }
    if (!/^1\d{10}$/.test(contactPhone)) {
      Taro.showToast({ title: '请填写正确的手机号', icon: 'none' })
      return
    }
    setSubmitting(true)
    try {
      await ensureLogin('user')
      const order = await createOrder({
        category: ORDER_CATEGORIES[category],
        description: description.trim(),
        address: address.trim(),
        contact_name: contactName.trim(),
        contact_phone: contactPhone,
        latitude: loc!.latitude,
        longitude: loc!.longitude
      })
      Taro.showToast({ title: '协助提交成功', icon: 'success' })
      setTimeout(() => {
        Taro.redirectTo({ url: `/pages/order-detail/index?id=${order.id}` })
      }, 800)
    } catch (err: any) {
      Taro.showToast({ title: err?.message || '提交失败', icon: 'none' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <View className="min-h-screen bg-rose-50 pb-10">
      <View className="px-4 pt-4">
        {/* 协助类型 */}
        <View className="bg-white rounded-2xl p-4 mb-4">
          <Text className="block text-sm font-medium text-gray-900 mb-3">协助类型</Text>
          <Picker
            mode="selector"
            range={ORDER_CATEGORIES}
            value={category}
            onChange={e => setCategory(Number(e.detail.value))}
          >
            <View className="flex items-center justify-between bg-pink-50 rounded-xl px-4 py-3">
              <Text className="text-sm text-gray-900">{ORDER_CATEGORIES[category]}</Text>
              <Text className="text-pink-400 text-xs">选择 ▾</Text>
            </View>
          </Picker>
        </View>

        {/* 问题描述 */}
        <View className="bg-white rounded-2xl p-4 mb-4">
          <Text className="block text-sm font-medium text-gray-900 mb-3">烘焙问题描述</Text>
          <Textarea
            className="w-full bg-gray-50 rounded-xl p-3 text-sm text-gray-900"
            placeholder="请描述你遇到的烘焙问题，如：用预拌粉做戚风蛋糕，6 寸配方配料比怎么换算？打发到什么程度？"
            placeholderStyle="color:#9ca3af"
            value={description}
            maxlength={300}
            onInput={e => setDescription(e.detail.value)}
          />
          <Text className="block text-right text-xs text-gray-400 mt-1">{description.length}/300</Text>
        </View>

        {/* 定位 */}
        <View className="bg-white rounded-2xl p-4 mb-4">
          <Text className="block text-sm font-medium text-gray-900 mb-3">所在位置（就近匹配烘焙师）</Text>
          {loc ? (
            <View className="bg-pink-50 rounded-xl px-4 py-3 flex items-center justify-between">
              <View>
                <Text className="block text-sm text-pink-700">✅ 已定位</Text>
                <Text className="block text-xs text-pink-500 mt-1">
                  {loc.latitude.toFixed(5)}, {loc.longitude.toFixed(5)}
                </Text>
              </View>
              <Text className="text-pink-500 text-xs" onClick={handleLocate}>重新定位</Text>
            </View>
          ) : (
            <View
              className="bg-pink-50 rounded-xl px-4 py-3 flex items-center justify-between"
              onClick={handleLocate}
            >
              <Text className="text-sm text-pink-700">{locating ? '定位中...' : '📍 获取当前位置'}</Text>
              {locating && <Text className="text-pink-500 text-xs">获取中</Text>}
            </View>
          )}
          {locError && <Text className="block text-xs text-red-500 mt-2">{locError}</Text>}
          <View className="mt-3">
            <Text className="block text-xs text-gray-400 mb-1">详细地址</Text>
            <Input
              className="w-full bg-gray-50 rounded-xl px-4 py-3 text-sm text-gray-900"
              placeholder="如：阳光花园3栋2单元501室（需上门指导时填写）"
              placeholderStyle="color:#9ca3af"
              value={address}
              onInput={e => setAddress(e.detail.value)}
            />
          </View>
        </View>

        {/* 联系方式 */}
        <View className="bg-white rounded-2xl p-4 mb-4">
          <Text className="block text-sm font-medium text-gray-900 mb-3">联系方式</Text>
          <View className="flex gap-3">
            <View className="flex-1">
              <Text className="block text-xs text-gray-400 mb-1">联系人</Text>
              <Input
                className="w-full bg-gray-50 rounded-xl px-4 py-3 text-sm text-gray-900"
                placeholder="你的称呼"
                placeholderStyle="color:#9ca3af"
                value={contactName}
                onInput={e => setContactName(e.detail.value)}
              />
            </View>
            <View className="flex-1">
              <Text className="block text-xs text-gray-400 mb-1">手机号</Text>
              <Input
                className="w-full bg-gray-50 rounded-xl px-4 py-3 text-sm text-gray-900"
                placeholder="11位手机号"
                placeholderStyle="color:#9ca3af"
                type="number"
                maxlength={11}
                value={contactPhone}
                onInput={e => setContactPhone(e.detail.value)}
              />
            </View>
          </View>
        </View>

        {/* 提交 */}
        <View
          className={`bg-pink-500 text-white text-center text-base font-medium py-4 rounded-2xl ${submitting ? 'opacity-60' : ''}`}
          onClick={submitting ? undefined : handleSubmit}
        >
          {submitting ? '提交中...' : '提交协助'}
        </View>
        <Text className="block text-center text-xs text-gray-400 mt-3">
          提交后将通知附近烘焙师，烘焙师会联系你确认指导时间与方式
        </Text>
      </View>
    </View>
  )
}

export default ReportPage
