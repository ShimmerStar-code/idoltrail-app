// 管理后台 token 的独立存取。
//
// 为什么不能复用 utils/storage.ts 的 setTokens：那里写的是 fans:auth:* ——
// 与 C 端普通用户同一份存储。后台登录成功后若直接 setTokens，用户原本的登录态
// 会被管理员 token 顶掉；管理员退出时 clearTokens 又会把用户踢下线。
// 两类身份必须物理隔离，否则一个「点错了登录页」的普通用户就会被清空登录态。
//
// 另外后端 /admin/login 返回的 token 不应被 request.ts 的 401 自动 refresh
// 链复用（那是 C 端用户的会话），所以 admin 走独立入口、自己处理鉴权头。

import { API_BASE_URL } from '@/utils/env'

const KEY_ADMIN_ACCESS = 'fans:admin:access'
const KEY_ADMIN_REFRESH = 'fans:admin:refresh'

export function getAdminAccessToken(): string {
  return uni.getStorageSync(KEY_ADMIN_ACCESS) || ''
}

export function setAdminTokens(access: string, refresh: string) {
  uni.setStorageSync(KEY_ADMIN_ACCESS, access)
  uni.setStorageSync(KEY_ADMIN_REFRESH, refresh)
}

export function clearAdminTokens() {
  uni.removeStorageSync(KEY_ADMIN_ACCESS)
  uni.removeStorageSync(KEY_ADMIN_REFRESH)
}

/** 未登录时统一退回到登录页 */
export function redirectToAdminLogin() {
  clearAdminTokens()
  uni.reLaunch({ url: '/pages/admin/login' })
}

/**
 * 管理端专用请求。
 *
 * 不复用 utils/request.ts：那边会自动附带 C 端用户 token、并在 401 时触发
 * 用户会话 refresh，把管理员的操作请求和普通用户的会话搅在一起。
 * 这里独立处理，401 直接判定后台登录态失效并退回登录页。
 */
export function adminRequest<T>(url: string, options: { method?: 'GET' | 'POST'; data?: Record<string, unknown> } = {}): Promise<T> {
  const token = getAdminAccessToken()
  if (!token) {
    redirectToAdminLogin()
    return Promise.reject(new Error('管理后台未登录'))
  }

  return new Promise<T>((resolve, reject) => {
    uni.request({
      url: API_BASE_URL + url,
      method: options.method || 'GET',
      data: options.data,
      timeout: 15000,
      header: { Authorization: 'Bearer ' + token },
      success(res) {
        if (res.statusCode === 401 || res.statusCode === 403) {
          redirectToAdminLogin()
          reject(new Error('管理后台登录已失效'))
          return
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`HTTP ${res.statusCode}`))
          return
        }
        const body: any = res.data
        if (body && typeof body === 'object' && 'code' in body) {
          if (body.code !== 0) {
            uni.showToast({ title: body.message || '操作失败', icon: 'none' })
            reject(new Error(body.message || '操作失败'))
            return
          }
          resolve(body.data as T)
          return
        }
        resolve(body as T)
      },
      fail(err) {
        reject(new Error(err.errMsg || '网络请求失败'))
      },
    })
  })
}