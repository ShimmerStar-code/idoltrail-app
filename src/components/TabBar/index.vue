<template>
  <view class="tabbar">
    <view
      v-for="(item, i) in tabs"
      :key="i"
      class="tab-item"
      @click="switchTab(item.path, i)"
    >
      <view class="icon-wrap">
        <image class="icon" :src="current === i ? item.iconActive : item.icon" mode="aspectFit" />
      </view>
      <text class="tab-text">{{ item.text }}</text>
    </view>
    <view class="safe-area" />
  </view>
</template>

<script setup lang="ts">
import { switchTabPage } from '@/utils/pages'

const props = defineProps<{ current: number }>()

const tabs = [
  { text: '演出', path: '/pages/home/index', icon: '/static/icons/tab-event.svg', iconActive: '/static/icons/tab-event-active.svg' },
  { text: '偶像', path: '/pages/artist/list', icon: '/static/icons/tab-idol.svg', iconActive: '/static/icons/tab-idol-active.svg' },
  { text: '订阅', path: '/pages/subscribe/index', icon: '/static/icons/tab-sub.svg', iconActive: '/static/icons/tab-sub-active.svg' },
  { text: 'Me', path: '/pages/profile/index', icon: '/static/icons/tab-me.svg', iconActive: '/static/icons/tab-me-active.svg' },
]

function switchTab(path: string, i: number) {
  if (props.current === i) return
  switchTabPage(path)
}
</script>

<style scoped>
.tabbar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: #fff;
  display: flex;
  flex-direction: column;
  box-shadow: 0 -5rpx 20rpx rgba(0,0,0,0.05);
  z-index: 999;
}
.tabbar > view:first-child, .tabbar > view:not(.safe-area) {
  display: flex;
}
.tabbar {
  flex-direction: row;
  padding: 14rpx 0 14rpx;
  flex-wrap: wrap;
}
.tab-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6rpx;
}
.icon-wrap {
  width: 44rpx;
  height: 42rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}
.icon { width: 44rpx; height: 44rpx; }
.tab-text {
  font-size: 22rpx;
  color: #111;
  line-height: 1;
}
/* .active { color: #FF6A00; } */
.safe-area {
  width: 100%;
  height: env(safe-area-inset-bottom);
  /* iOS 刘海屏底部指示条区域；非安全区机型为 0，不影响布局 */
  min-height: 0;
}
</style>
