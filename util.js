/* Спільні дрібні утиліти: екранування, час, календарні нагадування, тема. */
const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ago = s => { const d = (Date.now() - new Date(s + 'Z')) / 1000;
  return d < 60 ? 'щойно' : d < 3600 ? Math.floor(d/60) + ' хв' : d < 86400 ? Math.floor(d/3600) + ' год' : Math.floor(d/86400) + ' д'; };

/* календарні нагадування (.ics) */
function downloadIcs(local, title, note) {
  const pad = n => String(n).padStart(2, '0');
  const fmt = d => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
  const esc = t => String(t).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  const start = new Date(local), end = new Date(start.getTime() + 15 * 60000), now = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//my-hive-app//UK', 'BEGIN:VEVENT',
    `UID:${Date.now().toString(36)}@my-hive-app`, `DTSTAMP:${now}`, `DTSTART:${fmt(start)}`, `DTEND:${fmt(end)}`,
    `SUMMARY:${esc(title)}`, `DESCRIPTION:${esc(note)}`, 'BEGIN:VALARM', 'TRIGGER:PT0M', 'ACTION:DISPLAY', `DESCRIPTION:${esc(title)}`, 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' })); a.download = 'hive-reminder.ics';
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/* перемикач теми: Theme.init('#темний_колір_рядка_стану') */
const Theme = (() => {
  const q = s => document.querySelector(s);
  const now = () => document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  return {
    init(darkBg) {
      const apply = (t, save) => {
        document.documentElement.dataset.theme = t;
        if (save) { try { localStorage.setItem('hive_theme', t); } catch (e) {} }
        q('#theme').textContent = t === 'dark' ? '☀️' : '🌙';
        q('#theme').title = t === 'dark' ? 'Світла тема' : 'Темна тема';
        document.querySelectorAll('meta[name="theme-color"]').forEach(m => { m.content = t === 'dark' ? darkBg : '#ffffff'; });
      };
      q('#theme').onclick = () => apply(now() === 'dark' ? 'light' : 'dark', true);
      apply(now(), false);
    }
  };
})();
