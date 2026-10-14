<!--
  CitySubCardSkeleton  城市订阅卡骨架
  ─────────────────────────────────────────────
  与 Subscribe/CitySubCard.vue 几何一致:
    outer:    圆角 24rpx, padding 24rpx 28rpx, margin-bottom 24rpx
    head:     城市名(~120×40) + 2 个 filter 块(80×32) + 退订按钮(120×44)
    related:  圆角 18rpx 浅灰条, ~280×36
-->
<template>
  <view class="card">
    <view class="head">
      <view class="filters">
        <Skeleton :width="120" :height="40" :rounded="8" block />
        <Skeleton :width="80" :height="32" :rounded="8" block />
        <Skeleton :width="80" :height="32" :rounded="8" block />
      </view>
      <Skeleton :width="120" :height="44" :rounded="30" block />
    </view>
    <Skeleton width="280rpx" :height="36" :rounded="18" block />
  </view>
</template>

<script setup lang="ts">
import Skeleton from "@/components/Skeleton/index.vue"
</script>

<style scoped>
.card {
  background: #fff;
  border-radius: 24rpx;
  border: 1rpx solid rgba(236, 236, 236, 1);
  box-shadow: 0 6rpx 20rpx rgba(0, 0, 0, 0.04);
  padding: 24rpx 28rpx;
  margin-bottom: 24rpx;
  display: flex;
  flex-direction: column;
  gap: 22rpx;
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.filters {
  display: flex;
  gap: 18rpx;
  align-items: center;
}
</style>