// 国家/地区名称映射
//
// 与 cities.ts 同源：后端 event_sessions.country / artists.country 存 ISO 3166-1
// alpha-2 两位码（CN / JP / KR / HK / MO …），前端用本文件转中文展示。
//
// ⚠️ 不要与 pages/artist/*.vue 里的 COUNTRY_LABELS 混用：那份是「首页分组标签」，
//    带产品语义（US → "欧美"、SG/MY/TH → "新马泰"），是运营维度的聚合，
//    不是法定国名。本表用于「城市·国家」这种需要准确国名的场合。
//    两者取值不同是刻意的，不是数据不一致。

import { formatCity as formatCitySafe } from "./cities"

/** ISO 3166-1 alpha-2 → 国家/地区中文名 */
export const COUNTRY_NAMES: Record<string, string> = {
  // ── 中国 ──
  // 港澳台统一归到「中国」，而不是 ISO 官方名的「中国香港 / 中国澳门」。
  // 原因：展示格式是「城市·国家」，城市已经是"香港"时再拼「中国香港」
  // 会输出「香港.中国香港」，同一地名重复两次。本平台是中国演出票务，
  // 港澳台与大陆其他城市并列，归到「中国」既简洁又与格式一致。
  CN: "中国",
  HK: "中国",
  MO: "中国",
  TW: "中国",
  // ── 东北亚 ──
  JP: "日本",
  KR: "韩国",
  KP: "朝鲜",
  MN: "蒙古",
  // ── 东南亚 ──
  SG: "新加坡",
  MY: "马来西亚",
  TH: "泰国",
  VN: "越南",
  ID: "印度尼西亚",
  PH: "菲律宾",
  // ── 欧美 ──
  US: "美国",
  GB: "英国",
  IE: "爱尔兰",
  FR: "法国",
  DE: "德国",
  AT: "奥地利",
  NL: "荷兰",
  BE: "比利时",
  CH: "瑞士",
  IT: "意大利",
  ES: "西班牙",
  PT: "葡萄牙",
  SE: "瑞典",
  NO: "挪威",
  DK: "丹麦",
  FI: "芬兰",
  PL: "波兰",
  RU: "俄罗斯",
  UA: "乌克兰",
  // ── 其他 ──
  CA: "加拿大",
  AU: "澳大利亚",
  NZ: "新西兰",
  BR: "巴西",
  IN: "印度",
}

/**
 * ISO 国家码 → 中文国家名，用于展示。
 * 空值返回空串；未知码回退原文（与 cities.ts 的 formatCity 保持同一回退策略），
 * 避免管理端新增国家后前端直接显示空白。
 */
export function formatCountry(code: string): string {
  if (!code) return ""
  return COUNTRY_NAMES[code.toUpperCase()] || code
}

/**
 * 「城市·国家」展示串，用于场次地点等需要同时交代两者的位置。
 * 分隔符统一用间隔号 U+00B7，中英文内容一律相同，不随文字语种切换。
 * - 城市走 cities.ts 的 formatCity（英文 → 中文，查不到回退原文）
 * - 国家走本文件的 formatCountry（ISO 码 → 中文）
 * - 任意一侧为空则只返回另一侧，都空返回空串（调用方决定兜底文案）
 */
export function formatCityCountry(city: string, country: string): string {
  const c = formatCitySafe(city)
  const n = formatCountry(country)
  if (c && n) return `${c}·${n}`
  return c || n
}
