// 用户主页 / 社交主页链接接口
//
//   GET  /user/social-links        我的主页链接（需登录）
//   PUT  /user/social-links        全量保存我的主页链接（需登录）
//   GET  /public/users/:id/profile 贡献者卡片（公开可读）
import { request } from '@/utils/request'
import type { PublicUserProfile, SocialLink } from '@/types/social'

export const socialApi = {
  /** 我已保存的主页链接 */
  myLinks(): Promise<{ links: SocialLink[] }> {
    return request<{ links: SocialLink[] }>('/user/social-links')
  },

  /**
   * 全量保存我的主页链接。
   *
   * 传空数组即清空（用户不想再展示了）。
   * 平台与链接的合法性由服务端校验，这里只做提示。
   */
  saveLinks(links: SocialLink[]): Promise<{ links: SocialLink[] }> {
    return request<{ links: SocialLink[] }>('/user/social-links', {
      method: 'PUT',
      data: { links },
    })
  },
}

export const publicUserApi = {
  /**
   * 贡献者卡片：成绩 + 个性化资料 + 社交主页链接 + 收录过的演出
   *
   * userId 传字符串：用户 id 超过 Number.MAX_SAFE_INTEGER，
   * 转成 number 会丢精度，查出来就是「用户不存在或已不可见」。
   */
  profile(userId: string): Promise<PublicUserProfile> {
    return request<PublicUserProfile>(`/public/users/${userId}/profile`)
  },
}
