<!--
  pages/event/list  活动列表页（按设计稿图二重写）
  ─────────────────────────────────────────────
  入口:
    1. 首页"查看所有"      /pages/event/list
    2. 首页标签网格        /pages/event/list?genre=CPOP/JPOP/KPOP/...
    3. 活动详情"更多"      /pages/event/list?status=PUBLISHED

  布局（自上而下）:
    1. 自定义导航(返回 + 标题 + 占位)
    2. 5 胶囊筛选(城市/类型/圈子/状态/日历)
    3. 日历视图(展开态才显示)
    4. 活动卡片列表(普通 view,非 scroll-view,避免 height 算 0)
    5. 底部"共 N 场"统计
    6. 城市选择弹窗

  注意:不嵌 scroll-view,让小程序原生页面滚动接管,scroll-view 在小
       程序中需要精确 px 高度,经常坑人。
-->
<template>
  <PageLayout>
    <page-meta :page-style="cityPickerVisible ? 'overflow: hidden' : ''" />
    <view class="page" :style="{ paddingTop: statusBarHeight + 'px' }">
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

      <!-- 活动列表(普通 view,使用页面原生滚动) -->
      <view class="list-body">
        <template v-if="loading">
          <EventCardSkeleton v-for="i in 6" :key="`sk-${i}`" />
        </template>
        <template v-else>
          <EventCard
            v-for="item in visibleEvents"
            :key="item.id"
            :event="item"
            :entryGenreCode="selectedGenre"
            @select="toDetail"
          />
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
      </view>

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
import { ref, computed, watch, nextTick } from "vue"
import { onLoad, onReachBottom, onShow } from "@dcloudio/uni-app"
import { useEventStore } from "@/stores/event"
import PageLayout from "@/components/PageLayout/index.vue"
import EventCard from "@/components/EventCard/index.vue"
import EventCardSkeleton from "@/components/EventCard/Skeleton.vue"
import EventFilters from "@/components/EventFilters/index.vue"
import EventCalendar from "@/components/EventCalendar/index.vue"
import CityPicker from "@/components/CityPicker/index.vue"
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

// URL 里的 type 走小写下划线 slug (concert / music_festival / ...)，
// 内部 selectedType 保留后端约定的原 code (Concert / Music_Festival / ...)
// 与 src/constants/eventMeta.ts 中 EVENT_TYPE_OPTIONS.code 保持对应
const TYPE_SLUG_TO_CODE: Record<string, string> = {
  concert:       "Concert",
  music_festival: "Music_Festival",
  fan_meeting:   "Fan_Meeting",
  anime_expo:    "Anime_Expo",
  concert_hall:  "Concert_Hall",
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

  // ── 日历场数：展开时拉整月数据；翻月/改筛选时刷新（预热当前月一次）──
  watch(showCalendar, (open) => {
    if (open) fetchCalendarCounts()
  })
  watch(
    [calendarMonth, selectedGenre, selectedCity, selectedType, selectedStatus],
    () => {
      if (showCalendar.value) fetchCalendarCounts()
    },
  )
  fetchCalendarCounts()
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

// 本页是原生页面滚动（onReachBottom），无法做窗口化：往视口上方插占位块必然跳变。
// 这里做力所能及的两件事：
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
  loading.value = true
  try {
    await store.fetchList(params)
  } finally {
    loading.value = false
  }
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

/** 触底加载更多（uni-app onReachBottom 钩子会自动调用） */
async function handleLoadMore() {
  // 已全部加载，或正在加载中，或首屏 loading 时，跳过
  if (loading.value || store.loadingMore) return
  if (!store.list || store.list.list.length >= store.list.total) return

  await store.loadMore(buildFilterParams())
}

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

// ── 触底加载更多 ──
onReachBottom(() => {
  handleLoadMore()
})
</script>

<style scoped>
.page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
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

.list-body {
  flex: 1;
  padding-bottom: 40rpx;
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
