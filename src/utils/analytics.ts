import { ANALYTICS_EVENTS, type AnalyticsEventName } from '@/constants/analytics'
import { hasPrivacyConsent } from '@/utils/privacy'
import { reportAnalyticsEvents } from '@/api/analytics'
import { setLatencyReporter } from '@/utils/request'

/**
 * App 端埋点 SDK（轻量自研，不引第三方分析 SDK）。
 *
 * 为什么自研：
 *   · **隐私合规**：国内应用商店要求「用户同意隐私政策前不得采集任何数据」。
 *     第三方 SDK 常在初始化时就上报设备信息，我们没法卡住它的开关。
 *     自研能在「同意之前一个字节都不上报」这件事上有确定性的保证。
 *   · **离线补报**：弱网 / 进程被杀时事件要能留在本地，下次启动再送。
 *     多数分析 SDK 做不到（丢了就没了）。
 *
 * 核心约束：
 *   1. **同意前不落盘、不上报**。同意前只允许 `app_launch` / `privacy_consent`
 *      这两条不含个人信息的启动事实留在**内存**里，等用户同意后再补报；
 *      其余事件直接丢弃。
 *   2. **埋点永远不影响主流程**：所有对外调用都包在 try/catch 里，
 *      上报失败只留队列重试，不弹 toast、不抛错。
 *   3. **上报走统一请求层**（`@/api/analytics` → `utils/request`），
 *      带 silent + skipAuthRedirect，失败不弹窗、不触发强制登录。
 */

/** 待上报队列（本地持久化，key 独立于用户 token 体系） */
const KEY_QUEUE = 'fans:analytics:queue'
/** 首次安装标记 */
const KEY_FIRST_LAUNCH = 'fans:analytics:first_launch'
/** 来源渠道（分享回流 / 推送落地等） */
const KEY_SOURCE = 'fans:analytics:source'

/** 队列上限：超出丢弃最旧的（无限增长会把 storage 撑爆） */
const MAX_QUEUE = 200
/** 单批上报条数 */
const BATCH_SIZE = 20
/** 攒批延迟（ms）：行为类事件成组上报，避免每个点击都打一次接口 */
const FLUSH_DELAY = 3000
/** 上报失败后的冷却时间（ms）：弱网下不要反复打接口 */
const RETRY_COOLDOWN = 30000
/** 慢请求阈值（ms）：只有慢请求与失败请求才上报耗时 */
const SLOW_REQUEST_MS = 1200
/** 同一事件每秒最多上报次数（防止用户狂点把数据刷爆） */
const PER_EVENT_PER_SECOND = 3

/** 一条待上报事件 */
interface AnalyticsEventPayload {
  event: string
  session_id: string
  ts: number
  platform: string
  app_version: string
  source: string
  is_first_launch: boolean
  props?: Record<string, any>
}

// ─── 会话级状态 ───
let sessionId = ''
let isFirstLaunch = false
let platform = ''
let appVersion = ''
let source = ''

/** 同意之前的内存暂存（不落盘、不上报） */
let pending: AnalyticsEventPayload[] = []

/** 本次会话的起始时间（ms），用于算会话时长 */
let sessionStartedAt = 0

let flushing = false
let flushTimer: ReturnType<typeof setTimeout> | null = null
let lastFlushFailAt = 0

/** 同事件频控：event -> { 秒, 该秒次数 } */
const eventRate = new Map<string, { sec: number; count: number }>()

/**
 * 初始化埋点会话。
 *
 * 由 App.vue 的 onLaunch 调用。**幂等**：重复调用不会重置 session_id，
 * 否则同一次冷启动会被拆成两个会话，活跃口径会虚高。
 */
export function initAnalytics(): void {
  if (sessionId) return
  sessionId = genSessionId()
  sessionStartedAt = Date.now()

  const info = safeSystemInfo()
  platform = info.platform
  appVersion = info.version

  // 首次安装标记：第一次启动时打标，之后所有事件都带 false
  const flag = uni.getStorageSync(KEY_FIRST_LAUNCH)
  isFirstLaunch = !flag
  if (!flag) {
    uni.setStorageSync(KEY_FIRST_LAUNCH, '1')
  }

  source = String(uni.getStorageSync(KEY_SOURCE) || '')

  // 注入接口耗时上报器（注入式，避免 request.ts ↔ analytics.ts 循环依赖）
  setLatencyReporter(reportRequestLatency)
}

/**
 * 记录一个埋点事件。
 *
 * 调用方无需关心是否已同意隐私政策、是否已初始化、网络是否可用 ——
 * 这里全部兜住。任何异常都不会抛给调用方。
 */
export function track(event: AnalyticsEventName, props?: Record<string, any>): void {
  try {
    if (!sessionId) initAnalytics()
    const now = Date.now()
    if (!allowEvent(event, now)) return

    const payload: AnalyticsEventPayload = {
      event,
      session_id: sessionId,
      ts: now,
      platform,
      app_version: appVersion,
      source,
      is_first_launch: isFirstLaunch,
    }
    if (props && Object.keys(props).length > 0) payload.props = props

    if (!hasPrivacyConsent()) {
      // 同意前：只有不含个人信息的启动事实允许暂存，且只留在内存里
      if (event !== ANALYTICS_EVENTS.APP_LAUNCH && event !== ANALYTICS_EVENTS.PRIVACY_CONSENT) return
      pending.push(payload)
      if (pending.length > MAX_QUEUE) pending.shift()
      return
    }

    // 刚拿到同意：把同意前暂存的事件一并补报
    if (pending.length > 0) {
      const carry = pending
      pending = []
      carry.forEach((p) => enqueue(p))
    }

    enqueue(payload)
  } catch (e) {
    // 埋点失败绝不影响主流程
  }
}

/**
 * 主动触发一次上报（App 切后台时调用，尽量减少丢失）。
 */
export function flushAnalytics(): void {
  try {
    scheduleFlush(0)
  } catch (e) {
    // ignore
  }
}

/**
 * 本次会话已持续时长（ms）。
 *
 * 从冷启动算起 —— 这是「一次使用会话」的时长口径，
 * 比「App 停留时长」更贴近真实的单次使用。
 */
export function sessionDurationMs(): number {
  if (!sessionStartedAt) return 0
  return Date.now() - sessionStartedAt
}

/**
 * 记录来源渠道（分享回流 / 推送落地）。
 *
 * 只在本次会话内生效 + 落盘一次（下次启动仍然保留，
 * 方便归因「这个用户是从哪个渠道来的」）。
 */
export function setAnalyticsSource(value: string): void {
  try {
    source = value
    if (value) uni.setStorageSync(KEY_SOURCE, value)
  } catch (e) {
    // ignore
  }
}

/**
 * 上报接口耗时。
 *
 * **只报慢请求与失败请求**：正常请求每次都报会把队列塞满，
 * 而后台真正想看的是「哪里慢」「哪里报错」。
 *
 * 由 utils/request.ts 在请求结束后调用。
 */
export function reportRequestLatency(path: string, durationMs: number, ok: boolean, status?: number): void {
  try {
    if (!hasPrivacyConsent()) return
    if (ok && durationMs < SLOW_REQUEST_MS) return
    track(ANALYTICS_EVENTS.API_LATENCY, {
      path: normalizePath(path),
      ms: Math.round(durationMs),
      ok: ok ? 1 : 0,
      status: status || 0,
    })
  } catch (e) {
    // ignore
  }
}

// ─── 内部实现 ───

/** 入队并调度上报 */
function enqueue(payload: AnalyticsEventPayload): void {
  const queue = loadQueue()
  queue.push(payload)
  while (queue.length > MAX_QUEUE) queue.shift()
  saveQueue(queue)
  scheduleFlush(FLUSH_DELAY)
}

/** 调度一次上报（去重：已有定时器就不重复排） */
function scheduleFlush(delay: number): void {
  if (!hasPrivacyConsent()) return
  if (flushTimer) clearTimeout(flushTimer)
  flushTimer = setTimeout(() => {
    flushTimer = null
    void flush()
  }, delay)
}

/** 执行上报 */
async function flush(): Promise<void> {
  if (flushing) return
  if (!hasPrivacyConsent()) return
  const now = Date.now()
  // 失败冷却：弱网下不要反复打接口
  if (lastFlushFailAt && now - lastFlushFailAt < RETRY_COOLDOWN) return

  const queue = loadQueue()
  if (queue.length === 0) return
  const batch = queue.slice(0, BATCH_SIZE)

  flushing = true
  try {
    await reportAnalyticsEvents(batch)
    // 成功：把已发送的部分从队列摘掉
    saveQueue(queue.slice(batch.length))
    lastFlushFailAt = 0
    if (queue.length > BATCH_SIZE) scheduleFlush(0)
  } catch (e) {
    // 失败：队列原样保留，下次 flush 或下次启动再送
    lastFlushFailAt = Date.now()
  } finally {
    flushing = false
  }
}

/** 读队列 */
function loadQueue(): AnalyticsEventPayload[] {
  try {
    const raw = uni.getStorageSync(KEY_QUEUE)
    if (!raw) return []
    const list = JSON.parse(raw)
    return Array.isArray(list) ? (list as AnalyticsEventPayload[]) : []
  } catch (e) {
    return []
  }
}

/** 写队列 */
function saveQueue(queue: AnalyticsEventPayload[]): void {
  try {
    if (!queue.length) {
      uni.removeStorageSync(KEY_QUEUE)
      return
    }
    uni.setStorageSync(KEY_QUEUE, JSON.stringify(queue))
  } catch (e) {
    // ignore
  }
}

/** 同事件频控 */
function allowEvent(event: string, now: number): boolean {
  const sec = Math.floor(now / 1000)
  const rec = eventRate.get(event)
  if (!rec || rec.sec !== sec) {
    eventRate.set(event, { sec, count: 1 })
    return true
  }
  if (rec.count >= PER_EVENT_PER_SECOND) return false
  rec.count += 1
  return true
}

/** 生成会话 ID */
function genSessionId(): string {
  const rand = Math.random().toString(36).slice(2, 10)
  return `s_${Date.now().toString(36)}_${rand}`
}

/** 取平台与版本号（取不到就留空，不影响主流程） */
function safeSystemInfo(): { platform: string; version: string } {
  let p = ''
  let v = ''
  try {
    const info = uni.getSystemInfoSync()
    p = String(info.platform || '')
    v = String((info as any).appVersion || (info as any).version || '')
  } catch (e) {
    // ignore
  }
  if (!v) {
    try {
      const base = (uni as any).getAppBaseInfo?.()
      if (base) v = String(base.version || '')
    } catch (e) {
      // ignore
    }
  }
  return { platform: p, version: v }
}

/**
 * 路径归一化：把 id 换成 :id。
 *
 * /events/123 → /events/:id
 *
 * 目的是让后台按「接口维度」聚合，而不是每个 id 一条曲线。
 */
function normalizePath(path: string): string {
  return String(path || '').replace(/\/\d+(?=\/|$)/g, '/:id')
}
