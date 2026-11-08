// 贡献榜（GET /public/rankings）
//
// 榜单口径：按「被运营核实收录的情报条数」排序，每收录 1 条计 10 星币。
// 星币是 App 里唯一的贡献值口径，只用于排名，不可兑换、不提现，
// 文案里不要写成「赚星币」。
// 昵称 / 头像会展示给其他用户 —— 对应的披露说明见隐私政策「四之二、关于贡献排行榜」。

/** 榜单周期：总榜（累计）/ 本月榜 / 本周榜 */
export type RankingPeriod = 'all' | 'month' | 'week'

/** 榜单行 */
export interface RankingItem {
  /** 名次，从 1 开始，连续无空洞 */
  rank: number
  /**
   * 内部用户主键。
   *
   * 点这一行要打开「贡献者卡片」，那边需要一个指向具体用户的 key。
   * 它不是敏感信息（App 从不展示，也拿不到手机号等身份标识）。
   *
   * 字符串类型：用户 id 超过 Number.MAX_SAFE_INTEGER，当数字用会丢精度，
   * 查用户会得到「用户不存在或已不可见」。
   */
  user_id: string
  nickname: string
  avatar_url: string
  gender: 0 | 1 | 2
  /** 本期被收录的情报条数（排序依据） */
  adopted_count: number
  /** 本期记入的星币（每条 10 星币，仅用于排名） */
  star_coins: number
  /** 这一行是不是当前登录用户 */
  is_me: boolean
}

/** 我的榜况 */
export interface RankingMe {
  /** 本期名次；0 = 未上榜（本期还没有情报被收录） */
  rank: number
  /** 本期收录条数 */
  adopted_count: number
  /** 本期记入的星币（仅用于排名） */
  star_coins: number
  /** 上一名（我上面那一位）的收录条数 */
  prev_adopted_count: number
  /** 再收录几条就能超过上一名；已是第一名为 0 */
  gap_to_next: number
  /** 本期上榜人数 */
  total_participants: number
}

export interface RankingResult {
  period: RankingPeriod
  list: RankingItem[]
  /** 本期上榜总人数 */
  total: number
  page: number
  page_size: number
  /** 未登录时后端不返回这一段 */
  me?: RankingMe
}
