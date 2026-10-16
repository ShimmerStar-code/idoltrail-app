/**
 * 地理定位相关响应类型。
 *
 * 口径说明：后端返回的 city 是**中文**城市名（如「北京」），
 * 而 /events 的 city 过滤参数与 event_sessions.city 存的都是**英文**名（如「Beijing」）。
 * 前端必须经 `cityEn()` 转换后再用于活动筛选，否则筛不到数据。
 */
export interface CityResult {
  /** 中文城市名，无行政后缀；未能识别时为空串 */
  city: string
}

/** 按来源 IP 推断城市（/geocode/ip）的响应 */
export type IpCityResult = CityResult

/** 坐标反查城市（/geocode/reverse）的响应 */
export type ReverseCityResult = CityResult
