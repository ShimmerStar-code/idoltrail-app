// 页面栈工具：tab 页判定 + 401 回跳的 capture/restore。
//
// 为什么不用 pages.json 的原生 tabBar：
//   uni-app 的 `tabBar.custom` 只在小程序端生效，App 端仍会渲染原生 tabBar，
//   与页面内的自绘 <TabBar> 组件重复。因此 App 端**不在 pages.json 里声明 tabBar**，
//   由本文件提供 switchTabPage() 模拟原生 tab 语义：
//     - 目标页已在栈中 → navigateBack 回退（等价于原生 tab 切回已打开的 tab，保留页面状态）
//     - 目标页不在栈中 → reLaunch
// 新增 / 删除 tab 时，记得同步更新 pages.json 的 pages 列表与本页 TAB_PAGES。

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

/** 切 tab 页。语义见文件头注释。 */
export function switchTabPage(url: string): void {
  const target = url.replace(/^\//, '').split('?')[0]
  const pages = getCurrentPages() as Array<{ route?: string }>
  const idx = pages.findIndex((p) => (p.route || '').replace(/^\//, '') === target)

  if (idx >= 0 && idx === pages.length - 1) return // 已在当前页
  if (idx >= 0) {
    // 目标页在栈中 → 回退到它，保留该 tab 的页面状态
    uni.navigateBack({
      delta: pages.length - 1 - idx,
      fail: () => uni.reLaunch({ url }),
    })
    return
  }
  uni.reLaunch({ url, fail: () => uni.redirectTo({ url }) })
}

/**
 * 把用户带回 snapshot 指向的页面。
 * - tab 页面用 switchTabPage
 * - 普通页面用 redirectTo（不堆积页面栈）
 * - 失败 fallback 到 /pages/profile/index
 */
export function restorePage(s: PageSnapshot) {
  const url = buildUrl(s)
  const fallback = () => uni.reLaunch({ url: '/pages/profile/index' })
  try {
    if (s.isTab) {
      switchTabPage(url)
    } else {
      uni.redirectTo({ url, fail: fallback })
    }
  } catch {
    fallback()
  }
}
