<template>
  <uni-popup
    ref="popupRef"
    type="center"
    :mask-click="false"
    background-color="transparent"
    class="privacy-popup-high-zindex"
  >
    <view class="privacy-popup">
      <text class="title">用户隐私保护提示</text>
      <text class="desc">
        idoltrail 将在您授权后使用手机号与位置信息，用于登录账号、推荐附近的演出活动。请阅读
        <text class="link" @click="openContract">《隐私政策》</text>。
      </text>

      <!-- App 端没有微信的 open-type 合规手势，用普通 button + @click -->
      <button class="agree-btn" @click="onAgree">同意</button>

      <view v-if="!dismissible" class="disagree-btn" @click="onDisagree">不同意</view>

      <!-- 拒绝后的原因内联展示：不能用 uni.showToast ——
           本弹窗 .uni-popup 的 z-index 是 9999（App.vue 强制），toast 会被完全遮住 -->
      <text v-if="notice" class="notice">{{ notice }}</text>
    </view>
  </uni-popup>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useUserStore } from '@/stores/user'
import { savePrivacyConsent, clearPrivacyConsent } from '@/utils/privacy'
import { getAgreementVersion } from '@/constants/agreements'
import { authApi } from '@/api/auth'

const userStore = useUserStore()
const { showPrivacyPopup, missingAgreements, privacyPopupReason } = storeToRefs(userStore)
const popupRef = ref<any>(null)
/** 拒绝同意后的内联提示文案 */
const notice = ref('')

/**
 * 首次启动的隐私告知必须挡住后续所有流程（不允许关闭），
 * 只有「登录流程里补签协议」这种被动场景才允许不同意。
 */
const dismissible = computed(() => privacyPopupReason.value === 'login_required')

/** 与 LoginModal / DisclaimerPopup 同策略：uni-popup 的 ref 可能晚于本组件 setup 才 ready */
function tryOpenPopup(retries = 5) {
  if (popupRef.value?.open) {
    popupRef.value.open('center')
    return
  }
  if (retries <= 0) {
    console.warn('[PrivacyPopup] popupRef 重试后仍为 null, uni-popup 没注册成功')
    return
  }
  setTimeout(() => tryOpenPopup(retries - 1), 50)
}

// immediate: true —— 隐私弹窗可能在本组件 mount 之前就被打开（App.vue onLaunch）
watch(showPrivacyPopup, (s) => {
  if (s) {
    notice.value = ''
    tryOpenPopup()
  } else {
    popupRef.value?.close?.()
  }
}, { immediate: true })

function openContract() {
  uni.navigateTo({ url: '/pages/agreement/detail?type=privacy_policy' })
}

async function onAgree() {
  notice.value = ''
  // 记录本地同意状态（App 端所有系统权限调用的前置条件）
  savePrivacyConsent()
  // 顺手把缺失的服务端协议补签
  if (missingAgreements.value?.length) {
    for (const t of missingAgreements.value) {
      try { await authApi.acceptAgreement(t, getAgreementVersion(t)) } catch (e) { console.warn('[PrivacyPopup] sign failed', t, e) }
    }
    userStore.setAgreementOK()
  }
  userStore.closePrivacyPopup()
}

function onDisagree() {
  clearPrivacyConsent()
  notice.value = '未同意隐私政策，相关功能不可用'
  if (dismissible.value) {
    // 被动补签场景：允许关闭，业务层会按未登录处理
    userStore.closePrivacyPopup()
  }
  // 首次启动场景：故意不关闭弹窗，让用户明确做出选择
}
</script>

<style scoped>
.privacy-popup {
  position: relative;
  background: #fff;
  border-radius: 30rpx;
  width: 620rpx;
  padding: 60rpx 50rpx 50rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  box-shadow: 0 20rpx 60rpx rgba(0, 0, 0, 0.15);
}

.title {
  font-size: 34rpx;
  font-weight: 600;
  color: #333;
  margin-bottom: 24rpx;
}

.desc {
  font-size: 26rpx;
  color: #666;
  text-align: center;
  line-height: 1.7;
  margin-bottom: 40rpx;
}

.link { color: #fea500; }

.agree-btn {
  width: 100%;
  height: 88rpx;
  line-height: 88rpx;
  border-radius: 44rpx;
  background: linear-gradient(135deg, rgba(254, 165, 0, 1) 0%, rgba(255, 210, 0, 1) 100%);
  color: #fff;
  font-size: 30rpx;
  font-weight: 600;
  border: none;
  margin-bottom: 16rpx;
}
.agree-btn::after { border: none; }

.disagree-btn {
  font-size: 26rpx;
  color: #999;
  padding: 16rpx 30rpx;
}

.notice {
  font-size: 24rpx;
  color: #e64340;
  line-height: 1.6;
  text-align: center;
  margin-top: 12rpx;
}
</style>
