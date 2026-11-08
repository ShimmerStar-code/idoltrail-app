<!--
  pages/home/index  首页（演出）
  ─────────────────────────────────────────────
  设计目标：**首屏即内容**。

  旧版首页滚到底只有分类入口，没有任何一条具体活动 ——
  装 App 的用户想看的是「最近有什么演出」，却必须点两三层才能看到。
  这是「安装后大量卸载」的主要成因之一。

  新版结构（自上而下）：
    1. 城市行 + 贡献榜 + 通知铃铛
    2. 搜索框（聚焦后展开历史 / 热门词面板）
    3. 区域 tab（本地/全国/全球）+ 排序胶囊 + 分类入口
    4. 个性化入口行（登录转化钩子）
    5. **近期活动 feed**：按开演日期排序的纵向活动流（scroll-view + 窗口化）
    6. 分类抽屉（类型 / 标签），点开是底部弹层，不占首屏空间

  关键取舍：
    · 排序默认 date_ASC（即将开始）—— 后端此前只有 created_at DESC（最近录入），
      用户看到的是「最近录入的几条」而不是「最近要开演的几场」，首屏与心智完全不符。
    · 定位成功后自动切到「本地」并重拉 —— 旧版定位成功只改文案、请求仍是全球，
      顶部写着「北京」内容却是全球的，用户会判定定位坏了。
    · 首页数据走独立的 homeStore —— 旧版与活动列表页共用 store.list，
      两边互相覆盖，首页拿到的往往是列表页那套筛选下的几十条。
-->
<template>
  <PageLayout>
    <page-meta :page-style="searchActive || cityPickerVisible ? 'overflow: hidden' : ''" />
    <view class="page">
      <!-- ── 固定头部 ─────────────────────────────────────────── -->
      <view class="head home-head" :style="{ paddingTop: statusBarHeight + 'px' }">
        <view class="head-row">
          <view class="city-row" @click="showCityPicker">
            <text class="city-name">{{ displayCity }}</text>
            <image class="city-arrow" src="/static/icons/arrow-down.svg" mode="aspectFit" />
          </view>
          <view class="head-actions">
            <!-- 贡献榜入口：让用户从首页一眼就能进排行榜 -->
            <view class="rank-btn" @click="goRanking">
              <image class="rank-btn__icon" src="/static/icons/rank_icon.svg" mode="aspectFit" />
              <text class="rank-btn__text">贡献榜</text>
            </view>
            <view class="notice-btn" @click="toggleNotifPanel">
              <image class="notice-icon" src="/static/icons/notice.svg" mode="aspectFit" />
              <view v-if="notifStore.hasUnread" class="notice-badge">
                <text class="notice-badge-text">{{ notifStore.badgeText }}</text>
              </view>
            </view>
          </view>
        </view>

        <view class="search-bar" :class="{ 'search-bar--active': searchActive }">
          <uni-icons type="search" size="16" color="#999" />
          <!--
            输入框必须**常驻** DOM：试过用 v-if 在关闭时移除它，
            但 App 端原生 EditText 的视图不会被立刻回收，
            残留的原生控件继续吃掉整条搜索框区域的点击 →
            既没有 focus 事件、也点不到下面的热区，搜索框直接变成死区。
          -->
          <input
            class="search-input"
            v-model="searchKeyword"
            placeholder="搜索偶像/演出/场馆"
            placeholder-class="search-placeholder-cls"
            :focus="searchActive"
            @focus="onSearchFocus"
            @input="onSearchInput"
            @confirm="onSearchConfirm"
            confirm-type="search"
          />
          <text v-if="searchActive" class="search-close" @click="closeSearch">✕</text>
        </view>

        <!-- 区域 tab + 排序 + 分类入口 -->
        <!-- 搜索面板展开时隐藏：它在 .head 内、z-index 高于搜索面板，
             不藏会与「热门搜索」面板叠在一起（见 searchPanelOpen）。 -->
        <view v-if="!searchPanelOpen" class="filter-bar">
          <view class="region-left">
            <view
              v-for="(r, i) in regions"
              :key="i"
              class="region-item"
              :class="{
                'region-item--active': activeRegion === i,
                'region-item--disabled': i === 0 && locating,
              }"
              @click="onRegionChange(i)"
            >
              <text class="region-text">{{ r }}</text>
              <view v-if="activeRegion === i" class="region-indicator" />
            </view>
          </view>
          <view class="filter-right">
            <!-- 「全球」tab 的排序固定为「著名城市优先」，选别的排序无效 → 不给入口 -->
            <view v-if="activeRegion !== 2" class="sort-btn" @click="pickSort">
              <text class="sort-btn__text">{{ sortLabel }}</text>
              <image class="sort-btn__arrow" src="/static/icons/arrow-down.svg" mode="aspectFit" />
            </view>
            <view class="cat-btn" @click="catSheetVisible = true">
              <uni-icons type="list" size="14" color="#666" />
              <text class="cat-btn__text">分类</text>
            </view>
          </view>
        </view>

        <!-- 个性化入口行：登录转化钩子 -->
        <view v-if="!searchPanelOpen" class="personal-bar" @click="goSubscribe">
          <view class="personal-icon-wrap">
            <image class="personal-icon" src="/static/icons/notice.svg" mode="aspectFit" />
          </view>
          <view class="personal-text">
            <text class="personal-title">{{ personalTitle }}</text>
            <text class="personal-sub">{{ personalSub }}</text>
          </view>
          <uni-icons type="right" size="8" color="#999" />
        </view>
      </view>

      <!-- ── 活动 feed（scroll-view + 窗口化） ─────────────────── -->
      <scroll-view
        scroll-y
        class="feed-scroll"
        :style="{ height: scrollHeight + 'px' }"
        :scroll-into-view="scrollAnchorId"
        refresher-enabled
        :refresher-triggered="refreshing"
        @refresherrefresh="onRefresh"
        @scroll="onVirtualScroll"
        @scrolltolower="onFeedLower"
      >
        <view id="feed-top" class="feed-head">
          <text class="feed-title">{{ feedTitle }}</text>
          <text class="feed-more" @click="goEventList">查看全部 ›</text>
        </view>

        <template v-if="homeStore.loading && !feedEvents.length">
          <EventCardSkeleton v-for="i in 4" :key="`sk-${i}`" />
        </template>

        <template v-else-if="feedEvents.length">
          <view :style="{ height: topSpacer + 'px' }" />
          <view v-for="row in visibleItems" :key="row.key" class="vl-item">
            <EventCard :event="row.item" @select="toDetail" />
          </view>
          <view :style="{ height: bottomSpacer + 'px' }" />
          <view class="feed-footer">
            <text v-if="homeStore.loadingMore" class="feed-footer-text">加载中...</text>
            <text v-else-if="!homeStore.hasMore" class="feed-footer-text">没有更多了</text>
          </view>
        </template>

        <!-- 空态：给三条出路，而不是一句「暂无活动」 -->
        <view v-else class="empty">
          <text class="empty-icon">🎪</text>
          <text class="empty-text">{{ emptyTitle }}</text>
          <text class="empty-hint">试试下面这些</text>
          <view class="empty-actions">
            <view class="empty-btn empty-btn--primary" @click="showAllCn">
              <text class="empty-btn__text">看全国活动</text>
            </view>
            <view class="empty-btn" @click="showCityPicker">
              <text class="empty-btn__text">换个城市</text>
            </view>
            <view class="empty-btn" @click="goSubmit">
              <text class="empty-btn__text">上传情报</text>
            </view>
          </view>
        </view>
      </scroll-view>

      <!-- ── 浮层 ─────────────────────────────────────────────── -->
      <CityPicker
        :visible="cityPickerVisible"
        :selected-city="activeRegion === 0 ? currentCity : ''"
        @update:visible="cityPickerVisible = $event"
        @select="onCitySelect"
      />

      <!-- 分类抽屉（类型 / 标签） -->
      <CategorySheet :visible="catSheetVisible" @close="catSheetVisible = false" />

      <!-- 搜索遮盖层：暗色全屏背景 -->
      <view
        v-if="searchKeyword || showSearchPanel"
        class="search-backdrop"
        @click="closeSearch"
        @touchmove.stop.prevent
      />
      <!--
        搜索面板容器。

        结构要点（三处都是踩出来的）：
        1. 暗色遮罩 backdrop 绑了 closeSearch，但它 z-index 比面板低 →
           面板必须**按内容高度自适应**，不能铺满，遮罩才有裸露的部分可点；
        2. 原生 scroll-view 会吃掉触摸，事件不冒泡到外层 view →
           「点空白关闭」只能交给没有子元素的 backdrop；
        3. 面板内容区再包一层 @click.stop，让「点搜索结果/热门词」仍算选中。

        之前 .search-mask 是 fixed + bottom:0（铺满整屏），
        于是每一块空白都落在 scroll-view 上 → 点了没反应，只能点 ✕。
      -->
      <view
        v-if="searchKeyword || showSearchPanel"
        class="search-layer"
        :style="{ top: headerBottom + 'px' }"
      >
        <scroll-view scroll-y class="search-mask" @touchmove.stop>
          <!-- 内容区阻断冒泡：点搜索结果 / 热门词是「选中」，不该被当成「点空白关闭」 -->
          <view class="search-mask-content" @click.stop>
            <SearchOverlay
              v-if="searchKeyword"
              :keyword="searchKeyword"
              @navigate="onSearchResultTap"
            />
            <SearchSuggest
              v-else
              :history="searchHistory"
              :hot-words="hotWords"
              :hot-artists="hotArtists"
              @pick-history="onHistoryTap"
              @pick-hot="onHotTap"
              @clear-history="onClearHistory"
            />
          </view>
        </scroll-view>
      </view>

      <!-- 自定义 TabBar -->
      <TabBar :current="0" />

      <!-- 通知面板 -->
      <NotificationPanel
        :visible="showNotifPanel"
        :panel-top="noticeBtnTop"
        @close="showNotifPanel = false"
      />
    </view>
  </PageLayout>
</template>

<script setup lang="ts">
import PageLayout from "@/components/PageLayout/index.vue";
import TabBar from "@/components/TabBar/index.vue";
import SearchOverlay from "@/components/SearchOverlay/index.vue";
import SearchSuggest from "@/components/SearchSuggest/index.vue";
import CategorySheet from "@/components/CategorySheet/index.vue";
import EventCard from "@/components/EventCard/index.vue";
import EventCardSkeleton from "@/components/EventCard/Skeleton.vue";
import NotificationPanel from "@/components/NotificationPanel/index.vue";
import CityPicker from "@/components/CityPicker/index.vue";
import { useHomeStore } from "@/stores/home";
import { useArtistStore } from "@/stores/artist";
import { useSearchStore } from "@/stores/search";
import { useSubscribeStore } from "@/stores/subscribe";
import { useUserStore } from "@/stores/user";
import { useNotificationStore } from "@/stores/notification";
import { useHotStore } from "@/stores/hot";
import {
  getSearchHistory,
  addSearchHistory,
  clearSearchHistory,
  type SearchHistoryItem,
} from "@/utils/searchHistory";
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { onShow, onPageScroll, onHide, onUnload } from "@dcloudio/uni-app";
import { GENRES } from "@/constants/genres";
import {
  effectiveEventStatus,
  EVENT_TYPE_OPTIONS,
} from "@/constants/eventMeta";
import { cityEn } from "@/constants/cities";
import { HOT_ARTIST_FALLBACK } from "@/constants/hotArtists";
import { getStatusBarHeight } from "@/utils/system";
import { tabBarHeight, measureTabBarHeight } from "@/utils/tabBar";
import { locateCity } from "@/utils/location";
import { useVirtualList } from "@/composables/useVirtualList";
import { EVENT_SORT_OPTIONS, type EventSort } from "@/api/event";
import { track } from "@/utils/analytics";
import { ANALYTICS_EVENTS } from "@/constants/analytics";

const homeStore = useHomeStore();
const artistStore = useArtistStore();
const searchStore = useSearchStore();
const subscribeStore = useSubscribeStore();
const userStore = useUserStore();
const notifStore = useNotificationStore();
const hotStore = useHotStore();
const statusBarHeight = ref(20);
const searchActive = ref(false);
const searchKeyword = ref("");
const headerBottom = ref(0);
const showNotifPanel = ref(false);
const noticeBtnTop = ref(80); // 铃铛按钮底部的 px 位置，用于定位面板
const catSheetVisible = ref(false);
const refreshing = ref(false);

// ── 排序 ────────────────────────────────────────────────────────
// 默认「即将开始」：用户装 App 的第一诉求是「最近有什么演出」，
// 而不是「最近录入了什么活动」（后端历史默认口径）。
const sortCode = ref<EventSort>("date_ASC");
const sortLabel = computed(
  () => EVENT_SORT_OPTIONS.find((o) => o.code === sortCode.value)?.label ?? "即将开始",
);

function pickSort() {
  const labels = EVENT_SORT_OPTIONS.map((o) => o.label);
  uni.showActionSheet({
    itemList: labels,
    success: (res) => {
      const picked = EVENT_SORT_OPTIONS[res.tapIndex];
      if (!picked || picked.code === sortCode.value) return;
      sortCode.value = picked.code;
      track(ANALYTICS_EVENTS.SORT_CHANGE, { sort: picked.code });
      reloadFeed();
    },
    fail: () => {
      /* 用户取消 */
    },
  });
}

// ── 区域 ────────────────────────────────────────────────────────
// 0 本地 / 1 全国 / 2 全球
//
// 初始值是「全国」而不是「全球」：全球口径对国内用户基本没有可看的活动，
// 首屏就是空列表 —— 这是「装完看一眼就删」的典型路径。
// 定位成功后再自动切到「本地」。
const activeRegion = ref(1);
/** 用户手动切过区域后，定位回调不再覆盖他的选择 */
const userPickedRegion = ref(false);
const regions = ["本地", "全国", "全球"];

const LOCATING_PLACEHOLDER = "定位中...";
const currentCity = ref(LOCATING_PLACEHOLDER);
const locatedCity = ref("");
const cityPickerVisible = ref(false);
const locating = ref(false);

/** 顶部显示的城市：跟着当前区域走。
 *  旧版无论看哪个区域，顶部永远显示定位到的城市名 ——
 *  用户在「全球」下看到「北京」，会以为内容被城市筛过了。 */
const displayCity = computed(() => {
  if (activeRegion.value === 1) return "全国";
  if (activeRegion.value === 2) return "全球";
  return currentCity.value;
});

async function doLocate() {
  locating.value = true;

  // 超时兜底：15s 内未完成则降级为全国视图。
  // 首页定位是 IP 粗定位（不申请系统权限），正常几百毫秒就回；
  // 15s 是给弱网 / 后端 IP 解析服务慢留的余量。
  // done 闸门必须存在：接口返回与兜底定时器谁先到不确定，两条路径都会写
  // currentCity/locating，不加闸门会出现「已定位成功又被兜底改回」。
  let done = false;

  const settle = (city: string) => {
    if (done) return;
    done = true;
    if (locateSafeTimer) {
      clearTimeout(locateSafeTimer);
      locateSafeTimer = null;
    }
    locatedCity.value = city;
    currentCity.value = city;
    locating.value = false;
    // 埋点：定位成功（只记城市名，不记坐标 —— 坐标属于敏感个人信息）
    track(ANALYTICS_EVENTS.CITY_LOCATE, { method: "ip", ok: 1, city: city });
    // 定位成功 → 自动切到「本地」并按该城市重拉。
    // 旧版只改顶部文案、请求仍是全球，顶部写「北京」内容却是全球的，
    // 用户会直接判定「定位坏了」。
    if (!userPickedRegion.value && activeRegion.value !== 0) {
      activeRegion.value = 0;
      reloadFeed();
    }
  };

  const fallback = () => {
    if (done) return;
    done = true;
    if (locateSafeTimer) {
      clearTimeout(locateSafeTimer);
      locateSafeTimer = null;
    }
    // 定位失败不落到「北京」这种假城市 —— 那会让用户以为定位到了北京。
    // 保持「全国」视图，城市选择器里可以手动改。
    currentCity.value = "选择城市";
    locatedCity.value = "";
    locating.value = false;
    track(ANALYTICS_EVENTS.CITY_LOCATE, { method: "ip", ok: 0 });
  };
  // 15s 兜底必须存句柄：定位是逆地理 + 权限弹窗的组合，慢网/用户不点授权时
  // 可能挂满 15s。这期间用户切走 tab（onHide 不卸载）的话，定时器照样触发，
  // 回来时又发一轮请求，表现为「首页自己刷新了一下」。
  locateSafeTimer = setTimeout(fallback, 15000);

  try {
    // 默认只走 IP 粗定位（不申请任何系统权限）：首页加载不弹位置授权框，
    // 符合应用市场「权限必须在用户主动触发时申请」的要求。
    // 需要精确位置时，用户在「城市选择器」点「重新定位」才会走坐标定位。
    const city = await locateCity();
    console.log("[Location] 城市定位结果:", city);
    settle(city);
  } catch (e) {
    // 静默降级：定位只是首屏的锦上添花，失败不该打断浏览，也不弹 toast 打扰用户。
    console.error("[Location] 城市定位失败:", e);
    fallback();
  }
}

function showCityPicker() {
  // 城市只在「本地」tab 生效；全国/全球 tab 下选城市不会改变请求参数，
  // 选完只改文案、数据不动，用户会以为没生效。这里自动切回「本地」。
  if (activeRegion.value !== 0) {
    activeRegion.value = 0;
    userPickedRegion.value = true;
  }
  cityPickerVisible.value = true;
}

function onCitySelect(city: { name: string; id: string }) {
  // CityPicker 返回 { name: 中文城市名, id: region.id }
  currentCity.value = city.name;
  locatedCity.value = city.name;
  userPickedRegion.value = true;
  activeRegion.value = 0;
  track(ANALYTICS_EVENTS.CITY_SELECT, { city: city.name });
  reloadFeed();
}

/** 区域档位（0 本地 / 1 全国 / 2 全球）→ 埋点用的枚举 */
function regionCode(i: number): "local" | "national" | "global" {
  return i === 0 ? "local" : i === 1 ? "national" : "global";
}

function onRegionChange(i: number) {
  if (i === 0 && locating.value) {
    uni.showToast({ title: "正在定位中…", icon: "none" });
    return;
  }
  userPickedRegion.value = true;
  activeRegion.value = i;
  track(ANALYTICS_EVENTS.REGION_SWITCH, { region: regionCode(i) });
  reloadFeed();
}

// ── feed 请求 ────────────────────────────────────────────────────
/** feed 首屏条数：虚拟列表只渲染视口附近，卡片节点不会一次性铺满 */
const FEED_PAGE_SIZE = 10;

function buildFeedParams(): Record<string, any> {
  const params: Record<string, any> = {
    status: "PUBLISHED",
    order: sortCode.value,
  };
  if (activeRegion.value === 0) {
    // 本地：按 currentCity(zh) → 英文
    const en = cityEn(currentCity.value);
    if (en) {
      params.city = en;
    } else {
      // 城市不在映射表里，以全国兜底，tab 保持在「本地」不跳走
      params.country = "CN";
    }
  } else if (activeRegion.value === 1) {
    params.country = "CN";
  } else {
    // 全球：scope=global 让后端只返回境外 + 港澳台的活动。
    //
    // 之前这里不过滤 → 走默认查询返回全部活动（99% 是国内的），
    // 「全球」tab 看上去跟「全国」没区别。
    //
    // 排序强制 global_hot（著名城市优先）：这个 tab 的语义就是让用户
    // 先看到香港/东京/新加坡/纽约这些场次，而不是按日期从国内活动里排。
    params.scope = "global";
    params.order = "global_hot";
  }
  return params;
}

/**
 * 重拉 feed。
 *
 * @param reset 是否重置滚动位置与窗口化状态。
 *   切换区域 / 排序 / 城市 → reset=true（换的是一份完全不同的列表）。
 *   从详情页返回（onShow）→ reset=false：用户在列表里滚到了第 3 屏，
 *   回到首页被强行拽回顶部是最容易被察觉的「体验变差」。
 */
async function reloadFeed(opts: { reset?: boolean } = {}) {
  if (opts.reset !== false) {
    resetVirtual();
    scrollToTop();
  }
  await homeStore.fetchFeed({
    ...buildFeedParams(),
    page_size: FEED_PAGE_SIZE,
  });
}

// ── 窗口化渲染 ──────────────────────────────────────────────────
// 精选/过期派生状态每次渲染按「今天」判定；nowTick 仅在 onShow 时自增，
// 用于跨天回到本页能即时剔除新过期的条目。
const nowTick = ref(0);
const feedEvents = computed(() => {
  void nowTick.value;
  const l = homeStore.feed?.list ?? [];
  return l.filter((ev) => effectiveEventStatus(ev) !== "ENDED");
});

const {
  visibleItems,
  topSpacer,
  bottomSpacer,
  distanceToEnd,
  onScroll: onVirtualScroll,
  setViewportHeight,
  reset: resetVirtual,
} = useVirtualList({
  source: feedEvents,
  getKey: (ev) => ev.id,
  itemSelector: ".vl-item",
  // EventCard 高度确定（头像固定 60rpx、标题 nowrap+ellipsis），
  // 估算值可以取得很准（285rpx ≈ 142px @375 宽）。
  estimatedHeight: 142,
  overscan: 3,
});

// ── scroll-view 高度 ────────────────────────────────────────────
// scroll-view 必须给确定高度才能滚动。列表区在固定头部下方，
// 高度 = 页面高 - 头部实际高度 - 底部 TabBar 高度。
//
// ⚠️ 三个坑（都踩过）：
// 1) .head 的高度**已经包含**它的 paddingTop(statusBarHeight)，
//    再减一次 statusBarHeight 等于多扣一遍状态栏 → 底部露白；
// 2) TabBar 高度不能写死 80（实际 ≈98rpx ≈51px），写死会多扣 ≈29px；
// 3) .page 高度就是 100vh，直接实测拿，别用 windowHeight 倒推。
const pageHeight = ref(0);
const headHeight = ref(0);

const scrollHeight = computed(() => {
  if (!pageHeight.value || !headHeight.value) return 0;
  // 列表可视区 = 页面高 - 头部高 - TabBar 高（TabBar 是 fixed，浮在底部）
  return Math.max(200, pageHeight.value - headHeight.value - tabBarHeight.value);
});

function measureScrollHeight() {
  uni
    .createSelectorQuery()
    .select(".page")
    .boundingClientRect((rect: any) => {
      pageHeight.value = rect?.height || 0;
    })
    .exec();
  uni
    .createSelectorQuery()
    .select(".home-head")
    .boundingClientRect((rect: any) => {
      headHeight.value = rect?.height || 0;
    })
    .exec();
}

// 高度变化时同步给虚拟列表：否则它按「整窗高度」算渲染窗口，
// 实际视口比整窗矮一截（头部占了两百多 px），
// 首屏会多渲染看不见的卡片；滚到底时底部露白。
watch(
  scrollHeight,
  (h) => {
    if (!h) return;
    setViewportHeight(h);
  },
  { immediate: true },
);

const scrollAnchorId = ref("");
function scrollToTop() {
  scrollAnchorId.value = "";
  void nextTick(() => {
    scrollAnchorId.value = "feed-top";
  });
}

// 提前几屏开始拉下一页（与活动列表页同一口径）
const PREFETCH_SCREENS = 3;
watch(
  [distanceToEnd, scrollHeight],
  ([dist, vh]) => {
    if (!vh) return;
    if (dist < vh * PREFETCH_SCREENS) void onFeedLower();
  },
  { immediate: false },
);

async function onFeedLower() {
  if (homeStore.loading || homeStore.loadingMore) return;
  if (!homeStore.hasMore) return;
  await homeStore.loadMore({
    ...buildFeedParams(),
    page_size: FEED_PAGE_SIZE,
  });
}

/** 下拉刷新：强制绕过缓存重拉 */
async function onRefresh() {
  refreshing.value = true;
  track(ANALYTICS_EVENTS.HOME_REFRESH, { region: regionCode(activeRegion.value) });
  try {
    await homeStore.refreshFeed({
      ...buildFeedParams(),
      page_size: FEED_PAGE_SIZE,
    });
    // 强制重拉热门配置：运营刚在后台改完，用户下拉就该看到新名单
    void hotStore.load(true);
  } finally {
    refreshing.value = false;
  }
}

// ── feed 标题与空态 ─────────────────────────────────────────────
const feedTitle = computed(() => {
  const scope =
    activeRegion.value === 0
      ? currentCity.value
      : activeRegion.value === 1
        ? "全国"
        : "全球";
  // 「全球」tab 的排序固定为「著名城市优先」（见 buildFeedParams），
  // 不能沿用 sortLabel —— 那个是用户在本地/全国 tab 选的那个。
  const sort =
    activeRegion.value === 2 ? "著名城市优先" : sortLabel.value;
  return `${scope} · ${sort}`;
});

const emptyTitle = computed(() => {
  if (activeRegion.value === 0 && currentCity.value === "选择城市") {
    return "还没有定位到城市";
  }
  return "这个范围暂时没有活动";
});

// ── 个性化入口行 ────────────────────────────────────────────────
const subCount = computed(
  () =>
    subscribeStore.subscribedArtistIds.size +
    subscribeStore.subscribedCityIds.size +
    subscribeStore.subscribedEventIds.size,
);
const personalTitle = computed(() => {
  if (!userStore.isLoggedIn) return "订阅你关心的演出";
  if (subCount.value > 0) return `你已订阅 ${subCount.value} 项`;
  return "订阅偶像与城市，有变动第一时间通知";
});
const personalSub = computed(() => {
  if (!userStore.isLoggedIn) return "开演、改期、阵容变更，消息与推送都不漏";
  if (subCount.value > 0) return "查看你的订阅与日程";
  return "点一下开启订阅提醒";
});

function goSubscribe() {
  if (!userStore.isLoggedIn) {
    userStore.requireLogin({
      dismissible: true,
      reason: "home_subscribe_cta",
      onSuccess: () => {
        uni.navigateTo({ url: "/pages/subscribe/index" });
      },
    });
    return;
  }
  uni.navigateTo({ url: "/pages/subscribe/index" });
}

// ── 搜索 ────────────────────────────────────────────────────────
let searchTimer: ReturnType<typeof setTimeout> | null = null;
let scrollMeasureTimer: ReturnType<typeof setTimeout> | null = null;
// 测量搜索框位置统一走这里：searchActive 打开时（0ms）与滚动停止后（100ms）
// 是同一段逻辑，早前是两处裸 setTimeout，句柄都没保存，切页后仍会回调已卸载的节点。
let headerMeasureTimer: ReturnType<typeof setTimeout> | null = null;
/** 定位兜底定时器句柄（定位全程可能长达 15s，切页时必须能撤掉） */
let locateSafeTimer: ReturnType<typeof setTimeout> | null = null;

function measureSearchBar() {
  uni
    .createSelectorQuery()
    .select(".search-bar")
    .boundingClientRect((res: any) => {
      if (res?.bottom) headerBottom.value = res.bottom;
    })
    .exec();
}

function scheduleHeaderMeasure(delay: number) {
  if (headerMeasureTimer) clearTimeout(headerMeasureTimer);
  headerMeasureTimer = setTimeout(() => {
    headerMeasureTimer = null;
    measureSearchBar();
  }, delay);
}

function clearHomeTimers() {
  if (searchTimer) {
    clearTimeout(searchTimer);
    searchTimer = null;
  }
  if (scrollMeasureTimer) {
    clearTimeout(scrollMeasureTimer);
    scrollMeasureTimer = null;
  }
  if (headerMeasureTimer) {
    clearTimeout(headerMeasureTimer);
    headerMeasureTimer = null;
  }
  // 定位兜底定时器同样必须清：切走 tab 时定位还在路上，
  // 15s 后兜底触发会发一轮请求，用户回来看到的是「首页莫名刷新了」。
  if (locateSafeTimer) {
    clearTimeout(locateSafeTimer);
    locateSafeTimer = null;
  }
}

function onSearchInput() {
  if (searchTimer) clearTimeout(searchTimer);
  const kw = searchKeyword.value.trim();
  if (!kw) {
    searchStore.clear();
    return;
  }
  searchTimer = setTimeout(() => searchStore.searchAll(kw), 500);
}

// ── 搜索历史 ────────────────────────────────────────────────────
const searchHistory = ref<SearchHistoryItem[]>([]);

function loadSearchHistory() {
  searchHistory.value = getSearchHistory();
}

/**
 * 搜索面板出现的条件：已聚焦 + 还没输入关键词。
 *
 * 旧版还要求「确实有历史记录」，于是新用户点搜索框 → 面板整个不出现，
 * 只剩一个空输入框，看起来像搜索坏了。新版没有历史时展示热门词/热门艺人。
 */
const showSearchPanel = computed(
  () => searchActive.value && !searchKeyword.value.trim(),
);

/**
 * 搜索面板是否占据屏幕：聚焦搜索框后，无论有没有输入词。
 *
 * 搜索面板（.search-mask）的 top 是**搜索框底部**（见 measureSearchBar），
 * 而区域 tab 行与个性化入口行都在 .head 内、z-index 100 高于面板的 99 ——
 * 不藏起来的话，展开搜索时「热门搜索」会和「订阅偶像与城市…」叠在一起。
 */
const searchPanelOpen = computed(
  () => searchActive.value || !!searchKeyword.value.trim(),
);

/**
 * 热门搜索词：优先用后台配置的名单，拉不到再回落到内置的静态值。
 *
 * 兜底（活动类型 + 流派）是零请求成本的静态常量；
 * 后台配好之后运营想推什么词就是什么词，不用发版。
 */
const hotWords = computed(() =>
  hotStore.keywordNames.length
    ? hotStore.keywordNames
    : [
        ...EVENT_TYPE_OPTIONS.map((o) => o.label),
        ...GENRES.slice(0, 5).map((g) => g.label),
      ],
);

/**
 * 热门偶像：优先用后台配置的名单，拉不到再回落到内置的静态名单。
 *
 * 兜底不再是「偶像页分组接口的前 6 个」——那是按订阅分组的顺序，
 * 既不是热门分布，也凑不出华语 + 日本两侧。
 */
const hotArtists = computed(() =>
  hotStore.artistNames.length ? hotStore.artistNames : HOT_ARTIST_FALLBACK,
);

/**
 * 键盘「搜索」键：这是一次明确提交的搜索。
 * 除了记历史，还立刻查一次 —— 让用户等满 500ms 防抖属于无谓等待。
 */
function onSearchConfirm() {
  const kw = searchKeyword.value.trim();
  if (!kw) return;
  if (searchTimer) {
    clearTimeout(searchTimer);
    searchTimer = null;
  }
  addSearchHistory(kw);
  loadSearchHistory();
  searchStore.searchAll(kw);
}

/** 点进某条搜索结果：同样是明确提交的搜索，顺带把该词置顶 */
function onSearchResultTap() {
  const kw = searchKeyword.value.trim();
  if (kw) {
    addSearchHistory(kw);
    loadSearchHistory();
  }
  closeSearch();
}

function onHistoryTap(q: string) {
  searchKeyword.value = q;
  if (searchTimer) {
    clearTimeout(searchTimer);
    searchTimer = null;
  }
  // 再次写入 = 去重置顶，用户反复搜同一个词时它会保持在最前
  addSearchHistory(q);
  loadSearchHistory();
  searchStore.searchAll(q);
}

/** 点热门词：与点历史同一条路径（写入历史 + 立即搜索） */
function onHotTap(q: string) {
  onHistoryTap(q);
}

function onClearHistory() {
  clearSearchHistory();
  loadSearchHistory();
}

function closeSearch() {
  uni.showToast({ title: "CLOSE", icon: "none", duration: 3000 });  searchActive.value = false;
  // EXPERIMENT: 不清空 keyword
  searchStore.clear();
  // 收键盘：App 端点搜索框以外的区域不会自动失焦，输入法会一直挂在屏幕上，
  // 搜索面板却已经消失，看起来像「键盘卡住了」。
  uni.hideKeyboard();
}

/** 输入框获得焦点 → 确保搜索面板是展开的 */
function onSearchFocus() {
  uni.showToast({ title: "FOCUS", icon: "none", duration: 3000 });
  searchActive.value = true;
}

// ── 生命周期 ────────────────────────────────────────────────────
onMounted(() => {
  statusBarHeight.value = getStatusBarHeight();
  // 面板顶部 = 状态栏高度 + 导航行高度(约 72px) + 少量间距
  noticeBtnTop.value = statusBarHeight.value + 72;
  // 先量 TabBar（写死 80 会让列表底部与 TabBar 之间出现空白）
  measureTabBarHeight();
  void nextTick(() => measureScrollHeight());
  // ⚠️ 这里不要调 reloadFeed：uni-app 的页面生命周期是 onLoad → onShow → onReady → mounted，
  // onShow 必然先于 onMounted 触发，两处都拉就是首屏打两遍。
  // 首屏补拉订阅态（未登录会静默跳过）
  refreshSubscriptionState();
  // 拉取通知未读数（登录态下）
  if (userStore.isLoggedIn) {
    notifStore.fetchUnreadCount();
  }
  loadSearchHistory();
  // 热门艺人：后台预取，不阻塞首屏
  void artistStore.fetchGrouped(9);
});

async function refreshSubscriptionState() {
  if (!userStore.isLoggedIn) return;
  try {
    await subscribeStore.fetchMySubscribedIds();
  } catch (e) {
    // 静默失败：不阻塞首屏
    console.warn("[home] fetchMySubscribedIds failed", e);
  }
}

/**
 * 定位只在取得隐私政策同意之后才做。
 *
 * ⚠️ 应用市场对「首启 / 首页加载就弹位置授权框」的判罚是
 * 「强制、频繁、过度索取权限」（引擎2 的报法）。所以：
 *   · 这里走的是 IP 粗定位，**不申请任何系统权限**；
 *   · 精确位置权限只有用户在「城市选择器」点「重新定位」时才会申请
 *     （见 components/CityPicker/index.vue 的 reLocate）；
 *   · 隐私同意之前连 IP 定位都不发（IP 推断位置本身也是个人信息处理）。
 */
watch(
  () => userStore.privacyGranted,
  (granted: boolean) => {
    if (granted) void doLocate();
  },
  { immediate: true },
);

watch(searchActive, (val) => {
  // 进入搜索态时读一次历史：可能在别的页面（如搜索结果页）新增过，
  // 也可能刚被清空，直接以 storage 为准
  if (val) loadSearchHistory();
  if (!val) return;
  scheduleHeaderMeasure(0);
});

// 页面滚动时重新测量搜索框位置（防抖，滚动停止后再取值）
onPageScroll(() => {
  if (!searchActive.value) return;
  if (scrollMeasureTimer) clearTimeout(scrollMeasureTimer);
  scrollMeasureTimer = setTimeout(() => {
    scrollMeasureTimer = null;
    measureSearchBar();
  }, 100);
});

// 切走再回（从订阅页/详情页返回）：按当天日期重判过期 + 补拉 feed 与订阅态
onShow(() => {
  nowTick.value++; // 触发 feedEvents 重新过滤（跨天回到本页也能即时剔除新过期的"售票中"）
  // 埋点：首页曝光（每次回到首页都记一次，反映真实的活跃频次）
  track(ANALYTICS_EVENTS.HOME_VIEW, {
    region: regionCode(activeRegion.value),
    sort: sortCode.value,
  });
  // 必须重拉：feed 与列表页已隔离，但排序/区域/城市可能在上次停留时被改过，
  // 且活动状态可能已变（延期/取消）。fetchFeed 自带 5 分钟响应缓存。
  // 不重置滚动位置：从详情页返回时用户多半还停在刚才看的那一条。
  reloadFeed({ reset: false });
  refreshSubscriptionState();
  // 热门配置：首次进入时拉一次（store 内部去重，重复调用不会多打接口）
  void hotStore.load();
  void nextTick(() => measureScrollHeight());
});

// 切到后台/离开本页时停掉定时器
onHide(() => {
  // App 端 tab 切换只走 onHide 不卸载页面，不清就会在后台继续触发搜索请求与节点测量
  clearHomeTimers();
});

onUnload(() => {
  clearHomeTimers();
});

// 登录态变化：登录后补拉未读数与订阅态。
watch(
  () => userStore.isLoggedIn,
  (v) => {
    if (v) {
      refreshSubscriptionState();
      notifStore.fetchUnreadCount();
    }
  },
);

function toggleNotifPanel() {
  if (!userStore.isLoggedIn) {
    userStore.requireLogin({ reason: "查看通知" });
    return;
  }
  showNotifPanel.value = !showNotifPanel.value;
}

// ── 跳转 ────────────────────────────────────────────────────────
// 分类入口（类型 / 标签）收在 CategorySheet 抽屉里：
// 常驻在首页会占满首屏，用户一条活动都看不到。

function goEventList() {
  uni.navigateTo({ url: "/pages/event/list" });
}
/** 贡献排行榜 */
function goRanking() {
  uni.navigateTo({ url: "/pages/profile/ranking" });
}
function toDetail(id: number) {
  // 埋点：卡片点击（带来源，后台能看出用户是从首页 feed 进来的）
  track(ANALYTICS_EVENTS.EVENT_CARD_CLICK, { event_id: id, source: "home" });
  uni.navigateTo({ url: `/pages/event/detail?id=${id}&source=home` });
}

/** 空态出口：看全国 */
function showAllCn() {
  userPickedRegion.value = true;
  activeRegion.value = 1;
  reloadFeed();
}

/** 空态出口：上传情报（众包补录） */
function goSubmit() {
  uni.navigateTo({ url: "/pages/event/submit" });
}
</script>

<style scoped>
.page {
  background: #fff;
  height: 100vh;
  /* 与 artist/by-country.vue 同一个坑：必须 border-box + overflow hidden，
     否则页面与 scroll-view 双滚动，手势被外层抢走。
     注意：本项目的 border-box 禁令只针对 input / textarea，这里是 view。 */
  box-sizing: border-box;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* Header */
.head {
  position: relative;
  z-index: 100;
  flex-shrink: 0;
  padding-left: 30rpx;
  padding-right: 30rpx;
  padding-bottom: 12rpx;
}
.head-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18rpx 0 26rpx;
}
.city-row {
  display: flex;
  align-items: center;
  gap: 10rpx;
}
.city-name {
  font-size: 34rpx;
  font-weight: 600;
  color: #111;
  max-width: 200rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.city-arrow {
  width: 24rpx;
  height: 12rpx;
  margin-left: 4rpx;
}
/* 右侧操作区：贡献榜入口 + 通知铃铛 */
.head-actions {
  display: flex;
  align-items: center;
  gap: 16rpx;
}
.rank-btn {
  display: flex;
  align-items: center;
  gap: 6rpx;
  height: 72rpx;
  padding: 0 20rpx;
  border-radius: 36rpx;
  background: rgba(254, 165, 0, 0.12);
}
.rank-btn__icon {
  width: 30rpx;
  height: 30rpx;
}
.rank-btn__text {
  font-size: 24rpx;
  font-weight: 600;
  color: #fea500;
}
.search-bar {
  position: relative;
  background: rgba(248, 248, 248, 1);
  border-radius: 50rpx;
  border: 1px solid rgba(236, 236, 236, 1);
  display: flex;
  align-items: center;
  gap: 10rpx;
  padding: 16rpx 28rpx;
}
.search-bar--active {
  border-color: rgba(254, 165, 0, 1);
  background: #fff;
}
.search-input {
  flex: 1;
  font-size: 26rpx;
  color: #111;
  background: transparent;
}
.search-placeholder-cls {
  color: #bbb;
}
.search-close {
  font-size: 30rpx;
  color: #999;
  padding: 0 8rpx;
  flex-shrink: 0;
}

/* 区域 + 排序 + 分类 */
.filter-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 26rpx 0 8rpx;
}
.region-left {
  display: flex;
  gap: 40rpx;
  align-items: center;
}
.region-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4rpx;
}
.region-text {
  font-size: 32rpx;
  color: #111;
}
.region-item--active .region-text {
  font-size: 32rpx;
  font-weight: 600;
}
.region-item--disabled {
  opacity: 0.4;
}
.region-item--disabled .region-text {
  font-weight: 400;
}
.region-indicator {
  width: 60rpx;
  height: 8rpx;
  background: rgba(254, 165, 0, 1);
  border-radius: 10rpx;
  margin-top: -8rpx;
  z-index: 0;
}
.filter-right {
  display: flex;
  align-items: center;
  gap: 16rpx;
}
.sort-btn {
  display: flex;
  align-items: center;
  gap: 6rpx;
  height: 56rpx;
  padding: 0 18rpx;
  border-radius: 28rpx;
  background: rgba(245, 245, 245, 1);
}
.sort-btn__text {
  font-size: 24rpx;
  color: #333;
}
.sort-btn__arrow {
  width: 20rpx;
  height: 10rpx;
}
.cat-btn {
  display: flex;
  align-items: center;
  gap: 4rpx;
  height: 56rpx;
  padding: 0 18rpx;
  border-radius: 28rpx;
  background: rgba(245, 245, 245, 1);
}
.cat-btn__text {
  font-size: 24rpx;
  color: #333;
}

/* 个性化入口行 */
.personal-bar {
  margin-top: 18rpx;
  display: flex;
  align-items: center;
  gap: 16rpx;
  background: linear-gradient(135deg, rgba(254, 165, 0, 0.1), rgba(254, 165, 0, 0.04));
  border-radius: 20rpx;
  padding: 18rpx 20rpx;
}
.personal-icon-wrap {
  width: 56rpx;
  height: 56rpx;
  border-radius: 28rpx;
  background: rgba(255, 255, 255, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.personal-icon {
  width: 60%;
  height: 60%;
}
.personal-text {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6rpx;
  min-width: 0;
}
.personal-title {
  font-size: 26rpx;
  font-weight: 600;
  color: #232227;
}
.personal-sub {
  font-size: 22rpx;
  color: #666;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Feed */
.feed-scroll {
  /* 高度完全由 JS 计算后内联写入：
     flex-basis 若是 0%（flex:1），内联的 height 会被忽略，
     实际视口就会比 setViewportHeight 传进去的值大一截（差一个 TabBar），
     虚拟列表按错的视口算渲染窗口 → 滚到底时底部露白。
     flex:none（0 0 auto）才会让 height 生效。 */
  flex: none;
  /* 内联高度还没算出来时的兜底：宁可首屏只显示一点点，也不要整屏空白 */
  min-height: 200px;
  overflow: hidden;
}
.feed-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18rpx 30rpx 6rpx;
}
.feed-title {
  font-size: 30rpx;
  font-weight: 600;
  color: #111;
}
.feed-more {
  font-size: 24rpx;
  color: #888;
}
/* 窗口化测量锚点：padding-bottom 计入 border-box，测量才能拿到真实高度 */
.vl-item {
  overflow: hidden;
}
.feed-footer {
  text-align: center;
  padding: 20rpx 0 40rpx;
}
.feed-footer-text {
  font-size: 22rpx;
  color: #999;
}

/* 空态 */
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 100rpx 60rpx 0;
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
.empty-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 20rpx;
  margin-top: 24rpx;
}
.empty-btn {
  height: 76rpx;
  padding: 0 32rpx;
  border-radius: 38rpx;
  background: rgba(245, 245, 245, 1);
  display: flex;
  align-items: center;
  justify-content: center;
}
.empty-btn--primary {
  background: rgba(254, 165, 0, 0.12);
}
.empty-btn__text {
  font-size: 26rpx;
  color: #333;
}
.empty-btn--primary .empty-btn__text {
  color: #8a5600;
  font-weight: 600;
}

/* 全屏暗色遮罩（阻止背景滚动） */
.search-backdrop {
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  background: rgba(50, 50, 50, 0.88);
  z-index: 98;
}
/* 搜索结果/建议面板 */
.search-layer {
  position: fixed;
  left: 0;
  right: 0;
  z-index: 99;
}
/* 面板按内容高度自适应（不能铺满）：铺满就会把暗色遮罩全盖住，
   遮罩上的 closeSearch 再也点不到（原生 scroll-view 还会吃掉触摸）。 */
.search-mask {
  max-height: 70vh;
  padding: 20rpx 30rpx 30rpx;
  box-sizing: border-box;
}

.notice-btn {
  width: 72rpx;
  height: 72rpx;
  border-radius: 36rpx;
  background: #f0f0f0;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}
.notice-icon {
  width: 90%;
  height: 90%;
}
.notice-badge {
  position: absolute;
  top: -6rpx;
  right: -6rpx;
  min-width: 32rpx;
  height: 32rpx;
  border-radius: 16rpx;
  background: rgba(243, 108, 108, 1);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 6rpx;
}
.notice-badge-text {
  font-size: 18rpx;
  font-weight: 600;
  color: #fff;
  line-height: 1;
}
</style>
