// 捐赠订单相关类型

// ── 支付渠道（与后端 model.DonationChannel 保持一致）──
export type DonationChannel =
  | 'wx_jsapi' // 微信小程序 JSAPI
  | 'wx_virtual' // 微信小程序虚拟支付
  | 'wx_app' // 微信 App 支付（Android）
  | 'alipay_app' // 支付宝 App 支付（Android）
  | 'apple_iap' // iOS StoreKit 内购

/** POST /donations 请求（V3 JSAPI，备用） */
export interface DonationOrderRequest {
  /** 金额（单位：分，最小 1 分 = 0.01 元） */
  amount: number
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

/** POST /donations 响应（V3 JSAPI，备用） */
export interface DonationOrderResponse {
  out_trade_no: string
  prepay_params: JSAPIPrepayParams
  /** RFC3339 ISO8601 */
  expire_at: string
}

// ── 虚拟支付（XPay）──

/** POST /donations/xpay/sign 请求 */
export interface XPaySignRequest {
  /** 金额（单位：分），必须是固定档位：500/1000/2000/5000/10000/20000 */
  amount: number
  /** uni.getSystemInfoSync().platform，"android" | "ios" */
  platform: string
  /** 0=现网(真机) 1=沙箱(DevTools/mac) */
  env: number
}

/** wx.requestVirtualPayment 所需参数（由后端签名后返回） */
export interface XPayParams {
  offerId: string
  productId: string
  buyQuantity: number
  currencyType: string
  platform: string
  env: number        // 0=正式 1=沙箱
  outTradeNo: string
  mode: string       // "short_series_goods" = 道具直购
  signData: string   // 核心参数 JSON
  signature: string  // hex(HMAC-SHA256(sessionKey, signData))
  paySig: string     // hex(HMAC-SHA256(appKey, "requestVirtualPayment"+signData))
}

/** POST /donations/xpay/sign 响应 */
export interface XPaySignResponse {
  out_trade_no: string
  expire_at: string
  params: XPayParams
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