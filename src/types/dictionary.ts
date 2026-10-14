// 字典模块 TypeScript 类型定义。
// 与后端 internal/service/dictionary.go 的 DictionaryKind / DictionaryItem / DictionaryKindResult 严格对齐。

export type DictionaryKind =
  | 'event_type'
  | 'event_genre'
  | 'event_status'
  | 'event_session_status'
  | 'place_type'
  | 'artist_type'

export interface DictionaryItem {
  code: string
  name_cn: string
  name_en: string
  display_order: number
}

export interface DictionaryKindResult {
  kind: DictionaryKind
  items: DictionaryItem[]
}

/** UI 用：picker 弹层选项（code + 中文显示名） */
export interface DictOption {
  code: string
  name_cn: string
}
