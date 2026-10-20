#!/usr/bin/env node
/**
 * 环境配置守卫：.env.dev 与 .env.prod 必须是同一套字段，只有取值可以不同。
 *
 * 为什么需要：
 *   1. 字段漂移是这类双份配置最常见的坑 —— 在 .env.dev 加了新开关却忘了在
 *      .env.prod 加，生产构建就会静默回退到 src/utils/env.ts 里的默认值，
 *      而那个默认值往往是「关闭」，表现为「功能在测试环境好好的，上线就没了」。
 *      这类问题在构建期发现不了，只能等真机验证时才暴露。
 *   2. .env.dev / .env.prod 都会入库，只允许出现 VITE_ 前缀的变量。
 *      Vite 只会把 VITE_* 注入 import.meta.env，其余变量写在这里毫无作用，
 *      却容易被误当成「已经配好了」的凭据。
 *
 * 刻意**不**检查 .env：那是 uniCloud 云函数的环境变量文件，
 * 里面是 UNIVERIFY_* / UNIPUSH_* 明文密钥，DCloud 约定文件名不能改，
 * 且已 gitignore，与前端构建配置无关。
 */
import { readFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// 必须入库的构建配置，两份字段集合必须一致
const DEV_FILE = '.env.dev'
const PROD_FILE = '.env.prod'
// 只校验「看起来像环境变量赋值」的行（KEY=VALUE），注释与空行放行
const KEY_RE = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/

const problems = []

function readFields(file) {
  const path = resolve(root, file)
  if (!existsSync(path)) {
    problems.push(`${file} 不存在 —— dev/prod 两份配置必须都在`)
    return new Map()
  }
  const raw = readFileSync(path)
  // BOM 必须为零：dotenv 解析时会把 BOM 当成首个变量名的一部分，
  // 于是第一个变量名会带上一个不可见的 BOM 字符，读不到值且没有任何报错，
  // 表现为「配置明明写了却不生效」。项目约定源文件一律 UTF-8 无 BOM。
  if (raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf) {
    problems.push(`${file} 带有 UTF-8 BOM —— 首个变量会解析失败，请存为 UTF-8 无 BOM`)
  }
  const fields = new Map()
  raw
    .toString('utf8')
    .split(/\r?\n/)
    .forEach((line, i) => {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) return
      const m = trimmed.match(KEY_RE)
      if (!m) return
      const [, key, value] = m
      if (fields.has(key)) {
        problems.push(`${file}:${i + 1}  变量 "${key}" 重复定义`)
        return
      }
      fields.set(key, { value: value.trim(), line: i + 1 })
    })
  return fields
}

const dev = readFields(DEV_FILE)
const prod = readFields(PROD_FILE)

// 1) 双端字段集合必须完全一致
if (dev.size && prod.size) {
  const onlyDev = [...dev.keys()].filter((k) => !prod.has(k))
  const onlyProd = [...prod.keys()].filter((k) => !dev.has(k))
  onlyDev.forEach((k) => {
    const meta = dev.get(k)
    problems.push(`${DEV_FILE}:${meta.line}  "${k}" 只在 dev 定义，${PROD_FILE} 缺失`)
  })
  onlyProd.forEach((k) => {
    const meta = prod.get(k)
    problems.push(`${PROD_FILE}:${meta.line}  "${k}" 只在 prod 定义，${DEV_FILE} 缺失`)
  })
  if (!onlyDev.length && !onlyProd.length) {
    console.log(`[env-check] dev/prod 字段一致（${dev.size} 个）`)
  }
}

// 2) 入库文件只允许 VITE_ 前缀
for (const [file, fields] of [[DEV_FILE, dev], [PROD_FILE, prod]]) {
  for (const [key, meta] of fields) {
    if (!key.startsWith('VITE_')) {
      problems.push(
        `${file}:${meta.line}  非 VITE_ 变量 "${key}"\n` +
          `      Vite 只注入 VITE_* 到 import.meta.env，写在这里不会有任何效果`
      )
    } else if (meta.value === '') {
      problems.push(`${file}:${meta.line}  "${key}" 取值为空，确认是刻意的还是漏填`)
    }
  }
}

if (problems.length) {
  console.error('[env-check] 环境配置检查未通过：\n')
  problems.forEach((p) => console.error('  ' + p))
  console.error('')
  process.exit(1)
}

console.log('[env-check] 环境配置检查通过')
