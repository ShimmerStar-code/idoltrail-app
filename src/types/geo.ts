/**
 * 地理定位相关响应类型。
 *
 * 口径说明：
 *  - 后端 city 归一化接口返回的 `code` / `codes` 是**与库内真实写法一致**的英文值，
 *    可直接作为 /events 的 city 参数（筛选靠精确匹配）。
 *  - `name` 是中文显示名（用于界面展示）。
 *  - 同一个城市在库里可能有多种写法（香港 = "Hong Kong" + "Xianggang"），
 *    所以筛选时要带上 `codes` 里的全部写法，漏一个就漏一批场次。
 */

/** 城市归一化结果（/city/normalize） */
export interface CityNormalizeResult {
  /** 是否命中站内城市 */
  matched: boolean
  /** 归一化后的国家码 */
  country: string
  /** 规范英文码（与 event_sessions.city 一致），可直接用于筛活动 */
  code: string
  /** 该城市在库内的全部等价写法（按活动数降序） */
  codes: string[]
  /** 中文显示名 */
  name: string
  /** 站内 region.id */
  region_id: string
  /** 层级：1 国家 / 2 省州 / 3 城市 */
  level: number
  /** 城市名有歧义（多国同名且外部信息不足以消歧） */
  ambiguous: boolean
  /** 消歧失败时的候选城市 */
  candidates?: Array<{
    code: string
    name: string
    country: string
    region_id: string
  }>
}

/** 城市归一化的入参 */
export interface CityNormalizeInput {
  /** 国家码（ISO 3166-1 alpha-2），可空 */
  country?: string
  /** 城市名，必填 */
  city: string
  /** 省 / 州名，可空；用于同名城市的二次消歧 */
  region?: string
}

/** 城市结果（旧接口仍返回中文城市名） */
export interface CityResult {
  /** 中文城市名，无行政后缀；未能识别时为空串 */
  city: string
}

/** 按来源 IP 推断城市（/geocode/ip）的响应 */
export type IpCityResult = CityResult

/** 坐标反查城市（/geocode/reverse）的响应 */
export type ReverseCityResult = CityResult
