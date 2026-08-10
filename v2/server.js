اصimport express from 'express';
import session from 'express-session';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 5000;

// ── File paths ────────────────────────────────────────────────────────────────
const MENU_FILE        = path.join(__dirname, 'data', 'menu.json');
const OVERRIDES_FILE   = path.join(__dirname, 'data', 'menu-overrides.json');
const PROMOS_FILE      = path.join(__dirname, 'data', 'promo-codes.json');
const SUPPLEMENTS_FILE = path.join(__dirname, 'data', 'supplements.json');
const JUICES_FILE      = path.join(__dirname, 'data', 'juices.json');

// ── Env vars ──────────────────────────────────────────────────────────────────
const ADMIN_PASSWORD        = process.env.ADMIN_PASSWORD;
const ADMIN_PASSWORD_BACKUP = process.env.ADMIN_PASSWORD_BACKUP;
// Keep Telegram credentials server-side. Empty values intentionally disable
// order delivery until the Replit Secrets are configured.
const TELEGRAM_BOT_TOKEN    = (process.env.TELEGRAM_BOT_TOKEN || '').replace(/\s/g, '');
const TELEGRAM_CHAT_ID      = (process.env.TELEGRAM_CHAT_ID || '').trim();
const ORDER_ALLOWED_ORIGIN  = process.env.ORDER_ALLOWED_ORIGIN || '*';

// Lightweight abuse protection for the public order endpoint.
const orderAttempts = new Map();
const ORDER_WINDOW_MS = 60 * 1000;
const ORDER_LIMIT = 8;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json());
app.use('/api/orders', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', ORDER_ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(session({
  secret: process.env.SESSION_SECRET || 'club54-dev-secret-change-in-prod',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, maxAge: 8 * 60 * 60 * 1000 } // 8 hours
}));

// ── Auth helpers ──────────────────────────────────────────────────────────────
function requireAdmin(req, res, next) {
  if (req.session.adminAuth) return next();
  res.redirect('/admin/login');
}

app.get('/admin/login', (_req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'admin', 'login.html'))
);

app.post('/admin/login', async (req, res) => {
  const pw = req.body.password || '';
  const primaryOk = ADMIN_PASSWORD && pw === ADMIN_PASSWORD;
  const backupOk  = !primaryOk && ADMIN_PASSWORD_BACKUP
                    && await bcrypt.compare(pw, ADMIN_PASSWORD_BACKUP);
  if (primaryOk || backupOk) {
    req.session.adminAuth = true;
    res.json({ ok: true });
  } else {
    res.status(401).json({ error: 'Mot de passe incorrect' });
  }
});

app.get('/admin/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/admin/login'));
});

// Protect all /admin/* except /admin/login
app.use('/admin', (req, res, next) => {
  if (req.path === '/login') return next();
  requireAdmin(req, res, next);
});

// ── Local file helpers ────────────────────────────────────────────────────────
function readJSON(file, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function readMenu() { return readJSON(MENU_FILE); }

function readOverrides() {
  return {
    items: {}, newItems: [], deletedIds: [], customCategories: [],
    ...readJSON(OVERRIDES_FILE, {})
  };
}

function writeOverrides(data) { writeJSON(OVERRIDES_FILE, data); }

function cleanOrderText(value, maxLength) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function orderRateLimit(req, res, next) {
  const now = Date.now();
  const key = req.ip || req.socket.remoteAddress || 'unknown';
  const recent = (orderAttempts.get(key) || []).filter(t => now - t < ORDER_WINDOW_MS);
  if (recent.length >= ORDER_LIMIT) {
    return res.status(429).json({ error: 'عدد الطلبات كبير، حاول بعد قليل' });
  }
  recent.push(now);
  orderAttempts.set(key, recent);
  next();
}

function buildTelegramOrderMessage(order) {
  const name = cleanOrderText(order.name, 80);
  const phone = cleanOrderText(order.phone, 40);
  const address = cleanOrderText(order.address, 180);
  const gps = cleanOrderText(order.gps, 160);
  const items = Array.isArray(order.cart) ? order.cart.slice(0, 40) : [];
  const lines = [
    '🛒 طلب جديد — CLUB 54 FOOD',
    '─────────────────────',
    ...items.map(item => {
      const itemName = cleanOrderText(item.name, 100);
      const size = cleanOrderText(item.size, 40);
      const qty = Math.max(1, Math.min(99, Number.parseInt(item.qty, 10) || 1));
      const price = Math.max(0, Number(item.price) || 0);
      return `• ${itemName}${size ? ` (${size})` : ''} ×${qty} → ${price * qty} DA`;
    }),
    '─────────────────────',
    order.promo?.code ? `🏷 Promo: ${cleanOrderText(order.promo.code, 40)} (−${Math.max(0, Number(order.promo.savedAmount) || 0)} DA)` : '',
    `💰 Total: ${Math.max(0, Number(order.total) || 0)} DA`,
    '─────────────────────',
    `👤 ${name}`,
    `📞 ${phone}`,
    `📍 ${address}`,
    gps ? `🗺 GPS: ${gps}` : '',
  ].filter(Boolean);
  return lines.join('\n');
}

// Public order endpoint. The Telegram token stays server-side in Replit Secrets.
app.post('/api/orders', orderRateLimit, async (req, res) => {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    return res.status(503).json({ error: 'خدمة الطلبات غير مهيأة حالياً' });
  }

  const { name, phone, address, cart, total } = req.body || {};
  if (!cleanOrderText(name, 80) || !cleanOrderText(phone, 40)
      || !cleanOrderText(address, 180) || !Array.isArray(cart) || !cart.length) {
    return res.status(400).json({ error: 'بيانات الطلب غير مكتملة' });
  }

  try {
    const telegramResponse = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text: buildTelegramOrderMessage(req.body),
        }),
      }
    );
    const result = await telegramResponse.json().catch(() => ({}));
    if (!telegramResponse.ok || !result.ok) {
      console.error('[Telegram] sendMessage failed with status', telegramResponse.status);
      return res.status(502).json({ error: 'تعذر إرسال الطلب إلى Telegram' });
    }
    res.json({ ok: true });
  } catch (error) {
    console.error('[Telegram] request failed:', error.message);
    res.status(502).json({ error: 'تعذر الاتصال بخدمة Telegram' });
  }
});

// In-memory override cache (cleared on write)
let _cache = null;

async function getOverrides() {
  if (_cache) return _cache;
  _cache = readOverrides();
  return _cache;
}

async function saveOverrides(data) {
  _cache = data;
  writeOverrides(data);
}

// ── Menu API ──────────────────────────────────────────────────────────────────

// GET /api/menu — merged menu (base + overrides)
app.get('/api/menu', async (req, res) => {
  try {
    const base = readMenu();
    const ov   = await getOverrides();
    const merged = base.items
      .filter(i => !(ov.deletedIds || []).includes(i.id))
      .map(i => ({ ...i, ...(ov.items?.[i.id] || {}) }));
    res.json({
      categories: [...base.categories, ...(ov.customCategories || [])],
      items: [...merged, ...(ov.newItems || [])]
    });
  } catch (e) {
    console.error('[menu]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/menu/base — base menu without overrides (admin use)
app.get('/api/menu/base', (_req, res) => res.json(readMenu()));

// POST /api/menu/overrides — replace full overrides object
app.post('/api/menu/overrides', async (req, res) => {
  try { await saveOverrides(req.body); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/menu/item/:id — update single item override
app.patch('/api/menu/item/:id', async (req, res) => {
  try {
    const ov = await getOverrides();
    ov.items ??= {};
    ov.items[req.params.id] = { ...(ov.items[req.params.id] || {}), ...req.body };
    await saveOverrides(ov);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/menu/item — add new item
app.post('/api/menu/item', async (req, res) => {
  try {
    const ov = await getOverrides();
    ov.newItems ??= [];
    const item = { ...req.body, id: req.body.id || `custom-${Date.now()}` };
    ov.newItems.push(item);
    await saveOverrides(ov);
    res.json({ ok: true, item });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/menu/item/:id
app.delete('/api/menu/item/:id', async (req, res) => {
  try {
    const ov = await getOverrides();
    const id = req.params.id;
    // Remove from newItems if custom
    ov.newItems = (ov.newItems || []).filter(i => i.id !== id);
    // Mark base item as deleted
    if (readMenu().items.find(i => i.id === id)) {
      ov.deletedIds ??= [];
      if (!ov.deletedIds.includes(id)) ov.deletedIds.push(id);
    }
    await saveOverrides(ov);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/menu/item/:id/restore — un-delete a base item
app.post('/api/menu/item/:id/restore', async (req, res) => {
  try {
    const ov = await getOverrides();
    ov.deletedIds = (ov.deletedIds || []).filter(x => x !== req.params.id);
    await saveOverrides(ov);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Category API ──────────────────────────────────────────────────────────────

app.post('/api/categories', async (req, res) => {
  try {
    const ov = await getOverrides();
    ov.customCategories ??= [];
    const slug = req.body.label.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const cat  = { id: `cat-${slug}-${Date.now()}`, label: req.body.label, labelAr: req.body.labelAr || '' };
    ov.customCategories.push(cat);
    await saveOverrides(ov);
    res.json({ ok: true, cat });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/categories/:id', async (req, res) => {
  try {
    const ov = await getOverrides();
    ov.customCategories = (ov.customCategories || []).filter(c => c.id !== req.params.id);
    ov.newItems = (ov.newItems || []).filter(i => i.cat !== req.params.id);
    await saveOverrides(ov);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Juices API ────────────────────────────────────────────────────────────────

function readJuices()  { return readJSON(JUICES_FILE, { carousel: [], simple: [] }); }
function writeJuices(d) { writeJSON(JUICES_FILE, d); }

app.get('/api/juices', (_req, res) => res.json(readJuices()));

// POST /api/juices/carousel — add carousel item (admin)
app.post('/api/juices/carousel', requireAdmin, (req, res) => {
  try {
    const data = readJuices();
    const item = { ...req.body, id: req.body.id || `jus-${Date.now()}` };
    data.carousel.push(item);
    writeJuices(data);
    res.json({ ok: true, item });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/juices/carousel/:id — edit carousel item (admin)
app.patch('/api/juices/carousel/:id', requireAdmin, (req, res) => {
  try {
    const data = readJuices();
    const idx = data.carousel.findIndex(i => i.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    data.carousel[idx] = { ...data.carousel[idx], ...req.body };
    writeJuices(data);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/juices/carousel/:id — delete carousel item (admin)
app.delete('/api/juices/carousel/:id', requireAdmin, (req, res) => {
  try {
    const data = readJuices();
    data.carousel = data.carousel.filter(i => i.id !== req.params.id);
    writeJuices(data);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/juices/simple — add simple drink (admin)
app.post('/api/juices/simple', requireAdmin, (req, res) => {
  try {
    const data = readJuices();
    const item = { ...req.body, id: req.body.id || `jus-s-${Date.now()}` };
    data.simple.push(item);
    writeJuices(data);
    res.json({ ok: true, item });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/juices/simple/:id — edit simple drink (admin)
app.patch('/api/juices/simple/:id', requireAdmin, (req, res) => {
  try {
    const data = readJuices();
    const idx = data.simple.findIndex(i => i.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    data.simple[idx] = { ...data.simple[idx], ...req.body };
    writeJuices(data);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/juices/simple/:id — delete simple drink (admin)
app.delete('/api/juices/simple/:id', requireAdmin, (req, res) => {
  try {
    const data = readJuices();
    data.simple = data.simple.filter(i => i.id !== req.params.id);
    writeJuices(data);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Supplements API ───────────────────────────────────────────────────────────

function readSupplements() { return readJSON(SUPPLEMENTS_FILE, []); }
function writeSupplements(d) { writeJSON(SUPPLEMENTS_FILE, d); }

app.get('/api/supplements', (_req, res) => res.json(readSupplements()));

app.post('/api/supplements', (req, res) => {
  try {
    const sups = readSupplements();
    const item = { ...req.body, id: req.body.id || `sup-${Date.now()}` };
    sups.push(item);
    writeSupplements(sups);
    res.json({ ok: true, item });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/supplements/:id', (req, res) => {
  try {
    const sups = readSupplements();
    const idx = sups.findIndex(s => s.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    sups[idx] = { ...sups[idx], ...req.body };
    writeSupplements(sups);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/supplements/:id', (req, res) => {
  try {
    writeSupplements(readSupplements().filter(s => s.id !== req.params.id));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Promo Codes API ───────────────────────────────────────────────────────────

function readPromos() { return readJSON(PROMOS_FILE, []); }
function writePromos(d) { writeJSON(PROMOS_FILE, d); }

function generatePromos(count = 15) {
  const seen = new Set();
  const codes = [];
  while (codes.length < count) {
    const code = 'CLUB54-' + crypto.randomBytes(4).toString('hex').toUpperCase();
    if (seen.has(code)) continue;
    seen.add(code);
    codes.push({
      code,
      discount: Math.floor(Math.random() * 16) + 10, // 10–25%
      used: false,
      usedAt: null,
      createdAt: new Date().toISOString()
    });
  }
  return codes;
}

function autoRenewIfExhausted(promos) {
  if (promos.length > 0 && promos.every(p => p.used)) {
    const fresh = generatePromos(15);
    writePromos(fresh);
    console.log('[Promos] All codes exhausted — auto-generated 15 new codes.');
    return fresh;
  }
  return promos;
}

// GET /api/promos — all codes (admin)
app.get('/api/promos', (_req, res) => {
  try { res.json(autoRenewIfExhausted(readPromos())); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/promos/generate — generate N new codes
app.post('/api/promos/generate', (req, res) => {
  try {
    const count = Math.min(parseInt(req.body.count) || 15, 50);
    const fresh = generatePromos(count);
    const existing = readPromos();
    const all = [...existing, ...fresh];
    writePromos(all);
    res.json({ ok: true, generated: fresh.length, codes: fresh });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/promos/:code
app.delete('/api/promos/:code', (req, res) => {
  try {
    writePromos(readPromos().filter(p => p.code !== req.params.code));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/promos/validate — check without consuming
app.post('/api/promos/validate', (req, res) => {
  try {
    const code   = (req.body.code || '').trim().toUpperCase();
    const promos = readPromos();
    const promo  = promos.find(p => p.code === code);
    if (!promo)     return res.status(404).json({ valid: false, error: 'الكود غير موجود' });
    if (promo.used) return res.status(410).json({ valid: false, error: 'الكود مستخدم مسبقاً' });
    res.json({ valid: true, discount: promo.discount });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/promos/redeem — consume a code (one-time use)
app.post('/api/promos/redeem', (req, res) => {
  try {
    const code   = (req.body.code || '').trim().toUpperCase();
    const promos = readPromos();
    const idx    = promos.findIndex(p => p.code === code);
    if (idx === -1)         return res.status(404).json({ ok: false, error: 'الكود غير موجود' });
    if (promos[idx].used)  return res.status(410).json({ ok: false, error: 'الكود مستخدم مسبقاً' });
    promos[idx].used   = true;
    promos[idx].usedAt = new Date().toISOString();
    writePromos(promos);
    autoRenewIfExhausted(promos);
    res.json({ ok: true, discount: promos[idx].discount });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Gallery API ───────────────────────────────────────────────────────────────

const GALLERY_FILE   = path.join(__dirname, 'data', 'gallery.json');
const GALLERY_BINID  = path.join(__dirname, 'data', '.gallery-binid');

function readGallery()    { return readJSON(GALLERY_FILE, []); }
function writeGallery(d)  { writeJSON(GALLERY_FILE, d); }

async function syncGalleryToJsonBin(items) {
  const key = process.env.JSONBIN_GALLERY_KEY;
  if (!key) return;
  try {
    let binId = null;
    try { binId = fs.readFileSync(GALLERY_BINID, 'utf8').trim(); } catch {}

    if (!binId) {
      // Create new bin
      const r = await fetch('https://api.jsonbin.io/v3/b', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Master-Key': key, 'X-Bin-Name': 'club54-gallery' },
        body: JSON.stringify(items)
      });
      const json = await r.json();
      binId = json.metadata?.id;
      if (binId) fs.writeFileSync(GALLERY_BINID, binId, 'utf8');
    } else {
      await fetch(`https://api.jsonbin.io/v3/b/${binId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Master-Key': key },
        body: JSON.stringify(items)
      });
    }
  } catch (e) {
    console.warn('[gallery-jsonbin] sync failed:', e.message);
  }
}

// GET /api/gallery — public, no auth needed
app.get('/api/gallery', (_req, res) => res.json(readGallery()));

// POST /api/gallery/image — add image (admin)
app.post('/api/gallery/image', requireAdmin, async (req, res) => {
  try {
    const { url, label } = req.body;
    if (!url) return res.status(400).json({ error: 'url requis' });
    const items = readGallery();
    const item  = { id: `gallery-${Date.now()}`, url, label: label || '' };
    items.push(item);
    writeGallery(items);
    syncGalleryToJsonBin(items).catch(() => {});
    res.json({ ok: true, item });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/gallery/image/:id — edit label (admin)
app.patch('/api/gallery/image/:id', requireAdmin, (req, res) => {
  try {
    const items = readGallery();
    const idx   = items.findIndex(i => i.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    items[idx] = { ...items[idx], ...req.body };
    writeGallery(items);
    syncGalleryToJsonBin(items).catch(() => {});
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/gallery/image/:id — delete image (admin)
app.delete('/api/gallery/image/:id', requireAdmin, async (req, res) => {
  try {
    const items = readGallery().filter(i => i.id !== req.params.id);
    writeGallery(items);
    syncGalleryToJsonBin(items).catch(() => {});
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Static files ──────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public'), {
  etag: true, lastModified: true
}));

// SPA fallback — serve index.html for any unmatched route
// Admin sub-pages (no .html extension)
app.get('/admin/promos', (_req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'admin', 'promos.html'))
);

app.get('/{*path}', (req, res) => {
  // Don't catch unknown /admin/* routes
  if (req.path.startsWith('/admin')) {
    return res.status(404).send('Not found');
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () =>
  console.log(`✅ Club 54 Food v2 running on http://0.0.0.0:${PORT}`)
);
