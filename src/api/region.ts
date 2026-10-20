// 地区模块 API 封装。
// 后端路由：/api/v1/regions，公开无需鉴权。
// 用于订阅页「添加城市」流程：CityPicker 选中文名 → 调本接口按 name 模糊查 region.id。

import { request } from '@/utils/request'

export interface RegionItem {
  id: string
  name: string
  pid: string
  level: number
  type: string
  iso: string
  lon: number
  lat: number
}

export const regionApi = {
  /** 按 name 模糊查 region；同时匹配 regions.name + region_aliases.name（支持中英文搜索） */
  search: (name: string, page = 1, page_size = 5) =>
    request<{ list: RegionItem[]; total: number; page: number; page_size: number }>(
      '/regions',
      { method: 'GET', data: { name, page, page_size } },
    ),
  /** 拉 City 类型 region（CityPicker 用，默认分页 50 条） */
  listCities: (page = 1, page_size = 50) =>
    request<{ list: RegionItem[]; total: number; page: number; page_size: number }>(
      '/regions',
      { method: 'GET', data: { type: 'City', page, page_size } },
    ),
}
