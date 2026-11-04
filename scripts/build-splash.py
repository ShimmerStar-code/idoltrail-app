#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
生成 Android 启动图（.9.png 九宫格）并自检「不变形」。

为什么要 .9.png
--------------
启动图在 Android 上是**原生层**资源（Activity 的 windowBackground），不是前端页面：

- windowBackground 引用的 Bitmap 会被系统按 **fill** 铺满窗口 → 图片比例与屏幕比例
  不一致时必然被拉伸变形。
- 我们早期用的是 852x1846（19.5:9）的整屏 PNG：在 16:9 屏上被横向压扁 20%，
  在 20:9 屏上纵向拉长 3%，logo 与文字明显变形（真机实测确认）。

DCloud 官方口径（https://uniapp.dcloud.net.cn/tutorial/app-splashscreen）：

    「目前HBuilderX中仅定义几种标准分辨率的启动图配置，而实际上存在很多不同分辨率的手机，
      导致启动图在一些不常见的设备会进行拉伸或压缩引起变形」
    「使用.9.png的优点：1. 避免在非标准分辨率手机上缩放变形」

九宫格怎么用（已对照 AOSP 源码确认）
------------------------------------
构建期由 aapt2 解析源 .9.png 的黑边标记（frameworks/base/tools/aapt2/compile/Png.cpp）：

  - 文件尺寸 = 内容尺寸 + 2（四边各 1px 是标记边，内容在 (1,1)..(w-2,h-2)）
  - 4 个角必须透明或纯白
  - **顶边** → getHorizontalTicks → xDivs：黑色像素标记「该**列**可水平拉伸」
  - **左边** → getVerticalTicks → yDivs：黑色像素标记「该**行**可垂直拉伸」
  - 底边 / 右边 → padding（留 0）
  - multipleAllowed = true → **支持多段不连续标记」

本脚本的布局：

  - 前景（品牌图：花朵 logo + idoltrail 字样 + 标语）放在**固定区**：
    顶边在前景列区间留透明、其余标黑；左边在前景行区间留透明、其余标黑。
  - 四周大片**纯色**（品牌深紫 #9C5B87）落在可拉伸区 →
    任意屏幕比例都由纯色吸收，logo 与文字**逐像素不变**。

为什么不用整屏渐变图
--------------------
设计交付的整屏启动图（渐变底 #FFE39A → #FCA8B3 → #9C5B87 + 居中 logo）
**不能用九宫格**：渐变放进可拉伸区会因横向/纵向拉伸产生明显色带接缝；
若整张图都放固定区，屏幕比例不同时又会被裁切。

原生的正确做法是 layer-list（渐变 shape 背景 + 居中 bitmap），
但 uni-app 云打包的 windowBackground 由 DCloud 生成、我们改不了原生 theme，
所以走「纯色底 + 透明底品牌图 + 九宫格」这条可控路径：
品牌图素材见 app-icons/splash-brand/<密度>/splash_brand_full.png（真透明底，无需抠图）。

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

# 品牌深紫（设计稿渐变的末端色，同时用作 androidNavigationBarColor）
BRAND = (156, 91, 135)
BRAND_HEX = '#9C5B87'

# (启动图密度桶, 官方提示尺寸, 素材密度桶, 文件名)
# 官方提示尺寸：hdpi 480x762 / xhdpi 720x1242 / xxhdpi 1080x1882
# （官方提示「切忌上传多张同尺寸启动图」）
TIERS = [
    ('hdpi', 480, 762, 'hdpi', 'splash-android-hdpi-480x762.9.png'),
    ('xhdpi', 720, 1242, 'xhdpi', 'splash-android-xhdpi-720x1242.9.png'),
    ('xxhdpi', 1080, 1882, 'xxhdpi', 'splash-android-xxhdpi-1080x1882.9.png'),
]

CONTENT_W_RATIO = 0.62      # 品牌图宽度 / 内容宽
PAD_RATIO = 0.065           # 固定区四周留白 / 内容宽
ALPHA_CROP = 8              # 裁掉透明边时用的 alpha 阈值


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
    bb = (min(xs), min(ys), max(xs), max(ys))
    return im.crop(bb), bb


def build_tier(brand, content_w, content_h, filename):
    """品牌图等比缩放后贴到纯色底上，生成 .9.png。"""
    k = content_w * CONTENT_W_RATIO / brand.size[0]
    scaled = brand.resize((max(1, int(brand.size[0] * k)), max(1, int(brand.size[1] * k))),
                          Image.LANCZOS)

    fw, fh = content_w + 2, content_h + 2
    canvas = Image.new('RGBA', (fw, fh), (0, 0, 0, 0))
    cx = canvas.load()
    for y in range(1, fh - 1):
        for x in range(1, fw - 1):
            cx[x, y] = (BRAND[0], BRAND[1], BRAND[2], 255)

    fx = (content_w - scaled.size[0]) // 2
    fy = (content_h - scaled.size[1]) // 2
    canvas.paste(scaled, (fx + 1, fy + 1), scaled)

    fg_left = fx
    fg_right = fx + scaled.size[0] - 1
    fg_top = fy
    fg_bottom = fy + scaled.size[1] - 1

    pad = int(content_w * PAD_RATIO)
    c0 = max(0, fg_left - pad)
    c1 = min(content_w - 1, fg_right + pad)
    r0 = max(0, fg_top - pad)
    r1 = min(content_h - 1, fg_bottom + pad)

    # 顶边：前景列区间透明（固定），其余黑色（可水平拉伸）
    for x in range(1, fw - 1):
        cx[x, 0] = (0, 0, 0, 0) if (c0 <= x - 1 <= c1) else (0, 0, 0, 255)
    # 左边：前景行区间透明（固定），其余黑色（可垂直拉伸）
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
    return path, scaled.size, (c0, c1, r0, r1)


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
    """AOSP SkNinePatch.computeRects：固定段保原尺寸，拉伸段按源宽比例分配剩余空间。
    divs 为半开区间对 [l, r)。"""
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
    W, H = content.size
    hsegs = compute_layout(xdivs, W, tw)
    vsegs = compute_layout(ydivs, H, th)
    out = Image.new('RGBA', (tw, th))
    cpx, opx = content.load(), out.load()
    for (_, ty0, ty1, dy0, dy1) in vsegs:
        for (_, tx0, tx1, dx0, dx1) in hsegs:
            sy = ty0
            for dy in range(dy0, dy1 + 1):
                sx = tx0
                for dx in range(dx0, dx1 + 1):
                    opx[dx, dy] = cpx[sx, sy]
                    if dx < dx1:
                        sx = tx0 + (dx - dx0) * (tx1 - 1 - tx0) // max(1, (dx1 - dx0))
                if dy < dy1:
                    sy = ty0 + (dy - dy0) * (ty1 - 1 - ty0) // max(1, (dy1 - dy0))
    return out


def fg_bbox(im):
    px = im.load()
    W, H = im.size
    xs, ys = [], []
    for y in range(H):
        for x in range(W):
            p = px[x, y]
            if abs(p[0] - BRAND[0]) + abs(p[1] - BRAND[1]) + abs(p[2] - BRAND[2]) > 12:
                xs.append(x)
                ys.append(y)
    if not xs:
        return None
    return min(xs), max(xs), min(ys), max(ys)


# 各密度档的真实目标分辨率（设备按 dpi 选桶）
CHECKS = {
    'hdpi': [(480, 800), (480, 854)],
    'xhdpi': [(720, 1280), (720, 1600)],
    'xxhdpi': [(1080, 1920), (1080, 2340), (1080, 2400), (1080, 2460),
               (1080, 2640), (1440, 3200)],
}

# 预览输出（模拟铺满真机效果，给人工看）
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
    print(f'品牌底色 {BRAND_HEX}（设计稿渐变末端色）')

    failed = False
    contents = {}
    for tier, fw_expect, fh_expect, bucket, filename in TIERS:
        brand, _ = load_brand(bucket)
        content_w, content_h = fw_expect - 2, fh_expect - 2
        path, size, fixed = build_tier(brand, content_w, content_h, filename)
        im = Image.open(path)
        assert im.size == (fw_expect, fh_expect), f'{filename} 尺寸 {im.size} != 官方提示 {(fw_expect, fh_expect)}'
        print(f'\n[{tier}] {filename}  文件 {im.size[0]}x{im.size[1]}（内容 {content_w}x{content_h}）')
        print(f'      品牌图 {brand.size[0]}x{brand.size[1]} → 前景 {size[0]}x{size[1]}  '
              f'固定列 [{fixed[0]},{fixed[1]}] 固定行 [{fixed[2]},{fixed[3]}]')

        content, xdivs, ydivs, fw, fh = parse_divs(path)
        contents[tier] = (content, xdivs, ydivs)
        bb2 = fg_bbox(content)
        if bb2 is None:
            print('      [FAIL] 没有前景像素')
            failed = True
            continue
        fx0, fx1, fy0, fy1 = bb2
        sx = sum(1 for c in range(fx0, fx1 + 1)
                 if any(xdivs[i] <= c < xdivs[i + 1] for i in range(0, len(xdivs), 2)))
        sy = sum(1 for r in range(fy0, fy1 + 1)
                 if any(ydivs[i] <= r < ydivs[i + 1] for i in range(0, len(ydivs), 2)))
        print(f'      xDivs={xdivs}  yDivs={ydivs}')
        print(f'      前景 bbox {fx1-fx0+1}x{fy1-fy0+1}；落在拉伸区的像素 水平={sx} 垂直={sy}（须均为 0）')
        if sx or sy:
            failed = True

        for tw, th in CHECKS[tier]:
            fixed_w = xdivs[0] + (xdivs[2] - xdivs[1]) + (content_w - xdivs[-1])
            fixed_h = ydivs[0] + (ydivs[2] - ydivs[1]) + (content_h - ydivs[-1])
            if fixed_w > tw or fixed_h > th:
                print(f'      - {tw}x{th}: 目标小于固定区，现实中不会发生（密度分档不同）')
                continue
            out = render(content, xdivs, ydivs, tw, th)
            bb3 = fg_bbox(out)
            w_out = bb3[1] - bb3[0] + 1
            h_out = bb3[3] - bb3[2] + 1
            same = (w_out, h_out) == (fx1 - fx0 + 1, fy1 - fy0 + 1)
            print(f'      {"[OK]" if same else "[FAIL]"} {tw}x{th}: 前景 {w_out}x{h_out}'
                  f'（源 {fx1-fx0+1}x{fy1-fy0+1}）{"不变形" if same else "变形!"}')
            if not same:
                failed = True

    for tier, tw, th, name in PREVIEWS:
        content, xdivs, ydivs = contents[tier]
        out = render(content, xdivs, ydivs, tw, th)
        p = os.path.join(PREVIEW_DIR, name)
        out.convert('RGB').save(p, 'PNG')
        print(f'预览 {p}')

    print('\n' + ('[FAIL] 有检查未通过' if failed else '[OK] 全部通过：所有目标分辨率下前景逐像素不变形'))
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
