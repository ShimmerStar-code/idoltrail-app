export interface ArtistSearchHit {
  id: string
  name?: string
  /** 兼容旧版搜索接口的艺人名称字段 */
  artist_name?: string
  sort_name?: string
  country?: string
  type?: string
  gender?: string
  avatar_url?: string
  theme_color?: string
  aliases?: { name: string; locale?: string }[] | null
}

export interface EventSearchHit {
  id: number
  title: string
  sessions?: {
    city?: string
    times?: { event_date: string }[]
  }[] | null
}

export interface PlaceSearchHit {
  id: string
  name: string
  country?: string
  city?: string
}

export interface SearchHits<T> {
  hits?: T[] | null
  total?: number
}

/** 搜索接口当前返回 { hits, total }，保留数组兼容旧版响应。 */
export type SearchResponse<T> = T[] | SearchHits<T>
