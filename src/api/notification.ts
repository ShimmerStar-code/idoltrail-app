// 通知模块 API 封装。
// 后端路由：/api/v1/notifications/*，全部需鉴权（request 自动注入 Bearer）。
//
// 说明：App 端**不再**消费微信订阅消息配额，所有通知走系统推送（uni-push 2.0），
// 因此这里没有 wechat_enabled / wechat-subscribe 相关的接口。

import { request } from '@/utils/request'
import type {
  NotificationListEnvelope,
  UnreadCountResponse,
  NotificationSettings,
  NotificationType,
  NotificationTypeSettings,
} from '@/types/notification'

export const notificationApi = {
  /** 分页获取通知列表 */
  list: (page = 1, page_size = 20) =>
    request<NotificationListEnvelope>('/notifications', { method: 'GET', data: { page, page_size } }),

  /** 未读通知数（首页 badge 用） */
  unreadCount: () =>
    request<UnreadCountResponse>('/notifications/unread'),

  /** 标记单条已读 */
  markRead: (id: string) =>
    request<{ ok: boolean }>(`/notifications/${id}/read`, { method: 'PATCH' }),

  /** 全部已读 */
  markAllRead: () =>
    request<{ ok: boolean }>('/notifications/read-all', { method: 'POST' }),

  /** 清空已读通知（物理删除） */
  clearRead: () =>
    request<{ ok: boolean; deleted: number }>('/notifications/read', { method: 'DELETE' }),

  /** 获取通知设置 */
  getSettings: () =>
    request<NotificationSettings>('/notifications/settings'),

  /** 更新系统推送总开关 */
  updatePushEnabled: (push_enabled: boolean) =>
    request<{ ok: boolean }>('/notifications/settings', {
      method: 'PUT',
      data: { push_enabled },
    }),

  /** 更新按通知类型细分的开关 */
  updatePushTypes: (push_types: NotificationTypeSettings) =>
    request<{ ok: boolean }>('/notifications/settings', {
      method: 'PUT',
      data: { push_types },
    }),
}

/** 通知类型 → 中文标签 */
export const notificationTypeLabel: Record<NotificationType, string> = {
  venue_change:  '场地变更',
  time_change:   '时间变更',
  artist_change: '阵容变更',
  event_cancel:  '活动取消',
  new_event:     '新活动',
  info_change:   '信息变更',
}

/** 通知类型 → 颜色（与 messages.vue 色系保持一致） */
export const notificationTypeColor: Record<NotificationType, string> = {
  venue_change:  'rgba(151,217,216,1)',
  time_change:   'rgba(151,217,216,1)',
  artist_change: 'rgba(128,219,121,1)',
  event_cancel:  'rgba(255,156,171,1)',
  new_event:     'rgba(128,219,121,1)',
  info_change:   'rgba(180,162,255,1)',
}
