/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly MODE: string
  readonly DEV: boolean
  readonly PROD: boolean
  readonly BASE_URL: string
  /** 后端 API 根地址，见 .env.dev / .env.prod */
  readonly VITE_API_BASE_URL: string
  /** uni-push 2.0 总开关，'false' 时所有推送相关逻辑走 no-op */
  readonly VITE_PUSH_ENABLED: string
  /** 捐赠入口总开关 */
  readonly VITE_DONATE_ENABLED: string
  /** iOS 捐赠入口开关（默认关闭，需走 IAP） */
  readonly VITE_DONATE_IOS_ENABLED: string
  readonly [key: string]: unknown
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// 注意：这里刻意**不**声明 `declare module '*.vue'`。
// 项目用 vue-tsc（npm run type-check）做类型检查，vue-tsc 原生支持 .vue 单文件组件，
// 会推导真实的 props / emits 类型；一旦补上 `DefineComponent<{}, {}, any>` 的通配声明，
// 所有 import 到的组件 props 都会退化成 any，模板里的类型检查形同虚设。
