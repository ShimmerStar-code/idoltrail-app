import type {
  CityNormalizeInput,
  CityNormalizeResult,
  IpCityResult,
  ReverseCityResult,
} from '@/types/geo'
import { request } from '@/utils/request'

export const geoApi = {
  /**
   * 按请求来源 IP 推断城市，返回中文城市名。
   *
   * 必须经服务端代理，不能让 App 直连 ip-api / ip.sb 之类的第三方：
   * 直连会带来跨境流量、第三方不可用、以及把用户 IP 外发给未备案服务商的合规风险。
   *
   * silent: true —— 定位失败不应弹全局 toast。CityPicker 的「重新定位」是在
   * 弹层打开期间触发的，其 mask（z-index 9999）会完全遮住 uni-toast（999），
   * 表现为「日志有错、界面没反应」。失败文案由调用方内联展示。
   */
  locateCityByIp: () => request<IpCityResult>('/geocode/ip', { method: 'GET', silent: true }),

  /**
   * 坐标反查城市（经纬度 → 中文城市名）。
   *
   * 必须经服务端代理：App 直连天地图等于把 key 暴露在客户端包内，
   * 任何人都能扒出来刷配额。服务端已做 7 天 Redis 缓存，成本可忽略。
   *
   * 坐标保留 6 位小数（约 0.1m 精度）后再上报：原始浮点数的 15~17 位有效数字
   * 会让 URL 变长，且没必要——城市级判定用不到更高精度。
   *
   * 缓存分桶在**服务端**完成（约 1km 网格聚合，7 天 TTL），客户端不做缓存。
   */
  reverseGeocode: (lat: number, lon: number) =>
    request<ReverseCityResult>('/geocode/reverse', {
      method: 'GET',
      silent: true,
      data: { lat: lat.toFixed(6), lon: lon.toFixed(6) },
    }),

  /**
   * 城市归一化：把外部来源的「国家 + 城市」原始值换成站内的规范写法。
   *
   * 为什么需要这个接口：
   *   活动表 `event_sessions.city` 存的是**录入时的原始写法**，
   *   同一个城市在库里有多种写法（香港 = "Hong Kong" + "Xianggang"，
   *   西安 = "Xi'an"，呼和浩特 = "Huhehaote" …），
   *   而筛选是**精确匹配**（`city = ?`）。拿外部给的名字直接去筛，
   *   命中率是 0 —— 这正是首页定位筛不出活动的根因。
   *   后端知道库里到底有哪些写法，所以归一化必须由后端做（唯一权威）。
   *
   * 返回的 `code` / `codes` 就是库里真实存在的写法，可直接拿去筛；
   * `name` 是中文显示名，用于界面展示。
   *
   * silent: true —— 定位失败不弹全局 toast（CityPicker 的「重新定位」在弹层
   * 打开期间触发，mask 会遮住 uni-toast），失败由调用方内联展示。
   */
  normalizeCity: (input: CityNormalizeInput) =>
    request<CityNormalizeResult>('/city/normalize', {
      method: 'GET',
      silent: true,
      data: {
        country: input.country || '',
        city: input.city,
        region: input.region || '',
      },
    }),
}
