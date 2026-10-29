// 与后端 /auth/* /user/* 响应对齐
export interface User {
  id: number
  nickname: string
  avatar_url: string
  gender: 0 | 1 | 2
  status: 1 | 2 | 3 | 4
  register_source: string
  register_at: string
  last_login_at?: string
  last_login_ip?: string
  agreement_version?: string
  // profile 扩展字段（GET /user/me 返回）
  phone?: string
  email?: string
  wechat_id?: string
  birthday?: string       // "YYYY-MM-DD"
  nationality?: string
  bio?: string
  star_coins?: number
  contribution?: number
}

export interface AuthTokens {
  access_token: string
  refresh_token: string
  access_expires_in: number
  refresh_expires_in: number
}

/** 设备类型：App 端只有 iOS / Android */
export type DeviceType = 'ios' | 'android'

export interface PhoneLoginRequest {
  phone: string
  code: string
  nickname?: string
  avatar_url?: string
  gender?: 0 | 1 | 2
  device_id?: string
  device_type?: DeviceType | string
  device_model?: string
  os_version?: string
  app_version?: string
}

export interface PhoneLoginResponse extends AuthTokens {
  user: User
  is_new: boolean
  agreement_required: boolean
  missing_agreements?: string[]
}

/** POST /auth/apple-login 请求（Sign in with Apple） */
export interface AppleLoginRequest {
  /** uni.login({provider:'apple'}) 返回的一次性 authorization code */
  code: string
  /**
 * 客户端生成的随机串，用于防重放；服务端与 id_token.nonce 比对。
 *
 * 当前请勿传值：uni.login 无法把 nonce 注入 Apple 授权请求，
 * 传随机值会导致服务端判定重放攻击而登录失败。服务端对空值跳过比对。
 */
  nonce?: string
  nickname?: string
  avatar_url?: string
  gender?: 0 | 1 | 2
  device_id?: string
  device_type?: DeviceType | string
  device_model?: string
  os_version?: string
  app_version?: string
}

/**
 * POST /auth/apple-login 响应
 *
 * 字段与手机号登录一致，便于 store 复用同一套写 token 的逻辑。
 */
export interface AppleLoginResponse extends AuthTokens {
  user: User
  /** 本次是否为 Apple 身份首次绑定（新账号或绑定到已有账号） */
  is_new: boolean
  agreement_required: boolean
  missing_agreements?: string[]
}

/**
 * POST /auth/onekey-login 请求（uni 一键登录，App 端本机号码免短信）
 *
 * 只带 univerify 的一次性凭证，**不接受手机号**：
 * 手机号由服务端经 uniCloud 云函数换取，客户端自始至终拿不到。
 */
export interface OneKeyLoginRequest {
  /** uni.login({provider:'univerify'}) 返回的一次性 access_token */
  access_token: string
  /** uni.login({provider:'univerify'}) 返回的 openid */
  openid: string
  nickname?: string
  avatar_url?: string
  gender?: 0 | 1 | 2
  device_id?: string
  device_type?: DeviceType | string
  device_model?: string
  os_version?: string
  app_version?: string
}

/**
 * POST /auth/onekey-login 响应
 *
 * 字段与手机号登录一致，便于 store 复用同一套写 token 的逻辑。
 */
export interface OneKeyLoginResponse extends AuthTokens {
  user: User
  is_new: boolean
  agreement_required: boolean
  missing_agreements?: string[]
}

/**
 * 后端一键登录业务码（internal/pkg/errno），前端据此决定 UI 行为。
 *
 * - OneKeyUnavailable  → 永久隐藏一键登录入口（服务端未开通 / 设备不支持）
 * - OneKeyExchangeFailed → 保留入口但提示改用短信验证码
 */
export const ERRNO_ONE_KEY_UNAVAILABLE = 40027
export const ERRNO_ONE_KEY_EXCHANGE_FAILED = 40028

export interface SendSmsResult {
  /** 验证码有效期（秒） */
  expires_in: number
  /** 距下次可重发的秒数 */
  retry_after: number
}

/** 协议同意来源（后端白名单，越界会被拒绝） */
export type AgreementSource = 'login' | 'privacy_popup' | 'agreement_page'

/**
 * 协议 / 隐私政策签署记录（GET /user/agreements）
 *
 * 后端为合规展示做了裁剪：只回传展示所需字段，
 * IP、设备型号等属于后台留存字段，不下发给 App。
 */
export interface AgreementRecord {
  id: number
  agreement_type: 'user_agreement' | 'privacy_policy' | string
  version: string
  source: string
  accepted_at: string
  device_type: string
  platform: string
}
