// 活动类型 / 状态 / 短缩写 的共享常量
// 后端 event_type / event_status 枚举见 backend/CLAUDE.md

import type { Event } from "@/types/event"

/**
 * 活动类型下拉项 —— code 必须与后端 `event_type_ref.type_code` 完全一致
 * （migration 0051 起为全大写下划线）。
 *
 * ⚠️ 历史包袱：0051 之前后端存的是「type_name 空格换下划线」（Concert / Music_Festival /
 * Fan_Meeting / Anime_Expo / Concert_Hall），与参照表的 type_code 并存。
 * DB 已统一为 type_code，但客户端与服务端缓存里仍可能残留旧值，
 * 故 EVENT_TYPE_LEGACY_LABEL 保留旧值映射兜底，避免旧缓存渲染出空白标签。
 * 新增代码请勿再写入旧值。
 */
export const EVENT_TYPE_OPTIONS: { code: Event["type"]; label: string }[] = [
  { code: "CONCERT",       label: "演唱会" },
  { code: "FESTIVAL",      label: "音乐节" },
  { code: "FAN_MEETING",   label: "粉丝见面会" },
  { code: "ANIME_EXPO",    label: "漫展" },
  { code: "CONCERT_HALL",  label: "音乐会" },
]

/** 旧 code → 中文，仅用于兜底渲染 0051 之前的残留数据 */
const EVENT_TYPE_LEGACY_LABEL: Record<string, string> = {
  Concert:        "演唱会",
  Music_Festival: "音乐节",
  Fan_Meeting:    "粉丝见面会",
  Anime_Expo:     "漫展",
  Concert_Hall:   "音乐会",
}

/**
 * 活动类型 code → URL slug（首页分类入口 / 活动列表路由参数用）
 *
 * URL 里一律用小写下划线 slug，内部仍用后端 type_code。
 * 此前首页硬编码了一份 slug、event/list.vue 又抄了一份反向表，
 * 两份都要手工同步；现在两处都从这里派生，只剩这一处要维护。
 */
export const EVENT_TYPE_SLUG: Record<string, string> = {
  CONCERT:       "concert",
  FESTIVAL:      "festival",
  FAN_MEETING:   "fan_meeting",
  ANIME_EXPO:    "anime_expo",
  CONCERT_HALL:  "concert_hall",
}

/**
 * slug → code 的反向表，供活动列表页解析路由参数。
 * 额外保留 music_festival → FESTIVAL：历史链接用这个词指代音乐节。
 */
export const EVENT_TYPE_SLUG_TO_CODE: Record<string, string> = {
  ...Object.fromEntries(
    Object.entries(EVENT_TYPE_SLUG).map(([code, slug]) => [slug, code]),
  ),
  music_festival: "FESTIVAL",
}

/** 活动类型 → 中文标签（卡片 tag 和详情页统一用此） */
export const EVENT_TYPE_LABEL: Record<string, string> = {
  ...EVENT_TYPE_LEGACY_LABEL,
  ...Object.fromEntries(EVENT_TYPE_OPTIONS.map((o) => [o.code, o.label])),
}

/**
 * 取活动类型的中文标签。查不到时返回原值而不是空串，
 * 避免运营新增了 type_code 但客户端没发版时整块显示空白。
 */
export function eventTypeLabel(type?: string | null): string {
  if (!type) return ""
  return EVENT_TYPE_LABEL[type] ?? EVENT_TYPE_LABEL[type.toUpperCase()] ?? type
}

/** @deprecated 英文缩写已废弃，请改用 EVENT_TYPE_LABEL */
export const EVENT_TYPE_SHORT: Record<string, string> = {
  CONCERT: "Cnt",
  FESTIVAL: "Fmt",
  FAN_MEETING: "FM",
  ANIME_EXPO: "Anm",
  CONCERT_HALL: "CH",
}

/** 活动状态下拉项 */
export const EVENT_STATUS_OPTIONS: { code: string; label: string }[] = [
  { code: "PUBLISHED", label: "售票中" },
  { code: "POSTPONED", label: "延期" },
  { code: "ENDED", label: "已结束" },
  { code: "CANCELLED", label: "已取消" },
]

/**
 * 活动状态 → 徽章配色（卡片角标与详情页状态胶囊共用同一份）
 *
 * bg/fg 成对给出：
 * - 进行中/异常态（售票中、延期、已取消）用实心底 + 白字，保持醒目；
 * - 终态（已结束）用「淡灰底 + 深灰字」弱化表达。它是既成事实、不需要再提醒，
 *   实心灰块压在艺人主题色卡片上很脏、也抢主体内容的注意力。
 */
export const STATUS_BADGE_STYLE: Record<string, { bg: string; fg: string }> = {
  DRAFT: { bg: "rgba(150,150,150,1)", fg: "#fff" },
  PUBLISHED: { bg: "rgba(254,165,0,1)", fg: "#fff" },
  POSTPONED: { bg: "rgba(245,200,80,1)", fg: "#fff" },
  ENDED: { bg: "rgba(118,118,128,0.14)", fg: "rgba(60,60,67,0.9)" },
  CANCELLED: { bg: "rgba(220,80,80,1)", fg: "#fff" },
}

/** 活动状态 → 徽章底色（只取 bg，兼容只关心背景色的调用方） */
export const STATUS_BADGE_COLOR: Record<string, string> = Object.keys(
  STATUS_BADGE_STYLE,
).reduce(
  (acc, k) => {
    acc[k] = STATUS_BADGE_STYLE[k].bg
    return acc
  },
  {} as Record<string, string>,
)

// ── 过期 / 已结束派生（每次渲染按“今天”判定，前端唯一口径；后端不改库） ──

export type EventLike = { status?: string | null; end_date?: string | null }

export function todayYMD(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, "0")
  const d = String(now.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

/**
 * 派生后的展示状态：
 * - PUBLISHED(或空 status) 且 end_date 严格早于今天 → 'ENDED'（视为已结束）；
 * - end_date 为空 → 永不过期；POSTPONED/CANCELLED/DRAFT/已存 ENDED 一律原样返回。
 * end_date 为 YYYY-MM-DD，字符串比较即日期比较。
 */
export function effectiveEventStatus(e: EventLike, now: Date = new Date()): string {
  const s = e.status || ""
  if (!s || s === "PUBLISHED") {
    const end = e.end_date ? String(e.end_date).slice(0, 10) : ""
    if (end && end < todayYMD(now)) return "ENDED"
  }
  return s
}

export function isEffectivelyEnded(e: EventLike, now?: Date): boolean {
  return effectiveEventStatus(e, now) === "ENDED"
}

// ── 观演须知兜底 ──

/**
 * 活动未配置 notice 时使用的**通用**观演提示。
 *
 * ⚠️ 这不是主办方的公告，只是全行业通用的入场规则。展示时必须标注来源
 * （见 pages/event/detail.vue 的 noticeIsGeneric），否则运营漏配时用户会误以为是
 * 主办方发布的正式须知。
 *
 * 格式约定与后台配置一致：每块以「• 标题」起头，正文另起一行。
 */
export const GENERIC_AUDIENCE_NOTICE =
  "• 演出时长\n以现场为准\n• 入场时间\n请于演出前约120分钟入场\n• 禁止携带物品\n大多数演出、展览及比赛场所禁止携带食品、饮料、专业摄录设备、打火机等物品，请注意现场工作人员和广播的提示，予以配合。"
