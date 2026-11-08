/**
 * 临时性能探针（调查页面切换卡顿用，测完即删）。
 *
 * 只在 App 端 console.log —— HBuilderX 标准基座会把 console 输出转发到
 * logcat 的 `console` 通道，可以用 `adb logcat -s console` 收。
 */
export function perfMark(name: string): void {
  console.log(`[perf] ${name} ${Date.now()}`)
}
