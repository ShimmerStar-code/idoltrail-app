// 场馆 API 封装。
//
// 与订阅模块分开：场馆列表是**公共数据**（订阅页按城市浏览可订阅的场馆），
// 场馆订阅的写操作仍在 @/api/subscription 里。

import { request } from '@/utils/request'
import type { PageResult } from '@/types'
import type { VenuePlace } from '@/types/subscription'

export const venueApi = {
  /**
   * 某城市下的场馆列表（按活动数降序）。
   *
   * cityId 是 regions.id（与城市订阅的 target_id 同一 id 空间）——
   * 用城市名定位会踩「regions.name 是中文、event_sessions.city 是英文」的坑。
   */
  listByCity: (cityId: string, page = 1, pageSize = 50) =>
    request<PageResult<VenuePlace>>('/places', {
      method: 'GET',
      data: { city_id: cityId, page, page_size: pageSize },
    }),
}
