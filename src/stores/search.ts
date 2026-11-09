import { defineStore } from 'pinia'
import { ref } from 'vue'
import { searchApi } from '@/api/search'
import { track } from '@/utils/analytics'
import { ANALYTICS_EVENTS } from '@/constants/analytics'
import type {
  ArtistSearchHit,
  EventSearchHit,
  PlaceSearchHit,
  SearchResponse,
} from '@/types/search'

function readHits<T>(res: SearchResponse<T> | undefined): T[] {
  if (Array.isArray(res)) return res
  return res?.hits ?? []
}

function readTotal<T>(res: SearchResponse<T> | undefined, fallback: number): number {
  return Array.isArray(res) ? fallback : (res?.total ?? fallback)
}

export const useSearchStore = defineStore('search', () => {
  const artists = ref<ArtistSearchHit[]>([])
  const events = ref<EventSearchHit[]>([])
  const places = ref<PlaceSearchHit[]>([])
  const artistTotal = ref(0)
  const loading = ref(false)

  // 用于搜索去重/竞态保护：只采纳最近一次发起的搜索结果
  let searchSeq = 0

  async function searchAll(q: string) {
    const keyword = q.trim()
    if (!keyword) {
      clear()
      return
    }
    const seq = ++searchSeq
    loading.value = true
    try {
      const [a, e, p] = await Promise.all([
        searchApi.artists({ q: keyword }),
        searchApi.events({ q: keyword }),
        searchApi.places({ q: keyword }),
      ])
      // 若期间又发起了新搜索，丢弃本次结果
      if (seq !== searchSeq) return
      const artistHits = readHits(a)
      artists.value = artistHits.slice(0, 3)
      artistTotal.value = readTotal(a, artistHits.length)
      events.value = readHits(e).slice(0, 4)
      places.value = readHits(p).slice(0, 2)
      // 埋点：只记关键词长度与命中数量，**不记关键词原文** ——
      // 搜索词是用户自由输入，可能包含人名等个人信息，落库即风险。
      track(ANALYTICS_EVENTS.SEARCH_SUBMIT, {
        len: keyword.length,
        artists: artists.value.length,
        events: events.value.length,
        places: places.value.length,
      })
    } finally {
      // 只有当前请求结束时才把 loading 关掉
      if (seq === searchSeq) {
        loading.value = false
      }
    }
  }

  /** 偶像页专属搜索：不请求演出和场馆，并保留接口返回的全部最相关结果。 */
  async function searchArtists(q: string) {
    const keyword = q.trim()
    if (!keyword) {
      clear()
      return
    }
    const seq = ++searchSeq
    loading.value = true
    artists.value = []
    artistTotal.value = 0
    events.value = []
    places.value = []
    try {
      const res = await searchApi.artists({ q: keyword })
      if (seq !== searchSeq) return
      artists.value = readHits(res)
      artistTotal.value = readTotal(res, artists.value.length)
      track(ANALYTICS_EVENTS.SEARCH_SUBMIT, {
        len: keyword.length,
        artists: artists.value.length,
        events: 0,
        places: 0,
      })
    } finally {
      if (seq === searchSeq) loading.value = false
    }
  }

  function clear() {
    ++searchSeq
    artists.value = []
    events.value = []
    places.value = []
    artistTotal.value = 0
    loading.value = false
  }

  return { artists, events, places, artistTotal, loading, searchAll, searchArtists, clear }
})
