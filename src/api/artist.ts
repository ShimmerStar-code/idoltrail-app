import type { PageParams, PageResult } from '@/types'
import { request } from '@/utils/request'
import type { Artist, ArtistDetail } from '@/types/artist'

/** 按地区偶像列表页支持的排序字段 */
export type ArtistSort = 'event_count' | 'subscriber_count'
export type ArtistOrder = 'asc' | 'desc'

/** 分组列表的组内取数口径 */
export type ArtistGroupedSort = 'event_count' | 'subscriber_count'

export const artistApi = {
  list: (params: PageParams & {
    type?: string
    genre?: string
    country?: string
    sort?: ArtistSort
    order?: ArtistOrder
  }) => request<PageResult<Artist>>('/artists', { method: 'GET', data: params }),

  /**
   * 偶像页分组列表：每个国家取一组艺人（默认 9 个）。
   * sort 决定"取哪 per 个"和"组内怎么排"，不是先取完再重排：
   * 后端 ROW_NUMBER 的 ORDER BY 与输出 ORDER BY 用同一列，所以
   * sort=event_count 取到的就是活动最多的那批人（默认是订阅数最多的）。
   *
   * main：偶像页专用，国家白名单由后端持有（service.KnownCountries），
   * 客户端不传 countries。好处是 cache key 与客户端入参无关，
   * 后端部署时预热的 key 就是线上真实请求的 key，缓存 24h 命中。
   * 旧的 countries/exclude 组合保留给小程序与后台使用。
   */
  grouped: (per = 9, options?: { countries?: string[]; exclude?: string[]; sort?: ArtistGroupedSort; main?: boolean }) =>
    request<{ list: Artist[] }>(options?.main ? '/artists/grouped/main' : '/artists/grouped', {
      method: 'GET',
      data: {
        per,
        ...(options?.sort ? { sort: options.sort } : {}),
        ...(options?.countries?.length ? { countries: options.countries.join(',') } : {}),
        ...(options?.exclude?.length  ? { exclude:   options.exclude.join(',')   } : {}),
      },
    }),

  detail: (id: string) =>
    request<ArtistDetail>(`/artists/${id}`, { method: 'GET' }),
}
