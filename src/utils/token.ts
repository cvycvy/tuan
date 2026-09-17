import Taro from '@tarojs/taro'

export type LoginRole = 'user' | 'worker'

export interface StoredSession {
  token: string
  role: LoginRole
  openid: string
}

const SESSION_KEY = 'auth_session'

/** 读取本地登录会话 */
export function getSession(): StoredSession | null {
  try {
    const value = Taro.getStorageSync(SESSION_KEY)
    if (value && typeof value === 'object' && value.token) {
      return value as StoredSession
    }
    return null
  } catch {
    return null
  }
}

export function getToken(): string {
  return getSession()?.token || ''
}

/** 持久化登录会话 */
export function saveSession(session: StoredSession): void {
  try {
    Taro.setStorageSync(SESSION_KEY, session)
  } catch {
    // 存储不可用时仅保留内存态
  }
}

/** 清除登录会话（登出或 401 失效时调用） */
export function clearSession(): void {
  try {
    Taro.removeStorageSync(SESSION_KEY)
  } catch {
    // ignore
  }
}
