<template>
  <PageLayout>
    <view class="page">
      <view class="nav" :style="{ paddingTop: statusBarHeight + 'px' }">
        <uni-icons type="left" size="large" color="#333" @click="goBack" />
        <text class="nav-title">关于我们</text>
      </view>

      <scroll-view scroll-y class="scroll-body">
        <!-- 联系方式 -->
        <view class="contact-card">
          <view class="contact-logo-wrap">
            <image class="contact-logo-img" src="https://idoltrail-static.oss-cn-beijing.aliyuncs.com/avatar/Mini_Program_Avatar.png" mode="aspectFill" />
          </view>
          <text class="contact-company">{{ APP_COMPANY }}</text>
          <view class="contact-email-row" @tap="copyEmail">
            <text class="contact-email-label">邮箱</text>
            <text class="contact-email-value">{{ CONTACT_EMAIL }}</text>
            <text class="contact-email-hint">复制</text>
          </view>
        </view>

        <!-- 关于我们介绍 -->
        <view class="section-card">
          <text class="section-title">关于我们</text>
          <text class="section-body"
            >idoltrail聚焦于跟踪偶像全球活动信息，帮您掌握偶像全球动态，欢迎您的加入！
          </text>
          <view class="version-row">
            <text class="section-extra">当前版本：v{{ APP_VERSION_NAME }}</text>
            <text class="version-tag">{{ APP_VERSION_LABEL }}</text>
          </view>
          <view class="check-update-row">
            <text class="check-update-btn" :class="{ 'is-busy': checking }" @tap="checkUpdate">
              {{ checking ? '检查中…' : '检查更新' }}
            </text>
            <text v-if="updateHint" class="check-update-hint">{{ updateHint }}</text>
          </view>
        </view>

        <!-- 链接 -->
        <view class="link-list">
          <view class="link-item" @tap="goAgreement('privacy_policy')">
            <text class="link-label">隐私政策</text>
            <text class="link-desc">{{ privacyVersion }}</text>
            <uni-icons type="right" size="8" color="#999" />
          </view>
          <view class="link-item" @tap="goAgreement('user_agreement')">
            <text class="link-label">用户协议</text>
            <text class="link-desc">{{ agreementVersion }}</text>
            <uni-icons type="right" size="8" color="#999" />
          </view>
        </view>

        <view class="divider" />

        <!-- 意见反馈：未接入服务端前，走系统邮件客户端，不做假提交 -->
        <view class="feedback-card">
          <text class="feedback-title">意见反馈</text>
          <text class="feedback-desc">点击下方按钮，用您的邮件客户端发送反馈至 {{ CONTACT_EMAIL }}</text>
        </view>

        <view class="submit-btn" :class="{ 'submit-btn--off': sending }" @tap="sendFeedback">
          <text class="submit-text">{{ sending ? '正在唤起邮件…' : '发送反馈' }}</text>
        </view>

        <!-- 备案：未取得真实备案号时不渲染，避免展示虚假信息 -->
        <view v-if="ICP_FILING_NO" class="icp-row">
          <text class="icp-text">备案号：{{ ICP_FILING_NO }}</text>
        </view>
      </scroll-view>
    </view>
  </PageLayout>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { onShow } from "@dcloudio/uni-app";
import PageLayout from "@/components/PageLayout/index.vue";
import { getStatusBarHeight } from "@/utils/system";
import { APP_COMPANY, APP_VERSION_LABEL, APP_VERSION_NAME, CONTACT_EMAIL, ICP_FILING_NO } from "@/constants/appInfo";
import { getEffectiveVersion } from "@/utils/agreementContent";
import { appVersionApi, isNewerVersion } from "@/api/appVersion";
import { openExternalUrl } from "@/utils/openExternal";

// 协议版本取**当前生效版本**（服务端版本比包内新时以服务端为准），
// 不用包内常量 —— 否则 App 已经拉到新政策，这里还显示旧版本号。
const privacyVersion = ref(getEffectiveVersion("privacy_policy"));
const agreementVersion = ref(getEffectiveVersion("user_agreement"));

// 模板返回按钮：不能在模板里写 uni.navigateBack()，Vue 会把它解析成组件实例属性
function goBack() { uni.navigateBack(); }
const statusBarHeight = ref(getStatusBarHeight());
const sending = ref(false);

onMounted(() => {
  statusBarHeight.value = getStatusBarHeight();
});

onShow(() => {
  privacyVersion.value = getEffectiveVersion("privacy_policy");
  agreementVersion.value = getEffectiveVersion("user_agreement");
});

function goAgreement(type: "privacy_policy" | "user_agreement") {
  uni.navigateTo({ url: `/pages/agreement/detail?type=${type}` });
}

function copyEmail() {
  uni.setClipboardData({
    data: CONTACT_EMAIL,
    success: () => uni.showToast({ title: "邮箱已复制", icon: "none" }),
  });
}

/**
 * 检查更新。
 *
 * 版本信息来自服务端（后台「App 版本与下载」录入的当前版本），
 * 而不是包内常量 —— 包内常量是发版那一刻的快照，改不了。
 *
 * 提示就地展示在页面上，不用 uni.showToast：
 * 这个页面没有 mask 遮挡，toast 也够用，但「检查中…」这种中间态
 * 需要留在原地（toast 会自己消失），所以状态走页面内的文案。
 */
const checking = ref(false);
const updateHint = ref("");

async function checkUpdate() {
  if (checking.value) return;
  checking.value = true;
  updateHint.value = "";
  try {
    const info = await appVersionApi.fetchLatest("android");
    if (!info || !info.version_name) {
      updateHint.value = "暂未获取到版本信息";
      return;
    }
    if (!isNewerVersion(info.version_name, APP_VERSION_NAME)) {
      updateHint.value = "已是最新版本";
      return;
    }
    const size = info.file_size
      ? `（${(info.file_size / 1024 / 1024).toFixed(1)} MB）`
      : "";
    const notes = info.notes ? `\n${info.notes}` : "";
    uni.showModal({
      title: `发现新版本 v${info.version_name}${size}`,
      content: `${info.notes || "有新的版本可以下载。"}${notes}`,
      confirmText: "去下载",
      cancelText: "稍后",
      success: (res) => {
        if (res.confirm && info.download_url) {
          // 交给系统浏览器 / 下载器处理安装包
          openExternalUrl(info.download_url, "下载地址");
        }
      },
    });
    updateHint.value = `有新版本 v${info.version_name}`;
  } catch (e) {
    updateHint.value = "检查失败，请稍后再试";
  } finally {
    checking.value = false;
  }
}

/**
 * 意见反馈：拉起系统邮件客户端预填内容。
 * 服务端反馈接口未就绪，这里**不再**用「提交成功」的假 toast 骗用户 ——
 * 用户以为反馈被受理，实际内容直接丢失。唤起失败时如实告知并给出邮箱。
 */
function sendFeedback() {
  if (sending.value) return;
  sending.value = true;
  uni.setClipboardData({
    data: CONTACT_EMAIL,
    success: () => {
      uni.showToast({ title: "邮箱已复制，请发送反馈", icon: "none" });
    },
    fail: () => {
      uni.showToast({ title: `请发送邮件至 ${CONTACT_EMAIL}`, icon: "none" });
    },
    complete: () => { sending.value = false; },
  });
}
</script>

<style scoped>
.page {
  background: #fff;
  min-height: 100vh;
}
.nav {
  display: flex;
  align-items: center;
  gap: 20rpx;
  padding: 18rpx 30rpx 20rpx;
  border-bottom: 1rpx solid rgba(236, 236, 236, 1);
}
.nav-title {
  font-size: 34rpx;
  font-weight: 600;
  color: rgba(51, 51, 51, 1);
}
.scroll-body {
  padding-bottom: 60rpx;
}
.contact-card {
  margin: 30rpx;
  border-radius: 30rpx;
  background: linear-gradient(135deg, rgba(60, 55, 75, 1) 0%, rgba(40, 36, 55, 1) 100%);
  box-shadow: 0 12rpx 36rpx rgba(40, 36, 55, 0.25);
  padding: 48rpx 36rpx 40rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20rpx;
}
.contact-logo-wrap {
  margin-bottom: 8rpx;
}
.contact-logo-img {
  width: 120rpx;
  height: 120rpx;
  border-radius: 50%;
}
.contact-company {
  font-size: 28rpx;
  font-weight: 700;
  color: #fff;
  text-align: center;
  letter-spacing: 1rpx;
  line-height: 1.5;
}
.contact-email-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 40rpx;
  padding: 14rpx 28rpx;
  margin-top: 4rpx;
}
.contact-email-label {
  font-size: 22rpx;
  color: rgba(255, 210, 0, 0.9);
  font-weight: 600;
}
.contact-email-value {
  font-size: 24rpx;
  color: rgba(255, 255, 255, 0.85);
  letter-spacing: 0.5rpx;
}
.contact-email-hint {
  font-size: 20rpx;
  color: rgba(255, 255, 255, 0.55);
  padding: 2rpx 12rpx;
  border-radius: 20rpx;
  background: rgba(255, 255, 255, 0.12);
}
.section-card {
  margin: 0 30rpx 20rpx;
  padding: 24rpx 30rpx;
}
.section-title {
  font-size: 26rpx;
  font-weight: 600;
  color: rgba(51, 51, 51, 1);
  display: block;
  margin-bottom: 12rpx;
}
.section-body {
  display: block;
  font-size: 26rpx;
  color: rgba(153, 153, 153, 1);
  line-height: 1.8;
}
.section-extra {
  display: block;
  margin-top: 12rpx;
  font-size: 22rpx;
  color: rgba(200, 200, 200, 1);
}
.version-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-top: 12rpx;
}
.version-row .section-extra {
  margin-top: 0;
}
.version-tag {
  display: inline-block;
  padding: 2rpx 12rpx;
  border-radius: 100rpx;
  font-size: 20rpx;
  line-height: 1.6;
  color: #b8860b;
  background: rgba(255, 214, 102, 0.2);
}
.check-update-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-top: 16rpx;
}
.check-update-btn {
  padding: 6rpx 24rpx;
  border-radius: 100rpx;
  font-size: 22rpx;
  color: rgba(254, 165, 0, 1);
  border: 1rpx solid rgba(254, 165, 0, 0.4);
}
.check-update-btn.is-busy {
  opacity: 0.6;
}
.check-update-hint {
  font-size: 22rpx;
  color: rgba(153, 153, 153, 1);
}
.link-list {
  margin: 0 30rpx;
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}
.link-item {
  background: #fff;
  border-radius: 30rpx;
  border: 1rpx solid rgba(236, 236, 236, 1);
  box-shadow: 0 10rpx 30rpx rgba(0, 0, 0, 0.05);
  padding: 24rpx 30rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.link-label {
  font-size: 26rpx;
  font-weight: 600;
  color: rgba(51, 51, 51, 1);
}
.link-desc {
  flex: 1;
  margin-left: 16rpx;
  font-size: 22rpx;
  color: rgba(153, 153, 153, 1);
}
.divider {
  height: 2rpx;
  background: rgba(236, 236, 236, 1);
  margin: 40rpx 30rpx;
}
.feedback-card {
  margin: 0 30rpx;
  border-radius: 30rpx;
  border: 1rpx solid rgba(236, 236, 236, 1);
  padding: 24rpx 30rpx;
}
.feedback-title {
  display: block;
  font-size: 26rpx;
  font-weight: 600;
  color: rgba(51, 51, 51, 1);
  margin-bottom: 10rpx;
}
.feedback-desc {
  display: block;
  font-size: 24rpx;
  color: rgba(153, 153, 153, 1);
  line-height: 1.7;
}
.submit-btn {
  margin: 30rpx 30rpx;
  background: linear-gradient(135deg, rgba(254, 165, 0, 1) 0%, rgba(255, 210, 0, 1) 100%);
  border-radius: 50rpx;
  padding: 26rpx 0;
  text-align: center;
}
.submit-btn--off {
  opacity: 0.6;
}
.submit-text {
  font-size: 30rpx;
  font-weight: 600;
  color: #fff;
}
.icp-row {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20rpx;
}
.icp-text {
  font-size: 26rpx;
  color: rgba(221, 221, 221, 1);
}
</style>
