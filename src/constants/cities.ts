// 首页与活动列表共享的城市数据
// 后端 event_sessions.city 字段存英文（无空格，驼峰/无分隔），前端用此文件做双向转换
// 规则：英文 key 不含空格、不含撇号，使用驼峰（HongKong）或纯拼音（Xian）

/** 中文城市 → 英文（与 DB event_sessions.city 字段精确匹配） */
export const CITY_ZH_TO_EN: Record<string, string> = {
  // ── 中国大陆 ──
  "北京":   "Beijing",
  "上海":   "Shanghai",
  "广州":   "Guangzhou",
  "深圳":   "Shenzhen",
  "成都":   "Chengdu",
  "杭州":   "Hangzhou",
  "武汉":   "Wuhan",
  "南京":   "Nanjing",
  "重庆":   "Chongqing",
  "长沙":   "Changsha",
  "西安":   "Xian",        // DB 存 Xian（无撇号）
  "天津":   "Tianjin",
  "苏州":   "Suzhou",
  "郑州":   "Zhengzhou",
  "青岛":   "Qingdao",
  "大连":   "Dalian",
  "厦门":   "Xiamen",
  "宁波":   "Ningbo",
  "东莞":   "Dongguan",
  "佛山":   "Foshan",
  "昆明":   "Kunming",
  "沈阳":   "Shenyang",
  "合肥":   "Hefei",
  "哈尔滨": "Harbin",
  "济南":   "Jinan",
  "福州":   "Fuzhou",
  "贵阳":   "Guiyang",
  "太原":   "Taiyuan",
  "石家庄": "Shijiazhuang",
  "南宁":   "Nanning",
  "兰州":   "Lanzhou",
  "海口":   "Haikou",
  "呼和浩特": "Hohhot",
  "乌鲁木齐": "Urumqi",
  "拉萨":   "Lhasa",
  "银川":   "Yinchuan",
  "西宁":   "Xining",
  "南昌":   "Nanchang",
  "长春":   "Changchun",
  "珠海":   "Zhuhai",
  "中山":   "Zhongshan",
  "惠州":   "Huizhou",
  "烟台":   "Yantai",
  "温州":   "Wenzhou",
  "无锡":   "Wuxi",
  "泉州":   "Quanzhou",
  "绍兴":   "Shaoxing",
  // ── 港澳台 ──
  "香港":   "HongKong",   // DB 规范值（无空格）
  "澳门":   "Macau",
  "台北":   "Taipei",
  "高雄":   "Kaohsiung",
  // ── 日本 ──
  "东京":   "Tokyo",
  "大阪":   "Osaka",
  "名古屋": "Nagoya",
  "福冈":   "Fukuoka",
  "京都":   "Kyoto",
  "札幌":   "Sapporo",
  // ── 韩国 ──
  "首尔":   "Seoul",
  "釜山":   "Busan",
  "仁川":   "Incheon",
  // ── 东南亚 ──
  "新加坡": "Singapore",
  "曼谷":   "Bangkok",
  "吉隆坡": "KualaLumpur",
  "雅加达": "Jakarta",
  "马尼拉": "Manila",
  // ── 其他常见演出城市 ──
  "洛杉矶": "LosAngeles",
  "纽约":   "NewYork",
  "伦敦":   "London",
  "悉尼":   "Sydney",
  "墨尔本": "Melbourne",
}

/** 反向 map（英文 → 中文），覆盖 CITY_ZH_TO_EN 全部条目 */
export const CITY_EN_TO_ZH: Record<string, string> = Object.entries(CITY_ZH_TO_EN).reduce(
  (acc, [zh, en]) => { acc[en] = zh; return acc },
  {} as Record<string, string>,
)

/** 中文城市 → 英文，用于后端请求参数（与 DB 精确匹配） */
export function cityEn(zh: string): string | undefined {
  return CITY_ZH_TO_EN[zh]
}

/** 英文城市 → 中文，用于卡片/导航展示（找不到时回退原文） */
export function formatCity(en: string): string {
  if (!en) return ""
  return CITY_EN_TO_ZH[en] || en
}

/** 12 个热门城市（中文，用于首页快捷入口） */
export const HOT_CITIES: string[] = [
  "北京", "上海", "广州", "深圳",
  "成都", "杭州", "南京", "苏州",
  "太原", "武汉", "香港", "新加坡", "东京",
]

/** 全部城市（含省份信息，用于弹窗右侧标签） */
export interface CityMeta {
  name: string
  region: string
}

export const ALL_CITIES_META: CityMeta[] = [
  { name: "北京",   region: "中国 | 直辖市" },
  { name: "上海",   region: "中国 | 直辖市" },
  { name: "广州",   region: "中国 | 广东省" },
  { name: "深圳",   region: "中国 | 广东省" },
  { name: "成都",   region: "中国 | 四川省" },
  { name: "杭州",   region: "中国 | 浙江省" },
  { name: "武汉",   region: "中国 | 湖北省" },
  { name: "南京",   region: "中国 | 江苏省" },
  { name: "重庆",   region: "中国 | 直辖市" },
  { name: "长沙",   region: "中国 | 湖南省" },
  { name: "西安",   region: "中国 | 陕西省" },
  { name: "天津",   region: "中国 | 直辖市" },
  { name: "苏州",   region: "中国 | 江苏省" },
  { name: "郑州",   region: "中国 | 河南省" },
  { name: "青岛",   region: "中国 | 山东省" },
  { name: "大连",   region: "中国 | 辽宁省" },
  { name: "厦门",   region: "中国 | 福建省" },
  { name: "宁波",   region: "中国 | 浙江省" },
  { name: "东莞",   region: "中国 | 广东省" },
  { name: "佛山",   region: "中国 | 广东省" },
  { name: "昆明",   region: "中国 | 云南省" },
  { name: "沈阳",   region: "中国 | 辽宁省" },
  { name: "合肥",   region: "中国 | 安徽省" },
  { name: "哈尔滨", region: "中国 | 黑龙江省" },
  { name: "济南",   region: "中国 | 山东省" },
  { name: "福州",   region: "中国 | 福建省" },
  { name: "贵阳",   region: "中国 | 贵州省" },
  { name: "太原",   region: "中国 | 山西省" },
  { name: "石家庄", region: "中国 | 河北省" },
  { name: "南宁",   region: "中国 | 广西" },
  { name: "兰州",   region: "中国 | 甘肃省" },
  { name: "海口",   region: "中国 | 海南省" },
  { name: "呼和浩特", region: "中国 | 内蒙古" },
  { name: "乌鲁木齐", region: "中国 | 新疆" },
  { name: "拉萨",   region: "中国 | 西藏" },
  { name: "银川",   region: "中国 | 宁夏" },
  { name: "西宁",   region: "中国 | 青海省" },
  { name: "南昌",   region: "中国 | 江西省" },
  { name: "长春",   region: "中国 | 吉林省" },
  { name: "珠海",   region: "中国 | 广东省" },
  { name: "中山",   region: "中国 | 广东省" },
  { name: "惠州",   region: "中国 | 广东省" },
  { name: "烟台",   region: "中国 | 山东省" },
  { name: "温州",   region: "中国 | 浙江省" },
  { name: "无锡",   region: "中国 | 江苏省" },
  { name: "泉州",   region: "中国 | 福建省" },
  { name: "绍兴",   region: "中国 | 浙江省" },
  { name: "香港",   region: "中国 | 香港特别行政区" },
  { name: "澳门",   region: "中国 | 澳门特别行政区" },
  { name: "台北",   region: "中国 | 台湾" },
  { name: "高雄",   region: "中国 | 台湾" },
  { name: "东京",   region: "日本" },
  { name: "大阪",   region: "日本" },
  { name: "名古屋", region: "日本" },
  { name: "福冈",   region: "日本" },
  { name: "京都",   region: "日本" },
  { name: "札幌",   region: "日本" },
  { name: "首尔",   region: "韩国" },
  { name: "釜山",   region: "韩国" },
  { name: "仁川",   region: "韩国" },
  { name: "新加坡", region: "新加坡" },
  { name: "曼谷",   region: "泰国" },
  { name: "吉隆坡", region: "马来西亚" },
  { name: "雅加达", region: "印度尼西亚" },
  { name: "马尼拉", region: "菲律宾" },
  { name: "洛杉矶", region: "美国" },
  { name: "纽约",   region: "美国" },
  { name: "伦敦",   region: "英国" },
  { name: "悉尼",   region: "澳大利亚" },
  { name: "墨尔本", region: "澳大利亚" },
]
