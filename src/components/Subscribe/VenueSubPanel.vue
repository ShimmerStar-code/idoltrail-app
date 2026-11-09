<!--
  VenueSubPanel  场馆订阅面板（订阅页「城市」tab 下方）
  ─────────────────────────────────────────────
  为什么是「订场馆」而不是「订城市」：
  一个城市每月几十场活动，订阅城市等于订阅一座城市的公告栏 ——
  量太大、噪音高，用户很快就把它忽略掉。真正被反复关注的���
  是**常去的那几个场**（某家 Livehouse、某个体育馆）。
  所以 App 端不再提供「订阅城市」入口，改成浏览城市下的场馆并订阅具体的场。

  props:
    cityName        string        当前浏览的城市名（空串 = 还没选城市）
    venues          VenuePlace[]  该城市的场馆列表（后端按活动数降序）
    loading         boolean       场馆列表加载中
    subscribedIds   Set<string>   已订阅的场馆 id 集合
    subscribedCount number        已订阅场馆数
    limit           number        订阅上限

  emits:
    pick-city                    点了「选择城市」
    subscribe    { venue }       订阅场馆
    unsubscribe  { venue }       退订场馆
-->
<template>
  <view class="panel">
    <!-- 标题行：场馆订阅 + 上限 -->
    <view class="panel-head">
      <view class="panel-title-wrap">
        <view class="panel-title-bar" />
        <text class="panel-title">场馆订阅</text>
      </view>
      <text class="panel-count">已订阅 {{ subscribedCount }} / {{ limit }}</text>
    </view>

    <view class="panel-tip">
      不直接订阅城市（活动量太大），改订阅你常去的场馆，有新活动时通知你。
    </view>

    <!-- 城市选择行 -->
    <view class="city-row" hover-class="city-row--hover" @click="$emit('pick-city')">
      <text class="city-row-label">浏览城市</text>
      <view class="city-row-value">
        <text class="city-row-name">{{ cityName || "选择城市" }}</text>
        <uni-icons type="right" size="14" color="#999" />
      </view>
    </view>

    <!-- 场馆列表 -->
    <view v-if="loading" class="empty">加载中...</view>
    <view v-else-if="!cityName" class="empty">先选一个城市，看看有哪些场馆</view>
    <view v-else-if="!venues.length" class="empty">该城市暂无可订阅的场馆</view>

    <view v-else class="venue-list">
      <view v-for="v in venues" :key="v.id" class="venue-row">
        <view class="venue-main">
          <text class="venue-name">{{ v.name }}</text>
          <text class="venue-meta">
            <text v-if="v.event_count">{{ v.event_count }} 场活动</text>
            <text v-if="v.address" class="venue-addr">{{ v.address }}</text>
          </text>
        </view>
        <view
          class="venue-btn"
          :class="{ 'venue-btn--on': isSubscribed(v.id) }"
          hover-class="venue-btn--hover"
          @click="onToggle(v)"
        >
          <image
            class="venue-btn-icon"
            :src="
              isSubscribed(v.id)
                ? '/static/icons/subscribed.svg'
                : '/static/icons/subscribe_icon.svg'
            "
            mode="aspectFit"
          />
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import type { VenuePlace } from "@/types/subscription";

const props = withDefaults(
  defineProps<{
    cityName: string;
    venues: VenuePlace[];
    loading: boolean;
    subscribedIds: Set<string>;
    subscribedCount: number;
    limit: number;
  }>(),
  {
    cityName: "",
    venues: () => [],
    loading: false,
    subscribedCount: 0,
    limit: 20,
  },
);

const emit = defineEmits<{
  (e: "pick-city"): void;
  (e: "subscribe", payload: { venue: VenuePlace }): void;
  (e: "unsubscribe", payload: { venue: VenuePlace }): void;
}>();

function isSubscribed(id: string): boolean {
  return props.subscribedIds.has(id);
}

function onToggle(venue: VenuePlace) {
  if (isSubscribed(venue.id)) {
    emit("unsubscribe", { venue });
  } else {
    emit("subscribe", { venue });
  }
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
.panel-tip {
  font-size: 24rpx;
  color: #999;
  line-height: 1.5;
  margin-bottom: 16rpx;
}

.city-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #f5f5f5;
  border-radius: 32rpx;
  padding: 16rpx 24rpx;
  margin-bottom: 16rpx;
}
.city-row--hover {
  background: #ebebeb;
}
.city-row-label {
  font-size: 26rpx;
  color: #666;
}
.city-row-value {
  display: flex;
  align-items: center;
  gap: 6rpx;
}
.city-row-name {
  font-size: 26rpx;
  color: #333;
  font-weight: 500;
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
.venue-addr {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.venue-btn {
  width: 56rpx;
  height: 56rpx;
  border-radius: 50%;
  background: #f8f8f8;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.venue-btn--hover {
  opacity: 0.7;
}
.venue-btn--on {
  background: rgba(254, 210, 0, 0.18);
}
.venue-btn-icon {
  width: 80%;
  height: 80%;
}

.empty {
  text-align: center;
  color: #aaa;
  padding: 40rpx 0;
  font-size: 26rpx;
}
</style>
