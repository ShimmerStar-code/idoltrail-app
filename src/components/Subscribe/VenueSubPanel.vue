<!--
  VenueSubPanel  场馆浏览 + 订阅（订阅页「场馆」tab）
  ─────────────────────────────────────────────
  为什么是「按城市浏览场馆」而不是「订阅城市」：
  一个城市每月几十场活动，订阅城市等于订阅一座城市的公告栏 ——
  量太大、噪音高，用户很快就把它忽略掉。真正被反复关注的是
  **常去的那几个场**（某家 Livehouse、某个体育馆）。

  交互（2026-11 重做）：
  1. 先选城市 → 列出该城市的场馆（后端按活动数降序）；
  2. **点场馆行 → 进场馆详情页**（看它的活动、地址、别名），在详情页决定要不要订阅；
  3. 行内保留一个**带文字**的「订阅 / 已订阅」按钮，方便直接操作 ——
     早期版本这里是个 56rpx 的灰色圆形图标，用户根本看不出点的是「订阅」。

  ⚠️ 文案不再重复：面板里原来那句「不直接订阅城市（活动量太大）……」与
  tab 顶部的提示一字不差，两处同时出现显得像出了问题 —— 现在只保留 tab 提示。

  props:
    cityName        string        当前浏览的城市名（空串 = 还没选城市）
    venues          VenuePlace[]  该城市的场馆列表（后端按活动数降序，分页追加）
    loading         boolean       首屏加载中
    loadingMore     boolean       续页加载中（列表底部「加载中…」）
    total           number        该城市的场馆总数（用来显示「共 N 个 / 没有更多了」）
    subscribedIds   Set<string>   已订阅的场馆 id 集合
    subscribedCount number        已订阅场馆数
    limit           number        订阅上限

  emits:
    pick-city                    点了「浏览城市」
    open         { venue }       点了场馆行 → 进场馆详情页
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

    <!-- 城市选择行 -->
    <view class="city-row" hover-class="city-row--hover" @click="$emit('pick-city')">
      <view class="city-row-left">
        <text class="city-row-label">浏览城市</text>
        <text class="city-row-name">{{ cityName || "选择城市" }}</text>
      </view>
      <uni-icons type="right" size="14" color="#999" />
    </view>

    <!-- 场馆列表 -->
    <view v-if="loading" class="empty">加载中...</view>
    <view v-else-if="!cityName" class="empty">先选一个城市，看看有哪些场馆</view>
    <view v-else-if="!venues.length" class="empty">该城市暂无可浏览的场馆</view>

    <view v-else class="venue-list">
      <view
        v-for="v in venues"
        :key="v.id"
        class="venue-row"
        hover-class="venue-row--hover"
        @click="onOpen(v)"
      >
        <view class="venue-main">
          <text class="venue-name">{{ v.name }}</text>
          <text class="venue-meta">
            <text v-if="v.event_count" class="venue-count">{{ v.event_count }} 场活动</text>
            <text v-if="v.address" class="venue-addr">{{ v.address }}</text>
          </text>
        </view>
        <!-- 带文字的订阅按钮：只放一个图标的话用户认不出这是「订阅场馆」 -->
        <view
          class="venue-btn"
          :class="{ 'venue-btn--on': isSubscribed(v.id) }"
          hover-class="venue-btn--hover"
          @click.stop="onToggle(v)"
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
          <text class="venue-btn-text">{{ isSubscribed(v.id) ? "已订阅" : "订阅" }}</text>
        </view>
      </view>

      <!--
        列表尾部：总数 + 加载状态。
        场馆是分页的（城市级数量几十个），触底会自动续一页，
        这里明确告诉用户「共 N 个」和「没有更多了」，避免以为列表被截断。
      -->
      <view class="venue-foot">
        <text v-if="loadingMore" class="venue-foot-text">加载中…</text>
        <text v-else-if="hasMore" class="venue-foot-text">上拉加载更多</text>
        <text v-else class="venue-foot-text">共 {{ total }} 个场馆，没有更多了</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { VenuePlace } from "@/types/subscription";

const props = withDefaults(
  defineProps<{
    cityName: string;
    venues: VenuePlace[];
    loading: boolean;
    loadingMore?: boolean;
    total?: number;
    subscribedIds: Set<string>;
    subscribedCount: number;
    limit: number;
  }>(),
  {
    cityName: "",
    venues: () => [],
    loading: false,
    loadingMore: false,
    total: 0,
    subscribedCount: 0,
    limit: 20,
  },
);

const emit = defineEmits<{
  (e: "pick-city"): void;
  (e: "open", payload: { venue: VenuePlace }): void;
  (e: "subscribe", payload: { venue: VenuePlace }): void;
  (e: "unsubscribe", payload: { venue: VenuePlace }): void;
}>();

/** 还有下一页：列表长度小于总数就能继续加载 */
const hasMore = computed(() => props.venues.length < props.total);

function isSubscribed(id: string): boolean {
  return props.subscribedIds.has(id);
}

/** 点场馆行 → 进详情页，在那边决定要不要订阅 */
function onOpen(venue: VenuePlace) {
  emit("open", { venue });
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

.city-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: linear-gradient(
    135deg,
    rgba(254, 165, 0, 0.12),
    rgba(254, 165, 0, 0.04)
  );
  border-radius: 32rpx;
  padding: 18rpx 24rpx;
  margin-bottom: 16rpx;
}
.city-row--hover {
  opacity: 0.75;
}
.city-row-left {
  display: flex;
  align-items: baseline;
  gap: 12rpx;
  min-width: 0;
}
.city-row-label {
  font-size: 26rpx;
  color: #666;
  flex-shrink: 0;
}
.city-row-name {
  font-size: 28rpx;
  color: #8A5600;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

/* 订阅按钮：带文字 + 图标，一眼能看出是「订阅场馆」 */
.venue-btn {
  display: flex;
  align-items: center;
  gap: 6rpx;
  height: 52rpx;
  padding: 0 20rpx;
  border-radius: 26rpx;
  background: linear-gradient(135deg, #fea500 0%, #ff8a3d 100%);
  flex-shrink: 0;
}
.venue-btn--hover {
  opacity: 0.8;
}
.venue-btn--on {
  background: rgba(254, 165, 0, 0.12);
  border: 1rpx solid rgba(254, 165, 0, 0.45);
}
.venue-btn-icon {
  width: 26rpx;
  height: 26rpx;
}
.venue-btn-text {
  font-size: 22rpx;
  font-weight: 600;
  color: #fff;
}
.venue-btn--on .venue-btn-text {
  color: #8A5600;
}

.empty {
  text-align: center;
  color: #aaa;
  padding: 40rpx 0;
  font-size: 26rpx;
}

/* 列表尾部：总数 / 加载状态 */
.venue-foot {
  padding: 24rpx 0 8rpx;
  text-align: center;
}
.venue-foot-text {
  font-size: 22rpx;
  color: #bbb;
}
</style>
