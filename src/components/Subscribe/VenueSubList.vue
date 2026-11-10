<!--
  VenueSubList  「我订阅的场馆」列表（订阅页「场馆」tab 顶部）
  ─────────────────────────────────────────────
  解决的问题：原来「已订阅 N / 20」只是个数字，想退订必须先选城市、
  在浏览列表里翻到那个场馆、再点那个看不出含义的小图标 ——
  退订路径长到没人用。

  现在订阅的场馆**直接列在最上面**，每行右侧是带文字的「退订」按钮，
  点场馆名进详情页。

  props:
    venues     VenueCardVO[]  已订阅的场馆（store.myVenues）
    loading    boolean        加载中
  emits:
    open       { venue }      点场馆 → 进详情页
    unsubscribe { venue }     退订
-->
<template>
  <view class="panel">
    <view class="panel-head">
      <view class="panel-title-wrap">
        <view class="panel-title-bar" />
        <text class="panel-title">我订阅的场馆</text>
      </view>
      <text class="panel-count">已订阅 {{ venues.length }}</text>
    </view>

    <view v-if="loading" class="empty">加载中...</view>
    <view v-else-if="!venues.length" class="empty">
      还没有订阅的场馆，往下浏览城市里的场馆，订阅你常去的场
    </view>

    <view v-else class="venue-list">
      <view
        v-for="item in venues"
        :key="item.place.id"
        class="venue-row"
        hover-class="venue-row--hover"
        @click="onOpen(item.place)"
      >
        <view class="venue-main">
          <text class="venue-name">{{ item.place.name }}</text>
          <text class="venue-meta">
            <text v-if="item.event_count" class="venue-count">{{
              item.event_count
            }} 场活动</text>
            <text v-if="item.place.address" class="venue-addr">{{
              item.place.address
            }}</text>
          </text>
        </view>
        <!-- 退订用**文字**按钮：图标按钮用户看不出是退订还是删除 -->
        <view
          class="venue-unsub"
          hover-class="venue-unsub--hover"
          @click.stop="onUnsubscribe(item.place)"
        >
          <text class="venue-unsub-text">退订</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import type { VenueCardVO, VenuePlace } from "@/types/subscription";

// 不用 const props 接：模板里直接用 venues / loading 即可，
// 接了反而多一个未使用的变量（eslint 会报 no-unused-vars）。
withDefaults(
  defineProps<{
    venues: VenueCardVO[];
    loading?: boolean;
  }>(),
  {
    venues: () => [],
    loading: false,
  },
);

const emit = defineEmits<{
  (e: "open", payload: { venue: VenuePlace }): void;
  (e: "unsubscribe", payload: { venue: VenuePlace }): void;
}>();

function onOpen(venue: VenuePlace) {
  emit("open", { venue });
}

function onUnsubscribe(venue: VenuePlace) {
  emit("unsubscribe", { venue });
}
</script>

<style scoped>
.panel {
  background: #fff;
  border-radius: 30rpx;
  border: 1rpx solid rgba(236, 236, 236, 1);
  box-shadow: 0 10rpx 30rpx 0 rgba(0, 0, 0, 0.05);
  padding: 30rpx;
  margin-top: 24rpx;
}
.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12rpx;
}
.panel-title-wrap {
  display: flex;
  align-items: center;
  gap: 10rpx;
}
.panel-title-bar {
  width: 6rpx;
  height: 28rpx;
  border-radius: 4rpx;
  background: rgba(254, 210, 0, 0.9);
}
.panel-title {
  font-size: 30rpx;
  font-weight: 700;
  color: rgba(35, 34, 39, 1);
}
.panel-count {
  font-size: 24rpx;
  color: #999;
}

.venue-list {
  display: flex;
  flex-direction: column;
}
.venue-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  padding: 20rpx 0;
  border-bottom: 1rpx solid rgba(240, 240, 240, 1);
}
.venue-row:last-child {
  border-bottom: none;
}
.venue-row--hover {
  background: rgba(254, 165, 0, 0.04);
}
.venue-main {
  flex: 1;
  min-width: 0;
}
.venue-name {
  font-size: 28rpx;
  color: #222;
  font-weight: 500;
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.venue-meta {
  font-size: 22rpx;
  color: #aaa;
  margin-top: 6rpx;
  display: flex;
  gap: 12rpx;
}
.venue-count {
  color: #8A5600;
  flex-shrink: 0;
}
.venue-addr {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 退订：文字按钮，一眼能认出是「退订」而不是「删除」 */
.venue-unsub {
  height: 52rpx;
  padding: 0 22rpx;
  border-radius: 26rpx;
  background: rgba(254, 165, 0, 0.1);
  border: 1rpx solid rgba(254, 165, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.venue-unsub--hover {
  opacity: 0.75;
}
.venue-unsub-text {
  font-size: 24rpx;
  font-weight: 600;
  color: #8A5600;
}

.empty {
  text-align: center;
  color: #aaa;
  padding: 40rpx 0;
  font-size: 26rpx;
  line-height: 1.6;
}
</style>
