<!--
  pages/artist/by-country  按地区(国家)展示全部偶像的网格列表页(非 tabBar)
  ─────────────────────────────────────────────
  入口:
    pages/artist/list.vue 的"查看所有"   /pages/artist/by-country?country=JP

  布局(自上而下):
    1. 自定义导航(返回 + 标题 + 右侧添加好友占位图标)
    2. 两个排序胶囊(活动量排序 / 订阅量排序),单击切换字段,再点切换 asc/desc
    3. 网格(每行 5 列),每个 cell: 头像 + 名字 + (N场) + 订阅按钮
    4. 空态 + 统计 + 下拉刷新 + 上滑预取

  注意:
    - 这是非 tabBar 页面,不带 TabBar,直接 uni.navigateTo 进入。
    - 复用 artist/list.vue 的配色与 .artist-col 卡片样式,但布局从横向滚动改为 5 列网格。
    - 网格用 scroll-view + useVirtualList 窗口化,不用页面原生滚动。
      网格是 5 列,而窗口化只认单轴,所以先把扁平的 list 按 5 个一行切成 rows,
      再对 rows 做窗口化 —— .vl-row 自己是个 5 列 grid,视觉与原 .grid 一致。
      注意行的垂直间距必须用 padding-bottom 而非 margin-bottom:
      boundingClientRect 不含 margin,用 margin 会被整段漏算,
      每行少算一点、20 行就累积出几百 px 的滚动条误差。
    - 页面级 onPullDownRefresh / onReachBottom 在全高 scroll-view 下不再触发,
      刷新改用 scroll-view 自带的 refresher-* 属性。
-->
<template>
  <PageLayout>
    <view class="page" :style="{ paddingTop: statusBarHeight + 'px' }">
      <!-- 固定头部:导航 + 排序胶囊。flex-shrink:0,不参与滚动 -->
      <view class="page-head">
        <!-- 自定义导航栏 -->
        <view class="nav" :style="{ paddingRight: navRightPadding + 'px' }">
          <view class="nav-back" @click="goBack">
            <uni-icons type="left" size="large" color="#111" />
          </view>
          <text class="nav-title">{{ title }}</text>
          <view class="nav-add">
            <uni-icons type="addpeople" size="22" color="#111" />
          </view>
        </view>

        <!-- 排序胶囊 -->
        <view class="sort-bar">
          <view
            v-for="opt in sortOptions"
            :key="opt.value"
            class="sort-pill"
            :class="{ 'sort-pill--active': sort === opt.value }"
            @click="onSortClick(opt.value)"
          >
            <text class="sort-label">{{ opt.label }}</text>
            <image
              class="sort-arrow-icon"
              :class="{
                'sort-arrow-icon--up': sort === opt.value && order === 'asc',
              }"
              src="/static/icons/sort.svg"
            />
          </view>
        </view>
      </view>

      <!-- 网格主体(scroll-view + 窗口化:只渲染视口附近的行) -->
      <scroll-view
        scroll-y
        class="grid-scroll"
        :style="{ height: scrollHeight + 'px' }"
        :refresher-enabled="true"
        :refresher-triggered="refreshing"
        :scroll-into-view="scrollAnchor"
        @refresherrefresh="onRefresh"
        @scroll="onListScroll"
        @scrolltolower="handleLoadMore"
      >
        <view class="grid-inner">
          <view v-if="loading && list.length === 0" class="grid">
            <view
              v-for="i in 10"
              :key="`sk-${i}`"
              class="artist-col artist-col--skel"
            >
              <view class="avatar avatar--skel" />
              <view class="skel-line skel-line--sm" />
              <view class="skel-line skel-line--xs" />
              <view class="skel-btn" />
            </view>
          </view>

          <template v-else>
            <!-- 顶部锚点:切排序后靠 scroll-into-view 强制回到列表顶端。
                 列表内容整体替换时 scroll-view 会保留旧的 scrollTop,
                 用户会停在「半截位置 + 一屏新内容」的错位状态。 -->
            <view id="artist-grid-top" />
            <!-- 视口上方的占位块:高度 = 已渲染过的行的实测高度之和 -->
            <view :style="{ height: topSpacer + 'px' }" />
            <view v-for="row in visibleRows" :key="row.key" class="vl-row">
              <view
                v-for="item in row.item.items"
                :key="item.id"
                class="artist-col"
                @click="toDetail(item.id)"
              >
                <view class="avatar-wrap">
                  <!-- lazy-load：每页 20 个头像，不加会在进页瞬间并发请求 20 张 -->
                  <image
                    class="avatar"
                    :src="getArtistAvatarSrc(item)"
                    mode="aspectFill"
                    lazy-load
                  />
                </view>
                <text class="artist-name">{{ item.name }}</text>
                <!-- 活动量排序：显示活动场次 + 订阅人数（两行，便于观察订阅操作效果） -->
                <template v-if="sort === 'event_count'">
                  <text v-if="item.event_count != null" class="event-count">({{ item.event_count }}场)</text>
                  <text class="event-count">({{ item.subscriber_count ?? 0 }}人订阅)</text>
                </template>
                <!-- 订阅量排序：只显示订阅人数 -->
                <text v-else class="event-count">({{ item.subscriber_count ?? 0 }}人订阅)</text>
                <view
                  class="subscribe-btn"
                  :class="{
                    'subscribe-btn--active': subscribeStore.isArtistSubscribed(
                      item.id,
                    ),
                  }"
                  @click.stop="toggleSubscribe(item.id)"
                >
                  <text class="subscribe-text">
                    {{
                      subscribeStore.isArtistSubscribed(item.id) ? "退订" : "订阅"
                    }}
                  </text>
                </view>
              </view>
            </view>
            <!-- 视口下方的占位块:撑出总高度,滚动条长度才正确 -->
            <view :style="{ height: bottomSpacer + 'px' }" />

            <view v-if="!list.length" class="empty">
              <text class="empty-icon">⏳</text>
              <text class="empty-text">暂无该地区偶像</text>
              <text class="empty-hint">试试切换排序或返回上一页</text>
            </view>

            <view v-if="list.length > 0" class="list-footer">
              <text class="list-footer-text">
                {{ loading ? "加载中…" : noMore ? `共 ${total} 位` : `${list.length} / ${total} 位` }}
              </text>
            </view>
          </template>
        </view>
      </scroll-view>
    </view>
  </PageLayout>
</template>

<script setup lang="ts">
import type { ArtistOrder, ArtistSort } from "@/api/artist";
import { artistApi } from "@/api/artist";
import { getArtistAvatarSrc } from "@/utils/avatar";
import { artistGroupLabel } from "@/constants/artistCountries";
import { useNotificationStore } from "@/stores/notification";
import { syncPushToken } from "@/composables/usePush";
import PageLayout from "@/components/PageLayout/index.vue";
import { useSubscribeStore } from "@/stores/subscribe";
import { useUserStore } from "@/stores/user";
import type { Artist } from "@/types/artist";
import { getNavBarMetrics } from "@/utils/system";
import { onLoad } from "@dcloudio/uni-app";
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useVirtualList } from "@/composables/useVirtualList";
const subscribeStore = useSubscribeStore();
const userStore = useUserStore();
const statusBarHeight = ref(20);
const navRightPadding = ref(16);

// ── 路由参数 ──
// country 是 ISO 国家码，可能是单个（JP）或逗号分隔的多个（SG,MY,TH）。
// 后端 /artists 的 country 支持逗号多值，新马泰组一次就能列全。
const country = ref(""); // 原始参数，透传给后端
const countryCodes = ref<string[]>([]); // 拆分后的国家码，用于标题

// ── 筛选 / 排序 ──
const sort = ref<ArtistSort>("event_count");
const order = ref<ArtistOrder>("desc");

// ── 列表分页状态 ──
const list = ref<Artist[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = 20;
const loading = ref(false);
const noMore = ref(false);

/**
 * 累计渲染上限。
 *
 * 本页是热门国家的全部偶像（CN/KR/JP 上千个），分页最多拉到 LIST_MAX，
 * 与后端 total 之间留个明确缺口，避免用户以为「到底了却还有」。
 */
const LIST_MAX = 200;

/** 网格列数。与 .vl-row 的 grid-template-columns 必须一致。 */
const GRID_COLS = 5;

/**
 * 窗口化渲染：只渲染视口附近的行，上下用占位块撑出总高度。
 *
 * 网格是二维的，而 useVirtualList 只认单轴，所以先把扁平 list 切成 rows，
 * 再对 rows 做窗口化。每行是一个独立的 5 列 grid，视觉与原 .grid 完全一致。
 *
 * 行的 key 取该行第一个 id：list 只会尾部追加（新增的行都在末尾，不影响已有行的 key）
 * 或整体重置（resetVirtual 清空高度缓存），所以这个 key 是稳定的。
 */
const rows = computed(() => {
  const arr = list.value;
  const out: Array<{ key: string; items: Artist[] }> = [];
  for (let i = 0; i < arr.length; i += GRID_COLS) {
    const items = arr.slice(i, i + GRID_COLS);
    out.push({ key: items[0].id, items });
  }
  return out;
});

const {
  visibleItems: visibleRows,
  topSpacer,
  bottomSpacer,
  distanceToEnd,
  onScroll: onVirtualScroll,
  setViewportHeight,
  reset: resetVirtual,
} = useVirtualList({
  source: rows,
  getKey: (row) => row.key,
  itemSelector: ".vl-row",
  /**
   * 单行高度 ≈ 137px + 30rpx 行距(15px) = 152px。
   * 137 来自：头像 110rpx + 名字(12 边距 + 34) + 两行计数(4+28 各自) + 按钮(10+8+8+28)。
   * 按活动量排序（两行计数）取上限，订阅量排序只有一行计数，实测会自动改小。
   */
  estimatedHeight: 152,
  overscan: 2,
});

/**
 * scroll-view 的可视高度（px）。
 *
 * scroll-view 必须给确定高度才能滚动。列表区在固定头部（导航 + 排序胶囊）下方，
 * 所以高度 = 窗口高 - 状态栏 - 头部实际高度。
 */
const scrollHeight = ref(0);
const refreshing = ref(false);

/**
 * 头部高度兜底（px）。
 *
 * nav 80rpx + sort-bar(20+64+10)rpx ≈ 114rpx，按 375 宽折半约 57px。
 * 万一 selectorQuery 量不到（首帧布局未完成等），用它兜住 ——
 * 绝不能因为测不到就让 scroll-view 高度停在 0，那会整页空白。
 */
const HEAD_H_FALLBACK = 57;

function measureGridHeight() {
  const windowHeight = uni.getWindowInfo?.()?.windowHeight || 0;
  if (!windowHeight) return;
  uni
    .createSelectorQuery()
    .select(".page-head")
    .boundingClientRect((rect: any) => {
      const headH = rect?.height || HEAD_H_FALLBACK;
      // 留 2px 余量，避免小数误差导致最后一行被裁掉。
      // Math.max 的 200 是下限：scroll-view 高度一旦为 0 就什么都看不见。
      const h = Math.max(200, windowHeight - statusBarHeight.value - headH - 2);
      scrollHeight.value = h;
      // 同步给虚拟列表，否则它按「整窗高度」算渲染窗口，首屏会多渲染看不见的行
      setViewportHeight(h);
    })
    .exec();
}

onMounted(() => {
  void nextTick(() => measureGridHeight());
});

// 首屏数据回来后再测一次。
// onMounted 时首帧布局可能还没算完，量到的头部高度不可靠；
// 而本页头部是静态的（不像活动列表要跟随日历/筛选变高），
// 所以只要在数据落地后补一次就够，之后不再重复测量。
watch(
  () => list.value.length,
  () => {
    void nextTick(() => measureGridHeight());
  },
);

/** 强制 scroll-view 回到顶部（scroll-into-view 需要一帧空值才能重复触发） */
const scrollAnchor = ref("");
function scrollToTop() {
  scrollAnchor.value = "";
  void nextTick(() => {
    scrollAnchor.value = "artist-grid-top";
  });
}

/**
 * 标题：单国用"XX偶像"，多国用合并后的名称（如"新马泰偶像"）。
 * artistGroupLabel 本身就把 SG/MY/TH 折叠成同一个分组名，取第一个即可。
 */
const title = computed(() => {
  const codes = countryCodes.value;
  if (!codes.length) return "偶像";
  const label = artistGroupLabel(codes[0]);
  return `${label}偶像`;
});

const sortOptions: { value: ArtistSort; label: string }[] = [
  { value: "event_count", label: "活动量排序" },
  { value: "subscriber_count", label: "订阅量排序" },
];

onLoad(async (options) => {
  const metrics = getNavBarMetrics();
  statusBarHeight.value = metrics.statusBarHeight;
  navRightPadding.value = metrics.navRightPadding;
  country.value = String(options?.country || "");
  countryCodes.value = country.value
    .split(",")
    .map((c) => c.trim().toUpperCase())
    .filter((c) => c.length > 0);

  // 拉一次订阅 id 集合,保证按钮反显正确(从偶像列表页进来时大概率已经拉过,这里再调一次幂等)
  if (userStore.isLoggedIn) {
    subscribeStore.fetchMySubscribedIds().catch(() => {
      /* 静默失败,按钮仍可点击 */
    });
  }

  await loadList(true);
  void fillViewportIfShort();
});

async function loadList(reset = false) {
  if (loading.value) return;
  if (!country.value) return;
  if (!reset && list.value.length >= LIST_MAX) {
    noMore.value = true;
    return;
  }
  loading.value = true;
  try {
    if (reset) {
      page.value = 1;
      noMore.value = false;
      list.value = [];
      // 换筛选 = 换一份列表，窗口化状态与滚动位置都必须归零。
      // 排序还可能改变行高（活动量排序两行计数 vs 订阅量一行），高度缓存一并清掉。
      resetVirtual();
      scrollToTop();
      userScrolled.value = false;
    }
    const res = await artistApi.list({
      country: country.value,
      sort: sort.value,
      order: order.value,
      page: page.value,
      page_size: pageSize,
    });
    list.value = list.value.concat(res.list).slice(0, LIST_MAX);
    total.value = res.total;
    noMore.value = list.value.length >= total.value || list.value.length >= LIST_MAX;
  } catch (e: any) {
    uni.showToast({ title: e?.message || "加载失败", icon: "none" });
  } finally {
    loading.value = false;
  }
}

function onSortClick(value: ArtistSort) {
  if (sort.value === value) {
    // 同字段再点:翻转顺序
    order.value = order.value === "desc" ? "asc" : "desc";
  } else {
    // 切换字段:重置为降序
    sort.value = value;
    order.value = "desc";
  }
  loadList(true);
}

/**
 * 加载更多。
 *
 * 两级触发，让翻页「无感」：
 *   1) 主路径 —— watch(distanceToEnd)，距底不足 PREFETCH_SCREENS 屏就提前拉。
 *      用户滚到那儿时内容早已就位，不会看到 spinner、也不会停顿。
 *   2) 兜底 —— scrolltolower。预取失败（弱网/接口报错）时靠它兜住，
 *      否则用户会滚到一个永远不动的底部。
 * 两条路径共用下面这一套并发守卫，不会重复发请求。
 */
async function handleLoadMore() {
  if (loading.value || noMore.value) return;
  if (list.value.length >= LIST_MAX) {
    noMore.value = true;
    return;
  }
  page.value += 1;
  try {
    await loadList();
  } catch {
    /* loadList 内部已 toast；页码回退避免下次直接跳过一页 */
    page.value -= 1;
  }
}

/** 提前多少屏开始拉下一页。3 屏足以覆盖一次快速滑动 + 一次 RTT。 */
const PREFETCH_SCREENS = 3;

/**
 * 用户是否真的滚动过。
 *
 * 一页 20 个 cell 只有 4 行 ≈ 608px，比视口（约 700px）还短 —— 用户一进来
 * 看到的就是「满屏」，不会有任何滚动动作。如果预取一律等 userScrolled，
 * 就形成死锁：想滚动才预取，但内容不够长所以滚不动，于是永远停在第一页。
 * 所以这个门闸只拦「提前预取」，不拦「填满视口」。
 */
const userScrolled = ref(false);

function onListScroll(e: any) {
  const t = e?.detail?.scrollTop;
  if (!userScrolled.value && typeof t === "number" && t > 0) {
    userScrolled.value = true;
  }
  onVirtualScroll(e);
}

/**
 * 预取判定的三个信号（外加一个，见下面 watch 的注释）：
 *   dist     距底剩余距离
 *   scrolled 用户是否真的滚动过
 *   len      当前已加载条数
 *
 * ⚠️ len 必须一起监听，否则会漏掉唯一一次「填满视口」的机会：
 * 首屏 loading 时 onMounted 的高度测量已经让 scrollHeight 变化并触发过一次 watch，
 * 但那时 loading=true，handleLoadMore 直接 return；等第一页数据回来，
 * totalHeight 从 0 变成 608px —— 可 distanceToEnd 两边都是 max(0, …) 仍是 0，
 * 值没变就不会再触发，预取机会就此丢失，页面永远停在第一页。
 * 监听 len 等于在「列表增长后」重新判定一次，不依赖某个具体值是否变化。
 */
watch(
  [distanceToEnd, scrollHeight, userScrolled, () => list.value.length],
  ([dist, vh, scrolled]) => {
    if (!vh) return;
    // dist === 0 表示内容比视口还短、已经贴着底了 —— 这种「还没开始滚」不算
    // 提前预取，必须放行，否则页面卡在第一页且滚不动。
    if (!scrolled && dist > 0) return;
    if (dist < vh * PREFETCH_SCREENS) void handleLoadMore();
  },
  { immediate: false },
);

/**
 * 内容不足一屏时补页。
 *
 * 刻意不依赖 watch 的触发时机：列表变长时 distanceToEnd 可能因为 max(0, …)
 * 而保持不变（608px 和 1200px 在「已经贴底」这件事上等价），watch 就不会再触发。
 * 首屏和刷新后显式跑一次，把「页面能不能滚」与响应式触发彻底解耦。
 * 最多补 3 页：够把一屏填满，又不至于变成开页就无休止的后台加载。
 */
async function fillViewportIfShort() {
  for (let i = 0; i < 3; i++) {
    if (loading.value || noMore.value) return;
    // distanceToEnd > 0 表示已经能滚了，剩下的交给预取和 scrolltolower
    if (distanceToEnd.value > 0) return;
    await handleLoadMore();
  }
}

/** scroll-view 下拉刷新。refresher-triggered 必须手动置回 false 才会收起动画。 */
async function onRefresh() {
  if (loading.value) {
    refreshing.value = false;
    return;
  }
  refreshing.value = true;
  try {
    await loadList(true);
    void fillViewportIfShort();
  } finally {
    refreshing.value = false;
  }
}

function goBack() {
  uni.navigateBack();
}

function toDetail(id: string) {
  uni.navigateTo({ url: `/pages/artist/detail?id=${id}` });
}

/**
 * App 端订阅：系统推送是长期订阅，订阅成功后确保本机已拿到系统通知权限并上报 cid。
 */
async function ensurePushReady() {
  const granted = await useNotificationStore().requestSystemNotifyPermission()
  if (!granted) {
    uni.showToast({ title: "已订阅，请到系统设置中允许通知", icon: "none", duration: 2500 })
    return
  }
  await syncPushToken()
}

/**
 * 订阅按钮:未登录 → 弹登录框;已登录 → 调 store 切换
 * 成功后本地 subscriber_count +1/-1，两种排序模式下均有效，无需刷新整个列表
 */
function toggleSubscribe(id: string) {
  userStore.requireLogin({
    dismissible: true,
    reason: "artist_subscribe",
    onSuccess: async () => {
      // 操作前先记录当前状态（toggleArtist 执行后状态已翻转）
      const wasSubscribed = subscribeStore.isArtistSubscribed(id)
      try {
        await subscribeStore.toggleArtist(id)
        if (!wasSubscribed) {
          await ensurePushReady()
        }
        // 本地更新计数，两种排序模式均适用
        const item = list.value.find(a => a.id === id)
        if (item != null) {
          item.subscriber_count = Math.max(0, (item.subscriber_count ?? 0) + (wasSubscribed ? -1 : 1))
        }
      } catch (e: any) {
        uni.showToast({ title: e?.message || "订阅失败", icon: "none" });
      }
    },
  });
}
</script>

<style scoped>
.page {
  background: #fff;
  /* 固定高度 + overflow:hidden —— 页面本身不滚动，滚动交给 .grid-scroll。
     再用 height:100vh 是为了双保险（滚动容器=页面 + scroll-view 双层，
     漏掉任一处滚动条都会叠加到内容下方）。 */
  height: 100vh;
  /* 必须 border-box：内联 padding-top(statusBar) 若按 content-box 叠加，
     盒子会变成 100vh + statusBar，页面自身就多出可滚动区域，
     手势会被外层抢走，同时 scroll-view 实际高度也会比 setViewportHeight
     算出来的多出一个 statusBar，虚拟列表的视口就对不上了。
     注意：本项目的 border-box 禁令只针对 input / textarea。 */
  box-sizing: border-box;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* 导航 + 排序胶囊，不参与滚动 */
.page-head {
  flex-shrink: 0;
}

/* ── 顶部导航 ── */
.nav {
  display: flex;
  align-items: center;
  height: 80rpx;
  padding: 0 30rpx;
  background: #fff;
}
.nav-back {
  font-size: 50rpx;
  color: #111;
  line-height: 50rpx;
  width: 50rpx;
}
.nav-title {
  font-size: 32rpx;
  font-weight: 600;
  color: #111;
}
.nav-add {
  width: 50rpx;
  height: 50rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* ── 排序胶囊 ── */
.sort-bar {
  display: flex;
  gap: 30rpx;
  padding: 20rpx 30rpx 10rpx;
  background: #fff;
}
.sort-pill {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
  height: 64rpx;
  padding: 0 28rpx;
  border-radius: 32rpx;
  border: 1rpx solid rgba(236, 236, 236, 1);
  background: #fff;
}
.sort-pill--active {
  border-color: rgba(254, 165, 0, 1);
  background: rgba(254, 165, 0, 0.06);
}
.sort-label {
  font-size: 26rpx;
  color: rgba(51, 51, 51, 1);
}
.sort-pill--active .sort-label {
  color: rgba(254, 165, 0, 1);
  font-weight: 600;
}
.sort-arrow-icon {
  width: 18rpx;
  height: 14rpx;
  opacity: 0.35;
  transition:
    transform 0.2s ease,
    -webkit-transform 0.2s ease;
}
.sort-pill--active .sort-arrow-icon {
  opacity: 1;
}
.sort-arrow-icon--up {
  transform: rotate(180deg);
}

/* ── 网格 ── */
.grid-scroll {
  flex: 1;
  /* 实际高度由 JS 写在内联 style 上，这里只保证 JS 未算出前也不会撑破布局 */
  overflow: hidden;
}

/* 内层容器承载内边距：scroll-view 自身加 padding 在 App webview 下不可靠 */
.grid-inner {
  padding: 20rpx 20rpx 60rpx;
}

/**
 * 窗口化的一行 = 5 个 cell。
 * padding-bottom（不是 margin-bottom）是必须的：boundingClientRect 不含 margin，
 * 用 margin 会让每行都少算行距，20 行累积出几百 px 的滚动条误差。
 */
.vl-row {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  column-gap: 10rpx;
  padding-bottom: 30rpx;
}

.grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  column-gap: 10rpx;
  row-gap: 30rpx;
}

.artist-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0 4rpx;
}
.artist-col--skel .avatar {
  background: #eee;
}
.artist-col--skel .skel-line {
  background: #eee;
  border-radius: 6rpx;
  margin-top: 10rpx;
}
.skel-line--sm {
  width: 80%;
  height: 24rpx;
}
.skel-line--xs {
  width: 60%;
  height: 20rpx;
}
.skel-btn {
  margin-top: 12rpx;
  width: 80%;
  height: 40rpx;
  border-radius: 20rpx;
  background: #eee;
}

.avatar-wrap {
  width: 110rpx;
  height: 110rpx;
  border-radius: 55rpx;
  overflow: hidden;
  background: #f5f5f5;
}
.avatar {
  width: 100%;
  height: 100%;
}

.artist-name {
  margin-top: 12rpx;
  font-size: 24rpx;
  color: rgba(51, 51, 51, 1);
  text-align: center;
  max-width: 110rpx;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.event-count {
  margin-top: 4rpx;
  font-size: 20rpx;
  color: rgba(254, 165, 0, 1);
  text-align: center;
}

.subscribe-btn {
  margin-top: 10rpx;
  border-radius: 24rpx;
  padding: 8rpx 22rpx;
  background: linear-gradient(
    0deg,
    rgba(255, 190, 0, 1) 0%,
    rgba(254, 165, 0, 1) 100%
  );
}
.subscribe-btn--active {
  background: linear-gradient(
    0deg,
    rgba(255, 196, 205, 1) 0%,
    rgba(255, 143, 160, 1) 100%
  );
}
.subscribe-text {
  font-size: 20rpx;
  font-weight: 600;
  color: #fff;
  white-space: nowrap;
}

/* ── 空态 ── */
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 120rpx 0;
  gap: 12rpx;
}
.empty-icon {
  font-size: 60rpx;
}
.empty-text {
  font-size: 30rpx;
  color: #666;
}
.empty-hint {
  font-size: 24rpx;
  color: #999;
}

/* ── 底部统计 ── */
.list-footer {
  text-align: center;
  padding: 40rpx 0 20rpx;
}
.list-footer-text {
  font-size: 22rpx;
  color: #999;
}
</style>
