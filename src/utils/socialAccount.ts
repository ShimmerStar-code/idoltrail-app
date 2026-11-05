// 从社交主页链接里解析「账号标识」。
//
// 为什么需要：主页上光写一个「B站」标签，用户根本不知道点进去是谁的号。
// 解析出账号 ID（@123456 / @昵称）后展示成两行：
//
//   ● B站账号
//     @123456
//
// 一眼就知道「这是 TA 的 B 站，账号是 123456」。
//
// 只做展示用，解析不出来就退化成域名，不报错、不阻塞。

import type { SocialPlatform } from '@/constants/social'

/** 拆出 host 与 path 片段 */
function splitUrl(url: string): { host: string; segs: string[] } {
  const m = /^(?:https?:)?\/\/([^/?#]+)([^?#]*)/i.exec((url || '').trim())
  if (!m) {
    return { host: '', segs: [] }
  }
  const host = m[1].toLowerCase().replace(/^www\./, '')
  const segs = (m[2] || '').split('/').filter(Boolean)
  return { host, segs }
}

/** 截断过长的 ID（抖音 sec_uid 很长，展示前 8 位足够辨认） */
function shorten(s: string, len = 8): string {
  return s.length > len ? `${s.slice(0, len)}…` : s
}

/**
 * 解析账号标识。
 *
 * 返回空串表示解析不出来（调用方决定怎么兜底）。
 */
export function parseSocialAccount(platform: SocialPlatform, url: string): string {
  const { host, segs } = splitUrl(url)
  if (!host) return ''

  switch (platform) {
    case 'bilibili': {
      // space.bilibili.com/123456
      if (host.includes('bilibili') && segs[0]) return `@${segs[0]}`
      return host
    }
    case 'weibo': {
      // weibo.com/u/123456、weibo.com/n/昵称
      if (host.includes('weibo')) {
        if ((segs[0] === 'u' || segs[0] === 'n') && segs[1]) return `@${segs[1]}`
        if (segs[0]) return `@${segs[0]}`
        return host
      }
      return host
    }
    case 'xiaohongshu': {
      // www.xiaohongshu.com/user/profile/xxx
      if (host.includes('xiaohongshu')) {
        const i = segs.indexOf('profile')
        if (i >= 0 && segs[i + 1]) return `@${segs[i + 1]}`
        if (segs[0]) return `@${segs[0]}`
        return host
      }
      return host
    }
    case 'douyin': {
      // www.douyin.com/user/MS4wLjABAAAA...
      if (host.includes('douyin')) {
        if (segs[0] === 'user' && segs[1]) return `@${shorten(segs[1])}`
        return host
      }
      return host
    }
    case 'wechat_official': {
      // mp.weixin.qq.com/s/xxx —— 文章链接里没有账号名，只能给域名
      return host
    }
    default:
      return host
  }
}

/**
 * 链接的展示副标题。
 *
 * 真实账号标识优先（@123456）—— 只写平台名谁也看不懂是谁的号；
 * 用户自己起的名字（「日常更新」）作为补充跟在后面；
 * 都拿不到才退化成域名，任何情况下都不会出现空白。
 */
export function socialAccountText(
  platform: SocialPlatform,
  url: string,
  title?: string,
): string {
  const custom = (title || '').trim()
  const account = parseSocialAccount(platform, url)
  if (account && custom) return `${account} · ${custom}`
  return account || custom || splitUrl(url).host
}
