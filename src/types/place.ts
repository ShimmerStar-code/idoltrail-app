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

// ⚠️ 场馆活动列表不再用这里的精简结构：
// 场馆页改用 GET /places/:id/events/list（与 /events 列表同构），
// 数据类型直接复用 @/types/event 的 Event，交给 EventCard 渲染。
// （旧的 /places/:id/events 精简接口留给独立小程序代码库，App 端不再调用。）

