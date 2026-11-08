import type { PageParams, PageResult } from '@/types'
import { request } from '@/utils/request'
import type { Event, EventDetail } from '@/types/event'

/**
 * 活动排序语义 key。
 *
 * 必须与后端 `repository.EventOrder*` 常量一一对应
 * （internal/repository/event.go）。后端在 repository 层做白名单收敛，
 * 传未知值会回落到默认排序，不会报错、也不会把外部字符串拼进 ORDER BY。
 *
 * - date_ASC     即将开始：按**最早场次日期**升序（用户装 App 最想要的口径）
 * - created_DESC 最新上架：按录入时间倒序（历史默认口径）
 * - date_DESC    场次倒序：看历史演出
 * - hot          热度：点赞 + 订阅
 * - global_hot   著名城市优先：香港/东京/新加坡/纽约等城市有场次的活动排前面
 *                （「全球」tab 专用）
 */
export type EventSort = 'date_ASC' | 'created_DESC' | 'date_DESC' | 'hot' | 'global_hot'

/** 排序选项（首页与活动列表页共用同一份，避免两处文案漂移） */
export const EVENT_SORT_OPTIONS: { code: EventSort; label: string }[] = [
  { code: 'date_ASC', label: '即将开始' },
  { code: 'created_DESC', label: '最新上架' },
  { code: 'hot', label: '最热门' },
]

export const eventApi = {
  list: (params: PageParams & {
    status?: string
    genre?: string
    type?: string
    country?: string
    city?: string
    date?: string
    /**
     * scope='global' → 「全球」视图（境外 + 港澳台）。
     * 与 country 不是一回事：country 是精确匹配单个国家，
     * 表达不了「除中国大陆以外」。
     */
    scope?: string
    order?: EventSort
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
