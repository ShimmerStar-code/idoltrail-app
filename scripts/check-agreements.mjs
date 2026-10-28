#!/usr/bin/env node
/**
 * 协议版本锁 + 同源校验。
 *
 * 一、版本号强制锁定 v1.0.0
 *
 *   「锁定」不是靠口头约定，而是靠**构建期卡门**：任何一处版本号不是
 *   v1.0.0 都直接让 CI 变红。
 *
 *   为什么必须锁死（这不是「懒得改」，是三处硬约束）：
 *     1) 服务端的「当前生效版本」来自 internal/agreements/content.json
 *        （go:embed 编译进镜像），登录时用它查 user_agreements 签署记录。
 *        App 上报的版本与服务端当前版本**必须完全一致**，否则查不到那条记录，
 *        表现为「每次登录都判定未签协议并要求重新勾选」（这条链路历史上踩过一次）。
 *     2) user_agreements 的唯一键是 (user_id, agreement_type, version)。
 *        版本号漂移 = 全部历史签署记录瞬间失配。
 *     3) 递增版本会让存量用户的隐私同意失效（hasPrivacyConsent 比对当前生效版本），
 *        下次启动集体重新弹窗。
 *
 *   所以：**政策正文可以修订，版本号不动。**
 *   修订后跑 `npm run export:agreements` 让包内正文、服务端 content.json、
 *   包内静态 HTML 三处同源即可。
 *
 * 二、同源校验（防漂移）
 *
 *   合规红线是「政策与实际行为一致」。改了 src/constants/agreements.ts 的正文却
 *   忘了跑导出，会出现三份不同的隐私政策：
 *     - App 内协议页显示包内正文
 *     - 应用市场抓取的公开 URL 显示服务端 content.json
 *     - Android 原生弹窗链接指向的包内静态 HTML
 *   本脚本把这三处逐字节比对，任何一处对不上就失败。
 *
 * 用法：
 *   npm run check:agreements
 *
 * CI 中若不存在同级后端仓库（../idoltrail-server-main），跨仓那一项自动跳过，
 * 只校验 App 仓内的版本锁与静态 HTML 同源。
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import {
  AGREEMENT_TYPES,
  HTML_TARGETS,
  buildPayload,
  renderHtml,
  root,
} from './lib/agreements.mjs'

/** 被锁定的协议版本号。改这里 = 显式声明「协议版本变更」 */
const LOCKED_VERSION = 'v1.0.0'

/** 服务端 content.json 路径（跨仓，CI 中可能不存在） */
const SERVER_CONTENT = path.resolve(
  root,
  '../idoltrail-server-main/internal/agreements/content.json',
)

const problems = []

function fail(msg) {
  problems.push(msg)
}

// ── 1) App 端版本锁 ──────────────────────────────────────────────
const { mod, payload } = await buildPayload()

if (mod.PRIVACY_VERSION !== LOCKED_VERSION) {
  fail(
    `src/constants/agreements.ts 的 PRIVACY_VERSION = "${mod.PRIVACY_VERSION}"，` +
      `必须锁定为 "${LOCKED_VERSION}"`,
  )
}
if (mod.AGREEMENT_VERSION !== LOCKED_VERSION) {
  fail(
    `src/constants/agreements.ts 的 AGREEMENT_VERSION = "${mod.AGREEMENT_VERSION}"，` +
      `必须锁定为 "${LOCKED_VERSION}"`,
  )
}
for (const type of AGREEMENT_TYPES) {
  const v = mod.getAgreementVersion(type)
  if (v !== LOCKED_VERSION) {
    fail(`getAgreementVersion("${type}") = "${v}"，必须锁定为 "${LOCKED_VERSION}"`)
  }
}

// ── 2) 原生隐私弹窗版本必须跟政策版本一致 ────────────────────────
// androidPrivacy.json 的 version 决定原生模板弹窗是否重新弹出。
// 它与政策版本不是同一个东西，但必须同步：政策版本变了、原生弹窗版本没变，
// 会出现「原生认为已同意过、JS 认为没同意」的错位。
const androidPrivacyPath = path.join(root, 'src/androidPrivacy.json')
if (!existsSync(androidPrivacyPath)) {
  fail('src/androidPrivacy.json 不存在 —— 原生隐私弹窗配置不能缺')
} else {
  let ap = null
  try {
    ap = JSON.parse(readFileSync(androidPrivacyPath, 'utf8'))
  } catch (e) {
    fail(`src/androidPrivacy.json 不是合法 JSON：${e.message}`)
  }
  if (ap && ap.version !== mod.PRIVACY_VERSION) {
    fail(
      `src/androidPrivacy.json 的 version = "${ap.version}"，` +
        `与隐私政策版本 "${mod.PRIVACY_VERSION}" 不一致`,
    )
  }
}

// ── 3) 包内静态 HTML 与正文同源 ──────────────────────────────────
// 这两个文件是 Android 原生弹窗（prompt=template）的链接落地页，
// 忘了重新生成 = 商店审核看到的协议与 App 内看到的协议不一致。
for (const t of HTML_TARGETS) {
  const file = path.join(root, 'src/static', t.file)
  if (!existsSync(file)) {
    fail(`src/static/${t.file} 不存在 —— 请运行 npm run export:agreements`)
    continue
  }
  const expected = renderHtml(
    mod.getAgreementTitle(t.type),
    mod.getAgreementVersion(t.type),
    mod.getAgreementText(t.type),
  )
  const actual = readFileSync(file, 'utf8')
  if (actual !== expected) {
    fail(`src/static/${t.file} 与当前正文不同源 —— 请运行 npm run export:agreements`)
  }
}

// ── 4) 服务端 content.json 与 App 端同源（跨仓，缺仓则跳过） ──────
if (!existsSync(SERVER_CONTENT)) {
  console.log(`[agreement-check] 未找到后端仓库，跳过跨仓校验（${SERVER_CONTENT}）`)
} else {
  let server = null
  try {
    server = JSON.parse(readFileSync(SERVER_CONTENT, 'utf8'))
  } catch (e) {
    fail(`服务端 content.json 不是合法 JSON：${e.message}`)
  }
  if (server) {
    if (server.privacy_version !== LOCKED_VERSION) {
      fail(
        `服务端 content.json 的 privacy_version = "${server.privacy_version}"，` +
          `必须锁定为 "${LOCKED_VERSION}"`,
      )
    }
    if (server.agreement_version !== LOCKED_VERSION) {
      fail(
        `服务端 content.json 的 agreement_version = "${server.agreement_version}"，` +
          `必须锁定为 "${LOCKED_VERSION}"`,
      )
    }
    const serverTypes = new Map((server.types || []).map((t) => [t.type, t]))
    for (const t of payload.types) {
      const st = serverTypes.get(t.type)
      if (!st) {
        fail(`服务端 content.json 缺少 ${t.type}`)
        continue
      }
      if (st.version !== LOCKED_VERSION) {
        fail(
          `服务端 content.json 的 ${t.type} 版本 = "${st.version}"，` +
            `必须锁定为 "${LOCKED_VERSION}"`,
        )
      }
      if (st.content !== t.content) {
        fail(
          `服务端 content.json 的 ${t.type} 正文与 App 端不一致 —— ` +
            `请运行 npm run export:agreements`,
        )
      }
    }
  }
}

if (problems.length) {
  console.error('[agreement-check] 协议版本锁 / 同源检查未通过：\n')
  problems.forEach((p) => console.error('  ' + p))
  console.error('')
  process.exit(1)
}

console.log(`[agreement-check] 协议版本锁定 ${LOCKED_VERSION}，包内与服务端同源`)
