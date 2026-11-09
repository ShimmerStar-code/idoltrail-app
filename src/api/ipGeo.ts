// IP 定位服务直连（设备侧）
// ─────────────────────────────────────────────────────────────────────────────
//
// 首选 my.ip.cn，失败时回退到自建服务 ip.idolact.cn：
//
//	设备 → https://my.ip.cn/ → 归属地文本（国家 / 省份 / 城市）
//	     → 失败 → https://ip.idolact.cn/api → { country, city, region, ... }
//
// 必须由设备直连：这类服务返回的是调用方自己的出口 IP 位置，后端代理只能拿到
// 服务器的位置。my.ip.cn 是第三方服务，会接触调用方出口 IP；调用仍受
// utils/location.ts 的隐私同意门禁控制。
//
// 全部使用 HTTPS，避免 Android 9+ 拦截明文流量，并降低 IP 泄露风险。
// 本模块不自行判断隐私同意状态，也不做模块级预热或请求。

const PRIMARY_IP_GEO_URL = 'https://my.ip.cn/'
const FALLBACK_IP_GEO_URL = 'https://ip.idolact.cn/api'
const DIRECT_MUNICIPALITIES = new Set(['北京', '上海', '天津', '重庆'])

/**
 * IP 定位超时（ms）。
 *
 * 取 10s：真机连续请求存在超过 5s 的间歇性超时，给弱网请求更多完成时间；
 * 超时后按首选、兜底顺序切换服务，仍失败才由上层降级。
 */
const IP_GEO_TIMEOUT = 10000

/** 归一化前的 IP 定位结果 */
export interface IpGeoResult {
  /** 国家码（ISO 3166-1 alpha-2）；无法识别时为空 */
  country: string
  /** 城市名，外部服务可能返回中文或英文 */
  city: string
  /** 省 / 州 / 直辖市名；部分响应里为空 */
  region: string
  /** 出口 IP；my.ip.cn 路径不保存该值 */
  ip: string
}

function requestMyIpCn(): Promise<IpGeoResult> {
  return new Promise((resolve, reject) => {
    uni.request({
      url: PRIMARY_IP_GEO_URL,
      method: 'GET',
      timeout: IP_GEO_TIMEOUT,
      dataType: 'text',
      header: {},
      success: (res) => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`my.ip.cn 返回 ${res.statusCode}`))
          return
        }
        const text = typeof res.data === 'string' ? res.data : ''
        const matched = text.match(/归属地[：:]\s*([^\r\n<]+)/)
        const parts = matched?.[1]?.trim().split(/\s+/) ?? []
        if (parts.length < 3) {
          reject(new Error('my.ip.cn 未返回完整归属地'))
          return
        }
        const [countryName, rawRegion, rawCity] = parts
        const region = rawRegion.replace(/市$/, '')
        const city = DIRECT_MUNICIPALITIES.has(region) ? region : rawCity
        if (!city) {
          reject(new Error('my.ip.cn 未返回城市'))
          return
        }
        const country = countryName === '中国' ? 'CN' : ''
        console.log('[ipGeo] my.ip.cn 出口位置:', country, city, region || '-')
        resolve({ country, city, region, ip: '' })
      },
      fail: (err) => {
        reject(new Error(err?.errMsg || 'my.ip.cn 不可达'))
      },
    })
  })
}

function requestIdolactIpGeo(): Promise<IpGeoResult> {
  return new Promise((resolve, reject) => {
    uni.request({
      url: FALLBACK_IP_GEO_URL,
      method: 'GET',
      timeout: IP_GEO_TIMEOUT,
      header: {},
      success: (res) => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`ip.idolact.cn 返回 ${res.statusCode}`))
          return
        }
        const body = res.data as Partial<IpGeoResult> | null
        if (!body || typeof body !== 'object') {
          reject(new Error('ip.idolact.cn 返回内容异常'))
          return
        }
        const city = typeof body.city === 'string' ? body.city.trim() : ''
        if (!city) {
          reject(new Error('ip.idolact.cn 未返回城市'))
          return
        }
        const country = typeof body.country === 'string' ? body.country.trim() : ''
        const region = typeof body.region === 'string' ? body.region.trim() : ''
        console.log('[ipGeo] ip.idolact.cn 出口位置:', country, city, region || '-')
        resolve({
          country,
          city,
          region,
          ip: typeof body.ip === 'string' ? body.ip.trim() : '',
        })
      },
      fail: (err) => {
        reject(new Error(err?.errMsg || 'ip.idolact.cn 不可达'))
      },
    })
  })
}

/** 首选 my.ip.cn；请求失败、超时或归属地无法解析时使用自建服务兜底。 */
export async function fetchIpGeo(): Promise<IpGeoResult> {
  try {
    return await requestMyIpCn()
  } catch (e) {
    console.warn('[ipGeo] my.ip.cn 查询失败，改用 ip.idolact.cn:', e)
    return requestIdolactIpGeo()
  }
}
