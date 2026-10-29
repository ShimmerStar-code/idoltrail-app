// App 版本信息（检查更新）。
//
// 对应后端公开接口：GET /api/v1/public/app-versions/latest?platform=android
//
// 数据源与官网下载区、后台二维码**同源**：
//   运营在管理后台「App 版本与下载」里录入新版本 → 这里立刻能查到。
//   因此运营改一次版本，官网按钮、已印发的二维码、App 内提示全部同步，
//   不需要为了改一句更新说明就发一个版。

export type AppPlatform = 'android' | 'ios'

export interface AppVersionInfo {
  /** 平台 */
  platform: AppPlatform
  /** 版本号，与 APK 内 manifest.json 的 versionName 一致，如 0.1.1 */
  version_name: string
  /** 版本号数值，用于比较新旧（0.1.1 → 1001） */
  version_code: number
  /** 安装包下载直链（uniCloud 云存储的永久链接） */
  download_url: string
  /** 安装包字节数，0 表示未录入 */
  file_size: number
  /** 渠道标签，如「内部测试版」；空串表示正式版 */
  channel: string
  /** 是否强制更新：1 时提示不可跳过 */
  mandatory: boolean
  /** 更新说明 */
  notes: string
  /** 对外发布时间 */
  published_at?: string
}
