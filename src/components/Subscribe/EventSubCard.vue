<!--
  EventSubCard  订阅页活动卡片
  ─────────────────────────────────────────────
  设计稿 3 张彩色卡（紫/绿/粉），结构相同：圆角 + 头部（艺人头像 + 名字 + NEW 徽章 + +书签） + 白色内框（标题 + 3 个 chip）
  props: { vo: EventCardVO }
  emit:  bookmark（点 + 书签）
-->
<template>
  <view class="card" :class="`card--${vo.theme_color}`" @click="$emit('tap', vo)">
    <!-- 头部 -->
    <view class="head">
      <view class="head-left">
        <view class="avatar-wrap">
          <image
            class="avatar"
            :src="getArtistAvatarSrc(vo.event.artist ?? undefined)"
            mode="aspectFill"
            lazy-load
          />
        </view>
        <text class="artist-name">{{ vo.event.artist?.name || '—' }}</text>
        <!-- 场次徽标：多场次（巡演）才显示，单场次标「共 1 场」是噪音 -->
        <view v-if="sessionBadgeText" class="session-badge">
          <text class="session-badge-text">{{ sessionBadgeText }}</text>
        </view>
      </view>
      <view class="head-right">
        <view v-if="vo.is_new" class="new-badge">
          <text class="new-text">NEW</text>
        </view>
        <view v-if="props.showBookmark" class="bookmark" :class="{ 'bookmark--on': props.subscribed }" @click.stop="$emit('bookmark', vo)">
          <image
            class="bookmark-icon-img"
            :src="props.subscribed ? '/static/icons/subscribed.svg' : '/static/icons/subscribe_icon.svg'"
            mode="aspectFit"
          />
        </view>
      </view>
    </view>

    <!-- 白色内容框 -->
    <view class="body">
      <text class="title">{{ vo.event.title }}</text>
      <view class="chips">
        <view class="chip">
          <uni-icons type="location" size="14" :color="chipIconColor" />
          <!-- event.city 存的是英文（Beijing / HongKong），直接渲染会让中文用户看到英文地名 -->
          <text class="chip-text">{{ cityText || '—' }}</text>
        </view>
        <view class="chip">
          <uni-icons type="calendar" size="14" :color="chipIconColor" />
          <text class="chip-text">{{ dateText }}</text>
        </view>
        <view class="chip">
          <uni-icons type="staff" size="14" :color="chipIconColor" />
          <text class="chip-text">{{ formatGenre(vo.event.genre) }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { EventCardVO } from '@/types/subscription'
import { formatCity } from '@/constants/cities'
import { getArtistAvatarSrc } from '@/utils/avatar'

const props = withDefaults(defineProps<{
  vo: EventCardVO
  showBookmark?: boolean  // false 时隐藏按钮（无交互场景）
  subscribed?: boolean    // true=已订阅显示×退订，false=未订阅显示+订阅
}>(), {
  showBookmark: true,
  subscribed: true,
})
defineEmits<{
  (e: 'bookmark', vo: EventCardVO): void
  (e: 'tap', vo: EventCardVO): void
}>()

// 5 色调色板，跟后端 service.subscription.go cardPalette 对齐
const PALETTE: Record<string, { bg: string; chip: string; title: string; icon: string }> = {
  purple: { bg: '#D9C7F0', chip: '#C7AEEA', title: '#4B3070', icon: '#4B3070' },
  green:  { bg: '#C9EAC4', chip: '#B0DCA9', title: '#2D5C2E', icon: '#2D5C2E' },
  pink:   { bg: '#F4B6BD', chip: '#EFA0A8', title: '#7A2A36', icon: '#7A2A36' },
  blue:   { bg: '#BCD9F0', chip: '#A2C8E5', title: '#26517A', icon: '#26517A' },
  yellow: { bg: '#F5E3A8', chip: '#F0D78A', title: '#7A5A1B', icon: '#7A5A1B' },
}

const chipIconColor = computed(() => PALETTE[props.vo.theme_color]?.icon || '#333')

/**
 * 场次数：后端下发，不用 sessions.length
 * （订阅侧 sessions 是前端伪造的单场，后端只给首场城市）。
 */
const sessionCount = computed(() => {
  const n = props.vo.event.session_count
  if (typeof n === 'number' && n > 0) return n
  return 0
})

/** 多场次才显示徽标 */
const sessionBadgeText = computed(() =>
  sessionCount.value > 1 ? `共${sessionCount.value}场` : ''
)

/**
 * 巡演显示「城市·N城」（如「北京·23城」），只写「多城」丢了用户最关心的
 * 「我这边有没有」；单城显示城市名。
 * city 是后端下发的全量首城（最早那一场），不受列表筛选影响。
 */
const cityText = computed(() => {
  const cityCount = props.vo.event.city_count ?? 0
  const city = formatCity(props.vo.event.city)
  if (cityCount > 1) return city ? `${city}·${cityCount}城` : `${cityCount}城`
  return city
})

/**
 * 日期：用后端下发的真实场次日期跨度，
 * 不用 start_date/end_date（后者由后台回写，可能陈旧）。
 */
const dateText = computed(() => {
  const first = props.vo.event.first_event_date
  const last = props.vo.event.last_event_date
  if (!first) return formatDate(props.vo.event.start_date)
  const s = String(first).slice(0, 10)
  const e = last ? String(last).slice(0, 10) : ''
  if (!e || e === s) return s
  if (s.slice(0, 4) === e.slice(0, 4)) return `${s.slice(5)} ~ ${e.slice(5)}`
  return `${s} ~ ${e}`
})

function formatDate(d: string): string {
  if (!d) return '—'
  return d.replace(/-/g, '-').slice(0, 10) // YYYY-MM-DD
}

function formatGenre(g: string): string {
  if (!g) return '—'
  // 简单映射：保留原始大写（Fmt 跟设计稿文字一致）
  return g.toUpperCase()
}
</script>

<style scoped>
.card {
  border-radius: 24rpx;
  padding: 20rpx 20rpx 24rpx;
  margin-bottom: 24rpx;
  box-shadow: 0 6rpx 20rpx rgba(0, 0, 0, 0.04);
}
.card--purple { background: #D9C7F0; }
.card--green  { background: #C9EAC4; }
.card--pink   { background: #F4B6BD; }
.card--blue   { background: #BCD9F0; }
.card--yellow { background: #F5E3A8; }

.head {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 16rpx;
}
.head-left { display: flex; align-items: center; gap: 14rpx; }
.avatar-wrap { width: 60rpx; height: 60rpx; border-radius: 30rpx; overflow: hidden; }
.avatar { width: 100%; height: 100%; }
.artist-name {
  font-size: 26rpx; font-weight: 600; color: #fff;
  max-width: 320rpx;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.head-right { display: flex; align-items: center; gap: 14rpx; }

/* 场次徽标：多场次（巡演）才出现 */
.session-badge {
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.75);
  border-radius: 30rpx;
  padding: 4rpx 14rpx;
}
.session-badge-text { font-size: 20rpx; font-weight: 600; color: #333; }

.new-badge {
  background: #fff; border-radius: 30rpx;
  padding: 6rpx 18rpx;
}
.new-text { font-size: 20rpx; font-weight: 700; color: #2D5C2E; letter-spacing: 1rpx; }

.bookmark {
  width: 60rpx; height: 60rpx; border-radius: 30rpx;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.bookmark-icon-img { width: 100%; height: 100%; }

.body {
  background: #fff; border-radius: 18rpx;
  padding: 24rpx 26rpx 22rpx;
}
.title {
  display: block; font-size: 28rpx; font-weight: 600;
  color: rgba(35, 34, 39, 1); line-height: 1.4;
  margin-bottom: 18rpx;
}
.chips { display: flex; flex-wrap: wrap; gap: 12rpx; justify-content: center; }
.chip {
  display: inline-flex; align-items: center; gap: 6rpx;
  background: #f5f5f7; border-radius: 24rpx;
  padding: 8rpx 18rpx;
}
.chip-text { font-size: 22rpx; color: rgba(51, 51, 51, 1); }
</style>
