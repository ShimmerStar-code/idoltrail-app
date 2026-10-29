<template>
  <PageLayout>
    <view class="page">
      <!-- 未登录：进入本页即弹一次登录弹窗；用户关掉后这里保留可点的登录入口 -->
      <view v-if="!isLoggedIn" class="guard-empty">
        <LoginPrompt
          title="登录后查看你的订阅"
          sub="订阅偶像、活动和城市，有变动时第一时间通知你"
          reason="subscribe_page"
        />
      </view>

      <template v-else>
        <!-- 头部 -->
        <view class="header" :style="{ paddingTop: statusBarHeight + 'px' }">
          <view class="header-row">
            <text class="title">我的订阅</text>
          </view>
          <!-- 三 tab -->
          <view class="tab-switch">
            <view
              v-for="(t, i) in tabs"
              :key="i"
              class="tab-btn"
              :class="{ active: activeTab === i }"
              @click="onTabChange(i)"
            >
              <text class="tab-text">{{ t }}</text>
            </view>
          </view>
          <!-- 订阅城市：放在 tab 正下方而不是标题栏。
               原来标题右侧是一个 60rpx 的白底圆点，只有「+」，在真机上只有约 30px，
               夹在大标题里几乎看不见，用户根本不知道能点。
               现在改成整行、带图标的描边按钮，放在 tab 切换条下方常驻（不随列表滚动），
               进入城市 tab 就能看到。 -->
          <view v-if="activeTab === 2" class="add-city-btn" @click="onAddCity">
            <uni-icons type="plus" size="17" color="#8A5600" />
            <text class="add-city-text">订阅城市</text>
          </view>
        </view>

        <scroll-view
          scroll-y
          class="scroll-body"
          :style="{ paddingBottom: tabBarHeight + 'px' }"
          :scroll-into-view="scrollAnchorId"
          @scroll="onVirtualScroll"
          @scrolltolower="onScrollLower"
        >
          <!-- 滚动锚点：切 tab / 切"进行中-已失效"时把列表滚回顶部，
               让窗口化的计算起点与真实滚动位置保持一致 -->
          <view id="sub-scroll-top" class="scroll-anchor" />

          <!-- ── Tab 0 偶像 ── -->
          <template v-if="activeTab === 0">
            <view class="tab-tip">{{ TAB_TIPS[0] }}</view>
            <view
              v-if="store.myArtists.length === 0 && !store.loading.artists"
              class="empty"
            >
              还没有订阅的偶像
            </view>
            <!-- 5 列网格 -->
            <view v-else class="artist-grid">
              <ArtistGridCell
                v-for="item in store.myArtists"
                :key="item.artist.id"
                :item="item"
                @unsubscribe="onUnsubArtist"
                @tap="onTapArtist"
              />
            </view>

            <!-- 已关联的活动 -->
            <view v-if="store.artistRelatedEvents.length > 0" class="related-section">
              <view class="section-head">
                <text class="section-title">已关联的活动</text>
                <!-- <text class="section-all" @click="gotoAllRelated"
                  >查看所有</text
                > -->
              </view>
              <EventCard
                v-for="vo in store.artistRelatedEvents"
                :key="vo.event.id"
                :event="voToEvent(vo)"
                :entryGenreCode="vo.event.genre"
                @select="onTapEvent"
              />
            </view>
          </template>

          <!-- ── Tab 1 活动 ── -->
          <template v-if="activeTab === 1">
            <view class="tab-tip">{{ TAB_TIPS[1] }}</view>
            <!-- 二级 segment -->
            <view class="segment">
              <view
                class="seg-btn"
                :class="{ 'seg-btn--active': eventStatus === 'ongoing' }"
                @click="onEventStatusChange('ongoing')"
              >
                <text class="seg-text">进行中</text>
              </view>
              <view
                class="seg-btn"
                :class="{ 'seg-btn--active': eventStatus === 'expired' }"
                @click="onEventStatusChange('expired')"
              >
                <text class="seg-text">已失效</text>
              </view>
            </view>
            <view
              v-if="currentEventList.length === 0 && !isEventsLoading"
              class="empty"
            >
              暂无{{ eventStatus === "ongoing" ? "进行中" : "已失效" }}的活动
            </view>
            <!-- 窗口化：只渲染视口附近的卡片（三个 tab 共用同一个 scroll-view，
                 非活动 tab 的 source 长度为 0，占位块自然是 0，不会互相干扰） -->
            <template v-else>
              <view :style="{ height: topSpacer + 'px' }" />
              <view v-for="row in visibleItems" :key="row.key" class="vl-item">
                <EventCard
                  :event="voToEvent(row.item)"
                  :entryGenreCode="row.item.event.genre"
                  @select="onTapEvent"
                />
              </view>
              <view :style="{ height: bottomSpacer + 'px' }" />
            </template>
          </template>

          <!-- ── Tab 2 城市 ── -->
          <template v-if="activeTab === 2">
            <view class="tab-tip">{{ TAB_TIPS[2] }}</view>
            <view
              v-if="store.myCities.length === 0 && !store.loading.cities"
              class="empty"
            >
              还没有订阅的城市
            </view>
            <CitySubCard
              v-for="item in store.myCities"
              :key="item.city.id"
              :item="item"
              :type-options="typeOptions"
              :tag-options="tagOptions"
              @unsubscribe="onUnsubCity"
              @updateExtra="onUpdateCityExtra"
              @openRelated="onOpenCityRelated"
            />
          </template>
        </scroll-view>
      </template>

      <TabBar :current="2" />
    </view>

    <!-- 城市选择 sheet（复用 CityPicker） -->
    <CityPicker
      :visible="cityPickerVisible"
      :selected-city="''"
      :subscribed-ids="[...store.subscribedCityIds]"
      @update:visible="cityPickerVisible = $event"
      @select="onPickCity"
    />
  </PageLayout>
</template>

<script setup lang="ts">
import PageLayout from "@/components/PageLayout/index.vue";
import ArtistGridCell from "@/components/Subscribe/ArtistGridCell.vue";
import CitySubCard from "@/components/Subscribe/CitySubCard.vue";
import EventCard from "@/components/EventCard/index.vue";
import LoginPrompt from "@/components/LoginPrompt/index.vue";
import TabBar from "@/components/TabBar/index.vue";
import CityPicker from "@/components/CityPicker/index.vue";
import { useSubscribeStore } from "@/stores/subscribe";
import { useUserStore } from "@/stores/user";
import { useDictionaryStore } from "@/stores/dictionary";
import { GENRES } from "@/constants/genres";
import type { ArtistCardVO, CityCardVO, EventCardVO } from "@/types/subscription";
import type { Event } from "@/types/event";
import type { DictOption } from "@/types/dictionary";
import { onShow } from "@dcloudio/uni-app";
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { getStatusBarHeight } from "@/utils/system";
import { useVirtualList } from "@/composables/useVirtualList";
const userStore = useUserStore();
const store = useSubscribeStore();
const dictStore = useDictionaryStore();
const isLoggedIn = computed(() => userStore.isLoggedIn);

// CitySubCard 用的 type / tag 选项
// type 走后端字典（event_type，5 项，与首页「演出类型」一致）。
// tag 走本地 GENRES 常量而不是后端 event_genre 字典：后者缺 ACG/GUOFENG
// （这两项实际有活动数据），却带着 6 个库里 0 条的项（METAL/FOLK/LATIN/
// WORLD/RNB_SOUL/OTHER），与首页「标签」区的 10 项对不上。
// code 两边一致，订阅已保存的 extra.tag 仍能正常回显。
const typeOptions = computed<DictOption[]>(() => dictStore.getItems("event_type"));
const tagOptions = computed<DictOption[]>(() =>
  GENRES.map((g) => ({ code: g.code, name_cn: g.label })),
);

const statusBarHeight = ref(20);
const tabBarHeight = ref(80);
const activeTab = ref(0); // 0 偶像 / 1 活动 / 2 城市
const eventStatus = ref<"ongoing" | "expired">("ongoing");

// 活动列表分页尺寸，与下方 loadAllTabs / onScrollLower 保持一致
const EVENT_PAGE_SIZE = 20;

const tabs = ["偶像", "活动", "城市"];

// 每个 tab 顶部的一句说明，回答「订阅这个到底会给我什么」。
// 放在列表上方而不是 header 里：header 常驻不滚动，切 tab 会带动整块高度变化；
// 放进 scroll-view 后它随内容一起走，切 tab 不会让头部跳动。
const TAB_TIPS = [
  "下列偶像关联的活动都将通知您",
  "已订阅的活动有变动时将通知您",
  "所选城市的新活动将通知您",
];

// 当前展示的活动列表（按 status 切）
const currentEventList = computed<EventCardVO[]>(() =>
  eventStatus.value === "ongoing" ? store.myEventsOngoing : store.myEventsExpired
);
const isEventsLoading = computed(() =>
  eventStatus.value === "ongoing"
    ? store.loading.eventsOngoing
    : store.loading.eventsExpired
);

// ── 活动 tab 窗口化渲染 ──
// 三个 tab 共用一个 scroll-view，只有活动 tab 是分页无限加载的（偶像/城市数量有界），
// 靠下面的 scrollAnchorId 在切 tab 时把滚动位置归零。
const {
  visibleItems,
  topSpacer,
  bottomSpacer,
  onScroll: onVirtualScroll,
  reset: resetVirtual,
} = useVirtualList<EventCardVO>({
  source: currentEventList,
  getKey: (vo) => vo.event.id,
  itemSelector: '.vl-item',
  estimatedHeight: 170,
  overscan: 3,
});

const scrollAnchorId = ref("");

/** 把列表滚回顶部：先清高度缓存与内部 scrollTop，再驱动 scroll-view 实际滚动 */
function scrollListToTop() {
  resetVirtual();
  // 同一个 id 连续赋值不会再次触发滚动，先清空再赋值
  scrollAnchorId.value = "";
  void nextTick(() => {
    scrollAnchorId.value = "sub-scroll-top";
  });
}

onMounted(async () => {
  try {
    statusBarHeight.value = getStatusBarHeight();
  } catch (e) {
    /* 忽略 */
  }
  // 字典预加载（不 await，避免阻塞首屏）
  dictStore.ensureLoaded(["event_type"]).catch(() => {
    /* 静默失败，picker 兜底空数组 */
  });
  // ⚠️ 这里不要再调 loadAllTabs()：
  // uni-app 页面生命周期是 onLoad → onShow → onReady → mounted，
  // onShow 必然先于 onMounted 触发，两处都拉就是首次进页打两遍（5 个接口 → 10 个请求）。
  // 数据加载统一由 onShow 承担；登录后由下面的 watch 补拉。
});

// 每次页面显示时刷新列表（订阅后从其他页返回能即时反映）
onShow(async () => {
  // 进入「我的订阅」弹一次登录框（见 promptLoginOnce 的说明）
  promptLoginOnce()
  if (!userStore.isLoggedIn) return;
  await loadAllTabs()
});

/**
 * 进入本页时弹一次登录框。
 *
 * 「我的订阅」的数据全在服务端（user_subscriptions），未登录进来只能看到空页面，
 * 所以进页面就提示一次登录，而不是让用户自己猜。
 *
 * 用 onShow + 本地标志位保证「一次」：用户关掉弹窗后在页内来回切 tab、
 * 或切到别的 Tab 再切回来，都不会再弹第二次（要再弹得主动点页面上的登录引导）。
 */
const loginPrompted = ref(false);

function promptLoginOnce() {
  if (loginPrompted.value) return;
  if (userStore.isLoggedIn) return;
  // 隐私政策还没同意时不弹登录框：登录会立刻请求后端，
  // 属于「同意前不得收集个人信息」。等用户同意隐私政策后再由下面的 watch 补弹。
  if (!userStore.privacyGranted) return;
  loginPrompted.value = true;
  userStore.requireLogin({ dismissible: true, reason: "subscribe_page" });
}

// 隐私政策刚同意（首次启动流程里用户点了「同意」）→ 补弹登录框
watch(
  () => userStore.privacyGranted,
  (v) => {
    if (v) promptLoginOnce();
  },
);

// 登录后回到本页：补拉一次
watch(
  () => userStore.isLoggedIn,
  async (v) => {
    if (v) await loadAllTabs();
  }
);

/** 拉取三个 tab 需要的全部数据。onShow 与「登录后补拉」共用，避免两处复制同一段请求清单。 */
async function loadAllTabs() {
  await Promise.all([
    store.fetchMyArtists(),
    store.fetchMyEvents("ongoing", 1, EVENT_PAGE_SIZE),
    store.fetchMyEvents("expired", 1, EVENT_PAGE_SIZE),
    store.fetchMyCities(),
    store.fetchArtistRelatedEvents(1, 5),
  ]);
}

function onTabChange(i: number) {
  activeTab.value = i;
  // 三个 tab 内容完全不同，共用滚动位置会让窗口化按错误的起点渲染
  scrollListToTop();
}

// 二级 segment（进行中 / 已失效）切换：列表整体替换，同样要归零
function onEventStatusChange(s: "ongoing" | "expired") {
  if (eventStatus.value === s) return;
  eventStatus.value = s;
  scrollListToTop();
}

// ── 添加城市 ──
const cityPickerVisible = ref(false);

function onAddCity() {
  // + 号只在城市 tab 显示（v-if 控制），所以点 + 直接弹 CityPicker
  if (!userStore.isLoggedIn) {
    userStore.requireLogin({
      dismissible: true,
      reason: "subscribe_city_add",
      onSuccess: () => {
        cityPickerVisible.value = true;
      },
    });
    return;
  }
  cityPickerVisible.value = true;
}

async function onPickCity(city: { name: string; id: string }) {
  cityPickerVisible.value = false;
  if (!city.id) {
    uni.showToast({ title: "未找到该城市", icon: "none" });
    return;
  }
  try {
    await store.toggleCity(city.id, {});
    uni.showToast({ title: "已订阅", icon: "success" });
    await store.fetchMyCities();
  } catch (e: any) {
    uni.showToast({ title: e?.message || "订阅失败", icon: "none" });
  }
}

function onScrollLower() {
  // 活动 tab 触底翻页（仅活动需要翻页，偶像/城市都是一次性列表）
  if (activeTab.value !== 1) return;
  const lk = eventStatus.value === "ongoing" ? "eventsOngoing" : "eventsExpired";
  if (store.loading[lk]) return;
  // 已取完 total → 停止翻页，避免每次触底都打一次注定为空的请求
  if (!store.hasMoreEvents(eventStatus.value)) return;
  // page 游标：page=1 是 store 首次替换，page>1 追加，所以这里从 2 开始。
  // 原实现用 floor(len/20)+1，而 store 是"替换"语义，len 恒为 20 → nextPage 恒为 2，
  // 导致第 1 页数据被覆盖且无限重复请求第 2 页。
  const nextPage = Math.floor(currentEventList.value.length / EVENT_PAGE_SIZE) + 1;
  store.fetchMyEvents(eventStatus.value, nextPage, EVENT_PAGE_SIZE);
}

// ── 交互 ──

function onUnsubArtist(item: ArtistCardVO) {
  userStore.requireLogin({
    dismissible: true,
    reason: "subscribe_artist",
    onSuccess: async () => {
      try {
        await store.toggleArtist(item.artist.id);
        uni.showToast({ title: "已退订", icon: "success" });
      } catch (e: any) {
        uni.showToast({ title: e?.message || "操作失败", icon: "none" });
      }
    },
  });
}

function onTapArtist(item: ArtistCardVO) {
  uni.navigateTo({ url: `/pages/artist/detail?id=${item.artist.id}` });
}

function onUnsubCity(item: CityCardVO) {
  userStore.requireLogin({
    dismissible: true,
    reason: "subscribe_city",
    onSuccess: async () => {
      try {
        await store.toggleCity(item.city.id);
        uni.showToast({ title: "已退订", icon: "success" });
      } catch (e: any) {
        uni.showToast({ title: e?.message || "操作失败", icon: "none" });
      }
    },
  });
}

function onUpdateCityExtra(payload: { id: string; type?: string; tag?: string }) {
  userStore.requireLogin({
    dismissible: true,
    reason: "subscribe_city_extra",
    onSuccess: async () => {
      try {
        await store.updateCityExtra(payload.id, {
          type: payload.type,
          tag: payload.tag,
        });
        // 必须重新拉取：卡片上的 type/tag 直接读 myCities 返回的 extra，
        // 只改本地会让关闭弹窗后的卡片仍是旧标签，直到下次进页面才对上。
        await store.fetchMyCities();
      } catch (e: any) {
        uni.showToast({ title: e?.message || "保存失败", icon: "none" });
      }
    },
  });
}

function onOpenCityRelated(item: CityCardVO) {
  // type/tag 是订阅卡上设置的二次过滤;传给 city-events 让列表与卡片过滤保持一致
  const ex = item.extra || {};
  const typePart = ex.type ? `&type=${encodeURIComponent(ex.type)}` : "";
  const tagPart = ex.tag ? `&tag=${encodeURIComponent(ex.tag)}` : "";
  uni.navigateTo({
    url: `/pages/subscribe/city-events?id=${encodeURIComponent(
      item.city.id
    )}&name=${encodeURIComponent(item.city.name)}${typePart}${tagPart}`,
  });
}

// 模板里的调用点目前是注释状态（"已关联的活动 → 查看全部"入口还没上线），
// 函数先留着，等入口开放时把模板里的注释解开即可。
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function gotoAllRelated() {
  uni.navigateTo({ url: "/pages/subscribe/artist-events" });
}

function onTapEvent(id: number) {
  uni.navigateTo({ url: `/pages/event/detail?id=${id}` });
}

/** EventBrief → Event 适配，供 EventCard 消费 */
function voToEvent(vo: EventCardVO): Event {
  return ({
    id: vo.event.id,
    title: vo.event.title,
    type: vo.event.type || "",   // 直接用后端传来的 events.type，不再用 theme_color 反推
    status: vo.event.status || "", // 透传后端 status，让 EventCard 按日期派生“已结束/已取消”
    poster_url: vo.event.poster_url,
    start_date: vo.event.start_date,
    end_date: vo.event.end_date,
    sessions: vo.event.city
      ? ([{ city: vo.event.city, event_date: vo.event.start_date }] as any)
      : [],
    artists: vo.event.artist
      ? ([
          {
            // artist_id 与 theme_color 都要传：EventCard 的取色靠这两者，
            // 缺失任一个都会退化成中性灰（运营未配 theme_color 时靠 id 哈希兜底）
            artist_id: vo.event.artist.id,
            artist_name: vo.event.artist.name,
            avatar_url: vo.event.artist.avatar_url,
            theme_color: vo.event.artist.theme_color,
          },
        ] as any)
      : [],
    genres: vo.event.genre ? ([{ genre_code: vo.event.genre }] as any) : [],
  } as unknown) as Event;
}
</script>

<style scoped>
.page {
  background: #fff;
  height: 100vh;
  display: flex;
  flex-direction: column;
}

.guard-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
  padding: 0 60rpx;
}
.guard-text {
  font-size: 28rpx;
  color: #999;
}

.header {
  padding: 18rpx 30rpx 24rpx;
}
.header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24rpx;
}
.title {
  font-size: 34rpx;
  font-weight: 600;
  color: rgba(51, 51, 51, 1);
}

/* 订阅城市：整行描边按钮，挂在 tab 下方。
   高度 88rpx（约 44pt），满足移动端可点区域下限。
   原来用实心 #fea500 配 30rpx 白字，反馈是「颜色太浓、字看不清」。
   改成浅橙底 + 同色系描边 + 深棕字：
     底 rgba(254,165,0,.10) 叠在页面 #fff 上 → 实际 rgb(255,246,230)
     字 #8A5600 → 实测对比度 5.74:1，达 WCAG AA（4.5:1）
   （中途试过 #B87503，只有 3.50:1，不达标，已弃用；
     实心橙底 30rpx 白字本身就只有约 1.9:1，这就是看不清的根因。） */
.add-city-btn {
  margin-top: 20rpx;
  height: 88rpx;
  border-radius: 16rpx;
  background: rgba(254, 165, 0, 0.1);
  border: 2rpx solid rgba(254, 165, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
}
.add-city-text {
  margin-left: 10rpx;
  font-size: 30rpx;
  font-weight: 600;
  color: #8a5600;
  line-height: 1;
}

/* tab 说明文案：回答「订阅这个会给我什么」，字号小、灰调，不与列表内容抢注意力。
   放在 scroll-view 内，天然跟随它的 width:95% 居中，
   所以不要再加左右 padding，否则会比下方列表内容缩进一截。
   颜色 #666 而非项目常用的 #999：24rpx(≈13.2pt) 白底上
   #999 只有 2.85:1（连 AA-large 3.0 都不到），#666 为 5.74:1。 */
.tab-tip {
  font-size: 24rpx;
  color: #666;
  line-height: 1.5;
  padding: 4rpx 0 20rpx;
}

.tab-switch {
  display: flex;
  background: rgba(248, 248, 248, 1);
  border-radius: 30rpx;
  padding: 6rpx;
}
.tab-btn {
  flex: 1;
  text-align: center;
  padding: 16rpx 0;
  border-radius: 24rpx;
}
.tab-btn.active {
  background: linear-gradient(135deg, rgba(254, 165, 0, 1) 0%, rgba(255, 210, 0, 1) 100%);
}
.tab-text {
  font-size: 26rpx;
  font-weight: 600;
  color: rgba(153, 153, 153, 1);
}
.tab-btn.active .tab-text {
  color: #fff;
}

.scroll-body {
  flex: 1;
  width: 95%;
  margin: 0 auto;
  padding: 10rpx 0;
  height: 0;
}

/* EventCard 在订阅页内：消除组件自带的水平 margin，由 scroll-body 的 95% 宽度统一控制间距 */
.scroll-body :deep(.event-card--list) {
  margin-left: 0;
  margin-right: 0;
}

/* 窗口化测量锚点：建立 BFC，EventCard 的 margin-top 才不会折叠出去。
   boundingClientRect().height 不含外边距，折叠会让每项都少算高度、占位块失准。 */
.vl-item {
  overflow: hidden;
}

/* 滚动锚点本身零高度，只作为 scroll-into-view 的目标 */
.scroll-anchor {
  height: 0;
}

/* 偶像网格：5 列 */
.artist-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 15rpx;
  /* justify-content: space-between; */
  /* padding: 10rpx 15rpx; */
}

/* 二级 segment（进行中/已失效） */
.segment {
  display: flex;
  gap: 16rpx;
  margin-bottom: 20rpx;
}

.seg-btn {
  flex: 1;
  text-align: center;
  padding: 16rpx 0;
  border-radius: 30rpx;
  background: #fff;
  border: 1rpx solid rgba(236, 236, 236, 1);
  box-shadow: 0 4rpx 12rpx rgba(0, 0, 0, 0.04);
}
.seg-btn--active {
  background: rgba(179, 173, 160, 1);
  border-color: rgba(179, 173, 160, 1);
}
.seg-text {
  font-size: 26rpx;
  font-weight: 600;
  color: rgba(153, 153, 153, 1);
}
.seg-btn--active .seg-text {
  color: #fff;
}

/* 已关联活动 section */
.related-section {
  margin-top: 30rpx;
  padding-bottom: 10rpx;
}
.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20rpx;
}
.section-title {
  font-size: 30rpx;
  font-weight: 600;
  color: rgba(35, 34, 39, 1);
  position: relative;
}
.section-title::after {
  content: "";
  position: absolute;
  left: 0;
  bottom: 2rpx;
  width: 100%;
  height: 8rpx;
  background: rgba(254, 165, 0, 0.45);
  border-radius: 4rpx;
  z-index: -1;
}
.section-all {
  font-size: 26rpx;
  color: rgba(35, 34, 39, 1);
}

.empty {
  text-align: center;
  color: #aaa;
  padding: 80rpx 0;
  font-size: 26rpx;
}
</style>
