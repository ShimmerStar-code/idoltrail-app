// 用户兴趣标签（喜欢日音、Kpop 之类）
//
// code 与后端 event_genre 字典一致（event_genre_ref 表 / migrations/0055），
// 后端白名单见 internal/model/interests.go。
// 复用流派字典而不是另造一套：用户说的「喜欢日音、Kpop」本质就是流派，
// 复用后「用户偏好」与「活动风格」能对上号。
//
// label 用 App 现有的口语化叫法（GENRES 那套），不用后端字典里的
// 「日系流行 / 韩流」—— 用户在首页标签区看到的就是「日音 / 韩音」。

export interface InterestTag {
  /** 后端 event_genre code */
  code: string
  /** 中文标签 */
  label: string
  /** 标签色 */
  color: string
}

/** 全部可选标签（顺序即展示顺序） */
export const INTEREST_TAGS: InterestTag[] = [
  { code: "CPOP", label: "华语", color: "#FEA500" },
  { code: "POP", label: "欧美", color: "#64C896" },
  { code: "JPOP", label: "日音", color: "#FFBE78" },
  { code: "KPOP", label: "韩音", color: "#FF96AA" },
  { code: "ACG", label: "二次元", color: "#8CC8FF" },
  { code: "ROCK", label: "摇滚", color: "#505050" },
  { code: "HIPHOP", label: "嘻哈", color: "#C86432" },
  { code: "ELECTRONIC", label: "电音", color: "#A082FF" },
  { code: "GUOFENG", label: "国风", color: "#BE3C3C" },
  { code: "CLASSICAL", label: "古典", color: "#6450A0" },
  { code: "METAL", label: "金属", color: "#4A4A55" },
  { code: "FOLK", label: "民谣", color: "#7BA05B" },
  { code: "LATIN", label: "拉丁", color: "#E2725B" },
  { code: "WORLD", label: "世界音乐", color: "#4F9DA6" },
  { code: "RNB_SOUL", label: "R&B/灵魂", color: "#A05B8C" },
  { code: "OTHER", label: "其他", color: "#8A8F99" },
]

/** 最多可选几个（与后端 model.UserInterestsMaxCount 一致） */
export const INTERESTS_MAX_COUNT = 10

/** code → 标签元数据 */
const TAG_MAP: Record<string, InterestTag> = INTEREST_TAGS.reduce(
  (acc, t) => {
    acc[t.code] = t
    return acc
  },
  {} as Record<string, InterestTag>,
)

/**
 * 取标签元数据。
 *
 * 未知 code（比如后端先加了新标签而客户端还没更新）回退成中性色，
 * 不能因为一个不认识的 code 就把整个标签区渲染崩掉。
 */
export function interestTag(code: string): InterestTag {
  return (
    TAG_MAP[code] ?? {
      code,
      label: code,
      color: "#8A8F99",
    }
  )
}

/** 一组 code → 展示用标签（过滤未知 code） */
export function interestTags(codes?: string[] | null): InterestTag[] {
  if (!codes || codes.length === 0) return []
  return codes.map((c) => interestTag(c))
}
