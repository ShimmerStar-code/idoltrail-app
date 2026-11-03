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
  // payload 是字符串，原样参与签名，两端不能重新序列化
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
  // timingSafeEqual 要求两长度相同，先比较长度
  const expectedBuf = Buffer.from(expected, 'utf8')
  const receivedBuf = Buffer.from(received, 'utf8')
  if (expectedBuf.length !== receivedBuf.length || !crypto.timingSafeEqual(expectedBuf, receivedBuf)) {
    return fail(-1, '非法访问')
  }

  // 调试开关：需要额外提供正确的 debug 密钥才生效，避免被外部打开。
  // 打开后响应里会带上扩展库实际发往个推的请求体（push_message / push_channel / settings）。
  // 未单独配置 UNIPUSH_DEBUG_SECRET 时复用 UNIPUSH_SECRET，省去额外的环境变量配置步骤。
  let debugRequestBody = false
  const debugSecret = String(process.env.UNIPUSH_DEBUG_SECRET || process.env.UNIPUSH_SECRET || '').trim()
  const debugProvided = String((event && event.debug_secret) || '').trim()
  if (debugSecret && debugProvided) {
    const a = Buffer.from(debugSecret, 'utf8')
    const b = Buffer.from(debugProvided, 'utf8')
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
      debugRequestBody = true
    }
  }

  return {
    ok: true,
    appid: appid,
    clientids: clientids,
    title: title,
    content: content,
    payload: payload,
    debugRequestBody: debugRequestBody
  }
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

// 解析厂商通道策略：只允许 1-4，非法值回退到 1 并记 warning。
//
// 默认 1（在线走个推长连接 / 离线走厂商通道）：
//   实测两条路都会创建系统通知栏 —— 直连路径给的是 push_message.notification，
//   个推通道与厂商通道都按通知消息处理。
//   取 1 的理由：设备在线时个推通道秒级送达，离线时自动落到厂商通道（小米），
//   两类场景都覆盖；取 2（只走厂商通道）会让在线设备也多等厂商通道的分钟级延迟。
//   取 3（只走个推通道）则离线设备彻底收不到。
function parseStrategyDefault(warnings) {
  const raw = String(process.env.UNIPUSH_STRATEGY_DEFAULT || '').trim()
  if (raw === '') return 1
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 1 || n > 4) {
    warnings.push(`UNIPUSH_STRATEGY_DEFAULT(${raw}) 非法，已按 1（在线个推/离线厂商）下发`)
    return 1
  }
  return n
}

// 解析布尔型环境变量：'1'/'true'/'yes' 为真，其余（含空）为默认值。
function parseBoolEnv(name, defaultValue) {
  const raw = String(process.env[name] || '').trim().toLowerCase()
  if (raw === '') return defaultValue
  return raw === '1' || raw === 'true' || raw === 'yes'
}

// 取 appid：优先请求传入，其次环境变量。
function resolvedAppidGuess(event) {
  const fromEvent = String((event && event.appid) || '').trim()
  if (fromEvent) return fromEvent
  return String(process.env.UNIPUSH_APPID || '').trim()
}

// ---------------------------------------------------------------------------
// 直连 Getui 的通知消息下发
//
// 为什么不用扩展库的 sendMessage：
//   uni-cloud-push 扩展库的 getPushMessage() 里，「通知消息形态」与
//   「payload 随 intent 透传」是互斥的——
//     - 不传 open_url → push_message 只能是 transmission（站内消息形态），
//       按 uni-push 2.0 的设计不创建系统通知栏，离线时也不会下发给厂商通道；
//     - 传了 open_url → push_message 变成 notification，但扩展库随即把
//       click_type 改成 "url" 并 delete intent，payload 丢失，
//       点通知栏变成用浏览器打开网页，无法跳 App 内页。
//   而 DCloud 后台推送能同时做到「通知栏 + 跳 App 内页」，是因为它自己
//   构造了 Getui 请求体，不受扩展库这层封装限制。
//
//   所以这里直接用扩展库 pushConfig 里的 appkey / mastersecret 取 token，
//   再自己拼 push_message.notification（含 click_type=intent 与 payload intent）。
//
// token 获取方式与扩展库完全一致（sha256(appkey + timestamp + mastersecret)），
// 缓存放在 opendb-tempdata，避免每次调用都换 token。
// ---------------------------------------------------------------------------

const GETUI_API_BASE = 'https://restapi.getui.com/v2'
const GETUI_TOKEN_TTL = 7200 * 1000
const GETUI_TOKEN_CACHE_ID = 'uni-push-token-'

// 取 Getui 访问 token（与扩展库 getToken 同算法）。
async function getGetuiToken(appid, pushConfig) {
  const cacheId = GETUI_TOKEN_CACHE_ID + appid
  const db = uniCloud.database()
  try {
    const cached = await db.collection('opendb-tempdata').doc(cacheId).get()
    const rec = cached && cached.data
    if (rec && rec.value && typeof rec.expired === 'number' && rec.expired > Date.now()) {
      return rec.value
    }
  } catch (err) {
    // 缓存不存在或读取失败，走下面的鉴权流程
  }
  const timestamp = Date.now()
  const sign = crypto.createHash('sha256')
    .update(pushConfig.appkey + timestamp + pushConfig.mastersecret)
    .digest('hex')
  const authRes = await uniCloud.httpclient.request(`${GETUI_API_BASE}/${appid}/auth`, {
    method: 'POST',
    contentType: 'json',
    dataType: 'json',
    data: { sign: sign, timestamp: timestamp, appkey: pushConfig.appkey }
  })
  const body = authRes && authRes.data
  if (!body || body.msg !== 'success' || !body.data || !body.data.token) {
    const msg = (body && (body.msg || body.message)) || 'unknown'
    throw new Error('获取个推 token 失败：' + msg)
  }
  const token = body.data.token
  try {
    await db.collection('opendb-tempdata').doc(cacheId).set({
      value: token,
      expired: timestamp + GETUI_TOKEN_TTL
    })
  } catch (err) {
    // 缓存失败不影响本次下发
  }
  return token
}

// 构造带 payload 的通知消息 intent（与扩展库 getPushChannel 的 intent 格式一致）。
function buildNotificationIntent(pushConfig, title, content, payloadObj, encoded) {
  const payloadText = JSON.stringify(payloadObj || {})
  // 裸 JSON 里的 {} " : 会与 intent:// URI 语法冲突，编码后由系统自动解码
  const payloadField = encoded ? encodeURIComponent(payloadText) : payloadText
  let intent = 'intent://io.dcloud.unipush/?#Intent;scheme=unipush;launchFlags=0x4000000;S.UP-OL-SU=true;'
  // package= 必须带：Getui 与小米文档的 intent 示例都带，缺了可能被判为无效 intent
  intent += `package=${pushConfig.packageName};`
  intent += `component=${pushConfig.packageName}/io.dcloud.PandoraEntry;`
  intent += `S.title=${encodeURIComponent(title)};`
  intent += `S.content=${encodeURIComponent(JSON.stringify(content))};`
  intent += `S.payload=${payloadField};`
  intent += 'S.unipush_version=2.0;'
  intent += 'end'
  return intent
}

// 直接向 Getui 下发一条通知消息（push_message.notification）。
//
// 用任务模式（/push/list/message + /push/list/cid）而不是单播（/push/single/cid）：
//   单播的语义是「此刻在线才投递」，设备离线时这条消息没有承载离线投递计划，
//   厂商通道拿不到任务，于是 App 被杀后既没通知栏、也没有任何厂商通道流量。
//   任务模式会建立一条带离线时效的推送任务，由 Getui 投给厂商通道（小米），
//   这正是 DCloud 后台推送能做到离线送达的路径。
async function sendNotificationDirect(appid, pushConfig, clientIds, title, content, payloadObj, options, opts) {
  const cfg = opts || {}
  // Getui 侧的 appid 才是 URL 里要用的那个：
  // pushConfig.appId 是个推应用 id（21 位），与 DCloud AppID（__UNI__ 开头）不是一回事，
  // 用 DCloud AppID 拼 URL 会返回 "appid is invalid"。
  const getuiAppid = pushConfig.appId || appid
  const token = await getGetuiToken(getuiAppid, pushConfig)
  const intent = buildNotificationIntent(pushConfig, title, content, payloadObj, !!cfg.payloadEncoded)
  const payloadText = JSON.stringify(payloadObj || {})
  // 点击形态三选一：
  //   intent  = 只有 intent 里带 S.payload（扩展库的做法）
  //   payload = 用 Getui 的 click_type=payload，payload 走消息体字段（启动应用）
  //   both    = 两者都带，兼容不同 ROM / SDK 版本的取值口径
  let notification
  if (cfg.clickType === 'payload') {
    notification = { title: title, body: content, click_type: 'payload', payload: payloadText }
  } else if (cfg.clickType === 'both') {
    notification = {
      title: title,
      body: content,
      click_type: 'intent',
      intent: intent,
      payload: payloadText
    }
  } else if (cfg.clickType === 'startapp') {
    // 只打开 App，不带跳转参数：厂商通道原生支持 startapp，不依赖 intent 透传。
    notification = { title: title, body: content, click_type: 'startapp' }
  } else {
    notification = { title: title, body: content, click_type: 'intent', intent: intent }
  }
  const upsOptions = {
    HW: {
      '/message/android/notification/badge/add_num': 1,
      '/message/android/notification/badge/class': 'io.dcloud.PandoraEntry'
    },
    XM: {},
    VV: {},
    OP: {}
  }
  if (options && options.android && options.android.XM) {
    Object.assign(upsOptions.XM, options.android.XM)
  }
  // 小米通道硬性要求：必须带 /extra.channel_id，否则小米侧拒收整条消息。
  // 该值是小米开放平台「消息分类」报备后拿到的通知类别 id（DCloud 后台厂商通道配置里也有）。
  const xmChannelId = String(cfg.xmChannelId || '').trim()
  if (xmChannelId) {
    upsOptions.XM['/extra.channel_id'] = xmChannelId
  }
  // settings：strategy 决定走哪条通道，ttl 决定离线保留时长。
  //   default=1 在线走个推通道 / 离线走厂商通道
  //   default=3 只走个推通道（用于验证「请求体本身能否出通知栏」）
  const settings = {}
  const strategyDefault = Number(cfg.strategyDefault || 0)
  if (strategyDefault >= 1 && strategyDefault <= 4) {
    settings.strategy = { default: strategyDefault }
  }
  const ttl = Number(cfg.ttl || 0)
  if (ttl > 0) {
    settings.ttl = ttl
  }
  const requestBody = {
    request_id: crypto.createHash('md5')
      .update(String(Date.now()) + Math.ceil(1e7 * Math.random()) + getuiAppid + clientIds.join(','))
      .digest('hex'),
    group_name: '',
    audience: { cid: clientIds },
    settings: settings,
    push_message: { notification: notification },
    push_channel: {
      ios: {
        type: 'notify',
        payload: JSON.stringify(payloadObj || {}),
        aps: {
          unipush_version: '2.0',
          alert: { title: title, body: content },
          'content-available': 0,
          sound: ''
        },
        auto_badge: '+1'
      },
      android: {
        ups: {
          notification: notification,
          options: upsOptions
        }
      }
    }
  }
  const httpOpts = {
    method: 'POST',
    headers: {
      'content-type': 'application/json;charset=UTF-8',
      token: token,
      'cache-control': 'no-cache'
    },
    contentType: 'json',
    dataType: 'json'
  }
  const post = (module, data) =>
    uniCloud.httpclient.request(`${GETUI_API_BASE}/${getuiAppid}${module}`, {
      ...httpOpts,
      data: data
    })

  // 第一步：建任务，拿到 taskid
  const msgRes = await post('/push/list/message', requestBody)
  const msgBody = msgRes && msgRes.data
  if (!msgBody || msgBody.code !== 0 || !msgBody.data || !msgBody.data.taskid) {
    return { body: msgBody, requestBody: requestBody, stage: 'list/message' }
  }
  const taskid = msgBody.data.taskid
  // 第二步：把 cid 绑到任务上
  const cidRes = await post('/push/list/cid', {
    audience: { cid: clientIds },
    taskid: taskid,
    is_async: false,
    need_alias_detail: true
  })
  return { body: cidRes && cidRes.data, requestBody: requestBody, taskid: taskid, stage: 'list/cid' }
}

// 调试用：查询任务的逐台送达明细（Getui 回执）。
async function debugReport(appid, taskid) {  const resolvedAppid = appid || String(process.env.UNIPUSH_APPID || '').trim()
  if (!resolvedAppid) return fail(-4, '云函数未配置 UNIPUSH_APPID')
  let uniPush
  try {
    uniPush = uniCloud.getPushManager({ appId: resolvedAppid })
  } catch (err) {
    return fail(-5, '获取推送管理器失败：' + ((err && err.message) || String(err)))
  }
  try {
    const detail = await uniPush.getReportDetailByTaskid(taskid)
    console.log('[unipush-send] report detail:', JSON.stringify(detail))
    return { code: 0, message: 'ok', taskid: taskid, report: detail }
  } catch (err) {
    const msg = (err && err.message) || String(err)
    console.error('[unipush-send] report detail failed:', msg)
    return fail(-7, '查询送达明细失败：' + msg)
  }
}

exports.main = async (event, context) => {
  // 调试入口：查询某次任务的逐台送达明细（Getui 侧回执）。
  // 用于定位「服务端返回 success 但设备没收到」——success 只代表入队，
  // 真正的投递结果（哪个 cid 走了哪个通道、有没有回执）要看这个接口。
  // 需要提供正确的 debug_secret 才生效。
  const rawEvent = pickEvent(event)
  // 调试入口必须用独立的密钥，不能回退到生产用的 UNIPUSH_SECRET：
  // 回退等于把生产签名密钥变成「谁都能打开调试面板」的凭据。
  const debugSecret = String(process.env.UNIPUSH_DEBUG_SECRET || '').trim()
  const debugProvided = String((rawEvent && rawEvent.debug_secret) || '').trim()
  let debugOk = false
  if (debugSecret && debugProvided) {
    const a = Buffer.from(debugSecret, 'utf8')
    const b = Buffer.from(debugProvided, 'utf8')
    debugOk = a.length === b.length && crypto.timingSafeEqual(a, b)
  }
  if (debugOk && rawEvent && rawEvent.debug_action === 'report' && rawEvent.taskid) {
    return await debugReport(String(rawEvent.appid || '').trim(), String(rawEvent.taskid).trim())
  }
  if (debugOk && rawEvent && rawEvent.debug_action === 'adminurl') {
    // 生成 DCloud 推送后台的带 token 地址（凭据在 URL 里，只回显给持有 debug 密钥的调用方）。
    let uniPush
    try {
      uniPush = uniCloud.getPushManager({ appId: resolvedAppidGuess(rawEvent) })
    } catch (err) {
      return fail(-5, '获取推送管理器失败：' + ((err && err.message) || String(err)))
    }
    try {
      const r = await uniPush.getAdminUrl()
      return { code: 0, message: 'ok', admin: r }
    } catch (err) {
      return fail(-7, '获取后台地址失败：' + ((err && err.message) || String(err)))
    }
  }
  if (debugOk && rawEvent && rawEvent.debug_action === 'cidstatus') {
    // 查 Getui 侧该 cid 的在线状态与设备信息：
    // cid 在线 → 消息走长连接；离线 → 需要厂商通道才有通知栏。
    // deviceStatus 能看出各厂商通道（xm/hw/op/vv）的注册情况。
    const cid = String((rawEvent && rawEvent.cid) || '').trim()
    if (!cid) return fail(-2, '缺少 cid')
    let uniPush
    try {
      uniPush = uniCloud.getPushManager({ appId: resolvedAppidGuess(rawEvent) })
    } catch (err) {
      return fail(-5, '获取推送管理器失败：' + ((err && err.message) || String(err)))
    }
    const out = {}
    try {
      out.client_status = await uniPush.getClientStatusByCid(cid)
    } catch (err) {
      out.client_status_error = (err && err.message) || String(err)
    }
    try {
      out.device_status = await uniPush.getDeviceStatusByCid(cid)
    } catch (err) {
      out.device_status_error = (err && err.message) || String(err)
    }
    try {
      out.client_detail = await uniPush.getClientDetailByCid(cid)
    } catch (err) {
      out.client_detail_error = (err && err.message) || String(err)
    }
    return { code: 0, message: 'ok', cid: cid, status: out }
  }
  if (debugOk && rawEvent && rawEvent.debug_action === 'direct_test') {
    // 参数化的直连 Getui 测试入口：一次部署即可跑多个变体矩阵，
    // 用来分离「请求体本身不生效」与「厂商通道侧失败」两类问题。
    // 参数：cid(s) / strategy(1..4) / ttl / xm_channel_id / title / body
    const cid = String((rawEvent && rawEvent.cid) || '').trim()
    if (!cid) return fail(-2, '缺少 cid')
    let uniPush
    let pushConfig
    try {
      uniPush = uniCloud.getPushManager({ appId: resolvedAppidGuess(rawEvent) })
      pushConfig = uniPush.pushConfig
    } catch (err) {
      return fail(-5, '获取推送管理器失败：' + ((err && err.message) || String(err)))
    }
    const title = String((rawEvent && rawEvent.title) || ('T-' + Date.now()))
    const body = String((rawEvent && rawEvent.body) || ('B-' + Date.now()))
    const payloadObj = (rawEvent && rawEvent.push_payload)
      ? (() => { try { return JSON.parse(String(rawEvent.push_payload)) } catch (e) { return { raw: String(rawEvent.push_payload) } } })()
      : { t: Date.now(), probe: 'direct_test' }
    // payload 在 intent 里是否做 URL 编码：裸 JSON 里的 {} " : 会与 intent:// URI 语法冲突
    const payloadEncoded = String((rawEvent && rawEvent.payload_encode) || '0') === '1'
    const opts = {
      strategyDefault: Number((rawEvent && rawEvent.strategy) || 0),
      ttl: Number((rawEvent && rawEvent.ttl) || 0),
      xmChannelId: String((rawEvent && rawEvent.xm_channel_id) || ''),
      payloadEncoded: payloadEncoded,
      clickType: String((rawEvent && rawEvent.click_type) || 'intent')
    }
    try {
      const r = await sendNotificationDirect(
        resolvedAppidGuess(rawEvent),
        pushConfig,
        [cid],
        title,
        body,
        payloadObj,
        { android: {} },
        opts
      )
      return { code: 0, message: 'ok', opts: opts, title: title, result: r }
    } catch (err) {
      return fail(-7, '直连下发异常：' + ((err && err.message) || String(err)))
    }
  }
  const v = verify(rawEvent)
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
    // getRequestBody: true 时扩展库会把实际发往个推的请求体挂在响应 data.requestBody 上，
    // 排查「服务端推了但设备没收到」时能直接看到 push_message / push_channel / settings 的真实取值。
    // 需在请求里带正确的 debug_secret 才会打开（见 verify）。
    uniPush = uniCloud.getPushManager({ appId: appid, getRequestBody: v.debugRequestBody })
  } catch (err) {
    const msg = (err && err.message) || String(err)
    console.error('[unipush-send] getPushManager failed:', msg)
    return fail(-5, '获取推送管理器失败：' + msg)
  }

  // 厂商通道策略（settings.strategy.default）。
  //
  // 1 = 设备在线时走个推长连接、离线时走厂商通道（默认）。
  //     直连路径给的是 push_message.notification，个推通道与厂商通道都会按
  //     「通知消息」处理并创建系统通知栏（实测：在线策略 3 秒级出通知栏，
  //     离线策略 1 由小米通道创建通知栏并唤起 App 进程）。
  // 2 = 只走厂商通道。在线设备也要等厂商通道的分钟级延迟，没有必要。
  // 3 = 只走个推长连接。离线设备彻底收不到，不要用。
  // 4 = 厂商优先，厂商失败回落个推。等价于 1 的容错版本，需要厂商策略权限。
  const strategyDefault = parseStrategyDefault(warnings)
  // force_notification 只对扩展库路径有意义（transmission 形态下让客户端自建通知栏）。
  // 直连路径用的是 notification 形态，本身就会建通知栏，不需要这个开关。
  const forceNotification = parseBoolEnv('UNIPUSH_FORCE_NOTIFICATION', true)
  // 小米通知类别 id（小米开放平台「消息分类」报备后拿到）。
  // Getui 文档标注该字段「推送时必须要设置，否则请求小米推送接口会返回失败」，
  // 但实测未传也能送达（小米按默认分类下发）。一旦申请到正式 id 就配上。
  const xmChannelId = String(process.env.UNIPUSH_XM_CHANNEL_ID || '').trim()
  // 任务模式（list/cid）：建立带离线时效的推送任务，设备离线时由厂商通道投递。
  const useTaskMode = parseBoolEnv('UNIPUSH_TASK_MODE', true)
  // payload 在 intent 里是否 URL 编码。裸 JSON 的 {} " : 与 intent:// URI 语法冲突，
  // 厂商通道点击后由系统解码，取决于 ROM 实现；编码更稳妥但需与客户端解码口径一致。
  const payloadEncoded = parseBoolEnv('UNIPUSH_PAYLOAD_ENCODE', true)
  // 点击形态：
  //   intent  = payload 只放在 intent 的 S.payload 里
  //   payload = payload 走消息体字段（click_type=payload，Getui 对在线通道的官方形态）
  //   both    = 两者都带
  const clickType = String(process.env.UNIPUSH_CLICK_TYPE || 'startapp').trim().toLowerCase()

  const messageExtras = {}
  messageExtras.settings = { strategy: { default: strategyDefault } }
  if (forceNotification) {
    messageExtras.force_notification = true
  }
  if (xmChannelId) {
    messageExtras.options = { android: { XM: { '/extra.channel_id': xmChannelId } } }
  }
  // mustReport: true 让扩展库走 /push/list/cid（任务模式）而不是 /push/single/cid（单播）。
  //
  // 为什么需要：单播（single）在语义上是「此刻设备在线才投递」，
  // 设备离线时这条消息没有承载离线投递计划，厂商通道拿不到任务，
  // 于是 App 被杀后既没通知栏、也没有任何厂商通道流量。
  // 任务模式（list）会建立一条带离线时效的任务，由 Getui 按 strategy 投给厂商通道。
  //
  // 注意：list/cid 走的是「先建任务再绑 cid」两步接口，返回值里才有 taskId；
  // 单播返回的是每台设备的即时状态。两者 errCode 都是 0 才算成功。
  if (useTaskMode) {
    messageExtras.mustReport = true
  }

  // 回显本次实际生效的下发策略，排查「服务端推了但 App 没收到通知栏」时先看这里。
  const pushMode = {
    direct_notification: parseBoolEnv('UNIPUSH_DIRECT_NOTIFICATION', true),
    strategy_default: strategyDefault,
    force_notification: forceNotification,
    xm_channel_id: xmChannelId || null,
    task_mode: useTaskMode,
    payload_encoded: payloadEncoded,
    click_type: clickType,
    note: strategyDefault === 1
      ? '在线走个推长连接 / 离线走厂商通道，两条路都会创建系统通知栏'
      : strategyDefault === 2
        ? '只走厂商通道（notification 形态，由厂商 SDK 创建通知栏）'
        : strategyDefault === 3
          ? '只走个推长连接（离线设备收不到）'
          : '厂商优先，厂商失败回落个推'
  }

  const batches = chunk(v.clientids, BATCH_SIZE)
  if (v.clientids.length > BATCH_SIZE) {
    warnings.push(`cid 共 ${v.clientids.length} 个，已按 ${BATCH_SIZE} 一批拆为 ${batches.length} 批下发`)
  }

  // 直连 Getui 发通知消息（默认开启）。
  //
  // 这是让「通知栏 + 点通知栏跳 App 内页」同时成立的关键：
  // 扩展库把这两件事做成了互斥（见 sendNotificationDirect 的注释），
  // 只有自己构造 push_message.notification 才能同时满足。
  const useDirect = parseBoolEnv('UNIPUSH_DIRECT_NOTIFICATION', true)
  // 扩展库回退（transmission 站内消息形态）：只在显式打开时启用。
  // 默认不回退——回退路径不创建系统通知栏，回退了等于业务侧以为推成功、
  // 用户却什么都收不到，不如直接失败并报警。
  const allowLegacyFallback = parseBoolEnv('UNIPUSH_LEGACY_FALLBACK', false)
  let pushConfig = null
  if (useDirect) {
    try {
      pushConfig = uniPush.pushConfig
      if (!pushConfig || !pushConfig.mastersecret || !pushConfig.appkey) {
        pushConfig = null
        warnings.push('未取到个推 appkey/mastersecret')
      }
    } catch (err) {
      pushConfig = null
      warnings.push('读取 pushConfig 失败：' + ((err && err.message) || String(err)))
    }
    if (!pushConfig && !allowLegacyFallback) {
      return fail(-8, '未取到个推 appkey/mastersecret，无法下发通知栏消息：' + warnings.join('；'))
    }
  }

  const results = []
  let sent = 0
  let failed = 0

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i]
    if (pushConfig) {
      try {
        const direct = await sendNotificationDirect(
          appid,
          pushConfig,
          batch,
          title,
          content,
          payload || {},
          xmChannelId ? { android: { XM: { '/extra.channel_id': xmChannelId } } } : null,
          { strategyDefault: strategyDefault, ttl: 7200000, xmChannelId: xmChannelId, payloadEncoded: payloadEncoded, clickType: clickType }
        )
        const body = direct.body || {}
        const code = body.code
        if (code === 0 || code === undefined || code === null) {
          sent += batch.length
          const result = { batch: i, size: batch.length, ok: true, errCode: 0, errMsg: 'success' }
          if (direct.taskid) result.taskId = direct.taskid
          if (v.debugRequestBody) result.request_body = direct.requestBody
          results.push(result)
          console.log(`[unipush-send] batch ${i} (direct notification) ok, ${batch.length} 台, taskid=${direct.taskid || ''}`)
        } else {
          failed += batch.length
          results.push({ batch: i, size: batch.length, ok: false, errCode: code, errMsg: body.msg || body.message || 'unknown' })
          console.error(`[unipush-send] batch ${i} (direct notification) failed: code=${code} msg=${body.msg || body.message}`)
        }
      } catch (err) {
        const msg = (err && err.message) || String(err)
        failed += batch.length
        results.push({ batch: i, size: batch.length, ok: false, errCode: -1, errMsg: msg })
        console.error(`[unipush-send] batch ${i} (direct notification) threw: ${msg}`)
      }
      continue
    }
    const message = {
      push_clientid: batch,
      title: title,
      content: content,
      // 用对象而非字符串：官方要求对象格式，否则离线厂商通道拿不到 payload
      payload: payload || {}
    }
    // 合并厂商通道相关参数（settings.strategy / force_notification / options）。
    // 放在 message 里而不是顶层，扩展库会据此构造 push_channel 与 push_message。
    Object.assign(message, messageExtras)
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
        // 扩展库在 getRequestBody 模式下把真实请求体挂在返回值的 requestBody 上
        // （request() 内部是 s.data.requestBody，随后 d() 把 s.data 摊平返回）
        const rawBody = res && res.requestBody
        if (rawBody) {
          results.push({ batch: i, size: batch.length, ok: true, errCode: 0, errMsg: 'success', taskId: taskId, request_body: rawBody })
        } else {
          results.push({ batch: i, size: batch.length, ok: true, errCode: 0, errMsg: 'success', taskId: taskId })
        }
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
      results: results,
      push_mode: pushMode
    })
  }

  return {
    code: 0,
    message: 'ok',
    sent: sent,
    failed: 0,
    warnings: warnings,
    results: results,
    push_mode: pushMode
  }
}
