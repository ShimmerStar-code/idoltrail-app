// 首页与活动列表共享的流派(genre)数据
// 后端 event_genre 枚举: CPOP / POP / JPOP / KPOP / ACG / ROCK / HIPHOP / ELECTRONIC / GUOFENG / CLASSICAL
// 与后端 CLAUDE.md 一致;10 项标签按客户方案排序,后端接收 genre=code

export interface GenreItem {
  label: string
  subtitle: string
  code: string
  color: string
  bg?: string
  icon: string
}

export const GENRES: GenreItem[] = [
  {
    label: "华语",
    subtitle: "C-POP",
    code: "CPOP",
    color: "rgba(254,165,0,1)",
    bg: "",
    icon: "/static/icons/genre-cpop.svg",
  },
  {
    label: "欧美",
    subtitle: "POP",
    code: "POP",
    color: "rgba(100,200,150,1)",
    bg: "",
    icon: "/static/icons/genre-pop.svg",
  },
  {
    label: "日音",
    subtitle: "J-POP",
    code: "JPOP",
    color: "rgba(255,190,120,1)",
    bg: "",
    icon: "/static/icons/genre-jpop.svg",
  },
  {
    label: "韩音",
    subtitle: "K-POP",
    code: "KPOP",
    color: "rgba(255,150,170,1)",
    bg: "",
    icon: "/static/icons/genre-kpop.svg",
  },
  {
    label: "二次元",
    subtitle: "ACG、OST、漫展",
    code: "ACG",
    color: "rgba(140,200,255,1)",
    bg: "",
    icon: "/static/icons/genre-anime.svg",
  },
  {
    label: "摇滚",
    subtitle: "ROCK",
    code: "ROCK",
    color: "rgba(80,80,80,1)",
    bg: "",
    icon: "/static/icons/genre-rock.svg",
  },
  {
    label: "嘻哈",
    subtitle: "HIP-HOP/说唱",
    code: "HIPHOP",
    color: "rgba(200,100,50,1)",
    bg: "",
    icon: "/static/icons/genre-hiphop.svg",
  },
  {
    label: "电音",
    subtitle: "EDM",
    code: "ELECTRONIC",
    color: "rgba(160,130,255,1)",
    bg: "",
    icon: "/static/icons/genre-edm.svg",
  },
  {
    label: "国风",
    subtitle: "中国传统音乐",
    code: "GUOFENG",
    color: "rgba(190,60,60,1)",
    bg: "",
    icon: "/static/icons/genre-jpop2.svg",
  },
  {
    label: "古典",
    subtitle: "CLASSICAL/交响/音乐剧",
    code: "CLASSICAL",
    color: "rgba(100,80,160,1)",
    bg: "",
    icon: "/static/icons/genre-edm2.svg",
  },
]

/** 把单个 rgba 颜色扩展为 135deg 渐变,用于卡片背景。
 *  alpha 调到 0.7 / 0.95，避免订阅页/EventCard fallback 出现"几乎看不见色块"的问题 */
export function genreGradient(color: string): string {
  const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
  if (match) {
    const [, r, g, b] = match
    return `linear-gradient(135deg, rgba(${r},${g},${b},0.7), rgba(${r},${g},${b},0.95))`
  }
  return `linear-gradient(135deg, rgba(110,120,135,0.7), rgba(140,150,165,0.95))`
}

/** 按后端 code 查找流派(可能匹配到多项,返回第一项) */
export function getGenreByCode(code: string): GenreItem | undefined {
  return GENRES.find((g) => g.code === code)
}

/**
 * 流派 code → 中文文案。
 *
 * 首页标签区显示的是「日音/韩音」，艺人详情页此前直接吐裸码 `JPOP`，
 * 同一份数据两种语言，这里统一到 GENRES 的 label。
 * 未知 code（后端可能有细分流派）回退原值，至少不显示成空白。
 */
export function genreLabel(code?: string | null): string {
  if (!code) return ""
  return getGenreByCode(code)?.label ?? code
}

/**
 * 从带置信度的流派列表里取置信度最高的一项。
 *
 * 后端 genres[] 一般已按 confidence 降序，但不同数据来源（导入 / 人工标注）
 * 不保证有序，所以这里自己取一次最大值。缺 confidence 视为 0，
 * 全都没有时退回第一项，保证有值就能显示。
 */
export function pickTopGenre(
  list?: { genre_code?: string; confidence?: number }[] | null,
): string {
  if (!list || list.length === 0) return ""
  let best = list[0]
  for (const g of list) {
    if ((g.confidence ?? 0) > (best.confidence ?? 0)) best = g
  }
  return best.genre_code || ""
}
