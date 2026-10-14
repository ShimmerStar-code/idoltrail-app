// 订阅模块的 TypeScript 类型定义。
// 与后端 internal/service/subscription.go 的 VO 严格对齐。

import type { Artist } from './artist'

export type SubTargetType = 'artist' | 'city' | 'event'

/** 订阅/退订统一返回 */
export interface SubscribeResult {
  subscribed: boolean
  already: boolean
  target_type: SubTargetType
  target_id: string
}

/** 偶像 tab 网格单元 */
export interface ArtistCardVO {
  artist: Artist
  avatar_url: string
  event_count: number
  subscribed: boolean
  subscribed_at: string
}

/** 城市主数据（来自 regions 表） */
export interface CityRegion {
  id: string
  name: string
  pid: string
  level: number
  type: string
  iso: string
  lon: number
  lat: number
}

/** 城市 tab 列表项 */
export interface CityCardVO {
  city: CityRegion
  event_count: number
  extra: { type?: string; tag?: string } & Record<string, any>
  subscribed_at: string
}

/** 活动卡片的精简结构 */
export interface EventBrief {
  id: number
  title: string
  poster_url: string
  start_date: string
  end_date: string
  city: string
  genre: string
  type: string   // 活动类型：Concert / Music_Festival / Fan_Meeting / Anime_Expo / Concert_Hall
  status?: string // 存储状态 PUBLISHED/ENDED/CANCELLED...（卡片按其 + end_date 派生“已结束”）
  artist?: {
    id: string
    name: string
    avatar_url: string
  } | null
}

/** 活动 tab 卡片 */
export interface EventCardVO {
  event: EventBrief
  is_new: boolean
  theme_color: 'purple' | 'green' | 'pink' | 'blue' | 'yellow'
  subscribed_at: string
}

/** 分页响应（统一形状） */
export interface PageEnvelope<T> {
  list: T[]
  total: number
  page: number
  page_size: number
}

/** GET /subscriptions/events 额外携带 status */
export interface EventListEnvelope extends PageEnvelope<EventCardVO> {
  status: 'ongoing' | 'expired'
}
