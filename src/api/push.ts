// 推送 token 上报 / 解绑。
//
// 后端契约：
//   POST   /api/v1/user/devices/push-token  { device_id, push_token, push_platform, push_provider }
//   DELETE /api/v1/user/devices/push-token?device_id=xxx

import { request } from '@/utils/request'
import { getDeviceId, getPushPlatform } from '@/utils/device'

export const pushApi = {
  /** 上报（覆盖式 upsert）本机的 uni-push cid */
  reportPushToken(
    pushToken: string,
    deviceId = getDeviceId(),
    platform = getPushPlatform(),
  ): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>('/user/devices/push-token', {
      method: 'POST',
      data: {
        device_id: deviceId,
        push_token: pushToken,
        push_platform: platform,
        push_provider: 'unipush',
      },
    })
  },

  /** 解绑（登出 / 切换账号时调用，避免把 A 账号的通知推给 B 用户） */
  unbindPushToken(deviceId = getDeviceId()): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>('/user/devices/push-token', {
      method: 'DELETE',
      data: { device_id: deviceId },
    })
  },
}
