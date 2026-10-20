// 捐赠订单接口
import { request } from '@/utils/request'
import type {
  AppleIAPProductMap,
  AppleIAPVerifyRequest,
  AppleIAPVerifyResponse,
  DonationChannel,
  DonationOrderRequest,
  DonationOrderResponse,
  DonationOrderStatus,
  XPaySignRequest,
  XPaySignResponse,
} from '@/types/donate'

export const donateApi = {
  /**
   * 创建捐赠订单。
   *
   * @param channel 支付渠道。Android 端必须传 `wx_app`，
   *   否则服务端会走小程序 JSAPI 分支并因取不到 openid 而报 409。
   *   不传时后端按 `wx_jsapi` 处理（保持历史调用兼容）。
   */
  createOrder(amount: number, channel?: DonationChannel): Promise<DonationOrderResponse> {
    return request<DonationOrderResponse>('/donations', {
      method: 'POST',
      data: { amount, channel } as DonationOrderRequest,
    })
  },

  /** 虚拟支付：创建订单 + 获取签名参数，用于 wx.requestVirtualPayment */
  xpaySign(amount: number, platform: string, env: number = 0): Promise<XPaySignResponse> {
    return request<XPaySignResponse>('/donations/xpay/sign', {
      method: 'POST',
      data: { amount, platform, env } as XPaySignRequest,
    })
  },

  /** iOS 内购档位：product_id → 金额（分），金额以服务端为准 */
  getAppleIAPProducts(): Promise<AppleIAPProductMap> {
    return request<AppleIAPProductMap>('/donation-products')
  },

  /** iOS 内购：回传 StoreKit transactionId，服务端验签后入账（幂等可重试） */
  verifyAppleIAP(data: AppleIAPVerifyRequest): Promise<AppleIAPVerifyResponse> {
    return request<AppleIAPVerifyResponse>('/donations/iap/verify', {
      method: 'POST',
      data,
    })
  },

  /**
   * 查询订单状态。
   *
   * @param outTradeNo 商户单号
   * @param options.silent 传 true 时失败不弹全局 toast，只 reject。
   *   支付结果轮询必须用 silent：那段时间页面被全屏 mask 遮着，
   *   每次轮询失败都弹 toast 既看不见，又会在 mask 关闭的瞬间集体闪现。
   */
  queryOrder(outTradeNo: string, options?: { silent?: boolean }): Promise<DonationOrderStatus> {
    return request<DonationOrderStatus>(`/donations/${encodeURIComponent(outTradeNo)}`, {
      silent: options?.silent,
    })
  },
}