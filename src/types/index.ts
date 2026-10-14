export interface ApiResponse<T> {
  code: number
  data: T
  message: string
}

export interface PageParams {
  page?: number
  page_size?: number
}

export interface PageResult<T> {
  total: number
  page: number
  page_size: number
  list: T[]
}
