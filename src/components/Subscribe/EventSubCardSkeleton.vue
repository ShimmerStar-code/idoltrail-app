<!--
  EventSubCardSkeleton  订阅页活动卡骨架
  ─────────────────────────────────────────────
  与 Subscribe/EventSubCard.vue 几何一致:
    outer:    border-radius 24rpx, padding 20rpx 20rpx 24rpx, margin-bottom 24rpx
              中性灰背景(原始卡有 5 色调色板,骨架保持中性占位)
    head:     60rpx 圆形头像 + ~220×36 艺人名 + 60×32 NEW 徽章 + 56×56 圆形书签
    body:     白色内框,圆角 18rpx,padding 24rpx 26rpx 22rpx
              标题 1 行 + 3 个 chip
-->
<template>
  <view class="card">
    <view class="head">
      <view class="head-left">
        <Skeleton :width="60" :height="60" circle />
        <Skeleton :width="220" :height="32" :rounded="8" block />
      </view>
      <view class="head-right">
        <Skeleton :width="60" :height="32" :rounded="30" block />
        <Skeleton :width="56" :height="56" circle />
      </view>
    </view>
    <view class="body">
      <Skeleton width="80%" :height="32" :rounded="8" block />
      <view class="chips">
        <Skeleton :width="120" :height="40" :rounded="24" block />
        <Skeleton :width="140" :height="40" :rounded="24" block />
        <Skeleton :width="100" :height="40" :rounded="24" block />
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import Skeleton from "@/components/Skeleton/index.vue"
</script>

<style scoped>
.card {
  background: #ececec;
  border-radius: 24rpx;
  padding: 20rpx 20rpx 24rpx;
  margin-bottom: 24rpx;
  box-shadow: 0 6rpx 20rpx rgba(0, 0, 0, 0.04);
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16rpx;
}
.head-left {
  display: flex;
  align-items: center;
  gap: 14rpx;
}
.head-right {
  display: flex;
  align-items: center;
  gap: 14rpx;
}
.body {
  background: #fff;
  border-radius: 18rpx;
  padding: 24rpx 26rpx 22rpx;
  display: flex;
  flex-direction: column;
  gap: 18rpx;
}
.chips {
  display: flex;
  gap: 12rpx;
}
</style>