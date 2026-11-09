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

/**
 * 组合成员（GET /api/v1/artists/:id/members 分页下发）。
 *
 * 与 detail.relations 分开的原因：组合的成员可以有几百个（AKB48 435 位），
 * 塞进详情响应里是 ~90KB 的纯冗余；分页下发既能翻页看全，传输量也最小。
 */
export interface ArtistMember {
  id: string
  name: string
  avatar_url: string
  country: string
  type: string
  gender: string
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
  // urls / works / relations 后端查不到行时序列化成 null（GORM 的 nil slice），
  // 不是空数组。声明成必填非空数组会让任何一处 .map() 直接炸，
  // 当前只靠 detail.vue 里的 ?.length 和 || [] 侥幸兜住。
  urls: { id: number; url: string; url_type: string }[] | null
  works: ArtistWork[] | null
  // related_* 由后端联表 artists 带出（只读，不落库）；
  // 库里没配头像时 related_avatar_url 为空串，客户端按 related_type/related_gender 兜底。
  relations: {
    id: number
    artist_id: string
    related_id: string
    related_name: string
    relation_type: string
    direction: string
    related_avatar_url: string
    related_country: string
    related_type: string
    related_gender: string
  }[] | null
  events?: {
    id: number
    title: string
    type: string
    status: string
    poster_url: string
    start_date: string | null
    end_date: string | null
    organizer: string
    /** 该活动总场次数（后端下发，不受列表筛选影响） */
    session_count?: number
    /** 覆盖城市数，>1 表示巡演 */
    city_count?: number
    /** 最早/最晚场次日期（YYYY-MM-DD） */
    first_event_date?: string
    last_event_date?: string
    /** 首场城市（英文，如 Beijing）——该接口不返回 sessions，只能靠它显示城市胶囊 */
    city?: string
  }[]
}
