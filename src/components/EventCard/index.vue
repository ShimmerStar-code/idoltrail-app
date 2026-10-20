<!--
  EventCard  活动卡片（对齐首页精选卡片设计）
  ─────────────────────────────────────────────
  UI：外层色块（按艺人主题色）+ 白色圆角内层（标题 + tags）

  头部：多艺人叠加头像（最多3个）+ 艺人名 + 状态徽章 + 书签按钮
  内层：活动标题（单行 ellipsis）+ 城市/日期/类型 3 个胶囊（带图标）

  颜色规则：
    按「艺人主题色」取色 —— 一位艺人一个色，活动卡片外层色块用该艺人
    的浅色主题底，其艺人名/图标用配套深色 ink。艺人没配主题色时按
    artist_id 哈希从预设浅色板取，稳定不飘；连艺人都没有则中性灰。
    多艺人活动取 artists[0]（后端按 setlist_order 排序，即主艺人）。

  props:
    event          Event           后端返回的活动项
    entryGenreCode string?         入口 genre code（保留兼容，当前不参与取色）
    variant        'list'|'swiper'|'flat' 默认 'list'；swiper 模式撑满 swiper-item；
                   flat 用于嵌在已有水平留白的容器里（如偶像详情页 .section-pad），
                   只保留垂直间距，避免与容器 margin 叠加成双重缩进

  emits:
    (e: 'select', id: number)      卡片被点击
-->
<template>
  <view
    class="event-card"
    :class="cardCls"
    :style="cardStyle"
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
        :style="artistNameStyle"
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
import { resolveArtistTheme } from "@/constants/artistTheme";
import { useSubscribeStore } from "@/stores/subscribe";
import { useUserStore } from "@/stores/user";
import { getArtistAvatarSrc } from "@/utils/avatar";

const props = defineProps<{
  event: Event;
  entryGenreCode?: string;
  variant?: "list" | "swiper" | "flat";
  /**
   * 艺人详情页专用：当前浏览的艺人。传入后卡片取色以该艺人为准，
   * 而非活动主艺人（artists[0]）。
   * 多艺人活动（如痛仰乐队 + 高虎）在高虎详情页应显示高虎的色，
   * 传空则回退到 artists[0]，行为与首页/列表页一致。
   */
  themeArtistId?: string;
  /** 与 themeArtistId 配对：当前艺人的 theme_color，可为空表示走哈希兜底 */
  themeColor?: string;
}>();

defineEmits<{
  (e: "select", id: number): void;
}>();

const subscribeStore = useSubscribeStore();
const userStore = useUserStore();

// ── variant ──
const variantCls = computed(() => props.variant || "list");

// ── 艺人 ──
// 活动没有挂任何艺人时的占位图。这里拿不到 type/gender，
// 只能落到统一入口的男性兜底（getArtistAvatarSrc() 无参 = avatarKind() 的 else 分支）。
const defaultAvatar = getArtistAvatarSrc();

interface ArtistItem {
  artist_id?: string;
  artist_name?: string;
  name?: string;
  avatar_url?: string;
  type?: string;
  gender?: string;
  /** 后端 artists.theme_color，空串表示未配置 */
  theme_color?: string;
}
const artists = computed<ArtistItem[]>(
  () => (props.event as any).artists || [],
);

// ── 颜色系统 ──
// 主题色跟着艺人走：后台配了就用配的，没配就按 artist_id 哈希取预设浅色板，
// 保证同一个艺人出现在列表 / 首页 swiper / 艺人详情 / 活动详情里都是同一个色。
// 艺人详情页传 themeArtistId，优先用「当前浏览的艺人」；其他场景取 artists[0]
// （后端已按 setlist_order 排序，即主艺人）。
const theme = computed(() => {
  if (props.themeArtistId) {
    return resolveArtistTheme(props.themeColor, props.themeArtistId);
  }
  return resolveArtistTheme(
    artists.value[0]?.theme_color,
    artists.value[0]?.artist_id,
  );
});

// 胶囊图标：与艺人名同色系（浅底上的深色前景）
const chipIconColor = computed(() => theme.value.ink);

// ── 渲染用样式/类名 ──
// 模板里直接写 :class="[...]" / :style="{...}" 会在每次重渲染时新建数组与对象，
// 让 Vue 无法做引用比对短路。列表页重渲染频繁（见 useVirtualList），
// 这里预先算好并缓存，渲染时只传稳定引用。
const cardCls = computed(() => [`event-card--${variantCls.value}`]);
const cardStyle = computed(() => ({ background: theme.value.base }));
const artistNameStyle = computed(() => ({
  marginLeft: artists.value.length > 1 ? "8%" : "0",
  color: theme.value.ink,
}));

const artistLineText = computed(() => {  const list = artists.value;
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

/* flat 模式：嵌在已经有水平留白的容器里用（偶像详情页的 .section-pad）。
   list 模式自带 margin: 0 30rpx，套在 .section-pad(margin: 0 30rpx) 里会
   变成左右各 60rpx，卡片比首页/列表页明显窄一圈。这里只保留垂直间距。 */
.event-card--flat {
  margin: 24rpx 0 0;
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
  /* 底色已变浅，rgba(255,255,255,.6) 几乎看不出头像边界，提到 .85 */
  background: rgba(255, 255, 255, 0.85);
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
  /* 底色已改为浅色主题底，白字不可读；实际颜色由内联 theme.ink 覆盖 */
  color: #333;
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
