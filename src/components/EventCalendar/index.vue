<!--
  EventCalendar  活动列表顶部日历
  ─────────────────────────────────────
  截图 2 中点开"日历"胶囊后展开的大日历:6 行 × 7 列,每天显示"X 场"。
  完全受控,父组件传 yearMonth / selectedDate / dailyCounts。

  props:
    yearMonth      string                  'YYYY-MM'
    selectedDate   string                  'YYYY-MM-DD',空 = 不选中
    dailyCounts    Record<string, number>  每日活动数

  emits:
    update:yearMonth
    update:selectedDate
-->
<template>
  <view class="cal">
    <view class="cal-header">
      <view class="cal-title">
        <text class="cal-month">{{ monthLabel }}</text>
        <view v-if="selectedDate" class="cal-clear" @click="onClearDate">
          <text class="cal-clear-text">清除日期</text>
        </view>
      </view>
      <view class="cal-nav">
        <view class="cal-nav-btn" @click="prevMonth">
          <uni-icons type="left" size="16" color="#fff" />
        </view>
        <view class="cal-nav-btn" @click="nextMonth">
          <uni-icons type="right" size="16" color="#fff" />
        </view>
      </view>
    </view>
    <view class="cal-weekdays">
      <text v-for="w in weekdays" :key="w" class="cal-weekday">{{ w }}</text>
    </view>
    <view class="cal-grid">
      <view
        v-for="(cell, i) in cells"
        :key="i"
        class="cal-cell"
        :class="{
          'cal-cell--out': !cell.inMonth,
          'cal-cell--selected': cell.isSelected,
          'cal-cell--today': cell.isToday,
        }"
        @click="onCellClick(cell)"
      >
        <text
          v-if="cell.day"
          class="cal-day"
          :class="{
            'cal-day--selected': cell.isSelected,
            'cal-day--today': cell.isToday && !cell.isSelected,
          }"
        >{{ cell.day }}</text>
        <text
          v-if="cell.day && cell.count > 0"
          class="cal-count"
          :class="{ 'cal-count--selected': cell.isSelected }"
        >{{ cell.count }}场</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from "vue"

interface DayCell {
  day: number | null
  inMonth: boolean
  isToday: boolean
  isSelected: boolean
  count: number
  dateStr: string
}

const props = defineProps<{
  yearMonth: string
  selectedDate: string
  dailyCounts: Record<string, number>
}>()

const emit = defineEmits<{
  (e: "update:yearMonth", v: string): void
  (e: "update:selectedDate", v: string): void
}>()

const weekdays = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]

const MONTH_ZH = ["一月","二月","三月","四月","五月","六月","七月","八月","九月","十月","十一月","十二月"]

const monthLabel = computed(() => {
  const [y, m] = props.yearMonth.split("-").map(Number)
  if (!y || !m) return ""
  // 直接字符串拼接，避免 toLocaleString 在小程序中返回完整日期串
  return `${y}年${MONTH_ZH[m - 1]}`
})

const todayStr = computed(() => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
})

const cells = computed<DayCell[]>(() => {
  const [y, m] = props.yearMonth.split("-").map(Number)
  if (!y || !m) return []
  const firstDay = new Date(y, m - 1, 1)
  const startWeekday = firstDay.getDay() // 0=Sun
  const daysInMonth = new Date(y, m, 0).getDate()
  const prevMonthDays = new Date(y, m - 1, 0).getDate()

  const out: DayCell[] = []
  // 上月尾巴
  for (let i = startWeekday - 1; i >= 0; i--) {
    const d = prevMonthDays - i
    const date = new Date(y, m - 2, d)
    out.push(makeCell(date, false))
  }
  // 当月
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(y, m - 1, d)
    out.push(makeCell(date, true))
  }
  // 补齐到当前行结束（最少 35 格），不强制第 6 行
  // 如果最后一天恰好在行末（周六），就是 35 格；否则最多补到 42。
  // 只补到当前行结束，避免末行全是下月灰色格浪费空间。
  const minCells = Math.ceil((startWeekday + daysInMonth) / 7) * 7
  while (out.length < minCells) {
    const idx = out.length - (startWeekday + daysInMonth) + 1
    const date = new Date(y, m, idx)
    out.push(makeCell(date, false))
  }
  return out
})

function makeCell(date: Date, inMonth: boolean): DayCell {
  const y = date.getFullYear()
  const m = date.getMonth() + 1
  const d = date.getDate()
  const dateStr = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
  return {
    day: inMonth ? d : date.getDate(),
    inMonth,
    isToday: dateStr === todayStr.value,
    isSelected: dateStr === props.selectedDate,
    count: props.dailyCounts[dateStr] || 0,
    dateStr,
  }
}

function onCellClick(cell: DayCell) {
  if (!cell.inMonth) return
  // 点击已选中的日期 → 取消选择（清空日期筛选）；否则选中该日期
  emit("update:selectedDate", cell.isSelected ? "" : cell.dateStr)
  const [y, m] = cell.dateStr.split("-")
  const newYM = `${y}-${m}`
  if (newYM !== props.yearMonth) emit("update:yearMonth", newYM)
}

// 头部“清除日期”按钮：只清筛选，不收起日历、不改月份，方便立即重选
function onClearDate() {
  emit("update:selectedDate", "")
}

function prevMonth() {
  const [y, m] = props.yearMonth.split("-").map(Number)
  const d = new Date(y, m - 2, 1)
  emit(
    "update:yearMonth",
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
  )
}
function nextMonth() {
  const [y, m] = props.yearMonth.split("-").map(Number)
  const d = new Date(y, m, 1)
  emit(
    "update:yearMonth",
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
  )
}
</script>

<style scoped>
.cal {
  background: rgba(254, 165, 0, 1);
  border-radius: 24rpx;
  margin: 0 24rpx 20rpx;
  padding: 24rpx 20rpx 32rpx;
  color: #fff;
}
.cal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20rpx;
  padding: 0 8rpx;
}
.cal-title {
  display: flex;
  align-items: center;
  gap: 16rpx;
  min-width: 0;
}
.cal-month {
  font-size: 30rpx;
  font-weight: 600;
  color: #fff;
}
.cal-clear {
  display: flex;
  align-items: center;
  background: rgba(255, 255, 255, 0.25);
  border-radius: 20rpx;
  padding: 6rpx 16rpx;
}
.cal-clear-text {
  font-size: 20rpx;
  color: #fff;
  line-height: 1;
}
.cal-nav {
  display: flex;
  gap: 12rpx;
}
.cal-nav-btn {
  width: 48rpx;
  height: 48rpx;
  background: rgba(255, 255, 255, 0.25);
  border-radius: 24rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}
.cal-weekdays {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  margin-bottom: 12rpx;
}
.cal-weekday {
  text-align: center;
  font-size: 22rpx;
  color: rgba(255, 255, 255, 0.85);
  padding: 8rpx 0;
}
.cal-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  row-gap: 4rpx;
}
.cal-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 90rpx;
  padding: 8rpx 0;
  position: relative;
  border-radius: 16rpx;
}
.cal-cell--out {
  opacity: 0.35;
}
.cal-cell--selected {
  background: #fff;
}
.cal-day {
  font-size: 28rpx;
  color: #fff;
  font-weight: 500;
  position: relative;
}
.cal-day--selected {
  color: rgba(254, 165, 0, 1);
  font-weight: 700;
}
.cal-day--today {
  position: relative;
}
.cal-day--today::after {
  content: "";
  position: absolute;
  right: -10rpx;
  bottom: 4rpx;
  width: 8rpx;
  height: 8rpx;
  background: #fff;
  border-radius: 4rpx;
}
.cal-count {
  font-size: 20rpx;
  color: rgba(255, 255, 255, 0.85);
  margin-top: 4rpx;
}
.cal-count--selected {
  color: rgba(254, 165, 0, 1);
}
</style>
