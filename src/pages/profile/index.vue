<template>
  <PageLayout>
    <view class="page">
      <!-- 渐变头部 -->
      <view class="hero" :style="{ paddingTop: statusBarHeight + 'px' }">
        <!-- 用户信息横向布局（头像 | 名称+统计 | 操作按钮 并排） -->
        <view class="hero-body">
          <view class="avatar-wrap" @click="onLoginTap">
            <image
              class="avatar"
              :src="userAvatarSrc"
              mode="aspectFill"
            />
          </view>
          <view class="hero-info">
            <view class="username-row">
              <text class="username">{{
                user?.nickname || (isLoggedIn ? "未设置昵称" : "点击登录")
              }}</text>
              <image
                v-if="genderIcon"
                class="gender-icon"
                :src="genderIcon"
                mode="aspectFit"
              />
            </view>
            <view v-if="isLoggedIn" class="stats-row">
              <text class="stat-label">星币：</text>
              <text class="stat-value">{{ user?.star_coins ?? 0 }}</text>
              <text class="stat-label stat-gap">贡献值：</text>
              <text class="stat-value">{{ user?.contribution ?? 0 }}</text>
            </view>
            <text v-else class="hint">登录后享受完整功能</text>
          </view>
          <!-- 操作按钮并排在最右侧 -->
          <view class="hero-actions">
            <!-- <view
              class="action-btn"
              @click="guardedNav('/pages/profile/notifications')"
            >
              <image
                class="action-icon"
                src="/static/icons/notice.svg"
                mode="aspectFit"
              />
            </view> -->
            <view class="action-btn" @click="guardedNav('/pages/profile/edit')">
              <image
                class="action-icon"
                src="/static/icons/edit.svg"
                mode="aspectFit"
              />
            </view>
          </view>
        </view>
      </view>

      <!-- 账号信息三张卡片：负 margin 骑在 hero 弧线上（独立层，z-index 高于 hero） -->
      <view v-if="isLoggedIn" class="account-cards">
        <view class="acc-card" v-for="a in accountCards" :key="a.key">
          <view class="acc-icon-wrap" :style="{ background: a.bg }">
            <uni-icons :type="a.icon" size="22" color="#FEA500" />
          </view>
          <text class="acc-value">{{ a.value || "未绑定" }}</text>
        </view>
      </view>

      <scroll-view
        scroll-y
        class="scroll-body"
        :style="{ paddingBottom: tabBarHeight + 'px' }"
      >
        <!-- 菜单 -->
        <view class="menu-section">
          <view
            class="menu-item"
            v-for="m in menuItems"
            :key="m.label"
            @click="m.action()"
          >
            <view class="menu-icon-wrap" :style="{ background: m.iconBg }">
              <image class="menu-icon" :src="m.icon" mode="aspectFit" />
            </view>
            <text class="menu-label">{{ m.label }}</text>
            <uni-icons type="right" size="8" color="#999" />
          </view>
        </view>

        <!-- 赞助 Banner -->
        <!-- 必须受 DONATE_ENABLED 控制。此前这个 banner 是无条件渲染的，
             DONATE_ENABLED 在 src/utils/env.ts 里定义了却全仓无人引用，
             于是即便支付通道没开通（后端对账接口未落地），
             banner 依然恒显示 → 用户点进去必然失败。
             开关关闭时整块隐藏，而不是展示一个点不动的入口。 -->
        <view
          v-if="DONATE_ENABLED"
          class="donate-banner"
          @click="nav('/pages/profile/donate')"
        >
          <image
            class="donate-img"
            src="/static/icons/profile_background_donate.png"
            mode="aspectFill"
          />
          <view class="donate-left">
            <text class="donate-title">赞助 idoltrail →</text>
            <text class="donate-sub"
              >如果idoltrail对您有用，赞助一下吧~</text
            >
          </view>
        </view>

        <!-- QQ群 -->
        <view class="qq-group-card" @click="copyQQGroup">
          <view class="qq-group-content">
            <view class="qq-icon-wrap">
              <uni-icons type="qq" size="32" color="#12B7F5" />
            </view>
            <view class="qq-group-info">
              <text class="qq-group-title">加入QQ群</text>
              <text class="qq-group-number">群号：1107886577</text>
            </view>
            <view class="copy-btn">
              <text class="copy-text">复制</text>
            </view>
          </view>
        </view>
      </scroll-view>

      <TabBar :current="3" />
    </view>
  </PageLayout>
</template>

<script setup lang="ts">
import { userApi } from "@/api/user";
import PageLayout from "@/components/PageLayout/index.vue";
import TabBar from "@/components/TabBar/index.vue";
import { useUserStore } from "@/stores/user";
import { getNavBarMetrics } from "@/utils/system";
import { getUserAvatarSrc } from "@/utils/avatar";
import { DONATE_ENABLED } from "@/utils/env";
import { onShow } from "@dcloudio/uni-app";
import { computed, ref } from "vue";
const statusBarHeight = ref(20);
const tabBarHeight = ref(80);
const userStore = useUserStore();
const user = computed(() => userStore.user);
const isLoggedIn = computed(() => userStore.isLoggedIn);
const genderIcon = computed(() => {
  const g = user.value?.gender;
  if (g === 1) return "/static/icons/male.svg";
  if (g === 2) return "/static/icons/female.svg";
  return "";
});

// 用户头像：走统一入口（utils/avatar.ts），默认图按性别取本地静态资源
const userAvatarSrc = computed(() => getUserAvatarSrc(user.value ?? undefined));

onShow(async () => {
  const metrics = getNavBarMetrics();
  statusBarHeight.value = metrics.statusBarHeight + metrics.navBarHeight;
  if (userStore.isLoggedIn) {
    try {
      const fresh = await userApi.me();
      userStore.setUser(fresh);
    } catch {
      /* ignore */
    }
  }
});

const accountCards = computed(() => [
  {
    key: "phone",
    icon: "phone",
    bg: "rgba(255,235,210,0.8)",
    value: user.value?.phone,
  },
  {
    key: "email",
    icon: "email",
    bg: "rgba(255,235,210,0.8)",
    value: user.value?.email,
  },
  {
    key: "wechat",
    icon: "chat",
    bg: "rgba(255,235,210,0.8)",
    value: user.value?.wechat_id,
  },
]);

const menuItems = [
  {
    label: "通知管理",
    icon: "/static/icons/notice_icon.svg",
    iconBg: "rgba(0,0,0,0.0)",
    iconColor: "#fff",
    action: () => guardedNav("/pages/profile/notifications"),
  },
  {
    label: "上传情报",
    icon: "/static/icons/submit_icon.svg",
    iconBg: "rgba(0,0,0,0.0)",
    iconColor: "#fff",
    action: () => guardedNav("/pages/event/submit"),
  },
  {
    label: "账号管理",
    icon: "/static/icons/account_icon.svg",
    iconBg: "rgba(0,0,0,0.0)",
    iconColor: "#fff",
    action: () => guardedNav("/pages/profile/account"),
  },
  {
    label: "通用",
    icon: "/static/icons/general.svg",
    iconBg: "rgba(0,0,0,0.0)",
    iconColor: "#fff",
    action: () => nav("/pages/profile/settings"),
  },
  // 协议入口放在个人中心一级菜单：合规要求用户能随时找到并阅读现行协议，
  // 不能只藏在「通用 - 关于我们」里。
  {
    label: "隐私政策",
    icon: "/static/icons/general.svg",
    iconBg: "rgba(0,0,0,0.0)",
    iconColor: "#fff",
    action: () => nav("/pages/agreement/detail?type=privacy_policy"),
  },
  {
    label: "用户协议",
    icon: "/static/icons/general.svg",
    iconBg: "rgba(0,0,0,0.0)",
    iconColor: "#fff",
    action: () => nav("/pages/agreement/detail?type=user_agreement"),
  },
  // 「协议同意记录」不再单独占个人中心一级入口：同意时间与版本已经直接展示在
  // 「隐私政策」「用户协议」页尾（src/pages/agreement/detail.vue），单开一页属于重复占用空间。
];

function nav(url: string) {
  uni.navigateTo({ url });
}

function guardedNav(url: string) {
  userStore.requireLogin({
    dismissible: true,
    reason: "profile_menu",
    onSuccess: () => nav(url),
  });
}

function onLoginTap() {
  if (!isLoggedIn.value)
    userStore.requireLogin({ dismissible: true, reason: "profile_avatar" });
}

function copyQQGroup() {
  uni.setClipboardData({
    data: "1107886577",
    success: () => {
      uni.showToast({
        title: "QQ群号已复制",
        icon: "success",
        duration: 2000,
      });
    },
    fail: () => {
      uni.showToast({
        title: "复制失败",
        icon: "none",
        duration: 2000,
      });
    },
  });
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.scroll-body {
  position: relative;
  z-index: 2 !important;
}

/* ─── Hero ─── */
.hero {
  background: linear-gradient(
    150deg,
    rgba(32, 226, 215, 0.7) 0%,
    rgba(249, 254, 165, 0.7) 100%
  );
  padding: 20rpx 30rpx 140rpx;
  position: relative;
  z-index: 1;
  /* 底部弧线：曲线压到卡片中部位置 */
  clip-path: ellipse(300% 100% at 50% 0%);
}
.hero-actions {
  display: flex;
  gap: 20rpx;
  margin-left: auto;
  align-self: center;
}
.action-btn {
  width: 72rpx;
  height: 72rpx;
  border-radius: 36rpx;
  background: rgba(255, 255, 255, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4rpx 12rpx rgba(0, 0, 0, 0.08);
}
.action-icon {
  width: 90%;
  height: 90%;
}
.hero-body {
  display: flex;
  align-items: center;
  gap: 24rpx;
}
.avatar-wrap {
  width: 120rpx;
  height: 120rpx;
  border-radius: 50%;
  border: 5rpx solid #fff;
  overflow: hidden;
  flex-shrink: 0;
  box-shadow: 0 8rpx 24rpx rgba(0, 0, 0, 0.12);
}
.avatar {
  width: 100%;
  height: 100%;
}
.hero-info {
  display: flex;
  flex-direction: column;
  gap: 14rpx;
}
.username-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
}
.username {
  font-size: 32rpx;
  font-weight: 700;
  color: #222;
}
.gender-icon {
  width: 32rpx;
  height: 32rpx;
}
.stats-row {
  display: flex;
  align-items: center;
}
.stat-label {
  font-size: 24rpx;
  color: #444;
}
.stat-value {
  font-size: 24rpx;
  font-weight: 700;
  color: #ff8c00;
}
.stat-gap {
  margin-left: 24rpx;
}
.hint {
  font-size: 24rpx;
  color: #666;
}

/* ─── Account Cards ─── */
.account-cards {
  display: flex;
  gap: 16rpx;
  margin: -80rpx 24rpx 0;
  padding: 0;
  position: relative;
  z-index: 2;
}
.acc-card {
  flex: 1;
  background: rgba(255, 255, 255, 0.55);
  backdrop-filter: blur(20rpx);
  border-radius: 24rpx;
  padding: 48rpx 16rpx 24rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14rpx;
  box-shadow: 0 8rpx 24rpx rgba(0, 0, 0, 0.06);
}
.acc-icon-wrap {
  width: 72rpx;
  height: 72rpx;
  border-radius: 16rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}
.acc-value {
  font-size: 20rpx;
  color: #ff8c00;
  text-align: center;
  word-break: break-all;
}

/* ─── Menu ─── */
.menu-section {
  padding: 30rpx 24rpx 0;
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}
.menu-item {
  background: #fff;
  border-radius: 24rpx;
  border: 1rpx solid rgba(236, 236, 236, 1);
  box-shadow: 0 6rpx 20rpx rgba(0, 0, 0, 0.04);
  display: flex;
  align-items: center;
  padding: 24rpx 26rpx;
  gap: 20rpx;
}
.menu-icon-wrap {
  width: 64rpx;
  height: 64rpx;
  border-radius: 32rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}
.menu-icon {
  width: 90%;
  height: 90%;
}
.menu-label {
  flex: 1;
  font-size: 28rpx;
  font-weight: 600;
  color: #333;
}

/* ─── Donate Banner ─── */
.donate-banner {
  margin: 30rpx 0;
  border-radius: 28rpx;
  padding: 30rpx 24rpx;
  position: relative;
  overflow: hidden;
  min-height: 200rpx;
  display: flex;
  align-items: center;
}
.donate-img {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
}
.donate-left {
  display: flex;
  flex-direction: column;
  gap: 14rpx;
  flex: 1;
  position: relative;
  z-index: 1;
  padding-left: 5%;
}
.donate-title {
  font-size: 32rpx;
  font-weight: 700;
  color: #fff;
}
.donate-sub {
  font-size: 22rpx;
  color: rgba(255, 255, 255, 0.9);
  line-height: 1.6;
}

/* ─── QQ Group Card ─── */
.qq-group-card {
  margin: 0 24rpx 30rpx;
  background: #fff;
  border-radius: 24rpx;
  border: 1rpx solid rgba(236, 236, 236, 1);
  box-shadow: 0 6rpx 20rpx rgba(0, 0, 0, 0.04);
  padding: 24rpx 26rpx;
}
.qq-group-content {
  display: flex;
  align-items: center;
  gap: 20rpx;
}
.qq-icon-wrap {
  width: 64rpx;
  height: 64rpx;
  border-radius: 12rpx;
  background: rgba(18, 183, 245, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.qq-group-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}
.qq-group-title {
  font-size: 28rpx;
  font-weight: 600;
  color: #333;
}
.qq-group-number {
  font-size: 24rpx;
  color: #666;
}
.copy-btn {
  padding: 12rpx 28rpx;
  background: linear-gradient(135deg, #20e2d7 0%, #f9fea5 100%);
  border-radius: 20rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}
.copy-text {
  font-size: 24rpx;
  font-weight: 600;
  color: #333;
}
</style>
