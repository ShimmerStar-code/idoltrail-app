// 设备标识与系统信息。
//
// App 端没有小程序那样的 openid，登录/推送/风控都依赖一个**稳定的设备 ID**：
//   - 首次启动生成 UUID 落 storage，之后不再变
//   - 清缓存 / 换机后会重新生成，属于预期行为（后端按 device_id 建 user_devices 记录）

import type { DeviceType } from '@/types/auth'

const KEY_DEVICE_ID = 'fans:device:id'

function randomUUID(): string {
  // #ifdef APP-PLUS
  // plus 提供了设备级 UUID，比 JS 随机数更稳定（重装应用后不变）
  try {
    const id = plus.device.uuid as string
    if (id) return id
  } catch {
    /* fallthrough */
  }
  // #endif

  // 标准兜底：RFC4122 v4。crypto.randomUUID 在旧 WebView 上不一定有
  const c: any = globalThis.crypto
  if (c?.randomUUID) return c.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0
    const v = ch === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/** 读取（必要时生成）本机稳定设备 ID */
export function getDeviceId(): string {
  let id = uni.getStorageSync(KEY_DEVICE_ID) as string
  if (!id) {
    id = randomUUID()
    uni.setStorageSync(KEY_DEVICE_ID, id)
  }
  return id
}

/** 当前系统信息，失败时返回空对象而不是抛错 */
export function safeGetSystemInfo(): {
  model?: string
  system?: string
  osName?: string
  platform?: string
  version?: string
} {
  try {
    return uni.getSystemInfoSync() as any
  } catch (e) {
    console.warn('[device] getSystemInfoSync failed', e)
    return {}
  }
}

/** 归一化为后端 device_type 枚举：ios / android / other */
export function getDeviceType(): DeviceType | 'other' {
  const sys = safeGetSystemInfo()
  const os = `${sys.osName || ''} ${sys.platform || ''}`.toLowerCase()
  if (os.includes('ios') || os.includes('iphone') || os.includes('ipad')) return 'ios'
  if (os.includes('android') || os.includes('harmony')) return 'android'
  return 'other'
}

/** 推送通道对应的平台标识：ios / android / harmony */
export function getPushPlatform(): 'ios' | 'android' | 'harmony' {
  const sys = safeGetSystemInfo()
  const os = `${sys.osName || ''} ${sys.platform || ''}`.toLowerCase()
  if (os.includes('ios')) return 'ios'
  if (os.includes('harmony')) return 'harmony'
  return 'android'
}

/** App 版本号（取自 manifest versionName） */
export function getAppVersion(): string {
  try {
    // #ifdef APP-PLUS
    return (plus.runtime.version || '') as string
    // #endif
    return (safeGetSystemInfo().version as string) || ''
  } catch {
    return ''
  }
}

/** 机型，如 "iPhone 15" / "Pixel 8" */
export function getDeviceModel(): string {
  const sys = safeGetSystemInfo()
  return (sys.model as string) || ''
}

/** 系统版本，如 "17.0" / "Android 13" */
export function getOsVersion(): string {
  const sys = safeGetSystemInfo()
  return (sys.system as string) || ''
}
