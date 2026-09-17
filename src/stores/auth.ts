import Taro from '@tarojs/taro'
import { create } from 'zustand'
import { devLogin, wxLogin, type LoginResult } from '@/utils/api'
import { clearSession, getSession, saveSession, type LoginRole } from '@/utils/token'

interface AuthState {
  token: string
  role: LoginRole | null
  openid: string
  profileCompleted: boolean
  setSession: (session: LoginResult) => void
  clear: () => void
}

const stored = getSession()

export const useAuthStore = create<AuthState>((set) => ({
  token: stored?.token || '',
  role: stored?.role || null,
  openid: stored?.openid || '',
  profileCompleted: false,
  setSession: (session) => {
    saveSession({ token: session.token, role: session.role, openid: session.openid })
    set({
      token: session.token,
      role: session.role,
      openid: session.openid,
      profileCompleted: session.profile_completed,
    })
  },
  clear: () => {
    clearSession()
    set({ token: '', role: null, openid: '', profileCompleted: false })
  },
}))

// 全局只允许一个登录请求在途，避免多个接口同时 401 时重复 wx.login
// 记录当前登录的角色，角色不一致时不复用，确保用户态/师傅态切换正确
let loginPromise: Promise<string> | null = null
let loginRole: LoginRole | null = null
// 登录请求自增序号，仅最新请求会写入 session，避免 app.tsx 预登录(user)覆盖师傅页登录(worker)
let loginSeq = 0

async function doLogin(role: LoginRole): Promise<string> {
  const seq = ++loginSeq
  const env = Taro.getEnv()
  let session: LoginResult
  if (env === Taro.ENV_TYPE.WEAPP || env === Taro.ENV_TYPE.TT) {
    const { code } = await Taro.login()
    if (!code) {
      throw new Error('微信登录失败，请稍后重试')
    }
    session = await wxLogin(code, role)
  } else {
    // H5 开发态：走非生产环境的调试登录
    session = await devLogin(role)
  }
  // 仅当本次仍是最新登录请求时才写入 session，避免被其他角色的登录覆盖
  if (seq === loginSeq) {
    useAuthStore.getState().setSession(session)
  }
  return session.token
}

/**
 * 确保已登录并返回有效 token。
 * - 已登录且角色匹配时直接复用本地 token；
 * - 角色不一致（如用户态进入师傅页）时重新以目标角色登录。
 */
export function ensureLogin(role: LoginRole = 'user'): Promise<string> {
  const session = getSession()
  if (session?.token && session.role === role) {
    if (!useAuthStore.getState().token) {
      useAuthStore.setState({ token: session.token, role: session.role, openid: session.openid })
    }
    return Promise.resolve(session.token)
  }
  if (session?.token) {
    clearSession()
    useAuthStore.getState().clear()
  }
  // 仅当已有同角色的登录请求在途时才复用；角色不同则重新登录（避免用户态/师傅态串 token）
  if (loginPromise && loginRole === role) {
    return loginPromise
  }
  loginRole = role
  loginPromise = doLogin(role).finally(() => {
    loginPromise = null
    loginRole = null
  })
  return loginPromise
}

/** 主动退出登录 */
export function logout(): void {
  useAuthStore.getState().clear()
}
