<!--
  pages/event/list  活动列表页（按设计稿图二重写）
  ─────────────────────────────────────────────
  入口:
    1. 首页"查看所有"      /pages/event/list
    2. 首页标签网格        /pages/event/list?genre=CPOP/JPOP/KPOP/...
    3. 活动详情"更多"      /pages/event/list?status=PUBLISHED

  布局(自上而下):
    1. 自定义导航(返回 + 标题 + 占位)
    2. 5 胶囊筛选(城市/类型/圈子/状态/日历)
    3. 日历视图(展开态才显示)
    4. 活动卡片列表(scroll-view + 窗口化渲染)
    5. 底部"共 N 场"统计
    6. 城市选择弹窗

  注意:列表用 scroll-view + useVirtualList 窗口化,不用页面原生滚动。
       早期版本用原生滚动(onReachBottom),活动无限 append 后所有卡片节点
       常驻 DOM —— 100 张卡 ≈ 2500 个节点 + 300 张头像解码,低端机直接 OOM。
       改成 scroll-view 后才能用上项目自带的窗口化能力。
-->
<template>
  <PageLayout>
    <page-meta :page-style="cityPickerVisible ? 'overflow: hidden' : ''" />
    <view class="page" :style="{ paddingTop: statusBarHeight + 'px' }">
      <!-- 固定头部:导航 + 筛选 + 日历(不随列表滚动) -->
      <view class="page-head">
        <!-- 自定义导航栏 -->
        <view class="nav">
          <view class="nav-back" @click="goBack">
            <uni-icons type="left" size="large" color="#111" />
          </view>
          <text class="nav-title">{{ navTitle }}</text>
          <view class="nav-placeholder" />
        </view>

        <!-- 顶部 5 胶囊 -->
        <EventFilters
          :selectedCity="selectedCity"
          :selectedType="selectedType"
          :selectedGenre="selectedGenre"
          :selectedStatus="selectedStatus"
          :selectedDate="selectedDate"
          :calendarExpanded="showCalendar"
          :cityLabel="cityDisplayName"
          @update:selectedCity="selectedCity = $event"
          @update:selectedType="selectedType = $event"
          @update:selectedGenre="selectedGenre = $event"
          @update:selectedStatus="selectedStatus = $event"
          @update:selectedDate="selectedDate = $event"
          @update:calendarExpanded="showCalendar = $event"
          @open-city="cityPickerVisible = true"
        />

        <!-- 日历视图(展开态才渲染) -->
        <EventCalendar
          v-if="showCalendar"
          :yearMonth="calendarMonth"
          :selectedDate="selectedDate"
          :dailyCounts="calCounts"
          @update:yearMonth="calendarMonth = $event"
          @update:selectedDate="selectedDate = $event"
        />
      </view>

      <!-- 活动列表(scroll-view + 窗口化:只渲染视口附近的卡片) -->
      <scroll-view
        scroll-y
        class="list-scroll"
        :style="{ height: scrollHeight + 'px' }"
        :scroll-into-view="scrollAnchor"
        @scroll="onVirtualScroll"
        @scrolltolower="handleLoadMore"
      >
        <template v-if="loading">
          <EventCardSkeleton v-for="i in 6" :key="`sk-${i}`" />
        </template>
        <template v-else>
          <!-- 顶部锚点:切筛选后靠 scroll-into-view 强制回到列表顶端。
               列表内容整体替换时 scroll-view 会保留旧的 scrollTop,
               用户会停在「半截位置 + 一屏新内容」的错位状态。 -->
          <view id="event-list-top" />          <!-- 视口上方的占位块:高度 = 已渲染过的项的实测高度之和 -->
          <view :style="{ height: topSpacer + 'px' }" />
          <view v-for="row in visibleItems" :key="row.key" class="vl-item">
            <EventCard
              :event="row.item"
              :entryGenreCode="selectedGenre"
              @select="toDetail"
            />
          </view>
          <!-- 视口下方的占位块:撑出总高度,滚动条长度才正确 -->
          <view :style="{ height: bottomSpacer + 'px' }" />
          <view v-if="!visibleEvents.length" class="empty">
            <text class="empty-icon">⏳</text>
            <text class="empty-text">暂无符合条件的活动</text>
            <text class="empty-hint">试试调整筛选条件</text>
          </view>
          <view v-if="visibleEvents.length" class="list-footer">
            <text v-if="store.loadingMore" class="list-footer-text">加载中...</text>
            <text v-else-if="store.list && store.list.list.length >= store.list.total" class="list-footer-text">
              共 {{ isLiveBucket ? visibleEvents.length : store.list.total }} 场
            </text>
            <text v-else class="list-footer-text">
              {{ isLiveBucket ? visibleEvents.length : store.list?.list.length ?? 0 }} / {{ store.list?.total ?? 0 }} 场
            </text>
          </view>
        </template>
      </scroll-view>

      <!-- 城市选择弹窗 -->
      <CityPicker
        :visible="cityPickerVisible"
        :selectedCity="selectedCity"
        :availableCities="availableCities"
        @update:visible="cityPickerVisible = $event"
        @select="onCitySelected"
      />
    </view>
  </PageLayout>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted } from "vue"
import { onLoad, onShow } from "@dcloudio/uni-app"
import { useEventStore } from "@/stores/event"
import PageLayout from "@/components/PageLayout/index.vue"
import EventCard from "@/components/EventCard/index.vue"
import EventCardSkeleton from "@/components/EventCard/Skeleton.vue"
import EventFilters from "@/components/EventFilters/index.vue"
import EventCalendar from "@/components/EventCalendar/index.vue"
import CityPicker from "@/components/CityPicker/index.vue"
import { useVirtualList } from "@/composables/useVirtualList"
import { cityEn } from "@/constants/cities"
import { getGenreByCode } from "@/constants/genres"
import { effectiveEventStatus } from "@/constants/eventMeta"
import { eventApi } from "@/api/event"
const store = useEventStore()
const statusBarHeight = ref(20)

// ── 筛选条件（全部受控，watch 自动触发 fetchList）──
// selectedCity 存中文（"北京"），fetchList 内部经 cityEn() 转英文后传后端
const selectedGenre  = ref("")             // GENRES.code；空 = 全部
const selectedCity   = ref("")             // 中文城市名；空 = 全国
const selectedType   = ref("")             // event_type code；空 = 全部
const selectedStatus = ref("PUBLISHED")    // 默认只显示已发布
const selectedDate   = ref("")             // YYYY-MM-DD；空 = 不按日期过滤
const showCalendar   = ref(false)
const calendarMonth  = ref("")             // YYYY-MM

// ── UI 状态 ──
const cityPickerVisible  = ref(false)
const loading            = ref(false)
/** 可用城市列表（英文），来自后端 /events/cities，随 type/genre/status 变化而更新 */
const availableCities    = ref<string[]>([])

// URL 里的 type 走小写下划线 slug (concert / festival / ...)，
// 内部 selectedType 保留后端 event_type_ref.type_code (CONCERT / FESTIVAL / ...)
// 与 src/constants/eventMeta.ts 中 EVENT_TYPE_OPTIONS.code 保持对应
const TYPE_SLUG_TO_CODE: Record<string, string> = {
  concert:       "CONCERT",
  festival:      "FESTIVAL",
  music_festival:"FESTIVAL",
  fan_meeting:   "FAN_MEETING",
  anime_expo:    "ANIME_EXPO",
  concert_hall:  "CONCERT_HALL",
}

onLoad((options) => {
  const info = uni.getSystemInfoSync()
  statusBarHeight.value = info.statusBarHeight || 20

  // 入口参数
  if (options?.genre)  selectedGenre.value  = String(options.genre)
  if (options?.type) {
    const code = TYPE_SLUG_TO_CODE[String(options.type)]
    if (code) selectedType.value = code
  }
  if (options?.status) selectedStatus.value = String(options.status)

  // 日历月初始化为当前月
  const now = new Date()
  calendarMonth.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`

  // ── 筛选变化时自动重新拉取 ──
  // 注意：必须放在 onLoad 内、URL 参数已应用之后，避免 onLoad 里的
  // ref 赋值触发额外的 watch 回调，与末尾的 fetchList() 重复请求。
  watch(
    [selectedGenre, selectedCity, selectedType, selectedStatus, selectedDate],
    () => fetchList(),
  )

  // 非城市条件变化时刷新可用城市列表（城市本身变化不触发，避免循环）
  watch(
    [selectedGenre, selectedType, selectedStatus],
    () => fetchAvailableCities(),
  )

  fetchList()
  fetchAvailableCities()

  // ── 日历场数：只在展开时拉整月数据；翻月/改筛选时刷新 ──
  // 不要在这里无条件调一次预热：showCalendar 默认 false，日历 v-if 根本没渲染，
  // 这次请求纯属白打；而且它会先占掉 lastCalSig，用户真展开时反而命中去重不再发。
  watch(showCalendar, (open) => {
    if (open) fetchCalendarCounts()
  })
  watch(
    [calendarMonth, selectedGenre, selectedCity, selectedType, selectedStatus],
    () => {
      if (showCalendar.value) fetchCalendarCounts()
    },
  )
})

// ── 城市展示名（传给 EventFilters 的 cityLabel prop）──
// selectedCity 本身已是中文，直接透传即可
const cityDisplayName = computed(() => selectedCity.value)

// ── 顶部标题 ──
const navTitle = computed(() => {
  if (selectedGenre.value) {
    const g = getGenreByCode(selectedGenre.value)
    if (g) return g.label
  }
  if (selectedCity.value) return selectedCity.value
  return "活动"
})

// ── 过期隐藏：仅“默认售票中且不按具体日期翻页”时剔除已过期(仍 PUBLISHED)条目 ──
// 筛选切到“已结束/已取消”，或用日历翻到某天(selectedDate)时不过滤——由 EventCard/详情按日期标“已结束”。
const isLiveBucket = computed(
  () =>
    !selectedDate.value &&
    (!selectedStatus.value || selectedStatus.value === "PUBLISHED")
);

// 本页列表用 scroll-view + 窗口化渲染（composables/useVirtualList）。
// 这里做两件事：
//   1) computed 只在依赖变化时重算一次，不随滚动等无关响应式触发而重复过滤整个数组；
//   2) effectiveEventStatus 内部会 new Date()，属于「随时间变化」的纯函数 ——
//      若直接放在 computed 里，跨天不会重新求值，页面会一直显示昨天的过期判定。
//      用 nowTick（仅在 onShow / 切日期时自增）作为依赖，保证跨天能重判。
const nowTick = ref(0);
const visibleEvents = computed(() => {
  void nowTick.value;
  const l = store.list?.list ?? [];
  if (!isLiveBucket.value) return l;
  return l.filter((ev) => effectiveEventStatus(ev) !== "ENDED");
});

/**
 * 窗口化渲染：只渲染视口附近的卡片，上下用占位块撑出总高度。
 *
 * 为什么必须虚拟化：活动列表是无限翻页的，早期版本全量 v-for 渲染，
 * 100 张卡 ≈ 2500 个 DOM 节点，外加 300 张艺人头像全部解码进内存 ——
 * 低端机上这是最现实的 OOM 路径。
 */
const {
  visibleItems,
  topSpacer,
  bottomSpacer,
  distanceToEnd,
  onScroll: onVirtualScroll,
  setViewportHeight,
  reset: resetVirtual,
} = useVirtualList({
  source: visibleEvents,
  getKey: (ev) => ev.id,
  itemSelector: ".vl-item",
  // EventCard 的高度完全确定：头像固定 60rpx、艺人名与标题都是 nowrap+ellipsis、
  // 没有任何按图片原始尺寸撑高的容器。所以「估算值」可以取得很准 ——
  // 估算偏差越大，首屏占位块修正轮次越多（每轮都是一次 selectorQuery 往返）。
  // 285rpx ≈ 142px（750rpx 设计稿按屏宽 375 折半）+ .vl-item 的 padding-bottom。
  estimatedHeight: 142,
  overscan: 3,
});

/**
 * scroll-view 的可视高度（px）。
 *
 * scroll-view 必须给确定高度才能滚动。列表区在固定头部（导航 + 筛选 + 日历）
 * 下方，所以高度 = 窗口高 - 状态栏 - 头部实际高度。
 * 头部高度会变（日历展开/收起、筛选胶囊换行），所以每次变化后重测。
 */
const scrollHeight = ref(0);

function measureListHeight() {
  const windowHeight = uni.getWindowInfo?.()?.windowHeight || 0;
  if (!windowHeight) return;
  uni
    .createSelectorQuery()
    .select(".page-head")
    .boundingClientRect((rect: any) => {
      const headH = rect?.height || 0;
      // 留 2px 余量，避免小数误差导致最后一行被裁掉
      const h = Math.max(200, windowHeight - statusBarHeight.value - headH - 2);
      scrollHeight.value = h;
      // 同步给虚拟列表：否则它按「整窗高度」算渲染窗口，
      // 实际视口比整窗矮一截（导航+筛选+日历占了 ~250px），
      // 首屏会多渲染看不见的卡片，白白增加节点与图片解码量。
      setViewportHeight(h);
    })
    .exec();
}

// 日历展开/收起会改变头部高度 → 重测
watch(showCalendar, () => {
  void nextTick(() => measureListHeight());
});
// 筛选变化可能让胶囊换行 → 重测
watch(
  [selectedCity, selectedType, selectedGenre, selectedStatus, selectedDate],
  () => {
    void nextTick(() => measureListHeight());
  }
);

onMounted(() => {
  void nextTick(() => measureListHeight());
});

// 从详情页返回、或在页面上跨过零点后回到前台：重判一次过期，剔除新过期的条目
onShow(() => {
  nowTick.value++;
});

// ── 日历场数：改用后端“整月每天场数”接口，与当前列表解耦 ──
// 之前从 store.list 反推只能覆盖已加载的一页（≤20）且会随点选日期塌缩；
// 现在整月一次拉全，有活动的日期直接显示场数，选某天也不影响其它天。
const calCounts = ref<Record<string, number>>({})
let calSeq = 0 // 竞态令牌：慢响应回来时若筛选已变则丢弃
let lastCalSig = "" // 已成功拉取的筛选签名，去重避免重复请求

function calSig() {
  return [calendarMonth.value, selectedStatus.value, selectedGenre.value, selectedType.value, selectedCity.value].join("|")
}

/** 拉取当前显示月份 + 当前筛选下的每天场数（不含 selectedDate，整月场数不随点选某天减少） */
async function fetchCalendarCounts() {
  const sig = calSig()
  if (sig === lastCalSig) return // 同月同筛选已拉取过
  const seq = ++calSeq
  lastCalSig = sig
  try {
    const params: Record<string, any> = { month: calendarMonth.value }
    if (selectedStatus.value) params.status = selectedStatus.value
    if (selectedGenre.value)  params.genre  = selectedGenre.value
    if (selectedType.value)   params.type   = selectedType.value
    if (selectedCity.value) {
      const en = cityEn(selectedCity.value) // 中文城市名 → 英文（与列表一致）
      if (en) params.city = en
    }
    const res = await eventApi.calendarCounts(params)
    if (seq === calSeq) calCounts.value = res?.counts ?? {}
  } catch {
    // 失败保留旧值；重置签名允许下次进入/切筛选时重试
    if (seq === calSeq) lastCalSig = ""
  }
}

async function fetchList() {
  const params: Record<string, any> = {}
  if (selectedStatus.value) params.status = selectedStatus.value
  if (selectedGenre.value)  params.genre  = selectedGenre.value
  if (selectedType.value)   params.type   = selectedType.value
  if (selectedCity.value) {
    // selectedCity 存中文，转英文传给后端（与 DB event_sessions.city 精确匹配）
    const en = cityEn(selectedCity.value)
    if (en) params.city = en
  }
  if (selectedDate.value) params.date = selectedDate.value
  // 换筛选 = 换一份列表，窗口化状态与滚动位置都必须归零
  resetVirtual()
  scrollToTop()
  loading.value = true
  try {
    await store.fetchList(params)
  } finally {
    loading.value = false
  }
}

/** 强制 scroll-view 回到顶部（scroll-into-view 需要一帧空值才能重复触发） */
const scrollAnchor = ref("")
function scrollToTop() {
  scrollAnchor.value = ""
  void nextTick(() => {
    scrollAnchor.value = "event-list-top"
  })
}

/** 构造当前筛选参数（供 loadMore 复用，避免重复组参数） */
function buildFilterParams(): Record<string, any> {
  const params: Record<string, any> = {}
  if (selectedStatus.value) params.status = selectedStatus.value
  if (selectedGenre.value)  params.genre  = selectedGenre.value
  if (selectedType.value)   params.type   = selectedType.value
  if (selectedCity.value) {
    const en = cityEn(selectedCity.value)
    if (en) params.city = en
  }
  if (selectedDate.value) params.date = selectedDate.value
  return params
}

/**
 * 加载更多。
 *
 * 两级触发，目的是让翻页「无感」：
 *   1) 主路径 —— watch(distanceToEnd)，距底不足 PREFETCH_SCREENS 屏就提前拉。
 *      用户滚到那儿时内容早已就位，不会看到 spinner、也不会停顿。
 *   2) 兜底 —— scrolltolower。预取失败（弱网/接口报错）时靠它兜住，
 *      否则用户会滚到一个永远不动的底部。
 * 两条路径共用下面这一套并发守卫，不会重复发请求。
 */
async function handleLoadMore() {
  // 已全部加载 / 已达硬上限，或正在加载中，或首屏 loading 时，跳过
  if (loading.value || store.loadingMore) return
  if (!store.hasMore) return

  await store.loadMore(buildFilterParams())
}

/** 提前多少屏开始拉下一页。3 屏 ≈ 1800px，足够覆盖一次快速滑动 + 一次 RTT。 */
const PREFETCH_SCREENS = 3

watch(
  [distanceToEnd, scrollHeight],
  ([dist, vh]) => {
    // vh 尚未测量出来时不判断，否则阈值退化成 0 会立刻空触发一次
    if (!vh) return
    if (dist < vh * PREFETCH_SCREENS) void handleLoadMore()
  },
  { immediate: false },
)

/** 拉取当前 type/genre/status 下的可用城市列表，供 CityPicker 动态展示 */
async function fetchAvailableCities() {
  try {
    const params: Record<string, any> = {}
    if (selectedStatus.value) params.status = selectedStatus.value
    if (selectedGenre.value)  params.genre  = selectedGenre.value
    if (selectedType.value)   params.type   = selectedType.value
    const res = await eventApi.listCities(params)
    availableCities.value = res?.list ?? []
    // 若当前已选城市在新条件下已无活动，自动清空选择
    if (selectedCity.value) {
      const en = cityEn(selectedCity.value)
      if (en && !availableCities.value.includes(en)) {
        selectedCity.value = ""
      }
    }
  } catch {
    // 接口失败不影响主功能，降级为全量城市（CityPicker 内部兜底）
    availableCities.value = []
  }
}

function onCitySelected(city: { name: string; id: string }) {
  // CityPicker 传回 { name: 中文城市名, id: region.id }，此处只需城市名做筛选
  selectedCity.value = city.name
  nextTick(() => { cityPickerVisible.value = false })
}

function goBack() {
  uni.navigateBack()
}

function toDetail(id: number) {
  uni.navigateTo({ url: `/pages/event/detail?id=${id}` })
}
</script>

<style scoped>
.page {
  /* 列表改用 scroll-view 承载滚动，页面本身不再滚动：
     高度必须锁定为视口高并裁掉溢出，否则会出现「页面 + scroll-view 双滚动条」，
     触摸手势会被两套滚动容器抢走，滑动直接失灵。 */
  height: 100vh;
  /* 必须 border-box：模板上内联了 padding-top(statusBar)，
     按 content-box 叠加会让盒子变成 100vh + statusBar，
     页面自身多出一截可滚动区域（手势被外层抢走），
     且与 setViewportHeight 里 windowHeight - statusBar - headH 的算法对不上，
     scroll-view 视口比算出来的多出一个状态栏，虚拟列表窗口错位。
     与 artist/by-country.vue 的 .page 同一个坑。
     注意：本项目的 border-box 禁令只针对 input / textarea，这里是 view。 */
  box-sizing: border-box;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.page-head {
  flex-shrink: 0;
}
.list-scroll {
  flex: 1;
  /* 高度由 JS 按「窗口高 - 状态栏 - 头部实际高度」算好后写进 style，
     flex:1 只作兜底（JS 未跑起来时也不会塌成 0）。 */
  overflow: hidden;
}
/* 窗口化测量锚点：padding-bottom 计入 border-box，测量才能拿到真实高度 */
.vl-item {
  overflow: hidden;
  padding-bottom: 20rpx;
}
.nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
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
.nav-placeholder {
  width: 50rpx;
}

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
.list-footer {
  text-align: center;
  padding: 30rpx 0 60rpx;
}
.list-footer-text {
  font-size: 22rpx;
  color: #999;
}
</style>
