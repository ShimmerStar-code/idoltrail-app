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
//      后台由系统通知栏承接，前台由 receive / pushMessageReceived 回调回查 HTTP 接口。

import { pushApi } from '@/api/push'
import { getDeviceId, getPushPlatform } from '@/utils/device'
import { useUserStore } from '@/stores/user'
import { useNotificationStore } from '@/stores/notification'

// 注：本文件与 stores/user.ts 存在相互 import。
// 安全性前提：两个模块的**顶层都不执行**对彼此的调用（useUserStore() 与
// syncPushToken() 均只在函数体内被调用），因此 ESM 循环解析不会拿到未初始化的值。
// 新增代码时请保持这个前提，不要把对方的调用提到模块顶层。

/** 推送总开关。'false' / 未定义 → 全部走 no-op */
function pushEnabled(): boolean {
  const v = import.meta.env.VITE_PUSH_ENABLED
  return v === 'true' || v === '1'
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

let inited = false

/**
 * 初始化推送监听。App.vue onLaunch 调用一次。
 * 幂等：重复调用直接返回。
 */
export function initPush() {
  if (!pushEnabled() || !pluginReady() || inited) return
  inited = true

  // #ifdef APP-PLUS
  // App 端 uni-push 2.0 底层是 plus.push，事件名 receive / click。
  // 依赖前提：manifest.json 已配置 app-plus.distribute.sdkConfigs.push.unipush
  // = { version:"2", offline:true }，编译器才会注入 @dcloudio/uni-push 的入口，
  // 运行时才会注册 uni.getPushClientId（pluginReady() 检查的就是它）。
  // 缺任一项，initPush 会在上面的 pluginReady() 处直接静默 return。
  try {
    plus.push.addEventListener('receive', (msg: any) => handleForeground(msg))
    // 只注册一个 click 监听：APNs/厂商通道与标准消息都从这里进来，
    // 注册两个会导致同一条通知被跳转两次。
    plus.push.addEventListener('click', (msg: any) => {
      const data = msg?.data || {}
      const payload = parsePushPayload(msg)
      // 冷启动时页面尚未 ready，缓存一拍，等 onShow 再补跳
      if (!payload.relatedId && !payload.url && !data.click_action_type) {
        pendingClick = payload
        return
      }
      handleClick(msg)
    })
  } catch (e) {
    console.warn('[push] plus.push 事件注册失败', e)
  }

  // 部分 uni-push 版本在 App 端也会派发 uni 事件，双保险
  // 注意：uni 类型的 addEventListener 未在 @dcloudio/types 中声明，这里做显式断言
  const uniAny = uni as unknown as {
    addEventListener?: (name: string, cb: (res: any) => void) => void
  }
  try {
    uniAny.addEventListener?.('pushMessageReceived', (res: any) => handleForeground(res))
    uniAny.addEventListener?.('pushMessageClicked', (res: any) => handleClick(res))
  } catch {
    /* ignore */
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
