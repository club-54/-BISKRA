/* ── Club 54 Food — Public API (JSONBin + static fallback) ──────────────────
   يُستخدم من الصفحة الرئيسية (app.js) وصفحة الأدمن
─────────────────────────────────────────────────────────────────────────────── */
const API = (() => {
  let _cache   = null;
  let _cacheTs = 0;
  const TTL    = 2 * 60 * 1000; // 2 min cache

  // ── Internal: fetch full JSONBin record ───────────────────────────────────
  async function _get(force = false) {
    if (!CONFIG.JSONBIN_KEY || !CONFIG.JSONBIN_BIN_ID) return null;
    const now = Date.now();
    if (!force && _cache && (now - _cacheTs) < TTL) return _cache;
    try {
      const r = await fetch(
        `https://api.jsonbin.io/v3/b/${CONFIG.JSONBIN_BIN_ID}/latest`,
        { headers: { 'X-Master-Key': CONFIG.JSONBIN_KEY } }
      );
      if (!r.ok) return null;
      _cache   = (await r.json()).record;
      _cacheTs = Date.now();
      return _cache;
    } catch { return null; }
  }

  // ── Internal: save full record to JSONBin ─────────────────────────────────
  async function _save(data) {
    _cache   = data;
    _cacheTs = Date.now();
    await fetch(`https://api.jsonbin.io/v3/b/${CONFIG.JSONBIN_BIN_ID}`, {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Master-Key': CONFIG.JSONBIN_KEY },
      body:    JSON.stringify(data),
    });
  }

  // ── Internal: ensure data has the right shape ─────────────────────────────
  function _defaults(d) {
    return {
      overrides:   d?.overrides   ?? { items: {}, newItems: [], deletedIds: [], customCategories: [] },
      supplements: d?.supplements ?? [],
      juices:      d?.juices      ?? { carousel: [], simple: [] },
      promos:      d?.promos      ?? [],
      gallery:     d?.gallery     ?? [],
    };
  }

  // ── Public menu (base + overrides) ────────────────────────────────────────
  async function getMenu() {
    const base = await fetch(CONFIG.BASE + '/data/menu.json').then(r => r.json());
    const raw  = await _get();
    const ov   = (raw ? _defaults(raw) : _defaults(null)).overrides;

    const merged = base.items
      .filter(i  => !(ov.deletedIds || []).includes(i.id))
      .map(i     => ({ ...i, ...(ov.items?.[i.id] || {}) }));

    return {
      categories: [...base.categories, ...(ov.customCategories || [])],
      items:      [...merged, ...(ov.newItems || [])],
    };
  }

  async function getBaseMenu() {
    return fetch(CONFIG.BASE + '/data/menu.json').then(r => r.json());
  }

  async function getSupplements() {
    const raw = await _get();
    const d   = _defaults(raw);
    if (d.supplements.length) return d.supplements;
    return fetch(CONFIG.BASE + '/data/supplements.json').then(r => r.json()).catch(() => []);
  }

  async function getJuices() {
    const raw = await _get();
    const d   = _defaults(raw);
    if (d.juices.carousel.length || d.juices.simple.length) return d.juices;
    return fetch(CONFIG.BASE + '/data/juices.json')
      .then(r => r.json())
      .catch(() => ({ carousel: [], simple: [] }));
  }

  async function getGallery() {
    const raw = await _get();
    const d   = _defaults(raw);
    if (d.gallery.length) return d.gallery;
    return fetch(CONFIG.BASE + '/data/gallery.json').then(r => r.json()).catch(() => []);
  }

  async function validatePromo(code) {
    const raw   = await _get();
    const d     = _defaults(raw);
    const promo = d.promos.find(p => p.code === code);
    if (!promo)     return { valid: false, error: 'الكود غير موجود' };
    if (promo.used) return { valid: false, error: 'الكود مستخدم مسبقاً' };
    return { valid: true, discount: promo.discount };
  }

  async function redeemPromo(code) {
    const raw = await _get(true); // fresh
    const d   = _defaults(raw);
    const idx = d.promos.findIndex(p => p.code === code);
    if (idx === -1 || d.promos[idx].used) return { ok: false };
    d.promos[idx].used   = true;
    d.promos[idx].usedAt = new Date().toISOString();
    const full = { ...(raw || {}), ...d };
    await _save(full);
    return { ok: true, discount: d.promos[idx].discount };
  }

  async function submitOrder({ name, phone, address, gps, cart, total, promo }) {
    const lines = [
      '🛒 *طلب جديد — CLUB 54 FOOD*',
      '─────────────────────',
      ...cart.map(i =>
        `• ${i.name}${i.size ? ` (${i.size})` : ''} ×${i.qty}  →  ${i.price * i.qty} DA`
      ),
      '─────────────────────',
      promo ? `🏷 Promo (${promo.code}): −${Math.round(total * promo.discount / (100 - promo.discount))} DA` : '',
      `💰 Total: ${total} DA`,
      '─────────────────────',
      `👤 ${name}`,
      `📞 ${phone}`,
      `📍 ${address}`,
      gps ? `🗺 GPS: ${gps}` : '',
    ].filter(Boolean).join('\n');

    window.open(`https://wa.me/${CONFIG.WHATSAPP}?text=${encodeURIComponent(lines)}`, '_blank');
    return { ok: true };
  }

  // Expose internals for admin-shim
  return { getMenu, getBaseMenu, getSupplements, getJuices, getGallery,
           validatePromo, redeemPromo, submitOrder, _get, _save, _defaults };
})();
