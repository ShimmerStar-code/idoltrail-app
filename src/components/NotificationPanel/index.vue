<!-- 通知面板弹框组件
  用法：在首页右上角铃铛点击后展示
  - 显示通知列表（最近 20 条）
  - badge 未读数
  - 全部已读
  - 点击跳转对应活动
-->
<template>
  <!-- 遮罩 -->
  <view v-if="visible" class="overlay" @click.self="emit('close')" />

  <!-- 面板 -->
  <view v-if="visible" class="panel" :style="{ top: panelTop + 'px' }">
    <!-- 头部 -->
    <view class="panel-header">
      <text class="panel-title">消息通知</text>
      <view class="header-actions">
        <text v-if="notifStore.hasUnread" class="action-btn" @click="onMarkAllRead">全部已读</text>
        <text v-if="notifStore.hasReadNotifications" class="action-btn secondary" @click="onClearRead">清空已读</text>
        <uni-icons type="closeempty" size="20" color="#999" @click="emit('close')" />
      </view>
    </view>

    <!-- 列表 -->
    <scroll-view scroll-y class="panel-scroll">
      <view v-if="notifStore.loading && notifStore.list.length === 0" class="empty-wrap">
        <text class="empty-text">加载中…</text>
      </view>
      <view v-else-if="notifStore.list.length === 0" class="empty-wrap">
        <text class="empty-icon">🔔</text>
        <text class="empty-text">暂无消息</text>
      </view>
      <view v-else class="notif-list">
        <view
          v-for="item in notifStore.list"
          :key="item.id"
          class="notif-item"
          :class="{ 'notif-item--unread': !item.isRead }"
          @click="onItemClick(item)"
        >
          <view class="item-left">
            <view class="type-dot" :style="{ background: typeColor(item.type) }" />
          </view>
          <view class="item-body">
            <view class="item-top-row">
              <text class="item-title">{{ item.title }}</text>
              <view class="type-tag" :style="{ background: typeColor(item.type) }">
                <text class="type-tag-text">{{ typeLabel(item.type) }}</text>
              </view>
            </view>
            <text class="item-content">{{ item.content }}</text>
            <text class="item-time">{{ formatTime(item.createdAt) }}</text>
          </view>
        </view>
      </view>

      <!-- 查看全部 -->
      <view v-if="notifStore.total > 0" class="view-all" @click="goToMessages">
        <text class="view-all-text">查看全部消息 →</text>
      </view>
    </scroll-view>
  </view>
</template>

<script setup lang="ts">
import { watch } from 'vue'
import { useNotificationStore } from '@/stores/notification'
import { notificationTypeLabel, notificationTypeColor } from '@/api/notification'
import type { Notification, NotificationType } from '@/types/notification'

const props = defineProps<{
  visible: boolean
  panelTop?: number
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const notifStore = useNotificationStore()

// 每次打开时刷新列表
watch(() => props.visible, async (val) => {
  if (val) {
    await notifStore.fetchList(1, 20)
  }
})

async function onItemClick(item: Notification) {
  await notifStore.markRead(item.id)
  if (item.relatedId) {
    emit('close')
    // relatedType 统一关联到活动，均跳转到活动详情页
    uni.navigateTo({ url: `/pages/event/detail?id=${item.relatedId}` })
  }
}

async function onMarkAllRead() {
  await notifStore.markAllRead()
}

async function onClearRead() {
  await notifStore.clearRead()
}

function goToMessages() {
  emit('close')
  uni.navigateTo({ url: '/pages/profile/messages' })
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
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return '刚刚'
  if (diffMin < 60) return `${diffMin}分钟前`
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return `${diffHour}小时前`
  const diffDay = Math.floor(diffHour / 24)
  if (diffDay < 7) return `${diffDay}天前`
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getMonth()+1}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
</script>

<style scoped>
.overlay {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  z-index: 998;
}
.panel {
  position: fixed; right: 20rpx;
  width: 580rpx; max-height: 70vh;
  background: #fff;
  border-radius: 24rpx;
  box-shadow: 0 20rpx 60rpx rgba(0,0,0,0.15);
  z-index: 999;
  display: flex; flex-direction: column;
  overflow: hidden;
}
.panel-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 24rpx 28rpx 20rpx;
  border-bottom: 1rpx solid rgba(236,236,236,1);
  flex-shrink: 0;
}
.panel-title { font-size: 28rpx; font-weight: 600; color: rgba(51,51,51,1); }
.header-actions { display: flex; align-items: center; gap: 16rpx; }
.action-btn { font-size: 22rpx; color: rgba(100,100,100,1); }
.action-btn.secondary { color: rgba(255,120,120,1); }
.panel-scroll {
  /* 小程序端 scroll-view 必须有明确高度才能滚动，flex:1 不可靠 */
  height: calc(70vh - 110rpx);
}
.empty-wrap {
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; padding: 60rpx 0;
  gap: 16rpx;
}
.empty-icon { font-size: 60rpx; }
.empty-text { font-size: 24rpx; color: rgba(153,153,153,1); }
.notif-list { padding: 0; }
.notif-item {
  display: flex; align-items: flex-start; gap: 16rpx;
  padding: 20rpx 28rpx;
  border-bottom: 1rpx solid rgba(245,245,245,1);
  transition: background 0.15s;
}
.notif-item:active { background: rgba(245,245,245,1); }
.notif-item--unread { background: rgba(248,255,248,1); }
.item-left { padding-top: 12rpx; flex-shrink: 0; }
.type-dot { width: 12rpx; height: 12rpx; border-radius: 50%; }
.item-body { flex: 1; min-width: 0; }
.item-top-row { display: flex; align-items: center; justify-content: space-between; gap: 10rpx; margin-bottom: 6rpx; }
.item-title { flex: 1; font-size: 24rpx; font-weight: 600; color: rgba(51,51,51,1); line-height: 1.4; }
.type-tag {
  border-radius: 8rpx;
  padding: 0 10rpx;
  height: 34rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.type-tag-text { font-size: 16rpx; font-weight: 600; color: #fff; line-height: 1; }
.item-content { font-size: 22rpx; color: rgba(100,100,100,1); line-height: 1.5; display: block; margin-bottom: 6rpx; }
.item-time { font-size: 20rpx; color: rgba(180,180,180,1); }
.view-all {
  display: flex; justify-content: center; padding: 20rpx;
  border-top: 1rpx solid rgba(245,245,245,1);
}
.view-all-text { font-size: 24rpx; color: rgba(100,100,100,1); }
</style>
