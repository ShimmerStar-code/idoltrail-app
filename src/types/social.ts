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
  /**
   * 上传过的情报总数（含待审核、含被驳回）。
   *
   * 可选：后端未升级到含该字段的版本时不会返回，页面按 0 处理。
   */
  submitted_count?: number
  /** 还在审核中的情报数（后端未升级时可能缺失） */
  pending_count?: number
  /** 被驳回的情报数（后端未升级时可能缺失） */
  rejected_count?: number
  /**
   * 采纳率（0-100 的整数）；没上传过为 0。
   *
   * 可选：后端未升级到含该字段的版本时不会返回，页面显示「—」。
   */
  adoption_rate?: number
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
    /**
     * 用户主键（字符串）。
     *
     * 用户 id 超过 Number.MAX_SAFE_INTEGER，当数字用会丢精度，
     * 拿丢精度的 id 查用户就是「用户不存在或已不可见」。
     */
    id: string
    nickname: string
    avatar_url: string
    gender: 0 | 1 | 2
    /** 个性签名 */
    bio: string
    /** 加入日期 YYYY-MM-DD */
    register_at: string
    /** 兴趣标签（event_genre code），用户自己勾选的音乐风格 */
    interests?: string[]
  }
  stats: PublicUserStats
  /** 该用户主动公开的社交主页链接 */
  social_links: SocialLink[]
  /** 该用户帮 App 收录的演出 */
  contributions: PublicContribution[]
}
