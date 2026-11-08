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

/**
 * 运行时登记一个城市名 → 城市英文码的映射。
 *
 * 背景：热门城市改成运营在后台配置后，运营可能给一个本地映射表里没有的城市
 * 起中文名（比如把 "Nagoya" 配成「名古屋」，或把某个小城市配上中文名）。
 * App 端选中热门城市后要用中文名反查英文码去筛活动，
 * 而反查只认上面那张静态表 —— 不登记的话，用户点了热门城市却筛不出任何活动
 * （表现为「点了没反应」，比不配更糟）。
 *
 * 规则：
 *   - 只增不改：已有映射一律保留，静态表优先（静态表是 App 内置的既定事实）；
 *   - 英文码本身也可以作为中文名登记（映射表外的城市）：
 *     此时中文名就是英文码，筛选依然能正常工作，只是界面显示英文。
 */
export function registerCityName(name: string, en: string): void {
  const key = name?.trim()
  const code = en?.trim()
  if (!key || !code) return
  if (!CITY_ZH_TO_EN[key]) {
    CITY_ZH_TO_EN[key] = code
  }
  if (!CITY_EN_TO_ZH[code]) {
    CITY_EN_TO_ZH[code] = key
  }
}

/**
 * DB 实际值 → 规范英文码。
 *
 * 背景：event_sessions.city 是运营/爬虫录入的原始值，不遵守本文件头部
 * 约定的「无空格、无撇号、驼峰或纯拼音」（约定值是 Xian / HongKong）。
 * 实测库里同时存在 "Xi'an" 与 "xian"、"Hong Kong" 与 "Xianggang"、
 * "Aomen" 与 "Macao"、"haerbin"（小写）、"Huhehaote"、"Wulumuqi" 等写法，
 * 静态表一个都匹配不上 → 卡片城市胶囊直接显示英文（"Xi'an.15城"）。
 *
 * 这里把线上实际出现的写法归一到规范码，再走 CITY_EN_TO_ZH 取中文。
 * 只做显示归一，不改 DB 数据。
 */
const CITY_ALIAS_TO_EN: Record<string, string> = {
  // ── 撇号 / 空格 / 大小写变体 ──
  "Xi'an": "Xian",
  "xian": "Xian",
  "Xianggang": "HongKong",
  "Hong Kong": "HongKong",
  "Aomen": "Macau",
  "Macao": "Macau",
  "haerbin": "Harbin",
  "Huhehaote": "Hohhot",
  "Wulumuqi": "Urumqi",
  "jakarta": "Jakarta",
  "zhaozhuang": "Zaozhuang",
  "Kuala Lumpur": "KualaLumpur",
  "New York": "NewYork",
  "Los Angeles": "LosAngeles",
  "Ho Chi Minh City": "HoChiMinhCity",
  "Hongkong": "HongKong",
  "Hongkong SAR": "HongKong",
  "Taiyuan ": "Taiyuan",
};

/**
 * DB 实际值 → 中文。
 *
 * 只收静态表 CITY_ZH_TO_EN 里没有的城市（规范码不在表内，只能直接给中文）。
 * 已经能被 CITY_ALIAS_TO_EN 归一的城市不在这里重复登记。
 */
const CITY_DISPLAY_ZH: Record<string, string> = {
  // ── 中国大陆 ──
  Changzhou: "常州",
  Jiaxing: "嘉兴",
  Xuzhou: "徐州",
  Taizhou: "台州",
  Linyi: "临沂",
  Nantong: "南通",
  Baotou: "包头",
  Shangrao: "上饶",
  Liuzhou: "柳州",
  Jinhua: "金华",
  Rizhao: "日照",
  Shantou: "汕头",
  Weifang: "潍坊",
  Guilin: "桂林",
  Liaocheng: "聊城",
  Liaoyang: "辽阳",
  Yuncheng: "运城",
  Zhenjiang: "镇江",
  Changzhi: "长治",
  Daqing: "大庆",
  Dezhou: "德州",
  Eerduosi: "鄂尔多斯",
  Jiangmen: "江门",
  Jining: "济宁",
  Kunshan: "昆山",
  Langfang: "廊坊",
  Luzhou: "泸州",
  Maoming: "茂名",
  Qianjiang: "潜江",
  Qinhuangdao: "秦皇岛",
  Quzhou: "衢州",
  Sanya: "三亚",
  Xiangyang: "襄阳",
  Xingtai: "邢台",
  Yangzhou: "扬州",
  Yichang: "宜昌",
  Zhanjiang: "湛江",
  Zhoukou: "周口",
  Zunyi: "遵义",
  Baoding: "保定",
  Baoji: "宝鸡",
  Changshu: "常熟",
  Dongying: "东营",
  Ezhou: "鄂州",
  Fuyang: "阜阳",
  Heyuan: "河源",
  Heze: "菏泽",
  Huanggang: "黄冈",
  Jinzhong: "晋中",
  Leshan: "乐山",
  Lianyungang: "连云港",
  Liuan: "六安",
  Luoyang: "洛阳",
  Sanming: "三明",
  Weihai: "威海",
  Weinan: "渭南",
  Wuhu: "芜湖",
  Xianning: "咸宁",
  Xinyang: "信阳",
  Yangjiang: "阳江",
  Yiwu: "义乌",
  Yulin: "玉林",
  Zhangjiakou: "张家口",
  Zhangzhou: "漳州",
  Zhaoqing: "肇庆",
  Zhoushan: "舟山",
  Zhumadian: "驻马店",
  Zibo: "淄博",
  Anshan: "鞍山",
  Beihai: "北海",
  Binzhou: "滨州",
  Chengmai: "澄迈",
  Chifeng: "赤峰",
  Datong: "大同",
  Enshi: "恩施",
  Ganzhou: "赣州",
  Guigang: "贵港",
  Hanzhong: "汉中",
  Haozhou: "亳州",
  Hechi: "河池",
  Hengyang: "衡阳",
  "Huai'an": "淮安",
  Huaihua: "怀化",
  Huangshi: "黄石",
  Huludao: "葫芦岛",
  Jiangyin: "江阴",
  Jincheng: "晋城",
  Jingmen: "荆门",
  Jiujiang: "九江",
  Jiuquan: "酒泉",
  Lijiang: "丽江",
  Linfen: "临汾",
  Lishui: "丽水",
  Longyan: "龙岩",
  Luohe: "漯河",
  Mianyang: "绵阳",
  Neijiang: "内江",
  Pingliang: "平凉",
  Qingyuan: "清远",
  Qinzhou: "钦州",
  Shanwei: "汕尾",
  Shaoyang: "邵阳",
  Shigatse: "日喀则",
  Shizuishan: "石嘴山",
  Suining: "遂宁",
  Suqian: "宿迁",
  "Tai'an": "泰安",
  Tangshan: "唐山",
  Tongliao: "通辽",
  Wuzhong: "吴忠",
  Wuzhou: "梧州",
  Xuancheng: "宣城",
  "Yan'an": "延安",
  Yangquan: "阳泉",
  Yibin: "宜宾",
  Yingtan: "鹰潭",
  Yiyang: "益阳",
  Yueyang: "岳阳",
  Yunfu: "云浮",
  Yuxi: "玉溪",
  Zhangjiagang: "张家港",
  Zaozhuang: "枣庄",
  zhaozhuang: "枣庄",
  // ── 港澳台 ──
  // ── 国外 ──
  "South Korea": "韩国",
  Japan: "日本",
  Malaysia: "马来西亚",
  "United Kingdom": "英国",
  Phuket: "普吉",
  Toronto: "多伦多",
  Vancouver: "温哥华",
  // ── 省 / 国家被误填成城市（库里的脏值）──
  Hunan: "湖南",
  Xinjiang: "新疆",
  Guizhou: "贵州",
  Yunnan: "云南",
};

/** 英文城市 → 中文，用于卡片/导航展示（找不到时回退原文） */
export function formatCity(en: string): string {
  if (!en) return "";
  const key = en.trim();
  if (CITY_EN_TO_ZH[key]) return CITY_EN_TO_ZH[key];
  // DB 原始写法先归一到规范码
  const alias = CITY_ALIAS_TO_EN[key];
  if (alias && CITY_EN_TO_ZH[alias]) return CITY_EN_TO_ZH[alias];
  // 规范码不在静态表内 → 直接用补充的中文表
  return CITY_DISPLAY_ZH[key] || key;
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
