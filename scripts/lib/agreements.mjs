/**
 * 协议正文的「构建层」：把 src/constants/agreements.ts 渲染成最终文本。
 *
 * 抽出来是因为**导出**（scripts/export-agreements.mjs）与**校验**
 * （scripts/check-agreements.mjs）必须用同一份渲染逻辑：
 * 校验脚本如果自己再写一份模板拼接，两边迟早漂移，
 * 就会出现「校验永远通过，但导出的正文是旧的」这种最坏情况。
 *
 * 为什么用 esbuild 而不是正则解析：
 *   协议正文是带插值的模板字符串（运营主体、联系方式、管辖地都从
 *   `src/constants/appInfo.ts` 注入），正则解析模板再手工拼变量极易出错。
 *   直接打包执行，拿到的是**渲染完成**的最终文本。
 */
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

/** 仓库根目录（scripts/lib → 上两级） */
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

/** 协议正文源文件 */
export const entry = path.join(root, 'src/constants/agreements.ts')

/** 协议类型（与后端 user_agreements.agreement_type 取值一致） */
export const AGREEMENT_TYPES = ['privacy_policy', 'user_agreement']

/** 包内静态 HTML 落地页（Android 原生隐私弹窗的链接目标） */
export const HTML_TARGETS = [
  { type: 'privacy_policy', file: 'privacy.html' },
  { type: 'user_agreement', file: 'user-agreement.html' },
]

/** 打包并执行一个 TS 模块 */
export async function bundleModule(entryPoint) {
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

/**
 * 渲染出协议正文集合（服务端 content.json 的数据源）。
 *
 * @returns {Promise<{mod: object, appInfo: object, payload: object}>}
 */
export async function buildPayload() {
  const mod = await bundleModule(entry)
  // 运营主体 / 联系方式 / 管辖地在 appInfo.ts，协议正文里是插值进去的
  const appInfo = await bundleModule(path.join(root, 'src/constants/appInfo.ts'))

  const payload = {
    types: AGREEMENT_TYPES.map((type) => ({
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

  return { mod, appInfo, payload }
}

/** HTML 转义 */
export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * 生成包内静态 HTML（Android 原生隐私弹窗的落地页）。
 *
 * src/androidPrivacy.json（prompt:"template"）里 <a href="static/xxx.html"> 指向的就是这两个文件。
 * 原生弹窗在 splash 阶段弹出，链接必须指向包内路径（hrefLoader=system 不支持项目内路径），
 * 所以正文必须与包内 constants/agreements.ts 同源，否则会出现
 * 「弹窗里展示的协议」与「App 内协议页展示的协议」两份内容。
 */
export function renderHtml(title, version, content) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<meta name="format-detection" content="telephone=no">
<title>${escapeHtml(title)}</title>
<style>
  html, body { margin:0; padding:0; background:#fff; }
  body {
    padding: 24px 20px 56px;
    color:#333;
    font-size:16px;
    line-height:1.85;
    -webkit-text-size-adjust:100%;
    word-break:break-word;
  }
  h1 { font-size:19px; font-weight:600; margin:0 0 6px; }
  .ver { font-size:13px; color:#999; margin-bottom:20px; }
  .doc { white-space:pre-wrap; }
</style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <div class="ver">${escapeHtml(version)}</div>
  <div class="doc">${escapeHtml(content)}</div>
</body>
</html>
`
}
