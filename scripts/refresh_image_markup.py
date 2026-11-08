#!/usr/bin/env python3
"""Normalize migrated image markup and bust old broken browser caches."""
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TAG = re.compile(r'<img\b[^>]*>', re.I | re.S)


def normalize(match):
    tag = match.group(0)
    if 'src="/assets/images/' not in tag:
        return tag
    tag = re.sub(r'\sdata-src="[^"]*"', '', tag)
    tag = re.sub(r'\sclass="lazyload"', '', tag)
    tag = re.sub(r'\sloading="lazy"', '', tag)
    tag = re.sub(r'(src="/assets/images/[^"?]+)(?:\?v=\d+)?"', r'\g<1>?v=2"', tag)
    return tag


def main():
    edited = 0
    for path in (ROOT / '_posts').glob('*.html'):
        before = path.read_text(encoding='utf-8')
        after = TAG.sub(normalize, before)
        if after != before:
            path.write_text(after, encoding='utf-8')
            edited += 1
    print(f'Normalized images in {edited} articles')


if __name__ == '__main__':
    main()
