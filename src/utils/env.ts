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
      '  请复制 .env.example 为 .env，并填入真机可访问的地址（手机无法访问 localhost）。\n' +
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
