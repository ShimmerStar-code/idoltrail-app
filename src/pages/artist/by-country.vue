<!--
  pages/artist/by-country  按地区(国家)展示全部偶像的网格列表页(非 tabBar)
  ─────────────────────────────────────────────
  入口:
    pages/artist/list.vue 的"查看所有"   /pages/artist/by-country?country=JP

  布局(自上而下):
    1. 自定义导航(返回 + 标题 + 右侧添加好友占位图标)
    2. 两个排序胶囊(活动量排序 / 订阅量排序),单击切换字段,再点切换 asc/desc
    3. 网格(每行 5 列),每个 cell: 头像 + 名字 + (N场) + 订阅按钮
    4. 空态 + 上拉加载更多 + 下拉刷新

  注意:
    - 这是非 tabBar 页面,不带 TabBar,直接 uni.navigateTo 进入。
    - 复用 artist/list.vue 的配色与 .artist-col 卡片样式,但布局从横向滚动改为 5 列网格。
-->
<template>
  <PageLayout>
    <view class="page" :style="{ paddingTop: statusBarHeight + 'px' }">
      <!-- 自定义导航栏 -->
      <view class="nav" :style="{ paddingRight: navRightPadding + 'px' }">
        <view class="nav-back" @click="goBack">
          <uni-icons type="left" size="large" color="#111" />
        </view>
        <text class="nav-title">{{ title }}</text>
        <view class="nav-add">
          <uni-icons type="addpeople" size="22" color="#111" />
        </view>
      </view>

      <!-- 排序胶囊 -->
      <view class="sort-bar">
        <view
          v-for="opt in sortOptions"
          :key="opt.value"
          class="sort-pill"
          :class="{ 'sort-pill--active': sort === opt.value }"
          @click="onSortClick(opt.value)"
        >
          <text class="sort-label">{{ opt.label }}</text>
          <image
            class="sort-arrow-icon"
            :class="{
              'sort-arrow-icon--up': sort === opt.value && order === 'asc',
            }"
            src="/static/icons/sort.svg"
          />
        </view>
      </view>

      <!-- 网格主体 -->
      <view class="grid-body">
        <view v-if="loading && list.length === 0" class="grid">
          <view
            v-for="i in 10"
            :key="`sk-${i}`"
            class="artist-col artist-col--skel"
          >
            <view class="avatar avatar--skel" />
            <view class="skel-line skel-line--sm" />
            <view class="skel-line skel-line--xs" />
            <view class="skel-btn" />
          </view>
        </view>
        <view v-else class="grid">
          <view
            v-for="item in list"
            :key="item.id"
            class="artist-col"
            @click="toDetail(item.id)"
          >
            <view class="avatar-wrap">
<!-- lazy-load：每页 20 个头像，不加会在进页瞬间并发请求 20 张 -->
              <image
                class="avatar"
                :src="item.avatar_url || '/static/icons/default-avatar.png'"
                mode="aspectFill"
                lazy-load
              />
            </view>
            <text class="artist-name">{{ item.name }}</text>
            <!-- 活动量排序：显示活动场次 + 订阅人数（两行，便于观察订阅操作效果） -->
            <template v-if="sort === 'event_count'">
              <text v-if="item.event_count != null" class="event-count">({{ item.event_count }}场)</text>
              <text class="event-count">({{ item.subscriber_count ?? 0 }}人订阅)</text>
            </template>
            <!-- 订阅量排序：只显示订阅人数 -->
            <text v-else class="event-count">({{ item.subscriber_count ?? 0 }}人订阅)</text>
            <view
              class="subscribe-btn"
              :class="{
                'subscribe-btn--active': subscribeStore.isArtistSubscribed(
                  item.id,
                ),
              }"
              @click.stop="toggleSubscribe(item.id)"
            >
              <text class="subscribe-text">
                {{
                  subscribeStore.isArtistSubscribed(item.id) ? "退订" : "订阅"
                }}
              </text>
            </view>
          </view>
        </view>

        <view v-if="!loading && list.length === 0" class="empty">
          <text class="empty-icon">⏳</text>
          <text class="empty-text">暂无该地区偶像</text>
          <text class="empty-hint">试试切换排序或返回上一页</text>
        </view>

        <view v-if="list.length > 0" class="list-footer">
          <text class="list-footer-text">
            {{
              loading ? "加载中…" : noMore ? `共 ${total} 位` : "上拉加载更多"
            }}
          </text>
        </view>
      </view>
    </view>
  </PageLayout>
</template>

<script setup lang="ts">
import type { ArtistOrder, ArtistSort } from "@/api/artist";
import { artistApi } from "@/api/artist";
import { useNotificationStore } from "@/stores/notification";
import { syncPushToken } from "@/composables/usePush";
import PageLayout from "@/components/PageLayout/index.vue";
import { useSubscribeStore } from "@/stores/subscribe";
import { useUserStore } from "@/stores/user";
import type { Artist } from "@/types/artist";
import { getNavBarMetrics } from "@/utils/system";
import { onLoad, onPullDownRefresh, onReachBottom } from "@dcloudio/uni-app";
import { computed, ref } from "vue";
const subscribeStore = useSubscribeStore();
const userStore = useUserStore();
const statusBarHeight = ref(20);
const navRightPadding = ref(16);

// ── 路由参数 ──
const country = ref(""); // ISO 国家码 (JP / KR / CN / US / TW / HK …)

// ── 筛选 / 排序 ──
const sort = ref<ArtistSort>("event_count");
const order = ref<ArtistOrder>("desc");

// ── 列表分页状态 ──
const list = ref<Artist[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = 20;
const loading = ref(false);
const noMore = ref(false);

// 中文标题映射(从 list.vue 复用)
const COUNTRY_LABELS: Record<string, string> = {
  JP: "日本偶像",
  KR: "韩国偶像",
  CN: "中国偶像",
  US: "欧美偶像",
  TW: "台湾偶像",
  HK: "香港偶像",
  SG: "新马泰偶像",
  MY: "新马泰偶像",
  TH: "新马泰偶像",
};
const title = computed(
  () => COUNTRY_LABELS[country.value] || `${country.value}偶像`,
);

const sortOptions: { value: ArtistSort; label: string }[] = [
  { value: "event_count", label: "活动量排序" },
  { value: "subscriber_count", label: "订阅量排序" },
];

onLoad(async (options) => {
  const metrics = getNavBarMetrics();
  statusBarHeight.value = metrics.statusBarHeight;
  navRightPadding.value = metrics.navRightPadding;
  country.value = String(options?.country || "");

  // 拉一次订阅 id 集合,保证按钮反显正确(从偶像列表页进来时大概率已经拉过,这里再调一次幂等)
  if (userStore.isLoggedIn) {
    subscribeStore.fetchMySubscribedIds().catch(() => {
      /* 静默失败,按钮仍可点击 */
    });
  }

  await loadList(true);
});

async function loadList(reset = false) {
  if (loading.value) return;
  if (!country.value) return;
  loading.value = true;
  try {
    if (reset) {
      page.value = 1;
      noMore.value = false;
      list.value = [];
    }
    const res = await artistApi.list({
      country: country.value,
      sort: sort.value,
      order: order.value,
      page: page.value,
      page_size: pageSize,
    });
    list.value = list.value.concat(res.list);
    total.value = res.total;
    noMore.value = list.value.length >= total.value;
  } catch (e: any) {
    uni.showToast({ title: e?.message || "加载失败", icon: "none" });
  } finally {
    loading.value = false;
  }
}

function onSortClick(value: ArtistSort) {
  if (sort.value === value) {
    // 同字段再点:翻转顺序
    order.value = order.value === "desc" ? "asc" : "desc";
  } else {
    // 切换字段:重置为降序
    sort.value = value;
    order.value = "desc";
  }
  loadList(true);
}

onReachBottom(() => {
  if (loading.value || noMore.value) return;
  page.value += 1;
  loadList();
});

onPullDownRefresh(async () => {
  await loadList(true);
  uni.stopPullDownRefresh();
});

function goBack() {
  uni.navigateBack();
}

function toDetail(id: string) {
  uni.navigateTo({ url: `/pages/artist/detail?id=${id}` });
}

/**
 * App 端订阅：系统推送是长期订阅，订阅成功后确保本机已拿到系统通知权限并上报 cid。
 */
async function ensurePushReady() {
  const granted = await useNotificationStore().requestSystemNotifyPermission()
  if (!granted) {
    uni.showToast({ title: "已订阅，请到系统设置中允许通知", icon: "none", duration: 2500 })
    return
  }
  await syncPushToken()
}

/**
 * 订阅按钮:未登录 → 弹登录框;已登录 → 调 store 切换
 * 成功后本地 subscriber_count +1/-1，两种排序模式下均有效，无需刷新整个列表
 */
function toggleSubscribe(id: string) {
  userStore.requireLogin({
    dismissible: true,
    reason: "artist_subscribe",
    onSuccess: async () => {
      // 操作前先记录当前状态（toggleArtist 执行后状态已翻转）
      const wasSubscribed = subscribeStore.isArtistSubscribed(id)
      try {
        await subscribeStore.toggleArtist(id)
        if (!wasSubscribed) {
          await ensurePushReady()
        }
        // 本地更新计数，两种排序模式均适用
        const item = list.value.find(a => a.id === id)
        if (item != null) {
          item.subscriber_count = Math.max(0, (item.subscriber_count ?? 0) + (wasSubscribed ? -1 : 1))
        }
      } catch (e: any) {
        uni.showToast({ title: e?.message || "订阅失败", icon: "none" });
      }
    },
  });
}
</script>

<style scoped>
.page {
  background: #fff;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

/* ── 顶部导航 ── */
.nav {
  display: flex;
  align-items: center;
  height: 80rpx;
  padding: 0 30rpx;
  background: #fff;
}
.nav-back {
  font-size: 50rpx;
  color: #111;
  line-height: 50rpx;
  width: 50rpx;
}
.nav-title {
  font-size: 32rpx;
  font-weight: 600;
  color: #111;
}
.nav-add {
  width: 50rpx;
  height: 50rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* ── 排序胶囊 ── */
.sort-bar {
  display: flex;
  gap: 30rpx;
  padding: 20rpx 30rpx 10rpx;
  background: #fff;
}
.sort-pill {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
  height: 64rpx;
  padding: 0 28rpx;
  border-radius: 32rpx;
  border: 1rpx solid rgba(236, 236, 236, 1);
  background: #fff;
}
.sort-pill--active {
  border-color: rgba(254, 165, 0, 1);
  background: rgba(254, 165, 0, 0.06);
}
.sort-label {
  font-size: 26rpx;
  color: rgba(51, 51, 51, 1);
}
.sort-pill--active .sort-label {
  color: rgba(254, 165, 0, 1);
  font-weight: 600;
}
.sort-arrow-icon {
  width: 18rpx;
  height: 14rpx;
  opacity: 0.35;
  transition:
    transform 0.2s ease,
    -webkit-transform 0.2s ease;
}
.sort-pill--active .sort-arrow-icon {
  opacity: 1;
}
.sort-arrow-icon--up {
  transform: rotate(180deg);
}

/* ── 网格 ── */
.grid-body {
  flex: 1;
  padding: 20rpx 20rpx 60rpx;
}

.grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  column-gap: 10rpx;
  row-gap: 30rpx;
}

.artist-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0 4rpx;
}
.artist-col--skel .avatar {
  background: #eee;
}
.artist-col--skel .skel-line {
  background: #eee;
  border-radius: 6rpx;
  margin-top: 10rpx;
}
.skel-line--sm {
  width: 80%;
  height: 24rpx;
}
.skel-line--xs {
  width: 60%;
  height: 20rpx;
}
.skel-btn {
  margin-top: 12rpx;
  width: 80%;
  height: 40rpx;
  border-radius: 20rpx;
  background: #eee;
}

.avatar-wrap {
  width: 110rpx;
  height: 110rpx;
  border-radius: 55rpx;
  overflow: hidden;
  background: #f5f5f5;
}
.avatar {
  width: 100%;
  height: 100%;
}

.artist-name {
  margin-top: 12rpx;
  font-size: 24rpx;
  color: rgba(51, 51, 51, 1);
  text-align: center;
  max-width: 110rpx;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.event-count {
  margin-top: 4rpx;
  font-size: 20rpx;
  color: rgba(254, 165, 0, 1);
  text-align: center;
}

.subscribe-btn {
  margin-top: 10rpx;
  border-radius: 24rpx;
  padding: 8rpx 22rpx;
  background: linear-gradient(
    0deg,
    rgba(255, 190, 0, 1) 0%,
    rgba(254, 165, 0, 1) 100%
  );
}
.subscribe-btn--active {
  background: linear-gradient(
    0deg,
    rgba(255, 196, 205, 1) 0%,
    rgba(255, 143, 160, 1) 100%
  );
}
.subscribe-text {
  font-size: 20rpx;
  font-weight: 600;
  color: #fff;
  white-space: nowrap;
}

/* ── 空态 ── */
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 120rpx 0;
  gap: 12rpx;
}
.empty-icon {
  font-size: 60rpx;
}
.empty-text {
  font-size: 30rpx;
  color: #666;
}
.empty-hint {
  font-size: 24rpx;
  color: #999;
}

/* ── 底部统计 ── */
.list-footer {
  text-align: center;
  padding: 40rpx 0 20rpx;
}
.list-footer-text {
  font-size: 22rpx;
  color: #999;
}
</style>
