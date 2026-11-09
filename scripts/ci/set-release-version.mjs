import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const tag = process.argv[2] || process.env.RELEASE_TAG || ''
const root = resolve(process.argv[3] || process.cwd())
const matched = tag.match(/^v(\d+)\.(\d+)\.(\d+)$/)
if (!matched) throw new Error(`发布 tag 必须为 v主版本.次版本.修订号，当前为 ${tag || '(空)'}`)

const parts = matched.slice(1).map(Number)
if (parts.some((value) => value > 999)) throw new Error('版本号的每一段不能超过 999')
const versionName = parts.join('.')
const versionCode = parts[0] * 1000000 + parts[1] * 1000 + parts[2]
const manifestPath = resolve(root, 'src/manifest.json')
const appInfoPath = resolve(root, 'src/constants/appInfo.ts')
let manifest = readFileSync(manifestPath, 'utf8')
let appInfo = readFileSync(appInfoPath, 'utf8')
const currentCode = Number(manifest.match(/"versionCode"\s*:\s*"(\d+)"/)?.[1])
if (!Number.isFinite(currentCode)) throw new Error('无法读取 manifest.json 的 versionCode')
if (versionCode <= currentCode) {
  throw new Error(`versionCode 必须递增：当前 ${currentCode}，${tag} 计算为 ${versionCode}`)
}

const replacements = [
  [/"versionName"\s*:\s*"[^"]*"/, `"versionName" : "${versionName}"`],
  [/"versionCode"\s*:\s*"[^"]*"/, `"versionCode" : "${versionCode}"`],
]
for (const [pattern, replacement] of replacements) {
  if (!pattern.test(manifest)) throw new Error(`manifest.json 缺少字段：${pattern}`)
  manifest = manifest.replace(pattern, replacement)
}
const appVersionPattern = /export const APP_VERSION_NAME\s*=\s*'[^']*'/
if (!appVersionPattern.test(appInfo)) throw new Error('appInfo.ts 缺少 APP_VERSION_NAME')
appInfo = appInfo.replace(appVersionPattern, `export const APP_VERSION_NAME = '${versionName}'`)

writeFileSync(manifestPath, manifest)
writeFileSync(appInfoPath, appInfo)

function publish(name, value) {
  const text = `${name}=${value}\n`
  for (const file of [process.env.GITHUB_OUTPUT, process.env.GITHUB_ENV]) {
    if (file) writeFileSync(file, text, { flag: 'a' })
  }
}
publish('RELEASE_VERSION', versionName)
publish('RELEASE_VERSION_CODE', String(versionCode))
publish('name', versionName)
publish('code', String(versionCode))
console.log(`发布版本：${versionName}（versionCode ${versionCode}）`)
