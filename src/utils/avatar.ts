/**
 * 头像统一取值入口。
 *
 * 全 app 的头像渲染都必须走这里，不要在模板里写 `item.avatar_url || '...'`：
 *   - 艺人 → getArtistAvatarSrc(artist)
 *   - 用户 → getUserAvatarSrc(user)
 *   - 已知类型/gender 但没有 URL → getDefaultAvatarSrc(type, gender)
 *
 * 默认头像一律走本地文件（utils/defaultAvatar.ts），不给网络请求，
 * 原因与背景见该文件顶部注释。
 */

import {
  defaultAvatarKeyFromUrl,
  defaultAvatarSrc,
  isDefaultAvatarUrl,
  type DefaultAvatarKey,
} from './defaultAvatar'
import { avatarThumb } from './image'

export { isDefaultAvatarUrl }

/**
 * 按 type/gender 判定默认头像分类；type/gender 缺失或认不出时返回 null，
 * 交由调用方用其他线索（默认图 URL）继续判定。
 *
 * 与后端 model.ResolveAvatar 严格同口径（server: internal/model/artist_defaults.go）：
 *   group → 组合图，character → 虚拟形象，female → 女性，male → 男性。
 */
function kindByTypeGender(type?: string, gender?: string): DefaultAvatarKey | null {
  if (type?.toLowerCase() === 'group') return 'group'
  switch (gender?.toLowerCase()) {
    case 'character':
      return 'virtual_persona'
    case 'female':
      return 'girl'
    case 'male':
      return 'boy'
    default:
      return null
  }
}

/** 默认头像分类；没有任何线索时按男兜底 */
export function avatarKind(type?: string, gender?: string): DefaultAvatarKey {
  return kindByTypeGender(type, gender) ?? 'boy'
}

/** 按 type/gender 取默认头像的本地地址 */
export function getDefaultAvatarSrc(type?: string, gender?: string): string {
  return defaultAvatarSrc(avatarKind(type, gender))
}

/**
 * 艺人头像。
 *
 * 库里没头像、或后端 ResolveAvatar 填的是默认占位图 → 一律给本地默认图。
 * 关键在于「不把默认图当网络图用」：走 URL 会让同一张默认图被每个艺人各拉一次，
 * 偶像首页一次 9 × N 个艺人就是几十次重复请求。
 *
 * 分类优先级：type/gender → 默认图 URL 反推 → 男。
 * type/gender 是数据真相，能纠正库里存错的默认值（如组合存成 boy.png）；
 * URL 反推兜住「只下发 avatar_url、没有 type/gender」的精简 VO。
 */
export function getArtistAvatarSrc(artist?: {
  avatar_url?: string
  type?: string
  gender?: string
}): string {
  const url = artist?.avatar_url
  if (!url || isDefaultAvatarUrl(url)) {
    const kind =
      kindByTypeGender(artist?.type, artist?.gender) ??
      defaultAvatarKeyFromUrl(url) ??
      'boy'
    return defaultAvatarSrc(kind)
  }
  // 缩略图：原图解码后动辄 4MB，列表里一屏就有几十张 → OOM 的头号来源
  return avatarThumb(url)
}

/**
 * 用户头像。
 * 用户性别：0=保密（虚拟形象）、1=男、2=女；未设置或异常都按男。
 */
export function getUserAvatarSrc(user?: {
  avatar_url?: string
  gender?: number
}): string {
  const url = user?.avatar_url
  if (url && !isDefaultAvatarUrl(url)) return avatarThumb(url)
  const g = user?.gender
  if (g === 0) return defaultAvatarSrc('virtual_persona')
  if (g === 2) return defaultAvatarSrc('girl')
  return defaultAvatarSrc('boy')
}
