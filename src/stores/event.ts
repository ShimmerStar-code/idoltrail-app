import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import { eventApi } from '@/api/event'
import type { Event, EventDetail } from '@/types/event'
import type { PageResult } from '@/types'
import { GENERIC_AUDIENCE_NOTICE } from '@/constants/eventMeta'

const EMPTY_PAGE: PageResult<Event> = { total: 0, page: 1, page_size: 20, list: [] }

/**
 * 列表最多缓存的活动数（硬上限）。
 *
 * 活动列表是无限翻页的，但用户实际不会往下滑那么深；而每多留一条就多留一份
 * Event VO（嵌套 sessions/times/artists/relations）在内存里，还要连带喂给
 * list 页的窗口化组件做偏移量计算。给一个上限，到顶后停止翻页，
 * 避免「同一个页面被反复进出 20 次」把内存吃满。
 */
const EVENT_LIST_MAX = 200

function isValidPage(v: unknown): v is PageResult<Event> {
  return !!v && typeof v === 'object' && Array.isArray((v as any).list)
}

const CACHE_TTL = 5 * 60 * 1000
const _listCache = new Map<string, { data: PageResult<Event>; ts: number }>()

// 详情缓存：key = id，TTL 3 分钟
// 注意：likes_count / is_liked / subscribe_count 为动态字段，后端每次都实时返回，
// 缓存命中时直接用，点赞 toggle 后由 toggleLike 本地修正，无需手动失效。
const DETAIL_CACHE_TTL = 3 * 60 * 1000
const _detailCache = new Map<number, { data: EventDetail; ts: number }>()

/**
 * 缓存条目上限。
 *
 * 为什么要上限：_listCache 的 key 是筛选条件组合，其中 date 由日历点选任意一天决定，
 * 空间无界（city 71 × genre 11 × type 6 × status 5 × country 9 × date ∞）。
 * 而 TTL 只在**读**时判断，过期条目永远不会被 delete，
 * `invalidateListCache()` 又全仓没有任何调用点 ——
 * 不设上限时缓存只增不减，用户浏览一整个生命周期可达数百 MB，
 * 在 WebView 内存吃紧时是明确的 OOM 风险。
 */
const LIST_CACHE_MAX = 30
const DETAIL_CACHE_MAX = 50

/** 写入有界缓存：命中先删（保证插入顺序 = 新鲜度顺序），超限淘汰最旧的 */
function putBounded<K, V>(cache: Map<K, V>, key: K, value: V, max: number): void {
  cache.delete(key)
  cache.set(key, value)
  while (cache.size > max) {
    const oldest = cache.keys().next()
    if (oldest.done) break
    cache.delete(oldest.value)
  }
}

/**
 * 请求序号令牌（竞态防护）。
 * 每次发起请求自增，只有 seq 等于当前值的响应才允许写入 state，
 * 否则"先发慢、后发快"时旧响应会覆盖新响应（区域 tab 快切、详情页快速切换都是这个场景）。
 */
let _listSeq = 0
let _listSignature = ''
let _detailSeq = 0
/** 详情 in-flight 锁：key = eventId，同 id 复用同一个 Promise，避免重复请求 */
const _detailInFlight = new Map<number, Promise<void>>()
/**
 * 列表 in-flight 锁：key = 筛选签名，同签名复用同一个 Promise。
 * 缓存只在响应回来后才写入，挡不住并发：首页 onShow 早于 onMounted 触发，
 * 两处都会调 fetchList，5 分钟缓存此时尚未落盘 → 必发两次 GET /events。
 */
const _listInFlight = new Map<string, Promise<void>>()

export const useEventStore = defineStore('event', () => {
  // 列表是「只读消费」的数据集：页面只读 store.list.list 渲染，不就地改元素。
  // 用 shallowRef 而非 ref，避免几百个 Event 及其嵌套的 sessions / artists /
  // genres 全被包成 Proxy —— 那是纯开销，且翻页时整份数组重建会把所有字段
  // 重新代理一遍。列表整体的替换（fetchList / loadMore）照样能触发响应式。
  const list = shallowRef<PageResult<Event>>(EMPTY_PAGE)
  const detail = ref<EventDetail | null>(null)
  const loading = ref(false)
  const loadingMore = ref(false) // 加载下一页时 true，避免重复触发
  // 列表是否还有下一页：后端返回空页时置 false，避免每次触底重复请求同一页
  const hasMore = ref(true)

  // ── 点赞本地状态（乐观更新 + 服务端修正）──
  // 以 eventId 为 key，缓存当前会话内的点赞状态和计数
  const likedMap = ref<Record<number, boolean>>({})
  const likesCountMap = ref<Record<number, number>>({})

  async function fetchList(params: Record<string, any> = {}) {
    const cacheKey = JSON.stringify(params)
    // ⚠️ 这段必须在自增 _listSeq 之前：同签名的在途请求持有自己的 seq，
    // 这里若再 bump 一次，那个请求回来就会因 `seq !== _listSeq` 被整条丢弃，
    // list.value 永远不写，首页精选区卡死在骨架屏。
    const inflight = _listInFlight.get(cacheKey)
    if (inflight) return inflight
    const task = runFetchList(params, cacheKey)
    _listInFlight.set(cacheKey, task)
    try {
      await task
    } finally {
      // 只删自己那份：期间若又发起了同签名的新一轮，别把新锁摘掉
      if (_listInFlight.get(cacheKey) === task) _listInFlight.delete(cacheKey)
    }
  }

  async function runFetchList(params: Record<string, any>, cacheKey: string) {
    // ⚠️ seq 必须先于缓存判断自增：
    // 缓存命中时若不使旧请求失效，"慢请求 A + 缓存命中 B" 组合下
    // A 回来时 seq 仍等于 _listSeq，下面的防护形同虚设，
    // 旧筛选条件的列表会覆盖用户刚看到的新结果。
    const seq = ++_listSeq
    const hit = _listCache.get(cacheKey)
    if (hit && Date.now() - hit.ts < CACHE_TTL) {
      list.value = hit.data
      _listSignature = cacheKey
      hasMore.value = hit.data.list.length < hit.data.total && hit.data.list.length < EVENT_LIST_MAX
      // ⚠️ 这里必须复位 loading：本次调用已把 _listSeq bump 成最新值，
      // 那些早前在途的请求回来时 `seq === _listSeq` 不成立、不会替我们关掉 loading，
      // 不复位就会永久停在 true —— 首页精选区卡死在骨架屏，
      // 且 loadMore 开头的 `if (loading.value) return` 让触底加载一并失效。
      loading.value = false
      return
    }
    _listSignature = cacheKey
    loading.value = true
    try {
      const res = await eventApi.list(params)
      // 已有更新的请求发出 → 丢弃本次响应，避免慢响应覆盖新筛选结果
      if (seq !== _listSeq) return
      const page = isValidPage(res) ? res : EMPTY_PAGE
      list.value = page
      hasMore.value = page.list.length < page.total && page.list.length < EVENT_LIST_MAX
      if (isValidPage(res)) {
        putBounded(_listCache, cacheKey, { data: page, ts: Date.now() }, LIST_CACHE_MAX)
      }
    } catch (e) {
      if (seq !== _listSeq) return
      console.warn('[eventStore.fetchList] failed:', e)
    } finally {
      if (seq === _listSeq) loading.value = false
    }
  }

  /** 加载下一页并 append 到当前 list，供触底加载更多使用（不走缓存） */
  async function loadMore(params: Record<string, any> = {}) {
    if (loadingMore.value) return // 防抖：正在加载时忽略
    if (loading.value) return // fetchList 正在替换列表，此时追加会污染新列表
    if (!hasMore.value) return // 已全部加载
    if (!list.value || list.value.list.length >= list.value.total) return
    if (list.value.list.length >= EVENT_LIST_MAX) {
      hasMore.value = false // 已达硬上限，不再继续翻页
      return
    }

    // 发起前记录当前筛选签名：响应回来时若用户已改筛选，本次结果直接丢弃
    const sigAtStart = _listSignature
    const nextPage = (list.value.page || 1) + 1
    loadingMore.value = true
    try {
      const res = await eventApi.list({ ...params, page: nextPage })
      if (sigAtStart !== _listSignature) return // 筛选已变，丢弃
      if (isValidPage(res)) {
        // append 到当前列表（保留已有数据）
        const merged = [...list.value.list]
        const seen = new Set(merged.map((x) => x.id))
        for (const x of res.list) {
          if (!seen.has(x.id)) {
            seen.add(x.id)
            merged.push(x)
          }
        }
        list.value = {
          ...res,
          list: merged.slice(0, EVENT_LIST_MAX),
        }
        // 后端返回空页 / 数量不足 / 已达硬上限 → 没有下一页，停止继续请求
        const kept = list.value.list.length
        hasMore.value =
          res.list.length > 0 && kept < res.total && kept < EVENT_LIST_MAX
      }
    } catch (e) {
      console.warn('[eventStore.loadMore] failed:', e)
    } finally {
      loadingMore.value = false
    }
  }

  function invalidateListCache() {
    _listCache.clear()
  }

  async function fetchDetail(id: number) {
    const cached = _detailCache.get(id)
    if (cached && Date.now() - cached.ts < DETAIL_CACHE_TTL) {
      detail.value = cached.data
      // 同步本地点赞状态（缓存命中时也要初始化）
      _syncLikeState(cached.data)
      return
    }
    // 同 id 已有请求在途 → 复用它的 Promise，不重复发请求
    const inflight = _detailInFlight.get(id)
    if (inflight) return inflight

    const seq = ++_detailSeq
    const task = (async () => {
      detail.value = null
      loading.value = true
      try {
        const res = await eventApi.detail(id)
        // 期间用户已切到别的活动 → 丢弃本次响应，避免旧详情渲染到新页面
        if (seq !== _detailSeq) return
        if (res) {
          const data: EventDetail = {
            ...res,
            likes_count: res.likes_count ?? 0,
            is_liked: res.is_liked ?? false,
            subscribe_count: res.subscribe_count ?? 0,
            // 恒给空数组而不是留 undefined：详情页直接遍历它，
            // 旧缓存对象（3 分钟 TTL 内）可能压根没这个键
            contributors: res.contributors ?? [],
            // 后台没配 notice 时给通用观演提示；详情页会比对
            // GENERIC_AUDIENCE_NOTICE 来标注「通用提示」来源，避免被误当成主办方公告
            notice: res.notice ?? GENERIC_AUDIENCE_NOTICE,
          }
          detail.value = data
          putBounded(_detailCache, id, { data, ts: Date.now() }, DETAIL_CACHE_MAX)
          _syncLikeState(data)
        }
      } catch (e) {
        if (seq === _detailSeq) console.warn('[eventStore.fetchDetail] failed:', e)
      } finally {
        if (seq === _detailSeq) loading.value = false
      }
    })()
    // ⚠️ 解锁必须挂在 set **之后**：async IIFE 在第一个 await 之前是同步执行的，
    // 若 eventApi.detail 同步抛错，IIFE 内的 delete 会先于 set 执行（删了个空 key），
    // 随后 set 写入一个已 settled 的 Promise 并永久驻留 → 该 id 的详情从此永远命中
    // 陈旧结果，缓存再也不会刷新。
    _detailInFlight.set(id, task)
    void task
      .finally(() => {
        // 校验身份：clear() 后可能已有新请求占用同一 id，不能被旧请求误删锁
        if (_detailInFlight.get(id) === task) _detailInFlight.delete(id)
      })
      .catch(() => {
        /* task 内部已 catch，这里只是兜底防止 finally 链产生 unhandledRejection */
      })
    return task
  }

  /** 从 EventDetail 初始化本地点赞状态 */
  function _syncLikeState(data: EventDetail) {
    likedMap.value[data.id] = data.is_liked ?? false
    likesCountMap.value[data.id] = data.likes_count ?? 0
  }

  // in-flight 锁：正在请求中的 eventId 集合，防止用户快速重复点击发出并发请求
  const _likingInFlight = new Set<number>()

  /**
   * 切换活动点赞状态（需已登录）。
   * - 乐观更新：立即反映到 UI，请求完成后用服务端真值修正
   * - in-flight 锁：同一活动请求未完成时忽略后续点击
   * 调用方需自行处理 requireLogin 鉴权，本函数不做登录拦截。
   */
  async function toggleLike(eventId: number) {
    // 防抖：上一次请求还未返回时直接忽略
    if (_likingInFlight.has(eventId)) return

    _likingInFlight.add(eventId)

    const prevLiked = likedMap.value[eventId] ?? false
    const prevCount = likesCountMap.value[eventId] ?? 0

    // 乐观更新
    likedMap.value[eventId] = !prevLiked
    likesCountMap.value[eventId] = prevLiked ? Math.max(0, prevCount - 1) : prevCount + 1

    try {
      const res = await eventApi.toggleLike(eventId)
      // 服务端修正（防止乐观更新与真实计数的偏差）
      likedMap.value[eventId] = res.liked
      likesCountMap.value[eventId] = res.likes_count
      // 同步写回缓存，下次缓存命中时 is_liked / likes_count 保持最新
      const cached = _detailCache.get(eventId)
      if (cached) {
        cached.data.is_liked = res.liked
        cached.data.likes_count = res.likes_count
      }
    } catch (e) {
      // 网络失败：回滚本地状态
      likedMap.value[eventId] = prevLiked
      likesCountMap.value[eventId] = prevCount
      throw e
    } finally {
      _likingInFlight.delete(eventId)
    }
  }

  /**
   * 订阅 / 退订成功后本地修正订阅数（后端不会实时回填）。
   *
   * 同时作用于「当前详情」与「详情缓存」：
   * fetchDetail 里 `detail.value = data` 与 `putBounded(_detailCache, id, { data })`
   * 存的是同一个对象引用，ref 的 reactive 代理写操作直接落到原始对象上，
   * 所以改 detail.value 就等于同步修正了缓存基线 —— 3 分钟内再次进入本页
   * 命中缓存时，订阅数仍是最新值，不会退回订阅前的旧数。
   */
  function adjustSubscribeCount(eventId: number, delta: number) {
    const cur = detail.value
    if (cur && cur.id === eventId) {
      cur.subscribe_count = Math.max(0, (cur.subscribe_count ?? 0) + delta)
      return
    }
    const cached = _detailCache.get(eventId)
    if (cached) {
      cached.data.subscribe_count = Math.max(0, (cached.data.subscribe_count ?? 0) + delta)
    }
  }

  function invalidateDetailCache(id?: number) {
    if (id !== undefined) {
      _detailCache.delete(id)
    } else {
      _detailCache.clear()
    }
  }

  /**
   * 清空所有与用户身份相关的数据。
   * 必须在登出 / 切号时调用：EventDetail 里带 is_liked（当前用户是否已点赞），
   * 属于**用户相关数据**，被模块级缓存 3 分钟。A 账号登出后 B 账号命中同一 id 的缓存，
   * 会显示 A 的点赞态（红心已亮），点一下变成「取消点赞」，语义完全错乱。
   */
  function invalidateUserScopedCache() {
    _detailCache.clear()
    _listCache.clear()
    // 不清会让 B 账号复用 A 账号在途的 Promise，拿到的仍是 A 的 is_liked
    _detailInFlight.clear()
    likedMap.value = {}
    likesCountMap.value = {}
    detail.value = null
    list.value = EMPTY_PAGE
    hasMore.value = false
    // 让在途的详情/列表请求失效
    _detailSeq++
    _listSeq++
    // ⚠️ 必须在此手动复位：序号 bump 之后，在途请求 finally 里的
    // `if (seq === _detailSeq) loading.value = false` 全部不成立，
    // 不复位会让详情页的 loading 永久停在 true。
    loading.value = false
    loadingMore.value = false
  }

  return {
    list, detail, loading, loadingMore, hasMore,
    likedMap, likesCountMap,
    fetchList, loadMore, fetchDetail, toggleLike,
    invalidateListCache, invalidateDetailCache, adjustSubscribeCount, invalidateUserScopedCache,
  }
})
