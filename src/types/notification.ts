// 通知模块类型定义
export interface Notification {
  id: string
  type: NotificationType
  title: string
  content: string
  relatedType: string
  relatedId: string
  isRead: boolean
  createdAt: string
}

export type NotificationType =
  | 'venue_change'   // 场地变更
  | 'time_change'    // 时间变更
  | 'artist_change'  // 阵容变更
  | 'event_cancel'   // 活动取消
  | 'new_event'      // 新活动
  | 'info_change'    // 活动信息变更 / 下架

export interface NotificationListEnvelope {
  total: number
  page: number
  page_size: number
  list: Notification[]
}

export interface UnreadCountResponse {
  count: number
}

/** 按通知类型细分的开关集合（值为该类型是否接收系统推送） */
export type NotificationTypeSettings = Record<NotificationType, boolean>

export interface NotificationSettings {
  /** App 系统推送总开关 */
  pushEnabled: boolean
  /** 按类型细分开关 */
  pushTypes: NotificationTypeSettings
}

/** 服务端 `push_types` 字段缺失时的兜底值：默认全部开启 */
export const DEFAULT_NOTIFICATION_TYPES: NotificationTypeSettings = {
  venue_change: true,
  time_change: true,
  artist_change: true,
  event_cancel: true,
  new_event: true,
  info_change: true,
}
