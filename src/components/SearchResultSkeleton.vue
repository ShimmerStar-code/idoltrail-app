<!--
  SearchResultSkeleton  搜索结果行骨架
  ─────────────────────────────────────────────
  与 pages/search/index.vue 的 .card (12rpx 圆角, padding 20rpx) 一致:
    name 行:28rpx 粗体,占 60%
    sub 行: 24rpx 灰色,占 40%
-->
<template>
  <view class="search-result-skeleton">
    <Skeleton width="60%" :height="28" :rounded="6" block />
    <Skeleton width="40%" :height="24" :rounded="6" block />
  </view>
</template>

<script setup lang="ts">
import Skeleton from "@/components/Skeleton/index.vue"
</script>

<style scoped>
.search-result-skeleton {
  background: #fff;
  border-radius: 12rpx;
  padding: 20rpx;
  margin-bottom: 16rpx;
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}
</style>