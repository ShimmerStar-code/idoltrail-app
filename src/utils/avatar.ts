/**
 * 头像工具函数 - 提供统一的默认头像 fallback 逻辑
 */

// OSS 默认头像地址
const DEFAULT_AVATAR_BOY = 'https://idoltrail-static.oss-cn-beijing.aliyuncs.com/avatar/default/boy.png'
const DEFAULT_AVATAR_GIRL = 'https://idoltrail-static.oss-cn-beijing.aliyuncs.com/avatar/default/girl.png'
const DEFAULT_AVATAR_GROUP = 'https://idoltrail-static.oss-cn-beijing.aliyuncs.com/avatar/default/group.png'
const DEFAULT_AVATAR_VIRTUAL = 'https://idoltrail-static.oss-cn-beijing.aliyuncs.com/avatar/default/virtual_persona.png'

// 后端有时会把错误的默认头像 URL 存入 avatar_url（如把 Group 存成 boy.png）
// 遇到这些 URL 时不直接使用，改由 type/gender 重新计算，保证结果正确
const DEFAULT_AVATAR_SET = new Set([
  DEFAULT_AVATAR_BOY,
  DEFAULT_AVATAR_GIRL,
  DEFAULT_AVATAR_GROUP,
  DEFAULT_AVATAR_VIRTUAL,
])

/**
 * 根据 type/gender 计算对应默认头像，供 @error 降级使用
 */
export function getDefaultAvatarSrc(type?: string, gender?: string): string {
  const t = type?.toLowerCase()
  const g = gender?.toLowerCase()
  if (t === 'group') return DEFAULT_AVATAR_GROUP
  if (g === 'character') return DEFAULT_AVATAR_VIRTUAL
  if (g === 'female') return DEFAULT_AVATAR_GIRL
  return DEFAULT_AVATAR_BOY
}

/**
 * 获取艺术家头像 URL（带默认值 fallback）
 * @param artist - 艺术家对象，包含 avatar_url, type, gender 字段
 * @returns 头像 URL
 */
export function getArtistAvatarSrc(artist?: {
  avatar_url?: string
  type?: string
  gender?: string
}): string {
  // 有真实自定义头像时才使用；若 avatar_url 恰好是某个默认占位图（后端 bug 写入了错误默认值），
  // 则忽略它、按 type/gender 重新计算，确保 Group 类型不会显示 boy 头像
  if (artist?.avatar_url && !DEFAULT_AVATAR_SET.has(artist.avatar_url)) {
    return artist.avatar_url
  }

  return getDefaultAvatarSrc(artist?.type, artist?.gender)
}

/**
 * 获取用户头像 URL（带默认值 fallback）
 * @param user - 用户对象，包含 avatar_url 和 gender 字段
 * @returns 头像 URL
 */
export function getUserAvatarSrc(user?: {
  avatar_url?: string
  gender?: number
}): string {
  if (user?.avatar_url) return user.avatar_url

  // 用户性别：0=保密, 1=男, 2=女
  const gender = user?.gender
  if (gender === 0) return DEFAULT_AVATAR_VIRTUAL
  if (gender === 2) return DEFAULT_AVATAR_GIRL

  return DEFAULT_AVATAR_BOY
}
