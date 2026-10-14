<template>
  <PageLayout>
    <page-meta :page-style="searchKeyword || cityPickerVisible ? 'overflow: hidden' : ''" />
    <view class="page">
      <!-- 顶部状态栏占位 -->
      <view class="header" :style="{ paddingTop: statusBarHeight + 'px' }">
        <view class="header-row">
          <view class="city-row" @click="showCityPicker">
            <!--          <image-->
            <!--            class="city-loc-icon"-->
            <!--            src="/static/icons/location.png"-->
            <!--            mode="aspectFit"-->
            <!--          />-->
            <text class="city-name">{{ currentCity }}</text>
            <image
              class="city-arrow"
              src="/static/icons/arrow-down.svg"
              mode="aspectFit"
            />
          </view>
          <view class="notice-btn" @click="toggleNotifPanel">
            <image
              class="notice-icon"
              src="/static/icons/notice.svg"
              mode="aspectFit"
            />
            <!-- 未读数 badge -->
            <view v-if="notifStore.hasUnread" class="notice-badge">
              <text class="notice-badge-text">{{ notifStore.badgeText }}</text>
            </view>
          </view>
        </view>
        <view
          class="search-bar"
          :class="{ 'search-bar--active': searchActive }"
        >
          <uni-icons type="search" size="16" color="#999" />
          <input
            class="search-input"
            v-model="searchKeyword"
            placeholder="搜索偶像/演出/场馆"
            placeholder-class="search-placeholder-cls"
            :focus="searchActive"
            @focus="searchActive = true"
            @input="onSearchInput"
            confirm-type="search"
          />
          <text v-if="searchActive" class="search-close" @click="closeSearch"
            >✕</text
          >
        </view>
      </view>

      <scroll-view
        :scroll-y="!searchKeyword"
        class="scroll-body"
        :style="{ paddingBottom: tabBarHeight + 'px' }"
      >
        <!-- 演出类型标签 -->
        <view class="type-tabs">
          <scroll-view scroll-x class="type-scroll">
            <view class="type-list">
              <view
                v-for="(t, i) in eventTypes"
                :key="i"
                class="type-item"
                :class="{ 'type-item--active': activeType === i }"
                @click="goTypeList(i)"
              >
                <image class="type-img" :src="t.img" mode="aspectFit" />
                <text class="type-text">{{ t.label }}</text>
              </view>
            </view>
          </scroll-view>
        </view>

        <!-- 区域切换 -->
        <view class="region-tabs">
          <view class="region-left">
            <view
              v-for="(r, i) in regions"
              :key="i"
              class="region-item"
              :class="{
                'region-item--active': activeRegion === i,
                'region-item--disabled':
                  i === 0 && currentCity === LOCATING_PLACEHOLDER,
              }"
              @click="onRegionChange(i)"
            >
              <text class="region-text">{{ r }}</text>
              <view v-if="activeRegion === i" class="region-indicator" />
            </view>
          </view>
          <text class="view-all" @click="goEventList">查看所有</text>
        </view>

        <!-- 精选活动卡片轮播 -->
        <view v-if="store.loading" class="featured-skeleton-wrap">
          <FeaturedSkeleton />
        </view>
        <swiper
          v-else-if="featuredLive.length > 0"
          :key="activeRegion + '-' + (activeRegion === 0 ? currentCity : 'all')"
          class="featured-swiper"
          :indicator-dots="featuredLive.length > 1"
          indicator-color="rgba(255,255,255,0.5)"
          indicator-active-color="rgba(255,255,255,1)"
          :autoplay="true"
          :interval="4000"
          :circular="true"
          :duration="400"
        >
          <swiper-item v-for="item in featuredLive" :key="item.id">
            <EventCard :event="item" variant="swiper" @select="toDetail" />
          </swiper-item>
        </swiper>
        <view v-else class="featured-empty">
          <text class="featured-empty-text">该地区暂无活动</text>
        </view>

        <!-- 标签分类 -->
        <view class="section-wrap">
          <view class="section-header">
            <text class="section-title">标签</text>
          </view>
          <view class="genre-grid">
            <view
              v-for="(g, i) in genres"
              :key="i"
              class="genre-card"
              @click="filterByGenre(g.code)"
            >
              <!-- 左侧内容 -->
              <view class="genre-left">
                <text
                  class="genre-name"
                  :style="{ '--genre-color': g.color }"
                  >{{ g.label }}</text
                >
                <text class="genre-subtitle">{{ g.subtitle }}</text>
              </view>
              <!-- 右侧图标 -->
              <view class="genre-icon-wrap">
                <image class="genre-icon" :src="g.icon" mode="aspectFit" />
              </view>
            </view>
          </view>
        </view>
      </scroll-view>

      <!-- 城市选择弹框（使用 CityPicker 组件，带搜索功能） -->
      <CityPicker
        :visible="cityPickerVisible"
        :selected-city="
          currentCity === LOCATING_PLACEHOLDER ? '' : currentCity
        "
        @update:visible="cityPickerVisible = $event"
        @select="onCitySelect"
      />

      <!-- 搜索遮盖层：暗色全屏背景 -->
      <view
        v-if="searchKeyword"
        class="search-backdrop"
        @click="closeSearch"
        @touchmove.stop.prevent
      />
      <!-- 搜索结果：紧贴 header 底部，可上下滚动 -->
      <scroll-view
        v-if="searchKeyword"
        scroll-y
        class="search-mask"
        :style="{ top: headerBottom + 'px' }"
        @touchmove.stop
      >
        <SearchOverlay :keyword="searchKeyword" @navigate="closeSearch" />
      </scroll-view>

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
import FeaturedSkeleton from "@/components/FeaturedSkeleton/index.vue";
import EventCard from "@/components/EventCard/index.vue";
import NotificationPanel from "@/components/NotificationPanel/index.vue";
import CityPicker from "@/components/CityPicker/index.vue";
import { useEventStore } from "@/stores/event";
import { useSearchStore } from "@/stores/search";
import { useSubscribeStore } from "@/stores/subscribe";
import { useUserStore } from "@/stores/user";
import { useNotificationStore } from "@/stores/notification";
import { computed, onMounted, ref, watch } from "vue";
import { onShow, onPageScroll, onHide, onUnload } from "@dcloudio/uni-app";
import { GENRES } from "@/constants/genres";
import { effectiveEventStatus } from "@/constants/eventMeta";
import { cityEn } from "@/constants/cities";
import { getStatusBarHeight } from "@/utils/system";
import { locateCity } from "@/utils/location";
const store = useEventStore();
const searchStore = useSearchStore();
const subscribeStore = useSubscribeStore();
const userStore = useUserStore();
const notifStore = useNotificationStore();
const statusBarHeight = ref(20);
const tabBarHeight = ref(80);
const searchActive = ref(false);
const searchKeyword = ref("");
const headerBottom = ref(0);
const showNotifPanel = ref(false);
const noticeBtnTop = ref(80); // 铃铛按钮底部的 px 位置，用于定位面板

// ── 精选只展示未过期活动；每次进入页面(nowTick++)按当天日期重判一次，防止缓存残留的过期"售票中" ──
const nowTick = ref(0);
// swiper 会同时渲染全部 swiper-item，必须硬性限制条数。
// store.list 是**首页与活动列表页共用**的同一份数据：活动列表页 loadMore 会不断
// append（20→40→60…），而首页 onShow 早前不重拉 loadFeatured，于是用户浏览几屏列表
// 再回首页，featuredLive 就会把上百条全塞进 swiper —— 既是错误的首页内容，
// 也是实打实的卡死（一屏上百个复杂卡片）。
const FEATURED_MAX = 10;
const featuredLive = computed(() => {
  void nowTick.value; // 读一下建立依赖：onShow / 切换城市会自增触发重过滤
  return (store.list?.list ?? [])
    .filter((ev) => effectiveEventStatus(ev) !== "ENDED")
    .slice(0, FEATURED_MAX);
});

let searchTimer: ReturnType<typeof setTimeout> | null = null;
let scrollMeasureTimer: ReturnType<typeof setTimeout> | null = null;
// 测量搜索框位置统一走这里：searchActive 打开时（0ms）与滚动停止后（100ms）
// 是同一段逻辑，早前是两处裸 setTimeout，句柄都没保存，切页后仍会回调已卸载的节点。
let headerMeasureTimer: ReturnType<typeof setTimeout> | null = null;

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

function closeSearch() {
  searchActive.value = false;
  searchKeyword.value = "";
  searchStore.clear();
}
const activeType = ref(0);
const activeRegion = ref(2); // 默认"全球"：首屏无需定位，1次请求即可渲染

// ── 城市定位相关 ──
// 定位中的占位文案：模板的 disabled 样式、CityPicker 的 selected-city、
// onRegionChange 的可点判断都依赖它，抽成常量避免文案改动漏改判断逻辑。
const LOCATING_PLACEHOLDER = "定位中...";
const currentCity = ref(LOCATING_PLACEHOLDER);
const locatedCity = ref("");
const cityPickerVisible = ref(false);
const locating = ref(false);

async function doLocate() {
  locating.value = true;

  // 超时兜底：3s 内未完成则降级为北京（8s 体感太长，缩短后首屏更快）。
  // done 闸门必须存在：接口返回与兜底定时器谁先到不确定，两条路径都会写
  // currentCity/locating，不加闸门会出现「已定位成功又被兜底改回北京」。
  let done = false;

  const settle = (city: string) => {
    if (done) return;
    done = true;
    clearTimeout(safeTimer);
    locatedCity.value = city;
    currentCity.value = city;
    locating.value = false;
    if (activeRegion.value === 0) loadFeatured();
  };

  const fallback = () => {
    if (done) return;
    done = true;
    clearTimeout(safeTimer);
    if (currentCity.value === LOCATING_PLACEHOLDER) currentCity.value = "北京";
    locatedCity.value = "";
    locating.value = false;
    if (activeRegion.value === 0) loadFeatured();
  };
  const safeTimer = setTimeout(fallback, 3000);

  try {
    // IP 粗定位：不申请系统定位权限，也没有「用户拒绝授权」这条失败路径
    const city = await locateCity();
    console.log("[Location] IP 定位结果:", city);
    settle(city);
  } catch (e) {
    // 静默降级：定位只是首屏的锦上添花，失败不该打断浏览，也不弹 toast 打扰用户。
    // 兜底到「北京」，用户可在城市选择器里改。
    console.error("[Location] IP 定位失败:", e);
    fallback();
  }
}

function showCityPicker() {
  // 城市只在「本地」tab 生效；全国/全球 tab 下选城市不会改变请求参数，
  // 选完只改文案、数据不动，用户会以为没生效。这里自动切回「本地」。
  if (activeRegion.value !== 0) {
    activeRegion.value = 0;
  }
  cityPickerVisible.value = true;
}

function onCitySelect(city: { name: string; id: string }) {
  // CityPicker 返回 { name: 中文城市名, id: region.id }
  currentCity.value = city.name;
  locatedCity.value = city.name;
  // 选完城市立即按当前区域重新拉取
  loadFeatured();
}

function onRegionChange(i: number) {
  // "本地" 在定位中不可点
  if (i === 0 && currentCity.value === LOCATING_PLACEHOLDER) {
    uni.showToast({ title: "正在定位中…", icon: "none" });
    return;
  }
  activeRegion.value = i;
  loadFeatured();
}

function loadFeatured() {
  const params: Record<string, any> = { status: "PUBLISHED" };
  if (activeRegion.value === 0) {
    // 本地:按 currentCity(zh) → 英文
    const en = cityEn(currentCity.value);
    if (en) {
      params.city = en;
    } else {
      // 城市不在映射表里，以全国兜底，tab 保持在"本地"不跳走
      params.country = "CN";
    }
  } else if (activeRegion.value === 1) {
    // 全国
    params.country = "CN";
  }
  // 2 (全球) 不过滤；首屏轮播只需 10 条
  store.fetchList({ ...params, page_size: 10 });
}

async function refreshSubscriptionState() {
  if (!userStore.isLoggedIn) return;
  try {
    await subscribeStore.fetchMySubscribedIds();
  } catch (e) {
    // 静默失败：不阻塞首屏
    console.warn("[home] fetchMySubscribedIds failed", e);
  }
}

onMounted(() => {
  statusBarHeight.value = getStatusBarHeight();
  // 面板顶部 = 状态栏高度 + 导航行高度(约 72px) + 少量间距
  noticeBtnTop.value = statusBarHeight.value + 72;
  loadFeatured();
  doLocate();
  // 首屏补拉订阅态（未登录会静默跳过）
  refreshSubscriptionState();
  // 拉取通知未读数（登录态下）
  if (userStore.isLoggedIn) {
    notifStore.fetchUnreadCount();
  }
});

watch(searchActive, (val) => {
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

// 切走再回（从订阅页/详情页返回）：按当天日期重判精选过期 + 补拉精选与订阅态
onShow(() => {
  nowTick.value++; // 触发 featuredLive 重新过滤（跨天回到本页也能即时剔除新过期的"售票中"）
  // 必须重拉：store.list 与活动列表页共用，从列表页返回时里面装的是
  // 用户当时那套筛选条件 + 已 append 的几十条，不重拉首页轮播就不是"精选"了。
  // fetchList 自带 5 分钟响应缓存，命中时不发请求，无额外开销。
  loadFeatured();
  refreshSubscriptionState();
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
// 登录态变化：登录后补拉订阅态与通知角标；登出由 userStore 的清理链路负责。
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
    userStore.requireLogin({ reason: '查看通知' });
    return;
  }
  showNotifPanel.value = !showNotifPanel.value;
}

const eventTypes = [
  { code: "concert", label: "演唱会", img: "/static/icons/concert.svg" },
  {
    code: "music_festival",
    label: "音乐节",
    img: "/static/icons/festival.svg",
  },
  {
    code: "fan_meeting",
    label: "粉丝见面会",
    img: "/static/icons/fanmeeting.svg",
  },
  { code: "anime_expo", label: "漫展", img: "/static/icons/anime.svg" },
  { code: "concert_hall", label: "音乐会", img: "/static/icons/hall.svg" },
];

const regions = ["本地", "全国", "全球"];

const genres = GENRES;

function goEventList() {
  uni.navigateTo({ url: "/pages/event/list" });
}
function toDetail(id: number) {
  uni.navigateTo({ url: `/pages/event/detail?id=${id}` });
}

function filterByGenre(code: string) {
  uni.navigateTo({ url: `/pages/event/list?genre=${code}` });
}

function goTypeList(i: number) {
  activeType.value = i;
  const code = eventTypes[i]?.code;
  if (!code) return;
  uni.navigateTo({ url: `/pages/event/list?type=${code}` });
}
</script>

<style scoped>
.page {
  background: #fff;
  min-height: 100vh;
}

/* Header */
.header {
  position: relative;
  z-index: 100;
  padding-left: 30rpx;
  padding-right: 30rpx;
  padding-bottom: 20rpx;
}
.header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18rpx 0 34rpx;
}
.city-row {
  display: flex;
  align-items: center;
  gap: 10rpx;
}
.city-loc-icon {
  width: 28rpx;
  height: 28rpx;
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
.search-bar {
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
/* 搜索结果滚动容器 */
.search-mask {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 99;
  padding: 20rpx 30rpx 30rpx;
  box-sizing: border-box;
}

/* Scroll */
.scroll-body {
  flex: 1;
}

/* Type tabs */
.type-tabs {
  padding: 10rpx 30rpx 0;
}
.type-scroll {
  white-space: nowrap;
}
.type-list {
  display: flex;
  gap: 0;
}
.type-item {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 8rpx;
  width: 120rpx;
  padding: 0 10rpx;
}
.type-img {
  width: 100rpx;
  height: 100rpx;
  border-radius: 50%;
}
.type-text {
  font-size: 22rpx;
  color: #111;
  white-space: nowrap;
}

/* Region tabs */
.region-tabs {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 40rpx 30rpx 0;
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
  font-size: 34rpx;
  color: #111;
}
.region-item--active .region-text {
  font-size: 34rpx;
  font-weight: 600;
}
.region-item--disabled {
  opacity: 0.4;
}
.region-item--disabled .region-text {
  font-weight: 400;
}
.region-indicator {
  width: 68rpx;
  height: 10rpx;
  background: rgba(254, 165, 0, 1);
  border-radius: 10rpx;
  margin-top: -10rpx;
  z-index: 0;
}
.view-all {
  font-size: 26rpx;
  color: #111;
}

/* Featured card swiper */
.featured-skeleton-wrap {
  width: 100%;
  height: 380rpx;
}
.featured-swiper {
  width: 100%;
  height: 380rpx;
}
/* 外层色块（保留供 swiper 容器参考） */

.featured-empty {
  height: 380rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}
.featured-empty-text {
  font-size: 28rpx;
  color: #999;
}

/* Section */
.section-wrap {
  width: 90%;
  margin: 20rpx auto;
  border-radius: 30rpx;
  /* padding: 30rpx 30rpx 160rpx; */
  box-shadow: 0rpx 10rpx 29rpx 0rpx rgba(0, 0, 0, 0.06);
  border: 2rpx solid #ececec;
}
.section-header {
  margin: 24rpx;
}
.section-title {
  font-size: 34rpx;
  font-weight: 600;
  color: #111;
}

/* Genre grid */
.genre-grid {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  border-radius: 24rpx;
  padding: 24rpx 20rpx 0;
}

.genre-card {
  width: 48%;
  border-radius: 24rpx;
  box-sizing: border-box;
  margin-bottom: 24rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24rpx 24rpx;
  position: relative;
  overflow: hidden;
  background: #e9f0f4;
  box-shadow: 0rpx 19rpx 38rpx -29rpx #8aa0ae;
}
.genre-left {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
  flex: 1;
  z-index: 1;
}
.genre-subtitle {
  font-size: 22rpx;
  font-weight: 400;
  color: rgba(0, 0, 0, 0.4);
}
.genre-name {
  position: relative;
  width: fit-content;
  font-size: 32rpx;
  font-weight: 700;
  color: #111;
}
.genre-name::after {
  content: "";
  position: absolute;
  bottom: -4rpx;
  left: 0;
  width: 100%;
  height: 10rpx;
  background: var(--genre-color);
  border-radius: 5rpx;
}

.genre-icon-wrap {
  width: 80rpx;
  height: 80rpx;
  border-radius: 40rpx;
  background: rgba(255, 255, 255, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  z-index: 1;
}
.genre-icon {
  width: 100%;
  height: 100%;
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
