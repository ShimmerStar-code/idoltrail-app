<template>
  <text>
    <block v-for="(part, i) in parts" :key="i">
      <text :style="part.match ? 'color: rgba(254,165,0,1)' : ''">{{ part.text }}</text>
    </block>
  </text>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ text: string; keyword: string }>()

const parts = computed(() => {
  if (!props.keyword || !props.text) return [{ text: props.text, match: false }]
  const escaped = props.keyword.replace(/[.*+?^$()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`(${escaped})`, 'gi')
  return props.text.split(regex).map(t => ({ text: t, match: new RegExp(`^${escaped}$`, 'i').test(t) }))
})
</script>
