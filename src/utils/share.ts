// App 端原生分享。
//
// uni-app 的 App 平台没有微信那种「右上角胶囊 → 转发」的系统入口，
// 必须由业务代码主动调起分享面板（plus.share），并配合 manifest.json 中
// `app-plus.distribute.modules.share` / `app-plus.distribute.platforms` 的配置生效。
//
// 用法：
//   import { shareApp } from '@/utils/share'
//   shareApp({ title: 'xxx', url: 'https://...' })
//
// 注意：App 的分享能力依赖第三方 App（微信/QQ/微博等）是否安装，
// 未安装时会被 `plus.runtime.isApplicationInstalled` 过滤掉。

export type ShareProvider = 'weixin' | 'qq' | 'weibo' | 'system'

export interface ShareOptions {
  title: string
  /** 分享落地页链接，需要是外部可访问的 https 地址 */
  url?: string
  summary?: string
  imageUrl?: string
  /** 分享到会话 / 朋友圈 */
  scene?: 'WXSceneSession' | 'WXSceneTimeline'
  provider?: ShareProvider
}

const SHARE_TITLE = 'idoltrail - 演唱会 / 音乐活动信息平台'

/**
 * 拉起系统分享面板。
 * App 端 `uni.share` 未内置，实现直接落到 plus.share 的"系统分享"能力，
 * 由系统弹出可用的分享目标。
 */
export function shareApp(opts: Partial<ShareOptions> = {}) {
  const title = opts.title || SHARE_TITLE
  const url = opts.url || ''

  // #ifdef APP-PLUS
  // 注意 plus.share 的签名是 (msg, successCB, errorCB)；
  // 系统分享只认 type + href/content/pictures 这几个字段。
  const isImage = !!url && /\.(png|jpe?g)$/i.test(url)
  plus.share.sendWithSystem(
    {
      type: isImage ? 'image' : 'url',
      title,
      // url → 分享落地页链接；image → 图片地址
      href: url,
      content: opts.summary || title,
      pictures: opts.imageUrl ? [opts.imageUrl] : undefined,
    },
    () => console.log('[share] success', title),
    (e: any) => console.warn('[share] cancel or fail', e),
  )
  return
  // #endif

  // #ifndef APP-PLUS
  // H5 预览态：退化为浏览器原生分享（需 HTTPS + 支持 Web Share API）
  const nav = globalThis.navigator as any
  if (nav?.share) {
    nav.share({ title, url }).catch(() => {})
    return
  }
  uni.showToast({ title: '当前环境不支持分享', icon: 'none' })
  // #endif
}

/**
 * 分享指定页面。内部把页面路径转成可外部访问的落地链接。
 * @param path 页面路径，如 '/pages/event/detail'
 * @param query 查询参数，如 { id: 123 }
 */
export function sharePage(path: string, query: Record<string, string | number> = {}, title?: string) {
  const qs = Object.entries(query)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&')
  const deepLink = `${uni.getAppBaseInfo?.()?.hostName || 'https://idoltrail.app'}${path}${qs ? '?' + qs : ''}`
  shareApp({ title: title || SHARE_TITLE, url: deepLink })
}

export { SHARE_TITLE }
