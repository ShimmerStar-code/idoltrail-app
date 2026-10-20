import type { ApiResponse } from '@/types'
import { API_BASE_URL } from '@/utils/env'
import {
  getAccessToken,
  getRefreshToken,
  setTokens,
  clearTokens,
  clearCachedUser,
} from '@/utils/storage'

// 注：useUserStore 不在文件顶部 import，避免与 stores/user.ts 形成循环依赖
// （userStore 调 request，request 又会 import userStore）。
// 改为 App.vue 启动时调用 setAuthExpiredHandler 注入；handler 未注入时兜底只清 token。

const BASE_URL = API_BASE_URL

/** 业务请求超时（ms）。不设的话 uni.request 默认 60s，弱网下页面 loading 会长时间卡死 */
const REQUEST_TIMEOUT = 15000
/** refresh 超时（ms）。必须比业务请求更短：它是所有并发请求的串行瓶颈 */
const REFRESH_TIMEOUT = 10000

/** 触发会话过期的业务错误码 */
const AUTH_EXPIRED_CODES = [40101, 40102]

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  data?: Record<string, any>
  header?: Record<string, string>
  // 不走 401 拦截（用于登录 / refresh 本身）
  skipAuth?: boolean
  /**
   * 401 refresh 失败时是否由调用方自己处理（不要 reLaunch 到独立登录页）
   * 用于 bootstrapSession 验证 token 等场景，让 store 自己决定走 wx.login 还是弹 modal
   */
  skipAuthRedirect?: boolean
  /**
   * 静默：不弹全局 toast，错误只通过 reject 抛给调用方。
   *
   * 为什么要这个开关：App.vue 把 .uni-popup 的 z-index 强制到 9999，而 uni.showToast
   * 的层级远低于它 —— 弹窗（登录框等）打开期间弹出的 toast 会被 mask 完全遮住，
   * 用户表现为「日志有错误、界面毫无反应」。这类场景改由调用方在弹窗内内联提示。
   */
  silent?: boolean
  /**
   * 单次请求超时（ms），覆盖默认的 REQUEST_TIMEOUT。
   *
   * 上传类接口必须单独放宽：默认 15s 是按「列表/详情这种几百 KB 的 JSON」定的，
   * 而投稿图片是手机原图（弱网下 2~5MB），15s 一到就被原生层 abort，
   * 用户表现为「每次上传都在同一秒失败，且没有任何错误提示」。
   */
  timeout?: number
  /**
   * 请求取消句柄。返回的 Promise 仍是 Promise，但额外挂一个 abort()，
   * 供离页/切筛选时主动撤掉在途请求，避免回调进已卸载的页面。
   *
   * 取消后的 promise 以 code = -1 的 Error reject（与 errno 区间不冲突），
   * 调用方按需 ignore；不想处理的场景继续照常 catch 即可。
   */
  signal?: AbortSignal
}

// ─── 401 静默 refresh：并发去重 ───
let refreshing: Promise<string | null> | null = null

/**
 * 「会话过期已通知」锁：并发 401 只处理一次，避免重复弹强制登录 / 重复写 returnTo。
 * 复位时机：① refresh 成功 ② 用户主动登录成功（resetSessionExpiredNotice）。
 */
let sessionExpiredNotified = false

async function doRefresh(): Promise<string | null> {
  const rt = getRefreshToken()
  if (!rt) return null
  try {
    const res = await new Promise<any>((resolve, reject) => {
      uni.request({
        url: BASE_URL + '/auth/refresh',
        method: 'POST',
        data: { refresh_token: rt },
        timeout: REFRESH_TIMEOUT,
        success: (r) => resolve(r.data),
        fail: reject,
      })
    })
    if (res?.code === 0) {
      setTokens(res.data.access_token, res.data.refresh_token)
      // refresh 成功 = 会话已恢复,解除"会话过期已通知"锁,
      // 否则本次会话内后续真的过期时不会再弹强制登录。
      sessionExpiredNotified = false
      return res.data.access_token
    }
    return null
  } catch (e) {
    return null
  }
}

function ensureFreshToken(): Promise<string | null> {
  if (refreshing) return refreshing
  refreshing = doRefresh().finally(() => {
    refreshing = null
  })
  return refreshing
}

// ─── 401 会话过期 handler：注入式，避开 request ↔ userStore 循环依赖 ───
type AuthExpiredHandler = () => void
let authExpiredHandler: AuthExpiredHandler | null = null

/**
 * 登录成功后调用，解开会话过期去重锁。
 * 由 stores/user.ts 的 notifyLoginSuccess / setLoginPayload 调用。
 */
export function resetSessionExpiredNotice() {
  sessionExpiredNotified = false
}

/**
 * App.vue 在 store 就绪后调用本接口注入 handler；
 * 不依赖 import 顺序，避开循环依赖；handler 未注入时只清 token，避免再次崩盘。
 */
export function setAuthExpiredHandler(fn: AuthExpiredHandler) {
  authExpiredHandler = fn
}

function notifySessionExpired() {
  // 并发 401 去重：N 个请求同时 401 只会触发一次会话过期处理，
  // 避免重复 captureCurrentPage + setReturnTo + 弹窗。
  if (sessionExpiredNotified) return
  sessionExpiredNotified = true
  if (authExpiredHandler) {
    authExpiredHandler()
  } else {
    // 兜底：handler 还没注入（早期 401 触发时）只清 token，不弹 modal
    clearTokens()
    clearCachedUser()
  }
}

// ─── 主入口 ───
export function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const {
    method = 'GET',
    data,
    header = {},
    skipAuth = false,
    skipAuthRedirect = false,
    silent = false,
    timeout = REQUEST_TIMEOUT,
  } = options
  /**
   * @param token  本次请求使用的 access_token(重放时传新 token)
   * @param retried 是否已经做过一次 refresh 重放。
   *   最多重放一次：若重放后仍返回 401(账号封禁 / 协议未签等持续 401 场景)，
   *   不再进入 refresh 分支,直接走会话过期流程,否则会形成
   *   refresh → request → 401 → refresh 的无限循环打爆后端。
   */
  const doRequest = (token?: string, retried = false): Promise<T> =>
    new Promise((resolve, reject) => {
      const h: Record<string, string> = { 'Content-Type': 'application/json', ...header }
      if (!skipAuth) {
        const t = token || getAccessToken()
        if (t) h['Authorization'] = 'Bearer ' + t
      }
      uni.request({
        url: BASE_URL + path,
        method: method as UniApp.RequestOptions['method'],
        data,
        header: h,
        timeout,
        success: async (res) => {
          // ── 1. HTTP 状态码优先 ──
          // 网关 / Nginx / 后端过滤器可能直接以 HTTP 401 返回（body 为空或 HTML），
          // 早期实现只认 body.code，这类响应会落进下面的空值分支直接 reject，
          // 既不 refresh、不弹登录框、也不 toast —— 用户表现为「接口一直失败但界面毫无反应」。
          const http401 = res.statusCode === 401
          const httpServerError = res.statusCode >= 500

          const body = res.data as ApiResponse<T> | null | undefined
          if (!body || typeof body !== 'object') {
            // 响应体可能为空(网关 502 / 204 / 代理截断)。原实现直接读 body.code 会在
            // success 回调里抛 TypeError,导致外层 Promise 既不 resolve 也不 reject,
            // 调用方 await 永久挂起、页面 loading 永不消失。这里必须先做空值保护。
            console.warn('[request] empty/invalid response body', path, res.statusCode)
            if (http401 && !skipAuth && !retried) {
              await replayAfterRefresh(resolve, reject, doRequest, notifySessionExpired, skipAuthRedirect)
              return
            }
            if (!silent) {
              uni.showToast({
                title: httpServerError ? '服务异常，请稍后再试' : `请求失败(${res.statusCode})`,
                icon: 'none',
              })
            }
            reject(new Error(httpServerError ? '服务异常，请稍后再试' : `请求失败(${res.statusCode})`))
            return
          }
          if (body.code === 0) {
            resolve(body.data)
            return
          }
          // 401 → 静默 refresh + 重放（仅第一次 401 允许重放）
          if (!skipAuth && !retried && (AUTH_EXPIRED_CODES.includes(body.code) || http401)) {
            await replayAfterRefresh(resolve, reject, doRequest, notifySessionExpired, skipAuthRedirect)
            return
          }
          // 重放后仍是 401：不再 refresh,直接判定会话过期
          if (!skipAuth && retried && (AUTH_EXPIRED_CODES.includes(body.code) || http401)) {
            if (!skipAuthRedirect) {
              void notifySessionExpired()
            }
            reject(bizError('登录已过期', body.code))
            return
          }
          if (!silent) {
            uni.showToast({ title: body.message || '请求失败', icon: 'none' })
          }
          reject(bizError(body.message, body.code))
        },
        fail: (err) => {
          // 主动取消：不弹 toast，也不当业务错误处理（调用方自己决定是否忽略）
          if (isAbortError(err)) {
            reject(abortError())
            return
          }
          if (!silent) {
            const timedOut = String(err?.errMsg || '').includes('timeout')
            uni.showToast({ title: timedOut ? '请求超时，请检查网络' : '网络错误', icon: 'none' })
          }
          reject(err)
        },
      })
    })
  return withAbort(doRequest(), options.signal)
}

/** 取消错误统一带 code = -1：与后端 errno（4xxxx/5xxxx）不冲突，便于调用方按 code 分流 */
const ABORT_CODE = -1

function abortError(): Error & { code?: number } {
  const err = new Error('请求已取消') as Error & { code?: number }
  err.code = ABORT_CODE
  return err
}

/** 判断 uni.request 的 fail 回调是否由 abort 触发（各端 errMsg 文案不一致） */
function isAbortError(err: any): boolean {
  const msg = String(err?.errMsg || '').toLowerCase()
  return msg.includes('abort')
}

/**
 * 给 Promise 挂 abort 支持。
 *
 * uni.request 的单次调用拿不到 RequestTask（这里包在 Promise 里），
 * 所以用「信号 + settle 守卫」实现：signal 触发时把结果标记为已取消，
 * 后续原生回调（无论成功还是失败）一律忽略 —— 等价于把在途请求作废，
 * 且不会产生「取消后又 resolve 一次」的双重结算。
 */
function withAbort<T>(p: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return p
  if (signal.aborted) {
    return Promise.reject(abortError())
  }
  return new Promise<T>((resolve, reject) => {
    let cancelled = false
    const onAbort = () => {
      cancelled = true
      reject(abortError())
    }
    signal.addEventListener('abort', onAbort, { once: true })
    p.then(
      (v) => {
        signal.removeEventListener('abort', onAbort)
        if (!cancelled) resolve(v)
      },
      (e) => {
        signal.removeEventListener('abort', onAbort)
        if (!cancelled) reject(e)
      },
    )
  })
}

/**
 * 业务错误对象：在标准 Error 上补一个 `code` 字段（后端 errno）。
 *
 * 此前业务失败只 reject 一个纯 Error（仅 message），调用方要区分错误类型
 * 只能去匹配文案（如 `/频繁/`），后端一改文案就失效。
 * 补 code 是纯向后兼容的：所有 `catch (e) { e.message }` 的现有代码照常工作，
 * 需要分流的地方（如一键登录的 40027）才读 `e.code`。
 */
function bizError(message: string, code?: number): Error & { code?: number } {
  const err = new Error(message) as Error & { code?: number }
  if (typeof code === 'number') err.code = code
  return err
}

/** 静默 refresh 并重放一次的公共分支（HTTP 401 与业务 401xx 共用） */
async function replayAfterRefresh<T>(
  resolve: (v: T) => void,
  reject: (e: any) => void,
  doRequest: (token?: string, retried?: boolean) => Promise<T>,
  notify: () => void,
  skipAuthRedirect: boolean,
) {
  const newToken = await ensureFreshToken()
  if (newToken) {
    try {
      // 重放失败：已在重放请求内处理过 toast / 会话过期，这里不再重复
      resolve(await doRequest(newToken, true))
    } catch (e) {
      reject(e)
    }
    return
  }
  // refresh 失败
    if (!skipAuthRedirect) {
      void notify()  // 弹强制登录；reject 立即返回，不被 modal 阻塞
    }
    reject(new Error('登录已过期'))
  }
