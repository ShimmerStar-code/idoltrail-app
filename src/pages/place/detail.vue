<template>
  <PageLayout>
    <view class="page">
      <!-- NavBar：自绘返回键。全局 globalStyle.app-plus.titleNView=false 关掉了原生
           导航栏，所以每个二级页都得自己画一个，否则进来就没有返回入口 -->
      <view class="navbar" :style="{ paddingTop: statusBarHeight + 'px' }">
        <view class="navbar-inner" :style="{ paddingRight: navRightPadding + 'px' }">
          <view class="nav-back" @tap="goBack">
            <uni-icons type="left" size="large" color="#333" />
            <text class="nav-back-label">场馆详情</text>
          </view>
        </view>
      </view>

      <view v-if="place">
        <!-- 场馆名称置顶，作为整页主标题；有坐标时可点开地图 -->
        <view
          class="place-hero"
          :hover-class="place.latitude ? 'place-hero-hover' : ''"
          :hover-stay-time="120"
          @tap="openMap"
        >
          <text class="place-name">{{ place.name }}</text>
          <text v-if="place.latitude" class="place-hero-loc">📍</text>
        </view>

        <!-- 场馆信息网格（按数据库实际字段动态渲染，缺则不显示该格） -->
        <view class="info-grid">
          <view v-if="placeTypeText" class="cell">
            <text class="cell-label">类型</text>
            <text class="cell-value">{{ placeTypeText }}</text>
          </view>
          <view v-if="place.city" class="cell">
            <text class="cell-label">城市</text>
            <text class="cell-value">{{ place.city }}</text>
          </view>

          <!-- Row 2: 国家（中文/地区） -->
          <view v-if="place.country" class="cell">
            <text class="cell-label">国家/地区</text>
            <text class="cell-value">{{ place.country }}</text>
          </view>

          <!-- 全宽：地址 -->
          <view v-if="place.address" class="cell cell-full">
            <text class="cell-label">地址</text>
            <text class="cell-value">{{ place.address }}</text>
          </view>

          <!-- 全宽：别名（按设计稿为单行文本，顿号分隔） -->
          <view v-if="aliasesText" class="cell cell-full">
            <text class="cell-label">别名</text>
            <text class="cell-value aliases-text">{{ aliasesText }}</text>
          </view>
        </view>

      <!-- 场馆活动 Section -->
        <view class="events-section">
          <view class="section-title-wrap">
            <text class="section-title">场馆活动</text>
          </view>

          <view v-if="loadingEvents" class="empty">加载中...</view>
          <view v-else-if="!events.length" class="empty">该场馆暂无活动</view>

          <view
            v-for="(ev, idx) in events"
            :key="ev.id"
            class="event-card"
            :class="idx % 2 === 0 ? 'card-orange' : 'card-green'"
            @tap="goEvent(ev.id)"
          >
            <view class="event-head">
              <view class="artist-info">
                <view class="avatar">
                  <text class="avatar-text">{{ firstChar(ev.artists[0]?.name) }}</text>
                </view>
                <text class="artist-name">{{ ev.artists[0]?.name || '—' }}</text>
              </view>
              <view class="event-actions">
                <view v-if="ev.is_new" class="new-badge">NEW</view>
                <view
                  class="bookmark"
                  :class="{ 'bookmark-on': isBookmarked(ev.id) }"
                  @tap.stop="toggleBookmark(ev.id)"
                >★</view>
              </view>
            </view>
            <view class="event-body">
              <text class="event-title">{{ ev.title }}</text>
              <view class="event-tags">
                <view class="tag">
                  <text class="tag-icon">📍</text>
                  <text>{{ ev.city || place.city || place.country || '—' }}</text>
                </view>
                <view class="tag">
                  <text class="tag-icon">📅</text>
                  <text>{{ ev.event_date || '—' }}</text>
                </view>
                <view class="tag">
                  <text class="tag-icon">🌐</text>
                  <text>{{ ev.format || formatType(ev.type) }}</text>
                </view>
              </view>
            </view>
          </view>
        </view>
      </view>
      <view v-else class="loading">加载中...</view>
    </view>
  </PageLayout>
</template>

<script setup lang="ts">
import PageLayout from '@/components/PageLayout/index.vue'
import { ref, computed } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { request } from '@/utils/request'
import { getNavBarMetrics } from '@/utils/system'
import { switchTabPage } from '@/utils/pages'
import type { Place, PlaceEvent } from '@/types/place'
// 按需内联，避免 api/place.js 被打入主包（place 页面属于分包）
const placeApi = {
  detail: (id: string) => request<Place>(`/places/${id}`, { method: 'GET' }),
  events: (id: string) => request<{ list: PlaceEvent[] }>(`/places/${id}/events`, { method: 'GET' }),
}

const place = ref<Place | null>(null)
const events = ref<PlaceEvent[]>([])
const loadingEvents = ref(true)

// 自绘导航栏尺寸：状态栏高度 + 右上角避让
const { statusBarHeight, navRightPadding } = getNavBarMetrics()

// 上一页：正常从活动详情 navigateTo 过来直接返回；
// 从推送通知冷启动进来时页面栈只有自己一页，回退会白屏，所以兜底回首页 tab。
function goBack() {
  if (getCurrentPages().length > 1) {
    uni.navigateBack()
  } else {
    switchTabPage('/pages/home/index')
  }
}

// place_type 枚举 → 中文显示（参考后端 place_type_ref）
const PLACE_TYPE_MAP: Record<string, string> = {
  Indoor: '室内场馆',
  Outdoor: '户外场馆',
  Livehouse: 'Livehouse',
  Club: '俱乐部',
  Park: '公园',
}
const placeTypeText = computed(() =>
  place.value ? PLACE_TYPE_MAP[place.value.type] || place.value.type : '')

// event_type 枚举 → 短缩写（卡片上"Fmt"位）
const EVENT_TYPE_SHORT: Record<string, string> = {
  Concert: 'Con',
  'Music_Festival': 'Fes',
  'Fan_Meeting': 'Fmt',
  'Anime_Expo': 'Expo',
  'Concert_Hall': 'CH',
}
function formatType(t: string) {
  return EVENT_TYPE_SHORT[t] || t
}

const aliasesText = computed(() => {
  if (!place.value?.aliases?.length) return ''
  return place.value.aliases.map((a) => a.name).join('、')
})

function firstChar(name?: string) {
  if (!name) return '?'
  // 中文取首字，英文取首字母
  return name.charAt(0).toUpperCase()
}

// 书签（本地 storage）
//
// 早前 isBookmarked() 直接在 v-for 里调 uni.getStorageSync：
// App 端同步 storage 是走原生桥的阻塞调用，比内存读慢两个数量级，
// 热门场馆几十上百条活动，每次重渲染就是上百次桥调用。
// 改为进页面一次性把键读成 Set，渲染时只做 O(1) 的 has()。
const bookmarkedIds = ref<Set<number>>(new Set())

function bookmarkKey(id: number) {
  return `fans:bookmark:event:${id}`
}
const BOOKMARK_KEY_RE = /^fans:bookmark:event:(\d+)$/

function loadBookmarks() {
  try {
    const { keys } = uni.getStorageInfoSync()
    const ids: number[] = []
    for (const k of keys) {
      const m = BOOKMARK_KEY_RE.exec(k)
      if (m) ids.push(Number(m[1]))
    }
    bookmarkedIds.value = new Set(ids)
  } catch {
    /* storage 不可用时按无书签处理 */
  }
}

function isBookmarked(id: number) {
  return bookmarkedIds.value.has(id)
}

function toggleBookmark(id: number) {
  const k = bookmarkKey(id)
  const on = bookmarkedIds.value.has(id)
  try {
    if (on) {
      uni.removeStorageSync(k)
    } else {
      uni.setStorageSync(k, true)
      uni.showToast({ title: '已收藏', icon: 'none' })
    }
  } catch {
    return
  }
  // 换成新 Set 引用，确保依赖 has() 的模板节点重新求值
  const next = new Set(bookmarkedIds.value)
  if (on) next.delete(id)
  else next.add(id)
  bookmarkedIds.value = next
}

function openMap() {
  if (!place.value?.latitude || !place.value?.longitude) return
  uni.openLocation({
    latitude: place.value.latitude,
    longitude: place.value.longitude,
    name: place.value.name,
    address: place.value.address,
    // 设备没装地图 App 时 openLocation 会 fail，静默失败会让人以为按钮坏了
    fail: () => {
      uni.showToast({ title: '未能打开地图，请稍后重试', icon: 'none' })
    },
  })
}

function goEvent(id: number) {
  uni.navigateTo({ url: `/pages/event/detail?id=${id}` })
}

onLoad(async (options) => {
  loadBookmarks()
  const id = options?.id
  if (!id || id === 'undefined') {
    uni.showToast({ title: '场馆ID缺失', icon: 'none' })
    return
  }

  try {
    place.value = await placeApi.detail(String(id))
    // 同步系统导航栏标题为场馆名
    uni.setNavigationBarTitle({ title: place.value.name })
  } catch (e: any) {
    uni.showToast({ title: e?.message || '场馆加载失败', icon: 'none' })
    return
  }

  try {
    const res = await placeApi.events(String(id))
    events.value = res.list || []
  } catch {
    events.value = []
  } finally {
    loadingEvents.value = false
  }
})
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: var(--bg-page, #F4F4F4);
  padding-bottom: 60rpx;
}

/* ── NavBar（全局 titleNView=false，原生导航栏不可用，只能自绘） ── */
.navbar {
  background: #fff;
  position: sticky;
  top: 0;
  z-index: 100;
}
.navbar-inner {
  display: flex;
  align-items: center;
  height: 88rpx;
  padding: 0 32rpx;
}
.nav-back {
  display: flex;
  align-items: center;
  gap: 4rpx;
}
.nav-back-label {
  font-size: 32rpx;
  color: #333;
  font-weight: 500;
}

/* ── 场馆名称（置顶主标题） ── */
.place-hero {
  display: flex;
  align-items: flex-start;
  gap: 12rpx;
  padding: 28rpx 24rpx 4rpx;
}
.place-name {
  flex: 1;
  font-size: 40rpx;
  font-weight: 700;
  color: #222;
  line-height: 1.35;
}
.place-hero-loc {
  font-size: 30rpx;
  line-height: 1.4;
}
.place-hero-hover {
  background: rgba(0, 0, 0, 0.04);
}

/* 信息网格 */
.info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20rpx;
  padding: 24rpx;
}
.cell {
  background: #fff;
  border-radius: 16rpx;
  padding: 24rpx;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  min-height: 110rpx;
  box-sizing: border-box;
}
.cell-full { grid-column: span 2; }
.cell-label {
  font-size: 22rpx;
  color: #aaa;
}
.cell-value {
  font-size: 28rpx;
  color: #222;
  line-height: 1.4;
  word-break: break-all;
}
.aliases-text { line-height: 1.6; }

/* 场馆活动 Section */
.events-section {
  padding: 0 24rpx;
  margin-top: 16rpx;
}
.section-title-wrap {
  margin: 16rpx 0 24rpx;
}
.section-title {
  display: inline-block;
  font-size: 30rpx;
  font-weight: 700;
  color: #222;
  background: #FFE08A;
  padding: 6rpx 16rpx;
  border-radius: 8rpx;
}

.empty {
  text-align: center;
  color: #aaa;
  padding: 60rpx 0;
  font-size: 26rpx;
}

/* 活动卡片 */
.event-card {
  border-radius: 20rpx;
  padding: 24rpx;
  margin-bottom: 20rpx;
  box-shadow: 0 2rpx 8rpx rgba(0,0,0,0.04);
}
.card-orange { background: #FFD9C4; }
.card-green  { background: #D5E8B5; }

.event-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16rpx;
}
.artist-info {
  display: flex;
  align-items: center;
  gap: 16rpx;
}
.avatar {
  width: 56rpx;
  height: 56rpx;
  border-radius: 50%;
  background: rgba(255,255,255,0.7);
  display: flex;
  align-items: center;
  justify-content: center;
}
.avatar-text {
  font-size: 28rpx;
  font-weight: 700;
  color: #444;
}
.artist-name {
  font-size: 26rpx;
  color: #222;
  font-weight: 500;
}
.event-actions {
  display: flex;
  align-items: center;
  gap: 12rpx;
}
.new-badge {
  background: #fff;
  color: #FF6B6B;
  font-size: 20rpx;
  font-weight: 700;
  padding: 4rpx 12rpx;
  border-radius: 20rpx;
  border: 1rpx solid #FF6B6B;
}
.bookmark {
  width: 48rpx;
  height: 48rpx;
  background: #fff;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28rpx;
  color: #ccc;
}
.bookmark-on { color: #FFB800; }

.event-body {
  background: rgba(255,255,255,0.85);
  border-radius: 16rpx;
  padding: 20rpx 24rpx;
}
.event-title {
  display: block;
  font-size: 30rpx;
  font-weight: 600;
  color: #222;
  line-height: 1.4;
  margin-bottom: 16rpx;
}
.event-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}
.tag {
  display: flex;
  align-items: center;
  gap: 6rpx;
  background: rgba(255,255,255,0.9);
  padding: 6rpx 16rpx;
  border-radius: 20rpx;
  font-size: 24rpx;
  color: #555;
}
.tag-icon { font-size: 22rpx; }

.loading {
  text-align: center;
  padding: 100rpx;
  color: #aaa;
  font-size: 26rpx;
}
</style>
