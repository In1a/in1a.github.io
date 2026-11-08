/* Convert imported CNBlogs markup to editable Markdown. Original Git history remains the backup. */
window.legacyHtmlToMarkdown = function (source) {
  const cleaned = source.replace(/^\s*{%\s*raw\s*%}/, '').replace(/{%\s*endraw\s*%}\s*$/, '');
  const doc = new DOMParser().parseFromString('<div id="legacy-root">' + cleaned + '</div>', 'text/html');
  const root = doc.getElementById('legacy-root');
  const escapeText = value => value.replace(/\\/g, '\\\\').replace(/([*_\[\]])/g, '\\$1');
  const inline = node => {
    if (node.nodeType === Node.TEXT_NODE) return escapeText(node.nodeValue.replace(/\s+/g, ' '));
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const tag = node.tagName.toLowerCase();
    const inside = () => [...node.childNodes].map(inline).join('');
    if (tag === 'br') return '\n';
    if (tag === 'img') {
      const src = node.getAttribute('src') || '';
      return src ? '![' + (node.getAttribute('alt') || '').replace(/[\[\]]/g, '') + '](' + src.replace(/\s/g, '%20') + ')' : '';
    }
    if (tag === 'a') {
      const href = node.getAttribute('href');
      return href ? '[' + inside().replace(/[\[\]]/g, '') + '](' + href.replace(/\s/g, '%20') + ')' : inside();
    }
    if (tag === 'strong' || tag === 'b') return '**' + inside().trim() + '**';
    if (tag === 'em' || tag === 'i') return '*' + inside().trim() + '*';
    if (tag === 'code') return '`' + node.textContent.replace(/`/g, '\\`') + '`';
    if (tag === 'sup') return '<sup>' + inside() + '</sup>';
    if (tag === 'sub') return '<sub>' + inside() + '</sub>';
    return inside();
  };
  const blocks = node => {
    if (node.nodeType === Node.TEXT_NODE) return node.nodeValue.trim() ? inline(node) : '';
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const tag = node.tagName.toLowerCase();
    if (tag === 'script' || tag === 'style') return '';
    if (tag === 'pre') {
      const code = node.textContent.replace(/\r\n?/g, '\n').replace(/^\n+|\n+$/g, '');
      const fence = '`'.repeat(Math.max(3, ...((code.match(/`+/g) || []).map(s => s.length + 1))));
      return '\n' + fence + 'cpp\n' + code + '\n' + fence + '\n';
    }
    if (/^h[1-6]$/.test(tag)) return '\n' + '#'.repeat(Number(tag[1])) + ' ' + inlineChildren(node).trim() + '\n';
    if (tag === 'ul' || tag === 'ol') return '\n' + [...node.children].filter(c => c.tagName.toLowerCase() === 'li').map((li, i) => (tag === 'ol' ? (i + 1) + '. ' : '- ') + inlineChildren(li).trim()).join('\n') + '\n';
    if (tag === 'blockquote') return '\n' + inlineChildren(node).trim().split('\n').map(l => '> ' + l).join('\n') + '\n';
    if (tag === 'table') {
      const rows = [...node.querySelectorAll('tr')].map(tr => [...tr.children].map(td => inlineChildren(td).trim().replace(/\|/g, '\\|')));
      if (!rows.length) return '';
      const n = Math.max(...rows.map(row => row.length));
      const row = r => '| ' + Array.from({length:n}, (_,i) => r[i] || '').join(' | ') + ' |';
      return '\n' + row(rows[0]) + '\n' + row(Array(n).fill('---')) + '\n' + rows.slice(1).map(row).join('\n') + '\n';
    }
    if (tag === 'p') return '\n' + inlineChildren(node).trim() + '\n';
    if (tag === 'hr') return '\n---\n';
    if (tag === 'div' || tag === 'section' || tag === 'article') return [...node.childNodes].map(blocks).join('\n');
    return inline(node);
  };
  function inlineChildren(node) { return [...node.childNodes].map(inline).join(''); }
  return [...root.childNodes].map(blocks).join('\n').replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
};
