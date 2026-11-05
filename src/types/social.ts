// 用户主页 / 社交主页链接（引流工具）
//
//   GET  /user/social-links        我的主页链接
//   PUT  /user/social-links        全量保存我的主页链接
//   GET  /public/users/:id/profile 贡献者卡片（公开可读）
import type { SocialPlatform } from '@/constants/social'

/** 一条社交主页链接 */
export interface SocialLink {
  platform: SocialPlatform
  /** 展示名（用户自定义，为空时用平台默认名） */
  title: string
  url: string
}

/** 贡献者成绩 */
export interface PublicUserStats {
  /** 被收录的情报总数（总榜口径） */
  adopted_count: number
  /** 累计星币 */
  star_coins: number
  /** 总榜名次；0 = 未上榜 */
  rank: number
  /** 总榜上榜人数 */
  total_participants: number
}

/** 一条贡献 = 一个被收录的演出 */
export interface PublicContribution {
  id: number
  event_id: number | null
  title: string
  poster_url: string
  event_status: string
  start_date: string | null
  /** 被收录的日期 YYYY-MM-DD */
  reviewed_at: string
}

/** 贡献者卡片 / 用户主页 */
export interface PublicUserProfile {
  user: {
    id: number
    nickname: string
    avatar_url: string
    gender: 0 | 1 | 2
    /** 个性签名 */
    bio: string
    /** 加入日期 YYYY-MM-DD */
    register_at: string
  }
  stats: PublicUserStats
  /** 该用户主动公开的社交主页链接 */
  social_links: SocialLink[]
  /** 该用户帮 App 收录的演出 */
  contributions: PublicContribution[]
}
