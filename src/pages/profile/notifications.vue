<template>
  <PageLayout>
  <view class="page">
    <view class="nav" :style="{ paddingTop: statusBarHeight + 'px' }">
      <uni-icons type="left" size="large" color="#333" @click="goBack" />
      <text class="nav-title">通知管理</text>
    </view>

    <view class="list">
      <!-- 系统推送总开关 -->
      <view class="item">
        <view class="item-left">
          <view class="item-icon-row">
            <image class="channel-icon" src="/static/icons/notice.svg" mode="aspectFit" />
            <text class="item-label">系统推送通知</text>
          </view>
          <text class="item-sub">活动变更时通过系统通知栏提醒您</text>
        </view>
        <view
          class="toggle"
          :class="{ 'toggle--on': pushEnabled }"
          @click="togglePushEnabled"
        >
          <view class="toggle-pill">
            <text class="toggle-text">{{ pushEnabled ? '开' : '关' }}</text>
          </view>
        </view>
      </view>

      <!-- 按类型细分开关 -->
      <view v-if="pushEnabled" class="group">
        <text class="group-title">接收以下类型的提醒</text>
        <view v-for="t in TYPE_LIST" :key="t.value" class="item item--sub">
          <view class="item-left">
            <view class="type-dot" :style="{ background: typeColor(t.value) }" />
            <text class="item-label">{{ typeLabel(t.value) }}</text>
          </view>
          <view
            class="toggle toggle--sm"
            :class="{ 'toggle--on': pushTypes[t.value] }"
            @click="togglePushType(t.value)"
          >
            <view class="toggle-pill">
              <text class="toggle-text">{{ pushTypes[t.value] ? '开' : '关' }}</text>
            </view>
          </view>
        </view>
      </view>

      <view class="hint">
        <text class="hint-text">
          开启后，当您订阅的活动发生场地、时间、阵容变更或取消时，App 会通过系统通知提醒您。
          iOS 需在「设置 - 通知」中允许 idoltrail 发送通知；Android 13 需在首次弹窗时允许通知权限。
        </text>
      </view>
    </view>
  </view>
  </PageLayout>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { useUserStore } from '@/stores/user'
import { useNotificationStore } from '@/stores/notification'
import { notificationTypeColor, notificationTypeLabel } from '@/api/notification'
import { syncPushToken } from '@/composables/usePush'
import type { NotificationType } from '@/types/notification'
import PageLayout from '@/components/PageLayout/index.vue'

// 模板返回按钮：不能在模板里写 uni.navigateBack()，Vue 会把它解析成组件实例属性
function goBack() { uni.navigateBack(); }

const TYPE_LIST: Array<{ value: NotificationType }> = [
  { value: 'venue_change' },
  { value: 'time_change' },
  { value: 'artist_change' },
  { value: 'event_cancel' },
  { value: 'new_event' },
  { value: 'info_change' },
]

const userStore = useUserStore()
const notifStore = useNotificationStore()
const statusBarHeight = ref(20)
const pushEnabled = ref(true)
const pushTypes = ref<Record<NotificationType, boolean>>({
  venue_change: true,
  time_change: true,
  artist_change: true,
  event_cancel: true,
  new_event: true,
  info_change: true,
})
/** 防并发：上一次切换还未落库时忽略后续点击 */
const saving = ref(false)

onLoad(async () => {
  if (!userStore.isLoggedIn) {
    uni.showToast({ title: '请先登录', icon: 'none' })
    setTimeout(() => uni.navigateBack(), 600)
    return
  }
  await notifStore.fetchSettings()
  pushEnabled.value = notifStore.settings.pushEnabled
  pushTypes.value = { ...notifStore.settings.pushTypes }
})

onMounted(() => {
  statusBarHeight.value = uni.getSystemInfoSync().statusBarHeight || 20
})

/** 开启系统推送前先确保本机拿到通知权限 + 完成 cid 上报 */
async function ensurePushReady(): Promise<boolean> {
  const granted = await notifStore.requestSystemNotifyPermission()
  if (!granted) {
    uni.showToast({ title: '未授予通知权限，将无法收到提醒', icon: 'none', duration: 2500 })
    return false
  }
  await syncPushToken()
  return true
}

async function togglePushEnabled() {
  if (saving.value) return
  const next = !pushEnabled.value
  saving.value = true
  try {
    if (next) {
      // 权限拿不到就不落库，避免出现"显示已开启但收不到"的假状态
      const ready = await ensurePushReady()
      if (!ready) return
    }
    await notifStore.updatePushEnabled(next)
    pushEnabled.value = next
  } catch (e) {
    uni.showToast({ title: '操作失败，请重试', icon: 'none' })
  } finally {
    saving.value = false
  }
}

async function togglePushType(type: NotificationType) {
  if (saving.value) return
  const next = !pushTypes.value[type]
  pushTypes.value[type] = next
  saving.value = true
  try {
    await notifStore.updatePushType(type, next)
  } catch {
    pushTypes.value[type] = !next
    uni.showToast({ title: '操作失败，请重试', icon: 'none' })
  } finally {
    saving.value = false
  }
}

function typeLabel(type: NotificationType) {
  return notificationTypeLabel[type] ?? '通知'
}

function typeColor(type: NotificationType) {
  return notificationTypeColor[type] ?? 'rgba(151,217,216,1)'
}
</script>

<style scoped>
.page { background: #fff; min-height: 100vh; padding-bottom: calc(40rpx + env(safe-area-inset-bottom)); }
.nav {
  display: flex; align-items: center; gap: 20rpx;
  padding: 18rpx 30rpx 20rpx;
  border-bottom: 1rpx solid rgba(236,236,236,1);
}
.nav-title { font-size: 34rpx; font-weight: 600; color: rgba(51,51,51,1); }
.list { padding: 30rpx; display: flex; flex-direction: column; gap: 20rpx; }
.item {
  background: #fff; border-radius: 30rpx;
  border: 1rpx solid rgba(236,236,236,1);
  box-shadow: 0 10rpx 30rpx rgba(0,0,0,0.05);
  padding: 20rpx 30rpx;
  display: flex; align-items: center; justify-content: space-between;
}
.item--sub { padding: 16rpx 24rpx; box-shadow: none; border-radius: 20rpx; }
.item-left { display: flex; flex-direction: column; gap: 8rpx; }
.item-icon-row { display: flex; align-items: center; gap: 12rpx; }
.channel-icon { width: 36rpx; height: 36rpx; }
.type-dot { width: 16rpx; height: 16rpx; border-radius: 50%; }
.item-label { font-size: 26rpx; font-weight: 600; color: rgba(51,51,51,1); }
.item-sub { font-size: 22rpx; color: rgba(153,153,153,1); }
.group { display: flex; flex-direction: column; gap: 12rpx; }
.group-title { font-size: 24rpx; color: rgba(153,153,153,1); padding-left: 8rpx; }
.toggle {
  width: 120rpx; height: 60rpx; border-radius: 20rpx;
  background: rgba(248,248,248,1);
  box-shadow: inset 0 2rpx 8rpx rgba(0,0,0,0.05);
  display: flex; align-items: center;
  justify-content: flex-start; padding: 6rpx;
  transition: all 0.2s; flex-shrink: 0;
}
.toggle--sm { width: 100rpx; height: 52rpx; border-radius: 18rpx; }
.toggle--on { justify-content: flex-end; }
.toggle-pill {
  width: 54rpx; height: 48rpx; border-radius: 16rpx;
  background: rgba(243,108,108,1);
  box-shadow: 0 4rpx 12rpx rgba(255,222,222,1);
  display: flex; align-items: center; justify-content: center;
}
.toggle--on .toggle-pill {
  background: rgba(128,219,121,1);
  box-shadow: 0 4rpx 12rpx rgba(215,247,212,1);
}
.toggle-text { font-size: 22rpx; font-weight: 600; color: #fff; }
.hint { padding: 0 10rpx; }
.hint-text {
  font-size: 22rpx; color: rgba(153,153,153,1); line-height: 1.6;
}
</style>
