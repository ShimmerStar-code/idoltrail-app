import type { PageParams, PageResult } from '@/types'
import { request } from '@/utils/request'
import type { Artist, ArtistDetail } from '@/types/artist'

/** 按地区偶像列表页支持的排序字段 */
export type ArtistSort = 'event_count' | 'subscriber_count'
export type ArtistOrder = 'asc' | 'desc'

export const artistApi = {
  list: (params: PageParams & {
    type?: string
    genre?: string
    country?: string
    sort?: ArtistSort
    order?: ArtistOrder
  }) => request<PageResult<Artist>>('/artists', { method: 'GET', data: params }),

  /**
   * 首页分组列表：每个国家取订阅数最高的前 per 个（默认 9）。
   * countries：只查这些国家（首屏快速加载）
   * exclude：排除这些国家（其他地区懒加载）
   */
  grouped: (per = 9, options?: { countries?: string[]; exclude?: string[] }) =>
    request<{ list: Artist[] }>('/artists/grouped', {
      method: 'GET',
      data: {
        per,
        ...(options?.countries?.length ? { countries: options.countries.join(',') } : {}),
        ...(options?.exclude?.length  ? { exclude:   options.exclude.join(',')   } : {}),
      },
    }),

  detail: (id: string) =>
    request<ArtistDetail>(`/artists/${id}`, { method: 'GET' }),
}
