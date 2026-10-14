export interface Place {
  id: string
  name: string
  country: string
  type: string
  address: string
  latitude: number
  longitude: number
  aliases: { name: string; locale: string }[]
  regions: { id: string; name: string; level: number }[]
  // 后端从 regions 推导出的城市（level 3 → 2 → 1 回退），可能为空字符串
  city: string
}

// 场馆详情页活动列表项（精简结构，按 design 卡片）
export interface PlaceEvent {
  id: number
  title: string
  type: string
  status: string
  created_at: string
  is_new: boolean
  city: string
  event_date: string
  start_time: string
  format: string
  artists: { id: string; name: string }[]
}
