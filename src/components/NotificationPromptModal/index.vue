<template>
  <uni-popup
    ref="popupRef"
    type="center"
    :mask-click="false"
    background-color="transparent"
    class="notification-popup-high-zindex"
  >
    <view class="prompt-modal">
      <!-- 图标 -->
      <view class="icon-wrap">
        <image class="icon" src="/static/icons/notice.svg" mode="aspectFit" />
      </view>

      <text class="title">开启活动通知</text>
      <text class="desc">
        订阅活动后，当活动发生场地、时间、阵容变更或取消时，我们会通过系统推送提醒您。
      </text>

      <button class="confirm-btn" @click="onEnable">开启通知</button>
      <view class="skip-btn" @click="onSkip">暂不开启</view>
    </view>
  </uni-popup>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useNotificationStore } from '@/stores/notification'
import { setNotifPrompted } from '@/utils/storage'
import { syncPushToken } from '@/composables/usePush'

const notifStore = useNotificationStore()
const { showNotifPrompt } = storeToRefs(notifStore)
const popupRef = ref<any>(null)

/** 与 LoginModal / DisclaimerPopup 同策略：uni-popup 的 ref 可能晚于本组件 setup 才 ready */
function tryOpenPopup(retries = 5) {
  if (popupRef.value?.open) {
    popupRef.value.open('center')
    return
  }
  if (retries <= 0) {
    console.warn('[NotificationPromptModal] popupRef 重试后仍为 null, uni-popup 没注册成功')
    return
  }
  setTimeout(() => tryOpenPopup(retries - 1), 50)
}

// immediate: true —— promptIfNeeded 可能在登录回调里同步置 true,
// 而本组件随首个页面的 PageLayout 挂载,watch 需要回放初值
watch(showNotifPrompt, (s) => {
  if (s) {
    tryOpenPopup()
  } else {
    popupRef.value?.close?.()
  }
}, { immediate: true })

/**
 * 开启系统通知。
 * App 端与小程序的关键差异：没有"授权一次消耗一次配额"的语义，
 * 一次授权即长期有效，因此这里只要拿到系统权限 + 后端开关打开即可。
 */
async function onEnable() {
  // 标记已弹过，无论用户怎么选都不再弹
  setNotifPrompted()
  notifStore.closeNotifPrompt()

  // 1) 系统权限（Android 13+ 通知权限）
  const granted = await notifStore.requestSystemNotifyPermission()
  if (!granted) {
    // 本弹窗 .uni-popup 的 z-index 是 9999（App.vue 强制）。这里虽然已经 closeNotifPrompt，
    // 但 uni-popup 的关闭动画约 300ms，立刻弹 toast 仍会被残存的遮罩盖住，
    // 等动画结束再弹。
    setTimeout(() => {
      uni.showToast({ title: '未授予通知权限，将无法收到提醒', icon: 'none', duration: 2500 })
    }, 400)
    return
  }

  // 2) 后端开关
  try {
    await notifStore.updatePushEnabled(true)
  } catch (e) {
    console.warn('[NotificationPrompt] updatePushEnabled failed', e)
  }

  // 3) 拿到 cid 并上报，建立推送通道
  await syncPushToken()
}

function onSkip() {
  setNotifPrompted()
  notifStore.closeNotifPrompt()
}
</script>

<style scoped>
.prompt-modal {
  background: #fff;
  border-radius: 30rpx;
  width: 620rpx;
  padding: 60rpx 50rpx 50rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  box-shadow: 0 20rpx 60rpx rgba(0, 0, 0, 0.15);
}

.icon-wrap {
  width: 100rpx;
  height: 100rpx;
  border-radius: 50%;
  background: rgba(128, 219, 121, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 30rpx;
}
.icon { width: 52rpx; height: 52rpx; }

.title {
  font-size: 34rpx;
  font-weight: 600;
  color: #333;
  margin-bottom: 20rpx;
}

.desc {
  font-size: 26rpx;
  color: #666;
  text-align: center;
  line-height: 1.7;
  margin-bottom: 44rpx;
}

.confirm-btn {
  width: 100%;
  height: 88rpx;
  line-height: 88rpx;
  border-radius: 44rpx;
  background: linear-gradient(135deg, rgba(128, 219, 121, 1) 0%, rgba(80, 200, 120, 1) 100%);
  color: #fff;
  font-size: 30rpx;
  font-weight: 600;
  border: none;
  margin-bottom: 16rpx;
}
.confirm-btn::after { border: none; }

.skip-btn {
  font-size: 26rpx;
  color: #999;
  padding: 16rpx 30rpx;
}
</style>
