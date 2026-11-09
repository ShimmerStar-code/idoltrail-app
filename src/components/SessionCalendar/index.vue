<!--
  SessionCalendar  场次日历弹层
  ─────────────────────────────────────
  用途：活动详情页点「场次日期行」后弹出，直观看到「今天在哪、这场活动在哪几天演」。

  设计取舍：
  · **自绘而不是用 uni-calendar**：uni-calendar 的主题色写死在 $uni-primary，
    与本项目的活动主题色体系对不上；标记日期也没有对外 API
    （extraInfo/fillInfo 都是内部状态）。自绘 60 行就能完全按主题色走。
  · **只突出两类日期**：今天（浅底 + 主题色描边）与演出日（主题色实心）。
    其余日期留白，避免整张日历花花绿绿。
  · 周一为一周起点（国内习惯），与系统日历一致。

  props:
    visible       boolean  是否显示
    markDates     string[] 演出日期集合（YYYY-MM-DD）
    today         string   今天（YYYY-MM-DD），不传则用本机日期
    currentDate   string   当前选中的场次日期（高亮）
    themeColor    string   主题色（活动主题色），默认品牌粉

  emits:
    update:visible
    close
    pick        { date } 点了某个演出日
-->
<template>
  <view v-if="visible" class="cal-mask" @click="close" @touchmove.stop.prevent>
    <view class="cal-panel" @click.stop>
      <view class="cal-header">
        <view class="cal-nav" hover-class="cal-nav--hover" @click="shiftMonth(-1)">
          <uni-icons type="left" size="18" color="#666" />
        </view>
        <text class="cal-title">{{ year }} 年 {{ month }} 月</text>
        <view class="cal-nav" hover-class="cal-nav--hover" @click="shiftMonth(1)">
          <uni-icons type="right" size="18" color="#666" />
        </view>
      </view>

      <view class="cal-week">
        <text v-for="w in weekLabels" :key="w" class="cal-week-text">{{ w }}</text>
      </view>

      <view class="cal-grid">
        <view
          v-for="cell in cells"
          :key="cell.key"
          class="cal-cell"
          :class="{
            'cal-cell--today': cell.isToday,
            'cal-cell--mark': cell.isMark,
            'cal-cell--current': cell.isCurrent,
          }"
          :style="cellStyle(cell)"
          @click="onCellTap(cell)"
        >
          <text class="cal-cell-text" :class="{ 'cal-cell-text--invert': cell.isMark }">{{
            cell.day
          }}</text>
        </view>
      </view>

      <view class="cal-legend">
        <view class="cal-legend-item">
          <view class="cal-legend-dot cal-legend-dot--today" />
          <text class="cal-legend-text">今天</text>
        </view>
        <view class="cal-legend-item">
          <view class="cal-legend-dot cal-legend-dot--mark" :style="markStyle" />
          <text class="cal-legend-text">演出日</text>
        </view>
      </view>

      <view class="cal-close" hover-class="cal-close--hover" @click="close">
        <text class="cal-close-text">关闭</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";

const props = withDefaults(
  defineProps<{
    visible: boolean;
    markDates?: string[];
    today?: string;
    currentDate?: string;
    themeColor?: string;
  }>(),
  {
    markDates: () => [],
    today: "",
    currentDate: "",
    themeColor: "#FF6B9D",
  },
);

const emit = defineEmits<{
  (e: "update:visible", v: boolean): void;
  (e: "close"): void;
  (e: "pick", payload: { date: string }): void;
}>();

/** 周一起始 */
const weekLabels = ["一", "二", "三", "四", "五", "六", "日"];

function todayYMD(): string {
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${m}-${d}`;
}

/** 当前显示的月份（1-based） */
const year = ref(new Date().getFullYear());
const month = ref(new Date().getMonth() + 1);

const today = computed(() => props.today || todayYMD());

/**
 * 打开时定位月份：优先当前场次日期所在月，其次今天所在月。
 * 活动在三个月后时，日历一打开就该看到那三个月，而不是停在今天。
 */
watch(
  () => props.visible,
  (v) => {
    if (!v) return;
    const anchor = props.currentDate || props.markDates?.[0] || today.value;
    const [y, m] = anchor.split("-").map((n) => parseInt(n, 10));
    if (y && m) {
      year.value = y;
      month.value = m;
    }
  },
  { immediate: true },
);

function shiftMonth(delta: number) {
  let m = month.value + delta;
  let y = year.value;
  if (m < 1) {
    m = 12;
    y -= 1;
  } else if (m > 12) {
    m = 1;
    y += 1;
  }
  year.value = y;
  month.value = m;
}

interface Cell {
  key: string;
  day: number;
  date: string;
  isToday: boolean;
  isMark: boolean;
  isCurrent: boolean;
}

const cells = computed<Cell[]>(() => {
  const markSet = new Set(props.markDates || []);
  const first = new Date(year.value, month.value - 1, 1);
  // 周一为一周起点：getDay() 是 0(周日)…6(周六)
  const offset = (first.getDay() + 6) % 7;
  const days = new Date(year.value, month.value, 0).getDate();
  const out: Cell[] = [];
  for (let i = 0; i < offset; i++) {
    out.push({
      key: `pad-${i}`,
      day: 0,
      date: "",
      isToday: false,
      isMark: false,
      isCurrent: false,
    });
  }
  for (let d = 1; d <= days; d++) {
    const mm = String(month.value).padStart(2, "0");
    const dd = String(d).padStart(2, "0");
    const date = `${year.value}-${mm}-${dd}`;
    out.push({
      key: date,
      day: d,
      date,
      isToday: date === today.value,
      isMark: markSet.has(date),
      isCurrent: !!props.currentDate && props.currentDate === date,
    });
  }
  return out;
});

const markStyle = computed(() => ({
  backgroundColor: props.themeColor,
  borderColor: props.themeColor,
}));

/**
 * 单个格子的内联样式。
 *
 * 主题色走内联而不是 CSS 里的 v-bind()：uni-app 的 App 端样式编译链
 * 对 v-bind() in CSS 的支持不稳（部分版本会原样输出 var() 而不注入变量），
 * 内联是零风险的写法。
 */
function cellStyle(cell: Cell) {
  if (cell.isMark) {
    return { backgroundColor: props.themeColor, borderColor: props.themeColor };
  }
  if (cell.isToday) {
    return { borderColor: props.themeColor };
  }
  return undefined;
}

function onCellTap(cell: Cell) {
  if (!cell.date) return;
  // 只响应演出日：普通日期点了没意义
  if (!cell.isMark) return;
  emit("pick", { date: cell.date });
}

function close() {
  emit("update:visible", false);
  emit("close");
}
</script>

<style scoped>
.cal-mask {
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.45);
  z-index: 9998;
  display: flex;
  align-items: flex-end;
}
.cal-panel {
  width: 100%;
  background: #fff;
  border-radius: 28rpx 28rpx 0 0;
  padding: 24rpx 30rpx 40rpx;
  box-sizing: border-box;
}
.cal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8rpx 0 16rpx;
}
.cal-title {
  font-size: 30rpx;
  font-weight: 600;
  color: #333;
}
.cal-nav {
  width: 56rpx;
  height: 56rpx;
  border-radius: 50%;
  background: #f5f5f5;
  display: flex;
  align-items: center;
  justify-content: center;
}
.cal-nav--hover {
  background: #e8e8e8;
}
.cal-week {
  display: flex;
  padding-bottom: 8rpx;
}
.cal-week-text {
  flex: 1;
  text-align: center;
  font-size: 22rpx;
  color: #999;
}
.cal-grid {
  display: flex;
  flex-wrap: wrap;
}
.cal-cell {
  width: 14.28%;
  height: 76rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
}
.cal-cell-text {
  font-size: 26rpx;
  color: #333;
}
.cal-cell-text--invert {
  color: #fff;
}
/* 今天：浅底 + 主题色描边（描边色由内联给） */
.cal-cell--today {
  border: 2rpx solid transparent;
  border-radius: 50%;
  width: 60rpx;
  height: 60rpx;
}
/* 演出日：主题色实心 */
.cal-cell--mark {
  border-radius: 50%;
  width: 60rpx;
  height: 60rpx;
}
/* 当前场次：加一圈外框，和其它演出日区分 */
.cal-cell--current {
  box-shadow: 0 0 0 4rpx rgba(0, 0, 0, 0.08);
}
.cal-legend {
  display: flex;
  align-items: center;
  padding: 20rpx 0 8rpx;
}
.cal-legend-item {
  display: flex;
  align-items: center;
  margin-right: 32rpx;
}
.cal-legend-dot {
  width: 24rpx;
  height: 24rpx;
  border-radius: 50%;
  margin-right: 8rpx;
}
.cal-legend-dot--today {
  border: 2rpx solid #bbb;
}
.cal-legend-dot--mark {
  background: #ff6b9d;
}
.cal-legend-text {
  font-size: 22rpx;
  color: #999;
}
.cal-close {
  margin-top: 16rpx;
  height: 80rpx;
  border-radius: 40rpx;
  background: #f5f5f5;
  display: flex;
  align-items: center;
  justify-content: center;
}
.cal-close--hover {
  background: #ebebeb;
}
.cal-close-text {
  font-size: 28rpx;
  color: #666;
}
</style>
