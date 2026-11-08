<!--
  SearchSuggest  搜索建议面板（历史 + 热门词 + 热门艺人）
  ─────────────────────────────────────────────
  为什么需要它：
  旧版首页的搜索面板只在「有历史记录」时才出现，
  新用户点搜索框 → 面板整个不出现，只剩一个空输入框，
  看起来像搜索坏了（实测新用户根本没有历史记录）。

  现在无历史时展示「热门搜索」与「热门艺人」，
  给新用户一条可直接点下去的路径，也给老用户一个快捷入口。

  props:
    history      SearchHistoryItem[]  搜索历史
    hotWords     string[]             热门搜索词
    hotArtists   string[]             热门艺人名
  emits:
    (e:'pick-history', q:string)  点历史
    (e:'pick-hot', q:string)     点热门词/热门艺人
    (e:'clear-history')          清空历史
-->
<template>
  <view class="panel">
    <!-- 搜索历史 -->
    <template v-if="history.length">
      <view class="row">
        <text class="row-title">搜索历史</text>
        <text class="row-clear" @click="$emit('clear-history')">清空</text>
      </view>
      <view class="tags">
        <view
          v-for="item in history"
          :key="item.q"
          class="tag"
          hover-class="tag--hover"
          @click="$emit('pick-history', item.q)"
        >
          <text class="tag-text">{{ item.q }}</text>
        </view>
      </view>
    </template>

    <!-- 热门搜索 -->
    <template v-if="hotWords.length">
      <view class="row">
        <text class="row-title">热门搜索</text>
      </view>
      <view class="tags">
        <view
          v-for="w in hotWords"
          :key="`w-${w}`"
          class="tag tag--hot"
          hover-class="tag--hover"
          @click="$emit('pick-hot', w)"
        >
          <text class="tag-text tag-text--hot">{{ w }}</text>
        </view>
      </view>
    </template>

    <!-- 热门艺人 -->
    <template v-if="hotArtists.length">
      <view class="row">
        <text class="row-title">热门偶像</text>
      </view>
      <view class="tags">
        <view
          v-for="a in hotArtists"
          :key="`a-${a}`"
          class="tag tag--hot"
          hover-class="tag--hover"
          @click="$emit('pick-hot', a)"
        >
          <text class="tag-text tag-text--hot">{{ a }}</text>
        </view>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import type { SearchHistoryItem } from "@/utils/searchHistory";

defineProps<{
  history: SearchHistoryItem[];
  hotWords: string[];
  hotArtists: string[];
}>();

defineEmits<{
  (e: "pick-history", q: string): void;
  (e: "pick-hot", q: string): void;
  (e: "clear-history"): void;
}>();
</script>

<style scoped>
.panel {
  background: #fff;
  border-radius: 24rpx;
  box-shadow: 0 12rpx 40rpx rgba(0, 0, 0, 0.18);
  padding: 8rpx 30rpx 30rpx;
  box-sizing: border-box;
}
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24rpx 0 12rpx;
}
.row-title {
  font-size: 28rpx;
  font-weight: 600;
  color: rgba(35, 34, 39, 1);
}
.row-clear {
  font-size: 24rpx;
  color: rgba(153, 153, 153, 1);
  padding: 8rpx 4rpx;
}
.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
  padding-top: 4rpx;
}
.tag {
  display: flex;
  align-items: center;
  max-width: 100%;
  padding: 14rpx 28rpx;
  border-radius: 32rpx;
  background: rgba(245, 245, 245, 1);
}
.tag--hot {
  background: rgba(254, 165, 0, 0.08);
}
.tag--hover {
  background: rgba(0, 0, 0, 0.06);
}
.tag-text {
  font-size: 26rpx;
  color: rgba(51, 51, 51, 1);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tag-text--hot {
  color: #8a5600;
}
</style>
