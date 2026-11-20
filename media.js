/* Завантаження медіа: фото на images.hive.blog (зі стисненням і підписом) та відео на 3Speak. Потрібні dhive, tus. */
async function shrink(file, max = 2048) {
  try {
    const bmp = await createImageBitmap(file), k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    return (await new Promise(r => c.toBlob(r, 'image/jpeg', 0.88))) || file;
  } catch (e) { return file; }
}
async function digest(b) {
  if (dhive.cryptoUtils && dhive.cryptoUtils.sha256) return dhive.cryptoUtils.sha256(b);
  return new Uint8Array(await crypto.subtle.digest('SHA-256', b));
}
/* Копіює вибрані файли в пам'ять одразу після вибору: Android може «забути» доступ до оригіналу, поки ви редагуєте інше фото. */
async function snapshotFiles(list, onErr) {
  const out = [];
  for (const f of list) {
    try { out.push(new File([await f.arrayBuffer()], f.name, { type: f.type, lastModified: f.lastModified })); }
    catch (e) { if (onErr) onErr(f.name || 'файл', e); }
  }
  return out;
}
/* w = { author, key }; у головному застосунку можна не передавати: тоді береться поточний me/key */
async function uploadImage(file, w) {
  if (!w) w = { author: me, key };
  const blob = await shrink(file), data = new Uint8Array(await blob.arrayBuffer());
  const pre = new TextEncoder().encode('ImageSigningChallenge'), all = new Uint8Array(pre.length + data.length);
  all.set(pre); all.set(data, pre.length);
  const sig = w.key.sign(await digest(all)).toString(), fd = new FormData(); fd.append('file', blob, 'photo.jpg');
  const r = await fetch(`https://images.hive.blog/${w.author}/${sig}`, { method: 'POST', body: fd });
  if (!r.ok) throw new Error('сервер відповів ' + r.status);
  const j = await r.json(); if (!j.url) throw new Error('немає посилання у відповіді'); return j.url;
}

/* відео 3Speak */
function tusUpload(file, owner, apiKey, short, onProgress) {
  return new Promise((resolve, reject) => {
    let embed = '';
    new tus.Upload(file, {
      endpoint: 'https://embed.3speak.tv/uploads', retryDelays: [0, 2000, 5000],
      headers: { 'X-API-Key': apiKey },
      metadata: { filename: file.name, filetype: file.type, owner, frontend_app: 'my-hive-app', short: short ? 'true' : 'false' },
      onError: reject,
      onProgress: (a, b) => onProgress(Math.round(a / b * 100)),
      onAfterResponse: (req, res) => { const h = res.getHeader('X-Embed-URL'); if (h) embed = h; },
      onSuccess: () => embed ? resolve(embed) : reject(new Error('сервер не повернув посилання на відео'))
    }).start();
  });
}
const watchUrl = u => u.replace('/embed?', '/watch?');
async function pollVideo(embed, out) {
  const pl = embed.split('/').pop();
  for (let i = 0; i < 90; i++) {
    await new Promise(r => setTimeout(r, 5000));
    try {
      const v = await (await fetch('https://embed.3speak.tv/video/' + pl)).json();
      if (v.status === 'published') return out('Відео готове до перегляду.', 'ok');
      if (v.status === 'failed') return out('Кодування відео не вдалося.', 'err');
      out('Кодування відео: ' + (v.encodingProgress != null ? v.encodingProgress + '%' : v.status));
    } catch (e) { return; }
  }
}
function pickVideo(ta, owner, apiKey, out) {
  const pos = ta.selectionStart, end = ta.selectionEnd;
  const f = document.createElement('input'); f.type = 'file'; f.accept = 'video/*';
  f.onchange = async () => {
    const file = f.files[0]; if (!file) return;
    const short = confirm('Це коротке відео до 60 секунд (Shorts)?\nОК: так. Скасувати: звичайне відео.');
    try {
      const embed = await tusUpload(file, owner, apiKey, short, n => out('Відео: ' + n + '%'));
      const ins = '\n' + watchUrl(embed) + '\n';
      ta.value = ta.value.slice(0, pos) + ins + ta.value.slice(end);
      ta.focus(); ta.selectionStart = ta.selectionEnd = pos + ins.length; if (ta.oninput) ta.oninput();
      out('Відео завантажено, іде кодування.', 'ok'); pollVideo(embed, out);
    } catch (e) { out('Не вдалося: ' + (e.message || e), 'err'); }
  };
  f.click();
}
