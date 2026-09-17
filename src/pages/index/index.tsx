import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import './index.css'

const IndexPage = () => {
  const goReport = () => {
    Taro.navigateTo({ url: '/pages/report/index' })
  }

  return (
    <View className="min-h-screen bg-rose-50 pb-8">
      {/* 顶部横幅 */}
      <View className="bg-gradient-to-br from-pink-500 to-rose-400 px-6 pt-10 pb-14 rounded-b-3xl">
        <Text className="block text-white text-2xl font-bold">烘焙协助</Text>
        <Text className="block text-pink-100 text-sm mt-2">
          蛋糕预拌粉 · 就近烘焙师一对一指导
        </Text>
      </View>

      {/* 一键求助卡片 */}
      <View className="px-4 -mt-8">
        <View
          className="bg-white rounded-2xl shadow-md p-6 flex flex-col items-center"
          onClick={goReport}
        >
          <View className="w-14 h-14 rounded-full bg-pink-500 flex items-center justify-center mb-3">
            <Text className="text-2xl">🎂</Text>
          </View>
          <Text className="text-lg font-bold text-gray-900">发起烘焙协助</Text>
          <Text className="text-sm text-gray-500 mt-1 text-center">
            填写烘焙需求，附近烘焙师将就近接单指导
          </Text>
          <View className="mt-4 bg-pink-500 text-white text-sm font-medium px-8 py-3 rounded-full">
            立即求助
          </View>
        </View>
      </View>

      {/* 流程说明 */}
      <View className="px-4 mt-6">
        <Text className="text-base font-bold text-gray-900">协助流程</Text>
        <View className="bg-white rounded-2xl p-4 mt-3">
          <View className="flex items-start gap-3 py-2">
            <View className="w-6 h-6 rounded-full bg-pink-100 text-pink-600 text-xs font-bold flex items-center justify-center mt-1">1</View>
            <View>
              <Text className="block text-sm font-medium text-gray-900">提交协助需求</Text>
              <Text className="block text-xs text-gray-500 mt-1">选择协助类型，填写烘焙问题描述与所在地址</Text>
            </View>
          </View>
          <View className="flex items-start gap-3 py-2">
            <View className="w-6 h-6 rounded-full bg-pink-100 text-pink-600 text-xs font-bold flex items-center justify-center mt-1">2</View>
            <View>
              <Text className="block text-sm font-medium text-gray-900">附近烘焙师接单</Text>
              <Text className="block text-xs text-gray-500 mt-1">系统按距离匹配附近的烘焙师，配料比问题快速响应</Text>
            </View>
          </View>
          <View className="flex items-start gap-3 py-2">
            <View className="w-6 h-6 rounded-full bg-pink-100 text-pink-600 text-xs font-bold flex items-center justify-center mt-1">3</View>
            <View>
              <Text className="block text-sm font-medium text-gray-900">线上或上门指导</Text>
              <Text className="block text-xs text-gray-500 mt-1">烘焙师联系你约定时间，线上讲解或上门手把手教学</Text>
            </View>
          </View>
        </View>
      </View>

      {/* 常用入口 */}
      <View className="px-4 mt-6">
        <Text className="text-base font-bold text-gray-900">常用入口</Text>
        <View className="grid grid-cols-2 gap-3 mt-3">
          <View
            className="bg-white rounded-2xl p-4"
            onClick={() => Taro.switchTab({ url: '/pages/orders/index' })}
          >
            <Text className="block text-2xl mb-2">📋</Text>
            <Text className="block text-sm font-medium text-gray-900">我的协助</Text>
            <Text className="block text-xs text-gray-500 mt-1">查看协助进度</Text>
          </View>
          <View
            className="bg-white rounded-2xl p-4"
            onClick={() => Taro.switchTab({ url: '/pages/worker/index' })}
          >
            <Text className="block text-2xl mb-2">👩‍🍳</Text>
            <Text className="block text-sm font-medium text-gray-900">烘焙师接单</Text>
            <Text className="block text-xs text-gray-500 mt-1">接单与烘焙指导</Text>
          </View>
          <View
            className="bg-white rounded-2xl p-4"
            onClick={() => Taro.navigateTo({ url: '/pages/powder/index' })}
          >
            <Text className="block text-2xl mb-2">🧁</Text>
            <Text className="block text-sm font-medium text-gray-900">购买预拌粉</Text>
            <Text className="block text-xs text-gray-500 mt-1">自定义金额 · 多方式支付</Text>
          </View>
          <View
            className="bg-white rounded-2xl p-4"
            onClick={() => Taro.navigateTo({ url: '/pages/powder-orders/index' })}
          >
            <Text className="block text-2xl mb-2">🧾</Text>
            <Text className="block text-sm font-medium text-gray-900">购买记录</Text>
            <Text className="block text-xs text-gray-500 mt-1">查看订单与支付状态</Text>
          </View>
        </View>
      </View>
    </View>
  )
}

export default IndexPage
