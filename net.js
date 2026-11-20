/* З'єднання з вузлами Hive: основний клієнт, запасні вузли й виклик із перемиканням. Потрібні dhive і diag.js. */
const client = new dhive.Client(['https://api.hive.blog', 'https://api.deathwing.me', 'https://api.openhive.network'], { timeout: 10000 });
const ALT = ['https://api.deathwing.me', 'https://api.openhive.network'].map(u => new dhive.Client([u], { timeout: 10000 }));
async function rpc(api, method, params) {
  try { return await client.call(api, method, params); }
  catch (e) { let last = e; for (const c of ALT) { try { return await c.call(api, method, params); } catch (e2) { last = e2; } } Diag.log(method + ': ' + (last.message || last)); throw last; }
}
