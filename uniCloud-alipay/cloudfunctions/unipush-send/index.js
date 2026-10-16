'use strict'

/**
 * unipush-send —— uni-push 2.0 消息下发中转（URL 化云函数）
 *
 * 为什么必须走云函数：
 *   uni-push 2.0 官方文档只提供 uni-cloud-push 扩展库的服务端能力
 *   （uniCloud.getPushManager().sendMessage），官方明确「开发者无需关心证书、
 *   签名、服务器端文档」。uni-push 2.0 不存在 AppKey 概念，也不存在对外的
 *   HTTP 推送端点（/v2/push/{appid} 这类地址在 DNS 与官方文档中均不存在）。
 *   自建 Go 服务无法直接向个推/uni-push 下发，只能经本函数中转。
 *
 * 调用方（idoltrail-server-main 的 internal/pkg/push/unipush.go）：
 *   POST <本函数 URL 化地址>
 *   Content-Type: application/json
 *   {
 *     "appid": "__UNI__F1F9279",
 *     "clientids": ["cid-1", "cid-2"],
 *     "title": "标题",
 *     "content": "正文",
 *     "payload": "{\"relatedType\":\"event\",\"relatedId\":\"123\"}",   // 已序列化的 JSON 字符串
 *     "sign": "<HMAC-SHA256 hex>"
 *   }
 *
 * 签名算法必须与 Go 侧 signParams 逐字节一致：
 *   参与签名的 key：appid、clientids、content、payload、title
 *   按 key 升序拼成 "appid=x&clientids=a,b&content=c&payload=...&title=t"，再 HMAC-SHA256(secret, str)。
 *   注意 payload 是 Go 侧 marshal 好的字符串，两端都对「该字符串」本身签名，
 *   不重新序列化，避免 JSON 键序不一致导致验签失败。
 *   appid 参与签名是为了防止调用方把请求改指向另一个应用。
 *
 * 为什么必须签名：
 *   URL 化地址一旦泄露即可被任意调用刷推送额度。用 HMAC 把「只有自建后端能调」
 *   落到密码学上，算法与 univerify-exchange 完全一致。
 *
 * 环境变量（uniCloud 控制台 → 云函数 → unipush-send → 配置 → 环境变量）：
 *   UNIPUSH_APPID  必填，DCloud AppID 字符串，例如 __UNI__F1F9279
 *   UNIPUSH_SECRET 必填，与 Go 侧 UNIPUSH_SECRET 保持一致，建议 ≥32 字节随机串
 *
 * 返回：
 *   { "code": 0, "message": "ok", "sent": 2, "failed": 0, "warnings": [], "results": [] }
 *   failed 非 0 时 code 非 0，message 为可读原因，会原样记入服务端日志。
 */

// 官方限制：单次 sendMessage 最大推送设备数 500，超出部分直接被忽略，必须分批
const BATCH_SIZE = 500
// 官方限制：title < 20，content < 50，payload < 800 字符
const MAX_TITLE = 20
const MAX_CONTENT = 50
const MAX_PAYLOAD = 800

const crypto = require('crypto')

// 与 Go 侧 signParams 对齐：按 key 升序拼接后 HMAC-SHA256，小写 hex
function signParams(params, secret) {
  const keys = Object.keys(params).sort()
  const signStr = keys.map((k) => `${k}=${params[k]}`).join('&')
  return crypto.createHmac('sha256', secret).update(signStr, 'utf8').digest('hex')
}

function fail(code, message, extra) {
  return Object.assign({ code: code, message: message, sent: 0, failed: 0, warnings: [], results: [] }, extra || {})
}

/**
 * 取真正的业务入参。
 *
 * URL 化云函数拿到的 event 结构随网关实现而变：
 *   - 阿里云 / 部分网关：body 被直接解析成对象，event 就是业务入参
 *   - 腾讯云 / API 网关：包一层 { body: '<json string>', ... }
 * 两种都兼容，避免换网关时整条推送链路静默失效。
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

// 校验调用方身份 + 入参，返回 { ok, code, message, appid, clientids, title, content, payload }
function verify(event) {
  const secret = process.env.UNIPUSH_SECRET || ''
  if (!secret) return fail(-3, '云函数未配置 UNIPUSH_SECRET')

  const appid = String((event && event.appid) || '').trim()
  const clientids = Array.isArray(event.clientids)
    ? event.clientids.map((s) => String(s == null ? '' : s).trim()).filter((s) => s !== '')
    : []
  const title = String((event && event.title) || '').trim()
  const content = String((event && event.content) || '').trim()
  // payload 以字符串原样参与签名，不在此处重新序列化
  const payload = String((event && event.payload) || '')

  if (!appid) return fail(-2, '缺少 appid')
  if (clientids.length === 0) return fail(-2, '缺少 clientids 或为空')
  if (!title) return fail(-2, '缺少 title')
  if (!content) return fail(-2, '缺少 content')

  const expected = signParams(
    { appid: appid, clientids: clientids.join(','), content: content, payload: payload, title: title },
    secret
  )
  const received = String((event && event.sign) || '')
  // timingSafeEqual 要求等长，先比长度再比内容
  const expectedBuf = Buffer.from(expected, 'utf8')
  const receivedBuf = Buffer.from(received, 'utf8')
  if (expectedBuf.length !== receivedBuf.length || !crypto.timingSafeEqual(expectedBuf, receivedBuf)) {
    return fail(-1, '非法访问')
  }

  return { ok: true, appid: appid, clientids: clientids, title: title, content: content, payload: payload }
}

/**
 * 标题/正文超长时截断。
 *
 * 超长不会被 DCloud 拒绝而是整批丢弃，这里截断保证通知一定能送达，
 * 同时把截断事实放进 warnings，由服务端写日志，便于发现前端文案失控。
 */
function clamp(str, max, warnings, label) {
  const chars = Array.from(str) // 按码点切，避免截断 emoji 产生乱码
  if (chars.length <= max) return str
  warnings.push(`${label} 超长（${chars.length}），已截断至 ${max}`)
  return chars.slice(0, max).join('')
}

/**
 * payload 必须控制在 800 字符内，且必须是对象才能被离线厂商通道正确透传。
 * 超限时按插入顺序丢字段，直到合法为止，优先保住消息体。
 */
function shrinkPayload(payload, warnings) {
  if (!payload) return null
  let obj
  try {
    obj = typeof payload === 'string' ? JSON.parse(payload) : payload
  } catch {
    warnings.push('payload 不是合法 JSON，已丢弃')
    return null
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null

  let dropped = []
  while (JSON.stringify(obj).length > MAX_PAYLOAD) {
    const keys = Object.keys(obj)
    if (keys.length === 0) break
    const k = keys[keys.length - 1]
    delete obj[k]
    dropped.push(k)
  }
  if (dropped.length > 0) {
    warnings.push(`payload 超长，已丢弃字段：${dropped.join(',')}`)
  }
  return obj
}

function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

exports.main = async (event, context) => {
  const v = verify(pickEvent(event))
  if (!v.ok) {
    console.warn('[unipush-send] reject:', v.code, v.message)
    return fail(v.code, v.message)
  }

  // appid 必须显式传：URL 化调用来自服务器而非 App，
  // context.APPID 可能为空（服务空间未绑定应用），不能依赖它兜底。
  const appid = String(process.env.UNIPUSH_APPID || (context && context.APPID) || '').trim()
  if (!appid) return fail(-4, '云函数未配置 UNIPUSH_APPID')

  const warnings = []

  // 调用方传的 appid 与本函数配置不一致时以本函数为准，但必须报出来：
  // 这是「服务端 .env 与云端环境变量配错」的唯一信号，静默忽略会一直推不出去。
  if (v.appid !== appid) {
    warnings.push(`调用方 appid(${v.appid}) 与云函数配置 appid(${appid}) 不一致，已按云函数配置下发`)
    console.warn('[unipush-send] appid mismatch:', v.appid, '!=', appid)
  }

  const title = clamp(v.title, MAX_TITLE, warnings, 'title')
  const content = clamp(v.content, MAX_CONTENT, warnings, 'content')
  const payload = shrinkPayload(v.payload, warnings)

  let uniPush
  try {
    uniPush = uniCloud.getPushManager({ appId: appid })
  } catch (err) {
    const msg = (err && err.message) || String(err)
    console.error('[unipush-send] getPushManager failed:', msg)
    return fail(-5, '获取推送管理器失败：' + msg)
  }

  const batches = chunk(v.clientids, BATCH_SIZE)
  if (v.clientids.length > BATCH_SIZE) {
    warnings.push(`cid 共 ${v.clientids.length} 个，已按 ${BATCH_SIZE} 一批拆为 ${batches.length} 批下发`)
  }

  const results = []
  let sent = 0
  let failed = 0

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i]
    const message = {
      push_clientid: batch,
      title: title,
      content: content,
      // 用对象而非字符串：官方要求对象格式，否则离线厂商通道拿不到 payload
      payload: payload || {}
    }
    try {
      const res = await uniPush.sendMessage(message)
      const errCode = res && typeof res.errCode === 'number' ? res.errCode : 0
      if (errCode !== 0) {
        const errMsg = (res && res.errMsg) || 'unknown'
        failed += batch.length
        results.push({ batch: i, size: batch.length, ok: false, errCode: errCode, errMsg: errMsg })
        console.error(`[unipush-send] batch ${i} failed: errCode=${errCode} errMsg=${errMsg}`)
      } else {
        sent += batch.length
        // taskId 用于向 DCloud 查询逐台发送明细，兼容云函数调用直接返回与 { data: {...} } 包裹两种形态
        const taskId = (res && (res.taskId || res.$taskid)) || (res && res.data && (res.data.taskId || res.data.$taskid)) || ''
        results.push({ batch: i, size: batch.length, ok: true, errCode: 0, errMsg: 'success', taskId: taskId })
        console.log(`[unipush-send] batch ${i} ok, ${batch.length} 台, taskId=${typeof taskId === 'string' ? taskId : JSON.stringify(taskId)}`)
      }
    } catch (err) {
      const msg = (err && err.message) || String(err)
      failed += batch.length
      results.push({ batch: i, size: batch.length, ok: false, errCode: -1, errMsg: msg })
      console.error(`[unipush-send] batch ${i} threw: ${msg}`)
    }
  }

  if (failed > 0) {
    const firstBad = results.find((r) => !r.ok)
    return fail(-6, '部分批次下发失败：' + (firstBad ? firstBad.errMsg : ''), {
      sent: sent,
      failed: failed,
      warnings: warnings,
      results: results
    })
  }

  return { code: 0, message: 'ok', sent: sent, failed: 0, warnings: warnings, results: results }
}
