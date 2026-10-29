import type { ApiResponse } from '@/types'
import { API_BASE_URL } from '@/utils/env'
import {
  getAccessToken,
  getRefreshToken,
  getAccessExpiresAt,
  getRefreshExpiresAt,
  getRefreshedAt,
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

/**
 * access token 提前续期阈值（ms）。
 *
 * access token 只有 15 分钟有效期。若不做预续期，用户静默一段时间后的
 * **第一个**请求必然吃一次 401 → refresh → 重放，白跑一个来回。
 * 剩余不足 2 分钟就先换新，用户完全感知不到。
 */
const ACCESS_REFRESH_THRESHOLD = 2 * 60 * 1000

/**
 * refresh token 滑动续期阈值（ms，24 小时）。
 *
 * 服务端 refresh token 有效期 60 天，且每次 refresh 都会重签、TTL 重置为完整时长。
 * 客户端在「距上次续期超过 24 小时」时主动续一次，就把有效期重置为
 * 「当天 + 60 天」—— 这就是滑动续期。
 *
 * 用 24 小时而不是「剩余不足 N 天」：后者会出现「用户明明天天在用，
 * 却因为没触达阈值而错过续期」的窗口。24 小时能保证
 * **只要 60 天内打开过 App，登录态就一定被续上**；
 * 超过 60 天没打开，refresh 过期 → 401 → 弹强制登录 → 重新登录。
 */
const REFRESH_RENEW_INTERVAL = 24 * 60 * 60 * 1000

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
      // 连同服务端下发的剩余有效期一起落盘，客户端才能判断「快过期了」并主动续期
      setTokens(
        res.data.access_token,
        res.data.refresh_token,
        res.data.access_expires_in,
        res.data.refresh_expires_in,
      )
      // refresh 成功 = 会话已恢复,解除"会话过期已通知"锁,
      // 否则本次会话内后续真的过期时不会再弹强制登录。
      sessionExpiredNotified = false
      // 通知 store：内存里的 token 副本已经过时，storage 里才是最新的
      tokenRefreshedHandler?.()
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

/**
 * 是否需要**主动**续期（不等 401）。
 *
 * 三条触发条件（任一命中即续）：
 *   1. refresh token 已过期 → **不续**（续了也没用），交给 401 流程弹强制登录
 *   2. 距上次续期超过 24 小时 → 续，把有效期重置为「当天 + 60 天」（滑动续期）
 *   3. access token 剩余不足 2 分钟 → 续，避免下一个请求吃 401
 */
function shouldRefreshNow(): boolean {
  if (!getRefreshToken()) return false
  const now = Date.now()
  const refreshExp = getRefreshExpiresAt()
  // refresh 已过期：续期必然失败，别白跑一趟；让 401 流程去弹强制登录
  if (refreshExp && refreshExp <= now) return false
  // 距上次续期超过 24 小时 → 滑动续期（老客户端没记过时间戳，首次会续一次）
  const refreshedAt = getRefreshedAt()
  if (!refreshedAt || now - refreshedAt >= REFRESH_RENEW_INTERVAL) return true
  // access 快过期 → 换新
  const accessExp = getAccessExpiresAt()
  if (accessExp && accessExp - now <= ACCESS_REFRESH_THRESHOLD) return true
  return false
}

/**
 * 主动滑动续期：需要时换一组新 token（并把本地到期时间往后推）。
 *
 * 语义：**只要 60 天内用过 App，登录态就一直有效**。
 * - 距上次续期超过 24 小时 → 续一次，refresh 有效期重置为「当天 + 60 天」
 * - access 快过期 → 一并换新，避免下一个请求吃 401
 *
 * 失败**不**弹窗也不抛错 —— 续期失败通常意味着 refresh 也过期了，
 * 后续请求会自然收到 401，由既有的「401 → refresh → 弹强制登录」流程接管，
 * 这里静默失败可避免重复弹窗 / 重复写 returnTo。
 *
 * @returns true=本次确实换了新 token
 */
export async function refreshSessionIfStale(): Promise<boolean> {
  if (!shouldRefreshNow()) return false
  const token = await ensureFreshToken()
  return !!token
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

// ─── token 续期成功回调：注入式，同样避开 request ↔ userStore 循环依赖 ───
type TokenRefreshedHandler = () => void
let tokenRefreshedHandler: TokenRefreshedHandler | null = null

/**
 * 续期成功后回调，让 store 的内存 token 副本跟上 storage 里的新 token。
 *
 * 为什么必须同步：storage 是 token 的权威来源，request.ts 续期时直接改它；
 * 而 store 里的 ref 是登录那一刻的快照。若不同步，store 里可能拿着
 * **已被服务端轮转失效**的旧 token 回写 storage，用户会被莫名其妙踢下线。
 */
export function setTokenRefreshedHandler(fn: TokenRefreshedHandler) {
  tokenRefreshedHandler = fn
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
          // 主动取消：只有「我们自己传了 signal 且已被 abort」才算取消。
          //
          // ⚠️ 不能靠 errMsg 判：Android 端网络不可达（后端宕机、连错地址、
          //    弱网超时）时 uni.request 的 errMsg 同样是 "request:fail abort"，
          //    与「主动取消」文案完全一致。早期实现按文案判定，
          //    结果后端一挂，全站请求都被当成「用户主动取消」静默吞掉：
          //    不弹 toast、不提示，页面一片空白（只在心里/eventStore 里留一行日志）。
          if (options.signal?.aborted) {
            reject(abortError())
            return
          }
          if (!silent) {
            const msg = String(err?.errMsg || '').toLowerCase()
            const timedOut = msg.includes('timeout')
            uni.showToast({
              title: timedOut ? '请求超时，请检查网络' : '网络错误，请稍后重试',
              icon: 'none',
            })
          }
          reject(err)
        },
      })
    })
  /**
   * 前置滑动续期。
   *
   * access token 15 分钟就会过期，而 refresh 是 365 天且可滑动续期。
   * 这里在发请求**之前**判断一次：access 快过期就换新，refresh 快到期也换新
   * （把 refresh 的 TTL 往后推，实现「登录长期有效」）。
   *
   * 续期失败不阻断本次请求 —— 后面的 401 分支会接管（再 refresh 一次，
   * 还失败才弹强制登录）。
   */
  const start = async (): Promise<T> => {
    if (!skipAuth) {
      await refreshSessionIfStale()
    }
    return doRequest()
  }
  return withAbort(start(), options.signal)
}

/** 取消错误统一带 code = -1：与后端 errno（4xxxx/5xxxx）不冲突，便于调用方按 code 分流 */
const ABORT_CODE = -1

function abortError(): Error & { code?: number } {
  const err = new Error('请求已取消') as Error & { code?: number }
  err.code = ABORT_CODE
  return err
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
