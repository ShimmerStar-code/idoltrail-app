<template>
  <PageLayout>
    <view class="page">
      <!-- 顶部搜索栏 -->
      <view class="header" :style="{ paddingTop: statusBarHeight + 'px' }">
        <view
          class="search-bar"
          :class="{ 'search-bar--active': searchActive }"
        >
          <uni-icons type="search" size="16" color="#999" />
          <input
            class="search-input"
            v-model="searchKeyword"
            placeholder="搜索您喜欢的艺人"
            placeholder-class="search-placeholder-cls"
            :focus="searchActive"
            @focus="searchActive = true"
            @input="onSearchInput"
            confirm-type="search"
          />
          <text v-if="searchActive" class="search-close" @click="closeSearch">✕</text>
        </view>
      </view>

      <scroll-view
        scroll-y
        :show-scrollbar="false"
        class="scroll-body"
        :style="{ paddingBottom: tabBarHeight + 'px' }"
        @scrolltolower="onScrollBottom"
      >
        <!-- 骨架屏：首屏加载中 -->
        <template v-if="store.groupedLoading">
          <view v-for="g in 3" :key="'sk-g-' + g" class="group">
            <view class="group-header">
              <view class="sk sk-title" />
              <view class="sk sk-all" />
            </view>
            <scroll-view scroll-x enhanced :show-scrollbar="false" class="artists-scroll">
              <view class="artists-row">
                <view v-for="i in 5" :key="'sk-a-' + i" class="artist-col">
                  <view class="sk sk-avatar" />
                  <view class="sk sk-name" />
                  <view class="sk sk-btn" />
                </view>
              </view>
            </scroll-view>
          </view>
        </template>

        <!-- 已知国家分组（首屏）-->
        <template v-else>
          <view
            v-for="group in groupedArtists"
            :key="group.country"
            class="group"
          >
            <view class="group-header">
              <text class="group-title">{{ group.country }}</text>
              <text class="group-all" @click="viewAll(group.code)">查看所有</text>
            </view>
            <scroll-view scroll-x enhanced :show-scrollbar="false" class="artists-scroll">
              <view class="artists-row">
                <view
                  v-for="item in group.items"
                  :key="item.id"
                  class="artist-col"
                  @click="toDetail(item.id)"
                >
                  <view class="avatar-wrap">
                    <image
                      class="avatar"
                      :src="getArtistAvatar(item)"
                      mode="aspectFill"
                      lazy-load
                      @error="onAvatarError(item)"
                    />
                  </view>
                  <text class="artist-name">{{ item.name }}</text>
                  <view
                    class="subscribe-btn"
                    :class="{ 'subscribe-btn--active': subscribeStore.isArtistSubscribed(item.id) }"
                    @click.stop="toggleSubscribe(item.id)"
                  >
                    <text class="subscribe-text">
                      {{ subscribeStore.isArtistSubscribed(item.id) ? '退订' : '订阅' }}
                    </text>
                  </view>
                </view>
              </view>
            </scroll-view>
          </view>

          <!-- 其他地区：已加载 -->
          <template v-if="store.otherLoaded">
            <view
              v-for="group in otherGroupedArtists"
              :key="group.country"
              class="group"
            >
              <view class="group-header">
                <text class="group-title">{{ group.country }}</text>
                <text class="group-all" @click="viewAll(group.code)">查看所有</text>
              </view>
              <scroll-view scroll-x enhanced :show-scrollbar="false" class="artists-scroll">
                <view class="artists-row">
                  <view
                    v-for="item in group.items"
                    :key="item.id"
                    class="artist-col"
                    @click="toDetail(item.id)"
                  >
                    <view class="avatar-wrap">
                      <image
                        class="avatar"
                        :src="getArtistAvatar(item)"
                        mode="aspectFill"
                        lazy-load
                        @error="onAvatarError(item)"
                      />
                    </view>
                    <text class="artist-name">{{ item.name }}</text>
                    <view
                      class="subscribe-btn"
                      :class="{ 'subscribe-btn--active': subscribeStore.isArtistSubscribed(item.id) }"
                      @click.stop="toggleSubscribe(item.id)"
                    >
                      <text class="subscribe-text">
                        {{ subscribeStore.isArtistSubscribed(item.id) ? '退订' : '订阅' }}
                      </text>
                    </view>
                  </view>
                </view>
              </scroll-view>
            </view>
          </template>

          <!-- 其他地区：加载中骨架 -->
          <template v-else-if="store.otherLoading">
            <view v-for="g in 2" :key="'sk-other-' + g" class="group">
              <view class="group-header">
                <view class="sk sk-title" />
                <view class="sk sk-all" />
              </view>
              <scroll-view scroll-x enhanced :show-scrollbar="false" class="artists-scroll">
                <view class="artists-row">
                  <view v-for="i in 5" :key="'sk-oa-' + i" class="artist-col">
                    <view class="sk sk-avatar" />
                    <view class="sk sk-name" />
                    <view class="sk sk-btn" />
                  </view>
                </view>
              </scroll-view>
            </view>
          </template>

          <!-- 其他地区：提示入口（未加载且未触发滚动时） -->
          <view
            v-else
            class="load-more-hint"
            @click="store.fetchOther()"
          >
            <text class="load-more-text">↓ 继续滑动查看其他地区</text>
          </view>

          <view v-if="store.groupedList.length === 0" class="empty">暂无艺术家</view>
        </template>
      </scroll-view>

      <!-- 搜索遮盖层：暗色全屏背景（header 的 z-index:100 会浮在它上方） -->
      <view
        v-if="searchKeyword"
        class="search-backdrop"
        @click="closeSearch"
        @touchmove.stop.prevent
      />
      <!-- 搜索结果：紧贴搜索框底部，可上下滚动 -->
      <scroll-view
        v-if="searchKeyword"
        scroll-y
        class="search-mask"
        :style="{ top: headerBottom + 'px' }"
        @touchmove.stop
      >
        <SearchOverlay :keyword="searchKeyword" @navigate="closeSearch" />
      </scroll-view>

      <TabBar :current="1" />
    </view>
  </PageLayout>
</template>

<script setup lang="ts">
import PageLayout from "@/components/PageLayout/index.vue";
import SearchOverlay from "@/components/SearchOverlay/index.vue";
import TabBar from "@/components/TabBar/index.vue";
import { getArtistAvatarSrc } from "@/utils/avatar";
import { useArtistStore } from "@/stores/artist";
import { useSearchStore } from "@/stores/search";
import { useSubscribeStore } from "@/stores/subscribe";
import { useUserStore } from "@/stores/user";
import { useNotificationStore } from "@/stores/notification";
import { syncPushToken } from "@/composables/usePush";
import { getStatusBarHeight } from "@/utils/system";
import { computed, onMounted, reactive, ref, watch } from "vue";
import { onShow, onReachBottom, onHide, onUnload } from "@dcloudio/uni-app";
const store = useArtistStore();
const userStore = useUserStore();
const subscribeStore = useSubscribeStore();
const searchStore = useSearchStore();
const statusBarHeight = ref(20);
const tabBarHeight = ref(80);

// 加载失败的头像 id 集合，失败后降级为 type/gender 默认头像
const failedAvatarIds = reactive(new Set<string>());
function getArtistAvatar(item: { id: string; avatar_url?: string; type?: string; gender?: string }) {
  if (failedAvatarIds.has(item.id)) return getArtistAvatarSrc({ type: item.type, gender: item.gender });
  return getArtistAvatarSrc(item);
}
function onAvatarError(item: { id: string }) {
  failedAvatarIds.add(item.id);
}
const searchActive = ref(false);
const searchKeyword = ref("");
const headerBottom = ref(0);
let searchTimer: ReturnType<typeof setTimeout> | null = null;
let headerMeasureTimer: ReturnType<typeof setTimeout> | null = null;

function onSearchInput() {
  if (searchTimer) clearTimeout(searchTimer);
  const kw = searchKeyword.value.trim();
  if (!kw) { searchStore.clear(); return; }
  searchTimer = setTimeout(() => {
    searchTimer = null;
    searchStore.searchAll(kw);
  }, 500);
}

function clearListTimers() {
  if (searchTimer) {
    clearTimeout(searchTimer);
    searchTimer = null;
  }
  if (headerMeasureTimer) {
    clearTimeout(headerMeasureTimer);
    headerMeasureTimer = null;
  }
}

function closeSearch() {
  searchActive.value = false;
  searchKeyword.value = "";
  searchStore.clear();
}

// 搜索激活时测量搜索框真实底部位置，与 home/index.vue 保持一致
watch(searchActive, (val) => {
  if (!val) return;
  // 句柄必须留存：tab 切走时这条 0ms 定时器仍可能触发，
  // 对已离开的页面做一次无意义的 selectorQuery
  if (headerMeasureTimer) clearTimeout(headerMeasureTimer);
  headerMeasureTimer = setTimeout(() => {
    headerMeasureTimer = null;
    uni
      .createSelectorQuery()
      .select('.search-bar')
      .boundingClientRect((res: any) => {
        if (res?.bottom) headerBottom.value = res.bottom;
      })
      .exec();
  }, 0);
});

onMounted(() => {
  statusBarHeight.value = getStatusBarHeight();

  // 首次挂载：强制拉取已知国家（force=true），显示骨架屏等待首屏数据
  const tasks: Promise<unknown>[] = [store.fetchGrouped(9, true)];
  if (userStore.isLoggedIn) {
    tasks.push(subscribeStore.fetchMySubscribedIds());
  }
  Promise.all(tasks);
});

// 每次回到 tab：2 分钟内有数据则静默跳过，不触发骨架屏
onShow(() => {
  store.fetchGrouped();
});

// tab 切走 / 页面卸载：停掉搜索防抖与测量定时器，避免在后台继续发请求
onHide(() => {
  clearListTimers();
});

onUnload(() => {
  clearListTimers();
});

/** 页面滚动到底部 → 触发其他地区懒加载 */
onReachBottom(() => {
  // ⚠️ 这里原来判的是 store.groupedLoading（"已知国家分组"的 loading），
  // 与"其他地区"完全无关：首屏加载中会误跳过触发，已知国家加载完后又拦错了语义。
  // store.fetchOther 内部已有 otherLoading 幂等守卫，页面层只需在已加载完毕时不再重复触发。
  if (!store.otherLoaded) {
    store.fetchOther();
  }
});

/** 滚动到底部 → 触发其他地区懒加载 */
function onScrollBottom() {
  if (!store.otherLoaded) {
    store.fetchOther();
  }
}

const COUNTRY_LABELS: Record<string, string> = {
  JP: "日本", KR: "韩国", CN: "中国", US: "欧美",
  TW: "台湾", HK: "香港", SG: "新马泰", MY: "新马泰", TH: "新马泰",
};

function buildGroups(artists: typeof store.groupedList) {
  const map = new Map<string, { code: string; items: typeof store.groupedList }>();
  for (const a of artists) {
    const label = COUNTRY_LABELS[a.country] || a.country || "其他";
    if (!map.has(label)) map.set(label, { code: a.country, items: [] });
    map.get(label)!.items.push(a);
  }
  return Array.from(map.entries()).map(([country, { code, items }]) => ({ country, code, items }));
}

const groupedArtists      = computed(() => buildGroups(store.groupedList));
const otherGroupedArtists = computed(() => buildGroups(store.otherList));

/**
 * App 端订阅：系统推送是长期订阅，没有"授权一次消耗一次"的配额语义，
 * 首次订阅成功后确保本机已拿到系统通知权限并上报 cid 即可。
 */
async function ensurePushReady() {
  const granted = await useNotificationStore().requestSystemNotifyPermission()
  if (!granted) {
    uni.showToast({ title: "已订阅，请到系统设置中允许通知", icon: "none", duration: 2500 });
    return;
  }
  await syncPushToken();
}

function toggleSubscribe(id: string) {
  userStore.requireLogin({
    dismissible: true,
    reason: "artist_subscribe",
    onSuccess: async () => {
      try {
        const nowSubscribed = await subscribeStore.toggleArtist(id);
        if (nowSubscribed) {
          await ensurePushReady();
        }
        uni.showToast({ title: nowSubscribed ? "已订阅" : "已退订", icon: "success" });
      } catch (e: any) {
        uni.showToast({ title: e?.message || "订阅失败", icon: "none" });
      }
    },
  });
}

function toDetail(id: string) {
  uni.navigateTo({ url: `/pages/artist/detail?id=${id}` });
}
function viewAll(country: string) {
  uni.navigateTo({ url: `/pages/artist/by-country?country=${country}` });
}
</script>

<style scoped>
.page {
  background: #fff;
  min-height: 100vh;
}

.header {
  position: relative;
  z-index: 100;
  padding-left: 30rpx;
  padding-right: 30rpx;
  padding-bottom: 20rpx;
}
.search-bar {
  background: #fff;
  border-radius: 30rpx;
  border: 1rpx solid rgba(236, 236, 236, 1);
  box-shadow: 0 10rpx 30rpx 0 rgba(0, 0, 0, 0.05);
  display: flex;
  align-items: center;
  gap: 10rpx;
  padding: 22rpx 30rpx;
}
.search-bar--active {
  border-color: rgba(254, 165, 0, 1);
}
.search-input {
  flex: 1;
  font-size: 26rpx;
  color: #111;
  background: transparent;
}
.search-placeholder-cls {
  color: rgba(153, 153, 153, 1);
}
.search-close {
  font-size: 30rpx;
  color: #999;
  padding: 0 8rpx;
  flex-shrink: 0;
}
/* 全屏暗色遮罩 */
.search-backdrop {
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  background: rgba(50, 50, 50, 0.88);
  z-index: 98;
}
/* 搜索结果滚动容器 */
.search-mask {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 99;
  padding: 20rpx 30rpx 30rpx;
  box-sizing: border-box;
}

.scroll-body {
  flex: 1;
}

.group {
  padding: 40rpx 0;
}
.group-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 20rpx;
  padding: 0 30rpx;
}
.group-title {
  font-size: 34rpx;
  font-weight: 600;
  color: rgba(35, 34, 39, 1);
}
.group-all {
  font-size: 26rpx;
  color: rgba(35, 34, 39, 1);
}

.artists-scroll {
  white-space: nowrap;
}
.artists-row {
  display: flex;
  gap: 0;
}
.artist-col {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  width: 15%;
  margin: 0 15rpx;
  flex-shrink: 0;
}
.avatar-wrap {
  width: 130rpx;
  height: 130rpx;
  border-radius: 65rpx;
  overflow: hidden;
  background: #f5f5f5;
}
.avatar {
  width: 100%;
  height: 100%;
}
.artist-name {
  font-size: 26rpx;
  color: rgba(51, 51, 51, 1);
  margin: 10rpx 12rpx 0;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 130rpx;
}
.subscribe-btn {
  margin-top: 10rpx;
  border-radius: 30rpx;
  padding: 10rpx 32rpx;
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

/* 其他地区入口提示 */
.load-more-hint {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 40rpx 0 60rpx;
}
.load-more-text {
  font-size: 26rpx;
  color: #bbb;
}

.empty {
  text-align: center;
  color: #aaa;
  padding: 80rpx;
}

/* ───────── 骨架屏 ───────── */
@keyframes sk-shimmer {
  0%   { background-position: -600rpx 0; }
  100% { background-position:  600rpx 0; }
}
.sk {
  background: linear-gradient(90deg, #f0f0f0 25%, #e6e6e6 50%, #f0f0f0 75%);
  background-size: 600rpx 100%;
  animation: sk-shimmer 1.4s ease-in-out infinite;
  border-radius: 8rpx;
}
.sk-avatar {
  width: 130rpx;
  height: 130rpx;
  border-radius: 65rpx;
  flex-shrink: 0;
}
.sk-title {
  width: 100rpx;
  height: 34rpx;
}
.sk-all {
  width: 80rpx;
  height: 26rpx;
}
.sk-name {
  width: 90rpx;
  height: 24rpx;
  margin-top: 10rpx;
  max-width: 130rpx;
}
.sk-btn {
  width: 80rpx;
  height: 44rpx;
  border-radius: 30rpx;
  margin-top: 10rpx;
}
</style>
