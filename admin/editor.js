/* A small, token-in-memory GitHub editor. No cookies or local storage. */
(() => {
  'use strict';
  const REPO = 'evenbao333/evenbao333.github.io';
  const API = `https://api.github.com/repos/${REPO}`;
  const $ = id => document.getElementById(id);
  let token = '';
  let entries = [];
  let draftEntries = [];
  let current = null;
  let legacyOriginal = '';
  let selectedTab = 'published';
  let busy = false;

  const utf8base64 = text => {
    const bytes = new TextEncoder().encode(text);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 8192)
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return btoa(binary);
  };
  const base64utf8 = encoded => {
    const binary = atob(encoded.replace(/\s/g, ''));
    return new TextDecoder().decode(Uint8Array.from(binary, c => c.charCodeAt(0)));
  };
  const baseName = path => path.split('/').pop();
  const today = () => {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };
  const slugify = text => text.toLowerCase().normalize('NFKD').replace(/[^a-z0-9\s-]/g, '').trim().replace(/[\s-]+/g, '-').slice(0, 70) || `post-${Date.now().toString(36)}`;
  const categories = () => [...new Set($('categories').value.split(/[,，]/).map(x => x.trim()).filter(Boolean))].slice(0, 12);
  const setStatus = (message, error = false) => { $('status').textContent = message; $('status').classList.toggle('error', error); };

  async function api(url, options = {}) {
    if (!token) throw new Error('请先连接 GitHub');
    const response = await fetch(url.startsWith('https://') ? url : API + url, {
      ...options,
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      },
      cache: 'no-store',
    });
    if (response.status === 404 && options.allow404) return null;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || `GitHub API 错误 ${response.status}`);
    return data;
  }

  function busyState(value) {
    busy = value;
    for (const id of ['publish', 'save-draft', 'delete', 'connect', 'upload-image']) $(id).disabled = value;
  }

  async function connect() {
    const candidate = $('token').value.trim();
    if (!candidate) return;
    token = candidate;
    $('token').value = '';
    busyState(true);
    try {
      const user = await api('https://api.github.com/user');
      const repo = await api('');
      if (!repo.permissions?.push) throw new Error('这个令牌没有向博客仓库写入文件的权限');
      $('account').textContent = `已连接：${user.login} · ${REPO} · 令牌仅在本次页面中有效`;
      $('auth-panel').hidden = true;
      $('workspace').hidden = false;
      await loadList();
      newPost();
    } catch (error) {
      token = '';
      alert(`连接失败：${error.message}\n请检查令牌是否仅授权此仓库，以及 Contents: Read and write 权限。`);
    } finally {
      busyState(false);
    }
  }

  async function loadList() {
    const catalog = await fetch(`/admin/catalog.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!catalog.ok) throw new Error('文章目录暂时无法读取');
    entries = await catalog.json();
    const draftFiles = await api('/contents/_drafts', { allow404: true });
    draftEntries = Array.isArray(draftFiles) ? draftFiles.filter(f => f.type === 'file' && /\.md$/.test(f.name)).map(f => ({
      path: f.path, title: f.name.replace(/\.md$/, ''), date: '', categories: [], draft: true,
    })) : [];
    renderList();
  }

  function renderList() {
    $('tab-published').classList.toggle('active', selectedTab === 'published');
    $('tab-drafts').classList.toggle('active', selectedTab === 'drafts');
    const needle = $('filter').value.trim().toLocaleLowerCase();
    const list = selectedTab === 'published' ? entries : draftEntries;
    const container = $('post-list');
    container.replaceChildren();
    const filtered = list.filter(p => `${p.title} ${p.path}`.toLocaleLowerCase().includes(needle)).slice(0, 800);
    for (const p of filtered) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'post-entry';
      if (current?.path === p.path) button.classList.add('active');
      const strong = document.createElement('strong'); strong.textContent = `${p.pinned ? '📌 ' : ''}${p.locked ? '🔒 ' : ''}${p.title}`;
      const small = document.createElement('small');
      small.textContent = [p.date, (p.categories || []).join(' / ')].filter(Boolean).join(' · ') || baseName(p.path);
      button.append(strong, small);
      button.addEventListener('click', () => openPost(p.path));
      container.append(button);
    }
    if (!filtered.length) container.textContent = '没有匹配的文章。';
  }

  function frontMatter(text) {
    const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
    return match ? { front: match[1], body: match[2] } : { front: '', body: text };
  }
  function frontValue(front, key) {
    const match = front.match(new RegExp(`^${key}:\\s*(.*)$`, 'm'));
    if (!match) return '';
    const value = match[1].trim();
    if (value.startsWith('"')) { try { return JSON.parse(value); } catch (_) { return value; } }
    if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1).replace(/''/g, "'");
    return value;
  }
  function frontCategories(front) {
    const value = frontValue(front, 'categories');
    if (Array.isArray(value)) return value;
    if (typeof value !== 'string' || !value) return [];
    try { const parsed = JSON.parse(value); if (Array.isArray(parsed)) return parsed; } catch (_) { /* old YAML format */ }
    return value.replace(/^\[|\]$/g, '').split(',').map(c => c.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
  }
  function removeFront(front, key) {
    return front.split('\n').filter(line => !line.startsWith(key + ':')).join('\n');
  }
  const toHex = bytes => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
  async function passwordDigest(password, salt) {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 120000, hash: 'SHA-256' }, key, 256);
    return toHex(bits);
  }
  function updatePasswordVisibility() {
    $('password-options').hidden = !$('password-enabled').checked;
  }
  function setFront(front, key, value) {
    const line = `${key}: ${value}`;
    const re = new RegExp(`^${key}:.*$`, 'm');
    return re.test(front) ? front.replace(re, line) : `${front.trimEnd()}\n${line}`.trimStart();
  }

  function newPost() {
    current = null;
    legacyOriginal = '';
    $('editor-heading').textContent = '写新文章'; $('editor-mode').textContent = '新文章';
    $('title').value = ''; $('slug').value = ''; $('date').value = today();
    $('categories').value = ''; $('body').value = '';
    $('pinned').checked = false;
    $('password-enabled').checked = false;
    $('article-password').value = '';
    $('article-password').placeholder = '输入文章密码';
    updatePasswordVisibility();
    $('slug').disabled = false; $('date').disabled = false;
    $('save-draft').disabled = false; $('delete').hidden = true; $('publish').textContent = '发布文章';
    $('format-hint').textContent = '使用 Markdown 编写正文。可以先保存草稿，稍后再发布。';
    setStatus(''); renderList();
  }

  async function openPost(path) {
    if (busy) return;
    setStatus('正在读取文章…'); busyState(true);
    try {
      const data = await api('/contents/' + path.split('/').map(encodeURIComponent).join('/'));
      const parts = frontMatter(base64utf8(data.content));
      const title = frontValue(parts.front, 'title') || baseName(path).replace(/\.md$|\.html$/, '');
      const importedHtml = path.endsWith('.html');
      legacyOriginal = importedHtml ? parts.body : '';
      current = { path, sha: data.sha, front: parts.front, draft: path.startsWith('_drafts/'), converted: importedHtml };
      $('title').value = title;
      $('slug').value = baseName(path).replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/\.(md|html)$/, '');
      $('date').value = String(frontValue(parts.front, 'date')).slice(0, 10) || today();
      $('categories').value = frontCategories(parts.front).join(', ');
      $('pinned').checked = frontValue(parts.front, 'pinned') === 'true';
      $('password-enabled').checked = !!frontValue(parts.front, 'password_hash');
      $('article-password').value = '';
      $('article-password').placeholder = $('password-enabled').checked ? '留空保持当前密码；输入以更改' : '输入文章密码';
      updatePasswordVisibility();
      $('body').value = importedHtml ? window.legacyHtmlToMarkdown(parts.body) : parts.body;
      $('slug').disabled = true;
      $('date').disabled = !current.draft;
      $('editor-heading').textContent = title;
      $('editor-mode').textContent = current.draft ? '草稿' : '已发表';
      $('delete').hidden = false;
      $('publish').textContent = current.draft ? '发表草稿' : '保存并更新文章';
      $('format-hint').textContent = importedHtml ? '已将迁移文章转换为可编辑的 Markdown 预览。保存时会生成 .md 文件并移除旧 .html 文件；转换可能改变复杂排版，请先核对代码、表格和图片。GitHub 历史保留原文。' : '正文使用 Markdown 格式。';
      $('save-draft').disabled = !current.draft;
      setStatus('文章已载入，可以修改标题、正文和分类。');
      renderList();
    } catch (error) { setStatus('读取失败：' + error.message, true); }
    finally { busyState(false); if (current && !current.draft) $('save-draft').disabled = true; }
  }

  async function buildDocument() {
    const title = $('title').value.trim();
    if (!title) throw new Error('请填写文章标题');
    const slug = $('slug').value.trim().toLowerCase();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error('链接名称只能包含英文字母、数字和短横线');
    const date = $('date').value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('请选择日期');
    const body = $('body').value.trim();
    if (!body) throw new Error('请填写正文');
    let front = current?.front || 'layout: post';
    front = setFront(front, 'layout', 'post');
    front = setFront(front, 'title', JSON.stringify(title));
    if (!current || current.draft) front = setFront(front, 'date', `${date} 00:00:00 +0000`);
    front = setFront(front, 'categories', JSON.stringify(categories()));
    front = setFront(front, 'pinned', $('pinned').checked ? 'true' : 'false');
    if ($('password-enabled').checked) {
      const password = $('article-password').value;
      if (password) {
        if (password.length < 4) throw new Error('文章密码至少需要 4 个字符');
        const salt = crypto.getRandomValues(new Uint8Array(16));
        front = setFront(front, 'password_salt', JSON.stringify(toHex(salt)));
        front = setFront(front, 'password_hash', JSON.stringify(await passwordDigest(password, salt)));
      } else if (!frontValue(front, 'password_hash') || !frontValue(front, 'password_salt')) {
        throw new Error('请先设置文章密码');
      }
    } else {
      front = removeFront(removeFront(front, 'password_hash'), 'password_salt');
    }
    return { title, slug, date, text: `---\n${front.trim()}\n---\n${body}\n` };
  }

  async function putFile(path, text, sha, message) {
    return api('/contents/' + path.split('/').map(encodeURIComponent).join('/'), {
      method: 'PUT',
      body: JSON.stringify({ message, content: utf8base64(text), branch: 'main', ...(sha ? { sha } : {}) }),
    });
  }
  async function deleteFile(path, sha, message) {
    return api('/contents/' + path.split('/').map(encodeURIComponent).join('/'), {
      method: 'DELETE', body: JSON.stringify({ message, sha, branch: 'main' }),
    });
  }

  async function uploadImage() {
    const file = $('image-file').files?.[0];
    if (!file) return setStatus('请先选择图片。', true);
    if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(file.type)) return setStatus('只支持 PNG、JPEG、GIF、WebP 图片。', true);
    if (file.size > 5 * 1024 * 1024) return setStatus('单张图片不能超过 5 MB。', true);
    if (!confirm(`即将把图片“${file.name}”上传到公开的 GitHub 仓库。确认不包含私人或敏感内容吗？`)) return;
    busyState(true); setStatus('正在上传图片…');
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = '';
      for (let i = 0; i < bytes.length; i += 8192)
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' }[file.type];
      const name = `assets/uploads/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
      await api('/contents/' + name, {
        method: 'PUT',
        body: JSON.stringify({ message: `Upload blog image: ${file.name}`, content: btoa(binary), branch: 'main' }),
      });
      const textarea = $('body');
      const label = file.name.replace(/\.[^.]+$/, '').replace(/[\[\]<>]/g, '');
      const snippet = `\n![${label}](/${name})\n`;
      textarea.setRangeText(snippet, textarea.selectionStart, textarea.selectionEnd, 'end');
      $('image-file').value = '';
      setStatus('图片已上传并插入正文。请继续保存草稿或发布文章。');
    } catch (error) { setStatus('图片上传失败：' + error.message, true); }
    finally { busyState(false); if (current && !current.draft) $('save-draft').disabled = true; }
  }

  async function save(publish) {
    if (busy || !token) return;
    let post;
    try { post = await buildDocument(); } catch (error) { return setStatus(error.message, true); }
    if (!publish && current && !current.draft) return setStatus('已发表文章请使用“保存并更新文章”。', true);
    if (publish && current?.converted && !confirm('即将把这篇旧 HTML 文章改为 Markdown，并替换原文件。请确认已检查代码块、图片和复杂排版。原始版本可从 GitHub 历史恢复。是否继续？')) return;
    const path = publish
      ? (current && !current.draft ? (current.converted ? current.path.replace(/\.html$/, '.md') : current.path) : `_posts/${post.date}-${post.slug}.md`)
      : (current?.draft ? current.path : `_drafts/${post.slug}.md`);
    busyState(true); setStatus('正在提交到 GitHub…');
    try {
      const oldPath = current?.path;
      const result = await putFile(path, post.text, current?.path === path ? current.sha : null, `${publish ? 'Publish' : 'Save draft'}: ${post.title}`);
      let warning = '';
      if (publish && current?.converted) {
        try { await deleteFile(current.path, current.sha, `Replace legacy HTML post with Markdown: ${post.title}`); }
        catch (error) { warning = `Markdown 已保存，但旧 HTML 文件未删除；可能出现重复文章。请先处理旧文件：${error.message}`; }
      }
      if (publish && current?.draft) {
        try { await deleteFile(current.path, current.sha, `Remove published draft: ${post.title}`); }
        catch (error) { warning = `文章已发表，但旧草稿未删除：${error.message}`; }
      }
      current = { path, sha: result.content.sha, front: frontMatter(post.text).front, draft: !publish, converted: false };
      legacyOriginal = '';
      $('format-hint').textContent = '正文使用 Markdown 格式。';
      $('editor-mode').textContent = publish ? '已发表' : '草稿';
      $('slug').disabled = true; $('date').disabled = publish;
      $('publish').textContent = publish ? '保存并更新文章' : '发表草稿';
      $('delete').hidden = false;
      $('save-draft').disabled = publish;
      const list = publish ? entries : draftEntries;
      const entry = list.find(p => p.path === path);
      if (entry) Object.assign(entry, { title: post.title, date: post.date, categories: categories(), pinned: $('pinned').checked, locked: $('password-enabled').checked });
      else list.unshift({ path, title: post.title, date: post.date, categories: categories(), pinned: $('pinned').checked, locked: $('password-enabled').checked });
      if (publish && oldPath?.startsWith('_drafts/') && !warning) draftEntries = draftEntries.filter(p => p.path !== oldPath);
      if (publish && oldPath?.endsWith('.html') && !warning) entries = entries.filter(p => p.path !== oldPath);
      selectedTab = publish ? 'published' : 'drafts';
      renderList();
      setStatus(warning || (publish ? '已提交发布！GitHub Pages 通常需要稍等片刻才会显示新文章。' : '草稿已保存到 GitHub（尚未公开发表）。'), !!warning);
    } catch (error) { setStatus('保存失败：' + error.message, true); }
    finally { busyState(false); if (current && !current.draft) $('save-draft').disabled = true; }
  }

  async function remove() {
    if (busy || !current) return;
    const name = $('title').value;
    if (!confirm(`确定删除“${name}”？\n博客会在重新部署后移除该文章。GitHub 提交历史仍可用于恢复。`)) return;
    busyState(true); setStatus('正在删除…');
    try {
      await deleteFile(current.path, current.sha, `Delete post: ${name}`);
      entries = entries.filter(p => p.path !== current.path);
      draftEntries = draftEntries.filter(p => p.path !== current.path);
      newPost(); setStatus('文章已从当前分支删除。网站更新可能需要几分钟。');
    } catch (error) { setStatus('删除失败：' + error.message, true); }
    finally { busyState(false); }
  }

  $('password-enabled').addEventListener('change', updatePasswordVisibility);
  $('connect').addEventListener('click', connect);
  $('token').addEventListener('keydown', event => { if (event.key === 'Enter') connect(); });
  $('disconnect').addEventListener('click', () => { token = ''; current = null; $('workspace').hidden = true; $('auth-panel').hidden = false; $('token').value = ''; });
  $('new-post').addEventListener('click', newPost);
  $('tab-published').addEventListener('click', () => { selectedTab = 'published'; renderList(); });
  $('tab-drafts').addEventListener('click', () => { selectedTab = 'drafts'; renderList(); });
  $('filter').addEventListener('input', renderList);
  $('save-draft').addEventListener('click', () => save(false));
  $('publish').addEventListener('click', () => save(true));
  $('delete').addEventListener('click', remove);
  $('upload-image').addEventListener('click', uploadImage);
  $('title').addEventListener('input', () => { if (!current) $('slug').value = slugify($('title').value); });
  $('date').value = today();
})();
