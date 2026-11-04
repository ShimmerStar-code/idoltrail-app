#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
生成 Android 启动图（.9.png 九宫格）。

设计意图
--------
**不加工设计稿**：渐变的三个色标、内容图、排版比例，全部取自设计交付的素材：

  - 渐变：#FFE39A → #FCA8B3(30%) → #9C5B87，对角方向（左上→右下）
    —— 与 android/.../drawable/splash_background.xml（angle=315）及
       fullscreen/*.png 实测一致（顶行左黄右粉、底行深紫，行内色差最大 144）。
  - 内容：app-icons/splash-brand/<密度>/splash_brand_full.png（真透明底品牌图）

为什么用 .9.png 而不是整屏 PNG
---------------------------
启动图是**原生层**资源（Activity 的 windowBackground），Bitmap 会被系统按 **fill**
铺满窗口 → 图片比例 ≠ 屏幕比例就必然拉伸变形（早期整屏 PNG 实测：16:9 屏被压扁 20%）。

DCloud 官方口径（https://uniapp.dcloud.net.cn/tutorial/app-splashscreen）：
    「存在很多不同分辨率的手机，导致启动图在一些不常见的设备会进行拉伸或压缩引起变形」
    「使用.9.png的优点：1. 避免在非标准分辨率手机上缩放变形」

关键点：**九宫格的拉伸区由系统缩放固定区边缘像素填充**（不是填纯色），
所以把「渐变」放在固定区之外当作拉伸区，被延展的是渐变本身 → 颜色连续、无色带；
而固定区里的品牌图逐像素不变 → 不会变形。

九宫格标记（已对照 AOSP frameworks/base/tools/aapt2/compile/Png.cpp 确认）
--------------------------------------------------------------------
  - 文件尺寸 = 内容尺寸 + 2（四边各 1px 标记边，内容在 (1,1)..(w-2,h-2)）
  - 4 个角必须透明或纯白
  - **顶边**黑像素 = 该**列**可水平拉伸；**左边**黑像素 = 该**行**可垂直拉伸
  - 底边 / 右边 = padding（取 0）；支持多段不连续标记

依赖：Python 3 + Pillow
用法：python scripts/build-splash.py
"""

import os
import sys

try:
    from PIL import Image
except ImportError:
    sys.exit('需要 Pillow：pip install Pillow')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICONS = os.path.join(ROOT, 'app-icons')
BRAND_DIR = os.path.join(ICONS, 'splash-brand')
OUT_DIR = os.path.join(ICONS, 'splash-9patch')
PREVIEW_DIR = os.path.join(OUT_DIR, 'preview')

# 设计交付的渐变色标（values/colors.xml）
GRAD_START = (255, 227, 154)     # #FFE39A
GRAD_MID = (252, 168, 179)       # #FCA8B3
GRAD_END = (156, 91, 135)        # #9C5B87
GRAD_MID_T = 0.30                # 中间色在渐变轴上的位置

# (启动图密度桶, 内容区尺寸, 素材密度桶, 文件名)
# 内容区尺寸取官方提示值（hdpi 480x762 / xhdpi 720x1242 / xxhdpi 1080x1882）：
# 同密度桶的设备分辨率本来就接近内容区尺寸，所以每个桶的拉伸量都在几百 px 内，
# 渐变被延展的比例很小，观感与设计整屏图基本一致。
TIERS = [
    ('hdpi', 480, 762, 'hdpi', 'splash-android-hdpi-480x762.9.png'),
    ('xhdpi', 720, 1242, 'xhdpi', 'splash-android-xhdpi-720x1242.9.png'),
    ('xxhdpi', 1080, 1882, 'xxhdpi', 'splash-android-xxhdpi-1080x1882.9.png'),
]

BRAND_W_RATIO = 0.88      # 品牌图宽度 / 内容宽（须留出固定区四周的拉伸空间）
PAD_RATIO = 0.045         # 固定区四周留白 / 内容宽
ALPHA_CROP = 8            # 裁掉透明边时用的 alpha 阈值


def lerp(c1, c2, t):
    return tuple(c1[i] + (c2[i] - c1[i]) * t for i in range(3))


def grad_color(t):
    """渐变轴上位置 t(0..1) 的颜色。"""
    if t <= GRAD_MID_T:
        return lerp(GRAD_START, GRAD_MID, t / GRAD_MID_T)
    return lerp(GRAD_MID, GRAD_END, (t - GRAD_MID_T) / (1 - GRAD_MID_T))


def gradient_background(w, h):
    """对角渐变（左上→右下），每行从 c(t0) 线性过渡到 c(t1)。"""
    im = Image.new('RGB', (w, h))
    px = im.load()
    total = w + h
    for y in range(h):
        c0 = grad_color(y / total)
        c1 = grad_color((y + w) / total)
        row = []
        for x in range(w):
            t = x / w
            row.append((int(c0[0] + (c1[0] - c0[0]) * t),
                        int(c0[1] + (c1[1] - c0[1]) * t),
                        int(c0[2] + (c1[2] - c0[2]) * t)))
        px.putdata if False else None
        for x, c in enumerate(row):
            px[x, y] = c
    return im


def load_brand(bucket):
    """读取透明底品牌图并裁掉透明边。"""
    path = os.path.join(BRAND_DIR, bucket, 'splash_brand_full.png')
    im = Image.open(path).convert('RGBA')
    px = im.load()
    W, H = im.size
    xs, ys = [], []
    for y in range(H):
        for x in range(W):
            if px[x, y][3] > ALPHA_CROP:
                xs.append(x)
                ys.append(y)
    if not xs:
        sys.exit(f'品牌图没有内容：{path}')
    return im.crop((min(xs), min(ys), max(xs), max(ys)))


def build_tier(brand, content_w, content_h, filename):
    """渐变背景 + 居中品牌图 → 固定区；固定区之外的渐变作为拉伸区。"""
    bg = gradient_background(content_w, content_h).convert('RGBA')

    bw = int(content_w * BRAND_W_RATIO)
    bh = max(1, int(bw * brand.size[1] / brand.size[0]))
    if bh > content_h - 4:
        bh = content_h - 4
        bw = max(1, int(bh * brand.size[0] / brand.size[1]))
    scaled = brand.resize((bw, bh), Image.LANCZOS)
    bx = (content_w - bw) // 2
    by = (content_h - bh) // 2
    bg.paste(scaled, (bx, by), scaled)

    # 固定区 = 品牌图 bbox + 留白（必须留出上下左右拉伸区，否则无拉伸空间）
    pad = int(content_w * PAD_RATIO)
    c0 = bx - pad
    c1 = bx + bw - 1 + pad
    r0 = by - pad
    r1 = by + bh - 1 + pad
    # 四边都必须留出拉伸空间，否则目标分辨率变化时内容会被拉伸变形
    assert c0 >= 2 and c1 <= content_w - 3, f'水平拉伸空间不足：c0={c0} c1={c1}'
    assert r0 >= 2 and r1 <= content_h - 3, f'垂直拉伸空间不足：r0={r0} r1={r1}'

    # 加 1px 标记边
    fw, fh = content_w + 2, content_h + 2
    canvas = Image.new('RGBA', (fw, fh), (0, 0, 0, 0))
    canvas.paste(bg, (1, 1), bg)
    cx = canvas.load()

    # 顶边：固定列区间透明，其余黑色（可水平拉伸）
    for x in range(1, fw - 1):
        cx[x, 0] = (0, 0, 0, 0) if (c0 <= x - 1 <= c1) else (0, 0, 0, 255)
    # 左边：固定行区间透明，其余黑色（可垂直拉伸）
    for y in range(1, fh - 1):
        cx[0, y] = (0, 0, 0, 0) if (r0 <= y - 1 <= r1) else (0, 0, 0, 255)
    # 底边 / 右边 / 四角：全透明（padding = 0）
    for x in range(fw):
        cx[x, fh - 1] = (0, 0, 0, 0)
    for y in range(fh):
        cx[fw - 1, y] = (0, 0, 0, 0)
    cx[0, 0] = (0, 0, 0, 0)

    path = os.path.join(OUT_DIR, filename)
    canvas.save(path, 'PNG')
    return path, (bw, bh), (c0, c1, r0, r1), (bx, by, bx + bw - 1, by + bh - 1)


# ---------- 自检：按 aapt2 规则解析标记，模拟 SkNinePatch 拉伸 ----------

def is_black(p):
    return p[3] == 255 and p[0] == 0 and p[1] == 0 and p[2] == 0


def parse_divs(path):
    im = Image.open(path).convert('RGBA')
    px = im.load()
    fw, fh = im.size
    xdivs, state = [], 0
    for i in range(1, fw - 1):
        if is_black(px[i, 0]):
            if state in (0, 2):
                xdivs += [i - 1, fw - 2]
                state = 1
        elif state == 1:
            xdivs[-1] = i - 1
            state = 2
    ydivs, state = [], 0
    for i in range(1, fh - 1):
        if is_black(px[0, i]):
            if state in (0, 2):
                ydivs += [i - 1, fh - 2]
                state = 1
        elif state == 1:
            ydivs[-1] = i - 1
            state = 2
    return im.crop((1, 1, fw - 1, fh - 1)), xdivs, ydivs, fw, fh


def compute_layout(divs, src_len, target_len):
    """AOSP SkNinePatch.computeRects：固定段保原尺寸，拉伸段按源宽比例分配剩余空间。"""
    if not divs:
        return [('fix', 0, src_len, 0, target_len)]
    fixed = divs[0]
    for i in range(0, len(divs) - 2, 2):
        fixed += divs[i + 2] - divs[i + 1]
    fixed += src_len - divs[-1]
    stretch_total = sum(divs[i + 1] - divs[i] for i in range(0, len(divs), 2))
    remaining = target_len - fixed
    segs, pos, allocated = [], 0, None
    segs.append(('fix', 0, divs[0], pos, pos + divs[0] - 1))
    pos += divs[0]
    for i in range(0, len(divs), 2):
        if i > 0:
            gap = divs[i] - divs[i - 1]
            segs.append(('fix', divs[i - 1], divs[i], pos, pos + gap - 1))
            pos += gap
        src_w = divs[i + 1] - divs[i]
        dst_w = int(remaining * src_w / stretch_total) if allocated is None else remaining - allocated
        allocated = (allocated or 0) + dst_w
        segs.append(('stretch', divs[i], divs[i + 1], pos, pos + dst_w - 1))
        pos += dst_w
    tail = src_len - divs[-1]
    segs.append(('fix', divs[-1], src_len, pos, pos + tail - 1))
    pos += tail
    assert pos == target_len, f'布局宽度 {pos} != {target_len}'
    return segs


def render(content, xdivs, ydivs, tw, th):
    """模拟 SkNinePatch：固定段原样，拉伸段由边缘像素延展。"""
    W, H = content.size
    hsegs = compute_layout(xdivs, W, tw)
    vsegs = compute_layout(ydivs, H, th)
    out = Image.new('RGBA', (tw, th))
    cpx, opx = content.load(), out.load()
    for (_, ty0, ty1, dy0, dy1) in vsegs:
        for (_, tx0, tx1, dx0, dx1) in hsegs:
            # 直接按当前下标换算源坐标（不能用累积递增，否则会滞后一行）
            for dy in range(dy0, dy1 + 1):
                sy = ty0 + (dy - dy0) * (ty1 - 1 - ty0) // max(1, (dy1 - dy0))
                for dx in range(dx0, dx1 + 1):
                    sx = tx0 + (dx - dx0) * (tx1 - 1 - tx0) // max(1, (dx1 - dx0))
                    opx[dx, dy] = cpx[sx, sy]
    return out


def find_fixed_target(segs, lo, hi):
    """在布局结果里找到覆盖源区间 [lo,hi] 的固定段，返回它在目标图中的区间。"""
    for (kind, s0, s1, d0, d1) in segs:
        if kind == 'fix' and s0 <= lo and hi <= s1:
            return d0, d1
    return None


def seam_check(out, hsegs, vsegs, fixed, tol=6):
    """固定区与拉伸区交界的颜色跳变像素数（应接近 0，否则会有色带）。

    注意必须用**目标图坐标**找边界：固定段在源图里的位置不等于它在目标图里的位置。"""
    c0, c1, r0, r1 = fixed
    px = out.load()
    W, H = out.size
    hx = find_fixed_target(hsegs, c0, c1)
    vy = find_fixed_target(vsegs, r0, r1)
    if hx is None or vy is None:
        return -1
    x0, x1 = hx
    y0, y1 = vy
    bad = 0
    for x in range(x0, x1 + 1):
        if y0 - 1 >= 0 and max(abs(px[x, y0 - 1][i] - px[x, y0][i]) for i in range(3)) > tol:
            bad += 1
        if y1 + 1 < H and max(abs(px[x, y1][i] - px[x, y1 + 1][i]) for i in range(3)) > tol:
            bad += 1
    for y in range(y0, y1 + 1):
        if x0 - 1 >= 0 and max(abs(px[x0 - 1, y][i] - px[x0, y][i]) for i in range(3)) > tol:
            bad += 1
        if x1 + 1 < W and max(abs(px[x1, y][i] - px[x1 + 1, y][i]) for i in range(3)) > tol:
            bad += 1
    return bad


def verify_pixels(content, out, xdivs, ydivs, hsegs, vsegs, brand_box):
    """逐像素比对：品牌图区域在渲染结果里必须与源图**完全一致**（不变形的硬证据）。

    固定段在源图与目标图之间是恒等映射：
        源 x = xdivs[1] + k  →  目标 x = hx0 + k
    """
    bx0, by0, bx1, by1 = brand_box
    hx = find_fixed_target(hsegs, xdivs[1], xdivs[2])
    vy = find_fixed_target(vsegs, ydivs[1], ydivs[2])
    if hx is None or vy is None:
        return -1, -1
    hx0, _ = hx
    vy0, _ = vy
    cpx, opx = content.load(), out.load()
    diff = 0
    checked = 0
    for sy in range(by0, by1 + 1):
        ty = vy0 + (sy - ydivs[1])
        if ty < 0 or ty >= out.size[1]:
            continue
        for sx in range(bx0, bx1 + 1):
            tx = hx0 + (sx - xdivs[1])
            if tx < 0 or tx >= out.size[0]:
                continue
            checked += 1
            a = cpx[sx, sy][:3]
            b = opx[tx, ty][:3]
            if a != b:
                diff += 1
    return checked, diff


# 各密度档的真实目标分辨率（设备按 dpi 选桶）
CHECKS = {
    'hdpi': [(480, 800), (480, 854), (480, 960)],
    'xhdpi': [(720, 1280), (720, 1440), (720, 1600)],
    'xxhdpi': [(1080, 1920), (1080, 2340), (1080, 2400), (1080, 2460),
               (1080, 2640), (1440, 3200)],
}

PREVIEWS = [
    ('xxhdpi', 1080, 2460, 'preview-1080x2460.png'),
    ('xxhdpi', 1080, 1920, 'preview-1080x1920.png'),
    ('xhdpi', 720, 1280, 'preview-720x1280.png'),
]


def main():
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass
    os.makedirs(OUT_DIR, exist_ok=True)
    os.makedirs(PREVIEW_DIR, exist_ok=True)
    print('渐变 #FFE39A → #FCA8B3@30% → #9C5B87（对角，左上→右下）')

    failed = False
    contents = {}
    for tier, fw_expect, fh_expect, bucket, filename in TIERS:
        brand = load_brand(bucket)
        content_w, content_h = fw_expect - 2, fh_expect - 2
        path, size, fixed, brand_box = build_tier(brand, content_w, content_h, filename)
        im = Image.open(path)
        assert im.size == (fw_expect, fh_expect), f'{filename} 尺寸 {im.size} != {(fw_expect, fh_expect)}'
        print(f'\n[{tier}] {filename}  文件 {im.size[0]}x{im.size[1]}（内容 {content_w}x{content_h}）')
        print(f'      品牌图 {brand.size[0]}x{brand.size[1]} → {size[0]}x{size[1]}  '
              f'固定列 [{fixed[0]},{fixed[1]}] 固定行 [{fixed[2]},{fixed[3]}]')

        content, xdivs, ydivs, fw, fh = parse_divs(path)
        contents[tier] = (content, xdivs, ydivs, fixed)
        print(f'      xDivs={xdivs}  yDivs={ydivs}')

        for tw, th in CHECKS[tier]:
            fixed_w = xdivs[0] + (xdivs[2] - xdivs[1]) + (content_w - xdivs[-1])
            fixed_h = ydivs[0] + (ydivs[2] - ydivs[1]) + (content_h - ydivs[-1])
            if fixed_w > tw or fixed_h > th:
                print(f'      - {tw}x{th}: 目标小于固定区，现实中不会发生（密度分档不同）')
                continue
            out = render(content, xdivs, ydivs, tw, th)
            hsegs = compute_layout(xdivs, content_w, tw)
            vsegs = compute_layout(ydivs, content_h, th)
            bad = seam_check(out, hsegs, vsegs, fixed)
            checked, diff = verify_pixels(content, out, xdivs, ydivs, hsegs, vsegs, brand_box)
            ok = (bad == 0 and diff == 0)
            print(f'      {"[OK]" if ok else "[FAIL]"} {tw}x{th}: '
                  f'品牌图逐像素比对 {checked} px，差异 {diff}；接缝跳变 {bad} 像素')
            if not ok:
                failed = True

    for tier, tw, th, name in PREVIEWS:
        content, xdivs, ydivs, fixed = contents[tier]
        out = render(content, xdivs, ydivs, tw, th)
        p = os.path.join(PREVIEW_DIR, name)
        out.convert('RGB').save(p, 'PNG')
        print(f'预览 {p}')

    print('\n' + ('[FAIL] 有检查未通过' if failed else '[OK] 生成完成'))
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
