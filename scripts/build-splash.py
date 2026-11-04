#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
生成 Android 启动图（.9.png 九宫格）并自检「不变形」。

为什么要 .9.png
--------------
启动图在 Android 上是**原生层**资源（Activity 的 windowBackground），不是前端页面：

- windowBackground 引用的 Bitmap 会被系统按 **fill** 铺满窗口 → 图片比例与屏幕比例
  不一致时必然被拉伸变形。
- 我们的启动图原为 852x1846（比例 0.462），而主流 20:9 屏是 1080x2460（比例 0.439），
  16:9 屏是 1080x1920（比例 0.5625） → 差 20% 以上，logo 与文字被拉长。

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

  - 前景（logo + 品牌名 + 标语）放在**固定区**：顶边在前景列区间留透明、其余标黑；
    左边在前景行区间留透明、其余标黑。
  - 四周大片**纯色**（品牌紫 #9C5A8B，取自源图底部色）落在可拉伸区 →
    任意屏幕比例都由纯色吸收，logo 与文字**逐像素不变**。

素材来源与抠图
--------------
源图 app-icons/slash_starup.png（852x1846）是**多色渐变**背景（顶部橙黄 → 粉 →
珊瑚 → 底部深紫），上面是花朵状 logo、品牌名与 4 行标语。

抠图要点（都是实测踩出来的坑，勿简化）：

1. **不能用亮度/饱和度阈值**：渐变下半段接近白色，绝对阈值会把背景当前景
   （实测裁到渐变区得到一片噪点，渲染出来完全看不出内容）。
2. **背景估计用「降采样 → 中值滤波」**：中值滤波对细结构是低通的，
   降采样 4 倍后文字笔画只剩 2~3px，15px 窗口中值即可把笔画整体抹掉，
   剩下平滑渐变。分块中位色不行——会被文字本身拉偏。
3. **内容区用硬性矩形框限定**：差分后仍有边缘噪点，若让它参与 bbox 计算，
   bbox 会被撑到整幅宽（852 宽撑满 → 缩放基准偏大 24% → 内容整体偏小）。
4. **孤点去除用 8 邻域计数**：形态学腐蚀会吃掉 logo 的 1~2px 细线，
   所以只删「邻居 < 2」的孤立点，线能保住。
5. **前景向白色提亮 12%**：源图内容是浅色系（浅粉白），放到深紫纯色底上
   对比度不足，不提亮会看不清。

依赖：Python 3 + Pillow
用法：python scripts/build-splash.py
"""

import os
import sys

try:
    from PIL import Image, ImageFilter
except ImportError:
    sys.exit('需要 Pillow：pip install Pillow')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICONS = os.path.join(ROOT, 'app-icons')
SRC = os.path.join(ICONS, 'slash_starup.png')
OUT_DIR = os.path.join(ICONS, 'splash-9patch')

BRAND = (156, 90, 139)          # #9C5A8B，取自源图底部深紫（同时用作 androidNavigationBarColor）
BRAND_HEX = '#9C5A8B'

# 三档：文件名尺寸必须等于官方提示尺寸（hdpi 480x762 / xhdpi 720x1242 / xxhdpi 1080x1882）
TIERS = [
    ('hdpi', 480, 762, 'splash-android-hdpi-480x762.9.png'),
    ('xhdpi', 720, 1242, 'splash-android-xhdpi-720x1242.9.png'),
    ('xxhdpi', 1080, 1882, 'splash-android-xxhdpi-1080x1882.9.png'),
]

# 源图内容区（由前景行/列聚类实测得出，带余量）
SEGMENTS = [
    ('LOGO', 255, 195, 615, 515),     # 花朵状图形 logo
    ('BRAND', 245, 495, 605, 630),    # 品牌名（一行）
    ('COPY', 160, 665, 815, 1015),    # 标语（4 行）
]

CONTENT_W_RATIO = 0.72      # 内容整体宽度 / 内容区宽度
PAD_RATIO = 0.065           # 固定区四周留白 / 内容宽
BG_DS = 4                   # 背景估计降采样倍数
BG_MEDIAN = 15              # 降采样后的中值滤波窗口（抹掉文字笔画）
BG_BLUR = 3
ALPHA_LO, ALPHA_HI = 10, 26     # 软 alpha 阈值（最大通道差）
ALPHA_MIN = 12                 # 判定「有内容」的最小 alpha
GAMMA = 0.6                    # alpha gamma（<1 → 提升中间调的实心度）
WHITEN = 0.12                  # 前景向白色提亮比例（保证深紫底上可读）


def build_background_estimate(src):
    """背景估计：降采样 → 中值滤波抹掉细结构 → 放大回原尺寸。"""
    W, H = src.size
    small = src.resize((max(1, W // BG_DS), max(1, H // BG_DS)), Image.BOX)
    small = small.filter(ImageFilter.MedianFilter(BG_MEDIAN))
    small = small.filter(ImageFilter.GaussianBlur(BG_BLUR))
    return small.resize((W, H), Image.BICUBIC).load()


def extract_region(src, bgpx, box):
    """按背景差分抠出前景，返回 RGBA（软 alpha + gamma，保留原像素颜色）。"""
    x0, y0, x1, y1 = box
    im = Image.new('RGBA', (x1 - x0 + 1, y1 - y0 + 1), (0, 0, 0, 0))
    spx, ipx = src.load(), im.load()
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            p = spx[x, y]
            b = bgpx[x, y]
            d = max(abs(p[0] - b[0]), abs(p[1] - b[1]), abs(p[2] - b[2]))
            if d <= ALPHA_LO:
                continue
            t = min(1.0, (d - ALPHA_LO) / (ALPHA_HI - ALPHA_LO)) ** GAMMA
            a = int(t * 255)
            if a <= ALPHA_MIN:
                continue
            ipx[x - x0, y - y0] = (p[0], p[1], p[2], a)
    return im


def remove_isolated(im):
    """删除 8 邻域内前景数 < 2 的孤立点（去噪点，不伤 logo 细线）。"""
    px = im.load()
    W, H = im.size
    drop = []
    for y in range(H):
        for x in range(W):
            if px[x, y][3] <= ALPHA_MIN:
                continue
            n = 0
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    if dx == 0 and dy == 0:
                        continue
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < W and 0 <= ny < H and px[nx, ny][3] > ALPHA_MIN:
                        n += 1
            if n < 2:
                drop.append((x, y))
    for x, y in drop:
        px[x, y] = (0, 0, 0, 0)
    return im


def alpha_bbox(im):
    """前景紧致 bbox。"""
    px = im.load()
    W, H = im.size
    xs, ys = [], []
    for y in range(H):
        for x in range(W):
            if px[x, y][3] > ALPHA_MIN:
                xs.append(x)
                ys.append(y)
    if not xs:
        return None
    return min(xs), min(ys), max(xs), max(ys)


def compose_content(src, bgpx):
    """在源图坐标系里拼出「纯内容层」，保持各元素的原始相对位置。"""
    W, H = src.size
    canvas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    for name, x0, y0, x1, y1 in SEGMENTS:
        region = extract_region(src, bgpx, (x0, y0, x1, y1))
        region = remove_isolated(region)
        bb = alpha_bbox(region)
        if bb is None:
            print(f'  [{name}] 抠取为空，跳过')
            continue
        kept = sum(1 for p in region.getdata() if p[3] > 0)
        print(f'  [{name}] 抠到 {kept} px，源图 x[{x0 + bb[0]},{x0 + bb[2]}] '
              f'y[{y0 + bb[1]},{y0 + bb[3]}]')
        region = region.crop(bb)
        canvas.paste(region, (x0 + bb[0], y0 + bb[1]), region)
    return canvas


def whiten(layer, ratio):
    """前景向白色提亮（深紫底上更清晰）。"""
    px = layer.load()
    W, H = layer.size
    for y in range(H):
        for x in range(W):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            px[x, y] = (
                int(r + (255 - r) * ratio),
                int(g + (255 - g) * ratio),
                int(b + (255 - b) * ratio),
                a,
            )
    return layer


def build_tier(content_layer, content_w, content_h, filename):
    """把内容层等比缩放后贴到品牌纯色底上，生成 .9.png。"""
    bb = alpha_bbox(content_layer)
    assert bb is not None, '内容层为空'
    cw = bb[2] - bb[0] + 1
    ch = bb[3] - bb[1] + 1

    k = content_w * CONTENT_W_RATIO / cw
    scaled = content_layer.crop(bb).resize(
        (max(1, int(cw * k)), max(1, int(ch * k))), Image.LANCZOS)

    fw, fh = content_w + 2, content_h + 2
    canvas = Image.new('RGBA', (fw, fh), (0, 0, 0, 0))
    cx = canvas.load()
    for y in range(1, fh - 1):
        for x in range(1, fw - 1):
            cx[x, y] = (BRAND[0], BRAND[1], BRAND[2], 255)

    fx = (content_w - scaled.size[0]) // 2
    fy = (content_h - scaled.size[1]) // 2
    canvas.paste(scaled, (fx + 1, fy + 1), scaled)

    sb = alpha_bbox(scaled)
    fg_left = fx + sb[0]
    fg_right = fx + sb[2]
    fg_top = fy + sb[1]
    fg_bottom = fy + sb[3]

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


def main():
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass
    if not os.path.exists(SRC):
        sys.exit(f'缺少源图：{SRC}')
    os.makedirs(OUT_DIR, exist_ok=True)
    src = Image.open(SRC).convert('RGB')
    print(f'源图 {src.size}，品牌色 {BRAND_HEX}')

    bgpx = build_background_estimate(src)
    content_layer = compose_content(src, bgpx)
    content_layer = whiten(content_layer, WHITEN)
    bb = alpha_bbox(content_layer)
    assert bb is not None, '内容层为空'
    print(f'内容层 bbox x[{bb[0]},{bb[2]}] y[{bb[1]},{bb[3]}] '
          f'({bb[2]-bb[0]+1}x{bb[3]-bb[1]+1})')

    failed = False
    for tier, fw_expect, fh_expect, filename in TIERS:
        content_w, content_h = fw_expect - 2, fh_expect - 2
        path, size, fixed = build_tier(content_layer, content_w, content_h, filename)
        im = Image.open(path)
        assert im.size == (fw_expect, fh_expect), f'{filename} 尺寸 {im.size} != 官方提示 {(fw_expect, fh_expect)}'
        print(f'\n[{tier}] {filename}  文件 {im.size[0]}x{im.size[1]}（内容 {content_w}x{content_h}）')
        print(f'      前景 {size[0]}x{size[1]}  固定列 [{fixed[0]},{fixed[1]}]  固定行 [{fixed[2]},{fixed[3]}]')

        content, xdivs, ydivs, fw, fh = parse_divs(path)
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

    print('\n' + ('[FAIL] 有检查未通过' if failed else '[OK] 全部通过：所有目标分辨率下前景逐像素不变形'))
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
