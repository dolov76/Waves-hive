/* Захищене сховище posting key: шифрування паролем (PBKDF2 + AES-GCM), ключ у відкритому вигляді не зберігається. */
const Sec = (() => {
  const K = 'hive_vault', enc = new TextEncoder(), dec = new TextDecoder();
  const b64 = a => btoa(String.fromCharCode(...new Uint8Array(a)));
  const unb = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const read = () => { try { return JSON.parse(localStorage.getItem(K)); } catch (e) { return null; } };

  const st = document.createElement('style');
  st.textContent = `.sec-ov{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:50;display:flex;align-items:center;justify-content:center;padding:16px}
  .sec-box{background:#fff;color:#111;border-radius:14px;padding:18px;max-width:420px;width:100%;font:15px/1.4 system-ui,sans-serif}
  @media(prefers-color-scheme:dark){.sec-box{background:#1d1d20;color:#eee}}
  html[data-theme="dark"] .sec-box{background:#1d1d20;color:#eee}html[data-theme="light"] .sec-box{background:#fff;color:#111}
  .sec-box p{margin:6px 0;font-size:13px;opacity:.8}.sec-box input{width:100%;padding:10px;margin:6px 0;font:inherit;border:1px solid #8885;border-radius:8px;background:transparent;color:inherit;box-sizing:border-box}
  .sec-e{color:#d33;min-height:1.3em;font-size:13px}.sec-b{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}
  .sec-b button{padding:9px 14px;border-radius:8px;border:1px solid #8885;background:transparent;color:inherit;font:inherit}
  .sec-b .sec-p{background:#c8102e;border-color:#c8102e;color:#fff;font-weight:600}`;
  document.head.append(st);

  async function derive(pw, salt) {
    const base = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 250000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function save(user, wif, pw) {
    if (!(window.crypto && crypto.subtle)) throw new Error('Шифрування недоступне в цьому браузері або на цій адресі (потрібен https).');
    const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await derive(pw, salt), enc.encode(wif));
    localStorage.setItem(K, JSON.stringify({ u: user, s: b64(salt), i: b64(iv), c: b64(ct) }));
    ['ht_k', 'hp_k'].forEach(x => localStorage.removeItem(x));
    localStorage.setItem('ht_u', user);
  }
  async function open(pw) {
    const v = read(), pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb(v.i) }, await derive(pw, unb(v.s)), unb(v.c));
    return { user: v.u, wif: dec.decode(pt) };
  }
  const clear = () => ['hive_vault', 'ht_k', 'hp_k', 'ht_u', 'hp_u'].forEach(x => localStorage.removeItem(x));

  function ask(o) {
    return new Promise(res => {
      const ov = document.createElement('div'); ov.className = 'sec-ov';
      ov.innerHTML = '<div class="sec-box"><b></b><p></p><div class="sec-f"></div><div class="sec-e"></div><div class="sec-b"></div></div>';
      ov.querySelector('b').textContent = o.title; ov.querySelector('p').textContent = o.text || '';
      const inputs = {}, err = ov.querySelector('.sec-e'), bar = ov.querySelector('.sec-b');
      o.fields.forEach(f => { const i = document.createElement('input'); i.type = 'password'; i.placeholder = f.ph; i.autocomplete = 'off'; inputs[f.id] = i; ov.querySelector('.sec-f').append(i); });
      const close = v => { ov.remove(); res(v); };
      const btn = (t, cls, fn) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = t; b.className = cls; b.onclick = fn; bar.append(b); };
      btn(o.ok, 'sec-p', async () => {
        const vals = {}; for (const k in inputs) vals[k] = inputs[k].value;
        try { close(await o.onOk(vals)); } catch (e) { err.textContent = e.message || String(e); }
      });
      if (o.cancel) btn(o.cancel, '', () => close(null));
      (o.extra || []).forEach(x => btn(x.t, '', () => x.fn(close)));
      document.body.append(ov); const f = Object.values(inputs)[0]; if (f) f.focus();
    });
  }

  return {
    has: () => !!read(), user: () => (read() || {}).u || '', save, clear,
    async verify(client, user, wif) {
      let pub; try { pub = dhive.PrivateKey.fromString(wif).createPublic().toString(); } catch (e) { return { ok: false, msg: 'Невірний формат ключа.' }; }
      const [a] = await client.database.getAccounts([user]);
      if (!a) return { ok: false, msg: 'Акаунт «' + user + '» не знайдено.' };
      const has = x => (x.key_auths || []).some(k => String(k[0]) === pub);
      if (has(a.owner)) return { ok: false, msg: 'Це OWNER key. Його не можна вводити в застосунки. Потрібен лише posting key.' };
      if (has(a.active)) return { ok: false, msg: 'Це ACTIVE key. Він дає доступ до коштів. Потрібен лише posting key.' };
      if (String(a.memo_key) === pub) return { ok: false, msg: 'Це memo key. Потрібен posting key.' };
      if (!has(a.posting)) return { ok: false, msg: 'Цей ключ не збігається з posting key акаунта.' };
      return { ok: true };
    },
    unlockUI(note) {
      return ask({ title: 'Розблокувати ключ', text: note || 'Введіть пароль, щоб користуватися збереженим posting key.', fields: [{ id: 'pw', ph: 'Пароль' }],
        ok: 'Розблокувати', cancel: 'Пізніше',
        onOk: async v => { try { return await open(v.pw); } catch (e) { throw new Error('Невірний пароль.'); } },
        extra: [{ t: 'Забув пароль', fn: close => { if (confirm('Видалити збережений ключ з цього пристрою? Його можна буде ввести знову.')) { clear(); close(null); } } }] });
    },
    setupUI(user, wif) {
      return ask({ title: 'Захистіть ключ паролем', text: 'Ключ буде зашифровано й збережено лише на цьому пристрої. Забутий пароль відновити неможливо, доведеться ввести ключ знову.',
        fields: [{ id: 'p1', ph: 'Пароль (щонайменше 8 символів)' }, { id: 'p2', ph: 'Повторіть пароль' }], ok: 'Зберегти', cancel: 'Лише на цей сеанс',
        onOk: async v => {
          if (v.p1.length < 8) throw new Error('Пароль має містити щонайменше 8 символів.');
          if (v.p1 !== v.p2) throw new Error('Паролі не збігаються.');
          await save(user, wif, v.p1); return true;
        } });
    },
    autolock(fn, minutes) {
      let t = 0;
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) t = Date.now(); else if (t && Date.now() - t > minutes * 60000) { t = 0; fn(); }
      });
    }
  };
})();
