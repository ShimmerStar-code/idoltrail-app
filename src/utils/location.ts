// 城市定位（App 端，IP 粗定位）。
//
// 为什么不用系统定位：
//   uni.getLocation 在 Android 底层是高德 SDK，manifest.json 未配 amap.key 时必然 fail，
//   要正常工作得申请高德 key（需实名认证，且个人开发者有额度/商用限制）。
//   而本 App 只用到**城市级**粒度——首页顶部城市文案 + CityPicker 的选中项，
//   街道级坐标没有任何业务价值，不值得为它引入一项敏感权限和一把外部 key。
//   iOS 虽然走系统 CoreLocation 不需要 key，但两端行为不一致会让「为什么安卓没反应」
//   这类问题更难排查，统一走 IP 更省心。
//
// 改为 IP 后的三个收益：
//   1) manifest 不再声明 Geolocation 模块与 Android 定位权限，少一项敏感权限，
//      应用商店的隐私合规问询更轻，iOS 也无需再声明 NSLocationWhenInUseUsageDescription
//   2) 不再有「授权弹窗 → 拒绝 → 无法定位」的失败路径，也不存在用户事后撤回权限
//      导致定位永久失效的情况
//   3) 首屏不再需要等待用户完成授权，定位成功率由「系统授权成功率」变成「IP 库命中率」
//
// 代价（已知且接受）：
//   - 精度为城市级，运营商出口 IP 可能落在邻市
//   - Wi-Fi 与移动网络的出口 IP 不同，切网后短期内结果可能变化，
//     故结果本地缓存 24h，避免用户在同一次使用过程中看到城市反复横跳
//   - 精度不足时用户可在 CityPicker 手动改城市，手动选择的结果不会被 IP 覆盖

import { geoApi } from '@/api/geo'

const KEY_LOCATED_CITY = 'fans:locate:city'

/** IP 推断结果的本地缓存时长：24h。城市级结果本就稳定，过期主要为了切网后能刷新 */
const CACHE_TTL = 24 * 60 * 60 * 1000

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

/**
 * 推断当前城市（中文名，无行政后缀）。
 *
 * @param options.force 跳过本地缓存强制重新请求。CityPicker 的「重新定位」需要它——
 *   用户点这个按钮的前提就是当前城市不对（出差、换网络、用了代理），
 *   若命中 24h 缓存按下去会毫无变化，等于坏功能。
 * @returns 中文城市名；识别失败时 reject，由调用方决定降级策略
 */
export async function locateCity(options?: { force?: boolean }): Promise<string> {
  if (!options?.force) {
    const cached = readCache()
    if (cached) return cached.city
  }

  const data = await geoApi.locateCityByIp()
  const city = normalizeCity(data.city)
  if (!city) throw new Error('IP 定位未返回城市')
  uni.setStorageSync(KEY_LOCATED_CITY, { city, at: Date.now() } as CityCache)
  return city
}

/** 清除缓存的城市。退出登录、用户主动要求清除本地数据时调用 */
export function clearLocatedCity(): void {
  uni.removeStorageSync(KEY_LOCATED_CITY)
}