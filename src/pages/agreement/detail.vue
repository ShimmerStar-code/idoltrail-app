<template>
  <PageLayout>
    <view class="page">
      <scroll-view scroll-y class="content">
        <view class="head">
          <text class="head-title">{{ title }}</text>
          <text class="head-meta">版本 {{ version }}</text>
        </view>
        <view class="text-wrap">
          <text class="text">{{ content }}</text>
        </view>
        <!-- 底部固定操作区：协议页也是隐私弹窗的跳转落点，必须能一键同意，
             否则用户在弹窗里点「查看政策」过来后没有任何返回同意的入口 -->
        <view class="footer">
          <text class="footer-tip">{{ agreed ? '您已同意本协议' : '请阅读并同意本协议' }}</text>
          <view class="footer-btn" :class="{ 'footer-btn--done': agreed }" @tap="onAgree">
            <text class="footer-btn-text">{{ agreed ? '已同意' : '同意并返回' }}</text>
          </view>
        </view>
      </scroll-view>
    </view>
  </PageLayout>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import PageLayout from '@/components/PageLayout/index.vue'
import { authApi } from '@/api/auth'
import { useUserStore } from '@/stores/user'
import {
  getAgreementText,
  getAgreementTitle,
  getAgreementVersion,
} from '@/constants/agreements'
import { savePrivacyConsent, hasPrivacyConsent } from '@/utils/privacy'

const type = ref('user_agreement')
const userStore = useUserStore()

const title = computed(() => getAgreementTitle(type.value))
const version = computed(() => getAgreementVersion(type.value))
const content = computed(() => getAgreementText(type.value))

/** 已同意态：隐私政策看本地同意记录，用户协议看账号的协议补签状态 */
const agreed = computed(() =>
  type.value === 'privacy_policy'
    ? hasPrivacyConsent()
    : userStore.isLoggedIn && !userStore.agreementRequired,
)

onLoad((q: any) => {
  if (q?.type) type.value = q.type
  // 动态设置导航栏标题（替换静态的「协议」）
  uni.setNavigationBarTitle({ title: title.value })
})

async function onAgree() {
  // 隐私政策：先落本地同意状态，这样回退到弹窗时无需重复征求
  if (type.value === 'privacy_policy') savePrivacyConsent()

  // 已登录用户需要把协议版本上报后端，否则账号侧仍是「未签」状态
  if (userStore.isLoggedIn) {
    uni.showLoading({ title: '提交中' })
    try {
      await authApi.acceptAgreement(type.value, version.value)
      userStore.setAgreementOK()
    } catch (e: any) {
      uni.hideLoading()
      uni.showToast({ title: e?.message || '提交失败，请重试', icon: 'none' })
      return
    }
    uni.hideLoading()
  }

  const pages = getCurrentPages()
  if (pages.length > 1) {
    uni.navigateBack()
  } else {
    uni.reLaunch({ url: '/pages/home/index' })
  }
}
</script>

<style scoped>
.page {
  background: #fff;
  min-height: 100vh;
}
.content {
  width: 100%;
  height: 100vh;
  box-sizing: border-box;
}
.head {
  padding: 40rpx 30rpx 0;
}
.head-title {
  display: block;
  font-size: 40rpx;
  font-weight: 600;
  color: #222;
}
.head-meta {
  display: block;
  margin-top: 10rpx;
  font-size: 24rpx;
  color: #999;
}
.text-wrap {
  width: 100%;
  /* 底部留出固定操作区的高度，避免最后一行正文被 footer 盖住 */
  padding: 24rpx 30rpx 160rpx;
  box-sizing: border-box;
}
.text {
  display: block;
  width: 100%;
  font-size: 28rpx;
  line-height: 1.8;
  color: #555;
  /* 协议正文含大量中英文与分隔线，不能用 break-all，否则单词会被拦腰折断 */
  white-space: pre-wrap;
  word-break: break-word;
}
.footer {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  gap: 24rpx;
  padding: 20rpx 30rpx calc(20rpx + env(safe-area-inset-bottom));
  background: #fff;
  border-top: 1rpx solid rgba(236, 236, 236, 1);
}
.footer-tip {
  flex: 1;
  font-size: 24rpx;
  color: #999;
}
.footer-btn {
  padding: 16rpx 48rpx;
  border-radius: 999rpx;
  background: #3c374b;
}
.footer-btn--done {
  background: #ccc;
}
.footer-btn-text {
  font-size: 28rpx;
  color: #fff;
}
</style>
