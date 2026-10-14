export interface Event {
  id: number
  title: string
  type: string
  status: string
  poster_url: string
  start_date: string | null
  end_date: string | null
  organizer: string
  sessions?: {
    city: string
    place_name: string
    event_date?: string
  }[]
  artists?: {
    artist_id?: string
    artist_name: string
    avatar_url?: string
  }[]
}

export interface EventSession {
  id: number
  session_name: string
  place_name: string
  address: string
  city: string
  country: string
  status: string
  /** 关联场馆 ID，为空表示未绑定场馆，无法跳转场馆详情页 */
  place_id: string
  /** 场馆经纬度，0 或缺失表示未知，无法调起地图 */
  latitude: number
  longitude: number
  event_date?: string
  times: { event_date: string; start_time: string; door_time: string }[]
}

export interface EventTicket {
  id?: number
  name: string
  url: string
}

export interface EventDetail extends Event {
  description: string
  official_url: string
  sessions: EventSession[]
  artists: { artist_id?: string; artist_name: string; role_type: string; setlist_order: number; avatar_url?: string }[]
  genres: { genre_code: string }[]
  /** 购票入口，App 上只展示 name，点击才用 url 跳出去 */
  tickets?: EventTicket[]
  notice?: string
  likes_count?: number      // 真实点赞数（后端返回）
  is_liked?: boolean        // 当前用户是否已点赞
  subscribe_count?: number  // 真实订阅数（user_subscriptions 统计）
  // 以下字段已废弃，保留兼容旧缓存，勿再使用
  comments_count?: number
  collect_count?: number
}
