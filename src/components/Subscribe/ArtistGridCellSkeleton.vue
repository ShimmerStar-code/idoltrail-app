<!--
  ArtistGridCellSkeleton  偶像网格单元骨架
  ─────────────────────────────────────────────
  与 Subscribe/ArtistGridCell.vue 几何一致:
    130rpx 圆形头像 + ~110×24 名字 + ~80×32 退订按钮(渐变占位用 #f1f1f1)
-->
<template>
  <view class="cell">
    <Skeleton :width="130" :height="130" circle />
    <Skeleton :width="110" :height="24" :rounded="6" block />
    <Skeleton :width="80" :height="32" :rounded="30" block />
  </view>
</template>

<script setup lang="ts">
import Skeleton from "@/components/Skeleton/index.vue"
</script>

<style scoped>
.cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 130rpx;
  flex-shrink: 0;
  gap: 10rpx;
}
</style>