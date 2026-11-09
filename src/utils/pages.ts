// 页面栈工具：tab 页判定 + 401 回跳的 capture/restore。
//
// App 端用 pages.json 声明的**原生 tabBar**（见 pages.json 的 tabBar 节点）。
// 原生 tabBar 由底层原生引擎渲染（不是前端 DOM），带来两个关键差异：
//   1) 性能：tab 页一旦展现过就保留在内存里，再次切换只触发 onShow，
//      不再触发 onLoad —— 不销毁重建 webview，这是切 tab 卡顿的根治办法。
//   2) 语义：跳 tab 页**只能**用 uni.switchTab。
//      navigateTo / redirectTo 到 tab 页会直接报错
//      「can not navigateTo a tabbar page」，reLaunch 虽然能跳但会把页面栈
//      全清掉再重建（等于回到自绘 TabBar 的老问题）。
//
// ⚠️ switchTab 的 url **不能带参数**：运行时会把 query 静默裁掉
//    （uni.runtime.esm.js: switchTab 不带参数,reLaunch 到 tabBar 页面强制刷新到当前tab）。
//    所以本函数统一剥掉 query。

export const TAB_PAGES = [
  'pages/home/index',
  'pages/artist/list',
  'pages/subscribe/index',
  'pages/profile/index',
] as const

export type TabPage = (typeof TAB_PAGES)[number]

export function isTabPage(path: string): boolean {
  return (TAB_PAGES as readonly string[]).includes(path)
}

export interface PageSnapshot {
  /** 页面路径，不含前导 '/'，如 'pages/event/detail' */
  path: string
  /** 页面 onLoad 的 query 参数 */
  query: Record<string, any>
  /** 是否是 tabBar 页面（决定回跳用 switchTab 还是 redirectTo） */
  isTab: boolean
}

/**
 * 抓取当前页面的快照（用于 401 → 登录 → 回跳）。
 * uni.getCurrentPages() 返回当前页面栈；最末位就是用户正在看的页面。
 */
export function captureCurrentPage(): PageSnapshot | null {
  const pages = getCurrentPages() as Array<{ route?: string; options?: Record<string, any> }>
  const cur = pages[pages.length - 1]
  if (!cur?.route) return null
  const path = cur.route.replace(/^\//, '')
  return { path, query: cur.options ?? {}, isTab: isTabPage(path) }
}

export function buildUrl(s: PageSnapshot): string {
  const qs = Object.entries(s.query || {})
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v ?? ''))}`)
    .join('&')
  return '/' + s.path + (qs ? '?' + qs : '')
}

/**
 * 切 tab 页 —— 走原生 tabBar 的 uni.switchTab。
 *
 * 为什么不自己模拟（导航栈查找 + navigateBack/reLaunch）：
 * 原生 tabBar 的 tab 页是常驻内存的，switchTab 会直接 show 目标页的 webview，
 * 已访问过的页面不再触发 onLoad。这既是性能收益，也避免了 reLaunch 重建页面。
 */
export function switchTabPage(url: string): void {
  // switchTab 不接受 query，先剥掉
  const target = '/' + url.replace(/^\//, '').split('?')[0]
  const pages = getCurrentPages() as Array<{ route?: string }>
  const idx = pages.findIndex((p) => (p.route || '').replace(/^\//, '') === target.replace(/^\//, ''))

  if (idx >= 0 && idx === pages.length - 1) return // 已在当前页
  uni.switchTab({
    url: target,
    fail: () => {
      // 目标不在 tabBar 列表里（理论上不会发生）时兜底
      uni.reLaunch({ url: target })
    },
  })
}

/**
 * 把用户带回 snapshot 指向的页面。
 * - tab 页面用 switchTabPage（原生 tabBar 语义）
 * - 普通页面用 redirectTo（不堆积页面栈）
 * - 失败 fallback 到 /pages/profile/index
 */
export function restorePage(s: PageSnapshot) {
  const url = buildUrl(s)
  const fallback = () => uni.switchTab({ url: '/pages/profile/index' })
  try {
    if (s.isTab) {
      // switchTab 会静默裁掉 query —— tab 页本来也不靠 url 传参
      switchTabPage(url)
    } else {
      uni.redirectTo({ url, fail: fallback })
    }
  } catch {
    fallback()
  }
}
