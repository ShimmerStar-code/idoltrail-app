const required = [
  'APP_VERSION_ACCESS_KEY',
  'APP_API_BASE_URL',
  'RELEASE_VERSION',
  'RELEASE_VERSION_CODE',
  'APK_DOWNLOAD_URL',
  'APK_FILE_SIZE',
]
for (const name of required) {
  if (!process.env[name]) throw new Error(`缺少环境变量 ${name}`)
}

const versionCode = Number(process.env.RELEASE_VERSION_CODE)
const fileSize = Number(process.env.APK_FILE_SIZE)
if (!Number.isSafeInteger(versionCode) || versionCode <= 0) throw new Error('versionCode 无效')
if (!Number.isSafeInteger(fileSize) || fileSize <= 0) throw new Error('APK 文件大小无效')
const baseUrl = process.env.APP_API_BASE_URL.replace(/\/+$/, '')
const response = await fetch(`${baseUrl}/admin/app-versions`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Access-Key': process.env.APP_VERSION_ACCESS_KEY,
  },
  body: JSON.stringify({
    platform: 'android',
    version_name: process.env.RELEASE_VERSION,
    version_code: versionCode,
    download_url: process.env.APK_DOWNLOAD_URL,
    file_size: fileSize,
    channel: 'github-actions',
    mandatory: false,
    notes: `GitHub Actions 发布 ${process.env.RELEASE_TAG || process.env.RELEASE_VERSION}`,
    is_current: true,
  }),
})
const body = await response.json().catch(() => null)
if (!response.ok || body?.code !== 0) {
  throw new Error(`后台版本同步失败：HTTP ${response.status}，${body?.message || '响应格式异常'}`)
}
console.log(`后台已发布 Android ${process.env.RELEASE_VERSION}，记录 ID：${body.data?.id || '未知'}`)
