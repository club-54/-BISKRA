/* ── Club 54 Food — Admin Shim ───────────────────────────────────────────────
   يعترض استدعاءات fetch('/api/...') في لوحة الأدمن ويوجّهها لـ JSONBin
   كذلك يتحقق من تسجيل الدخول ويُصحح روابط الخروج وعرض الموقع
─────────────────────────────────────────────────────────────────────────────── */

// ── 1. Auth guard ─────────────────────────────────────────────────────────────
(function() {
  if (!sessionStorage.getItem('club54-admin')) {
    location.replace(CONFIG.BASE + '/admin/login.html');
  }
})();

// ── 2. Promo generator (was server-side) ──────────────────────────────────────
function _genPromos(count = 15) {
  const chars = '0123456789ABCDEF';
  return Array.from({ length: count }, () => {
    let code = 'CLUB54-';
    for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * 16)];
    return { code, discount: Math.floor(Math.random() * 16) + 10, used: false, usedAt: null, createdAt: new Date().toISOString() };
  });
}

// ── 3. Fetch interceptor ──────────────────────────────────────────────────────
const _origFetch = window.fetch.bind(window);
window.fetch = async function(url, opts = {}) {
  if (typeof url !== 'string' || !url.startsWith('/api/')) {
    return _origFetch(url, opts);
  }
  const method = (opts.method || 'GET').toUpperCase();
  const body   = opts.body ? JSON.parse(opts.body) : null;

  function ok(data)       { return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } }); }
  function err(msg, s=500){ return new Response(JSON.stringify({ error: msg }), { status: s, headers: { 'Content-Type': 'application/json' } }); }

  try {
    const raw = await API._get(true);
    const d   = API._defaults(raw);

    // ── /api/menu ──────────────────────────────────────────────────────────
    if (url === '/api/menu' && method === 'GET') {
      return ok(await API.getMenu());
    }
    if (url === '/api/menu/base' && method === 'GET') {
      return ok(await API.getBaseMenu());
    }
    if (url === '/api/menu/overrides' && method === 'POST') {
      d.overrides = body;
      await API._save({ ...(raw||{}), ...d });
      return ok({ ok: true });
    }
    if (url.match(/^\/api\/menu\/item\/[^/]+\/restore$/) && method === 'POST') {
      const id = url.split('/')[4];
      d.overrides.deletedIds = (d.overrides.deletedIds||[]).filter(x => x !== id);
      await API._save({ ...(raw||{}), ...d });
      return ok({ ok: true });
    }
    if (url.match(/^\/api\/menu\/item\/[^/]+$/) && method === 'PATCH') {
      const id = url.split('/').pop();
      d.overrides.items = d.overrides.items || {};
      d.overrides.items[id] = { ...(d.overrides.items[id]||{}), ...body };
      await API._save({ ...(raw||{}), ...d });
      return ok({ ok: true });
    }
    if (url === '/api/menu/item' && method === 'POST') {
      const item = { ...body, id: body.id || `custom-${Date.now()}` };
      d.overrides.newItems = d.overrides.newItems || [];
      d.overrides.newItems.push(item);
      await API._save({ ...(raw||{}), ...d });
      return ok({ ok: true, item });
    }
    if (url.match(/^\/api\/menu\/item\/[^/]+$/) && method === 'DELETE') {
      const id   = url.split('/').pop();
      const base = await API.getBaseMenu();
      d.overrides.newItems   = (d.overrides.newItems||[]).filter(i => i.id !== id);
      if (base.items.find(i => i.id === id)) {
        d.overrides.deletedIds = d.overrides.deletedIds || [];
        if (!d.overrides.deletedIds.includes(id)) d.overrides.deletedIds.push(id);
      }
      await API._save({ ...(raw||{}), ...d });
      return ok({ ok: true });
    }

    // ── /api/categories ────────────────────────────────────────────────────
    if (url === '/api/categories' && method === 'POST') {
      const slug = body.label.toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'');
      const cat  = { id: `cat-${slug}-${Date.now()}`, label: body.label, labelAr: body.labelAr || '' };
      d.overrides.customCategories = d.overrides.customCategories || [];
      d.overrides.customCategories.push(cat);
      await API._save({ ...(raw||{}), ...d });
      return ok({ ok: true, cat });
    }
    if (url.match(/^\/api\/categories\/[^/]+$/) && method === 'DELETE') {
      const id = url.split('/').pop();
      d.overrides.customCategories = (d.overrides.customCategories||[]).filter(c => c.id !== id);
      d.overrides.newItems         = (d.overrides.newItems||[]).filter(i => i.cat !== id);
      await API._save({ ...(raw||{}), ...d });
      return ok({ ok: true });
    }

    // ── /api/promos ────────────────────────────────────────────────────────
    if (url === '/api/promos' && method === 'GET') {
      return ok(d.promos);
    }
    if (url === '/api/promos/generate' && method === 'POST') {
      const count = Math.min(parseInt(body?.count) || 15, 50);
      const fresh = _genPromos(count);
      d.promos = [...d.promos, ...fresh];
      await API._save({ ...(raw||{}), ...d });
      return ok({ ok: true, generated: count, codes: fresh });
    }
    if (url.match(/^\/api\/promos\/[^/]+$/) && method === 'DELETE') {
      const code = url.split('/').pop();
      d.promos = d.promos.filter(p => p.code !== code);
      await API._save({ ...(raw||{}), ...d });
      return ok({ ok: true });
    }
    if (url === '/api/promos/validate' && method === 'POST') {
      return ok(await API.validatePromo(body.code));
    }
    if (url === '/api/promos/redeem' && method === 'POST') {
      return ok(await API.redeemPromo(body.code));
    }

    // ── /api/supplements ───────────────────────────────────────────────────
    if (url === '/api/supplements' && method === 'GET') {
      return ok(await API.getSupplements());
    }
    if (url === '/api/supplements' && method === 'POST') {
      const item = { ...body, id: body.id || `sup-${Date.now()}` };
      d.supplements.push(item);
      await API._save({ ...(raw||{}), ...d });
      return ok({ ok: true, item });
    }
    if (url.match(/^\/api\/supplements\/[^/]+$/) && method === 'PATCH') {
      const id  = url.split('/').pop();
      const idx = d.supplements.findIndex(s => s.id === id);
      if (idx === -1) return err('Not found', 404);
      d.supplements[idx] = { ...d.supplements[idx], ...body };
      await API._save({ ...(raw||{}), ...d });
      return ok({ ok: true });
    }
    if (url.match(/^\/api\/supplements\/[^/]+$/) && method === 'DELETE') {
      const id = url.split('/').pop();
      d.supplements = d.supplements.filter(s => s.id !== id);
      await API._save({ ...(raw||{}), ...d });
      return ok({ ok: true });
    }

    // ── /api/juices ────────────────────────────────────────────────────────
    if (url === '/api/juices' && method === 'GET') {
      return ok(await API.getJuices());
    }
    if (url === '/api/juices/carousel' && method === 'POST') {
      const item = { ...body, id: body.id || `jus-${Date.now()}` };
      d.juices.carousel.push(item);
      await API._save({ ...(raw||{}), ...d });
      return ok({ ok: true, item });
    }
    if (url.match(/^\/api\/juices\/carousel\/[^/]+$/) && method === 'PATCH') {
      const id  = url.split('/').pop();
      const idx = d.juices.carousel.findIndex(i => i.id === id);
      if (idx === -1) return err('Not found', 404);
      d.juices.carousel[idx] = { ...d.juices.carousel[idx], ...body };
      await API._save({ ...(raw||{}), ...d });
      return ok({ ok: true });
    }
    if (url.match(/^\/api\/juices\/carousel\/[^/]+$/) && method === 'DELETE') {
      const id = url.split('/').pop();
      d.juices.carousel = d.juices.carousel.filter(i => i.id !== id);
      await API._save({ ...(raw||{}), ...d });
      return ok({ ok: true });
    }
    if (url === '/api/juices/simple' && method === 'POST') {
      const item = { ...body, id: body.id || `jus-s-${Date.now()}` };
      d.juices.simple.push(item);
      await API._save({ ...(raw||{}), ...d });
      return ok({ ok: true, item });
    }
    if (url.match(/^\/api\/juices\/simple\/[^/]+$/) && method === 'PATCH') {
      const id  = url.split('/').pop();
      const idx = d.juices.simple.findIndex(i => i.id === id);
      if (idx === -1) return err('Not found', 404);
      d.juices.simple[idx] = { ...d.juices.simple[idx], ...body };
      await API._save({ ...(raw||{}), ...d });
      return ok({ ok: true });
    }
    if (url.match(/^\/api\/juices\/simple\/[^/]+$/) && method === 'DELETE') {
      const id = url.split('/').pop();
      d.juices.simple = d.juices.simple.filter(i => i.id !== id);
      await API._save({ ...(raw||{}), ...d });
      return ok({ ok: true });
    }

    // ── /api/gallery ───────────────────────────────────────────────────────
    if (url === '/api/gallery' && method === 'GET') {
      return ok(await API.getGallery());
    }
    if (url === '/api/gallery/image' && method === 'POST') {
      const item = { id: `gallery-${Date.now()}`, url: body.url, label: body.label || '', desc: body.desc || '' };
      d.gallery.push(item);
      await API._save({ ...(raw||{}), ...d });
      return ok({ ok: true, item });
    }
    if (url.match(/^\/api\/gallery\/image\/[^/]+$/) && method === 'PATCH') {
      const id  = url.split('/').pop();
      const idx = d.gallery.findIndex(i => i.id === id);
      if (idx === -1) return err('Not found', 404);
      d.gallery[idx] = { ...d.gallery[idx], ...body };
      await API._save({ ...(raw||{}), ...d });
      return ok({ ok: true });
    }
    if (url.match(/^\/api\/gallery\/image\/[^/]+$/) && method === 'DELETE') {
      const id = url.split('/').pop();
      d.gallery = d.gallery.filter(i => i.id !== id);
      await API._save({ ...(raw||{}), ...d });
      return ok({ ok: true });
    }

    // Fallback
    return err('Not implemented: ' + method + ' ' + url, 501);
  } catch (e) {
    console.error('[shim]', e);
    return err(e.message);
  }
};

// ── 4. Fix logout + view-site after DOM ready ─────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Fix logout
  document.querySelectorAll('[onclick*="logout"],[href*="logout"]').forEach(el => {
    el.removeAttribute('href');
    el.onclick = (e) => {
      e.preventDefault();
      sessionStorage.removeItem('club54-admin');
      location.href = CONFIG.BASE + '/admin/login.html';
    };
  });
  // Fix "Voir le site" button
  document.querySelectorAll('[onclick*="window.open(\'/\'"]').forEach(el => {
    el.onclick = () => window.open(CONFIG.BASE + '/', '_blank');
  });
});
