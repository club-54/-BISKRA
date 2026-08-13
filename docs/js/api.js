/* ── Club 54 Food — Public API (JSONBin + static fallback) ──────────────────
   يُستخدم من الصفحة الرئيسية (app.js) وصفحة الأدمن
─────────────────────────────────────────────────────────────────────────────── */
const API = (() => {
  let _cache = null;
  let _cacheTs = 0;
  const TTL = 2 * 60 * 1000; // 2 min cache
  const EMPTY_OVERRIDES = { items: {}, newItems: [], deletedIds: [], customCategories: [] };
  const EMPTY_JUICES = { carousel: [], simple: [] };

  function isConfigured() {
    return Boolean(CONFIG.JSONBIN_KEY && CONFIG.JSONBIN_BINS
      && Object.values(CONFIG.JSONBIN_BINS).every(Boolean));
  }

  function normalizeOverrides(record) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      return { ...EMPTY_OVERRIDES };
    }
    const value = record.overrides && typeof record.overrides === 'object'
      ? record.overrides
      : record;
    return {
      ...EMPTY_OVERRIDES,
      ...value,
      items: { ...(value.items || {}) },
      newItems: Array.isArray(value.newItems) ? value.newItems : [],
      deletedIds: Array.isArray(value.deletedIds) ? value.deletedIds : [],
      customCategories: Array.isArray(value.customCategories) ? value.customCategories : [],
    };
  }

  function normalizeJuices(value) {
    return {
      carousel: Array.isArray(value?.carousel) ? value.carousel : [],
      simple: Array.isArray(value?.simple) ? value.simple : [],
    };
  }

  function normalizeList(record, key) {
    if (Array.isArray(record)) return record;
    return Array.isArray(record?.[key]) ? record[key] : [];
  }

  // ── JSONBin storage: one Bin per data group ────────────────────────────────
  async function _getBin(name, force = false) {
    if (!isConfigured()) return null;
    const now = Date.now();
    const cached = _cache?.bins?.[name];
    if (!force && cached && now - cached.ts < TTL) return cached.record;

    const binId = CONFIG.JSONBIN_BINS[name];
    const response = await fetch(
      `https://api.jsonbin.io/v3/b/${binId}/latest`,
      { headers: { 'X-Master-Key': CONFIG.JSONBIN_KEY } }
    );
    if (!response.ok) {
      throw new Error(`JSONBin read failed (${name}: ${response.status})`);
    }
    const record = (await response.json()).record;
    _cache ??= { bins: {} };
    _cache.bins[name] = { record, ts: Date.now() };
    return record;
  }

  async function _saveBin(name, data) {
    if (!isConfigured()) throw new Error('JSONBin غير مهيأ');
    const binId = CONFIG.JSONBIN_BINS[name];
    const response = await fetch(`https://api.jsonbin.io/v3/b/${binId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Master-Key': CONFIG.JSONBIN_KEY,
      },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      throw new Error(`JSONBin save failed (${name}: ${response.status})`);
    }
    _cache ??= { bins: {} };
    _cache.bins[name] = { record: data, ts: Date.now() };
  }

  // Reads the four bins into the shape used by the admin shim.
  async function _get(force = false) {
    if (!isConfigured()) return null;
    if (!force && _cache?.state && Date.now() - _cache.stateTs < TTL) return _cache.state;

    const [overrideRecord, supplementRecord, promoRecord] = await Promise.all([
      _getBin('overrides', force),
      _getBin('supplements', force),
      _getBin('promos', force),
    ]);
    const state = {
      overrides: normalizeOverrides(overrideRecord),
      supplements: normalizeList(supplementRecord, 'supplements'),
      juices: normalizeJuices(overrideRecord?.juices),
      promos: normalizeList(promoRecord, 'promos'),
      gallery: Array.isArray(overrideRecord?.gallery) ? overrideRecord.gallery : [],
    };
    _cache ??= { bins: {} };
    _cache.state = state;
    _cache.stateTs = Date.now();
    return state;
  }

  // Saves every changed data group to its dedicated Bin.
  async function _save(data) {
    const state = {
      overrides: normalizeOverrides(data?.overrides),
      supplements: Array.isArray(data?.supplements) ? data.supplements : [],
      juices: normalizeJuices(data?.juices),
      promos: Array.isArray(data?.promos) ? data.promos : [],
      gallery: Array.isArray(data?.gallery) ? data.gallery : [],
    };
    const currentOverrides = _cache?.bins?.overrides?.record;
    const hasNestedOverrides = currentOverrides
      && typeof currentOverrides === 'object'
      && !Array.isArray(currentOverrides)
      && Object.prototype.hasOwnProperty.call(currentOverrides, 'overrides');
    const overridesPayload = {
      ...(currentOverrides && typeof currentOverrides === 'object' && !Array.isArray(currentOverrides)
        ? currentOverrides
        : {}),
      ...(hasNestedOverrides ? { overrides: state.overrides } : state.overrides),
      juices: state.juices,
      gallery: state.gallery,
    };
    await Promise.all([
      _saveBin('overrides', overridesPayload),
      _saveBin('supplements', state.supplements),
      _saveBin('promos', state.promos),
    ]);
    _cache ??= { bins: {} };
    _cache.state = state;
    _cache.stateTs = Date.now();
  }

  // ── Internal: ensure data has the right shape ─────────────────────────────
  function _defaults(d) {
    return {
      overrides: normalizeOverrides(d?.overrides),
      supplements: Array.isArray(d?.supplements) ? d.supplements : [],
      juices: normalizeJuices(d?.juices),
      promos: Array.isArray(d?.promos) ? d.promos : [],
      gallery: Array.isArray(d?.gallery) ? d.gallery : [],
    };
  }

  // ── Public menu (base + overrides) ────────────────────────────────────────
  async function getMenu() {
    let base;
    try {
      const remote = await _getBin('menu');
      base = remote?.categories && remote?.items ? remote : null;
    } catch (error) {
      console.warn('[JSONBin] menu fallback:', error.message);
    }
    if (!base) {
      base = await fetch(CONFIG.BASE + '/data/menu.json').then(r => r.json());
    }
    const raw = await _get();
    const ov = (raw ? _defaults(raw) : _defaults(null)).overrides;

    const merged = base.items
      .filter(i  => !(ov.deletedIds || []).includes(i.id))
      .map(i     => ({ ...i, ...(ov.items?.[i.id] || {}) }));

    return {
      categories: [...base.categories, ...(ov.customCategories || [])],
      items:      [...merged, ...(ov.newItems || [])],
    };
  }

  async function getBaseMenu() {
    try {
      const remote = await _getBin('menu');
      if (remote?.categories && remote?.items) return remote;
    } catch (error) {
      console.warn('[JSONBin] base menu fallback:', error.message);
    }
    return fetch(CONFIG.BASE + '/data/menu.json').then(r => r.json());
  }

  async function getSupplements() {
    try {
      const record = await _getBin('supplements');
      if (record !== null) return normalizeList(record, 'supplements');
    } catch (error) {
      console.warn('[JSONBin] supplements fallback:', error.message);
    }
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

  // ── Promos: JSONBin first, static fallback ────────────────────────────────
  async function getPromos() {
    try {
      const record = await _getBin('promos');
      if (record !== null) return normalizeList(record, 'promos');
    } catch (error) {
      console.warn('[JSONBin] promos fallback:', error.message);
    }
    return fetch(CONFIG.BASE + '/data/promo-codes.json').then(r => r.json()).catch(() => []);
  }

  async function validatePromo(code) {
    const promos = await getPromos();
    const promo  = promos.find(p => p.code === code);
    if (!promo)     return { valid: false, error: 'الكود غير موجود' };
    if (promo.used) return { valid: false, error: 'الكود مستخدم مسبقاً' };
    return { valid: true, discount: promo.discount };
  }

  async function redeemPromo(code) {
    const raw = await _get(true);
    const d = _defaults(raw);
    const promos = d.promos.length
      ? d.promos
      : await fetch(CONFIG.BASE + '/data/promo-codes.json').then(r => r.json()).catch(() => []);
    const idx = promos.findIndex(p => p.code === code);
    if (idx === -1 || promos[idx].used) return { ok: false };
    const discount = promos[idx].discount;
    if (isConfigured()) {
      promos[idx].used   = true;
      promos[idx].usedAt = new Date().toISOString();
      await _save({ ...(raw || {}), ...d, promos });
    }
    return { ok: true, discount };
  }

  async function submitOrder({ name, phone, address, gps, note, cart, total, promo }) {
    const token  = window.TELEGRAM_BOT_TOKEN || '';
    const chatId = window.TELEGRAM_CHAT_ID || '';

    if (!token || !chatId) {
      throw new Error('خدمة الطلبات غير مهيأة حالياً');
    }

    const itemsList = cart.map(item => {
      const size = item.size ? ` (${item.size})` : '';
      const quantity = Math.max(1, Number(item.qty) || 1);
      return `• ${item.name}${size} ×${quantity} — ${Number(item.price) * quantity} DA`;
    }).join('\n');

    const promoLine = promo?.code
      ? `\n🏷 *Promo:* ${promo.code} (−${promo.savedAmount || 0} DA)`
      : '';
    const text = [
      '🚨 *طلب جديد — CLUB 54 FOOD*',
      '',
      `👤 *الاسم:* ${name}`,
      `📞 *الهاتف:* ${phone}`,
      address ? `📍 *العنوان:* ${address}` : '',
      gps ? `🗺 *الموقع:* ${gps}` : '',
      note ? `📝 *ملاحظة:* ${note}` : '',
      '',
      '*الطلب:*',
      itemsList,
      promoLine,
      '',
      `💰 *المجموع:* ${total} DA`,
    ].filter(Boolean).join('\n');

    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) {
      throw new Error(result.error || 'تعذر إرسال الطلب إلى Telegram');
    }
    return result;
  }

  // Expose internals for admin-shim
  return { getMenu, getBaseMenu, getSupplements, getJuices, getGallery,
           getPromos, validatePromo, redeemPromo, submitOrder, _get, _save, _defaults };
})();
