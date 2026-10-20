<template>
  <view v-if="keyword" class="results">
    <view v-if="store.loading" class="center"><text class="tip">搜索中...</text></view>
    <view v-else-if="!store.artists.length && !store.events.length && !store.places.length" class="center">
      <text class="tip">暂无结果</text>
    </view>
    <template v-else>
      <view v-if="store.artists.length" class="group">
        <view class="group-header">
          <view class="dot" />
          <text class="group-title">偶像</text>
        </view>
        <view v-for="item in store.artists" :key="item.id" class="row" @click="toArtist(item.id)">
          <view class="row-name">
            <highlight-text :text="item.artist_name || item.name" :keyword="keyword" />
          </view>
          <view class="row-tags">
            <text v-if="item.type" class="tag">{{ artistTypeLabel(item.type) }}</text>
            <text v-if="item.gender" class="tag">{{ artistGenderLabel(item.gender) }}</text>
            <text v-if="item.country" class="tag">{{ item.country }}</text>
          </view>
        </view>
      </view>

      <view v-if="store.events.length" class="group">
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

      <view v-if="store.places.length" class="group">
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
import { useSearchStore } from '@/stores/search'
import { formatCity } from '@/constants/cities'
import { artistGenderLabel, artistTypeLabel } from '@/constants/artistLabels'
import HighlightText from './HighlightText.vue'

// 模板里直接用 keyword 即可（<script setup> 会把 props 暴露给模板），
// 不需要 const props = 兜一层
defineProps<{ keyword: string }>()
const emit = defineEmits<{ (e: 'navigate'): void }>()

// 搜索由父组件（home/index.vue）统一防抖触发，这里只负责展示结果
const store = useSearchStore()

function formatDate(d: string) {
  return d ? d.slice(0, 10).replace(/-/g, '.') : ''
}

function toArtist(id: string) { uni.navigateTo({ url: `/pages/artist/detail?id=${id}` }); emit('navigate') }
function toEvent(id: number)  { uni.navigateTo({ url: `/pages/event/detail?id=${id}` }); emit('navigate') }
function toPlace(id: string)  { uni.navigateTo({ url: `/pages/place/detail?id=${id}` }); emit('navigate') }
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

.row {
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
</style>
