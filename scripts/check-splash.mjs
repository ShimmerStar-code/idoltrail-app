/**
 * 启动图守卫：校验 src/manifest.json 里配的启动图确实是**设计交付的九宫格成品**。
 *
 * 背景
 * ----
 * 启动图是原生层资源（Activity 的 windowBackground），普通 PNG 会被系统按 fill 铺满窗口，
 * 图与屏比例不一致就必然拉伸变形（Redmi K40 / 1080x2460 上旧整屏图被纵向拉伸 1.307 倍）。
 * 现在用的是 **.9.png（九宫格）**：固定区 = 品牌锁定图（1:1 不变形），四周为可拉伸渐变底，
 * 官方明确支持（https://uniapp.dcloud.net.cn/tutorial/app-splashscreen.html）。
 *
 * 校验项
 * ------
 *   1. manifest 的 splashscreen.android 三档都指向预期文件
 *   2. 文件是合法 PNG，尺寸 = 内容尺寸 + 2（1px 九宫格边框）
 *   3. md5 与 EXPECTED_MD5 一致（字节级未被改动）
 *   4. 九宫格边框标记正确（aapt2 语义）：
 *      - **上边**黑段 = 水平可拉伸列、**左边**黑段 = 垂直可拉伸行（都允许多段），
 *        且恰好覆盖「品牌区之外」
 *      - **下边/右边**是 padding，aapt2 只允许单段；本图内容铺满整张、没有 padding，
 *        所以这两边必须**一个黑像素都没有**（画了就会编译失败：
 *        "too many padding sections on bottom border."）
 *      - 四个角点保持透明
 *      （整圈描黑会让整张图都变成可拉伸区，品牌图就会跟着变形）
 *
 * 用法：npm run check:splash
 */
import { createHash } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inflateSync } from 'node:zlib'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * 期望的启动图。品牌锁定图按 res/drawable-{桶}/splash_brand.png 原件居中：
 *   hdpi   300x380  -> 内容 480x800
 *   xhdpi  400x506  -> 内容 720x1440
 *   xxhdpi 600x759  -> 内容 1080x2400
 * brand 字段 = 内容坐标系里的品牌固定区 [x0,x1) x [y0,y1)，该区不可拉伸。
 */
const EXPECTED = {
  'app-icons/splash-9patch/hdpi/splash.9.png': {
    md5: '2f06bd1d80c280b193bea368df9db372',
    contentWidth: 480,
    contentHeight: 800,
    brand: { x0: 90, x1: 390, y0: 210, y1: 590 },
  },
  'app-icons/splash-9patch/xhdpi/splash.9.png': {
    md5: '6142ee671c292047e148f4ff535ffe7b',
    contentWidth: 720,
    contentHeight: 1440,
    brand: { x0: 160, x1: 560, y0: 467, y1: 973 },
  },
  'app-icons/splash-9patch/xxhdpi/splash.9.png': {
    md5: '828d45347d6f48190345f0d3a0dc2723',
    contentWidth: 1080,
    contentHeight: 2400,
    brand: { x0: 240, x1: 840, y0: 820, y1: 1579 },
  },
}

/** 读 PNG IHDR 里的实际宽高（字节级判断，不依赖任何图像库）。 */
function readPngSize(buf) {
  if (buf.length < 24) return null
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  if (!buf.subarray(0, 8).equals(sig)) return null
  if (buf.subarray(12, 16).toString('latin1') !== 'IHDR') return null
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}

/**
 * 最小 PNG 解码（8bit，colorType 0/2/4/6，非隔行）：只为读九宫格边框那两行/两列像素。
 * 返回 { width, height, channels, pixels }，pixels 为逐行字节缓冲。
 */
function decodePng(buf) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  if (!buf.subarray(0, 8).equals(sig)) return null
  let off = 8
  let ihdr = null
  const idat = []
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off)
    const type = buf.subarray(off + 4, off + 8).toString('latin1')
    const data = buf.subarray(off + 8, off + 8 + len)
    if (type === 'IHDR') {
      ihdr = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        interlace: data[12],
      }
    } else if (type === 'IDAT') {
      idat.push(data)
    } else if (type === 'IEND') {
      break
    }
    off += 12 + len
  }
  if (!ihdr) return null
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[ihdr.colorType]
  if (!channels || ihdr.bitDepth !== 8 || ihdr.interlace !== 0) return null
  const raw = inflateSync(Buffer.concat(idat))
  const bpp = channels
  const stride = ihdr.width * bpp
  const pixels = Buffer.alloc(ihdr.height * stride)
  let pos = 0
  for (let y = 0; y < ihdr.height; y++) {
    const ft = raw[pos++]
    const line = raw.subarray(pos, pos + stride)
    pos += stride
    const cur = pixels.subarray(y * stride, (y + 1) * stride)
    const prev = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : null
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0
      const b = prev ? prev[x] : 0
      const c = prev && x >= bpp ? prev[x - bpp] : 0
      let v = line[x]
      if (ft === 1) v = (v + a) & 0xff
      else if (ft === 2) v = (v + b) & 0xff
      else if (ft === 3) v = (v + ((a + b) >> 1)) & 0xff
      else if (ft === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a)
        const pb = Math.abs(p - b)
        const pc = Math.abs(p - c)
        v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff
      } else if (ft !== 0) {
        throw new Error(`不支持的 PNG 行过滤器 ${ft}`)
      }
      cur[x] = v
    }
  }
  return { width: ihdr.width, height: ihdr.height, channels, pixels }
}

/** 取某像素的 [r,g,b,a]（colorType 0/2/4/6 统一归一到 rgba）。 */
function pixelAt(img, x, y) {
  const { channels, pixels, width } = img
  const i = (y * width + x) * channels
  switch (channels) {
    case 1:
      return [pixels[i], pixels[i], pixels[i], 255]
    case 2:
      return [pixels[i], pixels[i], pixels[i], pixels[i + 1]]
    case 3:
      return [pixels[i], pixels[i + 1], pixels[i + 2], 255]
    default:
      return [pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3]]
  }
}

const isBlack = ([r, g, b, a]) => a >= 128 && r < 64 && g < 64 && b < 64
const isTransparent = ([, , , a]) => a < 128

/** 把布尔序列压成区间数组。 */
function runs(flags) {
  const out = []
  let start = null
  for (let i = 0; i < flags.length; i++) {
    if (flags[i] && start === null) start = i
    if (!flags[i] && start !== null) {
      out.push([start, i - 1])
      start = null
    }
  }
  if (start !== null) out.push([start, flags.length - 1])
  return out
}

/**
 * 校验九宫格边框标记。
 * 约定（aapt2 / AOSP NinePatchPeeker 规则）：
 *   顶行（第 0 行）黑段 = 水平可拉伸的**内容列**（边框列 x 对应内容列 x-1），允许多段
 *   左列（第 0 列）黑段 = 垂直可拉伸的**内容行**（边框行 y 对应内容行 y-1），允许多段
 *   底行 / 右列 = 内容区 padding，**最多 1 段**；本图内容铺满整张，没有 padding，
 *   所以这两边必须完全没有黑段（多段黑 → aapt2 报 "too many padding sections"，
 *   单段黑也意味着内容区被内缩，会多出一圈边框）。
 *   四个角点保持透明。
 */
function checkNinePatch(img, expect) {
  const { contentWidth: cw, contentHeight: ch, brand } = expect
  const W = cw + 2
  const H = ch + 2

  const topBlack = []
  const bottomBlack = []
  const leftBlack = []
  const rightBlack = []
  for (let x = 0; x < W; x++) {
    topBlack.push(isBlack(pixelAt(img, x, 0)))
    bottomBlack.push(isBlack(pixelAt(img, x, H - 1)))
  }
  for (let y = 0; y < H; y++) {
    leftBlack.push(isBlack(pixelAt(img, 0, y)))
    rightBlack.push(isBlack(pixelAt(img, W - 1, y)))
  }

  // 期望：品牌区之外可拉伸（边框坐标 1..contentWidth / 1..contentHeight）
  const expectTop = [
    [1, brand.x0],
    [brand.x1 + 1, cw],
  ]
  const expectLeft = [
    [1, brand.y0],
    [brand.y1 + 1, ch],
  ]
  const gotTop = runs(topBlack)
  const gotBottom = runs(bottomBlack)
  const gotLeft = runs(leftBlack)
  const gotRight = runs(rightBlack)

  const problems = []
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b)
  if (!eq(gotTop, expectTop)) problems.push(`顶行黑段 ${JSON.stringify(gotTop)} ≠ 期望 ${JSON.stringify(expectTop)}`)
  if (!eq(gotLeft, expectLeft)) problems.push(`左列黑段 ${JSON.stringify(gotLeft)} ≠ 期望 ${JSON.stringify(expectLeft)}`)
  if (gotBottom.length) {
    problems.push(
      `底行有 ${gotBottom.length} 段黑 ${JSON.stringify(gotBottom)}（aapt2 只允许 1 段：` +
        'too many padding sections on bottom border；本图无 padding，底行必须无黑）',
    )
  }
  if (gotRight.length) {
    problems.push(
      `右列有 ${gotRight.length} 段黑 ${JSON.stringify(gotRight)}（aapt2 只允许 1 段：` +
        'too many padding sections on right border；本图无 padding，右列必须无黑）',
    )
  }

  for (const [x, y] of [[0, 0], [W - 1, 0], [0, H - 1], [W - 1, H - 1]]) {
    if (!isTransparent(pixelAt(img, x, y))) problems.push(`角点 (${x},${y}) 不是透明像素`)
  }
  return problems
}

/** manifest.json 是 JSONC（带注释），JSON.parse 会炸，这里做最小化的注释剥离。 */
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
  let manifest = null
  try {
    const raw = readFileSync(manifestPath, 'utf8').replace(/^\uFEFF/, '')
    manifest = JSON.parse(stripJsonComments(raw))
  } catch (e) {
    fail(`src/manifest.json 不是合法 JSON：${e.message}`)
  }

  const splashscreen = manifest?.['app-plus']?.distribute?.splashscreen ?? null
  const android = splashscreen?.android ?? null

  if (!android) {
    fail('src/manifest.json 缺少 app-plus.distribute.splashscreen.android')
  } else {
    for (const bucket of ['hdpi', 'xhdpi', 'xxhdpi']) {
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
      if (!rel.endsWith('.9.png')) {
        fail(`${bucket} 档必须是 .9.png（aapt2 只对 *.9.png 编译 nine-patch chunk）：${rel}`)
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
      if (size.width !== expect.contentWidth + 2 || size.height !== expect.contentHeight + 2) {
        fail(
          `${bucket} 档尺寸不符：${rel} 实际 ${size.width}x${size.height}，` +
            `期望 ${expect.contentWidth + 2}x${expect.contentHeight + 2}（内容 + 1px 九宫格边框）`,
        )
        continue
      }
      const actual = md5(buf)
      if (actual !== expect.md5) {
        fail(
          `${bucket} 档启动图被改动过（要求字节级锁定）：${rel}\n` +
            `       实际 md5 ${actual}\n       期望 md5 ${expect.md5}`,
        )
        continue
      }
      let img = null
      try {
        img = decodePng(buf)
      } catch (e) {
        fail(`${bucket} 档 PNG 解码失败：${rel}（${e.message}）`)
        continue
      }
      if (!img) {
        fail(`${bucket} 档 PNG 格式不支持（需 8bit 非隔行）：${rel}`)
        continue
      }
      const problems = checkNinePatch(img, expect)
      if (problems.length) {
        fail(`${bucket} 档九宫格边框标记不正确：${rel}\n       - ${problems.join('\n       - ')}`)
        continue
      }
      console.log(
        `[OK] ${bucket.padEnd(6)} ${basename(rel)} ${size.width}x${size.height} ` +
          `md5=${actual} 固定区=${expect.brand.x1 - expect.brand.x0}x${expect.brand.y1 - expect.brand.y0}`,
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
  console.error('\n启动图守卫未通过')
} else {
  console.log('\n启动图守卫通过：三档均为字节级锁定的九宫格成品，边框标记正确')
}
