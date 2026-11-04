/**
 * 启动图守卫：校验 src/manifest.json 里配的启动图确实是设计交付原图的**字节级副本**。
 *
 * 背景：
 *   启动图是原生层资源（Activity 的 windowBackground），Bitmap 被系统按 fill 铺满窗口，
 *   图与屏比例不一致就必然拉伸变形。上一版翻车的根因不是「拉伸」，而是**图本身被改过**
 *   （半透明品牌图叠自算渐变重合成 → logo 区比例失真）。
 *
 *   本方案的原则：**零像素改动**。三张图必须是设计交付包 fullscreen/ 里的原件，
 *   md5 一旦变化就说明有人重新编码/重合成过，必须拦下。
 *
 * 校验项：
 *   1. manifest 的 distribute.splashscreen.android 三档路径都存在
 *   2. 每张图的 PNG 实际尺寸与文件名声明一致
 *   3. 每张图的 md5 与 EXPECTED_MD5 表一致（字节级未被改动）
 *
 * 用法：npm run check:splash
 */
import { createHash } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * 期望的启动图（md5 + 尺寸）。
 * 选取依据：每个密度桶选该桶最常见屏幕比例的那张，残余 fill 畸变压到 5% 以内。
 *   xxhdpi 1080x2400（20:9）：K40 1080x2460 上相对畸变 1.0250（纵向 2.5%）
 *   xhdpi  720x1440（18:9）：1280 与 1600 各差 11%
 *   hdpi   480x800（16:9）：854 差 6.7%
 */
const EXPECTED = {
  'app-icons/splash-fullscreen/splash_1080x2400.png': {
    md5: 'd26f4f4fe168071cc0db7dd72d506a72',
    width: 1080,
    height: 2400,
  },
  'app-icons/splash-fullscreen/splash_720x1440.png': {
    md5: 'f937aba82c8de3823db284b08ae9996d',
    width: 720,
    height: 1440,
  },
  'app-icons/splash-fullscreen/splash_480x800.png': {
    md5: '72ac986ed852eef0c41fcff2c910f68a',
    width: 480,
    height: 800,
  },
}

/**
 * 读 PNG IHDR 里的实际宽高（字节级判断，不依赖任何图像库）。
 */
function readPngSize(buf) {
  if (buf.length < 24) return null
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  if (!buf.subarray(0, 8).equals(sig)) return null
  if (buf.subarray(12, 16).toString('latin1') !== 'IHDR') return null
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}

/**
 * manifest.json 是 JSONC（带 /* *\/ 注释），JSON.parse 直接会炸。
 * 这里做最小化的注释剥离：只处理字符串外的块注释与行注释，保留字符串内容原样。
 */
function stripJsonComments(text) {
  let out = ''
  let i = 0
  let inString = false
  while (i < text.length) {
    const ch = text[i]
    const next = text[i + 1]
    if (inString) {
      out += ch
      if (ch === '\\') {
        out += next ?? ''
        i += 2
        continue
      }
      if (ch === '"') inString = false
      i += 1
      continue
    }
    if (ch === '"') {
      inString = true
      out += ch
      i += 1
      continue
    }
    if (ch === '/' && next === '*') {
      const end = text.indexOf('*/', i + 2)
      i = end === -1 ? text.length : end + 2
      continue
    }
    if (ch === '/' && next === '/') {
      let end = text.indexOf('\n', i)
      if (end === -1) end = text.length
      i = end
      continue
    }
    out += ch
    i += 1
  }
  return out
}

function md5(buf) {
  return createHash('md5').update(buf).digest('hex')
}

function fail(msg) {
  console.error(`[FAIL] ${msg}`)
  process.exitCode = 1
}

const manifestPath = resolve(ROOT, 'src/manifest.json')
if (!existsSync(manifestPath)) {
  fail(`找不到 src/manifest.json（${manifestPath}）`)
} else {
  let manifest
  try {
    const raw = readFileSync(manifestPath, 'utf8').replace(/^\uFEFF/, '')
    manifest = JSON.parse(stripJsonComments(raw))
  } catch (e) {
    fail(`src/manifest.json 不是合法 JSON：${e.message}`)
    manifest = null
  }

  const splashscreen = manifest?.['app-plus']?.distribute?.splashscreen ?? null
  const android = splashscreen?.android ?? null

  if (!android) {
    fail('src/manifest.json 缺少 app-plus.distribute.splashscreen.android')
  } else {
    const buckets = ['hdpi', 'xhdpi', 'xxhdpi']
    for (const bucket of buckets) {
      const rel = android[bucket]
      if (!rel) {
        fail(`启动图缺少 ${bucket} 档配置`)
        continue
      }
      const expect = EXPECTED[rel]
      if (!expect) {
        fail(`${bucket} 档指向了预期外的文件：${rel}`)
        continue
      }
      const abs = resolve(ROOT, rel)
      if (!existsSync(abs)) {
        fail(`${bucket} 档文件不存在：${rel}`)
        continue
      }
      const buf = readFileSync(abs)
      const size = readPngSize(buf)
      if (!size) {
        fail(`${bucket} 档文件不是合法 PNG：${rel}`)
        continue
      }
      if (size.width !== expect.width || size.height !== expect.height) {
        fail(
          `${bucket} 档尺寸不符：${rel} 实际 ${size.width}x${size.height}，` +
            `期望 ${expect.width}x${expect.height}`,
        )
        continue
      }
      const actual = md5(buf)
      if (actual !== expect.md5) {
        fail(
          `${bucket} 档启动图被改动过（要求零像素改动）：${rel}\n` +
            `       实际 md5 ${actual}\n       期望 md5 ${expect.md5}`,
        )
        continue
      }
      console.log(
        `[OK] ${bucket.padEnd(6)} ${basename(rel)} ${size.width}x${size.height} md5=${actual}`,
      )
    }

    const style = splashscreen?.androidStyle
    if (style !== 'default') {
      fail(
        `app-plus.splashscreen.androidStyle 必须是 "default"，当前为 ${JSON.stringify(style)}；` +
          '取 "common" 时按密度配的启动图整个不生效',
      )
    } else {
      console.log('[OK] androidStyle = default')
    }
  }
}

if (process.exitCode) {
  console.error('\n启动图守卫未通过。')
} else {
  console.log('\n启动图守卫通过：三档均为设计交付原图的字节级副本。')
}
