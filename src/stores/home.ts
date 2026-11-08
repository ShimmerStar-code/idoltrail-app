// 首页（演出）专用的活动列表数据域。
//
// ── 为什么必须独立于 stores/event.ts ──────────────────────────────────
// 之前首页与活动列表页共用 `eventStore.list`，产生了两类真实故障：
//
//  1) 首页内容被列表页污染：活动列表页的 loadMore 会不断 append（20→40→60…），
//     首页 onShow 重拉时又覆盖回去。用户从列表页返回首页，
//     看到的既不是「精选」也不是「近期」，而是列表页那套筛选条件下的几十条。
//  2) 列表页被首页污染：首页每次 onShow 都 fetchList（覆盖语义），
//     用户在列表页滚到第 3 页、切一下首页再切回来，列表被重置到第 1 页。
//
// 拆成两份独立 state + 两份独立缓存后，两边互不干扰。
//
// ── 与 stores/event.ts 的差异 ───────────────────────────────────────
// 这里只服务首页的「近期活动」feed，因此：
//   · 不做详情缓存（详情有独立的 Detail 缓存）
//   · 缓存条目更少（首页只有一种筛选口径）
//   · 翻页上限更小（首页是入口页，不需要深翻到 200 条）

import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import { eventApi } from '@/api/event'
import type { Event } from '@/types/event'
import type { PageResult } from '@/types'

const EMPTY_PAGE: PageResult<Event> = { total: 0, page: 1, page_size: 20, list: [] }

/** 响应缓存 TTL：5 分钟（与列表页一致） */
const CACHE_TTL = 5 * 60 * 1000
/** 缓存条目上限 */
const CACHE_MAX = 20
/** 首页 feed 最多缓存多少条（硬上限） */
const FEED_MAX = 60

function isValidPage(v: unknown): v is PageResult<Event> {
  return !!v && typeof v === 'object' && Array.isArray((v as any).list)
}

export const useHomeStore = defineStore('home', () => {
  /** 首页 feed 数据集 */
  const feed = shallowRef<PageResult<Event>>(EMPTY_PAGE)
  const loading = ref(false)
  const loadingMore = ref(false)
  const hasMore = ref(true)

  /** 竞态令牌：只有最后一次请求允许写入 state */
  let _seq = 0
  /** 当前筛选签名：翻页时用它判断「筛选是否已变」 */
  let _signature = ''
  const _cache = new Map<string, { data: PageResult<Event>; ts: number }>()
  /** 同签名的在途请求复用，避免首页 onShow 与 onMounted 各打一次 */
  const _inFlight = new Map<string, Promise<void>>()

  function putBounded(key: string, value: { data: PageResult<Event>; ts: number }) {
    _cache.delete(key)
    _cache.set(key, value)
    while (_cache.size > CACHE_MAX) {
      const oldest = _cache.keys().next()
      if (oldest.done) break
      _cache.delete(oldest.value)
    }
  }

  /**
   * 拉取首页 feed（替换语义）。
   *
   * @param params 筛选条件，必须含 order（排序口径）——不同 order 返回的是不同的行集合
   */
  async function fetchFeed(params: Record<string, any> = {}) {
    const cacheKey = JSON.stringify(params)
    const inflight = _inFlight.get(cacheKey)
    if (inflight) return inflight

    const task = runFetch(cacheKey, params)
    _inFlight.set(cacheKey, task)
    try {
      await task
    } finally {
      // 只删自己那份：期间若又发起了同签名的新一轮，别把新锁摘掉
      if (_inFlight.get(cacheKey) === task) _inFlight.delete(cacheKey)
    }
  }

  async function runFetch(cacheKey: string, params: Record<string, any>) {
    // ⚠️ seq 必须先于缓存判断自增：缓存命中时若不使旧请求失效，
    // 「慢请求 A + 缓存命中 B」组合下 A 回来时 seq 仍等于 _seq，
    // 旧筛选条件的数据会覆盖用户刚看到的新结果。
    const seq = ++_seq
    const hit = _cache.get(cacheKey)
    if (hit && Date.now() - hit.ts < CACHE_TTL) {
      feed.value = hit.data
      _signature = cacheKey
      hasMore.value = hit.data.list.length < hit.data.total && hit.data.list.length < FEED_MAX
      loading.value = false
      return
    }
    _signature = cacheKey
    loading.value = true
    try {
      const res = await eventApi.list(params)
      if (seq !== _seq) return
      const page = isValidPage(res) ? res : EMPTY_PAGE
      feed.value = page
      hasMore.value = page.list.length < page.total && page.list.length < FEED_MAX
      if (isValidPage(res)) putBounded(cacheKey, { data: page, ts: Date.now() })
    } catch (e) {
      if (seq !== _seq) return
      console.warn('[homeStore.fetchFeed] failed:', e)
    } finally {
      if (seq === _seq) loading.value = false
    }
  }

  /** 加载下一页并 append（翻页语义，不走缓存） */
  async function loadMore(params: Record<string, any> = {}) {
    if (loadingMore.value) return
    if (loading.value) return
    if (!hasMore.value) return
    const list = feed.value?.list ?? []
    if (list.length >= (feed.value?.total ?? 0)) return
    if (list.length >= FEED_MAX) {
      hasMore.value = false
      return
    }

    const sigAtStart = _signature
    const nextPage = (feed.value.page || 1) + 1
    loadingMore.value = true
    try {
      const res = await eventApi.list({ ...params, page: nextPage })
      if (sigAtStart !== _signature) return
      if (isValidPage(res)) {
        const merged = [...list]
        const seen = new Set(merged.map((x) => x.id))
        for (const x of res.list) {
          if (!seen.has(x.id)) {
            seen.add(x.id)
            merged.push(x)
          }
        }
        feed.value = { ...res, list: merged.slice(0, FEED_MAX) }
        const kept = feed.value.list.length
        hasMore.value = res.list.length > 0 && kept < res.total && kept < FEED_MAX
      }
    } catch (e) {
      console.warn('[homeStore.loadMore] failed:', e)
    } finally {
      loadingMore.value = false
    }
  }

  /** 下拉刷新：跳过缓存强制重拉 */
  async function refreshFeed(params: Record<string, any> = {}) {
    _cache.delete(JSON.stringify(params))
    await fetchFeed(params)
  }

  /** 清空缓存（登出 / 切号 / 强制刷新时用） */
  function invalidate() {
    _cache.clear()
    _seq++
    feed.value = EMPTY_PAGE
    hasMore.value = false
    loading.value = false
    loadingMore.value = false
  }

  return {
    feed,
    loading,
    loadingMore,
    hasMore,
    fetchFeed,
    loadMore,
    refreshFeed,
    invalidate,
  }
})
