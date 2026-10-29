// App 版本接口（检查更新）。
//
// 后端路由：/api/v1/public/app-versions/latest（**公开接口，不需要鉴权**）。
//
// 为什么 App 要查服务端而不是只读包内常量：
//   包内的 APP_VERSION_NAME 是**发版那一刻**的快照，发出去就固定了。
//   运营在后台录入新版本后，如果 App 只能读常量，用户永远看不到更新提示，
//   每次都要为了一个版本号发一次版。查服务端则改成「运营改一行，App 下次打开就提示」。
//
// 接口是公开的，用 skipAuth: true：不带 token，也就不会触发 refresh / 401 重放。

import { request } from '@/utils/request'
import type { AppPlatform, AppVersionInfo } from '@/types/appVersion'

export const appVersionApi = {
  /**
   * 拉取某平台当前对外版本。
   *
   * silent: true —— 拉取失败（离线 / 后端不可达）不能弹 toast 打扰用户，
   * 检查更新是用户主动点的动作，失败由调用方就地提示。
   */
  fetchLatest: (platform: AppPlatform = 'android') =>
    request<AppVersionInfo>(`/public/app-versions/latest?platform=${platform}`, {
      method: 'GET',
      skipAuth: true,
      silent: true,
    }),
}

/**
 * 比较两个版本号，返回 true 表示 latest 比 current 新。
 *
 * 按点分段比：0.10.0 > 0.9.0（纯字符串比较会判反）。
 * 段数不同时，缺的段按 0 处理（0.1 == 0.1.0）。
 */
export function isNewerVersion(latest: string, current: string): boolean {
  const a = latest.trim().split('.')
  const b = current.trim().split('.')
  const len = Math.max(a.length, b.length)
  for (let i = 0; i < len; i++) {
    const x = Number.parseInt(a[i] ?? '0', 10)
    const y = Number.parseInt(b[i] ?? '0', 10)
    const nx = Number.isNaN(x) ? 0 : x
    const ny = Number.isNaN(y) ? 0 : y
    if (nx !== ny) return nx > ny
  }
  return false
}
