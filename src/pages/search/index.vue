<template>
  <PageLayout>
    <view class="page">
      <view class="search-bar">
        <input v-model="keyword" placeholder="搜索艺术家、活动、场馆..." @confirm="onSearch" confirm-type="search" />
      </view>
      <view class="tabs">
        <text v-for="tab in tabs" :key="tab.value" :class="['tab', { active: activeTab === tab.value }]" @click="switchTab(tab.value)">
          {{ tab.label }}
        </text>
      </view>
      <view v-if="store.loading" class="loading-list">
        <SearchResultSkeleton v-for="i in 6" :key="`sk-${i}`" />
      </view>
      <view v-else>
        <view v-for="hit in currentList" :key="hit.id" class="card" @click="toDetail(hit)">
          <text class="name">{{ hit.name || hit.title || hit.artist_name }}</text>
          <text class="sub">{{ hit.type || '' }} {{ hit.country || '' }}</text>
        </view>
        <view v-if="keyword && !currentList.length" class="empty">无搜索结果</view>
      </view>
    </view>
  </PageLayout>
</template>

<script setup lang="ts">
import PageLayout from '@/components/PageLayout/index.vue'
import { ref, computed } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { useSearchStore } from '@/stores/search'
import SearchResultSkeleton from '@/components/SearchResultSkeleton.vue'
const store = useSearchStore()
const keyword = ref('')
const activeTab = ref<'artists' | 'events' | 'places'>('artists')

const tabs = [
  { label: '艺术家', value: 'artists' as const },
  { label: '活动', value: 'events' as const },
  { label: '场馆', value: 'places' as const },
]

const currentList = computed(() => {
  if (activeTab.value === 'artists') return store.artists
  if (activeTab.value === 'events') return store.events
  return store.places
})

onLoad((options) => {
  if (options?.q) {
    keyword.value = options.q
    if (options.type && ['artists', 'events', 'places'].includes(options.type)) {
      activeTab.value = options.type as typeof activeTab.value
    }
    onSearch()
    return
  }
  // 订阅页 + 号跳转：不带 q 时按 tab 参数切到指定 tab（artists/events/places → 单数也兼容）
  if (options?.tab) {
    const map: Record<string, typeof activeTab.value> = {
      artist: 'artists',
      artists: 'artists',
      event: 'events',
      events: 'events',
      place: 'places',
      places: 'places',
    }
    const t = map[options.tab as string]
    if (t) activeTab.value = t
  }
})

function switchTab(tab: typeof activeTab.value) {
  activeTab.value = tab
}

function onSearch() {
  if (!keyword.value.trim()) return
  store.searchAll(keyword.value)
}

function toDetail(hit: any) {
  if (activeTab.value === 'artists') {
    uni.navigateTo({ url: `/pages/artist/detail?id=${hit.id}` })
  } else if (activeTab.value === 'events') {
    uni.navigateTo({ url: `/pages/event/detail?id=${hit.id}` })
  } else {
    uni.navigateTo({ url: `/pages/place/detail?id=${hit.id}` })
  }
}
</script>

<style scoped>
.page { padding: 20rpx; }
.search-bar input { background: #f5f5f5; padding: 16rpx 20rpx; border-radius: 8rpx; width: 100%; }
.tabs { display: flex; margin: 20rpx 0; border-bottom: 1rpx solid #eee; }
.tab { flex: 1; text-align: center; padding: 16rpx; font-size: 26rpx; color: #666; }
.tab.active { color: #007AFF; border-bottom: 4rpx solid #007AFF; font-weight: bold; }
.card { background: #fff; border-radius: 12rpx; padding: 20rpx; margin-bottom: 16rpx; }
.name { font-size: 28rpx; font-weight: bold; display: block; }
.sub { font-size: 24rpx; color: #888; display: block; margin-top: 8rpx; }
.loading, .empty { text-align: center; color: #aaa; padding: 80rpx; }
</style>
