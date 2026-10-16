'use strict'

/**
 * univerify-exchange —— uni 一键登录取号中转（URL 化云函数）
 *
 * 为什么需要它：
 *   uniCloud.getPhoneNumber 是官方唯一能把 univerify 的 access_token 换成
 *   本机手机号的运行时接口，自建服务器无法直接取号，只能经本函数中转。
 *
 * 调用方（idoltrail-server-main 的 /auth/onekey-login）：
 *   POST <本函数 URL 化地址>
 *   Content-Type: application/json
 *   { "access_token": "...", "openid": "...", "sign": "<HMAC-SHA256 hex>" }
 *
 * 签名算法必须与 internal/service/univerify.go 的 signParams 逐字节一致：
 *   参数按 key 升序拼成 "access_token=xxx&openid=yyy"，再做 HMAC-SHA256(secret, str)。
 *   任一侧改动都会导致「非法访问」。
 *
 * 为什么必须签名：
 *   换号按次计费（DCloud 0.02 元/次），URL 化地址一旦泄露就能被人拿去
 *   任意刷号。用 HMAC 把「只有 Go 后端能调」这件事落到密码学上。
 *
 * 环境变量（uniCloud 控制台 → 云函数 → univerify-exchange → 配置 → 环境变量）：
 *   UNIVERIFY_APPID  必填，DCloud AppID 字符串，例如 __UNI__F1F9279
 *   UNIVERIFY_SECRET 必填，与 Go 侧 UNIVERIFY_SECRET 保持一致，建议 ≥32 字节随机串
 *
 * 返回：
 *   { "code": 0, "message": "ok", "phoneNumber": "13800138000" }
 *   失败时 code 非 0，message 为可读原因，会原样透给 App 端内联展示。
 */

const crypto = require('crypto')

// 与 Go 侧 signParams 对齐：按 key 升序拼接后 HMAC-SHA256，小写 hex
function signParams(params, secret) {
  const keys = Object.keys(params).sort()
  const signStr = keys.map((k) => `${k}=${params[k]}`).join('&')
  return crypto.createHmac('sha256', secret).update(signStr, 'utf8').digest('hex')
}

function fail(code, message) {
  return { code: code, message: message, phoneNumber: '' }
}

/**
 * 取真正的业务入参。
 *
 * URL 化云函数拿到的 event 结构随网关实现而变：
 *   - 阿里云 / 部分网关：body 被直接解析成对象，event 就是业务入参
 *   - 腾讯云 / API 网关：包一层 { body: '<json string>', ... }
 * 两种都兼容，避免换网关时整条登录链路静默失效。
 */
function pickEvent(event) {
  if (!event || typeof event !== 'object') return {}
  if (event.body === undefined || event.body === null || event.body === '') return event
  const raw = typeof event.body === 'string' ? event.body : JSON.stringify(event.body)
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

// 校验调用方身份 + 入参，返回 { ok, code, message, access_token, openid }
function verify(event) {
  const secret = process.env.UNIVERIFY_SECRET || ''
  if (!secret) return fail(-3, '云函数未配置 UNIVERIFY_SECRET')

  const accessToken = String((event && event.access_token) || '').trim()
  const openid = String((event && event.openid) || '').trim()
  if (!accessToken || !openid) return fail(-2, '缺少 access_token 或 openid')

  const expected = signParams({ access_token: accessToken, openid: openid }, secret)
  const received = String((event && event.sign) || '')
  // timingSafeEqual 要求等长，先比长度再比内容
  const expectedBuf = Buffer.from(expected, 'utf8')
  const receivedBuf = Buffer.from(received, 'utf8')
  if (expectedBuf.length !== receivedBuf.length || !crypto.timingSafeEqual(expectedBuf, receivedBuf)) {
    return fail(-1, '非法访问')
  }

  return { ok: true, access_token: accessToken, openid: openid }
}

exports.main = async (event, context) => {
  const v = verify(pickEvent(event))
  if (!v.ok) {
    console.warn('[univerify-exchange] reject:', v.code, v.message)
    return fail(v.code, v.message)
  }

  // appid 必须显式传：URL 化调用来自服务器而非 App，
  // context.APPID 可能为空（服务空间未绑定应用），不能依赖它兜底。
  const appid = String(process.env.UNIVERIFY_APPID || (context && context.APPID) || '').trim()
  if (!appid) return fail(-4, '云函数未配置 UNIVERIFY_APPID')

  try {
    const res = await uniCloud.getPhoneNumber({
      provider: 'univerify',
      appid: appid,
      access_token: v.access_token,
      openid: v.openid
    })
    const phoneNumber = res && (res.phoneNumber || res.phone)
    if (!phoneNumber) {
      return fail(-5, '未取到手机号（access_token 可能已过期，请重新发起登录）')
    }
    console.log('[univerify-exchange] ok, phone tail=' + String(phoneNumber).slice(-4))
    return { code: 0, message: 'ok', phoneNumber: String(phoneNumber) }
  } catch (err) {
    const msg = (err && err.message) || String(err)
    console.error('[univerify-exchange] getPhoneNumber failed:', msg)
    return fail(-6, '取号失败：' + msg)
  }
}
