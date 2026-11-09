/// <reference types='@dcloudio/types' />
import 'vue'

declare module '@vue/runtime-core' {
  type Hooks = App.AppInstance & Page.PageInstance;

  interface ComponentCustomOptions extends Hooks {

  }
}

/**
 * 第三方 uni_modules 的类型豁免。
 *
 * 为什么需要：第三方插件（uni-upgrade-center-app 及其 UTS 依赖）是按
 * **uni-app x + 条件编译**写的，在传统 uni-app 的 TS 环境里它们自身就编译不过：
 *   · `UTSJSONObject` / `DownloadTask` / `installApk` / `openDialogPage`
 *     都是 uni-app x 才有的类型与 API；
 *   · 同一文件的 `#ifdef` / `#else` 分支在 TS 看来是重复声明
 *     （TS2393 / TS2451）。
 *
 * 这些文件不是我们维护的，也不该由本项目的类型检查拦下，
 * 因此 tsconfig 的 exclude 已把 `src/uni_modules` 排除。
 * 但业务代码仍要 import 插件的 API，所以在这里给一个宽松的模块声明。
 *
 * 代价：插件相关的类型退化为 any —— 插件是黑盒，我们只用它的
 * `createUpdateManager()` 与升级页，不依赖它的内部类型细节。
 */
declare module '@/uni_modules/*'

