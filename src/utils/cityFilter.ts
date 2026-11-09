// 城市筛选参数解析：把「界面上的城市」翻译成 /events?city= 的取值。
//
// ── 为什么必须有这一层 ─────────────────────────────────────────────
//
// 后端 event_sessions.city 存的是**录入时的原始写法**，同一个城市在库里有多种写法：
//
//   香港   → "Hong Kong"（2 场） + "Xianggang"（18 场）
//   西安   → "Xi'an"（38 场） + "xian"
//   澳门   → "Aomen"（15 场）
//   呼和浩特 → "Huhehaote"（8 场）
//   乌鲁木齐 → "Wulumuqi"（5 场）
//   哈尔滨 → "haerbin"（5 场）
//   纽约   → "New York"（591 场） + "New York City"（12 场）
//
// 筛选是**精确匹配**（`city = ?`），所以：
//   · 只给一个写法 → 漏掉同城另一批场次（选「香港」只看到 2/20 场）；
//   · 给静态表里的"规范码" → 一条都筛不到（Xian→0、HongKong→0、Macau→0、
//     Hohhot→0、Urumqi→0、NewYork→0、LosAngeles→0、KualaLumpur→0）。
//
// 权威口径在后端（regions / region_aliases / event_sessions 三张表），
// App 端只有一份包内快照，改不动也追不上 —— 所以走 /city/normalize 问后端要
// 「这个城市在库里有哪几种写法」，一次拿到 codes 全集。
//
// 后端对这批查询有 6h Redis 缓存，重复选择同城几乎不产生实际开销。

import { geoApi } from '@/api/geo'
import { cityEn } from '@/constants/cities'

/**
 * 归一化结果缓存（内存，进程内）。
 *
 * key = 查询名（小写）。用户在一次会话里来回切城市很常见，
 * 每次都问后端一次没意义。
 */
const codesCache = new Map<string, string[]>()

/** 缓存上限：超过就整体清空（简单的容量保护，避免无限增长） */
const CACHE_MAX = 200

/**
 * 解析城市对应的**全部库内写法**，供 /events?city= 使用。
 *
 * @param query      查询用名。优先传**英文写法**（regions.name 或 /events/cities
 *                   的原值）；实在没有才传中文名。
 * @param fallbackZh 归一化失败（网络问题）时的回落依据：走包内静态映射表。
 * @returns 库内写法的数组（可能为空数组 = 无法确定，静默不筛城市）。
 */
export async function resolveCityCodes(
  query: string,
  fallbackZh?: string,
): Promise<string[]> {
  const q = (query || '').trim()
  if (!q) return []

  const cacheKey = q.toLowerCase()
  const cached = codesCache.get(cacheKey)
  if (cached) return cached

  try {
    const r = await geoApi.normalizeCity({ city: q })
    if (r.matched) {
      // codes 是库里**实际有活动**的写法（后端只返回有活动的）；
      // 没有活动时后端会把 region 主名放在 code 里，一并作为兜底。
      const codes = r.codes.length ? r.codes.slice() : r.code ? [r.code] : []
      if (codes.length) {
        if (codesCache.size >= CACHE_MAX) codesCache.clear()
        codesCache.set(cacheKey, codes)
        return codes
      }
    }
  } catch (e) {
    // 归一化失败不是致命错误：回落静态映射表（能筛出大部分城市），
    // 静默继续 —— 筛选失败不该打断用户浏览。
    console.warn('[cityFilter] 城市归一化失败，回落静态映射表:', e)
  }

  // 回落（归一化失败，通常是网络问题）：静态映射表。
  //
  // 取舍顺序：
  //  1. 查询名本身 —— 它是英文写法时，很可能**就是**库内真实写法
  //     （"Xi'an" / "Hong Kong" / "Xianggang"），比静态表的"规范码"更准
  //     （静态表的 Xian / HongKong 反而筛不出）；
  //  2. 静态映射表（中文名 → 规范码）；
  //  3. 都没有 → 返回空数组，调用方据此不加 city 参数（走全国兜底），
  //     绝不塞一个中文值去筛 —— 那必然 0 条，比不过滤更糟。
  if (looksLikeEnglishCode(q)) return [q]
  const fallback = cityEn(fallbackZh || q)
  return fallback && looksLikeEnglishCode(fallback) ? [fallback] : []
}

/** 把多个写法拼成 /events?city= 的取值（后端支持逗号分隔多值） */
export function cityQueryValue(codes: string[]): string {
  return codes.filter(Boolean).join(',')
}

/**
 * 判断是否像「英文/拼音写法」（含字母且不含汉字）。
 *
 * 用于回落时的取舍：活动表 city 存的都是英文写法，
 * 中文名拿去筛必然 0 条 —— 宁可不给 city 参数（走全国兜底），
 * 也不要给一个筛不出任何东西的值。
 */
function looksLikeEnglishCode(s: string): boolean {
  return /[A-Za-z]/.test(s) && !/[一-龥]/.test(s)
}
