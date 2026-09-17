import Taro from '@tarojs/taro'
import { clearSession, getToken } from '@/utils/token'

/**
 * 网络请求模块
 * 封装 Taro.request、Taro.uploadFile、Taro.downloadFile，自动添加项目域名前缀
 * 如果请求的 url 以 http:// 或 https:// 开头，则不会添加域名前缀
 *
 * IMPORTANT: 项目已经全局注入 PROJECT_DOMAIN
 * IMPORTANT: 除非你需要添加全局参数，如给所有请求加上 header，否则不能修改此文件
 */
export namespace Network {
    const createUrl = (url: string): string => {
        if (url.startsWith('http://') || url.startsWith('https://')) {
            return url
        }
        return `${PROJECT_DOMAIN}${url}`
    }

    /** 注入全局 Authorization header */
    const withAuth = <T extends { url: string; header?: Record<string, string> }>(option: T): T => {
        const token = getToken()
        return {
            ...option,
            header: {
                ...(option.header || {}),
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
        }
    }

    /** 统一处理状态码：401 清除失效会话，4xx/5xx 抛出以便业务走 catch */
    const handleResponse = <T extends { statusCode?: number; data?: any }>(res: T): T => {
        const status = res.statusCode || 200
        if (status === 401) {
            clearSession()
        }
        if (status >= 400) {
            const message =
                (typeof res.data === 'object' && res.data?.message) ||
                (typeof res.data === 'string' ? safeErrorMessage(res.data) : '') ||
                `请求失败(${status})`
            throw Object.assign(new Error(message), {
                statusCode: status,
                data: res.data,
                errMsg: message,
            })
        }
        return res
    }

    const safeErrorMessage = (raw: string): string => {
        try {
            const parsed = JSON.parse(raw)
            return parsed?.message || ''
        } catch {
            return ''
        }
    }

    // 调用方均以 await 使用；断言保留原 Task 类型声明，实际返回值是具备 then 的 Promise
    export const request = (option => {
        return Taro.request({
            ...withAuth(option),
            url: createUrl(option.url),
        }).then(handleResponse)
    }) as typeof Taro.request

    export const uploadFile = (option => {
        return Taro.uploadFile({
            ...withAuth(option),
            url: createUrl(option.url),
        }).then(handleResponse)
    }) as typeof Taro.uploadFile

    export const downloadFile = (option => {
        return Taro.downloadFile({
            ...withAuth(option),
            url: createUrl(option.url),
        }).then(handleResponse)
    }) as typeof Taro.downloadFile
}
