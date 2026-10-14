// 字典 Pinia store。
//
// 拉取一次缓存在内存里，多次订阅页/筛选页共用，避免每个 kind 单独发请求。
// P0 仅拉 event_type + event_genre（CitySubCard 用到）；其他 kind 留扩展位。
//
// 设计要点：
// - 内存缓存（不持久化到 uni storage，避免启动开销）
// - 拉取过的 kind 标记 fetched；支持单个 kind 懒拉
// - 暴露 getCodes / getLabel 给 UI 直接用
//
// 鉴权：/dictionaries/:kind 是公开接口，store 无需登录态

import { defineStore } from 'pinia'
import { ref } from 'vue'
import { dictionaryApi } from '@/api/dictionary'
import type { DictionaryItem, DictionaryKind, DictionaryKindResult } from '@/types/dictionary'

export const useDictionaryStore = defineStore('dictionary', () => {
  const itemsByKind = ref<Record<string, DictionaryItem[]>>({})
  // 拉取过的 kind 集合（避免重复请求）
  const fetchedKinds = ref<Set<string>>(new Set())
  const loading = ref(false)

  /**
   * 拉取一种字典；已拉过则 no-op。
   * 单 kind 懒加载，避免一次性拉全部 6 种。
   */
  async function fetchKind(kind: DictionaryKind): Promise<void> {
    if (fetchedKinds.value.has(kind)) return
    fetchedKinds.value.add(kind)
    try {
      const r: DictionaryKindResult = await dictionaryApi.get(kind)
      itemsByKind.value[kind] = r.items
    } catch (e) {
      // 拉取失败时回滚 fetched 标记，允许下次重试
      fetchedKinds.value.delete(kind)
      throw e
    }
  }

  /**
   * 批量预加载若干 kind（订阅页 onMounted 调用一次）。
   * 已有缓存的 kind 不会重新请求。
   */
  async function ensureLoaded(kinds: DictionaryKind[] = ['event_type', 'event_genre']): Promise<void> {
    const pending = kinds.filter((k) => !fetchedKinds.value.has(k))
    if (pending.length === 0) return
    loading.value = true
    try {
      // 并发拉（任一失败不影响其他）
      const results = await Promise.allSettled(pending.map((k) => dictionaryApi.get(k)))
      for (let i = 0; i < results.length; i++) {
        const k = pending[i]
        if (results[i].status === 'fulfilled') {
          itemsByKind.value[k] = (results[i] as PromiseFulfilledResult<DictionaryKindResult>).value.items
          fetchedKinds.value.add(k)
        } else {
          // 失败不标记 fetched，下次还会重试
          fetchedKinds.value.delete(k)
        }
      }
    } finally {
      loading.value = false
    }
  }

  function getCodes(kind: DictionaryKind): string[] {
    return (itemsByKind.value[kind] ?? []).map((x) => x.code)
  }

  function getItems(kind: DictionaryKind): DictionaryItem[] {
    return itemsByKind.value[kind] ?? []
  }

  /** 给定 code 查中文名（找不到则回退原 code） */
  function getLabel(kind: DictionaryKind, code: string): string {
    if (!code) return ''
    const item = (itemsByKind.value[kind] ?? []).find((x) => x.code === code)
    return item ? item.name_cn : code
  }

  function reset(): void {
    itemsByKind.value = {}
    fetchedKinds.value = new Set()
  }

  return {
    itemsByKind,
    fetchedKinds,
    loading,
    fetchKind,
    ensureLoaded,
    getCodes,
    getItems,
    getLabel,
    reset,
  }
})
