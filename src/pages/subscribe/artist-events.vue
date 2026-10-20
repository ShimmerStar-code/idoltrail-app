<!--
  订阅 → 偶像 → "已关联的活动" 查看所有
  ─────────────────────────────────────────────
  全量分页展示"当前用户已订阅艺人"所关联的活动。
  后端: GET /api/v1/subscriptions/artists/related-events?page=&page_size=
-->
<template>
  <PageLayout>
  <view class="page">
    <view class="header" :style="{ paddingTop: statusBarHeight + 'px' }">
      <view class="header-row">
        <view class="back" @click="goBack">
          <uni-icons type="left" size="large" color="#333" />
        </view>
        <text class="title">已关联的活动</text>
        <view class="back" />
      </view>
    </view>

    <scroll-view
      scroll-y
      class="scroll-body"
      :style="{ paddingBottom: '40rpx' }"
      @scroll="onVirtualScroll"
      @scrolltolower="onLoadMore"
    >
      <LoginPrompt
        v-if="!userStore.isLoggedIn"
        title="登录后查看你的订阅"
        sub="这里会展示你已订阅偶像的相关活动"
        reason="subscribe_artist_events"
      />
      <view v-else-if="list.length === 0 && !loading" class="empty">暂无活动</view>
      <!-- 初次加载占位:list 为空且在加载中 → 4 张骨架卡;已有数据时 loading=true 走底部"加载中..."文本 -->
      <template v-if="loading && list.length === 0">
        <EventSubCardSkeleton v-for="i in 4" :key="`sk-${i}`" />
      </template>
      <!--
        窗口化渲染：只渲染视口附近的卡片，上下用占位块撑出总高度。
        EventSubCard 的根节点没有 class，故外面套一层 .vl-item 作为测量锚点。
      -->
      <template v-else>
        <view :style="{ height: topSpacer + 'px' }" />
        <view
          v-for="row in visibleItems"
          :key="row.key"
          class="vl-item"
        >
          <EventSubCard :vo="row.item" @bookmark="onBookmarkEvent" />
        </view>
        <view :style="{ height: bottomSpacer + 'px' }" />
      </template>
      <view v-if="loading && list.length > 0" class="loading">加载中...</view>
      <view v-if="!hasMore && list.length > 0" class="loading">没有更多了</view>
    </scroll-view>
  </view>
  </PageLayout>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import PageLayout from '@/components/PageLayout/index.vue'
import LoginPrompt from '@/components/LoginPrompt/index.vue'
import EventSubCard from '@/components/Subscribe/EventSubCard.vue'
import EventSubCardSkeleton from '@/components/Subscribe/EventSubCardSkeleton.vue'
import { useSubscribeStore } from '@/stores/subscribe'
import { subscriptionApi } from '@/api/subscription'
import { useUserStore } from '@/stores/user'
import type { EventCardVO } from '@/types/subscription'
import { useVirtualList } from '@/composables/useVirtualList'
const store = useSubscribeStore()
const userStore = useUserStore()
const statusBarHeight = ref(20)
const page = ref(1)
const pageSize = 20
const total = ref(0)
const loading = ref(false)
const hasMore = computed(() => list.value.length < total.value)
const list = ref<EventCardVO[]>([])

// 窗口化渲染：EventSubCard 展开后有 20+ 节点，分页 concat 到上百条时
// DOM 节点会到 2000+，低端机滚动掉帧。这里只渲染视口附近的卡片。
const {
  visibleItems,
  topSpacer,
  bottomSpacer,
  onScroll: onVirtualScroll,
} = useVirtualList<EventCardVO>({
  source: list,
  getKey: (vo) => vo.event.id,
  itemSelector: '.vl-item',
  estimatedHeight: 150,
  overscan: 3,
})

onMounted(async () => {
  try {
    const info = uni.getSystemInfoSync()
    statusBarHeight.value = info.statusBarHeight || 20
  } catch (e) { /* ignore */ }

  // 未登录不弹登录框：页面照常打开，列表区展示 LoginPrompt 引导，点引导才登录。
  // 这里必须 return，不能继续 loadPage —— 接口要登录态，会 401 并触发全局会话失效弹窗。
  if (!userStore.isLoggedIn) return
  await loadPage(1)
})

async function loadPage(p: number) {
  if (loading.value) return
  loading.value = true
  try {
    // 直接静态导入：stores/subscribe.ts 已静态引用同一模块，
// 动态 import 不会产生独立 chunk，构建时反而会告警混用
const r = await subscriptionApi.artistRelatedEvents(p, pageSize)
    if (p === 1) {
      list.value = r.list
    } else {
      list.value = list.value.concat(r.list)
    }
    total.value = r.total
    page.value = p
  } finally {
    loading.value = false
  }
}

function onLoadMore() {
  if (!hasMore.value || loading.value) return
  loadPage(page.value + 1)
}

function onBookmarkEvent(vo: EventCardVO) {
  userStore.requireLogin({
    dismissible: true,
    reason: 'subscribe_event',
    onSuccess: async () => {
      try {
        await store.toggleEvent(vo.event.id)
        // 退订后从本组件列表移除
        list.value = list.value.filter((x) => x.event.id !== vo.event.id)
        total.value = Math.max(0, total.value - 1)
        uni.showToast({ title: '已退订', icon: 'success' })
      } catch (e: any) {
        uni.showToast({ title: e?.message || '操作失败', icon: 'none' })
      }
    },
  })
}

function goBack() { uni.navigateBack() }
</script>

<style scoped>
/*
 * 分页失效修复：本页 .page 早前既不是 flex 容器、.scroll-body 的 flex:1 也因父级
 * 非 flex 完全无效，scroll-view 被内容撑开而没有内部滚动高度，
 * @scrolltolower 在内容不足一屏时永不触发 —— 第二页及以后的关联活动永远加载不出来。
 * 现与 city-events.vue 对齐：父级转 flex 列容器，子项用 flex:1 + height:0 锁定剩余高度。
 */
.page {
  background: #fff;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}
.header {
  background: linear-gradient(135deg, rgba(32, 226, 215, 0.4) 0%, rgba(249, 254, 165, 0.4) 100%);
  padding: 18rpx 30rpx;
}
.header-row { display: flex; align-items: center; justify-content: space-between; }
.title { font-size: 32rpx; font-weight: 600; color: rgba(51, 51, 51, 1); }
.back { width: 60rpx; height: 60rpx; display: flex; align-items: center; justify-content: center; }

/* height: 0 是关键：不给它 scroll-view 会被内容撑开，flex:1 形同虚设 */
.scroll-body { flex: 1; height: 0; padding: 24rpx 30rpx 0; }

/*
 * 窗口化测量锚点。overflow: hidden 不能省：
 * EventSubCard 根节点有 margin-bottom: 24rpx，包裹层若不建立 BFC，
 * 这个下外边距会折叠到 .vl-item 外面，而 boundingClientRect().height
 * 不含外边距 —— 每项都会少算 12px 左右，占位块随之失准，列表越滚越挤。
 */
.vl-item { overflow: hidden; }

.empty { text-align: center; color: #aaa; padding: 80rpx 0; font-size: 26rpx; }
.loading { text-align: center; color: #999; padding: 24rpx 0; font-size: 24rpx; }
</style>
