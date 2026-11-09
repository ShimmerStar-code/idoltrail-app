/**
 * 埋点事件名与参数约定。
 *
 * ⚠️ 这份清单必须与后端 `internal/model/analytics_event.go` 的 `AnalyticsEventTypes`
 * **一一对应**：后端是权威（不在白名单的事件会被静默丢弃）。
 * 两边各写一份是有意的 —— App 端这份让 TS 在编译期就能发现拼写错误，
 * 后端那份决定「收不收」。新增事件时两边同时改。
 *
 * 参数（props）纪律：
 *   · 只放**业务 id 与枚举**（event_id、region、sort、source…）；
 *   · 绝不放个人信息（手机号、昵称、坐标、完整 IP、用户画像标签）；
 *   · 参数序列化后不超过 2KB（后端会丢弃超限的整条事件）。
 */
export const ANALYTICS_EVENTS = {
  /** 冷启动 */
  APP_LAUNCH: 'app_launch',
  /** 用户取得隐私政策同意 */
  PRIVACY_CONSENT: 'privacy_consent',
  /** 会话结束（切后台 / 退出） */
  SESSION_END: 'session_end',

  /** 首页曝光 */
  HOME_VIEW: 'home_view',
  /** 首页刷新（下拉 / 重进） */
  HOME_REFRESH: 'home_refresh',
  /** 切换区域 tab */
  REGION_SWITCH: 'region_switch',
  /** 切换排序口径 */
  SORT_CHANGE: 'sort_change',
  /** 选择分类 */
  CATEGORY_SELECT: 'category_select',

  /** 活动列表页曝光 */
  LIST_VIEW: 'list_view',
  /** 点击活动卡片 */
  EVENT_CARD_CLICK: 'event_card_click',
  /** 活动详情页曝光 */
  EVENT_DETAIL_VIEW: 'event_detail_view',
  /** 触发分享 */
  SHARE_CLICK: 'share_click',
  /** 加入系统日历 */
  AGENDA_ADD: 'agenda_add',

  /** 订阅 / 取消订阅 */
  SUBSCRIBE_CLICK: 'subscribe_click',
  /** 发起搜索 */
  SEARCH_SUBMIT: 'search_submit',
  /** 点击搜索结果 */
  SEARCH_RESULT_CLICK: 'search_result_click',

  /** 登录结果 */
  LOGIN_RESULT: 'login_result',
  /** 定位结果 */
  CITY_LOCATE: 'city_locate',
  /** 手动选择城市 */
  CITY_SELECT: 'city_select',
  /** 点击站内通知 / 推送 */
  NOTIFICATION_CLICK: 'notification_click',

  /** 接口耗时（请求层自动上报，只报慢请求与失败） */
  API_LATENCY: 'api_latency',
} as const

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS]

/** 排序口径（与首页/列表页的 sort 参数一致） */
export type AnalyticsSort = 'created_DESC' | 'date_ASC' | 'date_DESC' | 'hot' | 'id_DESC'

/** 区域档位 */
export type AnalyticsRegion = 'local' | 'national' | 'global'

/** 登录方式 */
export type AnalyticsLoginMethod = 'sms' | 'onekey' | 'apple'
