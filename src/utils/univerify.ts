/**
 * uni 一键登录（univerify）能力封装
 *
 * 能力探测 → 授权取号 → 一次性凭证交给服务端，三步分离：
 *
 *   1. preLoginOneKey()    打开登录弹窗时探测设备是否支持一键登录
 *                         （有 SIM 卡 + 移动数据 + 已开通服务 + 机型支持）
 *                         失败一律静默降级到短信验证码，不给用户任何提示
 *   2. requestOneKeyAuth() 用户勾选《用户协议》《隐私政策》后自动拉起运营商授权页，
 *                         拿一次性 access_token + openid
 *                         ⚠️ 调用方必须先确认用户已同意协议，这里不做协议校验
 *   3. 手机号由服务端经 uniCloud 云函数换取，前端自始至终拿不到、也不需要
 *
 * ⚠️ 一键登录必须走**移动数据**：Wi-Fi 下运营商网关取不到本机号码，预登录会直接失败。
 *    这是产品硬约束，UI 文案不要误导用户。
 *
 * ⚠️ @dcloudio/types 尚未收录 uni.preLogin / uni.closeAuthView，
 *    这里按官方签名在本地声明一份，不污染全局类型，也不绕道 plus.oauth。
 *
 * 条件编译约定：APP-PLUS 与非 APP-PLUS 分支各用 #ifdef / #ifndef 写全，
 * 保证 vue-tsc 直接检查源文件时两条分支都合法。
 */

/** uni.login(provider:'univerify') 返回的 authResult */
export interface UniVerifyAuthResult {
  openid: string
  access_token: string
}

export interface UniVerifyError {
  errCode?: number | string
  errMsg?: string
}

/** 预登录凭证有效期约 10 分钟且只能被一次 uni.login 消费，这里保守缓存 8 分钟 */
const PRE_LOGIN_TTL = 8 * 60 * 1000

interface UniVerifyStyle {
  fullScreen?: boolean
  backgroundColor?: string
  authButton?: {
    normalColor?: string
    highlightColor?: string
    disabledColor?: string
  }
  privacyTerms?: {
    normalColor?: string
    highlightColor?: string
  }
  defaultCheckBoxState?: boolean
}

/**
 * SDK 授权页样式。
 *
 * - 半屏（fullScreen:false），与 LoginModal 的视觉体量一致
 * - 不配 privacyItems：运营商协议链接要的是 http(s) 网页地址，而本项目的
 *   《用户协议》《隐私政策》是 App 内常量页（pages/agreement/detail），
 *   传 App 内地址打不开。协议同意由 LoginModal 自己的勾选框强制把关，
 *   SDK 自带勾选框只是运营商侧合规展示，两者叠加不冲突。
 * - defaultCheckBoxState: true：与 DCloud 官方示例保持一致
 */
const UNI_VERIFY_STYLE: UniVerifyStyle = {
  fullScreen: false,
  backgroundColor: '#FFFFFF',
  authButton: {
    normalColor: '#FF9F1C',
    highlightColor: '#E88B00',
    disabledColor: '#D8D8D8',
  },
  privacyTerms: {
    normalColor: '#8A8A8A',
    highlightColor: '#FF9F1C',
  },
  defaultCheckBoxState: true,
}

// @dcloudio/types 里没有这几个 API 的声明，这里按官方签名局部声明
type PreLoginApi = (options: {
  provider: string
  success: (res: { code?: string; authResult?: UniVerifyAuthResult }) => void
  fail: (err: UniVerifyError) => void
}) => void

type LoginApi = (options: {
  provider: string
  univerifyStyle?: UniVerifyStyle
  success: (res: { code?: string; authResult?: UniVerifyAuthResult }) => void
  fail: (err: UniVerifyError) => void
}) => void

type CloseAuthViewApi = () => void

// 预登录结果缓存：同一弹窗打开期间重复探测不应反复走运营商网关
let preLoginValidUntil = 0

/**
 * 在途的 preLogin Promise（单飞）。
 *
 * 只有 TTL 缓存是不够的：登录弹窗的 watch(immediate) 与 onMounted 在
 * 「组件挂载时弹窗已打开」场景下会各调一次 probe，若不加单飞就会真的向
 * 运营商网关打两次 preLogin —— 部分运营商网关对并发请求会限流或直接判失败。
 */
let preLoginPending: Promise<boolean> | null = null

/**
 * 服务端明确答复「本机号码登录未开通 / 该设备不支持」（errno 40027）。
 *
 * 这是**永久**结论，重启 App 也不会变，因此不随内存/会话生命周期消失：
 * 一旦置位，后续所有探测与自动弹出都直接跳过，避免用户反复看到
 * 一个注定失败的入口。DCloud 后台补开服务后需要「卸载重装」才会恢复。
 */
let oneKeyDisabledForever = false

/** 服务端是否已判定一键登录永久不可用 */
export function isOneKeyDisabledForever(): boolean {
  return oneKeyDisabledForever
}

/** 标记一键登录永久不可用（仅由 40027 分支调用） */
export function disableOneKeyForever(): void {
  oneKeyDisabledForever = true
  preLoginValidUntil = 0
  preLoginPending = null
}

/** 仅 App 端（Android / iOS）支持；H5、小程序一律降级到短信验证码 */
export function isOneKeyLoginSupported(): boolean {
  // #ifdef APP-PLUS
  return true
  // #endif
  // #ifndef APP-PLUS
  return false
  // #endif
}

/**
 * 探测一键登录是否可用。
 *
 * 成功返回 true，**失败一律吞掉异常返回 false** —— 探测失败只意味着
 * 「这台设备当前用不了」，用户没点任何按钮，不该在登录弹窗上冒错误提示。
 *
 * 三层短路：永久禁用 → TTL 缓存 → 在途单飞。
 */
export function preLoginOneKey(): Promise<boolean> {
  // 已被服务端判定永久不可用（40027），不再打扰运营商网关
  if (oneKeyDisabledForever) return Promise.resolve(false)
  // #ifdef APP-PLUS
  if (Date.now() < preLoginValidUntil) return Promise.resolve(true)
  // 同一次探测还在飞：复用它，不要并发打网关
  if (preLoginPending) return preLoginPending

  preLoginPending = new Promise<boolean>((resolve) => {
    try {
      ;(uni as unknown as { preLogin: PreLoginApi }).preLogin({
        provider: 'univerify',
        success: () => {
          preLoginValidUntil = Date.now() + PRE_LOGIN_TTL
          resolve(true)
        },
        fail: () => {
          // 常见失败原因：无 SIM 卡、未开数据流量、机型不支持、服务未开通。
          // 全部收敛为「不可用」，由调用方隐藏入口。
          preLoginValidUntil = 0
          resolve(false)
        },
      })
    } catch {
      preLoginValidUntil = 0
      resolve(false)
    }
  }).finally(() => {
    // 无论成败都要放掉单飞，否则一次失败会把探测能力永久锁死
    preLoginPending = null
  })
  return preLoginPending
  // #endif
  // #ifndef APP-PLUS
  return Promise.resolve(false)
  // #endif
}

/**
 * 拉起运营商授权页取一次性凭证。
 *
 * 拿不到凭证时 reject，调用方负责提示并降级；用户主动关闭授权页不算错误，
 * 用 isUserCancelAuth() 区分，不要给用户任何报错。
 */
export function requestOneKeyAuth(): Promise<UniVerifyAuthResult> {
  // #ifdef APP-PLUS
  preLoginValidUntil = 0
  return new Promise<UniVerifyAuthResult>((resolve, reject) => {
    try {
      ;(uni as unknown as { login: LoginApi }).login({
        provider: 'univerify',
        univerifyStyle: UNI_VERIFY_STYLE,
        success: (res) => {
          const authResult = res && res.authResult
          if (!authResult || !authResult.access_token || !authResult.openid) {
            reject(new Error('未取得本机号码凭证，请改用短信验证码登录'))
            return
          }
          resolve({
            openid: authResult.openid,
            access_token: authResult.access_token,
          })
        },
        fail: (raw) => {
          reject(toAuthError(raw))
        },
      })
    } catch (err) {
      reject(toAuthError({ errCode: 10001, errMsg: (err as Error)?.message }))
    }
  })
  // #endif
  // #ifndef APP-PLUS
  return Promise.reject(new Error('当前环境不支持本机号码一键登录'))
  // #endif
}

/**
 * 把 SDK 原始错误转成既可读、又能被 isUserCancelAuth 识别的 Error。
 *
 * 关键在于**不能丢掉 errCode / errMsg**：errMsg 用来生成用户话术，
 * errCode 用来让调用方判断「用户主动取消」而不出红色报错。
 */
function toAuthError(raw: UniVerifyError): Error & UniVerifyError {
  const errMsg = String((raw && raw.errMsg) || '').trim()
  const message = errMsg
    ? `本机号码登录失败：${errMsg}，请改用短信验证码登录`
    : '本机号码登录失败，请改用短信验证码登录'
  const err = new Error(message) as Error & UniVerifyError
  if (raw && raw.errCode !== undefined) err.errCode = raw.errCode
  if (errMsg) err.errMsg = errMsg
  return err
}

/** 用户主动关闭授权页（含系统返回键）后关闭原生视图，避免残留遮罩 */
export function closeOneKeyAuthView(): void {
  // #ifdef APP-PLUS
  try {
    ;(uni as unknown as { closeAuthView: CloseAuthViewApi }).closeAuthView()
  } catch {
    // 视图本来就没打开，忽略
  }
  // #endif
}

/**
 * 是否是「用户自己取消」。
 *
 * uni 通用取消码是 15001；univerify 授权页关闭在各机型 SDK 上 errCode 不统一
 * （日志实测 Android 调试基座给的是 `login:fail 用户关闭验证界面`，
 * errCode 既不是 15001 也可能是 undefined），因此再补一层文案匹配。
 *
 * ⚠️ errMsg 和 message 都要查：中间任何一层包装都可能只保留 message
 * （toAuthError 的 message 里已拼入原始 errMsg），只看 errMsg 会漏判，
 * 后果是「用户主动取消却弹了个红色报错」。文案匹配宁可多匹配。
 */
export function isUserCancelAuth(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as UniVerifyError & { message?: string }
  if (String(e.errCode) === '15001') return true
  const msg = `${e.errMsg || ''} ${e.message || ''}`.toLowerCase()
  return (
    msg.includes('cancel') ||
    msg.includes('取消') ||
    msg.includes('关闭') ||
    msg.includes('用户拒绝') ||
    // Android 各厂商 SDK 对「点返回键退出」的说法不止「关闭」，一并兜住
    msg.includes('返回') ||
    msg.includes('back')
  )
}
