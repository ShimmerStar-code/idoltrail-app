<!--
  EventCardSkeleton  活动卡骨架屏
  ─────────────────────────────────────────────
  与 EventCard/index.vue 新结构对应（外层色块 + 白色内层）：
    头部：60rpx 圆形头像 + 艺人名 + 徽章 + 书签
    白色内层：标题行（100% + 60%）+ 3 个 chip
-->
<template>
  <view class="event-card-skeleton">
    <!-- 头部 -->
    <view class="head">
      <Skeleton :width="60" :height="60" circle />
      <Skeleton :width="200" :height="32" :rounded="8" block />
      <view class="head-spacer" />
      <Skeleton :width="60" :height="60" circle />
    </view>

    <!-- 白色内层 -->
    <view class="body">
      <Skeleton width="100%" :height="32" :rounded="8" block />
      <Skeleton width="60%" :height="32" :rounded="8" block style="margin-top: 12rpx" />
      <view class="tags">
        <Skeleton :width="110" :height="40" :rounded="24" block />
        <Skeleton :width="140" :height="40" :rounded="24" block />
        <Skeleton :width="96"  :height="40" :rounded="24" block />
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import Skeleton from "@/components/Skeleton/index.vue"
</script>

<style scoped>
/* 骨架底色取中性灰（resolveArtistTheme 在无艺人时的返回值），
   避免加载完成瞬间从灰色跳到某个鲜艳的艺人主题色 */
.event-card-skeleton {
  margin: 24rpx 30rpx 0;
  border-radius: 40rpx;
  padding: 20rpx 20rpx 0;
  background: linear-gradient(180deg, rgba(228,229,233,1) 0%, rgba(238,239,242,1) 100%);
  overflow: hidden;
  box-sizing: border-box;
}

/* 头部：与卡片 event-card-head 对应 */
.head {
  display: flex;
  align-items: center;
  gap: 14rpx;
  margin-bottom: 16rpx;
  height: 60rpx;
}
.head-spacer {
  flex: 1;
}

/* 白色内层：与 event-card-body 对应 */
.body {
  background: #fff;
  border-radius: 18rpx;
  padding: 24rpx 26rpx 22rpx;
  border: 1rpx solid #ececec;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.tags {
  display: flex;
  gap: 12rpx;
  margin-top: 18rpx;
}
</style>
