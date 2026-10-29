import { request } from '@/utils/request'
import { API_BASE_URL } from '@/utils/env'
import type { AgreementRecord, User } from '@/types/auth'

export const userApi = {
  me(): Promise<User> {
    return request<User>('/user/me')
  },

  updateMe(data: {
    nickname?: string
    avatar_url?: string
    gender?: 0 | 1 | 2
    email?: string
    wechat_id?: string
    birthday?: string      // "YYYY-MM-DD"
    nationality?: string
    bio?: string
  }): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>('/user/me', { method: 'PATCH', data })
  },

  cancel(): Promise<{ ok: boolean; message: string }> {
    return request<{ ok: boolean; message: string }>('/user/cancel', { method: 'POST' })
  },

  /** 我的协议 / 隐私政策签署记录（同意时间、版本、来源） */
  agreements(page = 1, pageSize = 20): Promise<{ list: AgreementRecord[]; total: number }> {
    return request<{ list: AgreementRecord[]; total: number }>(`/user/agreements?page=${page}&page_size=${pageSize}`)
  },

  // multipart 文件上传（不走通用 request，单独封装）
  // 返回 avatar_url 为可直接展示的完整公网 URL（OSS 或 https://域名/static/...）
  uploadAvatar(filePath: string): Promise<{ avatar_url: string }> {
    return new Promise((resolve, reject) => {
      uni.uploadFile({
        url: API_BASE_URL + '/user/avatar/upload',
        filePath,
        name: 'file',
        // 显式给上限：各端 uploadFile 默认行为不一致，不写可能沿用宿主默认
        // （部分实现根本不超时），弱网大图会一直挂着、用户既等不到结果也退不掉
        timeout: 60000,
        header: {
          Authorization: 'Bearer ' + uni.getStorageSync('fans:auth:access'),
        },
        success(res) {
          try {
            const body = JSON.parse(res.data)
            if (body.code === 0) {
              resolve(body.data)
            } else {
              uni.showToast({ title: body.message, icon: 'none' })
              reject(new Error(body.message))
            }
          } catch (e) {
            reject(e)
          }
        },
        fail(err) {
          // err.errMsg 是微信原始错误，如 "uploadFile:fail url not in domain list"
          console.error('[uploadAvatar] fail:', err?.errMsg ?? err)
          const timedOut = String(err?.errMsg || '').toLowerCase().includes('timeout')
          reject(new Error(timedOut ? '头像上传超时，请检查网络后重试' : (err?.errMsg ?? '上传失败')))
        },
      })
    })
  },
}
