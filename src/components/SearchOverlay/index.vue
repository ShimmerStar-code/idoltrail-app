<template>
  <view v-if="keyword" class="results">
    <view v-if="store.loading" class="center"><text class="tip">搜索中...</text></view>
    <view v-else-if="!hasResults" class="center">
      <text class="tip">{{ artistOnly ? '暂无匹配偶像，试试其他名字' : '暂无结果' }}</text>
    </view>
    <template v-else>
      <view v-if="store.artists.length" class="group">
        <view class="group-header">
          <view class="dot" />
          <text class="group-title">
            {{ artistOnly ? `匹配 ${store.artistTotal || store.artists.length} 位偶像` : '偶像' }}
          </text>
          <text v-if="artistOnly" class="group-hint">点击卡片查看详情</text>
        </view>
        <view
          v-for="item in store.artists"
          :key="item.id"
          :class="artistOnly ? 'artist-row' : 'row'"
          @click="toArtist(item.id)"
        >
          <template v-if="artistOnly">
            <image
              class="artist-avatar"
              :src="getArtistAvatar(item)"
              mode="aspectFill"
              lazy-load
              @error="onAvatarError(item)"
            />
            <view class="artist-main">
              <view class="row-name artist-name">
                <highlight-text :text="artistDisplayName(item)" :keyword="keyword" />
              </view>
              <view class="row-tags artist-tags">
                <text v-if="item.type" class="tag">{{ artistTypeLabel(item.type) }}</text>
                <text v-if="item.gender" class="tag">{{ artistGenderLabel(item.gender) }}</text>
                <text v-if="item.country" class="tag">{{ artistRegionLabel(item.country) }}</text>
              </view>
            </view>
            <view
              class="subscribe-btn"
              :class="{ 'subscribe-btn--active': subscribeStore.isArtistSubscribed(item.id) }"
              @click.stop="emit('subscribe', item.id)"
            >
              <text class="subscribe-text">
                {{ subscribeStore.isArtistSubscribed(item.id) ? '已订阅' : '+ 订阅' }}
              </text>
            </view>
          </template>
          <template v-else>
            <view class="row-name">
              <highlight-text :text="artistDisplayName(item)" :keyword="keyword" />
            </view>
            <view class="row-tags">
              <text v-if="item.type" class="tag">{{ artistTypeLabel(item.type) }}</text>
              <text v-if="item.gender" class="tag">{{ artistGenderLabel(item.gender) }}</text>
              <text v-if="item.country" class="tag">{{ item.country }}</text>
            </view>
          </template>
        </view>
        <view
          v-if="artistOnly && store.artistTotal > store.artists.length"
          class="more-tip"
        >
          已优先展示最相关的 {{ store.artists.length }} 位，输入更完整的名字可缩小范围
        </view>
      </view>

      <view v-if="!artistOnly && store.events.length" class="group">
        <view class="group-header">
          <view class="dot" />
          <text class="group-title">演出</text>
        </view>
        <view v-for="item in store.events" :key="item.id" class="row" @click="toEvent(item.id)">
          <view class="row-name">
            <highlight-text :text="item.title" :keyword="keyword" />
          </view>
          <view class="row-tags">
            <!-- sessions[].city 来自 event_sessions.city，存的是英文地名，需转中文展示 -->
            <text v-if="item.sessions?.[0]?.city" class="tag">{{ formatCity(item.sessions[0].city) }}</text>
            <text v-if="item.sessions?.[0]?.times?.[0]?.event_date" class="tag">{{ formatDate(item.sessions[0].times[0].event_date) }}</text>
          </view>
        </view>
      </view>

      <view v-if="!artistOnly && store.places.length" class="group">
        <view class="group-header">
          <view class="dot" />
          <text class="group-title">场馆</text>
        </view>
        <view v-for="item in store.places" :key="item.id" class="row" @click="toPlace(item.id)">
          <view class="row-name">
            <highlight-text :text="item.name" :keyword="keyword" />
          </view>
          <view class="row-tags">
            <text v-if="item.country" class="tag">{{ item.country }}</text>
            <text v-if="item.city" class="tag">{{ item.city }}</text>
          </view>
        </view>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue'
import { useSearchStore } from '@/stores/search'
import { useSubscribeStore } from '@/stores/subscribe'
import { formatCity } from '@/constants/cities'
import { artistGenderLabel, artistTypeLabel } from '@/constants/artistLabels'
import { artistRegionLabel } from '@/constants/artistCountries'
import { getArtistAvatarSrc } from '@/utils/avatar'
import { track } from '@/utils/analytics'
import { ANALYTICS_EVENTS } from '@/constants/analytics'
import type { ArtistSearchHit } from '@/types/search'
import HighlightText from './HighlightText.vue'

const props = withDefaults(defineProps<{ keyword: string; artistOnly?: boolean }>(), {
  artistOnly: false,
})
const emit = defineEmits<{
  (e: 'navigate'): void
  (e: 'subscribe', id: string): void
}>()

// 搜索由父组件统一防抖触发，这里只负责展示结果与转发订阅操作
const store = useSearchStore()
const subscribeStore = useSubscribeStore()
const hasResults = computed(() =>
  props.artistOnly
    ? store.artists.length > 0
    : store.artists.length > 0 || store.events.length > 0 || store.places.length > 0,
)

const failedAvatarIds = reactive(new Set<string>())
function artistDisplayName(item: ArtistSearchHit): string {
  return item.artist_name || item.name || ''
}
function getArtistAvatar(item: ArtistSearchHit): string {
  if (failedAvatarIds.has(item.id)) {
    return getArtistAvatarSrc({ type: item.type, gender: item.gender })
  }
  return getArtistAvatarSrc(item)
}
function onAvatarError(item: ArtistSearchHit) {
  failedAvatarIds.add(item.id)
}

function formatDate(d: string) {
  return d ? d.slice(0, 10).replace(/-/g, '.') : ''
}

function toArtist(id: string) {
  track(ANALYTICS_EVENTS.SEARCH_RESULT_CLICK, { type: 'artist', id })
  uni.navigateTo({ url: `/pages/artist/detail?id=${id}` }); emit('navigate')
}
function toEvent(id: number) {
  track(ANALYTICS_EVENTS.SEARCH_RESULT_CLICK, { type: 'event', id })
  uni.navigateTo({ url: `/pages/event/detail?id=${id}&source=search` }); emit('navigate')
}
function toPlace(id: string) {
  track(ANALYTICS_EVENTS.SEARCH_RESULT_CLICK, { type: 'place', id })
  uni.navigateTo({ url: `/pages/place/detail?id=${id}` }); emit('navigate')
}
</script>

<style scoped>
.results {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.center {
  text-align: center;
  padding: 20% 0;
}
.tip { font-size: 28rpx; color: #999; }

.group {
  background: #fff;
  border-radius: 24rpx;
  padding: 24rpx 28rpx;
}
.group-header {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-bottom: 20rpx;
}
.dot { width: 16rpx; height: 16rpx; border-radius: 50%; background: rgba(254,165,0,1); }
.group-title { font-size: 28rpx; font-weight: 600; color: #111; }
.group-hint { margin-left: auto; font-size: 22rpx; color: #999; }

.row,
.artist-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18rpx 0;
  border-top: 1rpx solid #f5f5f5;
}
.row-name { flex: 1; font-size: 28rpx; color: #111; }
.row-tags { display: flex; gap: 10rpx; flex-shrink: 0; }
.tag {
  font-size: 22rpx;
  color: #666;
  background: #f5f5f5;
  border-radius: 10rpx;
  padding: 6rpx 14rpx;
}

.artist-row { padding: 20rpx 0; }
.artist-avatar {
  width: 88rpx;
  height: 88rpx;
  border-radius: 50%;
  flex-shrink: 0;
  background: #f5f5f5;
}
.artist-main {
  flex: 1;
  min-width: 0;
  margin: 0 20rpx;
}
.artist-name { flex: none; }
.artist-tags {
  flex-wrap: wrap;
  margin-top: 10rpx;
}
.subscribe-btn {
  flex-shrink: 0;
  min-width: 88rpx;
  padding: 12rpx 20rpx;
  border-radius: 30rpx;
  text-align: center;
  background: linear-gradient(0deg, rgba(255, 190, 0, 1) 0%, rgba(254, 165, 0, 1) 100%);
}
.subscribe-btn--active {
  background: linear-gradient(0deg, rgba(255, 196, 205, 1) 0%, rgba(255, 143, 160, 1) 100%);
}
.subscribe-text {
  font-size: 22rpx;
  font-weight: 600;
  color: #fff;
  white-space: nowrap;
}
.more-tip {
  padding: 20rpx 0 4rpx;
  border-top: 1rpx solid #f5f5f5;
  font-size: 22rpx;
  line-height: 1.6;
  color: #999;
}
</style>
