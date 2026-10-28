<template>
  <uni-popup
    ref="popupRef"
    type="center"
    :mask-click="false"
    background-color="transparent"
    class="privacy-popup-high-zindex"
  >
    <view class="privacy-popup">
      <text class="title">{{ isUpdated ? '隐私政策已更新' : '用户隐私保护提示' }}</text>
      <!-- 政策版本升级后的重新征求同意：与首次同意区分开，
           让用户知道为什么又弹一次（否则体验上像"无故重复弹窗"） -->
      <text v-if="isUpdated" class="updated">
        我们更新了《隐私政策》（当前版本 {{ currentVersion }}），请重新阅读并同意。
      </text>
      <text class="desc">
        idoltrail 将在您授权后使用手机号与位置信息，用于登录账号、推荐附近的演出活动；在您同意接收通知后，将通过消息推送服务向您发送所订阅活动的变更提醒。请阅读
        <text class="link" @click="openContract">《隐私政策》</text>。
      </text>

      <!-- App 端没有微信的 open-type 合规手势，用普通 button + @click -->
      <button class="agree-btn" @click="onAgree">同意</button>

      <!-- 不同意 = 退出应用。
           国内应用商店对"未同意隐私政策不得继续使用"的强制要求：
           不同意就不能留在 App 里，所以这里不是关闭弹窗，而是直接退出进程。 -->
      <view class="disagree-btn" @click="onDisagree">不同意并退出</view>

      <!-- 拒绝后的原因内联展示：不能用 uni.showToast ——
           本弹窗 .uni-popup 的 z-index 是 9999（App.vue 强制），toast 会被完全遮住 -->
      <text v-if="notice" class="notice">{{ notice }}</text>
    </view>
  </uni-popup>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useUserStore } from '@/stores/user'
import { savePrivacyConsent, clearPrivacyConsent, syncNativePrivacyAgree, syncNativePrivacyDisagree } from '@/utils/privacy'
import { getEffectiveAgreementVersion, getEffectiveVersion } from '@/utils/agreementContent'
import { authApi } from '@/api/auth'

const userStore = useUserStore()
const { showPrivacyPopup, missingAgreements, globalOverlaySuspended, privacyPopupReason } = storeToRefs(userStore)

/** 政策版本升级后重新征求同意（与首次同意区分文案） */
const isUpdated = computed(() => privacyPopupReason.value === 'policy_updated')
/** 当前生效的隐私政策版本号 */
const currentVersion = computed(() => getEffectiveVersion('privacy_policy'))
const popupRef = ref<any>(null)
/** 拒绝同意后的内联提示文案 */
const notice = ref('')

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
    // 协议详情页期间抑制：PageLayout 在每个页面都挂了本组件，跳协议页会多挂一个实例，
    // 不抑制的话同一次进入会连弹两遍（用户反馈"弹窗跳两次"）。
    if (globalOverlaySuspended.value) return
    notice.value = ''
    tryOpenPopup()
  } else {
    popupRef.value?.close?.()
  }
}, { immediate: true })

function openContract() {
  // 跳协议页前先关掉自己并置抑制标记：
  //   · closePrivacyPopup → 当前页的弹窗立刻收起，不会和新页面的弹窗叠在一起
  //   · suspendGlobalOverlay → 协议页新挂的 PrivacyPopup 不会立刻再弹一次
  userStore.suspendGlobalOverlay()
  userStore.closePrivacyPopup()
  uni.navigateTo({ url: '/pages/agreement/detail?type=privacy_policy' })
}

async function onAgree() {
  notice.value = ''
  // 回写原生运行时：让 DCloud 原生层也知道"用户已同意"。
  // 否则原生层一直认为未同意，下次冷启动可能又弹一次原生模板弹窗（弹两次）。
  syncNativePrivacyAgree()
  // 记录本地同意状态（App 端所有系统权限调用的前置条件）
  savePrivacyConsent()
  // 通知 App.vue：可以开始推送初始化 / 会话恢复 / 免责声明了
  userStore.markPrivacyConsented()
  // 顺手把缺失的服务端协议补签
  if (missingAgreements.value?.length) {
    for (const t of missingAgreements.value) {
      try { await authApi.acceptAgreement(t, getEffectiveAgreementVersion(t), 'privacy_popup') } catch (e) { console.warn('[PrivacyPopup] sign failed', t, e) }
    }
    userStore.setAgreementOK()
  }
  userStore.closePrivacyPopup()
}

/**
 * 不同意隐私政策 → 退出应用。
 *
 * 不是"关掉弹窗继续用"：未取得隐私政策同意前继续使用 App 违反应用商店审核要求，
 * 用户预期也是"不给用就退出"。这里用系统确认框兜一手，防止误触直接杀进程。
 */
function onDisagree() {
  clearPrivacyConsent()
  // 回写原生运行时：配合 disagreeMode.loadNativePlugins=false，
  // 原生层不再加载任何原生插件，三方 SDK 也就不会初始化。
  syncNativePrivacyDisagree()
  notice.value = '未同意隐私政策，App 将退出'
  uni.showModal({
    title: '退出 idoltrail',
    content: '未同意《隐私政策》，将退出应用。',
    confirmText: '退出',
    cancelText: '再看看',
    success: (res) => {
      if (res.confirm) quitApp()
    },
    fail: () => {
      // 确认框拉不起来时（极端情况）直接退出，避免用户被卡在弹窗里
      quitApp()
    },
  })
}

/** 退出 App 进程 */
function quitApp() {
  // #ifdef APP-PLUS
  try {
    plus.runtime.quit()
  } catch (e) {
    console.warn('[PrivacyPopup] quit failed', e)
  }
  // #endif
  // #ifndef APP-PLUS
  // H5 预览没有"退出应用"的概念，提示后留在页面
  uni.showToast({ title: '请在 App 端使用', icon: 'none' })
  // #endif
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

/* 政策版本升级后的提示条 */
.updated {
  width: 100%;
  font-size: 24rpx;
  color: #8a6d3b;
  background: #fff7e6;
  border: 1rpx solid #ffe0b2;
  border-radius: 12rpx;
  padding: 16rpx 20rpx;
  line-height: 1.6;
  text-align: left;
  margin-bottom: 24rpx;
}
</style>
