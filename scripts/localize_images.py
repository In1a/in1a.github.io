#!/usr/bin/env python3
"""Download external article images and rewrite image URLs to local paths.

Run after migrate_cnblogs.py. Idempotent; intentionally avoids sending a
cross-origin Referer because some image hosts block hotlinked requests.
"""
import concurrent.futures
import hashlib
import html
import mimetypes
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
POSTS = ROOT / '_posts'
IMAGES = ROOT / 'assets' / 'images'
# Match the real `src` attribute, not `data-src` (which also contains "src").
PATTERN = re.compile(r'<img\b[^>]*?(?<![\w:-])src\s*=\s*(["\'])(.*?)\1', re.I | re.S)
EXTENSIONS = {'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif',
              'image/webp': '.webp', 'image/svg+xml': '.svg', 'image/bmp': '.bmp'}


def download(url):
    prefix = hashlib.sha256(url.encode()).hexdigest()[:24]
    cached = list(IMAGES.glob(prefix + '.*'))
    if cached:
        return url, '/assets/images/' + cached[0].name, None
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=40) as response:
                content_type = response.headers.get('Content-Type', '').split(';')[0].lower()
                data = response.read(20 * 1024 * 1024 + 1)
            if not content_type.startswith('image/') or len(data) > 20 * 1024 * 1024:
                raise ValueError(f'Unexpected image response: {content_type}, {len(data)} bytes')
            extension = EXTENSIONS.get(content_type) or Path(urllib.parse.urlsplit(url).path).suffix.lower()
            if extension not in {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.avif'}:
                extension = mimetypes.guess_extension(content_type) or '.img'
            name = hashlib.sha256(url.encode()).hexdigest()[:24] + extension
            target = IMAGES / name
            if not target.exists():
                target.write_bytes(data)
            return url, '/assets/images/' + name, None
        except Exception as exc:
            if attempt == 3:
                return url, None, str(exc)
            time.sleep(2 ** attempt)


def main():
    IMAGES.mkdir(parents=True, exist_ok=True)
    urls = set()
    files = list(POSTS.glob('*.html'))
    for file in files:
        for match in PATTERN.finditer(file.read_text(encoding='utf-8')):
            url = html.unescape(match.group(2))
            if url.startswith(('http://', 'https://')):
                urls.add(url)
    print(f'Found {len(urls)} unique external images', flush=True)
    results = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        for index, (url, path, error) in enumerate(pool.map(download, sorted(urls)), 1):
            results[url] = (path, error)
            if index % 20 == 0:
                print(f'Downloaded or checked {index}/{len(urls)} images', flush=True)
    changed = 0
    for file in files:
        source = file.read_text(encoding='utf-8')

        def replacement(match):
            url = html.unescape(match.group(2))
            path = results.get(url, (None, None))[0]
            if not path:
                return match.group(0)
            return match.group(0).replace(match.group(2), path)

        output = PATTERN.sub(replacement, source)
        if output != source:
            file.write_text(output, encoding='utf-8')
            changed += 1
    errors = [(url, error) for url, (_, error) in results.items() if error]
    (ROOT / 'image-download-failures.txt').write_text(
        '\n'.join(f'{url}\t{error}' for url, error in errors) + ('\n' if errors else ''),
        encoding='utf-8')
    print(f'Localized {len(urls) - len(errors)}/{len(urls)} images in {changed} articles; errors: {len(errors)}')


if __name__ == '__main__':
    main()
