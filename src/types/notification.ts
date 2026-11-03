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
  /**
   * 外发通道（服务端 notifications.channel）：
   * none=未外发（纯站内）｜wechat=微信订阅消息｜unipush=App 系统推送。
   * ⚠️ 后端一直是返回的，但前端一直没声明 → 字段被静默丢弃。
   */
  channel?: NotificationChannel
  /** 外发投递状态：sent=成功｜failed=失败｜skipped=未投递（开关关闭/额度用尽） */
  pushStatus?: NotificationPushStatus
  /** 投递成功时间（ISO），仅 pushStatus=sent 时有值 */
  deliveredAt?: string
}

/** 通知外发通道 */
export type NotificationChannel = 'none' | 'wechat' | 'unipush'

/** 通知外发投递状态 */
export type NotificationPushStatus = 'sent' | 'failed' | 'skipped'

export type NotificationType =
  | 'venue_change'   // 场地变更
  | 'time_change'    // 时间变更
  | 'artist_change'  // 阵容变更
  | 'event_cancel'   // 活动取消
  | 'new_event'      // 新活动
  | 'info_change'    // 活动信息变更 / 下架
  | 'session_change' // 场次变更（新增/取消场次或演出时间点）

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
  session_change: true,
}
