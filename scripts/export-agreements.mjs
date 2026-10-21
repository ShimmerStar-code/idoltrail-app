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
 * 为什么要用 esbuild 而不是正则解析：
 *   协议正文是带插值的模板字符串（运营主体、联系方式、管辖地都从
 *   `src/constants/appInfo.ts` 注入），正则解析模板再手工拼变量极易出错。
 *   直接打包执行，拿到的是**渲染完成**的最终文本。
 *
 * 用法：
 *   npm run export:agreements              # 写入 ../idoltrail-server-main/internal/agreements/content.json
 *   npm run export:agreements -- --out x.json --stdout
 *
 * 改完 src/constants/agreements.ts 后必须重跑一次，否则后端与 App 正文会漂移。
 */
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const entry = path.join(root, 'src/constants/agreements.ts')

const args = process.argv.slice(2)
const outIdx = args.indexOf('--out')
const outFile = outIdx >= 0 ? path.resolve(args[outIdx + 1]) : null
const toStdout = args.includes('--stdout')

// 1. 打包 TS 模块（连带解析 @/ 别名与 appInfo 依赖）
async function bundleModule(entryPoint) {
  const result = await build({
    entryPoints: [entryPoint],
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
    logLevel: 'silent',
    alias: { '@': path.join(root, 'src') },
  })
  const code = result.outputFiles[0].text
  return import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))
}

const mod = await bundleModule(entry)
// 运营主体 / 联系方式 / 管辖地在 appInfo.ts，协议正文里是插值进去的
const appInfo = await bundleModule(path.join(root, 'src/constants/appInfo.ts'))

const types = ['privacy_policy', 'user_agreement']
const payload = {
  // 与后端 user_agreements 表里的 agreement_type 取值一致
  types: types.map((type) => ({
    type,
    title: mod.getAgreementTitle(type),
    version: mod.getAgreementVersion(type),
    content: mod.getAgreementText(type),
  })),
  release_date: mod.POLICY_RELEASE_DATE,
  privacy_version: mod.PRIVACY_VERSION,
  agreement_version: mod.AGREEMENT_VERSION,
  company: appInfo.APP_COMPANY ?? '',
  region: appInfo.APP_REGION ?? '',
  contact_email: appInfo.CONTACT_EMAIL ?? '',
  // 便于人工核对来源
  source: 'idoltrail-app/src/constants/agreements.ts',
  generated_by: 'idoltrail-app/scripts/export-agreements.mjs',
}

const json = JSON.stringify(payload, null, 2) + '\n'

if (toStdout) {
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
}
