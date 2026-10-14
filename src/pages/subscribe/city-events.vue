<!--
  city-events  城市 tab "已关联的活动" 分页页
  ─────────────────────────────────────────────
  路由 /pages/subscribe/city-events?id=<city_id>&name=<city_name>
  后端: GET /api/v1/subscriptions/cities/:id/related-events?status=&page=&page_size=&type=&tag=
-->
<template>
  <PageLayout>
    <view class="page">
      <view class="header" :style="{ paddingTop: statusBarHeight + 'px' }">
        <view class="header-row">
          <view class="back" @click="goBack">
            <uni-icons type="left" size="large" color="#333" />
          </view>
          <text class="title">{{ cityName }} 的活动</text>
          <view class="back" />
        </view>
        <!-- 进行中 / 已失效 segment -->
        <view class="segment">
          <view
            class="seg-btn"
            :class="{ 'seg-btn--active': status === 'ongoing' }"
            @click="changeStatus('ongoing')"
          >
            <text class="seg-text">进行中</text>
          </view>
          <view
            class="seg-btn"
            :class="{ 'seg-btn--active': status === 'expired' }"
            @click="changeStatus('expired')"
          >
            <text class="seg-text">已失效</text>
          </view>
        </view>
      </view>

      <scroll-view
        scroll-y
        class="scroll-body"
        @scroll="onVirtualScroll"
        @scrolltolower="onLoadMore"
      >
        <view v-if="list.length === 0 && !loading" class="empty">暂无活动</view>
        <template v-if="loading && list.length === 0">
          <EventCardSkeleton v-for="i in 4" :key="`sk-${i}`" />
        </template>
        <!-- 窗口化：只渲染视口附近的卡片（EventCard 根节点无 class，套一层测量锚点） -->
        <template v-else>
          <view :style="{ height: topSpacer + 'px' }" />
          <view v-for="row in visibleItems" :key="row.key" class="vl-item">
            <EventCard
              :event="voToEvent(row.item)"
              :entryGenreCode="row.item.event.genre"
              @select="onTapEvent"
            />
          </view>
          <view :style="{ height: bottomSpacer + 'px' }" />
        </template>
        <view v-if="loading && list.length > 0" class="loading-tip">加载中…</view>
        <view v-if="!hasMore && list.length > 0 && !loading" class="loading-tip"
          >没有更多了</view
        >
      </scroll-view>
    </view>
  </PageLayout>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { onLoad } from "@dcloudio/uni-app";
import PageLayout from "@/components/PageLayout/index.vue";
import EventCard from "@/components/EventCard/index.vue";
import EventCardSkeleton from "@/components/EventCard/Skeleton.vue";
import { useUserStore } from "@/stores/user";
import { subscriptionApi } from "@/api/subscription";
import type { EventCardVO } from "@/types/subscription";
import type { Event } from "@/types/event";
import { useVirtualList } from "@/composables/useVirtualList";
const userStore = useUserStore();
const statusBarHeight = ref(20);
const cityId = ref<string>("");
const cityName = ref<string>("城市");
// 透传 type/tag 二次过滤(从父页 city 卡带过来)
const filterType = ref<string>("");
const filterTag = ref<string>("");
const status = ref<"ongoing" | "expired">("ongoing");
const page = ref(1);
const pageSize = 20;
const total = ref(0);
const loading = ref(false);
const list = ref<EventCardVO[]>([]);
const hasMore = computed(() => list.value.length < total.value);

// 窗口化渲染：分页 concat 到上百条时 DOM 节点达 2000+，低端机滚动掉帧
const {
  visibleItems,
  topSpacer,
  bottomSpacer,
  onScroll: onVirtualScroll,
  reset: resetVirtual,
} = useVirtualList<EventCardVO>({
  source: list,
  getKey: (vo) => vo.event.id,
  itemSelector: '.vl-item',
  estimatedHeight: 170,
  overscan: 3,
});

// onLoad 在 uni-app 框架内由路由同步注入 options,
// 比起 onMounted 里 getCurrentPages() 更稳(避免 tabBar 复用页面时 options 残留)
// 参数类型由 onLoad 自行推断为 AnyObject，这里不要显式标注成
// Record<string, string | undefined>，那与 onLoad 期望的签名不兼容。
onLoad((options) => {
  cityId.value = options?.id ?? "";
  cityName.value = options?.name ?? "城市";
  filterType.value = options?.type ?? "";
  filterTag.value = options?.tag ?? "";
});

onMounted(async () => {
  try {
    const info = uni.getSystemInfoSync();
    statusBarHeight.value = info.statusBarHeight || 20;
  } catch (e) {
    /* ignore */
  }

  if (!userStore.isLoggedIn) {
    userStore.requireLogin({
      dismissible: true,
      reason: "subscribe_city_events",
    });
    return;
  }
  await loadPage(1);
});

async function loadPage(p: number) {
  if (loading.value) return;
  loading.value = true;
  try {
    const extra: { type?: string; tag?: string } = {};
    if (filterType.value) extra.type = filterType.value;
    if (filterTag.value) extra.tag = filterTag.value;
    const r = await subscriptionApi.cityRelatedEvents(
      cityId.value,
      status.value,
      p,
      pageSize,
      Object.keys(extra).length ? extra : undefined
    );
    if (p === 1) list.value = r.list;
    else list.value = list.value.concat(r.list);
    total.value = r.total;
    page.value = p;
  } catch (e: any) {
    uni.showToast({ title: e?.message || "加载失败", icon: "none" });
  } finally {
    loading.value = false;
  }
}

function changeStatus(s: "ongoing" | "expired") {
  if (status.value === s) return;
  status.value = s;
  // 整列内容都换了：旧的高度缓存与滚动位置一并作废
  resetVirtual();
  loadPage(1);
}

function onLoadMore() {
  if (!hasMore.value || loading.value) return;
  loadPage(page.value + 1);
}

function onTapEvent(id: number) {
  uni.navigateTo({ url: `/pages/event/detail?id=${id}` });
}

/** EventBrief → Event 适配，供 EventCard 消费 */
function voToEvent(vo: EventCardVO): Event {
  return ({
    id: vo.event.id,
    title: vo.event.title,
    // 与 subscribe/index.vue 保持一致：直接用后端 events.type。
    // 早前这里按 vo.theme_color 反推 type，会把"蓝色 Concert"渲染成 Music_Festival，
    // 同一批活动在订阅页和城市活动页颜色对不上。
    type: vo.event.type || "",
    status: vo.event.status || "", // 透传后端 status，让 EventCard 按日期派生“已结束/已取消”
    poster_url: vo.event.poster_url,
    start_date: vo.event.start_date,
    end_date: vo.event.end_date,
    sessions: vo.event.city
      ? ([{ city: vo.event.city, event_date: vo.event.start_date }] as any)
      : [],
    artists: vo.event.artist
      ? ([
          {
            artist_name: vo.event.artist.name,
            avatar_url: vo.event.artist.avatar_url,
          },
        ] as any)
      : [],
    genres: vo.event.genre ? ([{ genre_code: vo.event.genre }] as any) : [],
  } as unknown) as Event;
}

function goBack() {
  uni.navigateBack();
}
</script>

<style scoped>
.page {
  background: #fff;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}
.header {
  padding: 18rpx 30rpx 24rpx;
}
.header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.title {
  font-size: 32rpx;
  font-weight: 600;
  color: rgba(51, 51, 51, 1);
}
.back {
  width: 60rpx;
  height: 60rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.segment {
  display: flex;
  gap: 16rpx;
  margin-top: 18rpx;
}
.seg-btn {
  flex: 1;
  text-align: center;
  padding: 14rpx 0;
  border-radius: 30rpx;
  background: rgba(255, 255, 255, 0.7);
  border: 1rpx solid rgba(236, 236, 236, 1);
}
.seg-btn--active {
  background: rgba(254, 165, 0, 1);
  border-color: rgba(254, 165, 0, 1);
}
.seg-text {
  font-size: 26rpx;
  font-weight: 600;
  color: rgba(51, 51, 51, 1);
}
.seg-btn--active .seg-text {
  color: #fff;
}

.scroll-body {
  flex: 1;
  padding: 24rpx 0;
  width: 95%;
  margin: 0 auto;
  height: 0;
}
/* EventCard 在订阅页内：消除组件自带的水平 margin，由 scroll-body 的 95% 宽度统一控制间距 */
.scroll-body :deep(.event-card--list) {
  margin-left: 0;
  margin-right: 0;
}
/* 窗口化测量锚点。overflow: hidden 不能省：让包裹层建立 BFC，
   EventCard 的下外边距才不会折叠出去 —— boundingClientRect().height 不含外边距，
   折叠后每项都会少算间距，占位块随之失准。 */
.vl-item {
  overflow: hidden;
}
.empty {
  text-align: center;
  color: #aaa;
  padding: 80rpx 0;
  font-size: 26rpx;
}
.loading-tip {
  text-align: center;
  color: #999;
  padding: 24rpx 0;
  font-size: 24rpx;
}
</style>
