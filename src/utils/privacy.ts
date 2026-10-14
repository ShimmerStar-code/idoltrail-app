// App 端隐私合规封装。
//
// 与小程序端的差异：
//   小程序 → 依赖微信隐私框架（wx.onNeedPrivacyAuthorization）被动触发，同意结果回传给微信；
//   App    → 由我们自己维护「已同意 + 协议版本」状态，**同意之前禁止调用任何需要系统授权的
//            系统 API**（通知、相册、相机等），这是国内应用商店与 GDPR 的硬性要求。
//
// 本文件不依赖任何微信 API，也不使用条件编译指令（vue-tsc 不处理 #ifdef，
// 各端写两份会被判为 duplicate implementation）。App 端与 H5 端共用同一实现。

import { PRIVACY_VERSION } from '@/constants/agreements'

// 版本号统一由 constants/agreements.ts 维护（协议正文与版本号必须同处一个文件），
// 此处只做转出，保证 `import { PRIVACY_VERSION } from '@/utils/privacy'` 的老调用点不断。
export { PRIVACY_VERSION }

const KEY_PRIVACY_VERSION = 'fans:privacy:version'

/** 用户是否已同意当前版本的隐私政策 */
export function hasPrivacyConsent(): boolean {
  return uni.getStorageSync(KEY_PRIVACY_VERSION) === PRIVACY_VERSION
}

/** 已同意的协议版本（未同意过返回空串） */
export function getPrivacyVersion(): string {
  return uni.getStorageSync(KEY_PRIVACY_VERSION) || ''
}

export function savePrivacyConsent(): void {
  uni.setStorageSync(KEY_PRIVACY_VERSION, PRIVACY_VERSION)
}

/** 撤回同意（用户从系统设置里撤回，或「退出并清除数据」时调用） */
export function clearPrivacyConsent(): void {
  uni.removeStorageSync(KEY_PRIVACY_VERSION)
}

/**
 * 未同意隐私协议时的统一拦截：弹 toast 并返回 false。
 * 所有需要系统权限的入口（通知开启、相册、相机）都应先过这一关。
 */
export function requirePrivacyConsent(): boolean {
  if (hasPrivacyConsent()) return true
  uni.showToast({ title: '请先同意隐私政策', icon: 'none' })
  return false
}

/**
 * 系统权限范围，与 `uni.getAppAuthorizeSetting` 返回字段对齐。
 *
 * 刻意不含 'location'：城市定位已改为服务端按来源 IP 推断（见 utils/location.ts），
 * App 不再调用 uni.getLocation，也就没有定位权限可申请。
 * 留着一个永远走不通的 scope 只会让后来者以为定位仍依赖系统授权。
 */
export type SystemPermissionScope = 'notification' | 'album' | 'camera'

/** scope → getAppAuthorizeSetting 结果里的字段名 */
const SCOPE_FIELD: Record<SystemPermissionScope, string> = {
  notification: 'notificationAuthorized',
  album: 'albumAuthorized',
  camera: 'cameraAuthorized',
}

/**
 * 查询 App 端系统权限状态。
 * 仅 App 端有效；其他端统一返回 true，避免 H5 预览时把流程卡死。
 */
export function getSystemPermission(scope: SystemPermissionScope): Promise<boolean> {
  return querySystemPermission(scope).then((v) => v !== false)
}

/**
 * 带「未知」状态的权限查询：返回 null 表示当前平台/版本不支持查询该权限，
 * 调用方不能把它当成「已授权」——早期版本在这里直接 resolve(true)，
 * 导致 ensureSystemPermission 的「已授权就不打扰」分支永远命中，
 * Android 13+ 用户被永久拒绝通知后再也拿不到「去系统设置」的引导。
 */
function querySystemPermission(scope: SystemPermissionScope): Promise<boolean | null> {
  return new Promise((resolve) => {
    // #ifdef APP-PLUS
    try {
      const res = uni.getAppAuthorizeSetting?.()
      const field = SCOPE_FIELD[scope] as keyof UniNamespace.GetAppAuthorizeSettingResult
      const value = (res as any)?.[field]
      // 字段不存在 = 该平台不支持这类权限（如低版本 Android 的通知权限）
      resolve(value === undefined ? null : value === 'authorized')
    } catch {
      resolve(null)
    }
    // #endif
    // #ifndef APP-PLUS
    resolve(null)
    // #endif
  })
}

/**
 * 真正发起系统授权申请。各 scope 的申请通道不同，必须逐个实现。
 * @returns 本次申请后是否拿到了授权
 */
function requestSystemPermission(scope: SystemPermissionScope): Promise<boolean> {
  if (scope === 'notification') {
    return requestNotificationPermission()
  }

  // album / camera：没有独立的申请 API，实际的系统选择器由页面的
  // uni.chooseImage 拉起。这里如实返回当前状态：已授权 → true，未授权 → false，
  // 由上层引导去系统设置页。绝不能无脑 return true。
  return querySystemPermission(scope).then((v) => v === true)
}

/**
 * Android 13（API 33）起通知改为运行时权限，必须显式申请；
 * 低于 13 无需申请，只需如实查状态。
 */
function requestNotificationPermission(): Promise<boolean> {
  return new Promise((resolve) => {
    // #ifdef APP-PLUS
    try {
      // plus.android 的类型定义只声明到 PlusAndroidClassObject 这一层，
      // 没有覆盖 importClass 反射出来的成员（Build.VERSION 等），只能断言。
      const Build = (plus.android as any).importClass('android.os.Build')
      if (Build.VERSION.SDK_INT >= 33) {
        // 回调拿不到授权结果，只能在用户决策后重新查询状态
        const recheck = () => {
          querySystemPermission('notification').then((v) => resolve(v === true))
        }
        plus.android.requestPermissions(
          ['android.permission.POST_NOTIFICATIONS'],
          recheck,
          recheck,
        )
        return
      }
    } catch (e) {
      console.warn('[privacy] request notification permission failed', e)
    }
    querySystemPermission('notification').then((v) => resolve(v === true))
    // #endif
    // #ifndef APP-PLUS
    resolve(true)
    // #endif
  })
}

/**
 * 拉起系统授权弹窗；已被永久拒绝时引导用户去系统设置页。
 * @returns 用户本次是否拿到了授权
 */
export async function ensureSystemPermission(
  scope: SystemPermissionScope,
  deniedHint: string,
): Promise<boolean> {
  // #ifndef APP-PLUS
  // 非 App 端没有系统授权概念，直接放行（H5 预览不阻塞功能）
  return true
  // #endif

  // #ifdef APP-PLUS
  if (!requirePrivacyConsent()) return false

  // 只有「确认已授权」才提前返回；状态未知（null）必须继续走申请流程
  if ((await querySystemPermission(scope)) === true) return true

  // 首次（或可再次询问时）由系统弹窗决定
  if (await requestSystemPermission(scope)) return true

  // 拿不到 → 引导去系统设置
  const res = await uni.showModal({
    title: '需要相应权限',
    content: deniedHint,
    confirmText: '去设置',
    cancelText: '取消',
  })
  if (!res.confirm) return false
  openAppAuthorizeSetting()
  // 用户返回 App 后给一次重新校验的机会
  return (await querySystemPermission(scope)) === true
  // #endif
}

/** 跳转到本应用的系统权限设置页 */
export function openAppAuthorizeSetting(): void {
  // #ifdef APP-PLUS
  uni.openAppAuthorizeSetting?.({
    fail: () => {
      // 低版本 uni-app 没有该 API，退回到 plus 运行时。
      // app-settings: 是 iOS 私有 scheme，Android 上完全无效；
      // Android 必须用 ACTION_APPLICATION_DETAILS_SETTINGS + package: Uri。
      try {
        // 同上：plus.android 的类型未覆盖反射成员
        const android = plus.android as any
        const main = plus.android.runtimeMainActivity() as any
        const Intent = android.importClass('android.content.Intent')
        const Uri = android.importClass('android.net.Uri')
        const pkg = main.getPackageName()
        const intent = new Intent(
          Intent.ACTION_APPLICATION_DETAILS_SETTINGS,
          Uri.parse('package:' + pkg),
        )
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        main.startActivity(intent)
        return
      } catch (e) {
        console.warn('[privacy] open android settings failed', e)
      }
      // Android 跳转失败时退回 iOS scheme（两端至少有一端能生效）
      plus?.runtime?.openURL?.('app-settings:')
    },
  })
  // #endif
}
