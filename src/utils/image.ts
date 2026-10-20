/**
 * 网络图片尺寸协商。
 *
 * ── 为什么必须有 ──────────────────────────────────────────────
 * `<image>` 拿到 URL 后会把位图**解码进内存**，占用 ≈ 宽 × 高 × 4 字节。
 * 一张 1000×1000 的原图解码后约 4MB，而艺人头像在列表里只显示 30~60px。
 * 活动列表 100 张卡 × 3 张艺人头像 = 300 张原图 → 1.2GB → 低端机直接 OOM。
 * 这是本 App 最现实的宕机路径，比 DOM 节点数严重得多（节点只是几百 KB 级）。
 *
 * ── 怎么解 ────────────────────────────────────────────────────
 * 静态资源托管在阿里云 OSS（idoltrail-static.oss-cn-beijing.aliyuncs.com），
 * OSS 原生支持 `x-oss-process` 图片处理参数，服务端裁好再下发：
 *   image/resize,m_fill,w_200,h_200   缩放到 200×200 并居中裁剪
 *   image/resize,w_600                 按宽度 600 等比缩放（海报）
 * 200×200 的缩略图解码后约 160KB，比原图小 25 倍。
 *
 * ── 降级安全性 ────────────────────────────────────────────────
 * 万一 bucket 没开图片处理，OSS 会**忽略**这个参数直接返回原图，
 * 不会报错、不会 404 —— 行为退化成改动前的样子，只是白白多带一个 query。
 * 因此这里可以放心对所有 OSS 图片统一追加参数。
 */

/** 阿里云 OSS 域名（各区域格式：xxx.oss-cn-beijing.aliyuncs.com） */
const OSS_HOST_RE = /\.oss-[a-z0-9-]+\.aliyuncs\.com/i

/** 艺人头像等小图：200px 足够覆盖 3x 屏（60rpx ≈ 34dp ≈ 102 物理像素） */
export const AVATAR_SIZE = 200
/** 活动海报：列表缩略 600px 宽，详情页整屏也够用 */
export const POSTER_SIZE = 600

/** 是否是阿里云 OSS 地址（只有 OSS 支持 x-oss-process） */
export function isOssUrl(url: string): boolean {
  return OSS_HOST_RE.test(url)
}

/**
 * 给 OSS 图片 URL 追加缩放参数。
 *
 * 非 OSS 地址、已经是缩略图的地址、带其他 query 的地址都能安全处理：
 *   - 非 OSS → 原样返回
 *   - 已含 x-oss-process → 原样返回（不重复追加）
 *   - 已有 query → 用 & 衔接
 */
export function ossResize(url: string, width: number, height?: number): string {
  if (!url) return url
  if (!isOssUrl(url)) return url
  if (url.includes('x-oss-process')) return url

  const process = height
    ? `image/resize,m_fill,w_${width},h_${height}`
    : `image/resize,w_${width}`
  const sep = url.includes('?') ? '&' : '?'
  return `${url}${sep}x-oss-process=${process}`
}

/**
 * 头像缩略图：正方形裁剪。
 *
 * 用 m_fill（居中裁剪）而不是只按宽度缩放：
 * 列表里的头像是圆形/方形裁切显示的，先在服务端裁好能少传很多像素。
 */
export function avatarThumb(url: string): string {
  return ossResize(url, AVATAR_SIZE, AVATAR_SIZE)
}

/** 海报缩略图：保持比例，避免裁掉内容 */
export function posterThumb(url: string): string {
  return ossResize(url, POSTER_SIZE)
}
