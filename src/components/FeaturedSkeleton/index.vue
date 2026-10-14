<template>
  <view class="featured-skeleton">
    <!-- 头部：艺人 + NEW 占位 -->
    <view class="featured-skeleton-head">
      <view class="featured-skeleton-artist">
        <Skeleton
          width="60rpx"
          height="60rpx"
          circle
          base-color="#ffffff"
          highlight-color="#e0e0e0"
        />
        <Skeleton
          width="180rpx"
          height="30rpx"
          :rounded="8"
          base-color="#ffffff"
          highlight-color="#e0e0e0"
        />
      </view>
      <view class="featured-skeleton-head-right">
        <Skeleton
          width="72rpx"
          height="30rpx"
          :rounded="15"
          base-color="#ffffff"
          highlight-color="#e0e0e0"
        />
        <Skeleton
          width="56rpx"
          height="56rpx"
          circle
          base-color="#3a3a3a"
          highlight-color="#5a5a5a"
        />
      </view>
    </view>

    <!-- 白色内层：title + tags -->
    <view class="featured-skeleton-body">
      <Skeleton
        class="featured-skeleton-title"
        width="70%"
        height="32rpx"
        :rounded="8"
        base-color="#e0e0e0"
        highlight-color="#f0f0f0"
      />
      <view class="featured-skeleton-tags">
        <Skeleton
          width="120rpx"
          height="36rpx"
          :rounded="18"
          base-color="#e0e0e0"
          highlight-color="#f0f0f0"
        />
        <Skeleton
          width="160rpx"
          height="36rpx"
          :rounded="18"
          base-color="#e0e0e0"
          highlight-color="#f0f0f0"
        />
        <Skeleton
          width="80rpx"
          height="36rpx"
          :rounded="18"
          base-color="#e0e0e0"
          highlight-color="#f0f0f0"
        />
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import Skeleton from "@/components/Skeleton/index.vue";
</script>

<style scoped>
.featured-skeleton {
  margin: 24rpx 30rpx 0;
  border-radius: 24rpx;
  background: linear-gradient(
    180deg,
    rgba(170, 180, 190, 1) 0%,
    rgba(200, 210, 220, 1) 100%
  );
  padding: 20rpx 20rpx 24rpx;
  height: calc(100% - 24rpx);
  box-sizing: border-box;
  overflow: hidden;
}
.featured-skeleton-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16rpx;
}
.featured-skeleton-artist {
  display: flex;
  align-items: center;
  gap: 14rpx;
  flex: 1;
  min-width: 0;
}
.featured-skeleton-head-right {
  display: flex;
  align-items: center;
  gap: 14rpx;
  flex-shrink: 0;
}
.featured-skeleton-body {
  background: #fff;
  border-radius: 18rpx;
  padding: 24rpx 26rpx 22rpx;
  border: 1rpx solid #ececec;
  box-shadow: 0 5rpx 15rpx rgba(0, 0, 0, 0.05);
}
.featured-skeleton-title {
  margin-bottom: 18rpx;
  display: block;
}
.featured-skeleton-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}
</style>
