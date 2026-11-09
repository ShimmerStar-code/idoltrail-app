import { request } from '@/utils/request'

/**
 * 埋点上报接口。
 *
 * 单独放在 api 层而不是塞进 utils/analytics.ts：
 * utils/analytics.ts 要被 utils/request.ts 引用（上报接口耗时），
 * 若它再静态引用 utils/request.ts 就成了循环依赖。
 * 这里作为「第三块」承接 HTTP 调用，utils/analytics.ts 用**动态 import** 引入本文件，
 * 静态依赖图上无环。
 */

/** 单条上报事件 */
export interface AnalyticsEventPayload {
  event: string
  session_id: string
  ts: number
  platform: string
  app_version: string
  source: string
  is_first_launch: boolean
  props?: Record<string, any>
}

/** 上报结果 */
export interface AnalyticsIngestResult {
  accepted: number
  dropped: number
}

/**
 * 上报一批事件。
 *
 * 三个开关的含义（少一个都会出事）：
 *   · silent —— 埋点失败**绝不能**给用户弹 toast，用户不该看到「埋点上报失败」；
 *   · skipAuthRedirect —— 埋点请求遇到 401 时**不能**触发强制登录弹窗。
 *     用户没登录是常态（首启未登录的漏斗最需要观测），
 *     因埋点把登录框弹到用户脸上是不可接受的副作用；
 *   · 带 token —— 有登录态时服务端会把事件关联到账号，
 *     这样才能算「登录用户的活跃」而不是只算设备活跃。
 */
export function reportAnalyticsEvents(
  events: AnalyticsEventPayload[],
): Promise<AnalyticsIngestResult> {
  return request<AnalyticsIngestResult>('/analytics/events', {
    method: 'POST',
    data: { events },
    silent: true,
    skipAuthRedirect: true,
  })
}
