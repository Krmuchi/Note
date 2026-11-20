#!/usr/bin/env python3
"""从 build/icon-source.png 派生全部图标资产（Pillow 无其它依赖）。

  build/icon-source.png  ← 正式设计稿（唯一源，1024²）
    ├─ build/icon.png     512²  圆角透明瓷砖（Linux / 文档封面）
    ├─ build/icon.ico     16/24/32/48/64/128/256  Windows 安装包与窗口图标
    ├─ build/tray.png     64²   托盘
    └─ public/favicon.svg 64²   网页 favicon（SVG 包 base64 PNG，保持 index.html 引用不变）

  处理：裁到图形外接框 → 四角白底 flood 成透明（保留图形自身圆角的抗锯齿边）。
  重新派生：python scripts/build-icons-from-png.py
"""
import base64
import io
import os
import sys

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'build', 'icon-source.png')


def transparent_tile(img: Image.Image) -> Image.Image:
    """裁到非白图形外接框，把四个角的白底 flood 成透明。"""
    gray = img.convert('L')
    # 250 阈值把边缘浅色过渡像素也算进图形，避免裁掉抗锯齿边
    bbox = gray.point(lambda p: 255 if p < 250 else 0).getbbox()
    if not bbox:
        raise SystemExit('[icons-from-png] 图源全白，无法定位图形')
    tile = img.crop(bbox).convert('RGBA')
    key = (255, 0, 255, 255)
    corners = ((0, 0), (tile.width - 1, 0), (0, tile.height - 1), (tile.width - 1, tile.height - 1))
    for corner in corners:
        ImageDraw.floodfill(tile, corner, key, thresh=90)
    data = [
        (r, g, b, 0) if (r, g, b) == (255, 0, 255) else (r, g, b, a)
        for (r, g, b, a) in tile.getdata()
    ]
    tile.putdata(data)
    return tile


def main() -> None:
    if not os.path.exists(SRC):
        raise SystemExit(f'[icons-from-png] 缺少图源：{SRC}')
    tile = transparent_tile(Image.open(SRC))

    tile.resize((512, 512), Image.LANCZOS).save(os.path.join(ROOT, 'build', 'icon.png'))

    ico_sizes = [16, 24, 32, 48, 64, 128, 256]
    big = tile.resize((256, 256), Image.LANCZOS)
    big.save(os.path.join(ROOT, 'build', 'icon.ico'), sizes=[(s, s) for s in ico_sizes])

    tile.resize((64, 64), Image.LANCZOS).save(os.path.join(ROOT, 'build', 'tray.png'))

    buf = io.BytesIO()
    tile.resize((64, 64), Image.LANCZOS).save(buf, 'PNG')
    b64 = base64.b64encode(buf.getvalue()).decode('ascii')
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">'
        f'<image width="64" height="64" href="data:image/png;base64,{b64}"/>'
        '</svg>'
    )
    with open(os.path.join(ROOT, 'public', 'favicon.svg'), 'w', encoding='utf-8') as f:
        f.write(svg)

    print('[icons-from-png] 已派生：build/icon.png · build/icon.ico · build/tray.png · public/favicon.svg')


if __name__ == '__main__':
    sys.exit(main())