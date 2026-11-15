/* Резервна копія: експорт/імпорт чернеток, шаблонів, закладок і налаштувань. Ключі, паролі й API-ключі в копію не потрапляють. */
const Backup = (() => {
  const KEYS = ['hp_drafts', 'hp_tpls', 'ht_bm', 'ht_w', 'ht_wfix', 'hive_lock_min', 'hive_theme', 'hp_t', 'hp_b'];
  const parseArr = s => { try { const v = JSON.parse(s); return Array.isArray(v) ? v : []; } catch (e) { return []; } };
  const arr = k => parseArr(localStorage.getItem(k));
  const okDraft = d => d && typeof d === 'object' && typeof d.id === 'string' && typeof d.name === 'string';
  const okBm = b => b && typeof b === 'object' && typeof b.author === 'string' && typeof b.permlink === 'string';
  const counts = () => ({ drafts: arr('hp_drafts').length, tpls: arr('hp_tpls').length, bm: arr('ht_bm').length });

  function exportFile() {
    const data = {}; KEYS.forEach(k => { const v = localStorage.getItem(k); if (v !== null) data[k] = v; });
    const out = { app: 'hive-app', v: 1, date: new Date().toISOString(), data };
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(out)], { type: 'application/json' }));
    a.download = 'hive-backup-' + out.date.slice(0, 10) + '.json';
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    localStorage.setItem('hive_lastbackup', out.date);
    return counts();
  }

  async function readFile(file) {
    if (!file) throw new Error('Файл не вибрано.');
    if (file.size > 5e6) throw new Error('Файл завеликий для резервної копії.');
    let j; try { j = JSON.parse(await file.text()); } catch (e) { throw new Error('Це не файл резервної копії.'); }
    if (!j || j.app !== 'hive-app' || !j.data || typeof j.data !== 'object') throw new Error('Це не файл резервної копії цього застосунку.');
    return j.data;
  }
  function incoming(d) {
    return { drafts: parseArr(d.hp_drafts).filter(okDraft), tpls: parseArr(d.hp_tpls).filter(okDraft), bm: parseArr(d.ht_bm).filter(okBm) };
  }
  function apply(d) {
    const inc = incoming(d), added = { drafts: 0, tpls: 0, bm: 0 };
    const merge = (key, list, idf, field) => {
      const cur = arr(key), seen = new Set(cur.map(idf)); let n = 0;
      list.forEach(x => { const id = idf(x); if (!seen.has(id)) { cur.push(x); seen.add(id); n++; } });
      if (n) localStorage.setItem(key, JSON.stringify(cur)); added[field] = n;
    };
    merge('hp_drafts', inc.drafts, x => x.id, 'drafts');
    merge('hp_tpls', inc.tpls, x => x.id, 'tpls');
    merge('ht_bm', inc.bm, x => x.author + '/' + x.permlink, 'bm');
    ['ht_w', 'ht_wfix', 'hive_lock_min', 'hive_theme'].forEach(k => {
      if (typeof d[k] === 'string' && d[k].length < 20 && localStorage.getItem(k) === null) localStorage.setItem(k, d[k]);
    });
    return added;
  }
  /* вибір файлу -> підтвердження -> злиття (наявні дані не видаляються, дублікати пропускаються) */
  function importUI(cb) {
    const f = document.createElement('input'); f.type = 'file'; f.accept = 'application/json,.json';
    f.onchange = async () => {
      try {
        const d = await readFile(f.files[0]), inc = incoming(d);
        if (!inc.drafts.length && !inc.tpls.length && !inc.bm.length) throw new Error('У файлі немає чернеток, шаблонів чи закладок.');
        if (!confirm(`У файлі: чернеток ${inc.drafts.length}, шаблонів ${inc.tpls.length}, закладок ${inc.bm.length}.\nДодати їх до поточних даних? Наявне не видаляється, дублікати пропускаються.`)) return cb(null, null);
        cb(null, apply(d));
      } catch (e) { cb(e); }
    };
    f.click();
  }
  const persist = async () => { try { if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist(); } catch (e) {} return false; };
  const persisted = async () => { try { if (navigator.storage && navigator.storage.persisted) return await navigator.storage.persisted(); } catch (e) {} return false; };
  const info = async () => {
    const c = counts(), last = localStorage.getItem('hive_lastbackup'), p = await persisted();
    return `Зараз: чернеток ${c.drafts}, шаблонів ${c.tpls}, закладок ${c.bm}. ` + (last ? 'Остання копія: ' + new Date(last).toLocaleDateString('uk-UA') + '. ' : 'Копії ще не було. ')
      + (p ? 'Сховище захищене від автоочищення.' : 'Система може очистити сховище, тому робіть копії.');
  };
  return { exportFile, importUI, counts, persist, persisted, info, _test: { apply, incoming } };
})();
