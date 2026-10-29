// 城市定位（App 端）：系统坐标定位为主，IP 粗定位兜底。
//
// 为什么用 uni.getLocation 而不是自研 UTS 原生插件：
//   uni.getLocation 的 `type` 决定走哪条链路：
//     · type:'wgs84' → **系统定位**（Android LocationManager / iOS CoreLocation）
//     · type:'gcj02' → 三方定位 SDK（高德 / 腾讯），才需要申请 key 与商业授权
//   本 App 只取城市级粒度，用 wgs84 走系统定位即可，
//   因此 manifest 只需勾选 Geolocation（系统定位），**不需要任何地图厂商 key**，
//   也不涉及高德 5 万元/年的商业授权。详见 manifest.json 的 modules 注释。
//
// 为什么不让 App 直连天地图做逆地理编码：
//   key 写在客户端包里等于公开，会被任意反编译刷配额。
//   坐标上报后由服务端用天地图 key 反查，服务端还有 7 天 Redis 缓存兜成本。
//
// 坐标系：系统定位返回 WGS84，天地图使用 CGCS2000，
//   两者在国内的实际差异在亚米级，对「定位到城市」完全无影响，无需转换。
//
// IP 粗定位是**默认路径**（不只是兜底）。
//   应用市场要求权限必须在用户主动触发对应功能时申请，
//   首启就弹位置授权框会被判「强制、频繁、过度索取权限」，
//   因此首页一律用 IP 推断城市（不碰任何系统权限），
//   只有用户在「城市选择器」里点「重新定位」时才申请坐标定位权限。
// IP 粗定位仍然保留，还因为坐标定位存在真实的失败路径：
//   - 用户拒绝定位权限（且 Android 上被永久拒绝后再也不会弹框）
//   - 室内 / 无网 / GPS 冷启动超时
//   - 部分小众或老旧 Android 机型不支持系统定位（华为、小米、OV、vivo 等主流机型没问题）
//   此时若直接置空，用户首屏会没有城市；退化成 IP 粗定位，体验回落到改造前，且不需要任何权限。
//
// 精度差异：IP 取运营商出口 IP，可能落在邻市；坐标是设备实际位置。
//   两者都可能与用户主观所在城市不符（如人在郊区、跨城出差），
//   因此 CityPicker 始终提供手动选择，且手动选择的结果不会被定位覆盖。

import { geoApi } from '@/api/geo'
import { hasPrivacyConsent, requestLocationPermission } from '@/utils/privacy'

const KEY_LOCATED_CITY = 'fans:locate:city'

/** 定位结果的本地缓存时长：24h。城市级结果本就稳定，过期主要为了切城后能刷新 */
const CACHE_TTL = 24 * 60 * 60 * 1000

/**
 * 坐标定位的超时上限。
 *
 * 取 8s：系统网络定位通常 1~3s 出结果，8s 足够覆盖室内弱信号；
 * 再长只会让首屏「定位中...」停留过久。注意**不包含**用户点授权框的时间，
 * 那部分由调用方（首页）的总超时兜底。
 */
const COORD_TIMEOUT = 8000

/** 去掉行政后缀：市/区/县/镇/乡，确保只保留城市名 */
function normalizeCity(raw: string | null | undefined): string {
  return (raw || '').trim().replace(/[市区县镇乡]$/, '')
}

interface CityCache {
  city: string
  /** 缓存写入时间戳（ms） */
  at: number
}

function readCache(): CityCache | null {
  const raw = uni.getStorageSync(KEY_LOCATED_CITY) as CityCache | null
  if (!raw || !raw.city || typeof raw.at !== 'number') return null
  if (Date.now() - raw.at >= CACHE_TTL) {
    uni.removeStorageSync(KEY_LOCATED_CITY)
    return null
  }
  return raw
}

function writeCache(city: string): void {
  uni.setStorageSync(KEY_LOCATED_CITY, { city, at: Date.now() } as CityCache)
}

interface Coordinates {
  lat: number
  lon: number
}

/**
 * 调用 uni.getLocation 取一组坐标，失败或超时则 reject。
 *
 * isHighAccuracy 刻意为 false：true 会等待 GPS 精定位，冷启动可能十几秒，
 * 而我们只需要城市级精度，系统网络定位（几十到几百米）已经够用，快得多。
 */
function getCoordinates(timeoutMs: number): Promise<Coordinates> {
  return new Promise((resolve, reject) => {
    let settled = false

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      reject(new Error(`定位超时（${timeoutMs}ms）`))
    }, timeoutMs)

    uni.getLocation({
      type: 'wgs84',
      geocode: false,
      isHighAccuracy: false,
      success: (res) => {
        if (settled) return
        settled = true
        clearTimeout(timer)

        const lat = Number(res.latitude)
        const lon = Number(res.longitude)
        // 某些 ROM 在定位引擎异常时会返回 (0, 0)（几内亚外海），
        // 直接上报会让用户莫名其妙定位到非洲，必须当失败处理。
        if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) {
          reject(new Error('定位返回无效坐标'))
          return
        }
        resolve({ lat, lon })
      },
      fail: (err) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        reject(new Error(err?.errMsg || '系统定位失败'))
      },
    })
  })
}

/** 坐标定位：授权 → 取坐标 → 服务端天地图逆地理编码 */
async function locateByCoordinate(): Promise<string> {
  const granted = await requestLocationPermission()
  if (!granted) throw new Error('未获得定位权限')

  const { lat, lon } = await getCoordinates(COORD_TIMEOUT)
  // 打印真实坐标：排障时需要确认系统定位是否可用、以及拿到的是哪套坐标系
  console.log('[location] 系统坐标 wgs84:', lat, lon)
  const data = await geoApi.reverseGeocode(lat, lon)
  const city = normalizeCity(data.city)
  if (!city) throw new Error('逆地理编码未返回城市')
  return city
}

/** IP 粗定位：不需要任何权限，作为坐标定位失败时的兜底 */
async function locateByIp(): Promise<string> {
  const data = await geoApi.locateCityByIp()
  const city = normalizeCity(data.city)
  if (!city) throw new Error('IP 定位未返回城市')
  return city
}

/**
 * 获取当前城市（中文名，无行政后缀）。
 *
 * 优先级：本地缓存 → 坐标定位 → IP 粗定位 → reject。
 *
 * @param options.force 跳过本地缓存强制重新定位。CityPicker 的「重新定位」需要它——
 *   用户点这个按钮的前提就是当前城市不对（出差、换网络、用了代理），
 *   若命中 24h 缓存按下去会毫无变化，等于坏功能。
 * @param options.precise 是否走**系统坐标定位**（会申请定位权限）。
 *   默认 false —— 只走 IP 粗定位，**不申请任何系统权限**。
 *
 * ⚠️ 为什么默认不申请定位权限（应用市场检测「强制、频繁、过度索取权限」的报法）：
 *   国内应用商店要求权限必须在**用户主动触发对应功能时**申请，
 *   首启 / 首页加载就弹位置授权框会被判为过度索权。
 *   所以首页定位一律走 IP 粗定位（不需要系统权限）；
 *   只有用户自己在「城市选择器」里点「重新定位」才申请精确位置权限。
 *
 * @returns 中文城市名；坐标与 IP 都失败时 reject，由调用方决定降级策略
 */
export async function locateCity(options?: { force?: boolean; precise?: boolean }): Promise<string> {
  if (!options?.force) {
    const cached = readCache()
    if (cached) {
      console.log('[location] 命中本地缓存:', cached.city)
      return cached.city
    }
  }

  // 用户尚未同意隐私协议时，不得发起任何定位请求：
  //   · 系统坐标定位需要系统授权（见 utils/privacy.ts）；
  //   · IP 粗定位虽不碰系统权限，但「用 IP 推断位置」本身就是个人信息处理，
  //     同样必须等到用户同意之后。
  if (!hasPrivacyConsent()) {
    throw new Error('未同意隐私协议，跳过定位')
  }

  // 粗定位路径（默认）：只用 IP 推断城市，不申请任何系统权限。
  if (!options?.precise) {
    const city = await locateByIp()
    console.log('[location] IP 粗定位成功:', city)
    writeCache(city)
    return city
  }

  // 精定位路径：仅在用户主动点击「重新定位」时走到这里，因此此时才申请权限是合规的。
  try {
    const city = await locateByCoordinate()
    console.log('[location] 坐标定位成功:', city)
    writeCache(city)
    return city
  } catch (e) {
    console.warn('[location] 坐标定位失败，降级为 IP 粗定位:', e)
    const city = await locateByIp()
    console.log('[location] IP 粗定位成功:', city)
    writeCache(city)
    return city
  }
}

/** 清除缓存的城市。退出登录、用户主动要求清除本地数据时调用 */
export function clearLocatedCity(): void {
  uni.removeStorageSync(KEY_LOCATED_CITY)
}