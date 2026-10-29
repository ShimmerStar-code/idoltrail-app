// 封装 token 在本地的存取。
// 小程序用 uni.setStorageSync / uni.getStorageSync（同步、跨页面、关闭进程后还在）
// key 加 fans: 前缀，方便后面 grep 清理

const KEY_ACCESS = 'fans:auth:access'
const KEY_REFRESH = 'fans:auth:refresh'
/**
 * token 的本地到期时间戳（ms，Date.now() 基准）。
 *
 * 服务端在登录 / refresh 响应里下发 access_expires_in / refresh_expires_in，
 * 落盘后客户端才能做「主动滑动续期」：在 token 真的过期前先换新，
 * 既避免第一个请求吃 401，也能把 refresh 的有效期不断往后推。
 */
const KEY_ACCESS_EXP = 'fans:auth:access_exp'
const KEY_REFRESH_EXP = 'fans:auth:refresh_exp'
/**
 * 上次拿到新 refresh token 的时间戳（ms）。
 *
 * 滑动续期的判定基准：距上次续期超过阈值（24 小时）就主动换一次，
 * 把 refresh 的有效期重置为「当天 + 60 天」。
 * 只看「剩余有效期」不够 —— 那种判定下用户明明还在正常使用 App，
 * 却可能因为没触达阈值而错过续期。
 */
const KEY_REFRESH_AT = 'fans:auth:refresh_at'

export function getAccessToken(): string {
  return uni.getStorageSync(KEY_ACCESS) || ''
}
export function getRefreshToken(): string {
  return uni.getStorageSync(KEY_REFRESH) || ''
}

/** access token 到期时间戳（ms）。0 = 未知（老版本客户端没写过这个值） */
export function getAccessExpiresAt(): number {
  return Number(uni.getStorageSync(KEY_ACCESS_EXP)) || 0
}

/** refresh token 到期时间戳（ms）。0 = 未知（老版本客户端没写过这个值） */
export function getRefreshExpiresAt(): number {
  return Number(uni.getStorageSync(KEY_REFRESH_EXP)) || 0
}

/** 上次续期（登录或 refresh 成功）的时间戳（ms）。0 = 从未续期过 */
export function getRefreshedAt(): number {
  return Number(uni.getStorageSync(KEY_REFRESH_AT)) || 0
}

/**
 * 写入 token。
 *
 * accessExpiresIn / refreshExpiresIn 为服务端下发的剩余秒数（可选）：
 * 传了就刷新本地到期时间，不传则沿用旧值 —— 避免「只拿到 token 字符串
 * 却把已知的到期时间抹掉」。
 */
export function setTokens(
  access: string,
  refresh: string,
  accessExpiresIn?: number,
  refreshExpiresIn?: number,
) {
  uni.setStorageSync(KEY_ACCESS, access)
  uni.setStorageSync(KEY_REFRESH, refresh)
  const now = Date.now()
  if (typeof accessExpiresIn === 'number' && accessExpiresIn > 0) {
    uni.setStorageSync(KEY_ACCESS_EXP, now + accessExpiresIn * 1000)
  }
  if (typeof refreshExpiresIn === 'number' && refreshExpiresIn > 0) {
    uni.setStorageSync(KEY_REFRESH_EXP, now + refreshExpiresIn * 1000)
    // 本次登录 / 续期的时间点，作为下一次滑动续期的基准
    uni.setStorageSync(KEY_REFRESH_AT, now)
  }
}
export function clearTokens() {
  uni.removeStorageSync(KEY_ACCESS)
  uni.removeStorageSync(KEY_REFRESH)
  uni.removeStorageSync(KEY_ACCESS_EXP)
  uni.removeStorageSync(KEY_REFRESH_EXP)
  uni.removeStorageSync(KEY_REFRESH_AT)
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
