<!--
  EventCard  活动卡片（对齐首页精选卡片设计）
  ─────────────────────────────────────────────
  UI：外层色块（按 type 换色）+ 白色圆角内层（标题 + tags）

  头部：多艺人叠加头像（最多3个）+ 艺人名 + 状态徽章 + 书签按钮
  内层：活动标题（单行 ellipsis）+ 城市/日期/类型 3 个胶囊（带图标）

  颜色规则：
    有 type → 5 固定色块（与首页精选卡片完全一致）
    无 type  → genre 渐变色 fallback（entryGenreCode 兜底）

  props:
    event          Event           后端返回的活动项
    entryGenreCode string?         入口 genre code（颜色兜底）
    variant        'list'|'swiper' 默认 'list'；swiper 模式撑满 swiper-item

  emits:
    (e: 'select', id: number)      卡片被点击
-->
<template>
  <view
    class="event-card"
    :class="[`event-card--${variantCls}`, `event-card--${typePalette}`]"
    :style="fallbackBg ? { background: fallbackBg } : {}"
    @click="$emit('select', event.id)"
  >
    <!-- 头部：艺人头像(叠加) + 艺人名 + 徽章 + 书签 -->
    <view class="event-card-head">
      <view class="artist-stack">
        <!-- 如果没有艺人，显示默认头像 -->
        <image
          v-if="!artists.length"
          class="artist-avatar artist-avatar--main"
          :src="defaultAvatar"
          mode="aspectFill"
          lazy-load
        />
        <!-- 有艺人时显示艺人头像 -->
        <image
          v-if="artists[0]"
          class="artist-avatar artist-avatar--main"
          :src="getArtistAvatarSrc(artists[0])"
          mode="aspectFill"
          lazy-load
        />
        <image
          v-if="artists[1]"
          class="artist-avatar artist-avatar--sub"
          :src="getArtistAvatarSrc(artists[1])"
          mode="aspectFill"
          lazy-load
        />
        <image
          v-if="artists[2]"
          class="artist-avatar artist-avatar--third"
          :src="getArtistAvatarSrc(artists[2])"
          mode="aspectFill"
          lazy-load
        />
      </view>
      <text
        class="artist-name"
        :style="{ marginLeft: artists.length > 1 ? '8%' : '0' }"
      >
      {{ artistLineText }}
      </text>
      <view class="head-actions">
        <!-- 非 PUBLISHED 状态才显示状态徽章 -->
        <view
          v-if="badgeLabel"
          class="status-badge"
          :style="{ background: badgeColor }"
        >
          <text class="status-badge-text">{{ badgeLabel }}</text>
        </view>
        <!-- 订阅按钮：PUBLISHED / POSTPONED 可订阅；已订阅的过期活动也保留书签以便退订移除 -->
        <view
          v-if="subscribable || isSubscribed"
          class="bookmark"
          :class="{ 'bookmark--on': isSubscribed }"
          @click.stop="onBookmarkTap"
          hover-class="bookmark--hover"
        >
          <image
            class="bookmark-icon-img"
            :src="
              isSubscribed
                ? '/static/icons/subscribed.svg'
                : '/static/icons/subscribe_icon.svg'
            "
            mode="aspectFit"
          />
        </view>
      </view>
    </view>

    <!-- 白色内层：标题 + tags -->
    <view class="event-card-body">
      <text class="event-card-title">{{ event.title }}</text>
      <view class="event-card-tags">
        <view v-if="cityText" class="event-card-tag">
          <uni-icons type="location" size="13" :color="chipIconColor" />
          <text class="event-card-tag-text">{{ cityText }}</text>
        </view>
        <view v-if="dateText" class="event-card-tag">
          <uni-icons type="calendar" size="13" :color="chipIconColor" />
          <text class="event-card-tag-text">{{ dateText }}</text>
        </view>
        <view v-if="typeText" class="event-card-tag">
          <uni-icons type="info" size="13" :color="chipIconColor" />
          <text class="event-card-tag-text">{{ typeText }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { Event } from "@/types/event";
import { formatCity } from "@/constants/cities";
import {
  EVENT_TYPE_LABEL,
  EVENT_STATUS_OPTIONS,
  STATUS_BADGE_COLOR,
  effectiveEventStatus,
} from "@/constants/eventMeta";
import { genreGradient, getGenreByCode } from "@/constants/genres";
import { useSubscribeStore } from "@/stores/subscribe";
import { useUserStore } from "@/stores/user";
import { getArtistAvatarSrc } from "@/utils/avatar";

const props = defineProps<{
  event: Event;
  entryGenreCode?: string;
  variant?: "list" | "swiper";
}>();

defineEmits<{
  (e: "select", id: number): void;
}>();

const subscribeStore = useSubscribeStore();
const userStore = useUserStore();

// ── variant ──
const variantCls = computed(() => props.variant || "list");

// ── 颜色系统 ──
type PaletteKey = "blue" | "purple" | "pink" | "yellow" | "green" | "default";
const TYPE_PALETTE: Record<string, PaletteKey> = {
  Concert: "blue",
  Music_Festival: "purple",
  Fan_Meeting: "pink",
  Anime_Expo: "yellow",
  Concert_Hall: "green",
};

// chip icon 颜色：深色版，随 type 变化
const CHIP_ICON_COLOR: Record<PaletteKey, string> = {
  blue: "#26517A",
  purple: "#4B3070",
  pink: "#7A2A36",
  yellow: "#7A5A1B",
  green: "#2D5C2E",
  default: "#333",
};

const typePalette = computed<PaletteKey>(
  () => TYPE_PALETTE[props.event.type || ""] || "default",
);

// 无 type 时用 genre 渐变作为 fallback 背景（内联 style）
const fallbackBg = computed(() => {
  if (typePalette.value !== "default") return null; // 有明确色块时不用 fallback
  const ownGenre = (props.event as any).genres?.[0]?.genre_code;
  const code = ownGenre || props.entryGenreCode;
  const color = code ? getGenreByCode(code)?.color : undefined;
  if (!color) return null;
  return genreGradient(color);
});

const chipIconColor = computed(() => CHIP_ICON_COLOR[typePalette.value]);

// ── 艺人 ──
// 使用统一的默认头像（与详情页保持一致）
const defaultAvatar = getArtistAvatarSrc();

interface ArtistItem {
  artist_id?: string;
  artist_name?: string;
  name?: string;
  avatar_url?: string;
  type?: string;
  gender?: string;
}
const artists = computed<ArtistItem[]>(
  () => (props.event as any).artists || [],
);

const artistLineText = computed(() => {
  const list = artists.value;
  if (!list.length) return "";
  if (list.length <= 2)
    return list.map((a) => a.artist_name || a.name || "").join("、");
  return `${list[0].artist_name || list[0].name}、${list[1].artist_name || list[1].name}…`;
});

// ── 信息文本 ──
const cityText = computed(() => {
  const en = props.event.sessions?.[0]?.city || "";
  return en ? formatCity(en) : "";
});

const dateText = computed(() => {
  const start = props.event.sessions?.[0]?.event_date || props.event.start_date;
  const end   = props.event.end_date;
  if (!start) return "";
  const s = String(start).slice(0, 10);
  const e = end ? String(end).slice(0, 10) : "";
  if (!e || e === s) return s; // 单场次：保留完整 YYYY-MM-DD
  // 同年范围：省略年份 → MM-DD ~ MM-DD（节省空间，避免换行）
  if (s.slice(0, 4) === e.slice(0, 4)) return `${s.slice(5)} ~ ${e.slice(5)}`;
  return `${s} ~ ${e}`; // 跨年：保留完整日期
});

const typeText = computed(
  () => EVENT_TYPE_LABEL[props.event.type] || props.event.type || "",
);

// ── 展示状态：按“今天”日期派生（PUBLISHED 且 end_date 已过 → ENDED），每次渲染即重判 ──
const effectiveStatus = computed(() => effectiveEventStatus(props.event));

// ── 状态徽章（非 PUBLISHED 才显示）──
const badgeLabel = computed(() => {
  if (!effectiveStatus.value || effectiveStatus.value === "PUBLISHED") return "";
  const found = EVENT_STATUS_OPTIONS.find(
    (o) => o.code === effectiveStatus.value
  );
  return found?.label || effectiveStatus.value;
});

const badgeColor = computed(
  () => STATUS_BADGE_COLOR[effectiveStatus.value] || "rgba(150,150,150,1)",
);

// ── 订阅 ──
const subscribable = computed(
  () =>
    effectiveStatus.value === "PUBLISHED" ||
    effectiveStatus.value === "POSTPONED",
);
const isSubscribed = computed(() =>
  subscribeStore.isEventSubscribed(props.event.id),
);

async function onBookmarkTap() {
  userStore.requireLogin({
    dismissible: true,
    reason: "event_card_subscribe",
    onSuccess: async () => {
      try {
        const nowOn = await subscribeStore.toggleEvent(props.event.id);
        uni.showToast({ title: nowOn ? "已订阅" : "已退订", icon: "success" });
      } catch (e: any) {
        uni.showToast({ title: e?.message || "操作失败", icon: "none" });
      }
    },
  });
}
</script>

<style scoped>
/* ── 基础 ── */
.event-card {
  border-radius: 40rpx;
  padding: 20rpx 20rpx;
  box-shadow: 0 6rpx 20rpx rgba(0, 0, 0, 0.06);
  overflow: hidden;
  box-sizing: border-box;
}

/* list 模式：有外边距，高度自适应 */
.event-card--list {
  margin: 24rpx 30rpx 0;
}

/* swiper 模式：撑满 swiper-item，无外边距 */
.event-card--swiper {
  margin: 24rpx 30rpx 0;
  height: calc(100% - 24rpx);
  display: flex;
  flex-direction: column;
}

/* ── 5 色色块（加深饱和度让白字艺人名清晰可读）── */
.event-card--blue {
  background: #9bc6e8;
}
.event-card--purple {
  background: #bda5e3;
}
.event-card--pink {
  background: #ec9ba6;
}
.event-card--yellow {
  background: #edcf6f;
}
.event-card--green {
  background: #a5d8a0;
}
.event-card--default {
  background: linear-gradient(
    180deg,
    rgba(110, 120, 135, 1) 0%,
    rgba(140, 150, 165, 1) 100%
  );
}

/* ── 头部 ── */
.event-card-head {
  display: flex;
  align-items: center;
  gap: 14rpx;
  margin-bottom: 16rpx;
}

/* 多艺人叠加头像 */
.artist-stack {
  position: relative;
  display: flex;
  align-items: center;
  width: 60rpx;
  height: 60rpx;
  flex-shrink: 0;
}
.artist-avatar {
  width: 60rpx;
  height: 60rpx;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.6);
  border: 3rpx solid #fff;
  position: absolute;
  top: 0;
}
.artist-avatar--main {
  left: 0;
  z-index: 3;
}
.artist-avatar--sub {
  left: 28rpx;
  z-index: 2;
}
.artist-avatar--third {
  left: 56rpx;
  z-index: 1;
}

.artist-name {
  flex: 1;
  font-size: 26rpx;
  font-weight: 600;
  color: #fff;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.head-actions {
  display: flex;
  align-items: center;
  gap: 14rpx;
  flex-shrink: 0;
}

/* 状态徽章 */
.status-badge {
  border-radius: 20rpx;
  padding: 4rpx 16rpx;
}
.status-badge-text {
  font-size: 20rpx;
  color: #fff;
  font-weight: 500;
  letter-spacing: 1rpx;
}

/* 书签按钮 */
.bookmark {
  width: 60rpx;
  height: 60rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: opacity 0.15s;
}
.bookmark--hover {
  opacity: 0.7;
}
.bookmark-icon-img {
  width: 100%;
  height: 100%;
}

/* ── 白色内层 ── */
.event-card-body {
  height: 50%;
  background: #fff;
  border-radius: 18rpx;
  padding: 24rpx 26rpx 22rpx;
  border: 1rpx solid #ececec;
  box-shadow: 0 5rpx 15rpx rgba(0, 0, 0, 0.05);
  display: flex;
  flex-direction: column;
  justify-content: center;
  /* list 模式：高度自适应，底部保留间距 */
  margin-bottom: 0;
}

.event-card-title {
  display: block;
  font-size: 28rpx;
  font-weight: 600;
  color: rgba(35, 34, 39, 1);
  line-height: 1.4;
  margin-bottom: 18rpx;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.event-card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}
.event-card-tag {
  display: inline-flex;
  align-items: center;
  gap: 6rpx;
  background: #f5f5f7;
  border-radius: 24rpx;
  padding: 8rpx 18rpx;
}
.event-card-tag-text {
  font-size: 22rpx;
  color: rgba(51, 51, 51, 1);
}
</style>
