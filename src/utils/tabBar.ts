import { computed, ref } from "vue";
import { getBottomSafeAreaHeight } from "./system";

/**
 * 底部自绘 TabBar 的高度（px）—— 全局唯一真值。
 *
 * ── 为什么不能写死 ──────────────────────────────────────────────
 * 之前四个 tab 页（首页 / 偶像 / 订阅 / Me）都写死 80px，
 * 但 TabBar 的真实高度只有 ≈120rpx（375 宽折半 ≈60px）：
 *   padding 14rpx×2 + icon-wrap 60rpx + gap 6rpx + 文字 26rpx = 120rpx
 * 写死 80 会让可视区比实际矮一截 —— 首页表现为
 * 「列表底部与底部导航栏之间出现一条空白」，
 * 其余三页表现为内容底部多出一段无意义的留白。
 *
 * ── 口径 ────────────────────────────────────────────────────────
 * 1) 优先用页面级查询实测出来的真实高度（measureTabBarHeight）；
 * 2) 实测值没到（首帧 / 布局未完成）时，用按 rpx 估算的值兜底，
 *    保证布局不会因为拿不到高度而塌成 0。
 *
 * 高度是纯布局度量，不是业务状态，因此放 utils 而不是 Pinia store；
 * App 端所有页面共用同一个 JS service 上下文，模块级 ref 即全局唯一值。
 */

/** TabBar 内容高度（rpx）。与 components/TabBar/index.vue 的样式一一对应，改样式要同步改这里 */
const TAB_BAR_CONTENT_RPX = 120;

let cachedEstimate = 0;

/** 按 rpx 估算 TabBar 高度（px）：实测前的兜底值 */
export function estimateTabBarHeight(): number {
  if (!cachedEstimate) {
    let upx = 0;
    if (typeof uni.upx2px === "function") {
      upx = uni.upx2px(TAB_BAR_CONTENT_RPX);
    } else {
      // uni.upx2px 在个别平台不存在，用窗口宽自己折算：750rpx = 窗口宽
      const w = uni.getWindowInfo?.()?.windowWidth || 375;
      upx = (TAB_BAR_CONTENT_RPX * w) / 750;
    }
    cachedEstimate = upx + getBottomSafeAreaHeight();
  }
  return cachedEstimate;
}

/** TabBar 实测高度（px），0 表示还没量到 */
const measuredTabBarHeight = ref(0);

/** 写入实测高度 */
export function setTabBarHeight(height: number): void {
  if (height > 0) measuredTabBarHeight.value = height;
}

/**
 * 实测 TabBar 高度（页面级查询）。
 *
 * ⚠️ 为什么不在 TabBar 组件内部用 `.in(instance.proxy)` 量自己：
 * 组件的**根节点属于父级的作用域**，`in(组件)` 选不到自己的根节点，
 * 量出来是 null。用页面级查询选 `.tabbar` 才能拿到完整高度
 * （根节点的上下 padding 也在里面）。
 *
 * 由四个 tab 页在 onMounted 时各调一次（幂等，重复测量只是覆盖同一个值）。
 */
export function measureTabBarHeight(): void {
  let tries = 0;
  const run = () => {
    tries += 1;
    uni
      .createSelectorQuery()
      .select(".tabbar")
      .boundingClientRect((rect: any) => {
        if (rect?.height) {
          setTabBarHeight(rect.height);
          return;
        }
        // 首帧布局未完成时量不到，隔一拍再试，最多 3 次
        if (tries < 3) setTimeout(run, 120);
      })
      .exec();
  };
  run();
}

/** 页面直接用这个值：实测优先，没量到就用估算值 */
export const tabBarHeight = computed(
  () => measuredTabBarHeight.value || estimateTabBarHeight(),
);
