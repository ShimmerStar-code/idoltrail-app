/**
 * 把 App 端的《隐私政策》《用户协议》正文导出为 JSON，交给后端作为**公开可访问**的协议正文。
 *
 * 为什么要导出：
 *   国内 App 上架（华为/小米/OPPO/vivo 等应用市场）要求隐私政策与用户协议有
 *   **独立、可公开访问的 URL**，审核时会被机器抓取校验。App 内的
 *   `src/pages/agreement/detail.vue` 只有装上 App 才能看到，不满足该要求。
 *   后端 `GET /api/v1/public/agreements` 提供同一份正文，运营后台的
 *   /privacy 与 /agreement 页面也读它，三处内容天然一致。
 *
 * 渲染逻辑在 scripts/lib/agreements.mjs，与 scripts/check-agreements.mjs 共用同一份：
 * 校验脚本若自己再拼一次模板，两边迟早漂移，就会出现
 * 「校验永远通过、但导出的正文是旧的」这种最坏情况。
 *
 * 除了后端 content.json，本脚本还会生成两份**包内静态 HTML**：
 *   src/static/privacy.html
 *   src/static/user-agreement.html
 *
 * 这两份是 Android 原生隐私弹窗（src/androidPrivacy.json，prompt=template）
 * 里 <a href="static/xxx.html"> 的落地页。原生弹窗在 splash 阶段弹出，
 * 链接只能指向包内路径（hrefLoader=system 不支持项目内路径），
 * 所以正文必须与包内 constants/agreements.ts 同源，否则会出现
 * 「弹窗里展示的协议」与「App 内协议页展示的协议」两份内容。
 *
 * 用法：
 *   npm run export:agreements              # 写入 ../idoltrail-server-main/internal/agreements/content.json
 *   npm run export:agreements -- --out x.json --stdout
 *   npm run export:agreements -- --html-only  # 只生成包内静态 HTML
 *
 * 改完 src/constants/agreements.ts 后必须重跑一次，否则后端、App、原生弹窗三处正文会漂移。
 * 跑完可用 `npm run check:agreements` 验证三处确实同源。
 */
import fs from 'node:fs'
import path from 'node:path'
import { buildPayload, HTML_TARGETS, renderHtml, root } from './lib/agreements.mjs'

const args = process.argv.slice(2)
const outIdx = args.indexOf('--out')
const outFile = outIdx >= 0 ? path.resolve(args[outIdx + 1]) : null
const toStdout = args.includes('--stdout')
const htmlOnly = args.includes('--html-only')

const { mod, payload } = await buildPayload()
const json = JSON.stringify(payload, null, 2) + '\n'

function writeStaticHtml() {
  const dir = path.join(root, 'src/static')
  fs.mkdirSync(dir, { recursive: true })
  for (const t of HTML_TARGETS) {
    const target = path.join(dir, t.file)
    const html = renderHtml(
      mod.getAgreementTitle(t.type),
      mod.getAgreementVersion(t.type),
      mod.getAgreementText(t.type),
    )
    fs.writeFileSync(target, html, 'utf8')
    console.log(`[export:agreements] 已写入 ${target}`)
  }
}

if (htmlOnly) {
  writeStaticHtml()
} else if (toStdout) {
  process.stdout.write(json)
} else {
  const target =
    outFile ||
    path.resolve(root, '../idoltrail-server-main/internal/agreements/content.json')
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, json, 'utf8')
  console.log(`[export:agreements] 已写入 ${target}`)
  for (const t of payload.types) {
    console.log(`  - ${t.type} ${t.version}  ${t.title}  ${t.content.length} 字`)
  }
  writeStaticHtml()
}
