/* Діагностика: по кроках перевіряє середовище, вузли Hive, стрічки, акаунт, фото й сервіси. Ключі у звіт не потрапляють. */
const APP_VERSION = '2026.11.11-2';
const Diag = (() => {
  const now = () => performance.now();
  const KEY = 'hive_errlog';
  const scrub = x => String(x).replace(/5[HJK][1-9A-HJ-NP-Za-km-z]{49}/g, '[ключ приховано]').slice(0, 300);
  const errors = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; } };
  const log = m => {
    try {
      const l = errors(), t = new Date().toISOString().slice(0, 19), txt = scrub(m);
      if (l.length && l[l.length - 1].m === txt) return;
      l.push({ t, m: txt }); localStorage.setItem(KEY, JSON.stringify(l.slice(-30)));
    } catch (e) {}
  };
  const clear = () => { try { localStorage.removeItem(KEY); } catch (e) {} };
  window.addEventListener('error', e => log((e.message || 'помилка') + (e.filename ? ' @' + e.filename.split('/').pop() + ':' + e.lineno : '')));
  window.addEventListener('unhandledrejection', e => log('Promise: ' + ((e.reason && e.reason.message) || e.reason)));
  async function step(name, fn, out) {
    const t = now(); let line;
    try {
      const info = await Promise.race([fn(), new Promise((_, r) => setTimeout(() => r(new Error('таймаут 12 с')), 12000))]);
      line = `✓ ${name}${info ? ': ' + info : ''} (${Math.round(now() - t)} мс)`;
    } catch (e) { line = `✗ ${name}: ${e.message || e}`; }
    out(line); return line;
  }
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function b58(bytes) {
  let n = 0n; for (const b of bytes) n = n * 256n + BigInt(b);
  let s = ''; while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; }
  for (const b of bytes) { if (b === 0) s = '1' + s; else break; }
  return s;
}
const proxyUrl = u => 'https://images.hive.blog/p/' + b58(new TextEncoder().encode(u));
  const imgOk = u => new Promise((res, rej) => {
    const i = new Image(), t = setTimeout(() => rej(new Error('таймаут')), 9000);
    i.onload = () => { clearTimeout(t); res(); }; i.onerror = () => { clearTimeout(t); rej(new Error('не завантажилось')); };
    i.referrerPolicy = 'no-referrer'; i.src = u;
  });
  async function reach(url) {
    try { await fetch(url, { mode: 'no-cors' }); } catch (e) { throw new Error('сервер недоступний'); }
    try { await fetch(url); return 'сервер відповідає, CORS дозволено'; }
    catch (e) { return 'сервер відповідає, але CORS заборонено (завантаження з браузера може блокуватись)'; }
  }
  async function run({ client, me, key, out }) {
    const lines = [];
    const log = l => { out(l); lines.push(l); };
    const S = async (n, f) => { lines.push(await step(n, f, out)); };
    log('Hive діагностика · ' + new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC · версія ' + APP_VERSION);

    await S('Середовище', async () => `${location.protocol}//${location.host || 'локальний файл'}, secureContext=${window.isSecureContext}, онлайн=${navigator.onLine}`);
    await S('Сховище браузера', async () => { localStorage.setItem('_dg', '1'); if (localStorage.getItem('_dg') !== '1') throw new Error('не читається'); localStorage.removeItem('_dg'); return 'ок'; });
    await S('Шифрування (WebCrypto)', async () => { if (!(window.crypto && crypto.subtle)) throw new Error('недоступне (потрібна захищена адреса https)'); return 'доступне'; });
    await S('Service worker', async () => {
      if (!('serviceWorker' in navigator)) throw new Error('не підтримується');
      return (await navigator.serviceWorker.getRegistration()) ? 'зареєстрований' : 'не зареєстрований (нормально для локального файлу)';
    });
    await S('Бібліотеки', async () => {
      const miss = ['dhive', 'marked', 'DOMPurify', 'tus'].filter(x => typeof window[x] === 'undefined');
      if (miss.length) throw new Error('не завантажено: ' + miss.join(', ')); return 'усі завантажені';
    });

    for (const u of ['https://api.hive.blog', 'https://api.deathwing.me', 'https://api.openhive.network']) {
      await S('Вузол ' + u.replace('https://', ''), async () => {
        const g = await new dhive.Client([u], { timeout: 8000 }).database.getDynamicGlobalProperties();
        return `блок ${g.head_block_number}, відставання ${Math.max(0, Math.round((Date.now() - new Date(g.time + 'Z')) / 1000))} с`;
      });
    }
    await S('Стрічка постів (bridge)', async () => {
      const r = await client.call('bridge', 'get_ranked_posts', { sort: 'created', tag: '', limit: 1 });
      if (!r || !r.length) throw new Error('порожня відповідь'); return 'ок';
    });
    for (const h of ['hive.flow', 'ecency.waves']) {
      await S('Контейнер хвиль ' + h, async () => {
        const r = await client.call('bridge', 'get_account_posts', { sort: 'posts', account: h, limit: 1 });
        if (!r || !r[0]) throw new Error('постів не знайдено' + (h === 'hive.flow' ? ' (зараз не використовується, це нормально)' : ''));
        return `${r[0].permlink}, відповідей ${r[0].children}, вік ${Math.round((Date.now() - new Date(r[0].created + 'Z')) / 3600000)} год`;
      });
    }

    if (me) {
      await S('Акаунт @' + me, async () => { const [a] = await client.database.getAccounts([me]); if (!a) throw new Error('не знайдено'); return 'існує'; });
      await S('Сила голосу й ресурси', async () => {
        const [a] = await client.database.getAccounts([me]);
        let s = 'сила голосу ' + (client.rc.calculateVPMana(a).percentage / 100).toFixed(1) + '%';
        try { s += ', RC ' + ((await client.rc.getRCMana(me)).percentage / 100).toFixed(1) + '%'; } catch (e) {}
        return s;
      });
      await S('Сповіщення', async () => { const u = await client.call('bridge', 'unread_notifications', { account: me }); return 'нових ' + ((u && u.unread) || 0); });
    } else log('– Акаунт: нік не вказано, кроки акаунта пропущено');

    if (me && key) {
      await S('Posting key', async () => { const v = await Sec.verify(client, me, key); if (!v.ok) throw new Error(v.msg); return 'відповідає акаунту'; });
      await S('Підпис для завантаження фото', async () => {
        if (!(dhive.cryptoUtils && dhive.cryptoUtils.sha256)) throw new Error('sha256 у dhive недоступний (буде резервний шлях)');
        const s = dhive.PrivateKey.fromString(key).sign(dhive.cryptoUtils.sha256('diag')).toString();
        return s.length === 130 ? 'ок' : 'незвична довжина підпису';
      });
    } else log('– Posting key: не введено або заблоковано, перевірку пропущено');

    await S('Фото images.hive.blog', () => imgOk('https://images.hive.blog/u/hiveio/avatar/small'));
    await S('Фото images.ecency.com', () => imgOk('https://images.ecency.com/u/ecency/avatar/small'));
    await S('Фото стороннього сайту (напряму)', () => imgOk('https://www.google.com/favicon.ico'));
    await S('Фото стороннього сайту (через проксі Hive)', () => imgOk(proxyUrl('https://www.google.com/favicon.ico')));
    await S('Сервіс фото images.hive.blog (завантаження)', () => reach('https://images.hive.blog/'));
    await S('3Speak embed (завантаження відео)', () => reach('https://embed.3speak.tv/video/diag'));

    const errs = errors();
    log(errs.length ? '— Останні помилки застосунку (' + errs.length + ') —' : '— Журнал помилок порожній —');
    errs.slice(-10).forEach(x => log('! ' + x.t.slice(5, 16).replace('T', ' ') + ' ' + x.m));
    log('— кінець —');
    return lines.join('\n');
  }
  return { run, log, errors, clear };
})();
