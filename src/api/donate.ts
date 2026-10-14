// 捐赠订单接口
import { request } from '@/utils/request'
import type {
  AppleIAPProductMap,
  AppleIAPVerifyRequest,
  AppleIAPVerifyResponse,
  DonationOrderRequest,
  DonationOrderResponse,
  DonationOrderStatus,
  XPaySignRequest,
  XPaySignResponse,
} from '@/types/donate'

export const donateApi = {
  /** 创建捐赠订单（V3 JSAPI，备用） */
  createOrder(amount: number): Promise<DonationOrderResponse> {
    return request<DonationOrderResponse>('/donations', {
      method: 'POST',
      data: { amount } as DonationOrderRequest,
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

  /** 查询订单状态（前端轮询用，已校验属主） */
  queryOrder(outTradeNo: string): Promise<DonationOrderStatus> {
    return request<DonationOrderStatus>(`/donations/${encodeURIComponent(outTradeNo)}`)
  },
}