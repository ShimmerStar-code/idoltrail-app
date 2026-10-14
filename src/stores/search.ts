import { defineStore } from 'pinia'
import { ref } from 'vue'
import { searchApi } from '@/api/search'

export const useSearchStore = defineStore('search', () => {
  const artists = ref<any[]>([])
  const events = ref<any[]>([])
  const places = ref<any[]>([])
  const loading = ref(false)

  // 用于搜索去重/竞态保护：只采纳最近一次发起的搜索结果
  let searchSeq = 0

  async function searchAll(q: string) {
    const seq = ++searchSeq
    if (!q.trim()) {
      artists.value = []
      events.value = []
      places.value = []
      return
    }
    loading.value = true
    try {
      const [a, e, p] = await Promise.all([
        searchApi.artists({ q }),
        searchApi.events({ q }),
        searchApi.places({ q }),
      ])
      // 若期间又发起了新搜索，丢弃本次结果
      if (seq !== searchSeq) return
      artists.value = (Array.isArray(a) ? a : (a?.hits ?? [])).slice(0, 3)
      events.value = (Array.isArray(e) ? e : (e?.hits ?? [])).slice(0, 4)
      places.value = (Array.isArray(p) ? p : (p?.hits ?? [])).slice(0, 2)
    } finally {
      // 只有当前请求结束时才把 loading 关掉
      if (seq === searchSeq) {
        loading.value = false
      }
    }
  }

  function clear() {
    ++searchSeq
    artists.value = []
    events.value = []
    places.value = []
    loading.value = false
  }

  return { artists, events, places, loading, searchAll, clear }
})
