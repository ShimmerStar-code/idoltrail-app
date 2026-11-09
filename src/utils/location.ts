// 城市定位（App 端）：IP 粗定位为默认路径，系统坐标定位为用户主动触发的精确路径。
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
// 坐标系：系统定位返回 WGS84，天地图使用 CGCS2000，
//   两者在国内的实际差异在亚米级，对「定位到城市」完全无影响，无需转换。
//
// ── IP 粗定位链路（默认） ───────────────────────────────────────────
//
//	设备 → https://my.ip.cn/（首选）
//	     → 失败 → https://ip.idolact.cn/api（自建兜底）
//	     → { country, city, region }（外部原值）
//	     → 后端 /city/normalize（国家 + 城市 → 站内规范写法）
//	     → { name(中文), code, codes[] }
//
// 必须**设备直连** IP 服务：服务返回的是调用方自己的出口位置，后端代理只能拿到
// 服务器的位置。my.ip.cn 是第三方服务，会接触用户出口 IP；请求仍受隐私同意门禁。
//
// 为什么拿到原始值后还要过后端归一化：
//   IP 服务给的是中文或英文名（"北京" / "Beijing" / "Xi'an" / "Hong Kong"），
//   而活动表 event_sessions.city 存的是**录入时的原始写法**，同一个城市有多种写法
//   （香港 = "Hong Kong" + "Xianggang"），且和 App 端静态表对不上
//   （Xian→0 而 Xi'an→38）。只有后端知道库里到底有哪些写法 —— 见 utils/cityFilter.ts。
//
// 精度差异：IP 取运营商出口 IP，可能落在邻市；坐标是设备实际位置。
//   两者都可能与用户主观所在城市不符（如人在郊区、跨城出差），
//   因此 CityPicker 始终提供手动选择，且手动选择的结果不会被定位覆盖。

import { geoApi } from '@/api/geo'
import { fetchIpGeo } from '@/api/ipGeo'
import { cityEn } from '@/constants/cities'
import { hasPrivacyConsent, requestLocationPermission } from '@/utils/privacy'
import type { CityNormalizeResult } from '@/types/geo'

/**
 * 定位结果（结构化）。
 *
 * 为什么不只返回一个中文城市名：
 *   界面要显示中文（「香港」），筛选要英文库内写法（"Hong Kong" / "Xianggang"），
 *   两者不是一回事 —— 只存中文名就得再查一次静态表，而静态表恰好是错的那些。
 *   所以定位一次就把「显示名 + 全部等价写法」一起带回来。
 */
export interface LocatedCity {
  /** 中文显示名（无行政后缀），用于界面展示 */
  name: string
  /** 规范码：库内真实写法之一，可直接用于筛活动 */
  code: string
  /** 该城市在库内的全部等价写法（按活动数降序），筛选时必须全带 */
  codes: string[]
  /** 国家码（ISO 3166-1 alpha-2） */
  country: string
  /** 站内 region.id（订阅城市时用它） */
  regionId: string
}

/**
 * 本地缓存 key 带版本号。
 *
 * v2：旧 key 下缓存过 IP 库的脏城市名（如「景山」「金融街」「鲁谷」——
 * 上游把街道/地块名当成 city 返回），这些值既筛不出活动也会在顶部显示成
 * 假城市。改 key 让旧缓存一次性失效，比逐个校验历史值干净。
 *
 * v3：缓存结构从「字符串城市名」改成结构化对象（name/code/codes），
 * 旧结构的记录无法反推出库内写法，必须换 key。
 */
const KEY_LOCATED_CITY = 'fans:locate:city:v3'

/** 定位结果的本地缓存时长：24h。城市级结果本就稳定，过期主要为了切城后能刷新 */
const CACHE_TTL = 24 * 60 * 60 * 1000

/**
 * 坐标定位的超时上限。
 *
 * 取 8s：系统网络定位通常 1~3s 出结果，室内搜星可能更久。
 *
 * 为什么给足 8s：用户是**主动点「重新定位」**才走这条路的，等于明确表达
 * "我愿意用精确位置换更准的结果"。既然授权了，就该给系统定位足够的时间；
 * 早判失败只是把精度偷偷降级，而降级结果（IP 粗定位）用户又看不到差别，
 * 只会觉得"定位不准"。
 *
 * 超时后**本次**降级到 IP 粗定位（不让用户空手而归），但**不记忆**这次失败 ——
 * 下次点「重新定位」必须重新尝试坐标定位（授权仍在，可能只是这次室内没搜到星）。
 */
const COORD_TIMEOUT = 8000

/** 去掉行政后缀：市/区/县/镇/乡，确保只保留城市名 */
function normalizeCity(raw: string | null | undefined): string {
  return (raw || '').trim().replace(/[市区县镇乡]$/, '')
}

/**
 * 把后端归一化结果转成 LocatedCity；未命中返回 null。
 *
 * codes 兜底：后端只在**实际有活动**的写法上返回 codes，
 * 没有活动的城市会给出空数组 —— 这时退回 region 主名，
 * 保证「筛不到活动」与「筛不出这个城市」是两件事。
 */
function toLocatedCity(
  r: CityNormalizeResult,
  fallbackName?: string,
): LocatedCity | null {
  if (!r.matched) return null
  const codes = r.codes.length ? r.codes.slice() : r.code ? [r.code] : []
  if (!codes.length) return null
  return {
    name: r.name || fallbackName || r.code,
    code: r.code || codes[0],
    codes,
    country: r.country || '',
    regionId: r.region_id || '',
  }
}

interface CityCache {
  city: LocatedCity
  /** 缓存写入时间戳（ms） */
  at: number
}

function isValidLocatedCity(c: unknown): c is LocatedCity {
  if (!c || typeof c !== 'object') return false
  const v = c as Partial<LocatedCity>
  return (
    typeof v.name === 'string' &&
    !!v.name &&
    Array.isArray(v.codes) &&
    v.codes.length > 0
  )
}

function readCache(): CityCache | null {
  const raw = uni.getStorageSync(KEY_LOCATED_CITY) as CityCache | null
  if (!raw || typeof raw.at !== 'number') return null
  if (Date.now() - raw.at >= CACHE_TTL) {
    uni.removeStorageSync(KEY_LOCATED_CITY)
    return null
  }
  // 缓存里可能是旧版写入的脏城市名（改 key 前的老数据）或结构不完整的记录，
  // 读出来时顺手清掉
  if (!isValidLocatedCity(raw.city)) {
    uni.removeStorageSync(KEY_LOCATED_CITY)
    return null
  }
  return raw
}

function writeCache(city: LocatedCity): void {
  // 未知城市不进缓存：写进去就等于锁 24h，首页会一直显示一个筛不出活动的假城市
  if (!isValidLocatedCity(city)) return
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

/**
 * 系统定位服务是否可用（GPS 或网络定位至少有一个已开启）。
 *
 * 为什么要显式检查：**已授予定位权限 ≠ 系统定位服务已开启**。
 * 用户可以在系统设置里把定位服务整个关掉 —— 这时 `uni.getLocation`
 * 既不 success 也不 fail（回调根本不回来），只能靠超时兜底。
 * 而每次都白等满 COORD_TIMEOUT 是纯粹的浪费：用户点「重新定位」，
 * 想要的只是一个城市，IP 粗定位 1~2s 就能给。
 *
 * 提前判定 → 立刻降级，用户不用干等。
 *
 * 判定不了时返回 true（**不拦**）：宁可等超时，也不能因为探测失败
 * 而剥夺用户已经授予的精确定位能力。
 */
function isSystemLocationEnabled(): boolean {
  // #ifdef APP-ANDROID
  try {
    // plus 的类型定义里 runtimeMainActivity() 返回的是 Activity 壳子，
    // 没有暴露 getSystemService，这里按最小结构断言，不引 any。
    const ctx = plus.android.runtimeMainActivity() as unknown as {
      getSystemService?: (name: string) => {
        isProviderEnabled: (provider: string) => boolean;
      };
    };
    const lm = ctx?.getSystemService?.('location');
    if (!lm) return true
    const gps = lm.isProviderEnabled('gps')
    const network = lm.isProviderEnabled('network')
    return !!gps || !!network
  } catch (e) {
    console.warn('[location] 定位服务状态探测失败，按可用处理:', e)
    return true
  }
  // #endif
  // #ifndef APP-ANDROID
  // iOS 没有"定位服务总开关"：系统级定位关闭时 getLocation 会直接 fail 授权错误。
  return true
  // #endif
}

/** 坐标定位：授权 → 取坐标 → 服务端天地图逆地理编码 → 后端城市归一化 */
async function locateByCoordinate(): Promise<LocatedCity> {
  const granted = await requestLocationPermission()
  if (!granted) throw new Error('未获得定位权限')

  // 权限有了但系统定位服务是关的 → 立刻降级，不白等满 COORD_TIMEOUT。
  // 每次都重新判定（不记忆）：用户把定位服务打开后，下一次就能走精确路径。
  if (!isSystemLocationEnabled()) {
    throw new Error('系统定位服务未开启')
  }

  const { lat, lon } = await getCoordinates(COORD_TIMEOUT)
  const data = await geoApi.reverseGeocode(lat, lon)
  const city = normalizeCity(data.city)
  if (!city) throw new Error('逆地理编码未返回城市')

  // 逆地理编码返回的是**中文**城市名（「北京」「香港」），
  // 同样要走后端归一化才能拿到库内写法。
  // 归一化未命中时回落静态映射表：覆盖「不在 regions 里但静态表认识」的城市，
  // 行为与改造前一致（原来就是拿 cityEn() 兜的）。
  try {
    const r = await geoApi.normalizeCity({ city })
    const located = toLocatedCity(r, city)
    if (located) return located
  } catch (e) {
    console.warn('[location] 坐标城市归一化失败，回落静态映射表:', e)
  }
  const en = cityEn(city)
  if (!en) throw new Error(`坐标定位返回未知城市: ${city}`)
  return { name: city, code: en, codes: [en], country: '', regionId: '' }
}

/**
 * IP 粗定位：不需要任何权限，作为首页默认路径。
 *
 * 两步：
 *  1. 设备直连 my.ip.cn 拿出口 IP 归属地，失败时由 ip.idolact.cn 兜底；
 *  2. 中文城市先转成英文查询名，再由后端归一化为站内写法 + 中文显示名。
 */
async function locateByIp(): Promise<LocatedCity> {
  const geo = await fetchIpGeo()
  const queryCity = cityEn(geo.city) || geo.city
  const r = await geoApi.normalizeCity({
    country: geo.country,
    city: queryCity,
    region: geo.region === geo.city ? queryCity : geo.region,
  })
  const located = toLocatedCity(r, geo.city)
  if (!located) throw new Error(`IP 定位未匹配到站内城市: ${geo.city}`)
  return located
}

/**
 * 获取当前城市。
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
 * @returns 定位结果（中文显示名 + 库内全部写法）；坐标与 IP 都失败时 reject，
 *   由调用方决定降级策略
 */
export async function locateCity(
  options?: { force?: boolean; precise?: boolean },
): Promise<LocatedCity> {
  if (!options?.force) {
    const cached = readCache()
    if (cached) return cached.city
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
    writeCache(city)
    return city
  }

  // 精定位路径：仅在用户主动点击「重新定位」时走到这里，因此此时才申请权限是合规的。
  try {
    const city = await locateByCoordinate()
    writeCache(city)
    return city
  } catch (e) {
    console.warn('[location] 坐标定位失败，降级为 IP 粗定位:', e)
    const city = await locateByIp()
    writeCache(city)
    return city
  }
}

/** 清除缓存的城市。退出登录、用户主动要求清除本地数据时调用 */
export function clearLocatedCity(): void {
  uni.removeStorageSync(KEY_LOCATED_CITY)
}
