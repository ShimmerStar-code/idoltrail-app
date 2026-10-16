// App 端隐私合规封装。
//
// 与小程序端的差异：
//   小程序 → 依赖微信隐私框架（wx.onNeedPrivacyAuthorization）被动触发，同意结果回传给微信；
//   App    → 由我们自己维护「已同意 + 协议版本」状态，**同意之前禁止调用任何需要系统授权的
//            系统 API**（通知、相册、相机等），这是国内应用商店与 GDPR 的硬性要求。
//
// 本文件不依赖任何微信 API。App 端与 H5 端共用同一实现：
// 条件编译只使用 `#ifdef APP-PLUS`（本项目编译管线唯一可靠识别的平台标识），
// App 内部再按 `plus.os.name` 做 Android / iOS 分流。
//
// **禁止使用 `#ifdef APP-ANDROID` / `#ifdef APP-IOS`。** 它们虽在官方文档中合法，
// 但在本项目会被整块剔除，直接导致 requestLocationPermission 编译成
// `new Promise(()=>{})`，定位链路死锁且无任何日志。真机已复现，改动前务必先读
// requestLocationPermission 的注释。

import { PRIVACY_VERSION } from '@/constants/agreements'

// 版本号统一由 constants/agreements.ts 维护（协议正文与版本号必须同处一个文件），
// 此处只做转出，保证 `import { PRIVACY_VERSION } from '@/utils/privacy'` 的老调用点不断。
export { PRIVACY_VERSION }

const KEY_PRIVACY_VERSION = 'fans:privacy:version'

/**
 * 申请定位权限的兜底超时（ms）。
 *
 * 必须**小于**调用方的兜底预算，否则权限申请还在等用户点，
 * 调用方已经先一步降级了，这次授权的结果会被白白浪费：
 *   · 首页 doLocate() 的兜底是 15s
 *   · CityPicker reLocate() 的兜底是 20s
 * 取 10s：给系统权限弹窗留了足够的思考时间（正常是 1~3s），
 * 又保证最坏情况下权限这一段先结束、把余量留给随后的系统定位（8s）与逆地理请求。
 *
 * 超时后按**当前系统状态**返回，而不是一律 false：
 * 用户可能已经授了权、只是回调没回来，此时应放行给 getLocation 去用。
 */
const PERMISSION_TIMEOUT = 10000

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
 * location 仅用于「查询是否已授权」；**不要**用 ensureSystemPermission 申请它，
 * 那条路径带「去系统设置」弹窗，而首页定位是静默降级场景，不该因此打断用户。
 * 定位的申请流程见 requestLocationPermission。
 */
export type SystemPermissionScope = 'notification' | 'album' | 'camera' | 'location'

/** scope → getAppAuthorizeSetting 结果里的字段名 */
const SCOPE_FIELD: Record<SystemPermissionScope, string> = {
  notification: 'notificationAuthorized',
  album: 'albumAuthorized',
  camera: 'cameraAuthorized',
  location: 'locationAuthorized',
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

  if (scope === 'location') {
    return requestLocationPermission()
  }

  // album / camera：没有独立的申请 API，实际的系统选择器由页面的
  // uni.chooseImage 拉起。这里如实返回当前状态：已授权 → true，未授权 → false，
  // 由上层引导去系统设置页。绝不能无脑 return true。
  return querySystemPermission(scope).then((v) => v === true)
}

/**
 * Android 精确查询定位权限：FINE（精确位置）与 COARSE（大致位置）任一授权即算可用。
 *
 * 不直接信任 `uni.getAppAuthorizeSetting().locationAuthorized`：用户只勾选
 * 「大致位置」时该字段可能仍报 denied，会把完全可用的粗略定位误判为不可用，
 * 白白退化成 IP 定位。
 *
 * **平台判定必须放在运行时（`plus.os.name`），不能用 `#ifdef APP-ANDROID`。**
 * 本项目的编译管线只识别 `APP-PLUS`；`APP-ANDROID` / `APP-IOS` 虽在文档中合法，
 * 但在这里会被整块剔除——后果是 `requestLocationPermission` 被编译成
 * `new Promise(()=>{})`（空执行器），`await` 永久挂起，整条定位链路死锁且不打任何日志。
 * 已真机复现，修复方式见 requestLocationPermission。
 */
function checkAndroidLocationGranted(): boolean {
  // #ifdef APP-PLUS
  try {
    // iOS 没有 Android 的运行时权限模型，这里必须提前返回：
    // 否则 plus.android 在 iOS 上不存在，会被下面的 catch 吞掉并打出误导性的告警。
    if (plus.os.name !== 'Android') return false
    // plus.android 的类型定义没覆盖反射出来的静态常量，只能断言
    const android = plus.android as any
    const main = android.runtimeMainActivity()
    const PackageManager = android.importClass('android.content.pm.PackageManager')
    const granted = PackageManager.PERMISSION_GRANTED
    return (
      main.checkSelfPermission('android.permission.ACCESS_FINE_LOCATION') === granted ||
      main.checkSelfPermission('android.permission.ACCESS_COARSE_LOCATION') === granted
    )
  } catch (e) {
    console.warn('[privacy] check android location permission failed', e)
  }
  // #endif
  return false
}

/**
 * 真正发起定位权限申请的平台相关逻辑。
 *
 * 单独抽成一个函数有两个原因：
 *   1. 让 `requestLocationPermission` 的超时竞速与平台分支解耦；
 *   2. **vue-tsc 不处理条件编译**，所以 `#ifdef` 与 `#ifndef` 两个分支内
 *      不能出现同名块级变量（会被判成 duplicate implementation 而报错）。
 *      因此这里只在分支里放语句，不放 const/let。
 */
function doRequestLocationPermission(): Promise<boolean> {
  return new Promise((resolve) => {
    // #ifdef APP-PLUS
    // iOS：授权弹窗只能由 CoreLocation 在真正请求位置时拉起，plus 层无法预申请，
    // 这里放行，让随后的 uni.getLocation 去触发系统弹窗。
    if (plus.os.name !== 'Android') {
      resolve(true)
      return
    }

    // 已授权就直接返回：用户拒绝后再进来、切换城市等场景会重复调用本函数，
    // 若无脑 requestPermissions，部分 ROM 在「已授予」状态下不触发回调，会永久 pending。
    if (checkAndroidLocationGranted()) {
      console.log('[privacy] 定位权限已授予，跳过 requestPermissions')
      resolve(true)
      return
    }

    try {
      plus.android.requestPermissions(
        ['android.permission.ACCESS_COARSE_LOCATION', 'android.permission.ACCESS_FINE_LOCATION'],
        // 两个回调都拿不到 granted 列表，只能在用户决策之后重新查询系统权限
        () => resolve(checkAndroidLocationGranted()),
        () => resolve(checkAndroidLocationGranted()),
      )
    } catch (e) {
      console.warn('[privacy] request location permission failed', e)
      resolve(checkAndroidLocationGranted())
    }
    // #endif
    // #ifndef APP-PLUS
    // 非 App 端（H5 预览）没有运行时定位权限模型，定位由浏览器 geolocation 自己弹框，直接放行。
    resolve(true)
    // #endif
  })
}

/**
 * 申请定位权限，**静默**：拿不到就静默失败，不弹「去设置」引导。
 *
 * 三条必须写死的约束（每一条都对应一次真机故障）：
 *   1. **平台判定用运行时 `plus.os.name`，禁止 `#ifdef APP-ANDROID` / `#ifdef APP-IOS`**。
 *      本项目编译管线只识别 `APP-PLUS`，这两个标识会被整块剔除，
 *      结果申请函数被编译成 `new Promise(()=>{})`：空执行器、永不 settle。
 *      定位链路随之死锁——CityPicker 永远显示「定位中...」，且**一条日志都打不出来**，
 *      因为执行器内没有任何语句可执行。真机已复现，务必不要「优化」回条件编译。
 *   2. **已授权时绝不能再调 requestPermissions**。部分 ROM 在「权限已授予」状态下
 *      不触发任何回调，没有下面的短路就会永久 pending。
 *   3. **外层必须有兜底超时**。这是对约束 1 的最后一道防线：
 *      任何原因导致内部任务不 settle（包括再次踩到条件编译被剔除、执行器被清空），
 *      都只会多等 PERMISSION_TIMEOUT，绝不会把整条链路挂死。
 *      超时值必须小于调用方（首页 15s / CityPicker 20s）的兜底预算，否则会白等。
 *      实现上不用 Promise.race 而是自己包一层 Promise：race 拿不到定时器句柄，
 *      快路径先返回时定时器仍会悬挂触发，见下方 clearTimeout。
 *
 * @returns 是否已具备定位权限（iOS 恒为 true，真正的结果由 getLocation 的回调给出）
 */
export function requestLocationPermission(): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | null = null
  return new Promise<boolean>((resolve) => {
    // 快路径先注册：iOS / H5 / 已授权的 Android 都会在 doRequest 里同步 resolve，
    // 此时 timer 还是 null，清不清理都无所谓。
    let settled = false
    const done = (granted: boolean) => {
      if (settled) return
      settled = true
      // 必须清理：否则正常路径下定时器仍会在 PERMISSION_TIMEOUT 后触发，
      // 白跑一次 checkAndroidLocationGranted()。反复打开 CityPicker 会堆积悬挂定时器。
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      resolve(granted)
    }

    void doRequestLocationPermission().then(done)

    // 兜底：任何原因导致内部任务不 settle（包括再次踩到条件编译被剔除、执行器被清空），
    // 最多多等 PERMISSION_TIMEOUT，绝不会把整条定位链路挂死。
    timer = setTimeout(() => {
      timer = null
      console.warn('[privacy] 申请定位权限超时，按当前系统状态处理')
      done(checkAndroidLocationGranted())
    }, PERMISSION_TIMEOUT)
  })
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
