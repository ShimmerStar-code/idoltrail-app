import { defineStore } from 'pinia'
import { ref } from 'vue'
import { artistApi } from '@/api/artist'
import type { Artist, ArtistDetail } from '@/types/artist'
import type { PageResult } from '@/types'

/** 首页展示的已知国家，与后端 service.KnownCountries 及 COUNTRY_LABELS 保持一致 */
export const KNOWN_COUNTRIES = ['KR', 'JP', 'CN', 'US', 'TW', 'HK', 'SG', 'MY', 'TH']

export const useArtistStore = defineStore('artist', () => {
  const list = ref<PageResult<Artist>>({ total: 0, page: 1, page_size: 20, list: [] })

  // ── 首屏：已知国家（快速加载）──
  const groupedList    = ref<Artist[]>([])
  const groupedLoading = ref(true)
  let   groupedFetchedAt = 0
  const GROUPED_STALE_MS = 30 * 1000 // 30 秒内不重复请求（管理端改头像后能快速生效）

  // ── 其他地区：懒加载（滚到底部触发）──
  const otherList    = ref<Artist[]>([])
  const otherLoading = ref(false)
  const otherLoaded  = ref(false)  // 标记已请求过，防重复

  const detail = ref<ArtistDetail | null>(null)
  const loading = ref(true)

  async function fetchList(params = {}) {
    loading.value = true
    try {
      list.value = await artistApi.list(params)
    } finally {
      loading.value = false
    }
  }

  /**
   * 首屏专用：只请求 KNOWN_COUNTRIES，命中 country 索引，速度快。
   * force=true（onMounted）：始终拉取，显示骨架屏。
   * force=false（onShow）  ：2 分钟内有数据则跳过，不触发骨架屏。
   */
  /**
   * in-flight 锁。
   * 页面生命周期是 onShow → onMounted，两处都会调 fetchGrouped：
   * onShow 用 force=false、onMounted 用 force=true。force 只应绕过"数据新鲜度"检查，
   * 不该绕过"正在请求中" —— 否则首屏必然并发打出两次 GET /artists/grouped。
   */
  let _groupedInFlight: Promise<void> | null = null

  async function fetchGrouped(per = 9, force = false) {
    if (_groupedInFlight) return _groupedInFlight
    const now   = Date.now()
    const fresh = groupedList.value.length > 0 && now - groupedFetchedAt < GROUPED_STALE_MS
    if (!force && fresh) return
    if (groupedList.value.length === 0) groupedLoading.value = true
    const task = (async () => {
      try {
        const res = await artistApi.grouped(per, { countries: KNOWN_COUNTRIES })
        groupedList.value = res.list
        groupedFetchedAt  = Date.now()
      } finally {
        groupedLoading.value = false
      }
    })()
    _groupedInFlight = task
    try {
      await task
    } finally {
      // 身份校验：clear 之后可能已有新请求占用，不能被旧的误清
      if (_groupedInFlight === task) _groupedInFlight = null
    }
  }

  /** 其他地区懒加载：排除已知国家，滚到底部时调用一次。 */
  async function fetchOther(per = 9) {
    if (otherLoading.value || otherLoaded.value) return
    otherLoading.value = true
    try {
      const res = await artistApi.grouped(per, { exclude: KNOWN_COUNTRIES })
      otherList.value  = res.list
      otherLoaded.value = true
    } finally {
      otherLoading.value = false
    }
  }

  async function fetchDetail(id: string) {
    detail.value = await artistApi.detail(id)
  }

  return {
    list, groupedList, otherList,
    detail, loading, groupedLoading, otherLoading, otherLoaded,
    fetchList, fetchGrouped, fetchOther, fetchDetail,
  }
})
