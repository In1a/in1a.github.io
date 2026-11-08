/* Markdown editor controls and safe, local preview. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const body = $('body');
  const edit = $('edit-tab');
  const preview = $('preview-tab');
  const previewPane = $('markdown-preview');
  const escape = value => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const safeUrl = value => /^(https?:\/\/|\/|#)/i.test(value) ? escape(value) : '#';
  function inline(text) {
    return escape(text)
      .replace(/!\[([^\]]*)\]\(([^\s)]+)\)/g, (_, alt, url) => '<img loading="lazy" alt="' + alt + '" src="' + safeUrl(url) + '">')
      .replace(/\[([^\]]+)\]\(([^\s)]+)\)/g, (_, title, url) => '<a href="' + safeUrl(url) + '" rel="noopener noreferrer" target="_blank">' + title + '</a>')
      .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
      .replace(/`([^`\n]+)`/g, '<code>$1</code>');
  }
  function renderMarkdown(source) {
    const lines = source.replace(/\r\n?/g, '\n').split('\n');
    const output = [];
    let code = [], fence = false, list = '';
    const closeList = () => { if (list) { output.push('</' + list + '>'); list = ''; } };
    const closeCode = () => { if (fence) { output.push('<pre><code>' + escape(code.join('\n')) + '</code></pre>'); code = []; fence = false; } };
    for (const line of lines) {
      if (/^\s*`{3,}/.test(line)) { closeList(); if (fence) closeCode(); else { fence = true; code = []; } continue; }
      if (fence) { code.push(line); continue; }
      if (!line.trim()) { closeList(); continue; }
      const heading = line.match(/^(#{1,6})\s+(.+)$/);
      if (heading) { closeList(); const n = heading[1].length; output.push('<h' + n + '>' + inline(heading[2]) + '</h' + n + '>'); continue; }
      const item = line.match(/^\s*(-|\*|\d+\.)\s+(.+)$/);
      if (item) { const kind = /\d/.test(item[1]) ? 'ol' : 'ul'; if (list !== kind) { closeList(); list = kind; output.push('<' + kind + '>'); } output.push('<li>' + inline(item[2]) + '</li>'); continue; }
      closeList();
      if (/^>\s?/.test(line)) output.push('<blockquote>' + inline(line.replace(/^>\s?/, '')) + '</blockquote>');
      else if (/^---+$/.test(line.trim())) output.push('<hr>');
      else output.push('<p>' + inline(line) + '</p>');
    }
    closeList(); closeCode();
    return output.join('');
  }
  function showPreview(value) {
    const active = value === 'preview';
    edit.classList.toggle('active', !active);
    preview.classList.toggle('active', active);
    edit.setAttribute('aria-selected', String(!active));
    preview.setAttribute('aria-selected', String(active));
    body.hidden = active;
    previewPane.hidden = !active;
    if (active) previewPane.innerHTML = renderMarkdown(body.value);
  }
  function insert(before, after = '', fallback = '文字') {
    showPreview('edit');
    const start = body.selectionStart, end = body.selectionEnd;
    const selected = body.value.slice(start, end) || fallback;
    body.setRangeText(before + selected + after, start, end, 'select');
    body.selectionStart = start + before.length;
    body.selectionEnd = start + before.length + selected.length;
    body.focus();
    body.dispatchEvent(new Event('input'));
  }
  const actions = {
    bold: () => insert('**', '**'),
    italic: () => insert('*', '*'),
    link: () => insert('[', '](https://example.com)', '链接文字'),
    code: () => insert('`', '`', 'code'),
    blockquote: () => insert('> ', '', '引用内容'),
    heading: () => insert('## ', '', '小标题'),
    unordered: () => insert('- ', '', '列表项'),
    ordered: () => insert('1. ', '', '列表项'),
    task: () => insert('- [ ] ', '', '待办事项'),
    table: () => insert('| 列 1 | 列 2 |\n| --- | --- |\n| 内容 | 内容 |\n', '', ''),
    math: () => insert('$', '$', 'x^2 + y^2'),
    image: () => insert('![', '](https://example.com/image.png)', '图片描述')
  };
  document.querySelectorAll('[data-markdown-action]').forEach(button => button.addEventListener('click', () => actions[button.dataset.markdownAction]?.()));
  edit.addEventListener('click', () => showPreview('edit'));
  preview.addEventListener('click', () => showPreview('preview'));
  body.addEventListener('input', () => { if (!previewPane.hidden) previewPane.innerHTML = renderMarkdown(body.value); });
  document.addEventListener('click', event => {
    if (event.target.closest('#new-post, .post-entry')) showPreview('edit');
  });
  $('expand-editor').addEventListener('click', () => $('workspace').classList.toggle('editor-expanded'));
  $('body').addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b') { event.preventDefault(); actions.bold(); }
  });
})();
