// 活动类型 / 状态 / 短缩写 的共享常量
// 后端 event_type / event_status 枚举见 backend/CLAUDE.md

import type { Event } from "@/types/event"

/** 活动类型下拉项(后端 event_type 枚举) — 唯一权威来源 */
export const EVENT_TYPE_OPTIONS: { code: Event["type"]; label: string }[] = [
  { code: "Concert",       label: "演唱会" },
  { code: "Music_Festival", label: "音乐节" },
  { code: "Fan_Meeting",   label: "粉丝见面会" },
  { code: "Anime_Expo",    label: "漫展" },
  { code: "Concert_Hall",  label: "音乐会" },
]

/** 活动类型 → 中文标签（从 EVENT_TYPE_OPTIONS 派生，卡片 tag 和详情页统一用此）*/
export const EVENT_TYPE_LABEL: Record<string, string> =
  Object.fromEntries(EVENT_TYPE_OPTIONS.map((o) => [o.code, o.label]))

/** @deprecated 英文缩写已废弃，请改用 EVENT_TYPE_LABEL */
export const EVENT_TYPE_SHORT: Record<string, string> = {
  Concert: "Cnt",
  "Music_Festival": "Fmt",
  "Fan_Meeting": "FM",
  "Anime_Expo": "Anm",
  "Concert_Hall": "CH",
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
