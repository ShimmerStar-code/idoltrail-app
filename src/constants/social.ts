// 社交主页链接的平台元数据。
//
// 平台的**品牌色**用在这里：chips 一眼就能认出是小红书还是 B站，
// 比一串纯文字链接的点击率高得多 —— 这正是这个功能的目的（引流）。
//
// 平台白名单与域名白名单在服务端（internal/model/social_link.go），
// 两边必须保持一致：这里只负责「展示与提示」，**校验以服务端为准**。
export type SocialPlatform =
  | 'xiaohongshu'
  | 'weibo'
  | 'bilibili'
  | 'wechat_official'
  | 'douyin'
  | 'other'

export interface SocialPlatformMeta {
  /** 平台展示名 */
  label: string
  /** 品牌色（chip 文字色 / 描边色） */
  color: string
  /** 输入框 placeholder：给出该平台的典型链接格式 */
  placeholder: string
  /** 输入框下方的说明，告诉用户该填什么 */
  hint: string
}

/** 平台定义（顺序即 App 端选择顺序） */
type SocialPlatformDef = SocialPlatformMeta & { key: SocialPlatform }

const PLATFORM_DEFS: SocialPlatformDef[] = [
  {
    key: 'xiaohongshu',
    label: '小红书',
    color: '#FF2442',
    placeholder: 'https://www.xiaohongshu.com/user/profile/…',
    hint: '小红书个人主页链接',
  },
  {
    key: 'weibo',
    label: '微博',
    color: '#E6162D',
    placeholder: 'https://weibo.com/u/…',
    hint: '微博个人主页链接',
  },
  {
    key: 'bilibili',
    label: 'B站',
    color: '#00A1D6',
    placeholder: 'https://space.bilibili.com/…',
    hint: 'B站个人空间链接',
  },
  {
    key: 'wechat_official',
    label: '公众号',
    color: '#07C160',
    placeholder: 'https://mp.weixin.qq.com/s/…',
    hint: '公众号文章或名片页链接',
  },
  {
    key: 'douyin',
    label: '抖音',
    color: '#FE2C55',
    placeholder: 'https://www.douyin.com/user/…',
    hint: '抖音个人主页链接',
  },
  {
    key: 'other',
    label: '其他',
    color: '#8A8F99',
    placeholder: 'https://…',
    hint: '任意个人主页链接（仅支持 http / https）',
  },
]

export const SOCIAL_PLATFORMS: SocialPlatformMeta[] = PLATFORM_DEFS.map((d) => ({
  label: d.label,
  color: d.color,
  placeholder: d.placeholder,
  hint: d.hint,
}))

/** 平台标识的固定顺序（与 SOCIAL_PLATFORMS 一一对应） */
export const SOCIAL_PLATFORM_KEYS: SocialPlatform[] = PLATFORM_DEFS.map((d) => d.key)

/** platform 标识 → 元数据 */
export const SOCIAL_PLATFORM_META: Record<SocialPlatform, SocialPlatformMeta> =
  PLATFORM_DEFS.reduce(
    (acc, d) => {
      acc[d.key] = {
        label: d.label,
        color: d.color,
        placeholder: d.placeholder,
        hint: d.hint,
      }
      return acc
    },
    {} as Record<SocialPlatform, SocialPlatformMeta>,
  )

/** 取平台元数据；认不出的一律当「其他」 */
export function socialPlatformMeta(platform?: string): SocialPlatformMeta {
  if (platform && platform in SOCIAL_PLATFORM_META) {
    return SOCIAL_PLATFORM_META[platform as SocialPlatform]
  }
  return SOCIAL_PLATFORM_META.other
}

/** 最多能挂几个主页链接（与后端 model.SocialLinkMaxCount 一致） */
export const SOCIAL_LINK_MAX_COUNT = 5
