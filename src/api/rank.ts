// 贡献榜接口
//
//   GET /public/rankings?period=all|month|week&page=&page_size=
//
// 公开可读；带登录态时响应里会多一段 me（我的名次 / 再收录 N 条即可超过上一名）。
import { request } from '@/utils/request'
import type { RankingPeriod, RankingResult } from '@/types/rank'

export const rankApi = {
  list(params: {
    period?: RankingPeriod
    page?: number
    page_size?: number
  } = {}) {
    return request<RankingResult>('/public/rankings', { method: 'GET', data: params })
  },
}
