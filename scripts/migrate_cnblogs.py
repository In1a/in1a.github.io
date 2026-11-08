#!/usr/bin/env python3
"""Migrate the public cnblogs.com/evenbao archive to Jekyll HTML posts.

Requirements: Python 3.9+ and lxml. Re-runnable and resumable.
"""
import argparse
import concurrent.futures
import datetime as dt
import html
import random
import re
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from lxml import html as lhtml


ROOT = Path(__file__).resolve().parents[1]
BASE = 'https://www.cnblogs.com/evenbao'
OUTPUT = ROOT / '_posts'
PRINT_LOCK = threading.Lock()


def fetch(url):
    for attempt in range(5):
        try:
            request = urllib.request.Request(url, headers={
                'User-Agent': 'Mozilla/5.0 (compatible; personal-blog-migration/1.0)',
                'Accept-Language': 'zh-CN,zh;q=0.9',
            })
            with urllib.request.urlopen(request, timeout=40) as response:
                return response.read()
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            if attempt == 4:
                raise RuntimeError(f'{url}: {exc}') from exc
            time.sleep(min(2 ** attempt + random.random(), 15))


def scan_page(number):
    url = BASE if number == 1 else f'{BASE}?page={number}'
    document = lhtml.fromstring(fetch(url))
    result = {}
    for element in document.xpath('//a[contains(@href,"/evenbao/p/")]'):
        href = element.get('href', '')
        match = re.search(r'/evenbao/p/(\d+)', href)
        if match:
            result[match.group(1)] = urllib.parse.urljoin(BASE + '/', href.split('#')[0])
    next_page = bool(document.xpath('//a[contains(normalize-space(.),"下一页")]/@href'))
    return number, result, next_page


def discover(max_pages, workers):
    articles = {}
    batch_size = max(4, workers * 2)
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
        for start in range(1, max_pages + 1, batch_size):
            numbers = range(start, min(start + batch_size, max_pages + 1))
            for number, result, has_next in pool.map(scan_page, numbers):
                articles.update(result)
                if not has_next:
                    print(f'Discovered {len(articles)} unique posts across {number} archive pages', flush=True)
                    return list(articles.items())
            print(f'Discovered {len(articles)} unique posts across {number} archive pages', flush=True)
    return list(articles.items())


def parse_post(post_id, url):
    document = lhtml.fromstring(fetch(url))
    body = document.xpath('//*[@id="cnblogs_post_body"]')
    if not body:
        raise ValueError(f'Cannot locate article body: {url}')
    title = document.xpath('string(//h1[contains(@class,"postTitle")])').strip()
    if not title:
        title = document.xpath('string(//title)').split(' - ')[0].strip()
    date_text = document.xpath('string(//*[@id="post-date"])').strip()
    match = re.search(r'\d{4}-\d{2}-\d{2}(?:\s+\d{2}:\d{2})?', date_text)
    if not match:
        match = re.search(r'\d{4}-\d{2}-\d{2}(?:\s+\d{2}:\d{2})?', document.text_content())
    if not match:
        raise ValueError(f'Cannot locate publication date: {url}')
    stamp = match.group(0)
    date = dt.datetime.strptime(stamp, '%Y-%m-%d %H:%M' if ' ' in stamp else '%Y-%m-%d')

    content = body[0]
    for node in content.xpath('.//script|.//iframe|.//form|.//button|.//noscript'):
        node.drop_tree()
    for node in content.iter():
        for attr in list(node.attrib):
            if attr.lower().startswith('on'):
                del node.attrib[attr]
        for attr in ('src', 'href'):
            value = node.get(attr)
            if value and not value.startswith(('data:', 'javascript:', '#', 'mailto:')):
                node.set(attr, urllib.parse.urljoin(url, value))
        if node.tag == 'img':
            src = node.get('data-src') or node.get('data-original')
            if src and not node.get('src'):
                node.set('src', urllib.parse.urljoin(url, src))
            node.set('loading', 'lazy')

    markup = ''.join(lhtml.tostring(child, encoding='unicode', method='html') for child in content)
    # Preserve leading text and article HTML; raw blocks prevent Liquid parsing
    # braces in code examples and mathematical expressions.
    if content.text:
        markup = html.escape(content.text) + markup
    title_yaml = "'" + title.replace("'", "''").replace('\n', ' ') + "'"
    path = OUTPUT / f'{date:%Y-%m-%d}-{post_id}.html'
    frontmatter = (
        f'---\nlayout: post\ntitle: {title_yaml}\n'
        f'date: {date:%Y-%m-%d %H:%M:%S} +0800\n'
        f'source_url: {url}\ncnblogs_id: {post_id}\n---\n'
    )
    return path, frontmatter + '{% raw %}\n' + markup + '\n{% endraw %}\n'


def save(item):
    post_id, url = item
    if list(OUTPUT.glob(f'????-??-??-{post_id}.html')):
        return 'skipped', post_id
    try:
        filename, content = parse_post(post_id, url)
        filename.write_text(content, encoding='utf-8')
        return 'saved', post_id
    except Exception as exc:
        return 'failed', f'{post_id} {url} {exc}'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--limit', type=int, default=0, help='only download N discovered articles')
    parser.add_argument('--max-pages', type=int, default=1000)
    parser.add_argument('--workers', type=int, default=4)
    args = parser.parse_args()
    OUTPUT.mkdir(exist_ok=True)
    items = discover(args.max_pages, args.workers)
    if args.limit:
        items = items[:args.limit]
    totals = {'saved': 0, 'skipped': 0, 'failed': 0}
    failures = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        for status, info in pool.map(save, items):
            totals[status] += 1
            if status == 'failed':
                failures.append(info)
            if sum(totals.values()) % 50 == 0:
                print(f'Processed {sum(totals.values())}/{len(items)}: {totals}', flush=True)
    (ROOT / 'migration-failures.txt').write_text('\n'.join(failures) + ('\n' if failures else ''), encoding='utf-8')
    print(f'Finished: {totals}; failure details: migration-failures.txt')
    if failures:
        sys.exit(1)


if __name__ == '__main__':
    main()
