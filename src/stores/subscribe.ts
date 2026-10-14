// 订阅 Pinia store。
// 后端 P0 已上线，去掉所有 mock；按"id 集合 + 富列表"双轨：
//
// 1) subscribedArtistIds / subscribedCityIds / subscribedEventIds：Set 集合，
//    给 artist/list / event/list / detail 页判断"是否已订阅"按钮反显用，O(1)。
//
// 2) myArtists / myCities / myEventsOngoing / myEventsExpired / artistRelatedEvents：
//    完整 VO 列表，给订阅页 3 个 tab 直接渲染。
//
// 写操作（toggle*/updateCityExtra）走真实 API；成功后同时更新两轨。
// userStore.clear() 仍会调本 store 的 reset()，登出后状态干净。

import { defineStore } from 'pinia'
import { ref } from 'vue'
import { subscriptionApi } from '@/api/subscription'
import type {
  ArtistCardVO,
  CityCardVO,
  EventCardVO,
} from '@/types/subscription'

export const useSubscribeStore = defineStore('subscribe', () => {
  // ── id 集合（轻量，用于按钮反显） ──
  const subscribedArtistIds = ref<Set<string>>(new Set())
  const subscribedCityIds = ref<Set<string>>(new Set())
  const subscribedEventIds = ref<Set<number>>(new Set())

  // ── 富列表（订阅页使用） ──
  const myArtists = ref<ArtistCardVO[]>([])
  const myCities = ref<CityCardVO[]>([])
  const myEventsOngoing = ref<EventCardVO[]>([])
  const myEventsExpired = ref<EventCardVO[]>([])
  const artistRelatedEvents = ref<EventCardVO[]>([])

  // myEventsOngoing / myEventsExpired 各自的服务端 total，用于触底加载的终止判断。
  // 没有它的话页面只能靠"返回条数 < pageSize"猜，容易多打一次空请求或提前停止。
  const myEventsTotalOngoing = ref(0)
  const myEventsTotalExpired = ref(0)

  const loading = ref({
    artists: false,
    cities: false,
    eventsOngoing: false,
    eventsExpired: false,
    related: false,
  })

  // 防并发：onMounted + onShow 在首次加载时都会触发，用此标记避免重复请求
  const _fetchingIds = ref(false)

  // ─────────────────────── 读 ───────────────────────

  /**
   * 拉所有 type 的 id 集合，给 artist/list 等列表页判断订阅态用。
   * 四路并发（活动含 ongoing + expired，否则已结束/已取消订阅的 id 缺失，
   * 已结束卡片上的书签退订会被误隐藏）；任一类失败不影响其他。
   */
  /**
   * 全局读序号。
   *
   * 每个读方法发出请求前 ++，响应回来后先校验 seq 是否仍是最新。
   * reset() 也必须全部 ++（登出 / 切号），否则**登出前发出、登出后返回**的响应
   * 会把 A 账号的订阅列表写回 store —— 用户切号后直接看到上一个账号的关注清单。
   * fetchMyEvents 早就有自己的 _eventsSeq，这里补的是其余 4 个读方法。
   *
   * ⚠️ 必须每个数据域一个独立计数器，早前共用单个 _readSeq 会导致：
   * 订阅页 loadAllTabs() 用 Promise.all 并发拉取，seq 被连续 +3，
   * 于是除最后一个外全部 `seq !== _readSeq` 而被丢弃 —— myArtists / myCities
   * 永远写不进 store（对应 tab 恒空白），且 loading 也永远不复位。
   * 序号的意义是"同一数据域内后发先到"的防护，跨域并发不应互相作废。
   */
  let _idsSeq = 0
  let _artistsSeq = 0
  let _citiesSeq = 0
  let _relatedSeq = 0

  async function fetchMySubscribedIds(): Promise<void> {
    if (_fetchingIds.value) return
    _fetchingIds.value = true
    const seq = ++_idsSeq
    try {
      const [a, c, e, eExp] = await Promise.allSettled([
        subscriptionApi.myArtistIds(),
        subscriptionApi.myCityIds(),
        subscriptionApi.myEvents('ongoing', 1, 100),
        subscriptionApi.myEvents('expired', 1, 100),
      ])
      // 已登出 / 已有更新的请求 → 丢弃本次响应
      if (seq !== _idsSeq) return
      if (a.status === 'fulfilled') subscribedArtistIds.value = new Set(a.value.ids)
      if (c.status === 'fulfilled') subscribedCityIds.value = new Set(c.value.ids)
      if (e.status === 'fulfilled') subscribedEventIds.value = new Set(e.value.list.map((x) => x.event.id))
      if (eExp.status === 'fulfilled') {
        // 合并 expired，只追加不覆盖（两者都可能超过 100 条，集合用于“反显”，够用）
        const next = new Set(subscribedEventIds.value)
        for (const x of eExp.value.list) next.add(x.event.id)
        subscribedEventIds.value = next
      }
    } finally {
      // 无条件解锁：本方法是 _fetchingIds 的唯一持有者，
      // 若也加 seq 判断，一次跨域 bump 就会让这把锁永久卡住 true，
      // 此后全 App 的订阅反显都停止更新，且只有 reset() 能救。
      _fetchingIds.value = false
    }
  }

  async function fetchMyArtists(): Promise<void> {
    const seq = ++_artistsSeq
    loading.value.artists = true
    try {
      const r = await subscriptionApi.myArtists()
      if (seq !== _artistsSeq) return
      myArtists.value = r.list
      subscribedArtistIds.value = new Set(r.list.map((x) => x.artist.id))
    } finally {
      if (seq === _artistsSeq) loading.value.artists = false
    }
  }

  async function fetchMyCities(): Promise<void> {
    const seq = ++_citiesSeq
    loading.value.cities = true
    try {
      const r = await subscriptionApi.myCities()
      if (seq !== _citiesSeq) return
      myCities.value = r.list
      subscribedCityIds.value = new Set(r.list.map((x) => x.city.id))
    } finally {
      if (seq === _citiesSeq) loading.value.cities = false
    }
  }

  // 每个 status 一份请求序号：并发请求（onMounted + onShow）时只有最后一次能写入，
  // 避免慢响应覆盖新响应。reset() 里同样要递增。
  const _eventsSeq = { ongoing: 0, expired: 0 }

  /**
   * 拉取「我的订阅活动」。
   * - page === 1 → 整体替换（首屏 / onShow 刷新语义，保持原行为）
   * - page > 1   → 追加到已有列表（触底加载语义）
   * 原实现无论哪一页都执行 `myEventsOngoing.value = r.list`，配合页面用
   * `floor(len/20)+1` 算 nextPage 会导致长度恒为 20 → 永远重复请求第 2 页、第 1 页丢失。
   */
  async function fetchMyEvents(status: 'ongoing' | 'expired', page = 1, pageSize = 20): Promise<void> {
    const lk = status === 'ongoing' ? 'eventsOngoing' : 'eventsExpired'
    const seq = ++_eventsSeq[status]
    loading.value[lk] = true
    try {
      const r = await subscriptionApi.myEvents(status, page, pageSize)
      // 已有更新的请求发出 → 丢弃本次响应
      if (seq !== _eventsSeq[status]) return

      const target = status === 'ongoing' ? myEventsOngoing : myEventsExpired
      if (page <= 1) {
        target.value = r.list
      } else {
        // 追加；按 event.id 去重，避免翻页边界重复导致 key 重复
        const seen = new Set(target.value.map((x) => x.event.id))
        const merged = [...target.value]
        for (const v of r.list) {
          if (!seen.has(v.event.id)) {
            seen.add(v.event.id)
            merged.push(v)
          }
        }
        target.value = merged
      }
      if (status === 'ongoing') myEventsTotalOngoing.value = r.total ?? target.value.length
      else myEventsTotalExpired.value = r.total ?? target.value.length

      // 顺手同步 id 集合（只追加，不覆盖另一个 status 的）
      const next = new Set(subscribedEventIds.value)
      for (const v of r.list) next.add(v.event.id)
      subscribedEventIds.value = next
    } finally {
      // 只有最新那次请求负责关闭 loading，避免旧请求提前把 loading 置 false
      if (seq === _eventsSeq[status]) loading.value[lk] = false
    }
  }

  async function fetchArtistRelatedEvents(page = 1, pageSize = 20): Promise<void> {
    const seq = ++_relatedSeq
    loading.value.related = true
    try {
      const r = await subscriptionApi.artistRelatedEvents(page, pageSize)
      if (seq !== _relatedSeq) return
      artistRelatedEvents.value = r.list
    } finally {
      if (seq === _relatedSeq) loading.value.related = false
    }
  }

  // ─────────────────────── 判定 ───────────────────────

  const isArtistSubscribed = (id: string): boolean => subscribedArtistIds.value.has(id)
  const isCitySubscribed = (id: string): boolean => subscribedCityIds.value.has(id)
  const isEventSubscribed = (id: number): boolean => subscribedEventIds.value.has(id)

  // ─────────────────────── 写 ───────────────────────

  /**
   * 切换艺人订阅状态：
   * - 乐观更新 + 失败回滚
   * - 成功后同时同步 myArtists 列表（如果当前已加载）
   */
  async function toggleArtist(id: string): Promise<boolean> {
    const had = subscribedArtistIds.value.has(id)
    // 乐观更新
    const next = new Set(subscribedArtistIds.value)
    if (had) next.delete(id); else next.add(id)
    subscribedArtistIds.value = next

    try {
      if (had) {
        await subscriptionApi.unsubscribeArtist(id)
        // 同步移除 myArtists 项
        myArtists.value = myArtists.value.filter((x) => x.artist.id !== id)
      } else {
        await subscriptionApi.subscribeArtist(id)
      }
      return !had
    } catch (e) {
      // 回滚
      const rollback = new Set(subscribedArtistIds.value)
      if (had) rollback.add(id); else rollback.delete(id)
      subscribedArtistIds.value = rollback
      throw e
    }
  }

  async function toggleCity(id: string, extra?: Record<string, any>): Promise<boolean> {
    const had = subscribedCityIds.value.has(id)
    const next = new Set(subscribedCityIds.value)
    if (had) next.delete(id); else next.add(id)
    subscribedCityIds.value = next

    try {
      if (had) {
        await subscriptionApi.unsubscribeCity(id)
        myCities.value = myCities.value.filter((x) => x.city.id !== id)
      } else {
        await subscriptionApi.subscribeCity(id, extra)
      }
      return !had
    } catch (e) {
      const rollback = new Set(subscribedCityIds.value)
      if (had) rollback.add(id); else rollback.delete(id)
      subscribedCityIds.value = rollback
      throw e
    }
  }

  async function toggleEvent(id: number): Promise<boolean> {
    const had = subscribedEventIds.value.has(id)
    const next = new Set(subscribedEventIds.value)
    if (had) next.delete(id); else next.add(id)
    subscribedEventIds.value = next

    try {
      if (had) {
        await subscriptionApi.unsubscribeEvent(id)
        myEventsOngoing.value = myEventsOngoing.value.filter((x) => x.event.id !== id)
        myEventsExpired.value = myEventsExpired.value.filter((x) => x.event.id !== id)
      } else {
        await subscriptionApi.subscribeEvent(id)
      }
      return !had
    } catch (e) {
      const rollback = new Set(subscribedEventIds.value)
      if (had) rollback.add(id); else rollback.delete(id)
      subscribedEventIds.value = rollback
      throw e
    }
  }

  /** 城市卡的"类型/标签"筛选偏好；本地+远端同步
   *  乐观更新：先写本地状态让 UI 立即响应，API 失败则回滚。
   *  避免"选全部后立即点已关联活动"时读到旧 extra 的竞态问题。
   */
  async function updateCityExtra(id: string, extra: Record<string, any>): Promise<void> {
    const c = myCities.value.find((x) => x.city.id === id)
    const prevExtra = c ? { ...c.extra } : null

    // 乐观更新本地状态
    if (c) c.extra = { ...c.extra, ...extra }

    try {
      await subscriptionApi.updateCityExtra(id, extra)
    } catch (e) {
      // API 失败回滚
      if (c && prevExtra !== null) c.extra = prevExtra
      throw e
    }
  }

  // ─────────────────────── 重置 ───────────────────────

  function reset(): void {
    // 先让所有在途响应失效，再清 state —— 顺序不能反，
    // 否则登出/切号前发出的请求回来后会重新写回上一个账号的数据。
    // 4 个独立计数器必须全部 ++，漏掉任何一个都会留下串号窗口
    _idsSeq++
    _artistsSeq++
    _citiesSeq++
    _relatedSeq++
    _eventsSeq.ongoing++
    _eventsSeq.expired++
    _fetchingIds.value = false

    subscribedArtistIds.value = new Set()
    subscribedCityIds.value = new Set()
    subscribedEventIds.value = new Set()
    myArtists.value = []
    myCities.value = []
    myEventsOngoing.value = []
    myEventsExpired.value = []
    myEventsTotalOngoing.value = 0
    myEventsTotalExpired.value = 0
    artistRelatedEvents.value = []
    // loading 不复位会让登出后的页面永远停在骨架屏
    loading.value = {
      artists: false,
      cities: false,
      eventsOngoing: false,
      eventsExpired: false,
      related: false,
    }
  }

  /** 活动 tab 是否还有下一页（触底加载的终止条件） */
  function hasMoreEvents(status: 'ongoing' | 'expired'): boolean {
    const list = status === 'ongoing' ? myEventsOngoing.value : myEventsExpired.value
    const total = status === 'ongoing' ? myEventsTotalOngoing.value : myEventsTotalExpired.value
    return list.length < total
  }

  return {
    // id 集合
    subscribedArtistIds,
    subscribedCityIds,
    subscribedEventIds,
    // 富列表
    myArtists,
    myCities,
    myEventsOngoing,
    myEventsExpired,
    myEventsTotalOngoing,
    myEventsTotalExpired,
    artistRelatedEvents,
    loading,
    // 判定
    isArtistSubscribed,
    isCitySubscribed,
    isEventSubscribed,
    // 读
    fetchMySubscribedIds,
    fetchMyArtists,
    fetchMyCities,
    fetchMyEvents,
    fetchArtistRelatedEvents,
    hasMoreEvents,
    // 写
    toggleArtist,
    toggleCity,
    toggleEvent,
    updateCityExtra,
    // 重置
    reset,
  }
})
