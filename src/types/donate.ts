// 捐赠订单相关类型

// ── 支付渠道（与后端 model.DonationChannel 保持一致）──
export type DonationChannel =
  | 'wx_jsapi' // 微信小程序 JSAPI
  | 'wx_virtual' // 微信小程序虚拟支付
  | 'wx_app' // 微信 App 支付（Android）
  | 'alipay_app' // 支付宝 App 支付（Android）
  | 'apple_iap' // iOS StoreKit 内购

/** POST /donations 请求 */
export interface DonationOrderRequest {
  /** 金额（单位：分，最小 1 分 = 0.01 元） */
  amount: number
  /**
   * 支付渠道。省略等价 `wx_jsapi`（与后端默认值一致）。
   *
   * Android 必须显式传 `wx_app`：不传会落到小程序 JSAPI 分支，
   * 服务端因取不到 openid 而返回 409（`CodeOpenIDMissing`），
   * 表现为「点了没反应」。
   */
  channel?: DonationChannel
}

/** 小程序调起微信支付所需的 6 个字段（从后端 prepay_params 取，V3 JSAPI 备用） */
export interface JSAPIPrepayParams {
  appId: string
  timeStamp: string
  nonceStr: string
  /** 形如 "prepay_id=wx201..." */
  package: string
  signType: string
  paySign: string
}

/** POST /donations 响应 */
export interface DonationOrderResponse {
  out_trade_no: string
  /** 服务端实际落库的渠道，与请求一致（回显便于排障） */
  channel: DonationChannel
  /** 仅 wx_jsapi 渠道返回 */
  prepay_params?: JSAPIPrepayParams
  /**
   * 仅 wx_app 渠道返回；原样透传给
   * `uni.requestPayment({ provider: 'wxpay', orderInfo })`，不可自行解析或重组。
   */
  order_info?: string
  /** RFC3339 ISO8601 */
  expire_at: string
}

// ── iOS 内购（StoreKit IAP）──

/**
 * GET /donation-products 响应：product_id → 金额（分）
 *
 * 金额以服务端为准，客户端不得自行决定捐赠金额。
 */
export type AppleIAPProductMap = Record<string, number>

/** POST /donations/iap/verify 请求 */
export interface AppleIAPVerifyRequest {
  /** uni.requestPayment({provider:'appleiap'}) 成功后返回的交易号 */
  transaction_id: string
  /** 商品 ID，必须在服务端白名单内 */
  product_id: string
}

/** POST /donations/iap/verify 响应 */
export interface AppleIAPVerifyResponse {
  out_trade_no: string
  /** 2 已支付 / 4 已退款 */
  status: 2 | 4
  /** 金额（单位：分） */
  amount: number
  /** ISO 4217 币种码，如 CNY */
  currency: string
  product_id: string
  /** RFC3339 */
  paid_at?: string
  /** true 表示这笔交易此前已入账，本次为幂等重放 */
  already_paid: boolean
}

// ── 订单查询 ──

/** GET /donations/:out_trade_no 响应 */
export interface DonationOrderStatus {
  out_trade_no: string
  /** 1 待支付 2 已支付 3 已关闭 4 已退款 */
  status: 1 | 2 | 3 | 4
  channel: DonationChannel
  amount: number
  currency: string
  subject: string
  /** RFC3339 */
  expire_at: string
  /** RFC3339，可选 */
  paid_at?: string
  /** 微信渠道返回 */
  wx_transaction_id?: string
  /** Apple IAP 渠道返回 */
  apple_transaction_id?: string
}