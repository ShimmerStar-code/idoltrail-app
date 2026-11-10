<!--
  场馆详情页
  ─────────────────────────────────────
  设计目标（2026-11 重做）：**与主页列表同一套视觉语言**。

  之前这一页是全项目最早写的样式：黄色底 section 标题、橙/绿交替卡片、
  emoji 图标（📍📅🌐）、★ 收藏按钮 —— 与现在的活动卡片（EventCard）
  完全不像一家人，用户从首页点进场馆页会以为换了个 App。

  重做后的原则：
  1. **活动卡片直接复用 EventCard 组件**（与首页/活动列表页逐像素一致），
     数据也改成与 /events 列表同构的接口 GET /places/:id/events/list；
  2. 头部信息区沿用活动详情页（pages/event/detail.vue）的
     「主卡片 + chips + detail-row」结构与配色；
  3. 去掉 emoji 与自绘收藏：图标统一用 /static/detail_icon/*.svg，
     活动卡片内部的订阅按钮交给 EventCard。

  2026-11 再次调整（用户反馈）：
  - **订阅入口改成带文字的按钮**：原来导航栏右上角只有一个灰圆图标，
    和「收藏」长得一模一样，用户不知道点的是订阅场馆。
    现在导航栏是「订阅场馆 / 已订阅」胶囊，页面内还有一块主 CTA 与说明文案；
  - **配色不再是全灰**：主卡片用品牌渐变（#FFE39A → #FCA8B3），
    页面底色是极浅的暖色渐变，信息行从灰块换成浅橙底 + 描边。

  ⚠️ 样式是照着 event/detail.vue 抄的（那边是 scoped，抄不到），
  以后改那页的视觉，这里要跟着改，否则两页又会分叉。
-->
<template>
  <PageLayout>
    <view class="page">
      <!-- NavBar：自绘返回键。全局 globalStyle.app-plus.titleNView=false 关掉了原生
           导航栏，所以每个二级页都得自己画一个，否则进来就没有返回入口 -->
      <view class="navbar" :style="{ paddingTop: statusBarHeight + 'px' }">
        <view class="navbar-inner" :style="{ paddingRight: navRightPadding + 'px' }">
          <view class="nav-back" @tap="goBack">
            <uni-icons type="left" size="large" color="#333" />
            <text class="nav-back-label">场馆详情</text>
          </view>
          <!--
            订阅场馆：**带文字**的按钮。
            原来这里是一个 64rpx 的灰色圆形图标（与活动详情页抄的同一套），
            用户完全看不出点的是「订阅这个场馆」—— 订阅 / 收藏 / 分享长得一样。
            现在改成带文案的胶囊，并配品牌色，一眼能认出。
          -->
          <view
            class="nav-sub-btn"
            :class="{ 'nav-sub-btn--on': isSubscribed }"
            hover-class="nav-sub-btn--hover"
            @tap.stop="onToggleSubscribe"
          >
            <image
              class="nav-sub-icon"
              :src="
                isSubscribed
                  ? '/static/icons/subscribed.svg'
                  : '/static/icons/subscribe_icon.svg'
              "
              mode="aspectFit"
            />
            <text class="nav-sub-text">{{
              isSubscribed ? "已订阅" : "订阅场馆"
            }}</text>
          </view>
        </view>
      </view>

      <view v-if="place" class="content">
        <!-- 主卡片：场馆名 + 类型/城市/国家 chips（与活动详情页同结构） -->
        <view class="card">
          <view class="card-body">
            <view class="title-card">
              <text class="place-title">{{ place.name }}</text>
            </view>
            <view class="chips">
              <view v-if="placeTypeText" class="chip chip--accent">{{
                placeTypeText
              }}</view>
              <view v-if="place.city" class="chip">{{ place.city }}</view>
              <view v-if="place.country" class="chip">{{ place.country }}</view>
            </view>

            <!--
              页面内的主 CTA：把「订阅场馆」写成一句人话，
              并说明订阅后会发生什么（用户最怕订阅了却不知道会收到什么）。
            -->
            <view class="cta">
              <view
                class="cta-btn"
                :class="{ 'cta-btn--on': isSubscribed }"
                hover-class="cta-btn--hover"
                @tap="onToggleSubscribe"
              >
                <image
                  class="cta-icon"
                  :src="
                    isSubscribed
                      ? '/static/icons/subscribed.svg'
                      : '/static/icons/subscribe_icon.svg'
                  "
                  mode="aspectFit"
                />
                <text class="cta-btn-text">{{
                  isSubscribed ? "已订阅该场馆" : "订阅该场馆"
                }}</text>
              </view>
              <text class="cta-hint">{{
                isSubscribed
                  ? "该场馆有新活动时会通知你"
                  : "订阅后，该场馆有新的演出安排时通知你"
              }}</text>
            </view>
          </view>
        </view>

        <!-- 信息区：地址（可点调起地图）、别名 -->
        <view class="info-card">
          <view
            v-if="place.address"
            class="detail-row"
            :hover-class="hasCoords ? 'detail-row-hover' : ''"
            :hover-stay-time="120"
            @tap="openMap"
          >
            <view class="detail-icon-wrap">
              <image
                class="dico-img"
                src="/static/detail_icon/location.svg"
                mode="aspectFit"
              />
            </view>
            <text class="dtxt">{{ place.address }}</text>
            <text v-if="hasCoords" class="dtxt-arrow">›</text>
          </view>

          <view v-if="aliasesText" class="detail-row">
            <view class="detail-icon-wrap">
              <image
                class="dico-img"
                src="/static/detail_icon/name.svg"
                mode="aspectFit"
              />
            </view>
            <text class="dtxt">{{ aliasesText }}</text>
          </view>
        </view>

        <!-- 场馆活动：复用 EventCard，与主页列表完全一致 -->
        <view class="section-pad">
          <view class="section-title-row">
            <text class="section-title section-title--highlight">场馆活动</text>
            <text class="section-all">共 {{ total }} 场</text>
          </view>

          <view v-if="loading" class="empty">加载中...</view>
          <view v-else-if="!events.length" class="empty">该场馆暂无活动</view>

          <template v-else>
            <EventCard
              v-for="ev in events"
              :key="ev.id"
              :event="ev"
              @select="goEvent"
            />
            <view v-if="hasMore" class="load-more" hover-class="load-more--hover" @tap="loadMore">
              <text class="load-more-text">加载更多（已显示 {{ events.length }} / {{ total }}）</text>
            </view>
          </template>
        </view>
      </view>

      <view v-else class="empty">{{ loading ? "加载中..." : "场馆信息不存在" }}</view>
    </view>
  </PageLayout>
</template>

<script setup lang="ts">
import PageLayout from "@/components/PageLayout/index.vue";
import EventCard from "@/components/EventCard/index.vue";
import { ref, computed } from "vue";
import { onLoad } from "@dcloudio/uni-app";
import { request } from "@/utils/request";
import { getNavBarMetrics } from "@/utils/system";
import { switchTabPage } from "@/utils/pages";
import { useSubscribeStore } from "@/stores/subscribe";
import { useUserStore } from "@/stores/user";
import type { Place } from "@/types/place";
import type { Event } from "@/types/event";

const subscribeStore = useSubscribeStore();
const userStore = useUserStore();

// 按需内联，避免 api/place.js 被打入主包（place 页面属于分包）
const placeApi = {
  detail: (id: string) => request<Place>(`/places/${id}`, { method: "GET" }),
  /**
   * 场馆活动列表（与 /events 列表同构）。
   *
   * ⚠️ 不要用旧的 /places/:id/events：那是给独立小程序代码库用的精简结构
   * （title/type/city/event_date…），字段少得没法喂 EventCard。
   */
  events: (id: string, page: number, pageSize: number) =>
    request<{ total: number; page: number; page_size: number; list: Event[] }>(
      `/places/${id}/events/list`,
      { method: "GET", data: { page, page_size: pageSize } },
    ),
};

const place = ref<Place | null>(null);
const events = ref<Event[]>([]);
const total = ref(0);
const page = ref(0);
const loading = ref(true);
const loadingMore = ref(false);

/** 每页条数：与首页活动列表一致 */
const PAGE_SIZE = 20;

const hasMore = computed(() => events.value.length < total.value && !loadingMore.value);

// 自绘导航栏尺寸：状态栏高度 + 右上角避让
const { statusBarHeight, navRightPadding } = getNavBarMetrics();

// 上一页：正常从活动详情 navigateTo 过来直接返回；
// 从推送通知冷启动进来时页面栈只有自己一页，回退会白屏，所以兜底回首页 tab。
function goBack() {
  if (getCurrentPages().length > 1) {
    uni.navigateBack();
  } else {
    switchTabPage("/pages/home/index");
  }
}

// place_type 枚举 → 中文显示（对应后端 place_type_ref，migration 0051 起统一 Title Case）
const PLACE_TYPE_MAP: Record<string, string> = {
  Indoor: "室内场馆",
  Outdoor: "户外场馆",
  Livehouse: "Livehouse",
  Club: "俱乐部",
  Park: "公园",
  Stadium: "体育场",
  Arena: "体育馆",
};
const placeTypeText = computed(() => {
  if (!place.value?.type) return "";
  // 0051 之前 places.type 大小写混写（indoor / Outdoor / stadium），
  // 兜底做一次首字母大写归一，避免旧数据渲染出英文原值
  const t = place.value.type;
  return (
    PLACE_TYPE_MAP[t] ??
    PLACE_TYPE_MAP[`${t.charAt(0).toUpperCase()}${t.slice(1)}`] ??
    t
  );
});

const aliasesText = computed(() => {
  if (!place.value?.aliases?.length) return "";
  const names = place.value.aliases.map((a) => a.name).filter(Boolean);
  return names.length ? `别名：${names.join("、")}` : "";
});

/** 有经纬度才能调起地图 */
const hasCoords = computed(
  () =>
    !!place.value &&
    Number.isFinite(place.value.latitude) &&
    Number.isFinite(place.value.longitude) &&
    place.value.latitude !== 0 &&
    place.value.longitude !== 0,
);

// ── 订阅场馆 ────────────────────────────────────────────────────
const isSubscribed = computed(() =>
  place.value ? subscribeStore.isVenueSubscribed(place.value.id) : false,
);

/**
 * 订阅/退订这个场馆。
 *
 * 未登录先拉登录框（登录后自动继续），与活动详情页的订阅入口同一套流程。
 */
function onToggleSubscribe() {
  const id = place.value?.id;
  if (!id) return;
  const run = async () => {
    try {
      const now = await subscribeStore.toggleVenue(id);
      uni.showToast({
        title: now ? "已订阅该场馆" : "已退订该场馆",
        icon: "success",
      });
    } catch (e) {
      uni.showToast({
        title: (e as Error)?.message || "操作失败",
        icon: "none",
      });
    }
  };
  if (!userStore.isLoggedIn) {
    userStore.requireLogin({
      dismissible: true,
      reason: "place_detail_subscribe",
      onSuccess: () => void run(),
    });
    return;
  }
  void run();
}

function openMap() {
  if (!place.value || !hasCoords.value) return;
  uni.openLocation({
    latitude: place.value.latitude,
    longitude: place.value.longitude,
    name: place.value.name,
    address: place.value.address,
    // 设备没装地图 App 时 openLocation 会 fail，静默失败会让人以为按钮坏了
    fail: () => {
      uni.showToast({ title: "未能打开地图，请稍后重试", icon: "none" });
    },
  });
}

function goEvent(id: number) {
  uni.navigateTo({ url: `/pages/event/detail?id=${id}` });
}

/** 拉第一页（或追加下一页） */
async function loadEvents(id: string, append: boolean) {
  if (append) {
    if (loadingMore.value) return;
    loadingMore.value = true;
  } else {
    loading.value = true;
  }
  try {
    const res = await placeApi.events(id, append ? page.value + 1 : 1, PAGE_SIZE);
    const list = res?.list || [];
    events.value = append ? [...events.value, ...list] : list;
    page.value = res?.page ?? (append ? page.value + 1 : 1);
    total.value = res?.total ?? events.value.length;
  } catch (e) {
    if (!append) {
      events.value = [];
      total.value = 0;
      uni.showToast({ title: (e as Error)?.message || "场馆活动加载失败", icon: "none" });
    }
  } finally {
    loading.value = false;
    loadingMore.value = false;
  }
}

function loadMore() {
  if (!place.value || loadingMore.value || !hasMore.value) return;
  loadEvents(place.value.id, true);
}

onLoad(async (options) => {
  const id = options?.id;
  if (!id || id === "undefined") {
    uni.showToast({ title: "场馆ID缺失", icon: "none" });
    loading.value = false;
    return;
  }

  // 详情与活动列表并发拉取：串行是 2 个 RTT 叠加，且详情失败会 return，
  // 活动列表永远不发请求（场馆页下半屏整片空白）。
  loading.value = true;
  const [detailRes, eventsRes] = await Promise.allSettled([
    placeApi.detail(String(id)),
    placeApi.events(String(id), 1, PAGE_SIZE),
  ]);

  if (detailRes.status === "fulfilled") {
    place.value = detailRes.value;
    // 同步系统导航栏标题为场馆名
    uni.setNavigationBarTitle({ title: place.value.name });
  } else {
    const e = detailRes.reason;
    uni.showToast({ title: e?.message || "场馆加载失败", icon: "none" });
  }

  if (eventsRes.status === "fulfilled") {
    const res = eventsRes.value;
    events.value = res?.list || [];
    page.value = res?.page ?? 1;
    total.value = res?.total ?? events.value.length;
  } else {
    events.value = [];
    total.value = 0;
  }
  loading.value = false;

  // 订阅按钮反显：拉一次已订阅 id 集合（登录态下）。
  // 未登录时按钮显示未订阅，点它会先拉登录框。
  if (userStore.isLoggedIn) {
    subscribeStore.fetchMySubscribedIds().catch(() => {});
  }
});
</script>

<style scoped>
/*
  配色（2026-11 重做）：
  这一页原来整页是灰的 —— 主卡片 #e4e5e9、信息行 #f5f5f5、页面纯白，
  和 App 主色（暖黄 → 粉）没有任何关系，看着像「未完成的占位页」。
  现在把品牌色引进来：
    - 页面底：极浅的暖色渐变（黄 → 粉），让整页有温度但不抢内容；
    - 主卡片：品牌渐变（#FFE39A → #FCA8B3），白色标题卡浮在上面；
    - 信息行：白色半透明 + 细描边，不再是灰块。
*/
.page {
  min-height: 100vh;
  padding-bottom: 60rpx;
  background: linear-gradient(
    180deg,
    rgba(255, 227, 154, 0.35) 0%,
    rgba(252, 168, 179, 0.14) 22%,
    rgba(255, 255, 255, 0) 46%
  );
  background-attachment: fixed;
}

/* ── NavBar（全局 titleNView=false，原生导航栏不可用，只能自绘） ── */
.navbar {
  background: #fff;
  position: sticky;
  top: 0;
  z-index: 100;
}
.navbar-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 88rpx;
  padding: 0 32rpx;
}
.nav-back {
  display: flex;
  align-items: center;
  gap: 4rpx;
}
.nav-back-label {
  font-size: 32rpx;
  color: #333;
  font-weight: 500;
}
/* 订阅按钮：带文案的胶囊，一眼能认出是「订阅场馆」 */
.nav-sub-btn {
  display: flex;
  align-items: center;
  gap: 8rpx;
  height: 60rpx;
  padding: 0 24rpx;
  border-radius: 30rpx;
  background: linear-gradient(135deg, #fea500 0%, #ff8a3d 100%);
  box-shadow: 0 6rpx 16rpx rgba(254, 165, 0, 0.28);
  flex-shrink: 0;
}
.nav-sub-btn--hover {
  opacity: 0.85;
}
.nav-sub-btn--on {
  background: rgba(254, 165, 0, 0.12);
  border: 1rpx solid rgba(254, 165, 0, 0.45);
  box-shadow: none;
}
.nav-sub-icon {
  width: 28rpx;
  height: 28rpx;
}
.nav-sub-text {
  font-size: 24rpx;
  font-weight: 600;
  color: #fff;
}
.nav-sub-btn--on .nav-sub-text {
  color: #8A5600;
}

/* ── 主卡片：品牌渐变底 + 白色标题卡 ── */
.card {
  margin: 24rpx 24rpx 0;
  background: linear-gradient(135deg, #ffe39a 0%, #fca8b3 100%);
  border-radius: 24rpx;
  padding: 24rpx 0 28rpx;
  box-shadow: 0 6rpx 20rpx rgba(0, 0, 0, 0.08);
}
.card-body {
  padding: 0 28rpx;
}
.title-card {
  background: #fff;
  border-radius: 20rpx;
  padding: 24rpx 28rpx;
  margin-bottom: 24rpx;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.04);
}
.place-title {
  font-size: 34rpx;
  font-weight: bold;
  color: #1a1a1a;
  display: block;
  line-height: 1.4;
}

/* Chips */
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-bottom: 10rpx;
}
.chip {
  background: #fff;
  border-radius: 32rpx;
  padding: 6rpx 22rpx;
  font-size: 24rpx;
  color: #333;
}
/* 第一个 chip 是场馆类型，用主色描一下，跟普通信息 chip 区分开 */
.chip--accent {
  background: rgba(255, 255, 255, 0.95);
  color: #8A5600;
  font-weight: 600;
}

/* ── 页面内主 CTA ── */
.cta {
  margin-top: 18rpx;
}
.cta-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10rpx;
  height: 84rpx;
  border-radius: 42rpx;
  background: #fff;
  color: #8A5600;
  font-weight: 600;
  box-shadow: 0 6rpx 16rpx rgba(0, 0, 0, 0.08);
}
.cta-btn--hover {
  opacity: 0.85;
}
.cta-btn--on {
  background: rgba(255, 255, 255, 0.72);
  border: 2rpx solid rgba(255, 255, 255, 0.9);
  box-shadow: none;
}
.cta-icon {
  width: 32rpx;
  height: 32rpx;
}
.cta-btn-text {
  font-size: 28rpx;
  font-weight: 600;
  color: #8A5600;
}
.cta-hint {
  display: block;
  margin-top: 12rpx;
  text-align: center;
  font-size: 22rpx;
  color: rgba(90, 60, 30, 0.75);
}

/* ── 信息区（地址 / 别名），与活动详情页的 detail-row 同款 ── */
.info-card {
  background: #fff;
  margin: 20rpx 24rpx 0;
  border-radius: 24rpx;
  padding: 24rpx 24rpx 6rpx;
  box-shadow: 0 6rpx 20rpx rgba(0, 0, 0, 0.06);
}
.detail-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-bottom: 18rpx;
  background: rgba(255, 165, 0, 0.06);
  border-radius: 32rpx;
  padding: 14rpx 20rpx;
}
.detail-row:last-of-type {
  margin-bottom: 0;
}
.detail-icon-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.dico-img {
  width: 32rpx;
  height: 32rpx;
  flex-shrink: 0;
}
.dtxt {
  font-size: 26rpx;
  color: #333;
  flex: 1;
  line-height: 1.4;
  min-width: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-all;
}
.detail-row-hover {
  background: rgba(254, 165, 0, 0.14);
}
.dtxt-arrow {
  font-size: 32rpx;
  color: #bbb;
  flex-shrink: 0;
  line-height: 1;
}

/* ── Section 标题（与艺人详情页同款） ── */
.section-pad {
  margin: 0 30rpx;
}
.section-title-row {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  margin-bottom: 20rpx;
  padding: 20rpx 0;
}
.section-title {
  font-size: 32rpx;
  font-weight: 700;
  color: rgba(35, 34, 39, 1);
  position: relative;
  padding-bottom: 4rpx;
}
.section-title--highlight::after {
  content: "";
  position: absolute;
  left: -6rpx;
  bottom: 2rpx;
  width: calc(100% + 12rpx);
  height: 10rpx;
  background: rgba(254, 210, 0, 0.7);
  border-radius: 4rpx;
  z-index: -1;
}
.section-all {
  font-size: 26rpx;
  color: rgba(35, 34, 39, 1);
}

/* 加载更多 */
.load-more {
  margin: 24rpx 0 0;
  text-align: center;
  padding: 20rpx 0;
}
.load-more--hover {
  opacity: 0.7;
}
.load-more-text {
  font-size: 26rpx;
  color: rgba(35, 34, 39, 1);
}

.empty {
  text-align: center;
  color: #aaa;
  padding: 60rpx 0;
  font-size: 26rpx;
}
</style>
