#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""实验史记 · 马刀地宫 —— 单文件打包器
用法：python build.py
产出：《实验史记·马刀地宫.html》（零外部资源，双击即玩，file:// 可玩）。"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).parent
OUT = ROOT / "实验史记·马刀地宫.html"

def main():
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    # 内联 CSS
    css = (ROOT / "css" / "style.css").read_text(encoding="utf-8")
    html = html.replace('<link rel="stylesheet" href="css/style.css">',
                        "<style>\n" + css + "\n</style>")
    # 内联 JS（保持顺序）
    def inline_script(m: re.Match) -> str:
        src = m.group(1)
        code = (ROOT / src).read_text(encoding="utf-8")
        # </script> 不能出现在内联字符串里
        code = code.replace("</script>", "<\\/script>")
        return "<script>\n" + code + "\n</script>"
    html = re.sub(r'<script src="(js/[^"]+)"></script>', inline_script, html)
    OUT.write_text(html, encoding="utf-8", newline="\n")
    size = OUT.stat().st_size
    print(f"打包完成：{OUT.name}（{size/1024:.0f} KB）")
    if "<script src=" in html or 'link rel="stylesheet"' in html:
        print("警告：仍有未内联的外部引用！")
        sys.exit(1)

if __name__ == "__main__":
    main()
