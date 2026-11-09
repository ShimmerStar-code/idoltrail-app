#!/usr/bin/env node
/**
 * 生成原生 tabBar 用的 PNG 图标（src/static/icons/tabbar/）。
 *
 * ── 为什么需要 PNG ──────────────────────────────────────────────
 * uni-app 原生 tabBar（pages.json 的 tabBar）在 App 端由**原生层**渲染，
 * 只认位图 —— SVG 不渲染。官方建议尺寸 81px * 81px，单图不超过 40kb。
 *
 * ── 为什么不直接放大 SVG ────────────────────────────────────────
 * 现有 SVG 是 32x32 viewBox，图形只占其中一部分（22~27 区间），
 * 直接缩到 81x81 会让图形偏小，且 4 个图标视觉大小不一致。
 * 这里改成「求墨迹包围盒 → 换算成以图形为中心的正方形 viewBox →
 * 渲染到 81x81」，4 个图标的最终图形长边统一为 66px（81 * 0.82）。
 *
 * ── 依赖 ────────────────────────────────────────────────────────
 * @resvg/resvg-js（纯 Rust 二进制，无系统依赖，不需要 cairo）。
 * 用法：
 *   npm i @resvg/resvg-js --no-save
 *   node scripts/gen-tabbar-icons.mjs
 *
 * 产物已入库，正常开发不需要重新跑；改 SVG 造型后才需要重跑。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const SRC_DIR = path.join(ROOT, 'src', 'static', 'icons')
const OUT_DIR = path.join(SRC_DIR, 'tabbar')

const SIZE = 81 // 官方推荐尺寸：81px * 81px
const FILL = 0.82 // 图形长边占画布的比例（留边距）

const ICONS = ['tab-event', 'tab-idol', 'tab-sub', 'tab-me']

let Resvg
try {
  ;({ Resvg } = await import('@resvg/resvg-js'))
} catch {
  console.error('缺少依赖 @resvg/resvg-js，请先执行：npm i @resvg/resvg-js --no-save')
  process.exit(1)
}

/** 光栅化 SVG，返回 RGBA 像素与尺寸 */
function rasterize(svgText, px) {
  const r = new Resvg(svgText, {
    fitTo: { mode: 'width', value: px },
    background: 'rgba(0,0,0,0)',
  })
  const img = r.render()
  return { pixels: img.pixels, width: img.width, height: img.height }
}

/**
 * 读 PNG 的 IHDR 块，拿宽高。
 *
 * PNG 结构：8 字节签名 + IHDR 块（长度4 + 类型4 + 宽4 + 高4 ...），
 * 所以宽在第 16~19 字节、高在第 20~23 字节（都是大端 uint32）。
 */
function pngSize(buffer) {
  if (buffer.length < 24) throw new Error('PNG 太短')
  const sig = buffer.subarray(0, 8)
  if (
    sig[0] !== 0x89 || sig[1] !== 0x50 || sig[2] !== 0x4e || sig[3] !== 0x47
  ) {
    throw new Error('不是合法 PNG')
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  }
}

/** 求 alpha > 0 的墨迹包围盒（返回**光栅像素**坐标） */
function inkBounds({ pixels, width, height }) {
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (pixels[(y * width + x) * 4 + 3] > 0) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) throw new Error('图标全透明')
  return { minX, minY, maxX, maxY }
}

/**
 * 换一个 viewBox：以墨迹包围盒为中心、长边为 max(w,h)/FILL 的正方形区域。
 *
 * 这样渲染到 SIZE x SIZE 画布时，图形长边恰好占 SIZE * FILL，
 * 且图形在画布中居中 —— 4 个图标视觉大小一致。
 *
 * ⚠️ 关键：viewBox 用的是 **SVG 用户单位**（本项目源文件是 32x32 viewBox），
 *    而 inkBounds 求出的是**光栅像素**坐标（324x324 空间）。
 *    两者差一个缩放比，必须换算回去 —— 直接把像素坐标塞进 viewBox 会渲染出空白图。
 */
function buildCroppedSvg(svgText, bounds, rasterSize) {
  const vb = readViewBox(svgText)
  const scale = rasterSize / vb.width // 光栅像素 / 用户单位
  const minX = bounds.minX / scale
  const minY = bounds.minY / scale
  const maxX = bounds.maxX / scale
  const maxY = bounds.maxY / scale

  const w = maxX - minX + 1 / scale
  const h = maxY - minY + 1 / scale
  const side = Math.max(w, h) / FILL
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  const viewBox = `${cx - side / 2} ${cy - side / 2} ${side} ${side}`

  return svgText.replace(/<svg\b([^>]*)>/, (_m, attrs) => {
    const kept = attrs
      .replace(/\s*width="[^"]*"/, '')
      .replace(/\s*height="[^"]*"/, '')
      .replace(/\s*viewBox="[^"]*"/, '')
    return `<svg${kept} width="${SIZE}" height="${SIZE}" viewBox="${viewBox}">`
  })
}

/** 读出源 SVG 的 viewBox */
function readViewBox(svgText) {
  const m = svgText.match(/viewBox="([^"]+)"/)
  if (!m) throw new Error('SVG 缺少 viewBox')
  const [, , w, h] = m[1].trim().split(/\s+/).map(Number)
  return { x: 0, y: 0, width: w, height: h }
}

/** 生成一张 PNG */
function renderIcon(svgPath, outPath) {
  const svgText = fs.readFileSync(svgPath, 'utf8')
  // 第一遍：高分辨率光栅化，只为求墨迹包围盒
  const rasterSize = SIZE * 4
  const probe = rasterize(svgText, rasterSize)
  const bounds = inkBounds(probe)
  // 第二遍：换 viewBox 后渲染到目标尺寸
  const finalSvg = buildCroppedSvg(svgText, bounds, rasterSize)
  const r = new Resvg(finalSvg, {
    fitTo: { mode: 'width', value: SIZE },
    background: 'rgba(0,0,0,0)',
  })
  fs.writeFileSync(outPath, r.render().asPng())
  return bounds
}

fs.mkdirSync(OUT_DIR, { recursive: true })
for (const ic of ICONS) {
  for (const variant of ['', '-active']) {
    const svgFile = path.join(SRC_DIR, `${ic}${variant}.svg`)
    const outFile = path.join(OUT_DIR, `${ic}${variant}.png`)
    const b = renderIcon(svgFile, outFile)
    const w = b.maxX - b.minX + 1
    const h = b.maxY - b.minY + 1
    // 自检：产物必须是 SIZE x SIZE 的合法 PNG，且体积不能小得离谱。
    // viewBox 换算错一个缩放比就会渲染出近乎空白的 PNG，而空白图在原生
    // tabBar 上表现为「文字在、图标不见了」，很难一眼看出原因。
    const buf = fs.readFileSync(outFile)
    const dim = pngSize(buf)
    if (dim.width !== SIZE || dim.height !== SIZE) {
      throw new Error(
        `${ic}${variant}.png 尺寸异常（${dim.width}x${dim.height}，应为 ${SIZE}x${SIZE}）`,
      )
    }
    if (buf.length < 800) {
      throw new Error(
        `${ic}${variant}.png 只有 ${buf.length} 字节，几乎是空白图，渲染有问题`,
      )
    }
    console.log(
      `${ic}${variant}.png  ${buf.length} bytes  ${dim.width}x${dim.height}  源墨迹 ${w}x${h}`,
    )
  }
}
console.log('输出目录:', path.relative(ROOT, OUT_DIR))
