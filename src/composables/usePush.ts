// uni-push 2.0 接入封装。
//
// 设计约束（重要）：
//   1. 本工程在 **没有安装 uni_modules/uni-push 的情况下也必须能编译、能跑起来**。
//      因此所有 uni-push API 一律通过可选调用访问（`(uni as any).getPushClientId?.()`），
//      并且由 `VITE_PUSH_ENABLED` 环境变量做总开关。插件补齐后把开关打开即可，
//      不需要改动任何业务代码。
//   2. cid 在 App 冷启动 / 切后台回前台时都可能变化，因此 `syncPushToken` 在
//      onLaunch、onShow、登录成功三个时机都会调用，幂等 upsert。
//   3. 通知点击跳转统一复用站内通知的路径约定：`/pages/event/detail?id=<relatedId>`。
//   4. 通知 WebSocket 已下线，本文件是 App 端**唯一**的实时触达通道：
//      后台由系统通知栏承接，前台由 uni.onPushMessage 与 plus.push 的 receive
//      两条回调回查 HTTP 接口（两者会同时触发，已加去重）。

import { pushApi } from '@/api/push'
import { PUSH_ENABLED } from '@/utils/env'
import { getDeviceId, getPushPlatform } from '@/utils/device'
import { useNotificationStore } from '@/stores/notification'

// 注：本文件与 stores/user.ts 曾相互 import，靠「顶层不执行」侥幸不出错，
// 但 Vite 构建会因此告警 Circular chunk，且 chunk 求值顺序不可控。
// 现在改为在本文件内**惰性引入** user store（见 syncPushToken / unbindPushToken），
// 模块级已不再 import stores/user.ts，循环已断开。新增代码请保持这个结构：
// 需要 user store 时用 `await import(...)`，不要在文件顶部静态 import。

/** 推送总开关，读取收口在 utils/env.ts。'false' / 未定义 → 全部走 no-op */
function pushEnabled(): boolean {
  return PUSH_ENABLED
}

/** uni-push 插件是否真的装上了（装了才有这些 API） */
function pluginReady(): boolean {
  // #ifdef APP-PLUS
  return typeof (uni as any).getPushClientId === 'function'
  // #endif
  // #ifndef APP-PLUS
  return false
  // #endif
}

/** 冷启动时通知栏点进来时，cid 还没拿到前收到的点击事件，先缓存起来 */
let pendingClick: PushPayload | null = null

interface RawPushMessage {
  type?: string
  title?: string
  content?: string
  payload?: string | Record<string, unknown>
  data?: string | Record<string, unknown>
}

interface PushPayload {
  /** 通知类型，与站内通知一致：venue_change / time_change / ... */
  type?: string
  /** 关联实体类型：event / artist / place */
  relatedType?: string
  /** 关联实体 ID */
  relatedId?: string | number
  /** 点击后要跳的页面路径，留空则由 relatedType 推导 */
  url?: string
}

/** 解析 uni-push 的 payload：后端约定 payload 为 JSON 字符串 */
export function parsePushPayload(raw: RawPushMessage): PushPayload {
  const source = raw?.payload ?? raw?.data
  if (!source) return {}
  if (typeof source === 'object') return source as PushPayload
  try {
    const parsed = JSON.parse(source)
    return typeof parsed === 'object' && parsed ? (parsed as PushPayload) : {}
  } catch (e) {
    console.warn('[push] payload 解析失败', e)
    return {}
  }
}

/** 依据 payload 计算跳转路径，与站内通知点击保持一致 */
export function resolvePushUrl(payload: PushPayload): string {
  if (payload.url) return payload.url
  const id = payload.relatedId
  if (id === undefined || id === null || id === '') return ''
  switch (payload.relatedType) {
    case 'event':
      return `/pages/event/detail?id=${id}`
    case 'artist':
      return `/pages/artist/detail?id=${id}`
    case 'place':
      return `/pages/place/detail?id=${id}`
    default:
      // 后端未带 relatedType 时按站内通知的既有约定，一律跳活动详情
      return `/pages/event/detail?id=${id}`
  }
}

/**
 * 跳转前的保护：App 刚启动时页面栈还没就绪，直接 navigateTo 会失败，
 * 退化成 switchTab / reLaunch 也可能失败，这里统一延迟一拍并做兜底。
 */
export function navigateByPush(payload: PushPayload) {
  const url = resolvePushUrl(payload)
  if (!url) return
  setTimeout(() => {
    uni.navigateTo({
      url,
      fail: () => {
        uni.reLaunch({ url, fail: () => console.warn('[push] 跳转失败', url) })
      },
    })
  }, 600)
}

/**
 * 前台收到推送：**刻意不弹系统通知**，只回查一次通知接口刷新角标 / 列表。
 *
 * 背景：manifest 配了 sdkConfigs.push.unipush.offline = true（厂商通道，
 * iOS 只能靠 APNs），而该模式下 @dcloudio/uni-push 的入口会执行
 * plus.push.setAutoNotification(false)，前台收到消息本就不会自动弹通知。
 * 产品决策是前台不打扰用户，只让角标变化，用户自行进入通知面板查看；
 * 因此这里**不要**再补 plus.push.create()，那是刻意省略而非遗漏。
 *
 * 原先这里只有 WS 通道兜底时才会实时刷新；WebSocket 下线后，
 * uni-push 的前台回调就是**唯一**的站内消息实时更新时机，必须刷列表而不只是未读数。
 */
function handleForeground(raw: RawPushMessage) {
  console.log('[push] 前台收到消息', raw?.type)
  try {
    useNotificationStore().refreshAfterPush()
  } catch (e) {
    console.warn('[push] 刷新通知失败', e)
  }
}

/** 点击系统通知：跳转 + 刷新未读数与列表 */
function handleClick(raw: RawPushMessage) {
  const payload = parsePushPayload(raw)
  console.log('[push] 通知点击', payload)
  try {
    useNotificationStore().refreshAfterPush()
  } catch (e) {
    console.warn('[push] 刷新通知失败', e)
  }
  navigateByPush(payload)
}

/**
 * 归一化 `uni.onPushMessage` 的回调结果。
 * 官方回调形如 `{ type: 'receive' | 'click', data: { title, content, payload } }`，
 * 消息体在 data 里再嵌一层，直接丢给 parsePushPayload 会取不到 payload。
 *
 * ⚠️ 只认 `data.payload`，**不拿 `data.data` 兜底**：那是臆测字段，
 *    万一它承载的是别的业务数据会被误当 payload 解析出错误的跳转地址。
 *    取不到 payload 就让它取不到 —— parsePushPayload 兜底返回空对象，
 *    后续按「无可跳转内容」处理，比猜错链接安全得多。
 */
function normalizeOnPushMessage(res: any): RawPushMessage {
  const data = res?.data
  if (data && typeof data === 'object') {
    return {
      type: res?.type,
      title: data.title,
      content: data.content,
      payload: data.payload,
    }
  }
  return {
    type: res?.type,
    payload: typeof data === 'string' ? data : undefined,
  }
}

/**
 * 前台收到消息的去重。
 *
 * 与点击去重同源的问题：`uni.onPushMessage` 的 receive 与 `plus.push` 的 receive
 * 在部分基座上会同时触发，不去重会导致同一条消息连续回查两次 HTTP 接口。
 * 1s 窗口足够——两条回调的到达间隔在毫秒级。
 */
let lastReceiveKey = ''
let lastReceiveAt = 0

function handleForegroundOnce(raw: RawPushMessage) {
  const key = raw?.title ? `${raw.type}|${raw.title}|${raw.content || ''}` : String(raw?.type)
  const now = Date.now()
  if (key === lastReceiveKey && now - lastReceiveAt < 1000) {
    console.log('[push] 重复前台消息，已忽略', key)
    return
  }
  lastReceiveKey = key
  lastReceiveAt = now
  handleForeground(raw)
}

/**
 * 点击去重：`onPushMessage` 的 click 与 plus.push 的 click 在厂商通道下会
 * 同时触发，不去重会导致同一条通知连续跳转两次。
 */
let lastClickKey = ''
let lastClickAt = 0

function handleClickOnce(raw: RawPushMessage) {
  const payload = parsePushPayload(raw)
  const key = `${payload.url || ''}|${payload.relatedType || ''}|${payload.relatedId || ''}`
  const now = Date.now()
  if (key === lastClickKey && now - lastClickAt < 2000) {
    console.log('[push] 重复点击事件，已忽略', payload)
    return
  }
  lastClickKey = key
  lastClickAt = now

  // 冷启动时 cid / 页面栈都还没就绪，缓存一拍等 onShow 补跳。
  // ⚠️ click_action_type 只在 plus.push 的原始消息上，onPushMessage 归一化后没有这层
  if (!payload.relatedId && !payload.url && (raw as any)?.data?.click_action_type) {
    handleClick(raw)
    return
  }
  if (!payload.relatedId && !payload.url) {
    pendingClick = payload
    return
  }
  handleClick(raw)
}

let inited = false

/**
 * 初始化推送监听。App.vue onLaunch 调用一次。
 * 幂等：重复调用直接返回。
 */
export function initPush() {
  if (!pushEnabled() || !pluginReady() || inited) return
  inited = true

  // #ifdef APP-PLUS
  // 依赖前提：manifest.json 已配置 app-plus.distribute.sdkConfigs.push.unipush
  // = { version:"2", offline:true }，编译器才会注入 @dcloudio/uni-push 的入口，
  // 运行时才会注册 uni.getPushClientId（pluginReady() 检查的就是它）。
  // 缺任一项，initPush 会在上面的 pluginReady() 处直接静默 return。
  //
  // uni.onPushMessage 是 uni-push 2.0 的官方消息回调：
  //   type=receive —— App 在前台时收到消息（在线推送，不依赖厂商通道）
  //   type=click   —— 用户点击通知
  // uni-push 1.0 时代的 pushMessageReceived / pushMessageClicked 事件在 2.0 下
  // 不再触发，不要再注册它们。
  const uniPush = uni as unknown as {
    onPushMessage?: (cb: (res: any) => void) => void
  }
  try {
    uniPush.onPushMessage?.((res: any) => {
      const raw = normalizeOnPushMessage(res)
      console.log('[push] onPushMessage', res?.type)
      if (res?.type === 'click') handleClickOnce(raw)
      else handleForegroundOnce(raw)
    })
  } catch (e) {
    console.warn('[push] onPushMessage 注册失败', e)
  }

  // plus.push 兜底：与上面的 onPushMessage 互为补充，由 handleClickOnce /
  // handleForegroundOnce 去重后不会重复处理。
  // 刻意保留是因为 onPushMessage 并非在所有基座 / ROM 上都稳定派发，
  // 一旦只有它而没有兜底，前台消息与被杀后拉起的点击都会静默丢失，且无从排查。
  try {
    plus.push.addEventListener('receive', (msg: any) => handleForegroundOnce(msg))
    plus.push.addEventListener('click', (msg: any) => handleClickOnce(msg))
  } catch (e) {
    console.warn('[push] plus.push 事件注册失败', e)
  }
  // #endif
}

/** onShow 时把冷启动缓存的点击事件补跳掉 */
export function flushPendingPushClick() {
  if (!pendingClick) return
  const payload = pendingClick
  pendingClick = null
  navigateByPush(payload)
}

/** 取本机 cid（uni-push 客户端 ID）。插件缺失时返回空串。 */
export function getPushClientId(): Promise<string> {
  return new Promise((resolve) => {
    if (!pushEnabled() || !pluginReady()) {
      resolve('')
      return
    }
    try {
      ;(uni as any).getPushClientId({
        success: (res: any) => resolve(res?.cid || ''),
        fail: (e: any) => {
          console.warn('[push] getPushClientId 失败', e)
          resolve('')
        },
      })
    } catch (e) {
      console.warn('[push] getPushClientId 异常', e)
      resolve('')
    }
  })
}

/**
 * 拉取 cid 并上报后端。必须在**已登录**状态下调用，否则 401。
 * 幂等：后端按 (device_id, push_token) upsert，重复上报不会产生脏数据。
 */
export async function syncPushToken(): Promise<boolean> {
  if (!pushEnabled()) return false
  // 惰性引入：user store 在登录/刷新成功后反过来调本模块上报 cid，
  // 若这里再静态 import 就构成循环依赖（stores/user -> composables/usePush
  // -> stores/user），Vite 构建会告警且 chunk 求值顺序不可控。
  const { useUserStore } = await import('@/stores/user')
  const userStore = useUserStore()
  if (!userStore.isLoggedIn) return false

  const cid = await getPushClientId()
  if (!cid) return false
  try {
    await pushApi.reportPushToken(cid, getDeviceId(), getPushPlatform())
    console.log('[push] cid 上报成功', { deviceId: getDeviceId(), platform: getPushPlatform() })
    return true
  } catch (e) {
    console.warn('[push] cid 上报失败', e)
    return false
  }
}

/** 登出 / 切换账号时解绑，避免把上一个账号的通知推给本机用户 */
export async function unbindPushToken(): Promise<void> {
  if (!pushEnabled()) return
  // 同 syncPushToken：惰性引入以避开与 user store 的循环依赖
  const { useUserStore } = await import('@/stores/user')
  const userStore = useUserStore()
  if (!userStore.accessToken) return
  try {
    await pushApi.unbindPushToken(getDeviceId())
  } catch (e) {
    console.warn('[push] 解绑失败', e)
  }
}

/**
 * Android 13+ 需要运行时申请 POST_NOTIFICATIONS 权限，否则系统通知不展示。
 * uni-push 在 Android 13 上会自动弹窗，这里只做兜底：拿 cid 失败时主动提示。
 * iOS 通知权限由用户在系统设置授予，App 内无法再次拉起弹窗。
 */
export function checkNotifyPermissionHint(): void {
  // #ifdef APP-PLUS
  const sys = (() => {
    try {
      return uni.getSystemInfoSync() as any
    } catch {
      return {}
    }
  })()
  const isAndroid13 = /android/i.test(sys.platform || '') && Number(sys.osVersionMajor || 0) >= 13
  if (isAndroid13 && pushEnabled()) {
    console.log('[push] Android 13+ 需确保已授予通知权限（首次调用 getPushClientId 时系统会弹窗）')
  }
  // #endif
}
