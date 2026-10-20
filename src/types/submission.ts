// 用户众包上报线索（演出情报）
//
// 设计取舍：用户只传「海报图 + 文字」，不填艺人/城市/场馆/时间。
// 截图本身承载了大部分信息，运营看图辨认的成本远低于让用户填表，
// 而填表会大幅抬高放弃率 —— 这个功能省的是运营时间，不能再拿用户时间去换。

/** 上报状态：待审核 / 已转活动草稿 / 已驳回（终态不可再改） */
export type SubmissionStatus = 'PENDING' | 'CONVERTED' | 'REJECTED'

/** 单条上报记录 */
export interface Submission {
  id: number
  user_id: number
  title: string
  content: string
  /** 海报图 URL 数组，最多 3 张 */
  images: string[]
  status: SubmissionStatus
  /** 转化后的活动 ID，仅 CONVERTED 状态有值 */
  event_id?: number | null
  /** 驳回原因或审核备注 */
  review_note: string
  created_at: string
  reviewed_at?: string | null
}

export interface SubmissionListResult {
  list: Submission[]
  total: number
  page: number
  page_size: number
}

/** 提交上报的入参 */
export interface CreateSubmissionPayload {
  title?: string
  content: string
  images: string[]
}
