/**
 * 页面顶部安全区 / 导航栏尺寸工具。
 *
 * App 端没有微信小程序那种"胶囊按钮"，因此不再依赖 `uni.getMenuButtonBoundingClientRect()`
 * （该 API 仅小程序可用，App 上调用会失败）。统一改为：
 *   1. 状态栏高度 —— 来自 `uni.getWindowInfo()`
 *   2. 导航栏高度 —— 固定 44px（与 iOS/Android 原生导航栏一致）
 *   3. 右上角预留 —— 无胶囊，仅保留基础间距
 */

/** 导航栏内容区高度（px） */
export const NAV_BAR_HEIGHT = 44;

/** 右上角额外留白（px），无胶囊时不需要额外避让 */
export const NAV_RIGHT_PADDING = 16;

export interface NavBarMetrics {
  /** 页面顶端到内容起点的 paddingTop */
  statusBarHeight: number;
  /** 导航栏自身高度 */
  navBarHeight: number;
  /** 导航栏右侧内边距 */
  navRightPadding: number;
}

/** 读取状态栏高度（px），异常时返回 20 */
export function getStatusBarHeight(): number {
  try {
    const w = uni.getWindowInfo?.();
    if (w?.statusBarHeight > 0) return w.statusBarHeight;
  } catch {
    /* 平台不支持时降级 */
  }
  try {
    const s = uni.getSystemInfoSync?.();
    const sh = s?.statusBarHeight;
    if (typeof sh === 'number' && sh > 0) return sh;
  } catch {
    /* ignore */
  }
  return 20;
}

/** 读取页面底部安全区高度（px），无全面屏时返回 0 */
export function getBottomSafeAreaHeight(): number {
  try {
    const w = uni.getWindowInfo?.();
    if (w?.safeAreaInsets?.bottom > 0) return w.safeAreaInsets.bottom;
  } catch {
    /* ignore */
  }
  try {
    const s = uni.getSystemInfoSync?.();
    const bottom = s?.safeAreaInsets?.bottom;
    if (typeof bottom === 'number' && bottom > 0) return bottom;
  } catch {
    /* ignore */
  }
  return 0;
}

/** 一次性拿到页面自绘导航栏所需的全部尺寸 */
export function getNavBarMetrics(): NavBarMetrics {
  return {
    statusBarHeight: getStatusBarHeight(),
    navBarHeight: NAV_BAR_HEIGHT,
    navRightPadding: NAV_RIGHT_PADDING,
  };
}
