import { request } from '@/utils/request'
import type {
  AppleLoginRequest,
  AppleLoginResponse,
  PhoneLoginRequest,
  PhoneLoginResponse,
  SendSmsResult,
} from '@/types/auth'

export const authApi = {
  /** 发送短信验证码（公开接口，服务端按 IP / 手机号双维度频控） */
  sendSms(phone: string, scene = 'login'): Promise<SendSmsResult> {
    return request<SendSmsResult>('/auth/sms/send', {
      method: 'POST',
      data: { phone, scene },
      // 未登录接口，频控错误码由调用方（LoginModal）自行处理，不弹全局登录框
      skipAuth: true,
      skipAuthRedirect: true,
      // silent：登录框打开时全局 toast 会被 popup 的 mask（z-index 9999）遮住，
      // 频控/通道错误改由 LoginModal 用内联文案展示
      silent: true,
    })
  },

  /** 手机号 + 短信验证码登录（未注册自动注册） */
  phoneLogin(data: PhoneLoginRequest): Promise<PhoneLoginResponse> {
    return request<PhoneLoginResponse>('/auth/phone-login', {
      method: 'POST',
      data,
      skipAuth: true,
      skipAuthRedirect: true,
      // 同上：验证码错误要在登录框内直接告诉用户，不能指望 toast
      silent: true,
    })
  },

  /**
   * Sign in with Apple 登录（iOS）
   *
   * 语义由服务端 OptionalAuth 决定：
   *   - 已绑定且未带 token → 登录原账号
   *   - 未绑定且带了有效 token → 把 Apple 身份绑定到当前账号
   *   - 未绑定且未带 token → 注册新账号
   */
  appleLogin(data: AppleLoginRequest): Promise<AppleLoginResponse> {
    return request<AppleLoginResponse>('/auth/apple-login', {
      method: 'POST',
      data,
      skipAuth: true,
      skipAuthRedirect: true,
      // 同上：错误要在登录框内直接告诉用户（如「该 Apple 账号已绑定其他用户」）
      silent: true,
    })
  },

  // ⚠️ 这里刻意**不暴露** refresh 接口：
  // token 续期必须由 request.ts 内部的 doRefresh() 用裸 uni.request 完成。
  // 若走 request() 封装，它会带上过期的 access token 并再次触发 401 → 续期，
  // 永远解不开 —— 递归自锁。

  // 登出（撤销当前 refresh token）
  logout(): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>('/auth/logout', {
      method: 'POST',
      // 登出时 token 本就处于「即将失效」状态。若不 skipAuthRedirect，
      // 401 会触发续期失败 → 弹「登录已过期」强制登录框，
      // 用户点了登出反而被拦回登录态。
      skipAuthRedirect: true,
    })
  },

  // 全设备登出
  logoutAll(): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>('/auth/logout-all', {
      method: 'POST',
      skipAuthRedirect: true,
    })
  },

  // 签协议
  acceptAgreement(agreementType: string, version: string): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>('/auth/agreement', {
      method: 'POST',
      data: { agreement_type: agreementType, version },
    })
  },
}
