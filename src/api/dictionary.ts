// 字典模块 API 封装。
// 后端路由：GET /api/v1/dictionaries/:kind，公开无需鉴权。

import { request } from '@/utils/request'
import type { DictionaryKind, DictionaryKindResult } from '@/types/dictionary'

export const dictionaryApi = {
  /** 取一种字典的全部条目（按 display_order 排序） */
  get: (kind: DictionaryKind) =>
    request<DictionaryKindResult>(`/dictionaries/${kind}`),
}
