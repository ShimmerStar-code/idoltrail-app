/**
 * uni-upgrade-center-app 插件的**本地类型声明**。
 *
 * ── 为什么不用插件自带的 .ts 源码 ────────────────────────────────────────
 *
 * 插件的 utils 是按「uni-app x + 条件编译」写的，在传统 uni-app 的
 * TypeScript 环境里**它们自身就编译不过**：
 *
 *   · `UTSJSONObject` / `DownloadTask` / `DownloadFileSuccess`
 *     是 uni-app x 才有的类型；
 *   · `uni.installApk` / `uni.openDialogPage` 是 uni-app x 的 API；
 *   · 同一文件的 `#ifdef` / `#else` 分支在 TS 看来是重复声明
 *     （TS2393 / TS2451）；
 *   · `#ifdef UNI-APP-X` 里的 import 在传统端无对应模块（TS2307）。
 *
 * 这些文件不是我们维护的，也不该由本项目的 `npm run type-check` 拦下。
 * 但业务代码（src/utils/appUpdate.ts）要 import 插件的 API，
 * 于是：
 *
 *   · tsconfig 的 `exclude` 排掉 `src/uni_modules`（不影响 include 之外的根文件）；
 *   · tsconfig 的 `paths` 把这两个**具体**模块路径指向本文件，
 *     让类型检查看到我们维护的声明，而不是插件源码。
 *
 * ⚠️ 只影响**类型检查**：运行时 vite 用自己的 alias（`@` → `src`）解析，
 * 加载的仍是插件的真实源码，行为不变。
 */

/** 插件的包信息结构（字段与插件的 UniUpgradeCenterResult 对齐） */
export interface UniUpgradeCenterResult {
  _id: string
  appid: string
  name: string
  title: string
  contents: string
  /** 安装包下载地址（http(s) 直链或 cloud:// 云存储路径） */
  url: string
  /** ['Android'] / ['iOS'] / ['Harmony'] */
  platform: string[]
  /** 版本号，如 0.1.2 */
  version: string
  uni_platform: string
  stable_publish: boolean
  /** 是否强制更新（不可跳过） */
  is_mandatory: boolean
  effective_is_mandatory?: boolean | null
  is_silently?: boolean | null
  is_update_prompt?: boolean | null
  update_prompt?: 'modal' | 'toast' | null
  update_prompt_content?: string | null
  min_required_version?: string | null
  create_env: string
  create_date: number
  message: string
  code: number
  /** 'native_app' = 整包升级；'wgt' = 资源包热更新 */
  type: string
  store_list: unknown[] | null
  min_uni_version: string | null
  sha256: string | null
}

/** 任务身份：把一次「检查」与后续的下载/安装/提醒串起来 */
export interface UpdateTaskContext {
  taskId: string
  checkId: number
}

/** 检查更新的可注入参数（正式环境不传，读真实应用信息） */
export interface CheckUpdateOptions {
  appid?: string
  appVersion?: string
  appWgtVersion?: string
}

/** 升级管理器 */
export interface UpdateManager {
  checkUpdate: (options?: CheckUpdateOptions) => Promise<unknown>
  showUpdate: (
    packageInfo?: UniUpgradeCenterResult,
    component?: unknown,
    taskContext?: UpdateTaskContext,
  ) => Promise<UniUpgradeCenterResult>
  createTaskContext: (checkId?: number) => UpdateTaskContext
  applyUpdate: () => void
  onCheckForUpdate: (listener: (event: unknown) => void) => void
  offCheckForUpdate: (listener: (event: unknown) => void) => void
  onUpdateReady: (listener: (event: unknown) => void) => void
  offUpdateReady: (listener: (event: unknown) => void) => void
  onUpdateFailed: (listener: (event: unknown) => void) => void
  offUpdateFailed: (listener: (event: unknown) => void) => void
  handleAppHide: () => void
  handleAppShow: () => void
  deferUpdate: () => void
  notifyUpdateReady: (
    packageInfo: UniUpgradeCenterResult,
    taskId?: string,
    promptAfterInstall?: boolean,
    taskContext?: UpdateTaskContext,
  ) => void
  notifyApkDownloaded: (
    packageInfo: UniUpgradeCenterResult,
    filePath: string,
    taskContext?: UpdateTaskContext,
  ) => void
  startNotificationDownload: (
    packageInfo: UniUpgradeCenterResult,
    taskContext?: UpdateTaskContext,
  ) => void
  promptNotificationInstall: () => void
  notifyUpdateFailed: (event: unknown) => void
}

declare module '@/uni_modules/uni-upgrade-center-app/utils/update-manager' {
  export type {
    CheckUpdateOptions,
    UpdateManager,
    UpdateTaskContext,
  } from './uni-upgrade-center'
  export function createUpdateManager(): UpdateManager
}

declare module '@/uni_modules/uni-upgrade-center-app/utils/call-check-version' {
  export type { UniUpgradeCenterResult } from './uni-upgrade-center'
}
