<!--
  CategorySheet  分类抽屉（演出类型 + 标签）
  ─────────────────────────────────────────────
  为什么做成抽屉而不是常驻页面区块：
  旧版首页把 5 个类型图标 + 10 个标签卡片常驻在页面里，
  首屏被入口占满、真正的活动一条都看不到 ——
  这是「装完看一眼就删」的直接原因。

  现在类型/标签收进抽屉，首页首屏留给「近期活动」，
  用户想按分类找时点一下「分类」按钮即可（一次点击，比原来滚动过去更省）。

  点击任一分类 → 直接跳活动列表页并带上对应筛选参数。

  props:
    visible  是否显示
  emits:
    (e:'close')
-->
<template>
  <view v-if="visible" class="mask" @click="close" @touchmove.stop.prevent>
    <view class="sheet" @touchmove.stop>
      <view class="sheet-head">
        <text class="sheet-title">浏览分类</text>
        <view class="sheet-close" @click="close">
          <uni-icons type="closeempty" size="18" color="#999" />
        </view>
      </view>

      <scroll-view scroll-y class="sheet-body">
        <!-- 演出类型 -->
        <view class="group">
          <text class="group-title">演出类型</text>
          <view class="type-grid">
            <view
              v-for="t in eventTypes"
              :key="t.code"
              class="type-item"
              @click="goType(t.code)"
            >
              <image class="type-img" :src="t.img" mode="aspectFit" />
              <text class="type-text">{{ t.label }}</text>
            </view>
          </view>
        </view>

        <!-- 标签 -->
        <view class="group">
          <text class="group-title">标签</text>
          <view class="genre-grid">
            <view
              v-for="g in genres"
              :key="g.code"
              class="genre-card"
              @click="goGenre(g.code)"
            >
              <view class="genre-left">
                <text class="genre-name" :style="{ '--genre-color': g.color }">{{
                  g.label
                }}</text>
                <text class="genre-subtitle">{{ g.subtitle }}</text>
              </view>
              <view class="genre-icon-wrap">
                <image class="genre-icon" :src="g.icon" mode="aspectFit" />
              </view>
            </view>
          </view>
        </view>
      </scroll-view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { GENRES } from "@/constants/genres";
import { EVENT_TYPE_OPTIONS, EVENT_TYPE_SLUG } from "@/constants/eventMeta";
import { track } from "@/utils/analytics";
import { ANALYTICS_EVENTS } from "@/constants/analytics";

defineProps<{ visible: boolean }>();
const emit = defineEmits<{ (e: "close"): void }>();

/** 演出类型入口。图标与首页旧版一致；code 是 URL slug，列表页反查回后端 type_code。 */
const TYPE_ICONS: Record<string, string> = {
  CONCERT: "/static/icons/concert.svg",
  FESTIVAL: "/static/icons/festival.svg",
  FAN_MEETING: "/static/icons/fanmeeting.svg",
  ANIME_EXPO: "/static/icons/anime.svg",
  CONCERT_HALL: "/static/icons/hall.svg",
};

const eventTypes = EVENT_TYPE_OPTIONS.map((o) => ({
  code: EVENT_TYPE_SLUG[o.code] ?? o.code.toLowerCase(),
  label: o.label,
  img: TYPE_ICONS[o.code] ?? "",
}));

const genres = GENRES;

function close() {
  emit("close");
}

function goType(code: string) {
  close();
  track(ANALYTICS_EVENTS.CATEGORY_SELECT, { type: "type", code });
  uni.navigateTo({ url: `/pages/event/list?type=${code}` });
}

function goGenre(code: string) {
  close();
  track(ANALYTICS_EVENTS.CATEGORY_SELECT, { type: "genre", code });
  uni.navigateTo({ url: `/pages/event/list?genre=${code}` });
}
</script>

<style scoped>
.mask {
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 9999;
  display: flex;
  align-items: flex-end;
}
.sheet {
  width: 100%;
  background: #fff;
  border-radius: 30rpx 30rpx 0 0;
  padding-bottom: env(safe-area-inset-bottom);
  max-height: 78vh;
  display: flex;
  flex-direction: column;
}
.sheet-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 28rpx 30rpx 12rpx;
}
.sheet-title {
  font-size: 32rpx;
  font-weight: 600;
  color: #111;
}
.sheet-close {
  width: 56rpx;
  height: 56rpx;
  border-radius: 28rpx;
  background: rgba(245, 245, 245, 1);
  display: flex;
  align-items: center;
  justify-content: center;
}
.sheet-body {
  max-height: 66vh;
}
.group {
  padding: 12rpx 30rpx 8rpx;
}
.group-title {
  font-size: 26rpx;
  color: #888;
  display: block;
  padding: 8rpx 0 18rpx;
}
.type-grid {
  display: flex;
  flex-wrap: wrap;
}
.type-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10rpx;
  width: 20%;
}
.type-img {
  width: 96rpx;
  height: 96rpx;
  border-radius: 50%;
}
.type-text {
  font-size: 22rpx;
  color: #111;
  white-space: nowrap;
}
.genre-grid {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
}
.genre-card {
  width: 48%;
  border-radius: 24rpx;
  box-sizing: border-box;
  margin-bottom: 24rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24rpx;
  position: relative;
  overflow: hidden;
  background: #e9f0f4;
  box-shadow: 0rpx 19rpx 38rpx -29rpx #8aa0ae;
}
.genre-left {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
  flex: 1;
  z-index: 1;
}
.genre-subtitle {
  font-size: 22rpx;
  font-weight: 400;
  color: rgba(0, 0, 0, 0.4);
}
.genre-name {
  position: relative;
  width: fit-content;
  font-size: 32rpx;
  font-weight: 700;
  color: #111;
}
.genre-name::after {
  content: "";
  position: absolute;
  bottom: -4rpx;
  left: 0;
  width: 100%;
  height: 10rpx;
  background: var(--genre-color);
  border-radius: 5rpx;
}
.genre-icon-wrap {
  width: 72rpx;
  height: 72rpx;
  border-radius: 36rpx;
  background: rgba(255, 255, 255, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  z-index: 1;
}
.genre-icon {
  width: 100%;
  height: 100%;
}
</style>
