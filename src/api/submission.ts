// 众包上报接口（演出情报）
//
//   POST   /submissions/upload   上传海报图（multipart，字段名 file）
//   POST   /submissions          提交上报
//   GET    /submissions/mine     我的上报列表
//
// 全部需要登录。
import { request } from '@/utils/request'
import { API_BASE_URL } from '@/utils/env'
import type {
  CreateSubmissionPayload,
  SubmissionListResult,
} from '@/types/submission'

export const submissionApi = {
  /**
   * 上传一张上报图片。
   *
   * 与 userApi.uploadAvatar 同样的 multipart 封装（不走通用 request，
   * uni.uploadFile 的返回体是字符串，没法走 request.ts 的 JSON 拆包逻辑）。
   * 但**不弹 toast**：提交页上传期有进度反馈，再叠一个一闪而过的 toast
   * 只会让人以为出错了。错误交由调用方内联展示。
   *
   * ⚠️ 必须显式给 timeout：uni.uploadFile 的**默认值是 60s**，
   * 但不同端（尤其 iOS / 部分 Android webview）实现不一致，
   * 不写就可能沿用宿主的默认（有的默认根本不超时），
   * 弱网大图上传会一直挂着、进度条卡在 99%，用户既看不到结果也退不掉。
   */
  uploadImage(filePath: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      uni.uploadFile({
        url: API_BASE_URL + '/submissions/upload',
        filePath,
        name: 'file',
        // 上限 9 张图并发上传，60s 是给「最慢的那张」留的余量
        timeout: 60000,
        header: {
          Authorization: 'Bearer ' + uni.getStorageSync('fans:auth:access'),
        },
        success(res) {
          try {
            const body = JSON.parse(res.data)
            if (body.code === 0 && body.data?.url) {
              resolve(body.data.url)
            } else {
              reject(new Error(body.message || '图片上传失败'))
            }
          } catch (e) {
            reject(e instanceof Error ? e : new Error('图片上传失败'))
          }
        },
        fail(err) {
          const timedOut = String(err?.errMsg || '').toLowerCase().includes('timeout')
          reject(new Error(timedOut ? '图片上传超时，请检查网络后重试' : (err?.errMsg ?? '图片上传失败')))
        },
      })
    })
  },

  /** 提交上报。images 必须是 uploadImage 返回的完整 URL。 */
  create(data: CreateSubmissionPayload): Promise<{ id: number; status: string }> {
    return request<{ id: number; status: string }>('/submissions', {
      method: 'POST',
      data,
    })
  },

  /** 我的上报列表，看自己那条线索有没有被采纳。 */
  mine(page = 1, pageSize = 20): Promise<SubmissionListResult> {
    return request<SubmissionListResult>(`/submissions/mine?page=${page}&page_size=${pageSize}`)
  },
}
