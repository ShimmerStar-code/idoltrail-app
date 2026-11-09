# -*- coding: utf-8 -*-
"""生成 .9.png（九宫格）启动图。

背景
----
Android 启动图是原生层资源（Activity 的 windowBackground），普通 PNG 会被系统按 fill
铺满窗口，比例不一致必然拉伸变形（Redmi K40 / 1080x2460 上旧整屏图被纵向拉伸 1.307 倍）。
现在用 .9.png：固定区 = 品牌锁定图（1:1 不缩放不重采样），四周为可拉伸渐变底。

aapt2 的九宫格边框语义（**踩过坑，别改错**）
--------------------------------------------
  * **上边**黑段 = 水平方向可拉伸的**列**（stretchX）—— 允许多段
  * **左边**黑段 = 垂直方向可拉伸的**行**（stretchY）—— 允许多段
  * **下边**黑段 = 内容区下边界（padding）—— **最多 1 段**
  * **右边**黑段 = 内容区右边界（padding）—— **最多 1 段**

本图内容铺满整张、没有 padding，所以**下边/右边一个黑像素都不能画**。
早期版本把黑段同时画在「顶+底 / 左+右」四边，云打包直接失败：

    error: too many padding sections on bottom border.
    error: file failed to compile.

品牌图在正中，左右两侧的渐变底可水平拉伸、上下两侧可垂直拉伸，
因此上边/左边各有两段黑（品牌列/行区间之外），这是合法的。

用法
----
    python scripts/build-splash-9patch.py --design "<交付素材根目录>"
    python scripts/build-splash-9patch.py --design "<...>" --out app-icons/splash-9patch

素材目录结构（只读）：
    <design>/android/app/src/main/res/drawable-{hdpi,xhdpi,xxhdpi}/splash_brand.png
品牌锁定图按密度分档，各档为 200dp 宽的原件，**不缩放不重采样**。
"""
import argparse
import hashlib
import os
import sys

from PIL import Image, ImageDraw

# 底色：res/drawable/splash_background.xml 原文照抄（colors.xml splash_bg_start/center）
START = (0xFF, 0xE3, 0x9A)
CENTER = (0xFC, 0xA8, 0xB3)
# splash_background.xml centerY="0.30"（centerX 默认 0.5）
# AOSP GradientDrawable 停靠点 = mCenterX != 0.5 ? mCenterX : mCenterY = 0.30
CENTER_POS = 0.30

# bucket -> (内容宽, 内容高, 素材 drawable 目录名)
BUCKETS = {
    'hdpi': (480, 800, 'hdpi'),
    'xhdpi': (720, 1440, 'xhdpi'),
    'xxhdpi': (1080, 2400, 'xxhdpi'),
}


def lerp(a, b, u):
    return tuple(int(a[i] + (b[i] - a[i]) * u) for i in range(3))


def render_gradient(w, h):
    """AOSP GradientDrawable TL_BR 语义：angle=315 -> 渐变线 (0,0)->(w,h)。"""
    img = Image.new('RGB', (w, h))
    dat = img.load()
    denom = float(w * w + h * h)
    for y in range(h):
        base = y * h
        for x in range(w):
            t = (x * w + base) / denom
            if t <= CENTER_POS:
                c = lerp(START, CENTER, t / CENTER_POS if CENTER_POS else 0.0)
            else:
                c = CENTER
            dat[x, y] = c
    return img


def make_ninepatch(content, fx0, fx1, fy0, fy1):
    """给内容加 1px 九宫格边框。

    只在**上边**（水平可拉伸列）和**左边**（垂直可拉伸行）画黑段；
    下边/右边保持全透明 —— 它们代表 padding，aapt2 只允许单段。
    """
    W, H = content.size
    out = Image.new('RGBA', (W + 2, H + 2), (0, 0, 0, 0))
    out.paste(content.convert('RGBA'), (1, 1))
    d = ImageDraw.Draw(out)
    B = (0, 0, 0, 255)
    # 顶行：品牌列区间之外的列 = 水平可拉伸（多段合法）
    d.line([(1, 0), (fx0, 0)], fill=B)
    d.line([(fx1 + 1, 0), (W, 0)], fill=B)
    # 左列：品牌行区间之外的行 = 垂直可拉伸（多段合法）
    d.line([(0, 1), (0, fy0)], fill=B)
    d.line([(0, fy1 + 1), (0, H)], fill=B)
    # 底行 / 右列：不画黑（无 padding）
    return out


def _black(p):
    return p[3] > 128 and sum(p[:3]) < 200


def _runs(flags):
    out, start = [], None
    for i, v in enumerate(flags):
        if v and start is None:
            start = i
        elif not v and start is not None:
            out.append((start, i - 1))
            start = None
    if start is not None:
        out.append((start, len(flags) - 1))
    return out


def check_aapt2_rules(nine, fx0, fx1, fy0, fy1):
    """按 aapt2 / AOSP NinePatchPeeker 的规则自检（本地没有 aapt2，这是唯一编译前保障）。"""
    px = nine.load()
    W, H = nine.size
    problems = []
    top = _runs([_black(px[x, 0]) for x in range(W)])
    bottom = _runs([_black(px[x, H - 1]) for x in range(W)])
    left = _runs([_black(px[0, y]) for y in range(H)])
    right = _runs([_black(px[W - 1, y]) for y in range(H)])

    if len(top) < 1:
        problems.append('顶行没有黑段（aapt2: no horizontal stripes）')
    if len(left) < 1:
        problems.append('左列没有黑段（aapt2: no vertical stripes）')
    if len(bottom) > 1:
        problems.append('底行有 %d 段黑（aapt2 只允许 1 段：too many padding sections on bottom border）' % len(bottom))
    if len(right) > 1:
        problems.append('右列有 %d 段黑（aapt2 只允许 1 段：too many padding sections on right border）' % len(right))
    if bottom:
        problems.append('底行有黑段（本图无 padding，底行必须全透明）')
    if right:
        problems.append('右列有黑段（本图无 padding，右列必须全透明）')

    exp_top = [(1, fx0), (fx1 + 1, W - 2)]
    exp_left = [(1, fy0), (fy1 + 1, H - 2)]
    if top != exp_top:
        problems.append('顶行黑段 %s != 期望 %s' % (top, exp_top))
    if left != exp_left:
        problems.append('左列黑段 %s != 期望 %s' % (left, exp_left))

    for (cx, cy) in [(0, 0), (W - 1, 0), (0, H - 1), (W - 1, H - 1)]:
        if px[cx, cy][3] >= 128:
            problems.append('角点 (%d,%d) 不是透明像素' % (cx, cy))
    return problems


def build_bucket(design, out_root, bucket):
    W, H, ddir = BUCKETS[bucket]
    brand_path = os.path.join(design, 'android', 'app', 'src', 'main', 'res',
                              'drawable-%s' % ddir, 'splash_brand.png')
    if not os.path.exists(brand_path):
        raise SystemExit('缺少品牌锁定图：%s' % brand_path)

    brand = Image.open(brand_path).convert('RGBA')
    bg = render_gradient(W, H).convert('RGBA')
    bw, bh = brand.size
    fx0 = (W - bw) // 2
    fx1 = fx0 + bw
    fy0 = (H - bh) // 2
    fy1 = fy0 + bh
    bg.paste(brand, (fx0, fy0), brand)

    nine = make_ninepatch(bg, fx0, fx1, fy0, fy1)
    problems = check_aapt2_rules(nine, fx0, fx1, fy0, fy1)
    if problems:
        raise SystemExit('[%s] 九宫格边框不合法：\n  - %s' % (bucket, '\n  - '.join(problems)))

    dest_dir = os.path.join(out_root, bucket)
    os.makedirs(dest_dir, exist_ok=True)
    dest = os.path.join(dest_dir, 'splash.9.png')
    nine.save(dest)

    buf = open(dest, 'rb').read()
    print('[OK] %-7s %s  %dx%d  品牌区 x[%d,%d) y[%d,%d)  品牌原件 %dx%d  md5=%s'
          % (bucket, os.path.relpath(dest, os.getcwd()), nine.size[0], nine.size[1],
             fx0, fx1, fy0, fy1, bw, bh, hashlib.md5(buf).hexdigest()))
    return dest


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--design', required=True,
                    help='交付素材根目录（含 android/app/src/main/res/drawable-*）')
    ap.add_argument('--out', default=os.path.join('app-icons', 'splash-9patch'),
                    help='输出根目录（默认 app-icons/splash-9patch）')
    args = ap.parse_args()

    design = os.path.abspath(args.design)
    if not os.path.isdir(design):
        raise SystemExit('素材目录不存在：%s' % design)
    for bucket in BUCKETS:
        build_bucket(design, os.path.abspath(args.out), bucket)
    print('\n提示：生成后请更新 scripts/check-splash.mjs 里的 EXPECTED md5，并跑 npm run check:splash')


if __name__ == '__main__':
    main()
