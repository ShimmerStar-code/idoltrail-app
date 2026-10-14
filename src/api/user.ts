import { request } from '@/utils/request'
import { API_BASE_URL } from '@/utils/env'
import type { Device, LoginLog, User } from '@/types/auth'

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

  cancelRevoke(): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>('/user/cancel/revoke', { method: 'POST' })
  },

  devices(): Promise<Device[]> {
    return request<Device[]>('/user/devices')
  },

  deleteDevice(id: number): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>(`/user/devices/${id}`, { method: 'DELETE' })
  },

  loginLogs(page = 1, pageSize = 20): Promise<{ list: LoginLog[]; total: number }> {
    return request<{ list: LoginLog[]; total: number }>(`/user/login-logs?page=${page}&page_size=${pageSize}`)
  },

  // multipart 文件上传（不走通用 request，单独封装）
  // 返回 avatar_url 为可直接展示的完整公网 URL（OSS 或 https://域名/static/...）
  uploadAvatar(filePath: string): Promise<{ avatar_url: string }> {
    return new Promise((resolve, reject) => {
      uni.uploadFile({
        url: API_BASE_URL + '/user/avatar/upload',
        filePath,
        name: 'file',
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
          reject(new Error(err?.errMsg ?? '上传失败'))
        },
      })
    })
  },

  // 通过微信 getPhoneNumber 授权 code 绑定/更换手机号
  bindPhone(code: string): Promise<{ phone: string; ok: boolean }> {
    return request<{ phone: string; ok: boolean }>('/user/phone/bind', {
      method: 'POST',
      data: { code },
    })
  },

  // 解绑手机号
  unbindPhone(): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>('/user/phone/unbind', { method: 'DELETE' })
  },
}
