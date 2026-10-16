export interface Artist {
  id: string
  name: string
  sort_name: string
  country: string
  type: string
  gender: string
  last_activity_year: number
  // 以下字段由后端在 /api/v1/artists 列表中按需返回,可能为空
  event_count?: number         // 关联活动场次(用于按地区页 "(N场)")
  subscriber_count?: number    // 订阅人数(用于按地区页排序)
  avatar_url?: string          // 部分后端实体会带,前端兼容
  // 主题色 #RRGGBB，后台 Web 端配置；空/缺失表示未配置，
  // 前端按 id 哈希从预设浅色板取（见 @/constants/artistTheme）
  theme_color?: string
}

export interface ArtistWork {
  id: number
  artist_id: string
  title: string
  release_date: string
  description: string
  sort_order: number
}

export interface ArtistDetail extends Artist {
  detail: {
    birthday: string
    debut_date: string
    area_name: string
    tags: string
    rating: number
    description: string
    disambiguation: string
  } | null
  aliases: { name: string; locale: string }[]
  genres: { genre_code: string; confidence: number }[]
  relations: { related_id: string; related_name: string; relation_type: string }[]
  urls: { url: string; url_type: string }[]
  works: ArtistWork[]
  events?: {
    id: number
    title: string
    type: string
    status: string
    poster_url: string
    start_date: string | null
    end_date: string | null
    organizer: string
  }[]
}
