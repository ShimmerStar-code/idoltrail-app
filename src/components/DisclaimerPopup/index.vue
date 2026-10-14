<template>
  <uni-popup
    ref="popupRef"
    type="center"
    :mask-click="false"
    background-color="transparent"
    class="disclaimer-popup-high-zindex"
  >
    <view class="disclaimer-modal">
      <!-- 图标 -->
      <view class="icon-wrap">
        <image class="icon" src="/static/icons/notice.svg" mode="aspectFit" />
      </view>

      <text class="title">温馨提示</text>
      <text class="desc">
        数据收集于网络，注意核实，如果数据或者图片侵犯了您的权利，请联系 idoltrail@shimmer-star.com，我们会派专人跟进处理。
      </text>

      <button class="confirm-btn" @click="onConfirm">我知道了</button>
    </view>
  </uni-popup>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'

const appStore = useAppStore()
const { showDisclaimer } = storeToRefs(appStore)
const popupRef = ref<any>(null)

/**
 * uni-popup 在 mp-weixin 下是嵌套自定义组件，ref 不一定在第一次 nextTick 就 ready。
 * 用最多 5 次 / 每次 50ms 的重试兜住时序（与 LoginModal.tryOpenPopup 同策略）。
 */
function tryOpenPopup(retries = 5) {
  if (popupRef.value?.open) {
    popupRef.value.open('center')
    return
  }
  if (retries <= 0) {
    console.warn('[DisclaimerPopup] popupRef 重试后仍为 null, uni-popup 没注册成功')
    return
  }
  setTimeout(() => tryOpenPopup(retries - 1), 50)
}

// immediate: true —— App.vue onLaunch 里同步调 appStore.checkAndShowDisclaimer(),
// 此时本组件还没 mount,watch 不会回放初值,弹窗永远不显示。
watch(showDisclaimer, (show) => {
  if (show) {
    tryOpenPopup()
  } else {
    popupRef.value?.close?.()
  }
}, { immediate: true })

function onConfirm() {
  appStore.closeDisclaimer()
}
</script>

<style scoped>
.disclaimer-modal {
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
  background: rgba(254, 165, 0, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 30rpx;
}
.icon {
  width: 52rpx;
  height: 52rpx;
}

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
  line-height: 1.8;
  margin-bottom: 44rpx;
}

.confirm-btn {
  width: 100%;
  height: 88rpx;
  line-height: 88rpx;
  border-radius: 44rpx;
  background: linear-gradient(135deg, rgba(254, 165, 0, 1) 0%, rgba(255, 140, 0, 1) 100%);
  color: #fff;
  font-size: 30rpx;
  font-weight: 600;
  border: none;
}
.confirm-btn::after {
  border: none;
}
</style>

<style>
/* 提升弹窗 z-index，确保覆盖 header (z-index: 100) */
.disclaimer-popup-high-zindex {
  z-index: 9999 !important;
}
</style>
