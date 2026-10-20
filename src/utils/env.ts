// 后端地址与环境开关的统一读取口。
//
// 为什么单独抽一个模块：此前 BASE_URL 在 request.ts 和 api/user.ts 里各自
// `import.meta.env.VITE_API_BASE_URL || 'http://localhost:8081/api/v1'` 兜底一次。
// 漏配 .env 时会静默指向 localhost —— App 真机上表现为「所有页面空白、控制台只有
// network error」，因为错误发生在网络层，页面上没有任何线索，极难定位。
//
// 现在策略：
//   1. 运行期缺失 → console.error 红字告警（不 throw，避免 H5 调试期整个页面白屏无提示）
//   2. 构建期缺失 → vite.config.ts 的 checkApiBaseUrl() 直接 fail build，问题在打包机上暴露
//
// 详见 CLAUDE.md「环境变量」。

const FALLBACK_BASE_URL = 'http://localhost:8081/api/v1'

function readRawBaseUrl(): string {
  return (import.meta.env.VITE_API_BASE_URL || '').trim()
}

const rawBaseUrl = readRawBaseUrl()

if (!rawBaseUrl) {
  console.error(
    '[env] VITE_API_BASE_URL 未配置！\n' +
      '  请在 .env.dev（开发）或 .env.prod（生产）中填入真机可访问的地址（手机无法访问 localhost）。\n' +
      `  当前回退到 ${FALLBACK_BASE_URL}，真机上所有接口都会失败。`
  )
} else if (import.meta.env.PROD && /^https?:\/\/(localhost|127\.0\.0\.1)/i.test(rawBaseUrl)) {
  console.error(
    `[env] 生产构建的 VITE_API_BASE_URL 指向本机地址 ${rawBaseUrl}，真机必然连不通。`
  )
}

/** 后端 API 根地址，已去掉结尾多余的 `/` */
export const API_BASE_URL: string = (rawBaseUrl || FALLBACK_BASE_URL).replace(/\/+$/, '')

/**
 * 管理后台入口开关。
 *
 * 客户端内置的后台登录页是一个攻击面：包体可反编译、`/admin/login` 可被直接爆破。
 * 这里默认关闭，需在 .env 里显式置 `VITE_ADMIN_ENABLED=true` 才能访问。
 *
 * 正式发布包（`npm run build:app`）由 vite.config.ts 的 checkAdminGate() 强制置 false，
 * 所以后台管理不会被打进 C 端包；dev / H5 / 真机自定义基座调试不受影响。
 */
export const ADMIN_ENABLED: boolean = import.meta.env.VITE_ADMIN_ENABLED === 'true'

/**
 * uni-push 2.0 开关。
 *
 * 关闭时 usePush 完全不注册任何监听，也不会去取 cid，
 * 避免在未集成 uni-push 模块的基座上反复报错。服务端未配置时推送会静默降级为
 * 仅落库（App 轮询 HTTP 接口），故这里默认关闭以免误报。
 *
 * 注意：即使打开，也必须用含 uni-push 模块的自定义基座或云打包安装，
 * 标准 HBuilder 运行基座收不到推送（详见 CLAUDE.md「推送」章节）。
 */
export const PUSH_ENABLED: boolean = import.meta.env.VITE_PUSH_ENABLED === 'true'

// ── Sign in with Apple 开关 ──
//
// 与捐赠开关同一个原则：宁可不展示，也不能展示一个点了必然失败的入口。
//
// 此前 LoginModal 的 showAppleLogin 直接等于 isAppleIAPPlatform()，
// 也就是「只要是 iOS 就一定显示 Apple 登录按钮」，而 manifest.json 里
// 并没有 com.apple.developer.applesignin 这项 entitlement——
// uni.login({provider:'apple'}) 在真机上必然失败，用户看到的是一个
// 点了没反应的按钮。
//
// 打开本开关前必须三件事都做完（缺一则按钮会失败）：
//   1. Apple Developer 后台为该 App ID 启用 Sign in with Apple 能力；
//   2. 重新生成 provisioning profile 并**用自定义基座或云打包安装**
//      （本地 HBuilder 运行基座不带该能力）；
//   3. 取消 src/manifest.json 中 apple entitlement 的注释。
export const APPLE_LOGIN_ENABLED: boolean =
  import.meta.env.VITE_APPLE_LOGIN_ENABLED === 'true'

// ── 捐赠开关 ──
//
// 三个开关是「与」的关系：任一为 false，用户在对应平台就看不到可点的支付按钮，
// 页面退化为「暂未开放」说明页，绝不会出现「能点但必然失败」的入口。
//
// DONATE_ENABLED 是总闸；iOS 与 Android 各自还有独立开关，因为二者的开通条件不同：
//   - iOS 走 StoreKit IAP，受 App Store 审核约束，独立控制
//   - Android 走微信 App 支付，依赖后端 V3 下单 + 回调验签，依赖后端部署状态
export const DONATE_ENABLED: boolean = import.meta.env.VITE_DONATE_ENABLED === 'true'

/**
 * iOS 端赞助开关（StoreKit IAP）。
 *
 * iOS 上的数字内容**只能**走应用内购买，App Store 审核硬性要求，
 * 微信 / 支付宝在 iOS 上均不可用，因此这条与 Android 完全独立。
 */
export const DONATE_IOS_ENABLED: boolean = import.meta.env.VITE_DONATE_IOS_ENABLED === 'true'

/**
 * Android 端赞助开关（微信 App 支付）。
 *
 * 打开前必须确认后端两件事都已就位，否则用户点「赞助」必然失败：
 *   1. `POST /donations` 传 channel=wx_app 能返回非空 order_info
 *   2. `/donations/notify` 回调验签通过、订单能入账
 *
 * 另外 App 支付要求包名与签名在微信开放平台登记（与 uni-app 的 `appid`、
 * 云端打包签名三者绑定），自定义基座签名与正式包不一致时微信侧会直接拒付。
 */
export const DONATE_NATIVE_READY: boolean = import.meta.env.VITE_DONATE_NATIVE_READY === 'true'
