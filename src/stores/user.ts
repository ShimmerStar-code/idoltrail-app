// Pinia store：用户登录态
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {
  User,
  PhoneLoginResponse,
  AppleLoginResponse,
  OneKeyLoginResponse,
  AuthTokens
} from '@/types/auth'
import { authApi } from '@/api/auth'
import { request, resetSessionExpiredNotice } from '@/utils/request'
import { captureCurrentPage, restorePage, type PageSnapshot } from '@/utils/pages'
import {
  getDeviceId,
  getDeviceType,
  getDeviceModel,
  getOsVersion,
  getAppVersion,
} from '@/utils/device'
import {
  getAccessToken,
  getRefreshToken,
  setTokens,
  clearTokens,
  getCachedUser,
  setCachedUser,
  clearCachedUser,
  setReturnTo,
  getReturnTo,
  clearReturnTo,
} from '@/utils/storage'
import { useNotificationStore } from '@/stores/notification'
import { useSubscribeStore } from '@/stores/subscribe'
import { useEventStore } from '@/stores/event'
import { syncPushToken, unbindPushToken } from '@/composables/usePush'

export interface LoginModalOptions {
  /** 是否允许关闭（true=用户可点 × 或"暂不登录"；false=强制登录） */
  dismissible?: boolean
  /** 唤起原因，便于埋点 */
  reason?: string
  /** 登录成功回调（业务代码可在 onSuccess 里 await 后续操作） */
  onSuccess?: () => void | Promise<void>
  /** 用户取消（点 ×、暂不登录、系统返回） */
  onCancel?: () => void
}

export const useUserStore = defineStore('user', () => {
  const accessToken = ref(getAccessToken())
  const refreshToken = ref(getRefreshToken())
  const user = ref<User | null>(getCachedUser())
  const isNew = ref(false)
  const agreementRequired = ref(false)
  const missingAgreements = ref<string[]>([])

  // ── 全局登录弹窗状态 ──
  const showLoginModal = ref(false)
  const loginModalOptions = ref<LoginModalOptions>({})
  /**
   * 弹窗打开期间的**排队**请求。
   * 早期实现直接用 requireLogin 的 opts 覆盖 loginModalOptions，导致弹窗期间第二次
   * 调用时前一个调用方的 onSuccess 丢失，其 `await withLogin(...)` 永不 settle，
   * 页面上表现为按钮永久转圈且无法恢复。
   */
  const loginQueue = ref<LoginModalOptions[]>([])

  // ── 全局隐私弹窗状态（App 首次启动 / 协议升级时置 true） ──
  const showPrivacyPopup = ref(false)
  const privacyPopupReason = ref<'app_launch' | 'login_required' | 'privacy_event'>('app_launch')

  // isLoggedIn 增加 !agreementRequired 条件:
  // "半登录态"(access_token 拿到了但协议没签完)对业务页面仍按"未登录"处理,
  // 这样 requireLogin / 页面 guard 还能正确把用户拦在协议补签流程里。
  const isLoggedIn = computed(
    () => !!accessToken.value && !!user.value && !agreementRequired.value,
  )

  /**
   * setLoginPayload 同时服务手机号登录与 Apple 登录 —— 两个响应结构完全一致。
   */
  function setLoginPayload(p: PhoneLoginResponse | AppleLoginResponse | OneKeyLoginResponse) {
    // 取消原来"needSign 时不写盘 token"的设计 —— 协议补签请求(/auth/agreement)需要带 token,
    // 不写盘会导致 401。改为:token 总是写到 storage 和内存,
    // 但 isLoggedIn 仍为 false(因为 agreementRequired=true),业务页面会按未登录处理。
    // 协议签完后,setAgreementOK() 会把 agreementRequired 关掉,isLoggedIn 自然变 true。
    setTokens(p.access_token, p.refresh_token)
    setCachedUser(p.user)
    accessToken.value = p.access_token
    refreshToken.value = p.refresh_token
    user.value = p.user
    isNew.value = p.is_new
    agreementRequired.value = p.agreement_required
    missingAgreements.value = p.missing_agreements || []
    // 新会话建立:解除 request.ts 的"会话过期已通知"去重锁,
    // 否则本次会话内再次 401 时不会再弹强制登录。
    resetSessionExpiredNotice()
  }

  function setTokensOnly(t: AuthTokens) {
    setTokens(t.access_token, t.refresh_token)
    accessToken.value = t.access_token
    refreshToken.value = t.refresh_token
    resetSessionExpiredNotice()
  }

  function setUser(u: User) {
    setCachedUser(u)
    user.value = u
  }

  function setAgreementOK() {
    agreementRequired.value = false
    missingAgreements.value = []
    // setLoginPayload 现在总是写 token 了,这里再保险写一次(协议页面可能用 in-memory token 走的)
    if (accessToken.value && refreshToken.value) {
      setTokens(accessToken.value, refreshToken.value)
    }
    // 补签协议前 isLoggedIn 为 false，syncPushToken 会在入口直接 return，
    // 导致这批用户的 cid 一直不上报、推送不可达（只有下次切后台才会补报）。
    // 协议签完 isLoggedIn 已转 true，这里必须补一次。
    syncPushToken().catch(() => {})
  }

  // ── 登录弹窗控制 ──
  /**
   * 统一执行调用方的 onSuccess：吞掉异常，避免 App release 包里出现
   * 无提示的未处理 Promise reject（调用方几乎全传 async 函数）。
   */
  function runOnSuccess(cb?: () => void | Promise<void>): void {
    if (!cb) return
    try {
      const r = cb()
      if (r && typeof (r as Promise<void>).catch === 'function') {
        void (r as Promise<void>).catch((e) => {
          console.error('[userStore] onSuccess error', e)
        })
      }
    } catch (e) {
      console.error('[userStore] onSuccess error', e)
    }
  }

  /**
   * 业务调用：未登录则弹全局登录框；已登录则同步执行 onSuccess
   * @returns true=已登录或登录成功；false=用户取消
   */
  function requireLogin(opts: LoginModalOptions = {}): boolean {
    // dismissible 默认 true：省略整个 opts 与只传 reason 两种写法必须等价
    const normalized: LoginModalOptions = { dismissible: true, ...opts }
    if (isLoggedIn.value) {
      runOnSuccess(normalized.onSuccess)
      return true
    }
    if (showLoginModal.value) {
      // 弹窗已开着 → 排队，不覆盖当前回调
      loginQueue.value = [...loginQueue.value, normalized]
      return false
    }
    loginModalOptions.value = normalized
    showLoginModal.value = true
    return false
  }

  /** 队列里还有请求时，把弹窗切到下一个；否则彻底收起 */
  function advanceLoginQueue() {
    const next = loginQueue.value[0]
    if (!next) {
      loginModalOptions.value = {}
      showLoginModal.value = false
      return
    }
    loginQueue.value = loginQueue.value.slice(1)
    loginModalOptions.value = next
    if (!showLoginModal.value) showLoginModal.value = true
  }

  /** LoginModal 内部调用：登录成功 → 关弹窗 → 触发 onSuccess → 401 回跳 */
  async function notifyLoginSuccess() {
    const cb = loginModalOptions.value.onSuccess
    showLoginModal.value = false
    loginModalOptions.value = {}
    if (cb) {
      try {
        await cb()
      } catch (e) {
        console.error('[userStore] onSuccess callback error', e)
      }
    }
    // 登录已经成功，排队的请求不必再弹一次登录框，直接执行
    const queued = loginQueue.value
    loginQueue.value = []
    for (const item of queued) {
      try {
        await item.onSuccess?.()
      } catch (e) {
        console.error('[userStore] queued onSuccess error', e)
      }
    }
    // 登录成功后把本机 cid 上报给后端，建立 App 推送通道
    syncPushToken().catch(() => {})
    // 登录成功后询问是否开启系统通知（弹过一次后不再弹）
    useNotificationStore().promptIfNeeded().catch(() => {})
    // 401 回跳：仅在 storage 里有 snapshot 时执行；冷启动 / 普通 requireLogin 没有
    const snap = getReturnTo<PageSnapshot>()
    if (snap) {
      clearReturnTo()
      restorePage(snap)
    }
  }

  /** LoginModal 内部调用：用户取消/关闭 → 触发 onCancel → 推进队列 */
  function closeLoginModal() {
    const cb = loginModalOptions.value.onCancel
    showLoginModal.value = false
    loginModalOptions.value = {}
    cb?.()
    advanceLoginQueue()
  }

  /**
   * request.ts 在 401 + refresh 失败时调用：
   * 1) 抓当前页面快照存 storage
   * 2) 清掉 token / user
   * 3) 弹强制登录 modal；登录成功后由 notifyLoginSuccess 读 snapshot 回跳
   */
  function handleSessionExpired() {
    const snap = captureCurrentPage()
    if (snap) setReturnTo(snap)
    clear()
    requireLogin({ dismissible: false, reason: 'session_expired' })
  }

  /** PrivacyPopup 弹窗控制 */
  function openPrivacyPopup(reason: 'app_launch' | 'login_required' | 'privacy_event' = 'app_launch') {
    privacyPopupReason.value = reason
    showPrivacyPopup.value = true
  }
  function closePrivacyPopup() {
    showPrivacyPopup.value = false
  }

  function clear() {
    clearTokens()
    clearCachedUser()
    accessToken.value = ''
    refreshToken.value = ''
    user.value = null
    isNew.value = false
    agreementRequired.value = false
    missingAgreements.value = []
    // 清空排队中的登录请求：登出后这些回调已无意义
    loginQueue.value = []
    // 联动清空订阅态,避免登出后脏数据。
    // 必须同步调用：早期版本用动态 import + .then()，clear() 返回时订阅态还没清空，
    // 同一 tick 内 isArtistSubscribed() 仍返回旧值；A 账号的在途响应还会回写覆盖 B 账号。
    // subscribe store 不 import user store，这条链不存在循环依赖，无需动态 import。
    useSubscribeStore().reset()
    // 通知列表 / 未读数 / 通知设置同样带用户私有语义，不清会串号：
    // 切号后角标与消息列表仍显示上一个账号的内容，通知设置页还会显示别人的开关。
    // notification store 不 import user store，同样无循环依赖，可同步调用。
    useNotificationStore().reset()
    // 活动详情/列表缓存里带 is_liked 等**用户相关字段**，不清会串号
    useEventStore().invalidateUserScopedCache()
  }

  // 引导会话:
  // 1) 如果 storage 里有 access token → 调 /user/me 真实验证（顺手刷一下 user 缓存）
  //    - 200 → 登录有效
  //    - 401 → request.ts 自动 refresh + 重放;refresh 也救不回来 → notifySessionExpired 弹强制 modal
  // 2) 没有 token → 保持未登录态,**不**做任何静默登录（App 端没有免密登录手段）
  async function bootstrapSession(): Promise<boolean> {
    if (!accessToken.value) {
      // 没 token → 保持未登录态,等用户主动触发登录
      return false
    }
    try {
      // skipAuthRedirect: 这是诊断性请求,401 不应该弹强制 modal
      // (强制 modal 已经在 request.ts 的 refresh 失败分支里弹了)
      const me = await request<User>('/user/me', { skipAuthRedirect: true })
      setUser(me)
      resetSessionExpiredNotice()
      // 冷启动也要补一次 cid 上报（token 有效但 cid 可能是新拿到的）
      syncPushToken().catch(() => {})
      return true
    } catch (e: any) {
      // 缓存 token 真的失效了(refresh 也救不回来)→ request.ts 已 notifySessionExpired
      console.warn('[userStore] bootstrapSession: cached token invalid', e?.errMsg || e?.message || e)
      clear()
      return false
    }
  }

  /**
   * 手机号 + 短信验证码登录（未注册自动注册）。
   * 设备信息由 utils/device 统一采集，后端据此建 user_devices 记录。
   */
  async function loginWithPhone(opts: {
    phone: string
    code: string
    profile?: { nickname?: string; avatar_url?: string; gender?: 0 | 1 | 2 }
  }): Promise<PhoneLoginResponse> {
    const resp = await authApi.phoneLogin({
      phone: opts.phone,
      code: opts.code,
      ...(opts.profile || {}),
      device_id: getDeviceId(),
      device_type: getDeviceType(),
      device_model: getDeviceModel(),
      os_version: getOsVersion(),
      app_version: getAppVersion(),
    })
    setLoginPayload(resp)
    return resp
  }

  /**
   * uni 一键登录（App 端本机号码免短信）。
   *
   * accessToken / openID 来自 `uni.login({ provider: 'univerify' })`，
   * 是一次性凭证：**手机号始终在服务端换取，前端拿不到也不会去猜**。
   * 换出的是手机号账号，与 loginWithPhone 是同一个账号（user_auths.phone）。
   */
  async function loginWithOneKey(opts: {
    accessToken: string
    openID: string
    profile?: { nickname?: string; avatar_url?: string; gender?: 0 | 1 | 2 }
  }): Promise<OneKeyLoginResponse> {
    const resp = await authApi.oneKeyLogin({
      access_token: opts.accessToken,
      openid: opts.openID,
      ...(opts.profile || {}),
      device_id: getDeviceId(),
      device_type: getDeviceType(),
      device_model: getDeviceModel(),
      os_version: getOsVersion(),
      app_version: getAppVersion(),
    })
    setLoginPayload(resp)
    return resp
  }

  /**
   * Sign in with Apple 登录 / 绑定（iOS）。
   *
   * code 由 `uni.login({ provider: 'apple' })` 一次性返回，
   * 服务端用它换 id_token 并验签，前端不做任何身份判定。
   *
   * 语义由服务端 OptionalAuth 决定（详见 internal/handler/auth.go AppleLogin）：
   *   - 已绑定 + 未带 token → 登录原账号
   *   - 未绑定 + 带了有效 token → 绑定到当前账号
   *   - 未绑定 + 未带 token → 注册新账号
   *
   * @param profile 首次授权时 Apple 只返回一次昵称/头像，之后需用户自行完善
   */
  async function loginWithApple(opts: {
    code: string
    /**
     * 预留字段，当前**不要传值**。
     *
     * nonce 必须随 Apple 授权请求下发并由 Apple 签入 id_token，
     * uni.login 不暴露该参数；上传随机值会被服务端判为重放攻击。
     * 服务端对空 nonce 跳过比对。
     */
    nonce?: string
    profile?: { nickname?: string; avatar_url?: string; gender?: 0 | 1 | 2 }
  }): Promise<AppleLoginResponse> {
    const resp = await authApi.appleLogin({
      code: opts.code,
      ...(opts.nonce ? { nonce: opts.nonce } : {}),
      ...(opts.profile || {}),
      device_id: getDeviceId(),
      device_type: getDeviceType(),
      device_model: getDeviceModel(),
      os_version: getOsVersion(),
      app_version: getAppVersion(),
    })
    setLoginPayload(resp)
    return resp
  }

  async function logout() {
    // 先解绑推送，避免退出后仍收到该账号的通知
    await unbindPushToken()
    try {
      await authApi.logout()
    } catch (e) {
      // ignore
    }
    clear()
  }

  async function logoutAll() {
    await unbindPushToken()
    try {
      await authApi.logoutAll()
    } catch (e) {
      // ignore
    }
    clear()
  }

  return {
    // state
    accessToken,
    refreshToken,
    user,
    isNew,
    agreementRequired,
    missingAgreements,
    showLoginModal,
    loginModalOptions,
    showPrivacyPopup,
    privacyPopupReason,
    // getters
    isLoggedIn,
    // actions
    setUser,
    setLoginPayload,
    setTokensOnly,
    setAgreementOK,
    requireLogin,
    notifyLoginSuccess,
    closeLoginModal,
    handleSessionExpired,
    openPrivacyPopup,
    closePrivacyPopup,
    clear,
    bootstrapSession,
    loginWithPhone,
    loginWithOneKey,
    loginWithApple,
    logout,
    logoutAll,
  }
})
