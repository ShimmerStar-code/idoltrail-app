/**
 * App 端原生支付封装。
 *
 * 三种 provider 都通过内置的 `uni.requestPayment` 调起，无需自写 UTS 插件：
 *   - `appleiap`：iOS StoreKit 内购（数字内容唯一合规渠道）
 *   - `wxpay`：Android 微信 App 支付
 *   - `alipay`：Android 支付宝 App 支付
 *
 * 关键约束：
 *   1. 支付结果**不能**作为「已支付」的依据。StoreKit 与微信/支付宝的最终状态
 *      都要服务端向渠道查证（Apple 走 App Store Server API），前端只负责调起与回传凭证。
 *   2. `requestPayment` 的 success 只代表「用户完成操作」，用户仍可能在随后取消；
 *      必须回传 transaction_id 让服务端验签入账。
 *   3. 弹窗/支付面板遮挡期间不要用 uni.showToast 提示错误，统一内联展示。
 */

/** 当前平台标识：'ios' | 'android' | 'devtools' | 'web' */
export type NativePlatform = 'ios' | 'android' | 'devtools' | 'web'

/** 支付渠道 */
export type PayProvider = 'appleiap' | 'wxpay' | 'alipay'

/** 支付结果 */
export interface NativePayResult {
  /** 是否用户完成支付流程（未取消、无系统级错误） */
  success: boolean
  /** StoreKit 交易号；仅 appleiap 返回，用于服务端验签入账 */
  transactionId?: string
  /** 原始返回值，便于排障 */
  raw?: unknown
}

/** 错误码：区分「用户取消」与「真实失败」，UI 提示策略不同 */
export const NativePayErrorCode = {
  /** 用户主动取消 */
  CANCELLED: 'cancelled',
  /** 渠道未就绪（SDK 未集成 / provider 不支持） */
  UNAVAILABLE: 'unavailable',
  /** 支付失败 */
  FAILED: 'failed',
} as const

export interface NativePayError extends Error {
  code: (typeof NativePayErrorCode)[keyof typeof NativePayErrorCode]
  raw?: unknown
}

function makePayError(
  code: (typeof NativePayErrorCode)[keyof typeof NativePayErrorCode],
  message: string,
  raw?: unknown,
): NativePayError {
  const err = new Error(message) as NativePayError
  err.code = code
  err.raw = raw
  return err
}

/**
 * 读取当前运行平台。
 *
 * 条件编译：H5 与小程序端该函数同样可用，但支付入口只在 App 端开放。
 */
export function getNativePlatform(): NativePlatform {
  // #ifdef APP-PLUS
  const info = uni.getSystemInfoSync()
  const os = String(info?.osName || info?.platform || '').toLowerCase()
  if (os.indexOf('ios') >= 0 || os.indexOf('iphone') >= 0) return 'ios'
  // uni-app 5+ 里 APP-PLUS-ANDROID / APP-PLUS-IOS 更精确，但 osName 已足够；
  // App 端非 iOS 即 Android
  return 'android'
  // #endif

  return 'web'
}

/** iOS 端只支持 StoreKit 内购 */
export function isAppleIAPPlatform(): boolean {
  return getNativePlatform() === 'ios'
}

/** Android 端可走微信 / 支付宝 */
export function isAndroidPlatform(): boolean {
  return getNativePlatform() === 'android'
}

/** App 端（iOS + Android）通用内购商品参数 */
interface AppleIAPPayload {
  productId: string
  /** 展示给用户的商品描述，会出现在原生购买弹窗里 */
  productDescription?: string
  /** 购买数量，虚拟商品恒为 1 */
  quantity?: number
  /** 交易所在设备发起 */
  applicationUsername?: string
}

/**
 * `uni.requestPayment` 的入参断言。
 *
 * DCloud 把三个 provider 的参数合并成了同一个 `RequestPaymentOptions`，
 * 并把 `orderInfo` 声明为必填；但 appleiap 用的是 `ordering`，
 * 两者互斥、运行时也只会读其中一个。DCloud 的类型定义本身无法表达这种
 * 分支，只能在这里做双重断言（`unknown` 桥接），不要改成单层断言，
 * 否则 TS2352 依旧会报「无充分重叠」。
 */
function asRequestPaymentOptions(options: unknown): UniApp.RequestPaymentOptions {
  return options as UniApp.RequestPaymentOptions
}

/**
 * 调起 StoreKit 内购。
 *
 * @returns 成功时返回 transactionId，交给 `donateApi.verifyAppleIAP` 做服务端入账。
 * @throws  { code: NativePayErrorCode.CANCELLED | FAILED | UNAVAILABLE }
 */
export function requestAppleIAP(payload: AppleIAPPayload): Promise<NativePayResult> {
  return new Promise<NativePayResult>((resolve, reject) => {
    if (!payload?.productId) {
      reject(makePayError(NativePayErrorCode.UNAVAILABLE, 'productId is required'))
      return
    }

    // #ifdef APP-PLUS
    uni.requestPayment(
      asRequestPaymentOptions({
        provider: 'appleiap',
      ordering: {
        productId: payload.productId,
        quantity: payload.quantity ?? 1,
      },
      done: (res: any) => {
        const transactionId =
          res?.transactionId ||
          res?.transaction_id ||
          res?.payment?.transactionId ||
          ''
        resolve({ success: true, transactionId, raw: res })
      },
      fail: (err: any) => {
        const msg = String(err?.errMsg || err?.message || '')
        // 用户取消：不算失败，静默返回让调用方保持原状
        if (msg.toLowerCase().indexOf('cancel') >= 0) {
          reject(makePayError(NativePayErrorCode.CANCELLED, 'user cancelled', err))
          return
        }
        reject(makePayError(NativePayErrorCode.FAILED, msg || 'apple iap failed', err))
        },
      }),
    )
    // #endif

    // #ifndef APP-PLUS
    reject(
      makePayError(NativePayErrorCode.UNAVAILABLE, 'appleiap is only available on App'),
    )
    // #endif
  })
}

/** 微信 App 支付参数（Android） */
export interface WxPayPayload {
  /** 后端 /api/v1/pay/wx/app 下单返回的调起参数 */
  orderInfo: string
}

/**
 * 调起微信 App 支付。
 *
 * @param payload.orderInfo 后端 V3 App 支付统一下单返回的 orderInfo 字符串
 */
export function requestWxAppPay(payload: WxPayPayload): Promise<NativePayResult> {
  return new Promise<NativePayResult>((resolve, reject) => {
    if (!payload?.orderInfo) {
      reject(makePayError(NativePayErrorCode.UNAVAILABLE, 'orderInfo is required'))
      return
    }

    // #ifdef APP-PLUS
    uni.requestPayment(
      asRequestPaymentOptions({
        provider: 'wxpay',
      orderInfo: payload.orderInfo,
      done: (res: any) => resolve({ success: true, raw: res }),
      fail: (err: any) => {
        const msg = String(err?.errMsg || err?.message || '')
        if (msg.toLowerCase().indexOf('cancel') >= 0) {
          reject(makePayError(NativePayErrorCode.CANCELLED, 'user cancelled', err))
          return
        }
        reject(makePayError(NativePayErrorCode.FAILED, msg || 'wechat pay failed', err))
        },
      }),
    )
    // #endif

    // #ifndef APP-PLUS
    reject(
      makePayError(NativePayErrorCode.UNAVAILABLE, 'wxpay is only available on App'),
    )
    // #endif
  })
}

/** 支付宝 App 支付参数（Android） */
export interface AlipayPayload {
  /** 后端 alipay.trade.app.pay 返回的 orderInfo */
  orderInfo: string
}

/**
 * 调起支付宝 App 支付。
 *
 * @param payload.orderInfo 后端返回的 orderInfo 字符串
 */
export function requestAlipay(payload: AlipayPayload): Promise<NativePayResult> {
  return new Promise<NativePayResult>((resolve, reject) => {
    if (!payload?.orderInfo) {
      reject(makePayError(NativePayErrorCode.UNAVAILABLE, 'orderInfo is required'))
      return
    }

    // #ifdef APP-PLUS
    uni.requestPayment(
      asRequestPaymentOptions({
        provider: 'alipay',
      orderInfo: payload.orderInfo,
      done: (res: any) => resolve({ success: true, raw: res }),
      fail: (err: any) => {
        const msg = String(err?.errMsg || err?.message || '')
        if (msg.toLowerCase().indexOf('cancel') >= 0) {
          reject(makePayError(NativePayErrorCode.CANCELLED, 'user cancelled', err))
          return
        }
        reject(makePayError(NativePayErrorCode.FAILED, msg || 'alipay failed', err))
        },
      }),
    )
    // #endif

    // #ifndef APP-PLUS
    reject(
      makePayError(NativePayErrorCode.UNAVAILABLE, 'alipay is only available on App'),
    )
    // #endif
  })
}