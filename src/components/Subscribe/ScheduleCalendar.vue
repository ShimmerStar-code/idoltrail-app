<!--
  ScheduleCalendar  我的日程（月历视图）
  ─────────────────────────────────────────────
  订阅了活动之后，用户需要的是「日历上有一场演出提醒我」，
  而不是 App 里的一份订阅列表。本组件把订阅活动按日期铺到月历上：
  有活动的日期高亮并显示当天场次，点某天可以看当天有哪些场。

  数据来源：订阅页的「进行中」订阅活动（EventCardVO[]），
  只用到日期与标题，因此组件对外的入参是精简后的结构。

  props:
    items     ScheduleItem[]  活动（startDate/endDate 可为多天区间）
    month     string          当前月份 YYYY-MM（受控）
  emits:
    (e:'update:month', v:string)  切换月份
    (e:'pick-day', v:string)      选中某天（YYYY-MM-DD）
-->
<template>
  <view class="cal">
    <!-- 月份切换 -->
    <view class="cal-head">
      <view class="cal-nav" @click="shiftMonth(-1)">
        <uni-icons type="left" size="16" color="#666" />
      </view>
      <text class="cal-title">{{ monthLabel }}</text>
      <view class="cal-nav" @click="shiftMonth(1)">
        <uni-icons type="right" size="16" color="#666" />
      </view>
    </view>

    <!-- 星期表头 -->
    <view class="week-row">
      <text v-for="w in WEEK_LABELS" :key="w" class="week-cell">{{ w }}</text>
    </view>

    <!-- 日期格子 -->
    <view class="grid">
      <view
        v-for="cell in cells"
        :key="cell.key"
        class="day-cell"
        :class="{
          'day-cell--muted': !cell.inMonth,
          'day-cell--today': cell.date === today,
          'day-cell--selected': cell.date === selected,
          'day-cell--has': cell.count > 0,
        }"
        @click="onPick(cell)"
      >
        <text class="day-num">{{ cell.day }}</text>
        <view v-if="cell.count > 0" class="day-dot" />
        <text v-if="cell.count > 1" class="day-count">{{ cell.count }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from "vue";

export interface ScheduleItem {
  id: number;
  title: string;
  /** YYYY-MM-DD */
  startDate: string;
  /** YYYY-MM-DD，缺省等于 startDate */
  endDate?: string;
  city?: string;
}

const props = withDefaults(
  defineProps<{
    items: ScheduleItem[];
    month: string;
    selected?: string;
  }>(),
  { selected: "" },
);

const emit = defineEmits<{
  (e: "update:month", v: string): void;
  (e: "pick-day", v: string): void;
}>();

const WEEK_LABELS = ["日", "一", "二", "三", "四", "五", "六"];

const today = (() => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(
    n.getDate(),
  ).padStart(2, "0")}`;
})();

/** YYYY-MM-DD → Date（按本地时区解析，避免 new Date('2026-01-05') 被当成 UTC） */
function parseYmd(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/**
 * 日期 → 场次数。
 *
 * 跨天活动（start ~ end）会把区间内的每一天都算上，
 * 否则多日巡演在日历上只显示第一天，用户会以为没有别的场次。
 */
const countByDate = computed(() => {
  const map = new Map<string, number>();
  for (const it of props.items) {
    const start = it.startDate ? String(it.startDate).slice(0, 10) : "";
    if (!start) continue;
    const end = String(it.endDate || start).slice(0, 10);
    let cur = parseYmd(start);
    const last = parseYmd(end);
    // 上限 31 天：脏数据里 end_date 可能是 2099 年，无脑循环会卡死 UI
    for (let i = 0; i < 31; i++) {
      const key = ymd(cur);
      map.set(key, (map.get(key) || 0) + 1);
      if (key === ymd(last)) break;
      cur = new Date(cur.getTime() + 86400000);
    }
  }
  return map;
});

interface Cell {
  key: string;
  date: string;
  day: number;
  inMonth: boolean;
  count: number;
}

const monthLabel = computed(() => {
  const [y, m] = props.month.split("-");
  return `${y} 年 ${Number(m)} 月`;
});

const cells = computed<Cell[]>(() => {
  const [y, m] = props.month.split("-").map(Number);
  const first = new Date(y, (m || 1) - 1, 1);
  // 以周日为一周起点：first.getDay() 就是当月 1 号落在周几
  const start = new Date(first.getTime() - first.getDay() * 86400000);
  const out: Cell[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getTime() + i * 86400000);
    const date = ymd(d);
    out.push({
      key: date,
      date,
      day: d.getDate(),
      inMonth: d.getMonth() === first.getMonth(),
      count: countByDate.value.get(date) || 0,
    });
  }
  return out;
});

function shiftMonth(delta: number) {
  const [y, m] = props.month.split("-").map(Number);
  const d = new Date(y, (m || 1) - 1 + delta, 1);
  emit(
    "update:month",
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
  );
}

function onPick(cell: Cell) {
  if (!cell.inMonth) return;
  emit("pick-day", cell.date);
}
</script>

<style scoped>
.cal {
  background: #fff;
  border-radius: 24rpx;
  border: 1rpx solid rgba(236, 236, 236, 1);
  padding: 20rpx 24rpx 16rpx;
  margin: 0 30rpx;
}
.cal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8rpx 8rpx 16rpx;
}
.cal-title {
  font-size: 30rpx;
  font-weight: 600;
  color: #111;
}
.cal-nav {
  width: 56rpx;
  height: 56rpx;
  border-radius: 28rpx;
  background: rgba(245, 245, 245, 1);
  display: flex;
  align-items: center;
  justify-content: center;
}
.week-row {
  display: flex;
}
.week-cell {
  flex: 1;
  text-align: center;
  font-size: 22rpx;
  color: #999;
  padding: 8rpx 0;
}
.grid {
  display: flex;
  flex-wrap: wrap;
}
.day-cell {
  width: 14.285%;
  height: 76rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: relative;
  box-sizing: border-box;
}
.day-num {
  font-size: 26rpx;
  color: #111;
  line-height: 1;
}
.day-cell--muted .day-num {
  color: #ccc;
}
.day-cell--has .day-num {
  font-weight: 600;
  color: #8a5600;
}
.day-cell--today .day-num {
  color: #fea500;
}
.day-cell--selected {
  background: rgba(254, 165, 0, 0.12);
  border-radius: 12rpx;
}
.day-dot {
  width: 10rpx;
  height: 10rpx;
  border-radius: 5rpx;
  background: #fea500;
  margin-top: 8rpx;
}
.day-count {
  position: absolute;
  top: 2rpx;
  right: 6rpx;
  font-size: 18rpx;
  color: #8a5600;
}
</style>
