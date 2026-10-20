<!--
  未登录空态引导
  ─────────────────────────────────────────────
  用于「我的订阅」这类纯用户私有数据的页面。

  这些页面原来在 onMounted 里直接 requireLogin()，属于拦截式登录：
  点一下 TabBar 就要登录，没登录的用户连页面内容都看不到。

  这里改为按需登录：未登录时页面照常打开，只在用户主动点这段引导时
  才唤起登录弹窗。既不拦截浏览，也保留明确的登录入口 —— 否则未登录
  时看到的是「还没有订阅的偶像」这种误导性空态，用户会以为功能坏了。
-->
<template>
  <view class="login-prompt" @click="onTap">
    <uni-icons type="auth" size="28" color="#bbb" />
    <text class="login-prompt-title">{{ title }}</text>
    <text v-if="sub" class="login-prompt-sub">{{ sub }}</text>
  </view>
</template>

<script setup lang="ts">
import { useUserStore } from "@/stores/user";

const props = withDefaults(
  defineProps<{
    /** 引导标题，如「登录后查看你的订阅」 */
    title?: string;
    /** 补充说明，可留空 */
    sub?: string;
    /** 登录原因，用于登录成功后的回跳与埋点 */
    reason?: string;
  }>(),
  {
    title: "登录后查看",
    sub: "",
    reason: "login_prompt",
  },
);

const userStore = useUserStore();

function onTap() {
  // 按需登录：用户主动点引导才弹，且允许关闭
  userStore.requireLogin({ dismissible: true, reason: props.reason });
}
</script>

<style scoped>
.login-prompt {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 90rpx 60rpx;
}

.login-prompt-title {
  margin-top: 16rpx;
  font-size: 28rpx;
  color: #666;
}

.login-prompt-sub {
  margin-top: 10rpx;
  font-size: 24rpx;
  color: #999;
  text-align: center;
  line-height: 1.6;
}
</style>
