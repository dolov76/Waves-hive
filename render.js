/* Показ контенту: Markdown (також усередині HTML-обгорток), безпечне очищення, зображення (проксі й запасні адреси), відео-плеєри. Потрібні marked, DOMPurify, diag.js. */
/* Markdown усередині HTML-обгорток (<center>, <div>), як у PeakD/Ecency: блоковий HTML не «замикає» розмітку */
marked.use({ tokenizer: { html() { return undefined; } } });
const md = t => {
  const d = document.createElement('div');
  d.innerHTML = DOMPurify.sanitize(marked.parse(t, { breaks: true }), { ADD_TAGS: ['iframe'], ADD_ATTR: ['allowfullscreen', 'allow', 'frameborder'] });
  richify(d); return d.innerHTML;
};
const HOSTED = /^https:\/\/(images\.hive\.blog|images\.ecency\.com|img\.ecency\.com)\//i;
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function b58(bytes) {
  let n = 0n; for (const b of bytes) n = n * 256n + BigInt(b);
  let s = ''; while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; }
  for (const b of bytes) { if (b === 0) s = '1' + s; else break; }
  return s;
}
const proxyUrl = u => 'https://images.hive.blog/p/' + b58(new TextEncoder().encode(u));
const VIDEO_RE = /https?:\/\/(?:(?:play\.)?3speak\.tv\/(?:watch|embed)\?v=[\w.\/-]+|(?:www\.)?youtube\.com\/watch\?[^\s)"'<]+|youtu\.be\/[\w-]{11})/i;
const ytEmbed = u => { const m = u.match(/(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/); return m ? 'https://www.youtube-nocookie.com/embed/' + m[1] : ''; };
const spEmbed = u => { const m = u.match(/^https?:\/\/(?:play\.)?3speak\.tv\/(?:watch|embed)\?v=([\w.-]+\/[\w-]+)/i); return m ? 'https://play.3speak.tv/embed?v=' + m[1] : ''; };
function vplay(src, th) {
  const b = document.createElement('div'); b.className = 'vp'; b.dataset.src = src;
  if (th) { const i = document.createElement('img'); i.alt = ''; i.loading = 'lazy'; i.src = th; b.append(i); }
  const p = document.createElement('b'); p.textContent = '▶'; b.append(p); return b;
}
function richify(root) {
  root.querySelectorAll('img').forEach(im => {
    let src = im.getAttribute('src') || ''; if (!src) return;
    if (src.startsWith('//')) src = 'https:' + src;
    if (src.startsWith('ipfs://')) src = 'https://ipfs.io/ipfs/' + src.slice(7);
    const lg = src.match(/^https?:\/\/images\.hive\.blog\/\d+x\d+\/(https?:\/\/.+)$/i);
    if (lg) src = lg[1];
    if (/^https?:\/\//i.test(src)) src = src.replace(/^http:/i, 'https:');
    if (/^https?:\/\//i.test(src) && !HOSTED.test(src)) im.dataset.o = src;
    im.src = src;
    im.referrerPolicy = 'no-referrer';
    im.loading = 'lazy'; im.removeAttribute('width'); im.removeAttribute('height');
  });
  root.querySelectorAll('a[href]').forEach(a => {
    const h = a.getAttribute('href') || '', e = spEmbed(h) || ytEmbed(h); if (!e) return;
    const im = a.querySelector('img');
    let th = im ? im.getAttribute('src') : '';
    if (!th && e.includes('youtube')) th = 'https://img.youtube.com/vi/' + e.split('/').pop() + '/hqdefault.jpg';
    a.replaceWith(vplay(e, th));
  });
  root.querySelectorAll('iframe').forEach(f => {
    const s = f.getAttribute('src') || '';
    const e = spEmbed(s) || ytEmbed(s) || (/^https:\/\/(player\.vimeo\.com\/video\/|odysee\.com\/\$\/embed\/|rumble\.com\/embed\/|www\.bitchute\.com\/embed\/)/i.test(s) ? s : '');
    if (e) f.replaceWith(vplay(e, '')); else f.remove();
  });
}
function playVp(b) {
  if (b.querySelector('iframe')) return;
  const f = document.createElement('iframe'), s = b.dataset.src;
  f.src = s.includes('youtube') ? s + '?autoplay=1' : s;
  f.allow = 'autoplay; fullscreen; picture-in-picture; encrypted-media'; f.allowFullscreen = true;
  f.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation allow-popups');
  b.textContent = ''; b.append(f);
}
document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('.vp'); if (b) { e.stopPropagation(); e.preventDefault(); playVp(b); } }, true);
document.addEventListener('error', e => {
  const im = e.target; if (!im || im.tagName !== 'IMG' || im.closest('.vp, .prof, .av, .nt, #acc')) return;
  const step = +(im.dataset.t || 0);
  if (step === 0 && im.dataset.o) { im.dataset.t = 1; im.src = proxyUrl(im.dataset.o); return; }
  if (step <= 1 && /\/\/images\.ecency\.com\//i.test(im.src)) { im.dataset.t = 2; im.src = im.src.replace('//images.ecency.com/', '//img.ecency.com/'); return; }
  im.alt = 'Фото недоступне'; im.classList.add('imgfail'); Diag.log('Фото не завантажилось: ' + (im.dataset.o || im.src).slice(0, 160));
}, true);
