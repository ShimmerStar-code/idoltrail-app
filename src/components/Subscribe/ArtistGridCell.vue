<!--
  ArtistGridCell  偶像 tab 网格单元
  ─────────────────────────────────────────────
  圆形头像 + 名字 + 退订按钮（设计稿第 3 张）
  props: { item: ArtistCardVO }
  emit:  unsubscribe（点退订按钮）、tap（点头像/名字区域，跳详情）
-->
<template>
  <view class="cell">
    <view class="avatar-wrap" @click="$emit('tap', item)">
      <!-- lazy-load：订阅页偶像 tab 是 5 列网格，单屏 25+ 张网络头像，
           不加懒加载会在进页瞬间并发请求全部头像 -->
      <image
        class="avatar"
        :src="getArtistAvatarSrc(item.artist)"
        mode="aspectFill"
        lazy-load
      />
    </view>
    <text class="name" :title="item.artist.name" @click="$emit('tap', item)">{{ item.artist.name }}</text>
    <view class="unsub" @click.stop="$emit('unsubscribe', item)">
      <text class="unsub-text">退订</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import type { ArtistCardVO } from '@/types/subscription'
import { getArtistAvatarSrc } from '@/utils/avatar'

defineProps<{ item: ArtistCardVO }>()
defineEmits<{
  (e: 'unsubscribe', item: ArtistCardVO): void
  (e: 'tap', item: ArtistCardVO): void
}>()
</script>

<style scoped>
.cell {
  display: flex; flex-direction: column; align-items: center;
  width: 130rpx; flex-shrink: 0;
}
.avatar-wrap { width: 130rpx; height: 130rpx; border-radius: 65rpx; overflow: hidden; }
.avatar { width: 100%; height: 100%; }
.name {
  margin-top: 12rpx;
  font-size: 24rpx; color: rgba(51, 51, 51, 1);
  text-align: center; max-width: 130rpx;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.unsub {
  margin-top: 10rpx;
  border-radius: 30rpx; padding: 8rpx 24rpx;
  background: linear-gradient(0deg, rgba(255, 196, 205, 1) 0%, rgba(255, 143, 160, 1) 100%);
}
.unsub-text { font-size: 20rpx; font-weight: 600; color: #fff; }
</style>
