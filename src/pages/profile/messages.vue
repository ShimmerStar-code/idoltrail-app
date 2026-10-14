<template>
  <PageLayout>
  <view class="page">
    <view class="nav" :style="{ paddingTop: navPaddingTop + 'px' }">
      <uni-icons type="left" size="large" color="#333" @click="goBack" />
      <text class="nav-title">消息管理</text>
      <text v-if="notifStore.list.length > 0" class="mark-all" @click="notifStore.markAllRead()">全部已读</text>
    </view>

    <scroll-view
      scroll-y
      class="scroll-body"
      :style="{ height: scrollHeight + 'px' }"
      @scroll="onVirtualScroll"
      @scrolltolower="loadMore"
    >
      <!-- 加载中 -->
      <view v-if="notifStore.loading && notifStore.list.length === 0" class="empty-wrap">
        <text class="empty-text">加载中…</text>
      </view>

      <!-- 空状态 -->
      <view v-else-if="!notifStore.loading && notifStore.list.length === 0" class="empty-wrap">
        <text class="empty-text">暂无消息</text>
      </view>

      <!-- 列表（窗口化：只渲染视口附近的卡片，上下用占位块撑出总高度） -->
      <view v-else class="list">
        <view :style="{ height: topSpacer + 'px' }" />
        <view
          v-for="row in visibleItems"
          :key="row.key"
          class="vl-item"
        >
          <view
            class="msg-card"
            :class="{ 'msg-card--unread': !row.item.isRead }"
            @click="handleItemClick(row.item)"
          >
            <view class="msg-top">
              <text class="msg-content">{{ row.item.title }}</text>
              <view class="msg-tag" :style="{ background: typeColor(row.item.type) }">
                <text class="msg-tag-text">{{ typeLabel(row.item.type) }}</text>
              </view>
            </view>
            <view class="msg-bottom">
              <text class="msg-detail">{{ row.item.content }}</text>
              <text class="msg-time">{{ formatTime(row.item.createdAt) }}</text>
            </view>
            <!-- 未读红点 -->
            <view v-if="!row.item.isRead" class="unread-dot" />
          </view>
        </view>
        <view :style="{ height: bottomSpacer + 'px' }" />
      </view>

      <!-- 底部加载更多 -->
      <view v-if="notifStore.list.length > 0 && notifStore.list.length < notifStore.total" class="load-more">
        <text class="load-more-text" @click="loadMore">加载更多</text>
      </view>
    </scroll-view>
  </view>
  </PageLayout>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick, toRef } from 'vue'

// 模板返回按钮：不能在模板里写 uni.navigateBack()，Vue 会把它解析成组件实例属性
function goBack() { uni.navigateBack(); }
import { onLoad } from '@dcloudio/uni-app'
import { useUserStore } from '@/stores/user'
import { useNotificationStore } from '@/stores/notification'
import { notificationTypeLabel, notificationTypeColor } from '@/api/notification'
import type { Notification, NotificationType } from '@/types/notification'
import { getNavBarMetrics } from '@/utils/system'
import PageLayout from '@/components/PageLayout/index.vue'
import { useVirtualList } from '@/composables/useVirtualList'
const userStore = useUserStore()
const notifStore = useNotificationStore()
const navPaddingTop = ref(60) // 胶囊底部 + 间距，onMounted 后精确计算
const scrollHeight = ref(0)   // scroll-view 精确高度，微信小程序必须显式给像素值
const currentPage = ref(1)
const PAGE_SIZE = 20

// 窗口化渲染：消息分页 concat 后无上限，DOM 节点线性增长
// 注意 store 实例上的 list 是解包后的数组，虚拟列表要的是 Ref，用 toRef 透一层
const {
  visibleItems,
  topSpacer,
  bottomSpacer,
  onScroll: onVirtualScroll,
  setViewportHeight,
} = useVirtualList<Notification>({
  source: toRef(notifStore, 'list'),
  getKey: (msg) => msg.id,
  itemSelector: '.vl-item',
  estimatedHeight: 110,
  overscan: 4,
})

onLoad(async () => {
  if (!userStore.isLoggedIn) {
    uni.showToast({ title: '请先登录', icon: 'none' })
    setTimeout(() => uni.navigateBack(), 600)
    return
  }
  currentPage.value = 1
  await notifStore.fetchList(1, PAGE_SIZE)
})

onMounted(() => {
  const metrics = getNavBarMetrics();
  navPaddingTop.value = metrics.statusBarHeight + metrics.navBarHeight;

  // scroll-view 必须有明确像素高度才能滚动，量一次窗口高度兜底
  const windowHeight = uni.getWindowInfo?.()?.windowHeight || 0;

  // 自定义导航栏渲染后量真实高度，供下方内容避让
  nextTick(() => {
    uni.createSelectorQuery()
      .select('.nav')
      .boundingClientRect((rect: any) => {
        if (rect) {
          scrollHeight.value = windowHeight - rect.height
        } else {
          // 兜底：windowHeight 减去估算的 nav 高度
          scrollHeight.value = windowHeight - (navPaddingTop.value + 60)
        }
        // 本页已经算出 scroll-view 的精确高度，直接喂给窗口化，省得再猜一次视口
        setViewportHeight(scrollHeight.value)
      })
      .exec()
  })
})

async function loadMore() {
  if (notifStore.loading) return
  if (notifStore.list.length >= notifStore.total) return
  currentPage.value++
  await notifStore.fetchList(currentPage.value, PAGE_SIZE)
}

async function handleItemClick(msg: Notification) {
  await notifStore.markRead(msg.id)
  if (msg.relatedType === 'event' && msg.relatedId) {
    uni.navigateTo({ url: `/pages/event/detail?id=${msg.relatedId}` })
  }
}

function typeLabel(type: NotificationType) {
  return notificationTypeLabel[type] ?? '通知'
}

function typeColor(type: NotificationType) {
  return notificationTypeColor[type] ?? 'rgba(151,217,216,1)'
}

function formatTime(iso: string) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
</script>

<style scoped>
.page { background: #fff; height: 100vh; overflow: hidden; display: flex; flex-direction: column; }
.nav {
  display: flex; align-items: center; gap: 20rpx;
  padding: 18rpx 30rpx 20rpx;
  border-bottom: 1rpx solid rgba(236,236,236,1);
}
.nav-title { font-size: 34rpx; font-weight: 600; color: rgba(51,51,51,1); flex: 1; }
.mark-all { font-size: 24rpx; color: rgba(100,100,100,1); }
.scroll-body { flex: 1; overflow: hidden; }
.empty-wrap { display: flex; justify-content: center; padding: 120rpx 0; }
.empty-text { font-size: 26rpx; color: rgba(153,153,153,1); }
.list { padding: 30rpx; display: flex; flex-direction: column; }
/*
 * 窗口化测量锚点。
 * 间距从 .list 的 gap: 20rpx 挪到这里用 padding-bottom 实现：
 * flex 的 gap 不属于任何元素的盒子模型，boundingClientRect().height 量不到，
 * 留在 gap 上就会每项少算 20rpx，占位块失准、列表越滚越挤。
 * padding 计入 border-box，测量才能拿到真实占位。
 */
.vl-item { overflow: hidden; padding-bottom: 20rpx; }
.msg-card {
  background: #fff; border-radius: 30rpx;
  border: 1rpx solid rgba(236,236,236,1);
  box-shadow: 0 10rpx 30rpx rgba(0,0,0,0.05);
  padding: 24rpx 30rpx;
  position: relative; overflow: hidden;
}

.unread-dot {
  position: absolute; top: 20rpx; right: 20rpx;
  width: 14rpx; height: 14rpx; border-radius: 50%;
  background: rgba(243,108,108,1);
}
.msg-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 20rpx; margin-bottom: 16rpx; }
.msg-content { flex: 1; font-size: 26rpx; font-weight: 600; color: rgba(51,51,51,1); line-height: 1.6; }
.msg-tag { border-radius: 10rpx; padding: 6rpx 14rpx; flex-shrink: 0; }
.msg-tag-text { font-size: 18rpx; font-weight: 600; color: #fff; }
.msg-bottom { display: flex; justify-content: space-between; align-items: center; gap: 20rpx; }
.msg-detail { flex: 1; font-size: 24rpx; color: rgba(100,100,100,1); line-height: 1.5; }
.msg-time { font-size: 22rpx; color: rgba(153,153,153,1); flex-shrink: 0; }
.load-more { display: flex; justify-content: center; padding: 30rpx 0; }
.load-more-text { font-size: 24rpx; color: rgba(100,100,100,1); }
</style>
