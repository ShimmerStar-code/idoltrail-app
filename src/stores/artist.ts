import { defineStore } from 'pinia'
import { ref } from 'vue'
import { artistApi } from '@/api/artist'
import type { ArtistGroupedSort } from '@/api/artist'
import type { Artist, ArtistDetail } from '@/types/artist'
import type { PageResult } from '@/types'

/**
 * 分组列表的组内口径。偶像页按"活动数量降序"展示，
 * 与后端 repository.GroupedSortEventCount 对齐。
 */
export const GROUPED_SORT: ArtistGroupedSort = 'event_count'

export const useArtistStore = defineStore('artist', () => {
  const list = ref<PageResult<Artist>>({ total: 0, page: 1, page_size: 20, list: [] })

  // ── 偶像页分组（国家白名单由后端持有，服务端缓存 24h）──
  const groupedList    = ref<Artist[]>([])
  const groupedLoading = ref(true)
  let   groupedFetchedAt = 0
  // 服务端缓存 24h，但管理端改艺人会主动失效后端缓存，所以这里只要在
  // 合理间隔内不发重复请求即可。新数据由后端的每日重算 + 管理端失效两条路径提供，
  // 客户端不需要 30 秒就拉一次（那会把一次 40KB 的响应变成每 30 秒一次）。
  const GROUPED_STALE_MS = 10 * 60 * 1000

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
   * 偶像页分组数据。
   *
   * 走 /artists/grouped/main：国家白名单由后端持有（service.KnownCountries），
   * 服务端算好后缓存 24h，所有用户拿到的是同一份，客户端不再自己拼 countries。
   * force=true（onMounted）：始终拉取，显示骨架屏。
   * force=false（onShow）  ：GROUPED_STALE_MS 内有数据则跳过，不触发骨架屏。
   */
  /**
   * in-flight 锁。
   * 页面生命周期是 onShow → onMounted，两处都会调 fetchGrouped：
   * onShow 用 force=false、onMounted 用 force=true。force 只应绕过"数据新鲜度"检查，
   * 不该绕过"正在请求中" —— 否则首屏必然并发打出两次请求。
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
        const res = await artistApi.grouped(per, { main: true, sort: GROUPED_SORT })
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

  /**
   * detail 是全局唯一槽位，被所有 /pages/artist/detail 实例共用
   * （组合页 → 成员页 → 返回 就是同一份数据在来回覆盖）。
   * 如果只「谁后回来谁写入」，快速跳转时会出现：
   *   点成员 → 成员请求发出 → 立刻返回 → 组合页看到 store.detail.id 仍是自己，不刷新
   *   → 成员请求这时才返回，把组合页的数据覆盖成成员。
   * 用递增序号做后发先至的守卫：只有最后一次请求的结果允许落库。
   */
  let _detailSeq = 0
  async function fetchDetail(id: string) {
    const seq = ++_detailSeq
    const data = await artistApi.detail(id)
    // 期间又发起了新请求，丢弃本次结果，交给更新的那次写入
    if (seq !== _detailSeq) return
    detail.value = data
  }

  return {
    list, groupedList,
    detail, loading, groupedLoading,
    fetchList, fetchGrouped, fetchDetail,
  }
})
