import type { IpCityResult } from '@/types/geo'
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
}