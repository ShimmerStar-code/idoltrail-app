<!--
  EventFilters  活动列表顶部 5 胶囊筛选条
  ─────────────────────────────────────
  对应设计稿顶部那行 5 个圆角胶囊：城市 / 类型 / 圈子 / 状态 / 日历。
  完全受控组件，通过 emit 上报当前选择。

  props（均受控）:
    selectedCity      string           当前中文城市名，空 = 全国
    selectedType      string           event_type code，空 = 全部
    selectedGenre     string           圈子 = 流派(GENRES.code,例如 CPOP/JPOP/KPOP/...);空 = 全部
    selectedStatus    string           event_status code，空 = 全部
    calendarExpanded  boolean          日历是否展开

  emits:
    update:selectedCity / update:selectedType / update:selectedGenre / update:selectedStatus / update:calendarExpanded
    open-city                          城市胶囊被点击（父组件弹出 CityPicker）
-->
<template>
  <view class="filters">
    <view
      class="filter-pill"
      :class="{ 'filter-pill--active': selectedCity }"
    >
      <!-- cityLabel 由父组件传入中文展示名（formatCity 转换后），未传则回退"城市" -->
      <view class="filter-pill-content" @click="$emit('open-city')">
        <text class="filter-pill-text">{{ cityLabel || '城市' }}</text>
        <uni-icons
          v-if="!selectedCity"
          type="search"
          size="12"
          :color="selectedCity ? '#fff' : '#999'"
        />
      </view>
      <!-- 清除按钮：选中城市后显示 × -->
      <view v-if="selectedCity" class="filter-pill-clear" @click.stop="clearCity">
        <text class="filter-pill-clear-icon">✕</text>
      </view>
    </view>

    <view
      class="filter-pill"
      :class="{ 'filter-pill--active': selectedType }"
      @click="toggleType"
    >
      <text class="filter-pill-text">{{ typeLabel }}</text>
      <uni-icons type="arrow-down" size="12" :color="selectedType ? '#fff' : '#999'" />
    </view>

    <view
      class="filter-pill"
      :class="{ 'filter-pill--active': selectedGenre }"
      @click="toggleCircle"
    >
      <text class="filter-pill-text">{{ circleLabel }}</text>
      <uni-icons type="arrow-down" size="12" :color="selectedGenre ? '#fff' : '#999'" />
    </view>

    <view
      class="filter-pill"
      :class="{ 'filter-pill--active': selectedStatus }"
      @click="toggleStatus"
    >
      <text class="filter-pill-text">{{ statusLabel }}</text>
      <uni-icons type="arrow-down" size="12" :color="selectedStatus ? '#fff' : '#999'" />
    </view>

    <!-- 日历胶囊：有日期筛选（selectedDate 非空）或已展开时均显示激活态 -->
    <view
      class="filter-pill"
      :class="{ 'filter-pill--active': calendarExpanded || !!selectedDate }"
      @click="toggleCalendar"
    >
      <text class="filter-pill-text">{{ selectedDate || '日历' }}</text>
      <uni-icons
        :type="calendarExpanded ? 'arrow-up' : 'arrow-down'"
        size="12"
        :color="(calendarExpanded || !!selectedDate) ? '#fff' : '#999'"
      />
    </view>

    <!-- 类型弹层 -->
    <view v-if="showTypePicker" class="picker-mask" @click="showTypePicker = false">
      <view class="picker-panel" @click.stop>
        <view class="picker-row" @click="pickType('')">
          <text class="picker-text">全部类型</text>
        </view>
        <view
          v-for="t in EVENT_TYPE_OPTIONS"
          :key="t.code"
          class="picker-row"
          @click="pickType(t.code)"
        >
          <text class="picker-text">{{ t.label }}</text>
        </view>
      </view>
    </view>

    <!-- 圈子弹层（与首页 10 个标签分类一致） -->
    <view v-if="showCirclePicker" class="picker-mask" @click="showCirclePicker = false">
      <view class="picker-panel" @click.stop>
        <view class="picker-row" @click="pickCircle('')">
          <text class="picker-text">全部</text>
        </view>
        <view
          v-for="g in GENRES"
          :key="g.code + '-' + g.label"
          class="picker-row"
          :class="{ 'picker-row--active': g.code === selectedGenre }"
          @click="pickCircle(g.code)"
        >
          <text class="picker-text">{{ g.label }}</text>
        </view>
      </view>
    </view>

    <!-- 状态弹层 -->
    <view v-if="showStatusPicker" class="picker-mask" @click="showStatusPicker = false">
      <view class="picker-panel" @click.stop>
        <view class="picker-row" @click="pickStatus('')">
          <text class="picker-text">全部状态</text>
        </view>
        <view
          v-for="s in EVENT_STATUS_OPTIONS"
          :key="s.code"
          class="picker-row"
          @click="pickStatus(s.code)"
        >
          <text class="picker-text">{{ s.label }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from "vue"
import { EVENT_TYPE_OPTIONS, EVENT_STATUS_OPTIONS } from "@/constants/eventMeta"
import { GENRES, getGenreByCode } from "@/constants/genres"

const props = defineProps<{
  selectedCity: string
  selectedType: string
  selectedGenre: string
  selectedStatus: string
  selectedDate: string      // 当前选中的日期，空 = 未选；用于胶囊激活态
  calendarExpanded: boolean
  cityLabel?: string
}>()

const emit = defineEmits<{
  (e: "update:selectedCity", v: string): void
  (e: "update:selectedType", v: string): void
  (e: "update:selectedGenre", v: string): void
  (e: "update:selectedStatus", v: string): void
  (e: "update:selectedDate", v: string): void
  (e: "update:calendarExpanded", v: boolean): void
  (e: "open-city"): void
}>()

const showTypePicker = ref(false)
const showCirclePicker = ref(false)
const showStatusPicker = ref(false)

const typeLabel = computed(() => {
  const t = EVENT_TYPE_OPTIONS.find((o) => o.code === props.selectedType)
  return t ? t.label : "类型"
})

const circleLabel = computed(() => {
  const g = getGenreByCode(props.selectedGenre)
  return g ? g.label : "标签"
})

const statusLabel = computed(() => {
  const s = EVENT_STATUS_OPTIONS.find((o) => o.code === props.selectedStatus)
  return s ? s.label : "状态"
})

function toggleType() {
  showCirclePicker.value = false
  showStatusPicker.value = false
  showTypePicker.value = !showTypePicker.value
}
function toggleCircle() {
  showTypePicker.value = false
  showStatusPicker.value = false
  showCirclePicker.value = !showCirclePicker.value
}
function toggleStatus() {
  showTypePicker.value = false
  showCirclePicker.value = false
  showStatusPicker.value = !showStatusPicker.value
}
function toggleCalendar() {
  emit("update:calendarExpanded", !props.calendarExpanded)
}
function clearCity() {
  emit("update:selectedCity", "")
}
function pickType(code: string) {
  emit("update:selectedType", code)
  showTypePicker.value = false
}
function pickCircle(code: string) {
  emit("update:selectedGenre", code)
  showCirclePicker.value = false
}
function pickStatus(code: string) {
  emit("update:selectedStatus", code)
  showStatusPicker.value = false
}
</script>

<style scoped>
.filters {
  display: flex;
  gap: 16rpx;
  padding: 20rpx 30rpx;
  background: #fff;
  flex-wrap: nowrap;
  overflow-x: auto;
}
.filter-pill {
  display: inline-flex;
  align-items: center;
  gap: 6rpx;
  background: #fff;
  border: 2rpx solid rgba(240, 240, 240, 1);
  border-radius: 40rpx;
  padding: 12rpx 24rpx;
  flex-shrink: 0;
  transition: background 0.15s, border-color 0.15s;
  position: relative;
}
.filter-pill-content {
  display: inline-flex;
  align-items: center;
  gap: 6rpx;
}
.filter-pill-clear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-left: 4rpx;
  padding: 0 4rpx;
}
.filter-pill-clear-icon {
  font-size: 20rpx;
  color: #fff;
  line-height: 1;
}
.filter-pill--active {
  background: rgba(254, 165, 0, 1);
  border-color: transparent;
}
.filter-pill-text {
  font-size: 26rpx;
  color: #333;
  white-space: nowrap;
}
.filter-pill--active .filter-pill-text {
  color: #fff;
}

/* 简易弹层 */
.picker-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: flex-end;
  z-index: 999;
}
.picker-panel {
  width: 100%;
  max-height: 50vh;
  background: #fff;
  border-radius: 24rpx 24rpx 0 0;
  padding: 16rpx 0 32rpx;
  overflow-y: auto;
}
.picker-row {
  padding: 24rpx 32rpx;
  border-bottom: 1rpx solid #f0f0f0;
}
.picker-row:last-child {
  border-bottom: none;
}
.picker-text {
  font-size: 28rpx;
  color: rgba(51, 51, 51, 1);
}
</style>
