// 订阅模块 API 封装。
// 后端路由：/api/v1/subscriptions/*，全部需鉴权（request 自动注入 Bearer）。

import { request } from '@/utils/request'
import type {
  ArtistCardVO,
  CityCardVO,
  EventCardVO,
  EventListEnvelope,
  PageEnvelope,
  SubscribeResult,
} from '@/types/subscription'

export const subscriptionApi = {
  // ── 艺人 ──
  /** 只取已订阅艺人 id 数组（最快路径，给「按钮反显」用） */
  myArtistIds: () => request<{ ids: string[] }>('/subscriptions/artists?ids_only=true'),
  /** 完整卡片列表（偶像 tab 主数据） */
  myArtists: () => request<{ list: ArtistCardVO[] }>('/subscriptions/artists'),
  subscribeArtist: (artist_id: string) =>
    request<SubscribeResult>('/subscriptions/artists', { method: 'POST', data: { artist_id } }),
  unsubscribeArtist: (id: string) =>
    request<SubscribeResult>(`/subscriptions/artists/${id}`, { method: 'DELETE' }),
  /** 偶像 tab "已关联的活动" */
  artistRelatedEvents: (page = 1, page_size = 20) =>
    request<PageEnvelope<EventCardVO>>('/subscriptions/artists/related-events', {
      method: 'GET', data: { page, page_size },
    }),

  // ── 城市 ──
  myCityIds: () => request<{ ids: string[] }>('/subscriptions/cities?ids_only=true'),
  myCities: () => request<{ list: CityCardVO[] }>('/subscriptions/cities'),
  subscribeCity: (city_id: string, extra?: Record<string, any>) =>
    request<SubscribeResult>('/subscriptions/cities', { method: 'POST', data: { city_id, extra } }),
  /** 修改城市卡的 type/tag 筛选偏好 */
  updateCityExtra: (id: string, extra: Record<string, any>) =>
    request<{ ok: boolean }>(`/subscriptions/cities/${id}`, { method: 'PATCH', data: { extra } }),
  unsubscribeCity: (id: string) =>
    request<SubscribeResult>(`/subscriptions/cities/${id}`, { method: 'DELETE' }),
  /** 城市 tab "已关联的活动"分页（city-events 页面用） */
  cityRelatedEvents: (
    city_id: string,
    status: 'ongoing' | 'expired' = 'ongoing',
    page = 1,
    page_size = 20,
    extra?: { type?: string; tag?: string },
  ) =>
    request<EventListEnvelope>(
      `/subscriptions/cities/${city_id}/related-events`,
      { method: 'GET', data: { status, page, page_size, ...(extra ?? {}) } },
    ),

  // ── 活动 ──
  myEvents: (status: 'ongoing' | 'expired', page = 1, page_size = 20) =>
    request<EventListEnvelope>('/subscriptions/events', {
      method: 'GET', data: { status, page, page_size },
    }),
  subscribeEvent: (event_id: number) =>
    request<SubscribeResult>('/subscriptions/events', { method: 'POST', data: { event_id } }),
  unsubscribeEvent: (id: number) =>
    request<SubscribeResult>(`/subscriptions/events/${id}`, { method: 'DELETE' }),
}
