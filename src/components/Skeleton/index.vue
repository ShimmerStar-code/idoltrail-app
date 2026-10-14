<!--
  Skeleton  骨架屏基础原子
  ─────────────────────────────────────────────
  用法:
    <Skeleton width="100%" height="40rpx" />
    <Skeleton width="64rpx" height="64rpx" circle />
    <Skeleton width="200rpx" height="36rpx" :rounded="8" />

  Props:
    width          string | number   占位块宽度, 默认 '100%'; 数字会被当作 rpx
    height         string | number   占位块高度, 默认 '32rpx'; 数字会被当作 rpx
    circle         boolean           圆(头像/圆形徽章),true 时 rounded 失效
    rounded        number            圆角 rpx,默认 8
    block          boolean           块级 display,默认 true
    baseColor      string            底色,默认 #f1f1f1
    highlightColor string            高亮 shimmer 色,默认 #e6e6e6

  实现:用 background-position 横向 shimmer,mp-weixin 支持 @keyframes,
       性能比 opacity 闪烁稳定。
-->
<template>
  <view
    class="skeleton"
    :class="{ 'skeleton--block': block, 'skeleton--circle': circle }"
    :style="styleVars"
  />
</template>

<script setup lang="ts">
import { computed } from "vue"

const props = withDefaults(
  defineProps<{
    width?: string | number
    height?: string | number
    circle?: boolean
    rounded?: number
    block?: boolean
    baseColor?: string
    highlightColor?: string
  }>(),
  {
    width: "100%",
    height: "32rpx",
    circle: false,
    rounded: 8,
    block: true,
    baseColor: "#f1f1f1",
    highlightColor: "#e6e6e6",
  },
)

function toUnit(v: string | number): string {
  if (typeof v === "number") return `${v}rpx`
  return v
}

const styleVars = computed(() => ({
  width: toUnit(props.width),
  height: toUnit(props.height),
  borderRadius: props.circle ? "50%" : `${props.rounded}rpx`,
  background: `linear-gradient(90deg, ${props.baseColor} 0%, ${props.highlightColor} 50%, ${props.baseColor} 100%)`,
}))
</script>

<style scoped>
.skeleton {
  display: inline-block;
  background-size: 200% 100%;
  animation: sk-shimmer 1.4s ease-in-out infinite;
}
.skeleton--block {
  display: block;
}
@keyframes sk-shimmer {
  0% {
    background-position: 100% 0;
  }
  100% {
    background-position: -100% 0;
  }
}
</style>