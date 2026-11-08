/* Deliberately lightweight static-site gate: page/source content is public. */
(() => {
  const gate = document.getElementById('post-password-gate');
  if (!gate) return;
  const input = document.getElementById('post-password');
  const form = document.getElementById('post-password-form');
  const error = document.getElementById('post-password-error');
  const body = document.getElementById('protected-post-body');
  const salt = gate.dataset.salt;
  const expected = gate.dataset.hash;
  const hex = bytes => [...new Uint8Array(bytes)].map(v => v.toString(16).padStart(2, '0')).join('');
  const fromHex = value => new Uint8Array((value.match(/.{2}/g) || []).map(v => parseInt(v, 16)));
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const password = input.value;
    if (!password) return;
    const submit = form.querySelector('button');
    submit.disabled = true;
    error.textContent = '正在验证…';
    try {
      const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
      const result = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: fromHex(salt), iterations: 120000, hash: 'SHA-256' }, key, 256);
      if (hex(result) === expected) {
        gate.hidden = true;
        body.hidden = false;
        input.value = '';
        if (window.MathJax?.typesetPromise) window.MathJax.typesetPromise([body]);
      } else error.textContent = '密码错误，请重试。';
    } catch (_) { error.textContent = '验证失败，请使用支持 Web Crypto 的 HTTPS 浏览器。'; }
    finally { submit.disabled = false; }
  });
})();