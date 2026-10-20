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
  Fan_Meeting:   "粉丝见面会",
  Anime_Expo:    "漫展",
  Concert_Hall:  "音乐会",
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

/** 活动状态 → 徽章配色(用于卡片状态角标) */
export const STATUS_BADGE_COLOR: Record<string, string> = {
  DRAFT: "rgba(150,150,150,1)",
  PUBLISHED: "rgba(254,165,0,1)",
  POSTPONED: "rgba(245,200,80,1)",
  ENDED: "rgba(150,150,150,1)",
  CANCELLED: "rgba(220,80,80,1)",
}

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
