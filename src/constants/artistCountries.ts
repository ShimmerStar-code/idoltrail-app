// 偶像页国家/地区文案 —— pages/artist/* 的唯一来源。
//
// 与 countries.ts 的区别（刻意不同，不要合并成一张表）：
// - countries.ts 是「城市·国家」用的法定国名表，港澳台统一折叠成「中国」
//   （避免「香港.中国香港」重复）；见该文件顶部注释。
// - 本表是艺人语境，港澳台是独立的演出地区，保留「中国台湾 / 中国香港」。
//
// 两层关系（后者派生自前者，加国家只需改 ARTIST_REGION_LABELS）：
//   ARTIST_REGION_LABELS  艺人所属国家/地区的精确名  → 详情页 tag、组合成员
//   ARTIST_GROUP_LABELS   首页分组标签，SG/MY/TH 合并成「新马泰」 → 偶像首页、下钻页标题

import { COUNTRY_NAMES } from "./countries";

/** ISO 3166-1 alpha-2 → 艺人所属国家/地区中文名 */
export const ARTIST_REGION_LABELS: Record<string, string> = {
  ...COUNTRY_NAMES,
  // 港澳台在艺人语境下是独立演出地区，不折叠成「中国」
  TW: "中国台湾",
  HK: "中国香港",
  MO: "中国澳门",
  // countries.ts 覆盖的是「有城市数据的国家」，偶像页白名单里的 NG 不在其中
  NG: "尼日利亚",
};

/**
 * 首页分组标签。在地区名基础上把 SG/MY/TH 合并成一个「新马泰」分组。
 * 用展开派生而不是另抄一份，是为了让地区表新增的国家自动出现在首页分组里。
 */
export const ARTIST_GROUP_LABELS: Record<string, string> = {
  ...ARTIST_REGION_LABELS,
  SG: "新马泰",
  MY: "新马泰",
  TH: "新马泰",
};

/**
 * 偶像首页分组的展示顺序，与后端 service.KnownCountries 保持一致。
 *
 * 注意两点：
 * 1. 英国是 GB 不是 UK（artists.country 里 UK 的记录数为 0）；
 * 2. 新马泰在 ARTIST_GROUP_LABELS 里被合并成一个分组，所以这里是 SG/MY/TH 三个码。
 *
 * 前端不需要这个列表来构造请求——白名单由后端持有，
 * 这里只用于页面侧按国家做展示排序（白名单外的码统一排到最后）。
 */
export const ARTIST_HOME_GROUP_ORDER: string[] = [
  "CN", "JP", "KR", "US", "GB", "CA", "BR", "IN", "SG", "MY", "TH", "NG",
];

/**
 * 分组标签取值，未知码回退原文（管理端新增国家时不至于显示空白）。
 * SG/MY/TH 在这里返回合并后的「新马泰」。
 */
export function artistGroupLabel(code: string): string {
  if (!code) return "";
  return ARTIST_GROUP_LABELS[code.toUpperCase()] || code;
}

/**
 * 地区名取值，未知码回退原文。
 * 与 artistGroupLabel 的区别是不合并 SG/MY/TH，详情页要显示「新加坡」而非「新马泰」。
 */
export function artistRegionLabel(code: string): string {
  if (!code) return "";
  return ARTIST_REGION_LABELS[code.toUpperCase()] || code;
}

/**
 * 分组排序位次，白名单外的码统一排到最后。
 * 首页分组与「查看所有」下钻的 codes 排序都用它。
 */
export function artistGroupOrder(code: string): number {
  const idx = ARTIST_HOME_GROUP_ORDER.indexOf(code);
  return idx < 0 ? ARTIST_HOME_GROUP_ORDER.length : idx;
}
