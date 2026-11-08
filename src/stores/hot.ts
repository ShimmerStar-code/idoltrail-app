// 运营可配置的热门条目（热门偶像 / 热门城市 / 热门搜索词）。
//
// ── 为什么需要这个 store ────────────────────────────────────────────
// 这三类入口原先是 App 端写死的常量：
//   · 热门搜索词 = 活动类型 + 流派（constants/eventMeta.ts）
//   · 热门偶像   = 偶像页 grouped 接口的前 6 个（运营无法指定）
//   · 热门城市   = constants/cities.ts 的 HOT_CITIES（写死的 13 个中文名）
// 运营想换一批只能改代码发版。现在由后台配置，App 启动后拉一次。
//
// ── 兜底策略 ────────────────────────────────────────────────────────
// 拉不到配置（后端未部署 / 网络不通）时，各页面各自回落到内置的静态值，
// 本 store 不做兜底 —— 兜底逻辑留在原本就有的地方，避免两处维护。
//
// ── 与城市名映射的关系 ──────────────────────────────────────────────
// 热门城市由运营起中文名，可能不在 App 的静态中英映射表里。
// load() 会把这些名字登记进映射表（registerCityName），
// 否则用户点了热门城市却筛不出活动（详见 constants/cities.ts 的注释）。

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { hotApi, type HotArtist, type HotCity, type HotKeyword } from '@/api/hot'
import { registerCityName, formatCity } from '@/constants/cities'

/** 热门城市的展示名：运营自定义的中文名优先，其次本地映射，最后英文码 */
export function hotCityDisplayName(c: HotCity): string {
  return c.title?.trim() || formatCity(c.name) || c.name
}

export const useHotStore = defineStore('hot', () => {
  const artists = ref<HotArtist[]>([])
  const cities = ref<HotCity[]>([])
  const keywords = ref<HotKeyword[]>([])
  /** 是否已成功拉取过一次（用于避免每次进页面都打接口） */
  const loaded = ref(false)

  /** 在途请求复用：首页与 CityPicker 几乎同时打开，不该打两次 */
  let _inFlight: Promise<void> | null = null

  async function load(force = false): Promise<void> {
    if (_inFlight) return _inFlight
    if (loaded.value && !force) return
    const task = (async () => {
      try {
        const res = await hotApi.get()
        artists.value = res?.artist ?? []
        cities.value = res?.city ?? []
        keywords.value = res?.keyword ?? []
        // 登记运营配的中文名 → 英文码，保证选中后能筛出活动
        for (const c of cities.value) {
          registerCityName(hotCityDisplayName(c), c.name)
        }
        loaded.value = true
      } catch (e) {
        console.warn('[hotStore.load] failed:', e)
      }
    })()
    _inFlight = task
    try {
      await task
    } finally {
      if (_inFlight === task) _inFlight = null
    }
  }

  /** 热门偶像名（首页搜索面板用） */
  const artistNames = computed(() =>
    artists.value.map((a) => a.name).filter(Boolean),
  )

  /** 热门搜索词（首页搜索面板用） */
  const keywordNames = computed(() =>
    keywords.value.map((k) => k.name).filter(Boolean),
  )

  /** 热门城市（CityPicker 用）：id 是 region.id，code 是英文名 */
  const cityOptions = computed(() =>
    cities.value.map((c) => ({
      id: c.id,
      code: c.name,
      displayName: hotCityDisplayName(c),
    })),
  )

  return {
    artists,
    cities,
    keywords,
    loaded,
    load,
    artistNames,
    keywordNames,
    cityOptions,
  }
})
