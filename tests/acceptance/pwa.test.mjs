import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const root = new URL('../../artifacts/commandcentre/public/', import.meta.url);
async function harness(network = true) {
  const handlers = {}, stored = new Map(), calls = [];
  const cache = { addAll: async paths => paths.forEach(p => stored.set(p, new Response('cached ' + p))), match: async key => stored.get(key), put: async (key, value) => stored.set(key, value) };
  vm.runInNewContext(await readFile(new URL('sw.js', root), 'utf8'), {
    self: { location: { origin: 'https://example.com' }, clients: { claim: async () => {} }, addEventListener: (name, fn) => handlers[name] = fn },
    URL, caches: { open: async () => cache },
    fetch: async request => { calls.push(request); if (!network) throw new Error('offline'); return new Response(JSON.stringify(['/assets/index-abc123.js', '/api/members', 'https://other.com/private.js'])); },
  });
  return { handlers, stored, calls, cache };
}
test('PWA cache excludes private APIs, mutations, external URLs and short links', async () => {
  const h = await harness();
  for (const [path, method] of [['/api/members','GET'], ['/api/auth/me','GET'], ['/api/messages','POST'], ['/s/poll','GET'], ['https://other.com/x.js','GET']]) {
    let intercepted = false;
    h.handlers.fetch({ request: { url: new URL(path, 'https://example.com').href, method, mode: 'cors' }, respondWith: () => { intercepted = true; } });
    assert.equal(intercepted, false, path);
  }
});
test('installation caches only allowed public assets and offline navigation gets a clear offline page', async () => {
  const h = await harness(); let installed;
  h.handlers.install({ waitUntil: value => installed = value }); await installed;
  assert.ok(h.stored.has('/assets/index-abc123.js'));
  assert.equal(h.stored.has('/api/members'), false);
  const offline = await harness(false);
  await offline.cache.put('/offline.html', new Response('offline screen'));
  let response;
  offline.handlers.fetch({ request: { url: 'https://example.com/field-ops', method: 'GET', mode: 'navigate' }, respondWith: value => response = value });
  assert.equal(await (await response).text(), 'offline screen');
});
test('cached hashed application files load without network requests', async () => {
  const h = await harness(false); await h.cache.put('/assets/index-abc123.js', new Response('saved interface'));
  let response;
  h.handlers.fetch({ request: { url: 'https://example.com/assets/index-abc123.js', method: 'GET', mode: 'cors' }, respondWith: value => response = value });
  assert.equal(await (await response).text(), 'saved interface'); assert.equal(h.calls.length, 0);
});
test('install manifest provides correctly sized phone icons and standalone start route', async () => {
  const manifest = JSON.parse(await readFile(new URL('manifest.webmanifest', root), 'utf8'));
  assert.equal(manifest.display, 'standalone'); assert.equal(manifest.start_url, '/command-centre');
  for (const size of [192,512]) {
    const icon = manifest.icons.find(i => i.sizes === `${size}x${size}`); assert.ok(icon);
    const png = await readFile(new URL('.' + icon.src, root));
    assert.equal(png.readUInt32BE(16), size); assert.equal(png.readUInt32BE(20), size);
  }
});
