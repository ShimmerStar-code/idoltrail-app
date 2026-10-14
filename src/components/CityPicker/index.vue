<!--
  CityPicker  城市选择底部弹窗
  ─────────────────────────────────────
  两种数据源（优先级从高到低）：
  1. availableCities prop（英文数组）：由 list.vue 从 /events/cities 动态获取，
     反映当前 type/genre/status 下真实有活动的城市；用 formatCity 转为中文展示。
  2. regionApi.listCities()：兜底，从后端 regions 表拉全量城市（订阅页等其他场景）。

  pick() 始终 emit 中文城市名（"北京"），上层统一以中文存储 selectedCity。

  props:
    visible           boolean
    selectedCity      string   当前选中（中文名，用于高亮）
    availableCities   string[] 可选，英文城市名数组（动态过滤后的）
    subscribedIds     string[] 可选，已订阅的 region.id，显示"已订阅"标记

  emits:
    update:visible
    select        string   选中的城市中文名
-->
<template>
  <view v-if="visible" class="city-mask" @click="close" @touchmove.stop.prevent>
    <view class="city-popup" :style="popupStyle" @click.stop>
      <view class="city-popup-header">
        <text class="city-popup-title">选择城市</text>
        <text class="city-popup-close" @click="close">✕</text>
      </view>
      <view class="city-search">
        <uni-icons type="search" size="14" color="#999" />
        <input
          v-model="keyword"
          class="city-search-input"
          placeholder="搜索城市"
          placeholder-class="city-search-placeholder"
          confirm-type="search"
          :adjust-position="false"
          @input="onSearch"
          @keyboardheightchange="onKeyboardHeightChange"
        />
        <text v-if="keyword" class="city-search-clear" @click="keyword = ''">✕</text>
      </view>
      <!-- 当前定位行：仅在未搜索时显示 -->
      <view v-if="!keyword" class="city-locate-row">
        <text class="city-locate-label">当前定位</text>
        <view class="city-locate-btn" @click="reLocate">
          <uni-icons type="location" size="12" color="rgba(32,180,170,1)" />
          <text class="city-locate-text">{{ locating ? "定位中..." : "重新定位" }}</text>
        </view>
      </view>
      <!-- 定位结果内联提示：不能用 uni.showToast —— .city-mask 的 z-index 是 9999，
           弹窗打开时 toast 会被遮住，用户看不到任何反馈 -->
      <text v-if="locateMsg && !keyword" class="city-locate-msg" :class="{ 'city-locate-msg--error': locateError }">{{ locateMsg }}</text>
      <scroll-view
        scroll-y
        class="city-list-scroll"
        @touchmove.stop
        @scrolltolower="onScrollToLower"
      >
        <view v-if="loading" class="city-loading">
          <text class="city-loading-text">加载中...</text>
        </view>
        <template v-else>
          <!-- 热门城市：仅在未搜索时显示 -->
          <view v-if="!keyword && hotCities.length" class="city-hot-section">
            <text class="city-section-title">热门城市</text>
            <view class="city-hot-grid">
              <view
                v-for="c in hotCities"
                :key="c.id"
                class="city-hot-item"
                :class="{ 'city-hot-item--active': selectedCity === c.displayName }"
                @click="pick(c)"
              >
                <text class="city-hot-item-text">{{ c.displayName }}</text>
              </view>
            </view>
          </view>
          <!-- 全部城市列表 -->
          <view v-if="displayList.length" class="city-section">
            <text v-if="!keyword" class="city-section-title">全部城市</text>
          </view>
          <view
            v-for="c in displayList"
            :key="c.id"
            class="city-row"
            :class="{ 'city-row--active': selectedCity === c.displayName }"
            @click="pick(c)"
          >
            <view class="city-row-left">
              <HighlightText :text="c.displayName" :keyword="keyword" />
            </view>
            <view class="city-row-right">
              <text v-if="isSubscribed(c.id)" class="subscribed-badge">已订阅</text>
              <text v-else class="city-row-region">{{ c.region }}</text>
              <uni-icons type="right" size="12" color="rgba(220,80,80,1)" />
            </view>
          </view>
          <view v-if="!displayList.length && !loading" class="city-empty">
            <text class="city-empty-text">没有匹配的城市</text>
          </view>
          <!-- 加载更多提示 -->
          <view v-if="loadingMore" class="city-loading-more">
            <text class="city-loading-more-text">加载中...</text>
          </view>
          <view v-else-if="hasMore && !keyword" class="city-loading-more">
            <text class="city-loading-more-text">下滑加载更多</text>
          </view>
        </template>
      </scroll-view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from "vue"
import { regionApi, type RegionItem } from "@/api/region"
import { formatCity, ALL_CITIES_META, HOT_CITIES } from "@/constants/cities"
import HighlightText from "@/components/SearchOverlay/HighlightText.vue"
import { locateCity } from "@/utils/location"

interface CityOption {
  id: string        // 用于 isSubscribed 判断；动态模式下复用英文名
  displayName: string  // 中文名，展示 + emit 给父组件
  region: string    // 省份 / 国家标签
}

const props = defineProps<{
  visible: boolean
  selectedCity: string       // 中文城市名，用于高亮当前行
  availableCities?: string[] // 英文城市名（由 list.vue 动态传入），非空时跳过 regions API
  subscribedIds?: string[]   // 已订阅的 region.id，显示"已订阅"标记
}>()

const emit = defineEmits<{
  (e: "update:visible", v: boolean): void
  (e: "select", city: { name: string; id: string }): void
}>()

const keyword        = ref("")
const loading        = ref(false)
const allCities      = ref<CityOption[]>([])
const searchResults  = ref<CityOption[]>([])
const isSearching    = ref(false)
const displayList    = ref<CityOption[]>([])
const keyboardHeight = ref(0)   // 软键盘高度（px），用于动态上移弹层
const locating       = ref(false) // 定位状态
const locateMsg      = ref('')    // 定位结果内联提示文案（不用 toast：会被 .city-mask 遮住）
const locateError    = ref(false) // 上述文案是否为错误态（决定配色）
const currentPage    = ref(1)    // 当前页码
const totalCount     = ref(0)    // 总数量
const loadingMore    = ref(false) // 是否正在加载更多
const hasMore        = computed(() => allCities.value.length < totalCount.value) // 是否还有更多

// 弹层动态样式：键盘弹起时上移 + 压缩最大高度，收起时还原
const popupStyle = computed(() => {
  const kh = keyboardHeight.value
  if (kh <= 0) return {}
  return {
    marginBottom: kh + "px",
    maxHeight: `calc(80vh - ${kh}px)`,
  }
})

// 热门城市：从当前 allCities 中筛选出 HOT_CITIES 定义的城市
const hotCities = computed(() => {
  const all = allCities.value
  if (!all.length) return []
  return HOT_CITIES.map((zhName) => all.find((c) => c.displayName === zhName)).filter(Boolean) as CityOption[]
})

function onKeyboardHeightChange(e: any) {
  // e.detail.height 在键盘收起时为 0，自动还原
  keyboardHeight.value = e.detail?.height ?? 0
}

// ── 将英文城市名数组转为 CityOption ──
function enListToOptions(enList: string[]): CityOption[] {
  return enList.map((en) => {
    const zh = formatCity(en) || en
    // 从 ALL_CITIES_META 里找省份标签，找不到留空
    const meta = ALL_CITIES_META.find((m) => m.name === zh)
    return { id: en, displayName: zh, region: meta?.region ?? "" }
  })
}

// ── 将 regions API 返回的列表转为 CityOption ──
function regionListToOptions(list: RegionItem[]): CityOption[] {
  return list.map((r) => ({
    id: r.id,
    // 优先从本地映射表取中文名，兜底用 regions.name（英文）
    displayName: formatCity(r.name) || r.name,
    region: r.iso || "",
  }))
}

// ── 打开弹层：数据源优先级 availableCities > regions API ──
watch(() => props.visible, async (v) => {
  if (!v) {
    keyword.value = "";
    isSearching.value = false;
    keyboardHeight.value = 0;
    currentPage.value = 1;
    locateMsg.value = "";
    locateError.value = false;
    return
  }
  // 每次打开都清掉上一轮的定位提示
  locateMsg.value = "";
  locateError.value = false;

  // 优先使用父组件传入的动态城市列表（/events/cities 接口结果）
  if (props.availableCities && props.availableCities.length > 0) {
    allCities.value   = enListToOptions(props.availableCities)
    displayList.value = applyKeyword(allCities.value, keyword.value)
    return
  }

  // 兜底：从 regions API 拉全量城市（不传 availableCities 时，或列表为空时）
  if (allCities.value.length > 0) { displayList.value = allCities.value; return }
  await loadCitiesPage(1)
})

// ── availableCities 变化时清空缓存，下次打开重新计算 ──
watch(() => props.availableCities, () => { allCities.value = []; currentPage.value = 1 })

// ── 加载城市分页数据 ──
async function loadCitiesPage(page: number) {
  const isFirstPage = page === 1
  if (isFirstPage) {
    loading.value = true
  } else {
    loadingMore.value = true
  }

  try {
    const r = await regionApi.listCities(page, 200)
    const newCities = regionListToOptions(r.list)

    if (isFirstPage) {
      allCities.value = newCities
    } else {
      allCities.value = [...allCities.value, ...newCities]
    }

    totalCount.value = r.total
    currentPage.value = page
    displayList.value = allCities.value
  } catch {
    if (isFirstPage) {
      displayList.value = []
    }
  } finally {
    loading.value = false
    loadingMore.value = false
  }
}

// ── 滚动到底部加载更多 ──
function onScrollToLower() {
  // 搜索模式下不加载更多（搜索结果已全部返回）
  if (keyword.value.trim()) return
  // 正在加载或没有更多数据时不重复加载
  if (loadingMore.value || !hasMore.value) return

  loadCitiesPage(currentPage.value + 1)
}

// ── 本地关键字过滤 ──
function applyKeyword(options: CityOption[], kw: string): CityOption[] {
  if (!kw.trim()) return options
  const lower = kw.toLowerCase()
  return options.filter(
    (c) => c.displayName.includes(kw) || c.id.toLowerCase().includes(lower),
  )
}

let searchTimer: ReturnType<typeof setTimeout> | null = null
// 定位超时兜底句柄必须提到模块级：早前是 reLocate() 的局部变量，
// 用户在 3s 内直接关掉弹窗时无人能 clearTimeout，回调会对已卸载的组件写 ref
let locateSafeTimer: ReturnType<typeof setTimeout> | null = null

function clearLocateSafeTimer() {
  if (locateSafeTimer) {
    clearTimeout(locateSafeTimer)
    locateSafeTimer = null
  }
}

/** 弹窗被卸载时停掉所有在途定时器 */
function clearCityPickerTimers() {
  if (searchTimer) {
    clearTimeout(searchTimer)
    searchTimer = null
  }
  clearLocateSafeTimer()
}

onUnmounted(() => {
  clearCityPickerTimers()
})

function onSearch() {
  if (searchTimer) clearTimeout(searchTimer)
  // 开始搜索即清掉上一轮的定位提示
  locateMsg.value = ''

  if (!keyword.value.trim()) {
    isSearching.value = false
    displayList.value = allCities.value
    return
  }

  // 有 availableCities 时本地过滤即可，无需调后端搜索
  if (props.availableCities && props.availableCities.length > 0) {
    isSearching.value = true
    displayList.value = applyKeyword(allCities.value, keyword.value)
    return
  }

  // 搜索模式：调用后端搜索接口，返回所有匹配结果（不限200条）
  searchTimer = setTimeout(async () => {
    searchTimer = null
    isSearching.value = true
    loading.value = true
    try {
      const r = await regionApi.search(keyword.value.trim(), 1, 100) // 搜索结果最多100条
      searchResults.value = regionListToOptions(r.list)
      displayList.value   = searchResults.value
    } catch {
      displayList.value = []
    } finally {
      loading.value = false
    }
  }, 300)
}

function isSubscribed(id: string): boolean {
  return props.subscribedIds ? props.subscribedIds.includes(id) : false
}

function close() {
  emit("update:visible", false)
}

function pick(city: CityOption) {
  // emit { name, id } 对象，上层可按需取中文名或 region.id（UUID）
  // 兼容历史：name 保留中文显示名，id 为 regions 表主键（订阅流程需要）
  emit("select", { name: city.displayName, id: city.id })
  emit("update:visible", false)
}

// 重新定位功能
async function reLocate() {
  locating.value = true
  locateMsg.value = ''
  locateError.value = false

  // 超时兜底：3s 内未完成则显示提示
  const fallback = () => {
    locateSafeTimer = null
    locating.value = false
    locateMsg.value = "定位失败，请手动选择"
    locateError.value = true
  }
  if (locateSafeTimer) clearTimeout(locateSafeTimer)
  locateSafeTimer = setTimeout(fallback, 3000)

  try {
    // force: true —— 用户点「重新定位」的前提就是当前城市不对（出差 / 换网络 / 用了代理），
    // 若命中 24h 缓存按下去毫无变化，这个按钮就等于坏了。
    const city = await locateCity({ force: true })
    clearLocateSafeTimer()
    // 接口返回与兜底定时器谁先到不确定，fallback 已把 locating 置 false 即代表它赢了
    if (!locating.value) return
    console.log("[CityPicker] IP 定位结果:", city)
    const cityOption = allCities.value.find((c) => c.displayName === city)
    if (cityOption) {
      // 定位成功后自动选择该城市
      pick(cityOption)
    } else {
      // IP 库给出的城市不在可选列表里（如海外 IP），如实告知而非静默失败
      locateMsg.value = `已定位到${city}`
      locateError.value = false
    }
  } catch (e) {
    clearLocateSafeTimer()
    // 弹层打开期间的错误必须内联展示：mask 的 z-index 9999 会盖住 uni-toast 的 999
    console.error("[CityPicker] IP 定位失败", e)
    fallback()
  }
}
</script>

<style scoped>
.city-mask {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 9999;
  display: flex;
  align-items: flex-end;
}
.city-popup {
  width: 100%;
  height: 80vh; /* 固定高度，防止内容变化时弹框高度跳动 */
  background: #fff;
  border-radius: 32rpx 32rpx 0 0;
  padding: 30rpx;
  display: flex;
  flex-direction: column;
}
.city-popup-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24rpx;
}
.city-popup-title {
  font-size: 36rpx;
  font-weight: 700;
  color: #111;
}
.city-popup-close {
  font-size: 32rpx;
  color: #999;
  padding: 10rpx;
}
.city-search {
  display: flex;
  align-items: center;
  gap: 10rpx;
  background: rgba(248, 248, 248, 1);
  border: 2rpx solid rgba(254, 165, 0, 1);
  border-radius: 40rpx;
  padding: 14rpx 24rpx;
  margin-bottom: 16rpx;
}
.city-search-input {
  flex: 1;
  font-size: 26rpx;
  color: #111;
  background: transparent;
}
.city-search-placeholder {
  color: #bbb;
}
.city-search-clear {
  font-size: 24rpx;
  color: #999;
  padding: 0 4rpx;
}
.city-locate-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16rpx;
  padding: 0 8rpx;
}
.city-locate-label {
  font-size: 24rpx;
  color: #999;
}
.city-locate-msg {
  font-size: 24rpx;
  color: rgba(32, 180, 170, 1);
  line-height: 1.5;
  padding: 0 8rpx;
  margin-bottom: 16rpx;
}
.city-locate-msg--error {
  color: #e64340;
}
.city-locate-btn {
  display: flex;
  align-items: center;
  gap: 8rpx;
  background: rgba(32, 226, 215, 0.12);
  border-radius: 30rpx;
  padding: 12rpx 24rpx;
}
.city-locate-text {
  font-size: 26rpx;
  color: rgba(32, 180, 170, 1);
  font-weight: 500;
}
.city-list-scroll {
  flex: 1;
  overflow: hidden; /* 配合 scroll-view 的 scroll-y 属性 */
}
.city-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24rpx 8rpx;
  border-bottom: 1rpx solid rgba(240, 240, 240, 1);
}
.city-row--active {
  background: rgba(254, 165, 0, 0.06);
}
.city-row-left {
  font-size: 30rpx;
  color: rgba(254, 165, 0, 1);
  font-weight: 500;
}
.city-row-right {
  display: flex;
  align-items: center;
  gap: 6rpx;
}
.city-row-region {
  font-size: 22rpx;
  color: rgba(220, 80, 80, 1);
}
.subscribed-badge {
  font-size: 20rpx;
  color: #fea500;
  background: rgba(254, 165, 0, 0.12);
  border-radius: 20rpx;
  padding: 4rpx 14rpx;
}
.city-loading {
  padding: 60rpx 0;
  text-align: center;
}
.city-loading-text {
  font-size: 26rpx;
  color: #999;
}
.city-empty {
  padding: 60rpx 0;
  text-align: center;
}
.city-empty-text {
  font-size: 26rpx;
  color: #999;
}
.city-loading-more {
  padding: 30rpx 0;
  text-align: center;
}
.city-loading-more-text {
  font-size: 24rpx;
  color: #999;
}
/* 热门城市区块 */
.city-hot-section {
  margin-bottom: 24rpx;
}
.city-section-title {
  font-size: 24rpx;
  color: #999;
  display: block;
  margin-bottom: 16rpx;
  padding-left: 8rpx;
}
.city-hot-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16rpx;
}
.city-hot-item {
  background: rgba(248, 248, 248, 1);
  border-radius: 12rpx;
  padding: 20rpx 16rpx;
  text-align: center;
}
.city-hot-item--active {
  background: rgba(254, 165, 0, 0.12);
}
.city-hot-item-text {
  font-size: 26rpx;
  color: #333;
}
.city-hot-item--active .city-hot-item-text {
  color: rgba(254, 165, 0, 1);
  font-weight: 600;
}
/* 全部城市标题区 */
.city-section {
  margin-top: 16rpx;
  margin-bottom: 8rpx;
}
</style>
