// 热门配置 API。
// 后端路由：/api/v1/public/hot-items，公开无需鉴权。
//
// 这些条目原先是 App 端写死的常量（constants/cities.ts 的 HOT_CITIES、
// constants/eventMeta.ts 的类型+流派、偶像页 grouped 接口的前 6 个），
// 运营换一批只能改代码发版。现在由后台配置，App 启动后拉一次。

import { request } from '@/utils/request'

export interface HotArtist {
  /** artists.id */
  id: string
  name: string
  sort_order: number
}

export interface HotCity {
  /** regions.id */
  id: string
  /** 地区英文名（后端 city 筛选用的就是这个值） */
  name: string
  /** 运营自定义的中文展示名，可空 */
  title: string
  sort_order: number
}

export interface HotKeyword {
  name: string
  sort_order: number
}

export interface HotItems {
  artist: HotArtist[]
  city: HotCity[]
  keyword: HotKeyword[]
}

export const hotApi = {
  /**
   * 拉取三类热门条目。
   *
   * silent: true —— 拉不到就回落到 App 内置的静态兜底值，
   * 不该给用户弹一个「加载失败」的 toast（热门入口是辅助信息，不是主流程）。
   */
  get: () =>
    request<HotItems>('/public/hot-items', { method: 'GET', silent: true }),
}
