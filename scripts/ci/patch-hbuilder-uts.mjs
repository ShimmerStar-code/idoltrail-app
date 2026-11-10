import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const hbuilderRoot = resolve(process.argv[2] || '')
const compilerPath = resolve(process.argv[3] || '')
if (!hbuilderRoot || !compilerPath) throw new Error('需要 HBuilderX 目录和 UTS 编译器绝对路径')
if (!existsSync(compilerPath)) throw new Error(`UTS 编译器不存在：${compilerPath}`)

const target = resolve(
  hbuilderRoot,
  'plugins/uniapp-cli-vite/node_modules/@dcloudio/uni-cli-shared/dist/uts.js',
)
if (!existsSync(target)) throw new Error(`HBuilder UTS 解析文件不存在：${target}`)
const source = readFileSync(target, 'utf8')
const pattern = /compilerPath = require\.resolve\('@dcloudio\/uni-uts-v1',\s*\{[\s\S]*?\}\);/
if (!pattern.test(source)) throw new Error('未找到 HBuilder 的 UTS fallback，补丁未应用')
const patched = source.replace(
  pattern,
  `compilerPath = require.resolve(${JSON.stringify(compilerPath)});`,
)
writeFileSync(target, patched)
console.log(`HBuilder UTS fallback 已固定到 ${compilerPath}`)
