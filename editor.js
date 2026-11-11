/* Простий редактор фото перед завантаженням: обертання, відзеркалення, кадрування, світло/колір, фільтри, підпис. */
const Editor = (() => {
  const st = document.createElement('style');
  st.textContent = `.ed{position:fixed;inset:0;z-index:60;background:#000;color:#eee;display:flex;flex-direction:column;font:15px/1.4 system-ui,sans-serif}
  .ed-top{display:flex;justify-content:space-between;align-items:center;padding:10px 12px}
  .ed-top button{background:none;border:0;color:#aaa;font:inherit;padding:6px 4px}.ed-top .ed-p{background:#c8102e;color:#fff;border-radius:18px;padding:7px 18px;font-weight:600}
  .ed-stage{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;padding:0 8px}
  .ed-stage canvas{max-width:100%;max-height:100%;touch-action:none;border-radius:4px}
  .ed-tools{max-height:46%;overflow:auto;padding:8px 12px 14px}
  .ed-row{display:flex;gap:6px;overflow-x:auto;margin:6px 0;padding-bottom:2px}
  .ed-row button,.ed-skip{flex:none;background:#26262a;color:#eee;border:0;border-radius:16px;padding:6px 13px;font:inherit}
  .ed-row button.on{background:#eee;color:#111}.ed-skip{width:100%;margin-top:10px;background:none;border:1px solid #555;border-radius:10px;padding:9px}
  .ed-tools label{display:block;font-size:13px;color:#aaa;margin-top:6px}.ed-tools input[type=range]{width:100%;accent-color:#ff5470}
  .ed-wm{width:100%;box-sizing:border-box;margin-top:8px;padding:9px;font:inherit;background:#1d1d20;color:#eee;border:1px solid #444;border-radius:8px}`;
  document.head.append(st);

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const FILTERS = { none: '', bw: 'grayscale(1)', warm: 'sepia(.25) saturate(1.15)', drama: 'contrast(1.2) saturate(1.2)' };

  function draw(cv, img, S, max) {
    const odd = S.rot % 2 === 1, iw = odd ? img.height : img.width, ih = odd ? img.width : img.height;
    const ar = S.ar || iw / ih;
    let fw = ar >= 1 ? max : max * ar, fh = ar >= 1 ? max / ar : max;
    cv.width = Math.max(1, Math.round(fw)); cv.height = Math.max(1, Math.round(fh)); fw = cv.width; fh = cv.height;
    const ctx = cv.getContext('2d'), k = Math.max(fw / iw, fh / ih) * S.zoom;
    const maxX = Math.max(0, (iw * k - fw) / 2), maxY = Math.max(0, (ih * k - fh) / 2);
    const ox = clamp(S.ox * fw, -maxX, maxX), oy = clamp(S.oy * fh, -maxY, maxY);
    S.ox = maxX ? ox / fw : 0; S.oy = maxY ? oy / fh : 0;
    ctx.save();
    ctx.filter = `brightness(${S.b}) contrast(${S.c}) saturate(${S.s}) ${FILTERS[S.f]}`.trim();
    ctx.translate(fw / 2 + ox, fh / 2 + oy); ctx.rotate(S.rot * Math.PI / 2); ctx.scale(S.flip ? -1 : 1, 1);
    ctx.drawImage(img, -img.width * k / 2, -img.height * k / 2, img.width * k, img.height * k);
    ctx.restore();
    if (S.wm) {
      const fs = Math.max(12, Math.round(fw * 0.035));
      ctx.font = `600 ${fs}px system-ui, sans-serif`; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
      ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = fs * 0.3; ctx.fillStyle = 'rgba(255,255,255,.88)';
      ctx.fillText(S.wm, fw - fs * 0.7, fh - fs * 0.6);
    }
  }

  function edit(file, label) {
    return new Promise(async res => {
      let img; try { img = await createImageBitmap(file); } catch (e) { return res(file); }
      const S = { rot: 0, flip: false, ar: 0, zoom: 1, ox: 0, oy: 0, b: 1, c: 1, s: 1, f: 'none', wm: '' };
      const ov = document.createElement('div'); ov.className = 'ed';
      ov.innerHTML = `<div class="ed-top"><button data-a="cancel">Скасувати</button><b></b><button data-a="done" class="ed-p">Готово</button></div>
        <div class="ed-stage"><canvas></canvas></div>
        <div class="ed-tools">
          <div class="ed-row"><button data-a="rl">⟲</button><button data-a="rr">⟳</button><button data-a="fl">⇋</button>
            <button data-ar="0" class="on">Оригінал</button><button data-ar="1">1:1</button><button data-ar="0.8">4:5</button><button data-ar="1.5">3:2</button><button data-ar="1.7778">16:9</button></div>
          <div class="ed-row"><button data-f="none" class="on">Без фільтра</button><button data-f="bw">Ч/Б</button><button data-f="warm">Тепле</button><button data-f="drama">Драма</button></div>
          <label>Яскравість<input type="range" data-k="b" min="0.6" max="1.6" step="0.01" value="1"></label>
          <label>Контраст<input type="range" data-k="c" min="0.6" max="1.6" step="0.01" value="1"></label>
          <label>Насиченість<input type="range" data-k="s" min="0" max="2" step="0.01" value="1"></label>
          <label>Масштаб (тягніть фото, щоб змінити кадр)<input type="range" data-k="zoom" min="1" max="3" step="0.01" value="1"></label>
          <input class="ed-wm" placeholder="Підпис на фото (необов'язково)">
          <button data-a="asis" class="ed-skip">Завантажити без змін</button>
        </div>`;
      ov.querySelector('b').textContent = 'Фото ' + (label || '');
      const cv = ov.querySelector('canvas');
      let raf = 0; const render = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => draw(cv, img, S, 900)); };
      const done = v => { cancelAnimationFrame(raf); ov.remove(); if (img.close) img.close(); res(v); };
      ov.addEventListener('click', e => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.a === 'cancel') return done(null);
        if (b.dataset.a === 'asis') return done(file);
        if (b.dataset.a === 'done') {
          const out = document.createElement('canvas'); draw(out, img, S, Math.min(2048, Math.max(img.width, img.height)));
          return out.toBlob(bl => done(bl || file), 'image/jpeg', 0.9);
        }
        if (b.dataset.a === 'rl') { S.rot = (S.rot + 3) % 4; S.ox = S.oy = 0; }
        if (b.dataset.a === 'rr') { S.rot = (S.rot + 1) % 4; S.ox = S.oy = 0; }
        if (b.dataset.a === 'fl') S.flip = !S.flip;
        if (b.dataset.ar !== undefined) { S.ar = parseFloat(b.dataset.ar); S.ox = S.oy = 0; ov.querySelectorAll('[data-ar]').forEach(x => x.classList.toggle('on', x === b)); }
        if (b.dataset.f) { S.f = b.dataset.f; ov.querySelectorAll('[data-f]').forEach(x => x.classList.toggle('on', x === b)); }
        render();
      });
      ov.addEventListener('input', e => {
        if (e.target.dataset.k) S[e.target.dataset.k] = parseFloat(e.target.value);
        if (e.target.classList.contains('ed-wm')) S.wm = e.target.value.trim();
        render();
      });
      let drag = null;
      cv.onpointerdown = e => { cv.setPointerCapture(e.pointerId); drag = { x: e.clientX, y: e.clientY }; };
      cv.onpointermove = e => { if (!drag) return; S.ox += (e.clientX - drag.x) / cv.clientWidth; S.oy += (e.clientY - drag.y) / cv.clientHeight; drag = { x: e.clientX, y: e.clientY }; render(); };
      cv.onpointerup = cv.onpointercancel = () => { drag = null; };
      document.body.append(ov); render();
    });
  }
  return { edit };
})();
