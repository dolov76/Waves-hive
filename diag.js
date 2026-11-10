/* Діагностика: по кроках перевіряє середовище, вузли Hive, стрічки, акаунт, фото й сервіси. Ключі у звіт не потрапляють. */
const Diag = (() => {
  const now = () => performance.now();
  async function step(name, fn, out) {
    const t = now(); let line;
    try {
      const info = await Promise.race([fn(), new Promise((_, r) => setTimeout(() => r(new Error('таймаут 12 с')), 12000))]);
      line = `✓ ${name}${info ? ': ' + info : ''} (${Math.round(now() - t)} мс)`;
    } catch (e) { line = `✗ ${name}: ${e.message || e}`; }
    out(line); return line;
  }
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
    log('Hive діагностика · ' + new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC');

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

    for (const u of ['https://api.hive.blog', 'https://api.deathwing.me', 'https://api.openhive.network', 'https://hive-api.arcange.eu']) {
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
        if (!r || !r[0]) throw new Error('постів не знайдено');
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
    await S('Фото стороннього сайту (через проксі Hive)', () => imgOk('https://images.hive.blog/0x0/https://www.google.com/favicon.ico'));
    await S('Сервіс фото images.hive.blog (завантаження)', () => reach('https://images.hive.blog/'));
    await S('3Speak embed (завантаження відео)', () => reach('https://embed.3speak.tv/video/diag'));

    log('— кінець —');
    return lines.join('\n');
  }
  return { run };
})();
