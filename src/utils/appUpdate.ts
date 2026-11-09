// App 统一升级入口（全量升级 / 整包 APK）
//
// ── 为什么是「全量升级」 ───────────────────────────────────────────────
//
// 当前阶段只走**整包更新**（type = 'native_app'），不做 wgt 热更新：
//   · wgt 热更新要求「不重启即可生效」，但本项目的改动普遍涉及
//     manifest / 原生模块 / 分包结构，热更新后行为不可预期；
//   · 整包更新的语义与商店上架一致（用户装的就是完整包）；
//   · 插件的升级页、下载进度、原生安装器唤起都已实现，整包路径最成熟。
//
// ── 为什么版本数据源仍然是自研后端，而不是插件自带的云函数 ────────────────
//
// 插件的 `checkUpdate()` 内部硬编码调用 uniCloud 云函数 `uni-upgrade-center`，
// 版本记录放在 uniCloud 数据库 `opendb-app-versions` 集合里。
//
// 但本项目已经有一套**完整的版本体系**（都在 Go 后端 + MySQL）：
//
//	后端 app_versions 表 + GET /public/app-versions/latest
//	                  + GET /public/app-versions/download（302 到 CDN 直链）
//	运营在管理后台「App 版本与下载」录入
//	官网下载区 / 已印发的二维码 / App 内提示 —— **同源**
//
// 若再引入一套 uniCloud 版本表，运营就要在**两个地方**录版本，
// 官网下载区还得单独维护 —— 那不是「统一」，是又多一个源。
//
// 所以这里的做法是：**数据源留在自研后端，借用插件的升级页与下载安装能力**。
// 插件的 `showUpdate(packageInfo)` 明确支持显式传入包信息
// （不传时才用最近一次 checkUpdate 的结果），所以不需要云函数、不需要
// uniCloud 数据库、不需要第二个服务空间 —— 版本录入仍然只有一处。
//
// ── 字段映射 ────────────────────────────────────────────────────────────
//
//	插件 UniUpgradeCenterResult      ←  自研 AppVersionInfo
//	version                          ←  version_name   （与 APK 的 versionName 一致）
//	url                              ←  download_url   （uniCloud 云存储 CDN 直链）
//	contents                         ←  notes          （更新说明）
//	is_mandatory                     ←  mandatory      （强制更新）
//	type                             ←  固定 'native_app'（全量升级）
//	platform                         ←  ['Android']    （后端 platform=android）
//
// ── 合规 ────────────────────────────────────────────────────────────────
//
// 检查更新要发网络请求 → **必须在用户同意隐私协议之后**才能发起。
// 调用方（App.vue 的 afterPrivacyConsent）已保证这一点；
// 本模块自己也再查一次 hasPrivacyConsent()，不依赖调用方的正确性。

import { appVersionApi, isNewerVersion } from '@/api/appVersion'
import type { AppVersionInfo } from '@/types/appVersion'
import { getAppVersion } from '@/utils/device'
import { hasPrivacyConsent } from '@/utils/privacy'
import { createUpdateManager } from '@/uni_modules/uni-upgrade-center-app/utils/update-manager'
import type { UniUpgradeCenterResult } from '@/uni_modules/uni-upgrade-center-app/utils/call-check-version'

/**
 * 升级管理器单例。
 *
 * 插件内部也是单例（`createUpdateManager` 复用同一个实例），
 * 这里是应用层唯一的入口，避免各处各建一个导致「弹窗重复打开」守卫失效。
 */
const updateManager = createUpdateManager()

/** AppID（与 src/manifest.json 的 appid 一致），升级页用它做包标识 */
const APP_ID = '__UNI__F1F9279'

/**
 * 「已提示过的版本」本地缓存 key。
 *
 * 为什么要记：非强制升级时用户可以关掉弹窗。若不记，
 * 每次冷启动都弹一次同样的升级提示 —— 用户关几次就烦了，
 * 反而会以为是骚扰广告。
 *
 * 记录的是**版本号**而不是时间戳：运营发了新版本后要能再次提示，
 * 而同一个版本不该重复打扰。
 */
const KEY_PROMPTED_VERSION = 'fans:upgrade:prompted:v1'

/** 检查结果 */
export type UpdateCheckOutcome =
  /** 已是最新（也含"后端还没配版本"） */
  | { status: 'up_to_date' }
  /** 有新版本，已弹出升级页 */
  | { status: 'prompted'; info: AppVersionInfo }
  /** 有新版本，但同一版本之前已提示过且非强制 → 静默跳过 */
  | { status: 'skipped'; info: AppVersionInfo }
  /** 当前平台不走整包升级（iOS 走 App Store / TestFlight 分发） */
  | { status: 'unsupported_platform' }
  /** 检查失败（网络等） */
  | { status: 'failed'; message: string }

/** 当前平台（只关心 android / ios） */
export type UpgradePlatform = 'android' | 'ios'

/**
 * 取当前运行平台。
 *
 * `uni.getSystemInfoSync().platform` 在 App 端返回 'android' / 'ios'；
 * H5 与小程序端返回 'devtools' / 'mp-weixin' 之类，一律按不支持处理。
 */
export function currentUpgradePlatform(): UpgradePlatform | null {
  try {
    const platform = String(uni.getSystemInfoSync().platform || '').toLowerCase()
    if (platform === 'android') return 'android'
    if (platform === 'ios') return 'ios'
    return null
  } catch {
    return null
  }
}

/** 读已提示过的版本号 */
function readPromptedVersion(): string {
  try {
    return (uni.getStorageSync(KEY_PROMPTED_VERSION) as string) || ''
  } catch {
    return ''
  }
}

/** 记下"这个版本已经提示过" */
function markPrompted(version: string): void {
  try {
    uni.setStorageSync(KEY_PROMPTED_VERSION, version)
  } catch {
    /* 写不进去也不影响升级流程 */
  }
}

/** 自研后端的版本记录 → 插件的包信息结构 */
function toPackageInfo(info: AppVersionInfo): UniUpgradeCenterResult {
  return {
    _id: '',
    appid: APP_ID,
    name: 'idoltrail',
    title: '发现新版本',
    contents: info.notes || '',
    url: info.download_url,
    platform: ['Android'],
    version: info.version_name,
    uni_platform: 'android',
    stable_publish: true,
    is_mandatory: !!info.mandatory,
    effective_is_mandatory: !!info.mandatory,
    // 全量升级：必须让用户看到更新说明并确认，不静默、不走通知栏直接装
    is_silently: false,
    is_update_prompt: false,
    update_prompt: null,
    update_prompt_content: null,
    min_required_version: null,
    create_env: 'upgrade-center',
    create_date: Date.now(),
    message: '',
    code: 0,
    // 全量升级 = 整包 APK
    type: 'native_app',
    store_list: null,
    min_uni_version: null,
    sha256: null,
  }
}

/**
 * 检查是否有新版本，有则弹出升级页。
 *
 * @param options.manual 用户手动点「检查更新」→ 即使同一版本提示过也再弹一次
 * @param options.silent 失败时不抛错（只返回 failed 状态）——
 *   启动时的自动检查必须静默，不能弹 toast 打扰用户
 */
export async function checkAppUpdate(
  options?: { manual?: boolean; silent?: boolean },
): Promise<UpdateCheckOutcome> {
  // 隐私门禁：检查更新要发网络请求，必须在用户同意隐私协议之后。
  if (!hasPrivacyConsent()) {
    return { status: 'failed', message: '未同意隐私协议，跳过检查更新' }
  }

  const platform = currentUpgradePlatform()
  if (platform !== 'android') {
    // iOS 的分发是 App Store / TestFlight，没有可直装的整包；
    // 在 App 里引导用户去商店更新，而不是塞一个装不上的 IPA。
    return { status: 'unsupported_platform' }
  }

  let info: AppVersionInfo
  try {
    info = await appVersionApi.fetchLatest('android')
  } catch (e) {
    const message = e instanceof Error ? e.message : '检查更新失败'
    if (!options?.silent) {
      uni.showToast({ title: message, icon: 'none' })
    }
    return { status: 'failed', message }
  }

  // 后端还没录版本（download_url 为空）→ 视为已是最新。
  // 注意不能当成错误：刚上线时后台没录版本是常态，不该弹 toast 吓人。
  if (!info?.version_name || !info.download_url) {
    return { status: 'up_to_date' }
  }

  const current = getAppVersion()
  if (!current || !isNewerVersion(info.version_name, current)) {
    return { status: 'up_to_date' }
  }

  // 同一版本已经提示过、且不是强制升级 → 不重复打扰。
  // 强制升级每次都要弹（用户可能一直点"稍后"）。
  if (!options?.manual && !info.mandatory && readPromptedVersion() === info.version_name) {
    return { status: 'skipped', info }
  }
  markPrompted(info.version_name)

  try {
    // 复用插件自带的升级页：显示更新说明、强制/非强制、下载进度、原生安装器唤起。
    // 插件的 showUpdate 会用 uni.navigateTo 打开
    // /uni_modules/uni-upgrade-center-app/pages/upgrade-popup
    // （该页已在 src/pages.json 注册，路径是插件写死的绝对路径，不能改）。
    await updateManager.showUpdate(toPackageInfo(info))
    return { status: 'prompted', info }
  } catch (e) {
    const message = e instanceof Error ? e.message : '打开升级页失败'
    if (!options?.silent) {
      uni.showToast({ title: message, icon: 'none' })
    }
    return { status: 'failed', message }
  }
}

/**
 * 启动后的自动检查（延迟调用）。
 *
 * 为什么要延迟：
 *   · 启动瞬间网络最拥堵，检查更新不是首屏必需的东西，抢带宽没意义；
 *   · 隐私弹窗此时可能正在关闭（mask 动画），弹升级页会被遮住，
 *     用户看到的是"弹了个东西但点不动"。
 */
export function scheduleStartupUpdateCheck(delayMs = 3000): void {
  setTimeout(() => {
    void checkAppUpdate({ silent: true })
  }, delayMs)
}
