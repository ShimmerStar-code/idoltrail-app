<!--
  CitySubCard  城市 tab 卡片（设计稿第 1 张）
  ─────────────────────────────────────────────
  城市名 + 类型下拉 + 标签下拉 + 退订按钮 + "已关联X场活动"行
  props:
    item         CityCardVO                       当前卡片完整 VO
    typeOptions  { code, name_cn }[]              类型下拉候选（不传则空数组）
    tagOptions   { code, name_cn }[]              标签下拉候选（不传则空数组）
  emit:
    unsubscribe                                   退订按钮
    updateExtra   { id, type?, tag? }              类型/标签 改变
    openRelated                                    跳"已关联 X 场活动"
-->
<template>
  <view class="card">
    <!-- 头部：城市名 + 退订 -->
    <view class="head">
      <view class="filters">
        <view class="filter">
          <text class="city-name">{{ item.city.name }} ▾</text>
        </view>
        <view class="filter" @click.stop="openPicker('type')">
          <text class="filter-text">{{ typeLabel || "类型" }}</text>
          <text class="filter-arrow">▾</text>
        </view>
        <view class="filter" @click.stop="openPicker('tag')">
          <text class="filter-text">{{ tagLabel || "标签" }}</text>
          <text class="filter-arrow">▾</text>
        </view>
      </view>
      <view class="unsub" @click.stop="$emit('unsubscribe', item)">
        <text class="unsub-text">退订</text>
      </view>
    </view>

    <!-- 关联活动 strip -->
    <view class="related" @click.stop="$emit('openRelated', item)">
      <text class="related-text">已关联 {{ item.event_count }} 场活动</text>
      <uni-icons type="right" size="14" color="#999" />
    </view>

    <!-- 简易选择器（替代弹窗，避免再引入 picker 组件） -->
    <view v-if="pickerOpen" class="picker-mask" @click="closePicker">
      <view class="picker-panel" @click.stop>
        <!-- 顶部固定"全部"行 -->
        <view class="picker-row picker-row--all" @click="pick('')">
          <text class="picker-text picker-text--all">全部</text>
        </view>
        <view class="picker-divider" />
        <!-- 列表用 scroll-view，微信小程序 view 不支持 overflow-y: auto -->
        <scroll-view scroll-y class="picker-scroll">
          <view
            v-for="opt in currentOptions"
            :key="opt.code"
            class="picker-row"
            :class="{ 'picker-row--active': isCurrent(opt.code) }"
            @click="pick(opt.code)"
          >
            <text class="picker-text">{{ opt.name_cn }}</text>
            <view v-if="isCurrent(opt.code)" class="picker-check" />
          </view>
        </scroll-view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import type { CityCardVO } from "@/types/subscription";
import type { DictOption } from "@/types/dictionary";

const props = withDefaults(
  defineProps<{
    item: CityCardVO;
    typeOptions?: DictOption[];
    tagOptions?: DictOption[];
  }>(),
  {
    typeOptions: () => [],
    tagOptions: () => [],
  }
);

const emit = defineEmits<{
  (e: "unsubscribe", item: CityCardVO): void;
  (e: "updateExtra", payload: { id: string; type?: string; tag?: string }): void;
  (e: "openRelated", item: CityCardVO): void;
}>();

const pickerOpen = ref(false);
const pickerField = ref<"type" | "tag">("type");

const currentOptions = computed<DictOption[]>(() =>
  pickerField.value === "type" ? props.typeOptions : props.tagOptions
);

// 当前已选的 code（用于回显 + picker 中显示对勾）
const currentType = computed(() => props.item.extra?.type ?? "");
const currentTag = computed(() => props.item.extra?.tag ?? "");

// 当前 type/tag 对应的中文名（用于"类型/标签"按钮回显）
const typeLabel = computed(() => {
  const code = currentType.value;
  if (!code) return "";
  return props.typeOptions.find((x) => x.code === code)?.name_cn ?? code;
});
const tagLabel = computed(() => {
  const code = currentTag.value;
  if (!code) return "";
  return props.tagOptions.find((x) => x.code === code)?.name_cn ?? code;
});

function isCurrent(code: string): boolean {
  if (!code) return false;
  return pickerField.value === "type"
    ? currentType.value === code
    : currentTag.value === code;
}

function openPicker(field: "type" | "tag") {
  pickerField.value = field;
  pickerOpen.value = true;
}
function closePicker() {
  pickerOpen.value = false;
}
function pick(code: string) {
  // 选"全部" → 清空该字段；其他 → 赋值
  if (code === "") {
    emit("updateExtra", { id: props.item.city.id, [pickerField.value]: "" });
  } else {
    emit("updateExtra", { id: props.item.city.id, [pickerField.value]: code });
  }
  pickerOpen.value = false;
}
</script>

<style scoped>
.card {
  background: #fff;
  border-radius: 24rpx;
  border: 1rpx solid rgba(236, 236, 236, 1);
  box-shadow: 0 6rpx 20rpx rgba(0, 0, 0, 0.04);
  padding: 24rpx 28rpx;
  margin-bottom: 24rpx;
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.filters {
  display: flex;
  gap: 18rpx;
  align-items: center;
}
.filter {
  display: inline-flex;
  align-items: center;
  gap: 4rpx;
  padding: 4rpx 0;
}
.city-name {
  font-size: 32rpx;
  font-weight: 600;
  color: rgba(35, 34, 39, 1);
}
.filter-text {
  font-size: 26rpx;
  color: rgba(35, 34, 39, 1);
}
.filter-arrow {
  font-size: 20rpx;
  color: #999;
}

.unsub {
  border-radius: 30rpx;
  padding: 10rpx 30rpx;
  background: linear-gradient(
    0deg,
    rgba(255, 196, 205, 1) 0%,
    rgba(255, 143, 160, 1) 100%
  );
}
.unsub-text {
  font-size: 22rpx;
  font-weight: 600;
  color: #fff;
}

.related {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 22rpx;
  background: rgba(217, 217, 217, 0.6);
  border-radius: 18rpx;
  padding: 18rpx 24rpx;
}
.related-text {
  font-size: 26rpx;
  color: rgba(51, 51, 51, 1);
}

/* 简易选择器 */
.picker-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  /* 必须高于 TabBar(999)：两者同值时按 DOM 顺序决胜，TabBar 在模板里靠后，
   * 会压住这个遮罩 —— 现象是选择器面板底部被导航栏盖住、点不到。
   * 取 1000 即可，仍远低于 popup(9999) 与全局 toast(10000)。 */
  z-index: 1000;
}
.picker-panel {
  width: 100%;
  background: #fff;
  border-radius: 24rpx 24rpx 0 0;
  padding: 16rpx 0 0;
  /* 底部padding = tabBar高度(~100rpx) + iOS安全区，让滚动内容不被遮挡 */
  padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 100rpx);
}
.picker-scroll {
  /* 最多显示 6 个选项高度可见，剩余滚动 */
  max-height: 45vh;
  padding-bottom: 32rpx;
}
.picker-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24rpx 32rpx;
  border-bottom: 1rpx solid #f0f0f0;
}
.picker-row--all {
  border-bottom: none;
}
.picker-row--active {
  background: rgba(254, 165, 0, 0.06);
}
.picker-divider {
  height: 1rpx;
  background: #f0f0f0;
  margin: 0 32rpx;
}
.picker-text {
  font-size: 28rpx;
  color: rgba(51, 51, 51, 1);
}
.picker-text--all {
  color: #999;
}
.picker-check {
  width: 12rpx;
  height: 12rpx;
  border-radius: 6rpx;
  background: #fea500;
}
</style>
