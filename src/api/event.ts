import type { PageParams, PageResult } from '@/types'
import { request } from '@/utils/request'
import type { Event, EventDetail } from '@/types/event'

export const eventApi = {
  list: (params: PageParams & {
    status?: string
    genre?: string
    type?: string
    country?: string
    city?: string
    date?: string
  }) =>
    request<PageResult<Event>>('/events', { method: 'GET', data: params }),

  listCities: (params?: { status?: string; genre?: string; type?: string }) =>
    request<{ list: string[] }>('/events/cities', { method: 'GET', data: params }),

  /** 某月每天的活动场数（key = YYYY-MM-DD，仅含有活动的天），供日历直接展示 */
  calendarCounts: (params?: {
    month?: string
    status?: string
    genre?: string
    type?: string
    city?: string
  }) =>
    request<{ month: string; counts: Record<string, number> }>(
      '/events/calendar-counts',
      { method: 'GET', data: params },
    ),

  detail: (id: number) =>
    request<EventDetail>(`/events/${id}`, { method: 'GET' }),

  /** 切换点赞状态（需登录）。返回操作后的最新状态和点赞总数。 */
  toggleLike: (id: number) =>
    request<{ liked: boolean; likes_count: number }>(`/events/${id}/like`, { method: 'POST' }),
}
