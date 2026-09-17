import Taro from '@tarojs/taro'

export interface GeoLocation {
  latitude: number
  longitude: number
  accuracy?: number
}

/**
 * 获取当前定位：优先微信小程序 getLocation，H5 降级为浏览器定位。
 * 失败时抛出带用户可读信息的错误。
 */
export async function getCurrentLocation(): Promise<GeoLocation> {
  // 微信小程序 / 抖音小程序环境
  const env = Taro.getEnv()
  if (env === Taro.ENV_TYPE.WEAPP || env === Taro.ENV_TYPE.TT) {
    try {
      const res = await Taro.getLocation({
        type: 'gcj02',
        isHighAccuracy: true
      })
      return {
        latitude: res.latitude,
        longitude: res.longitude,
        accuracy: res.accuracy
      }
    } catch (err: any) {
      const msg = err?.errMsg || ''
      if (msg.includes('auth deny') || msg.includes('auth denied') || msg.includes('authorize')) {
        throw new Error('未授权定位权限，请在设置中开启位置权限后重试')
      }
      throw new Error('定位失败，请检查手机定位是否开启')
    }
  }

  // H5 降级：浏览器 Geolocation API（失败时降级到默认坐标，不阻塞开发流程）
  return new Promise<GeoLocation>(resolve => {
    const fallback = (): GeoLocation => ({ latitude: 39.9042, longitude: 116.4074, accuracy: 0 });
    if (!navigator.geolocation) {
      // 浏览器不支持定位时，降级到默认坐标（北京）
      resolve(fallback());
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => {
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy
        })
      },
      () => {
        // 未授权/超时/失败均降级到默认坐标
        resolve(fallback());
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    )
  })
}

/** 校验定位坐标是否有效 */
export function isValidCoord(lat: number | null | undefined, lng: number | null | undefined): boolean {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    !Number.isNaN(lat) &&
    !Number.isNaN(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  )
}
