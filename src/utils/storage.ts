// 封装 token 在本地的存取。
// 小程序用 uni.setStorageSync / uni.getStorageSync（同步、跨页面、关闭进程后还在）
// key 加 fans: 前缀，方便后面 grep 清理

const KEY_ACCESS = 'fans:auth:access'
const KEY_REFRESH = 'fans:auth:refresh'

export function getAccessToken(): string {
  return uni.getStorageSync(KEY_ACCESS) || ''
}
export function getRefreshToken(): string {
  return uni.getStorageSync(KEY_REFRESH) || ''
}
export function setTokens(access: string, refresh: string) {
  uni.setStorageSync(KEY_ACCESS, access)
  uni.setStorageSync(KEY_REFRESH, refresh)
}
export function clearTokens() {
  uni.removeStorageSync(KEY_ACCESS)
  uni.removeStorageSync(KEY_REFRESH)
}

const KEY_USER = 'fans:auth:user'
export function getCachedUser(): any | null {
  return uni.getStorageSync(KEY_USER) || null
}
export function setCachedUser(u: any) {
  uni.setStorageSync(KEY_USER, u)
}
export function clearCachedUser() {
  uni.removeStorageSync(KEY_USER)
}

// 微信通知授权弹窗：记录是否已向该用户弹过，避免每次登录都弹
const KEY_NOTIF_PROMPTED = 'fans:notif:prompted'
export function hasNotifPrompted(): boolean {
  return !!uni.getStorageSync(KEY_NOTIF_PROMPTED)
}
export function setNotifPrompted() {
  uni.setStorageSync(KEY_NOTIF_PROMPTED, '1')
}

// 401 回跳：登录成功后想把用户带回原页面，先把 pageSnapshot 存这里
const KEY_RETURN_TO = 'fans:auth:returnTo'
export function setReturnTo(snapshot: object) {
  uni.setStorageSync(KEY_RETURN_TO, snapshot)
}
export function getReturnTo<T = any>(): T | null {
  return uni.getStorageSync(KEY_RETURN_TO) || null
}
export function clearReturnTo() {
  uni.removeStorageSync(KEY_RETURN_TO)
}

// 启动免责声明：记录用户是否已阅读过，只在首次启动时显示
const KEY_DISCLAIMER_SHOWN = 'fans:disclaimer:shown'
export function hasDisclaimerShown(): boolean {
  return !!uni.getStorageSync(KEY_DISCLAIMER_SHOWN)
}
export function setDisclaimerShown() {
  uni.setStorageSync(KEY_DISCLAIMER_SHOWN, '1')
}
