/* ═══════════════════════════════════════════════════════════
   Club 54 Food v2 — Main Application
   Vanilla JS · No framework · Clean & bug-free
═══════════════════════════════════════════════════════════ */

// ── Config ────────────────────────────────────────────────────────────────────
// Opening hours (Africa/Algiers timezone)
const HOURS = {
  open:       11 * 60,  // 11:00
  openFriday: 16 * 60,  // 16:00 on Fridays
  close:      23 * 60   // 23:00
};

// ── State ─────────────────────────────────────────────────────────────────────
let state = {
  menu:           { categories: [], items: [] },
  supplements:    [],
  cart:           [],                  // { id, name, nameAr, price, qty, size?, badge? }
  activeCategory: 'burgers',
  promo:          null,                // { code, discount } when applied
  promoApplied:   false,               // true after redeem
  orderSent:      false,               // prevent double-send with same promo
};

// ── DOM references ────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  loadCartFromStorage();
  renderCartBadge();

  // Bind static UI
  $('cart-btn')?.addEventListener('click', openCart);
  $('cart-overlay')?.addEventListener('click', closeCart);
  $('floating-cart')?.addEventListener('click', openCart);
  $('cart-close-btn')?.addEventListener('click', closeCart);

  // Hero video — progressive enhancement (no blocking)
  initHeroVideo();

  // Load menu + supplements concurrently
  try {
    const [menuRes, supRes] = await Promise.all([
      fetch('/api/menu'),
      fetch('/api/supplements')
    ]);
    state.menu        = await menuRes.json();
    state.supplements = await supRes.json();
  } catch {
    showMenuError();
    if (window.__dismissPageLoader) window.__dismissPageLoader();
    return;
  }

  renderCategories();
  renderMenu();
  renderSupplements();
  renderJuiceSection();
  initGalleryLightbox();
  updateFloatingCart();

  // Dismiss page loader now that the menu is ready
  if (window.__dismissPageLoader) window.__dismissPageLoader();
});

// ── Hero video (progressive — never blocks content) ───────────────────────────
function initHeroVideo() {
  const video = document.createElement('video');
  video.autoplay = true;
  video.muted    = true;
  video.loop     = true;
  video.playsInline = true;
  video.preload  = 'none'; // lazy — don't block page load
  video.className = 'hero-video';

  const src = document.createElement('source');
  src.src  = 'https://res.cloudinary.com/rjse3x88/video/upload/redpandacompress_0721_1_bept3s.mp4';
  src.type = 'video/mp4';
  video.appendChild(src);

  video.addEventListener('canplay', () => video.classList.add('loaded'), { once: true });
  // If video errors, nothing happens — hero image remains visible. No crash.
  video.addEventListener('error', () => video.remove(), { once: true });

  const hero = document.getElementById('hero');
  if (hero) hero.appendChild(video);
}

// ── Categories ────────────────────────────────────────────────────────────────
function renderCategories() {
  const bar = document.getElementById('categories-bar');
  if (!bar) return;

  const scroll = bar.querySelector('.categories-scroll');
  scroll.innerHTML = '';

  state.menu.categories.forEach(cat => {
    const btn = makeEl('button', 'cat-btn');
    btn.dataset.cat = cat.id;
    btn.innerHTML = `${cat.label} <span class="ar" style="font-size:11px;color:var(--text-muted);margin-left:4px;">${cat.labelAr}</span>`;
    btn.addEventListener('click', () => setCategory(cat.id));
    scroll.appendChild(btn);
  });
}

function setCategory(catId) {
  // Special case: 'jus' category scrolls to the dedicated juice carousel section
  if (catId === 'jus') {
    $$('.cat-btn').forEach(b => b.classList.toggle('active', b.dataset.cat === catId));
    document.getElementById('juice-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  state.activeCategory = catId;
  $$('.cat-btn').forEach(b => b.classList.toggle('active', b.dataset.cat === catId));
  renderMenu();
  document.getElementById('menu')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── Menu rendering ────────────────────────────────────────────────────────────
function renderMenu() {
  const container = document.getElementById('menu-list');
  if (!container) return;

  const { categories, items } = state.menu;
  const filter = state.activeCategory;

  // Remove loader
  $('menu-loader')?.remove();
  $('menu-error')?.remove();
  container.innerHTML = '';

  // Group by category, respecting filter
  const activeCats = filter === 'all'
    ? categories
    : categories.filter(c => c.id === filter);

  let rendered = 0;

  activeCats.forEach(cat => {
    const catItems = items.filter(i => i.cat === cat.id);
    if (!catItems.length) return;

    // Section header
    const header = makeEl('div', 'menu-section-title');
    header.innerHTML = `<span>${cat.label}</span><span class="title-ar ar">${cat.labelAr}</span>`;
    container.appendChild(header);

    catItems.forEach(item => {
      container.appendChild(buildItemCard(item));
      rendered++;
    });
  });

  if (!rendered) {
    container.innerHTML = `<div style="text-align:center;padding:60px;color:var(--text-muted);font-size:14px;">Aucun article dans cette catégorie.</div>`;
  }
}

function buildItemCard(item) {
  const card = makeEl('div', 'menu-item');
  card.dataset.id = item.id;

  // Has sizes (pizza-style)
  const hasSizes = item.sizes && Object.keys(item.sizes).length > 0;
  let selectedSize = hasSizes ? Object.keys(item.sizes)[1] || Object.keys(item.sizes)[0] : null;

  const getPrice = () => hasSizes ? item.sizes[selectedSize] : item.price;

  // Left: info
  const info = makeEl('div', 'item-info');

  const names = makeEl('div', 'item-names');
  names.innerHTML = `<span class="item-name-fr">${esc(item.name)}</span>
    <span class="item-name-ar ar">${esc(item.nameAr || '')}</span>
    ${item.badge ? `<span class="item-badge">${esc(item.badge)}</span>` : ''}`;
  info.appendChild(names);

  if (item.desc) {
    const desc = makeEl('p', 'item-desc', esc(item.desc));
    info.appendChild(desc);
  }

  if (hasSizes) {
    const sizeSel = makeEl('div', 'size-selector');
    Object.entries(item.sizes).forEach(([sz, pr]) => {
      const btn = makeEl('button', `size-btn${sz === selectedSize ? ' selected' : ''}`);
      btn.textContent = `${sz} — ${pr} DA`;
      btn.addEventListener('click', () => {
        selectedSize = sz;
        // Update UI
        sizeSel.querySelectorAll('.size-btn').forEach(b =>
          b.classList.toggle('selected', b === btn)
        );
        priceEl.textContent = `${pr} DA+`;
      });
      sizeSel.appendChild(btn);
    });
    info.appendChild(sizeSel);
  }

  card.appendChild(info);

  // Right: price + add btn
  const right = makeEl('div', 'item-right');
  const priceEl = makeEl('span', 'item-price', `${getPrice()} DA+`);

  const addBtn = makeEl('button', 'add-btn', '+');
  addBtn.title = 'Ajouter au panier';
  addBtn.addEventListener('click', () => {
    addToCart({
      id:     item.id + (selectedSize ? `-${selectedSize}` : ''),
      name:   item.name,
      nameAr: item.nameAr || '',
      price:  getPrice(),
      size:   selectedSize,
      badge:  item.badge
    });
    // Pulse animation
    addBtn.style.transform = 'scale(1.3)';
    addBtn.style.background = 'rgba(74,222,128,0.2)';
    addBtn.style.borderColor = 'var(--green)';
    addBtn.style.color = 'var(--green)';
    setTimeout(() => {
      addBtn.style.transform = '';
      addBtn.style.background = '';
      addBtn.style.borderColor = '';
      addBtn.style.color = '';
    }, 400);
  });

  right.appendChild(priceEl);
  right.appendChild(addBtn);
  card.appendChild(right);

  return card;
}

// ── Supplements ───────────────────────────────────────────────────────────────
function renderSupplements() {
  const grid = document.getElementById('sup-grid');
  if (!grid) return;

  if (!state.supplements.length) {
    document.getElementById('supplements-section')?.style.setProperty('display', 'none');
    return;
  }

  grid.innerHTML = '';
  state.supplements.forEach(sup => {
    const card = makeEl('div', 'sup-card');
    const price = sup.price2
      ? `${sup.price}–${sup.price2} DA`
      : `${sup.price} DA`;

    card.innerHTML = `
      <span class="sup-name">${esc(sup.name)}</span>
      <span class="sup-name-ar ar">${esc(sup.nameAr || '')}</span>
      <span class="sup-price">${price}</span>`;

    const addBtn = makeEl('button', 'sup-add-btn', '+');
    addBtn.addEventListener('click', () => {
      addToCart({ id: `sup-${sup.id}`, name: sup.name, nameAr: sup.nameAr || '', price: sup.price });
      addBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
      addBtn.classList.add('added');
      setTimeout(() => {
        addBtn.textContent = '+';
        addBtn.innerHTML = '+';
        addBtn.classList.remove('added');
      }, 1500);
    });
    card.appendChild(addBtn);
    grid.appendChild(card);
  });
}

// ── Cart ──────────────────────────────────────────────────────────────────────
function addToCart(item) {
  const existing = state.cart.find(c => c.id === item.id);
  if (existing) {
    existing.qty++;
  } else {
    state.cart.push({ ...item, qty: 1 });
  }
  saveCartToStorage();
  renderCartBadge();
  renderCartItems();
  updateFloatingCart();
  openCart();
}

function removeFromCart(id) {
  state.cart = state.cart.filter(c => c.id !== id);
  saveCartToStorage();
  renderCartBadge();
  renderCartItems();
  updateCartTotals();
  updateFloatingCart();
}

function updateQty(id, delta) {
  const item = state.cart.find(c => c.id === id);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) { removeFromCart(id); return; }
  saveCartToStorage();
  renderCartBadge();
  renderCartItems();
  updateCartTotals();
  updateFloatingCart();
}

function cartTotal() {
  return state.cart.reduce((sum, i) => sum + i.price * i.qty, 0);
}

function cartCount() {
  return state.cart.reduce((sum, i) => sum + i.qty, 0);
}

function renderCartBadge() {
  const count = cartCount();
  const el = $('cart-count');
  if (el) {
    el.textContent = count;
    el.classList.toggle('hidden', count === 0);
  }
}

function renderCartItems() {
  const list = $('cart-items-list');
  if (!list) return;

  list.innerHTML = '';

  if (!state.cart.length) {
    list.innerHTML = `
      <div class="cart-empty">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
          <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
        </svg>
        <span>Votre panier est vide</span>
      </div>`;
    return;
  }

  state.cart.forEach(item => {
    const row = makeEl('div', 'cart-item');
    row.innerHTML = `
      <div class="cart-item-info">
        <div class="cart-item-name">${esc(item.name)}${item.size ? ` (${item.size})` : ''}</div>
        <div class="cart-item-detail ar">${esc(item.nameAr)}</div>
      </div>
      <div class="cart-item-controls">
        <button class="qty-btn" data-action="dec" data-id="${esc(item.id)}">−</button>
        <span class="qty-num">${item.qty}</span>
        <button class="qty-btn" data-action="inc" data-id="${esc(item.id)}">+</button>
      </div>
      <div class="cart-item-price">${item.price * item.qty} DA</div>`;
    list.appendChild(row);
  });

  list.querySelectorAll('.qty-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      updateQty(id, btn.dataset.action === 'inc' ? 1 : -1);
    });
  });
}

function updateCartTotals() {
  const sub     = cartTotal();
  const discount = state.promo ? Math.round(sub * state.promo.discount / 100) : 0;
  const total   = sub - discount;

  const el = {
    sub:     $('cart-subtotal'),
    saving:  $('cart-saving'),
    savRow:  $('cart-saving-row'),
    total:   $('cart-total'),
  };

  if (el.sub)    el.sub.textContent  = sub + ' DA';
  if (el.total)  el.total.textContent = total + ' DA';
  if (el.savRow) el.savRow.style.display = discount ? 'flex' : 'none';
  if (el.saving) el.saving.textContent = `−${discount} DA (${state.promo?.discount}%)`;
}

function openCart() {
  $('cart-sidebar')?.classList.add('open');
  $('cart-overlay')?.classList.add('open');
  document.body.style.overflow = 'hidden';
  renderCartItems();
  updateCartTotals();
  bindPromoEvents();
  bindOrderBtn();
  injectContinueShoppingBtn();
  injectDrinksBanner();
}

function closeCart() {
  $('cart-sidebar')?.classList.remove('open');
  $('cart-overlay')?.classList.remove('open');
  document.body.style.overflow = '';
}

function updateFloatingCart() {
  const btn = $('floating-cart');
  if (!btn) return;
  const count = cartCount();
  btn.classList.toggle('has-items', count > 0);
  const c = $('floating-cart-count');
  if (c) c.textContent = count;
}

// ── Promo codes ───────────────────────────────────────────────────────────────
function bindPromoEvents() {
  const input  = $('promo-input');
  const btn    = $('promo-apply-btn');
  const status = $('promo-status');
  if (!btn || !input) return;

  // Remove old listener
  btn.replaceWith(btn.cloneNode(true));
  const newBtn = $('promo-apply-btn');

  newBtn.addEventListener('click', async () => {
    const code = input.value.trim().toUpperCase();
    if (!code) return;

    if (state.promoApplied) {
      showPromoStatus('Code déjà appliqué', 'ok');
      return;
    }

    newBtn.disabled = true;
    newBtn.textContent = '...';

    try {
      const res  = await fetch('/api/promos/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      });
      const data = await res.json();

      if (!data.valid) {
        showPromoStatus(data.error || 'Code invalide', 'err');
      } else {
        // Consume the code
        await fetch('/api/promos/redeem', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code })
        });
        state.promo        = { code, discount: data.discount };
        state.promoApplied = true;
        state.orderSent    = false;
        input.disabled     = true;
        showPromoStatus(`${data.discount}% de réduction appliquée !`, 'ok');
        updateCartTotals();
      }
    } catch {
      showPromoStatus('Erreur réseau, réessayez', 'err');
    } finally {
      newBtn.disabled    = false;
      newBtn.textContent = 'Appliquer';
    }
  });
}

function showPromoStatus(msg, type) {
  const el = $('promo-status');
  if (!el) return;
  el.textContent = msg;
  el.className   = 'promo-status ' + type;
}

// ── Order button ──────────────────────────────────────────────────────────────
function bindOrderBtn() {
  const btn = $('order-btn');
  if (!btn) return;

  btn.replaceWith(btn.cloneNode(true));
  const newBtn = $('order-btn');

  newBtn.disabled = !state.cart.length;

  newBtn.addEventListener('click', () => {
    if (!state.cart.length) return;

    // Check opening hours
    if (!isOpen()) {
      showClosedToast();
      return;
    }

    // If promo was used and order already sent, block re-submit
    if (state.promoApplied && state.orderSent) {
      showClosedToastMsg('Promo déjà utilisée — ajoutez un nouveau code pour une nouvelle commande');
      return;
    }

    openOrderModal();
  });
}

// ── Order modal ───────────────────────────────────────────────────────────────
function openOrderModal() {
  buildOrderModal();
  $('order-modal')?.classList.add('open');
}

function closeOrderModal() {
  $('order-modal')?.classList.remove('open');
  // Reset: hide success screen, show form again
  const orderForm = document.getElementById('order-form');
  const successEl = document.getElementById('order-success');
  if (orderForm) orderForm.style.display = '';
  if (successEl) successEl.style.display = 'none';
}

function buildOrderModal() {
  const modal = $('order-modal');
  if (!modal) return;

  const sub      = cartTotal();
  const discount = state.promo ? Math.round(sub * state.promo.discount / 100) : 0;
  const total    = sub - discount;

  // Summary rows
  const summaryHtml = state.cart.map(item =>
    `<div class="summary-item">
      <span>${esc(item.name)}${item.size ? ` (${item.size})` : ''} ×${item.qty}</span>
      <span>${item.price * item.qty} DA</span>
    </div>`
  ).join('');

  modal.querySelector('.modal-order-summary').innerHTML = summaryHtml;
  modal.querySelector('.modal-total-value').textContent =
    discount
      ? `${total} DA (-${discount} DA promo)`
      : `${total} DA`;

  // Init GPS button
  initGpsBtn();

  // Submit handler
  const form = modal.querySelector('#order-form');
  form.onsubmit = (e) => {
    e.preventDefault();
    submitOrder(form, total);
  };
}

async function submitOrder(form, total) {
  const name    = form.querySelector('[name="customer-name"]').value.trim();
  const phone   = form.querySelector('[name="customer-phone"]').value.trim();
  const address = form.querySelector('[name="customer-address"]').value.trim();
  const gps     = document.getElementById('gps-input')?.value?.trim() || '';
  const note    = form.querySelector('[name="customer-note"]')?.value.trim() || '';

  if (!name || !phone) return;

  // Disable submit button while sending
  const submitBtn = form.querySelector('[type="submit"]');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = '…'; }

  const savedAmount = state.promo
    ? Math.round(cartTotal() * state.promo.discount / 100)
    : 0;

  try {
    const res = await fetch('/api/orders', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name, phone, address, gps, note,
        total,
        cart: state.cart.map(i => ({
          name:  i.name,
          size:  i.size || null,
          qty:   i.qty,
          price: i.price,
        })),
        promo: state.promo
          ? { code: state.promo.code, discount: state.promo.discount, savedAmount }
          : null,
      }),
    });

    const json = await res.json();
    if (!json.ok) throw new Error(json.error || 'Erreur serveur');

    // Clear cart
    state.cart         = [];
    state.promo        = null;
    state.promoApplied = false;
    state.orderSent    = false;
    saveCartToStorage();
    renderCartBadge();
    renderCartItems();
    updateCartTotals();
    updateFloatingCart();
    closeCart();

    // Show success screen inside the modal
    const orderForm    = document.getElementById('order-form');
    const successEl    = document.getElementById('order-success');
    const successName  = document.getElementById('order-success-name');
    if (orderForm)   orderForm.style.display   = 'none';
    if (successName) successName.textContent   = name;
    if (successEl)   successEl.style.display   = '';

  } catch (e) {
    console.error('[order]', e);
    showClosedToastMsg('❌ فشل إرسال الطلب، حاول مجدداً');
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'تأكيد الطلب →';
    }
  }
}

// ── GPS Location ─────────────────────────────────────────────────────────────
function initGpsBtn() {
  const btn   = document.getElementById('gps-btn');
  const input = document.getElementById('gps-input');
  if (!btn || !input) return;

  const iconPin = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`;
  const iconSpin = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation:spin 1s linear infinite"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`;
  const iconCheck = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

  btn.addEventListener('click', () => {
    if (!navigator.geolocation) { input.value = 'الموقع غير متاح على هذا المتصفح'; return; }
    btn.innerHTML = iconSpin + ' جاري التحديد…';
    btn.disabled = true;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude.toFixed(6);
        const lng = pos.coords.longitude.toFixed(6);
        input.value = `${lat}, ${lng}`;
        btn.innerHTML = iconCheck + ' تم التحديد';
        btn.style.color = 'var(--green)';
        btn.style.borderColor = 'rgba(74,222,128,0.35)';
        // Reverse geocode
        fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`)
          .then(r => r.json())
          .then(d => { if (d && d.display_name) input.value = d.display_name; })
          .catch(() => {});
      },
      () => {
        input.value = 'تعذّر تحديد الموقع';
        btn.innerHTML = iconPin + ' تحديد موقعي';
        btn.disabled = false;
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}

// ── Drinks upsell banner ──────────────────────────────────────────────────────
function injectDrinksBanner() {
  if (document.getElementById('drink-upsell-banner')) return;
  const promoRow = document.querySelector('.promo-row');
  if (!promoRow) return;

  // Check if drink already in cart
  const hasDrink = state.cart.some(i =>
    i.cat === 'jus' || i.name.toLowerCase().includes('jus') || i.name.toLowerCase().includes('boisson')
  );
  if (hasDrink) return;

  const banner = document.createElement('div');
  banner.id = 'drink-upsell-banner';
  banner.style.cssText = 'display:flex;align-items:center;gap:12px;margin-bottom:12px;padding:12px 14px;background:rgba(10,60,30,0.7);border:1px solid rgba(74,222,128,0.25);border-radius:2px;font-family:Inter,sans-serif;';

  banner.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" style="flex-shrink:0">
      <g stroke="#39ff6a" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <line x1="15" y1="1" x2="15" y2="11"/>
        <path d="M5 7 L6.5 21 Q6.6 22 7.5 22 L16.5 22 Q17.4 22 17.5 21 L19 7 Z"/>
        <line x1="5" y1="7" x2="19" y2="7"/>
      </g>
    </svg>
    <div style="flex:1;min-width:0;">
      <p style="margin:0 0 2px;font-size:13px;font-weight:700;color:#fff;direction:rtl;font-family:'Cairo','Inter',sans-serif;">مخصكش مشروب؟</p>
      <p style="margin:0;font-size:10px;color:rgba(255,255,255,0.35);">Pas de boisson dans votre commande</p>
    </div>
    <button id="drinks-banner-btn" type="button" style="flex-shrink:0;padding:8px 14px;background:rgba(74,222,128,0.15);border:1px solid rgba(74,222,128,0.4);border-radius:2px;color:#4ade80;font-size:11px;font-weight:700;letter-spacing:0.08em;cursor:pointer;white-space:nowrap;">AJOUTER →</button>
  `;

  promoRow.insertAdjacentElement('beforebegin', banner);

  banner.querySelector('#drinks-banner-btn').addEventListener('click', () => {
    closeCart();
    // Scroll to drinks category
    setTimeout(() => {
      const jusCat = document.querySelector('[data-cat="jus"]');
      if (jusCat) { jusCat.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' }); jusCat.click(); }
      document.getElementById('menu')?.scrollIntoView({ behavior: 'smooth' });
    }, 300);
  });
}

// ── Continue Shopping button ───────────────────────────────────────────────────
function injectContinueShoppingBtn() {
  if (document.getElementById('continue-shopping-btn')) return;
  const orderBtn = document.getElementById('order-btn');
  if (!orderBtn) return;

  const btn = document.createElement('button');
  btn.id = 'continue-shopping-btn';
  btn.type = 'button';
  btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="margin-left:7px;flex-shrink:0"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg><span>متابعة التسوق &nbsp;—&nbsp; CONTINUE SHOPPING</span>`;
  btn.style.cssText = 'display:flex;align-items:center;justify-content:center;width:100%;margin-top:10px;padding:13px 20px;background:transparent;border:1px solid rgba(244,196,48,0.28);border-radius:6px;color:rgba(244,196,48,0.85);font-size:13px;font-weight:600;font-family:"Cairo","Inter",sans-serif;letter-spacing:0.02em;cursor:pointer;transition:background 0.18s,border-color 0.18s,color 0.18s;direction:rtl;';
  btn.addEventListener('mouseover', () => { btn.style.background = 'rgba(244,196,48,0.08)'; btn.style.borderColor = 'rgba(244,196,48,0.55)'; btn.style.color = '#f4c430'; });
  btn.addEventListener('mouseout',  () => { btn.style.background = 'transparent'; btn.style.borderColor = 'rgba(244,196,48,0.28)'; btn.style.color = 'rgba(244,196,48,0.85)'; });
  btn.addEventListener('click', closeCart);

  orderBtn.insertAdjacentElement('afterend', btn);
}

// ── Opening hours ─────────────────────────────────────────────────────────────
function isOpen() {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Africa/Algiers',
      weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: false
    }).formatToParts(new Date());

    const get = t => parts.find(p => p.type === t)?.value;
    const dayMap = { Sun:0, Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6 };
    const day  = dayMap[get('weekday')] ?? 0;
    const mins = parseInt(get('hour') || '0') * 60 + parseInt(get('minute') || '0');

    const openAt = day === 5 ? HOURS.openFriday : HOURS.open;
    return mins >= openAt && mins < HOURS.close;
  } catch {
    return true; // Fail open — don't block orders if detection fails
  }
}

let _toastTimer = null;
function showClosedToast() {
  showClosedToastMsg('نحن مغلقون الآن\nالطلبات تُفتح عند بداية وقت العمل');
}
function showClosedToastMsg(msg) {
  let el = $('closed-toast');
  if (!el) {
    el = makeEl('div', '', '');
    el.id = 'closed-toast';
    document.body.appendChild(el);
  }
  el.innerHTML = msg.replace('\n', '<br>');
  clearTimeout(_toastTimer);
  el.classList.add('show');
  _toastTimer = setTimeout(() => el.classList.remove('show'), 3500);
}

// ── Juice 3D Carousel ─────────────────────────────────────────────────────────
async function renderJuiceSection() {
  let JUICE_CAROUSEL = [], JUICE_SIMPLE = [];
  try {
    const data = await fetch('/api/juices').then(r => r.json());
    JUICE_CAROUSEL = data.carousel || [];
    JUICE_SIMPLE   = data.simple   || [];
  } catch (e) {
    console.warn('Juice fetch failed', e);
  }
  _buildJuiceSection(JUICE_CAROUSEL, JUICE_SIMPLE);
}

function _buildJuiceSection(JUICE_CAROUSEL, JUICE_SIMPLE) {
  const stage = document.getElementById('juice-stage');
  const dotsEl = document.getElementById('juice-dots');
  const simpleWrap = document.getElementById('juice-simple-wrap');
  if (!stage) return;

  const N = JUICE_CAROUSEL.length;
  let activeIdx = 0;
  let touchStartX = 0;

  // ── Build cards ──────────────────────────────────────────────
  const cards = JUICE_CAROUSEL.map((item, i) => {
    const card = document.createElement('div');
    card.className = 'juice-card';
    card.innerHTML = `
      <img class="juice-card-img" src="${esc(item.image)}" alt="${esc(item.name)}" loading="lazy"
           onerror="this.style.opacity='0.3'" />
      ${item.badge ? `<span class="juice-card-badge">${esc(item.badge)}</span>` : ''}
      <div class="juice-card-name">${esc(item.name)}</div>
      <div class="juice-card-name-ar">${esc(item.nameAr)}</div>
      <div class="juice-card-price">${item.price} DA</div>
      <button class="juice-card-add" aria-label="Ajouter ${esc(item.name)}">+</button>
    `;
    // Add to cart
    card.querySelector('.juice-card-add').addEventListener('click', (e) => {
      e.stopPropagation();
      const btn = e.currentTarget;
      addToCart({ id: item.id, name: item.name, nameAr: item.nameAr, price: item.price });
      btn.classList.add('added');
      btn.textContent = '✓';
      setTimeout(() => { btn.classList.remove('added'); btn.textContent = '+'; }, 1200);
    });
    // Click on non-active card → navigate to it
    card.addEventListener('click', () => { if (i !== activeIdx) goTo(i); });
    stage.appendChild(card);
    return card;
  });

  // ── Build dots ───────────────────────────────────────────────
  const dots = JUICE_CAROUSEL.map((_, i) => {
    const d = document.createElement('button');
    d.className = 'juice-dot';
    d.addEventListener('click', () => goTo(i));
    dotsEl.appendChild(d);
    return d;
  });

  // ── Layout: coverflow 3D transforms ─────────────────────────
  function applyTransforms(idx) {
    cards.forEach((card, i) => {
      // Compute shortest-path offset around the ring
      let offset = i - idx;
      if (offset >  N / 2) offset -= N;
      if (offset < -N / 2) offset += N;

      const abs   = Math.abs(offset);
      const sign  = offset === 0 ? 0 : offset / abs;
      const tx    = offset * 200;               // horizontal spread (px)
      const ry    = -sign * Math.min(abs, 2) * 42; // Y rotation (deg)
      const tz    = abs === 0 ? 0 : -80 - abs * 60; // depth (px)
      const scale = abs === 0 ? 1 : Math.max(0.5, 0.85 - (abs - 1) * 0.18);
      const opacity = abs === 0 ? 1 : Math.max(0, 0.72 - abs * 0.2);
      const zIndex  = 10 - abs;

      card.style.transform = `translateX(${tx}px) rotateY(${ry}deg) translateZ(${tz}px) scale(${scale})`;
      card.style.opacity   = abs > 3 ? '0' : String(opacity);
      card.style.zIndex    = String(zIndex);
      card.style.pointerEvents = abs > 2 ? 'none' : 'auto';
      card.classList.toggle('is-active', abs === 0);
    });
    dots.forEach((d, i) => d.classList.toggle('active', i === idx));
  }

  function goTo(idx) {
    activeIdx = ((idx % N) + N) % N;
    applyTransforms(activeIdx);
  }

  // ── Navigation buttons ───────────────────────────────────────
  document.getElementById('juice-prev').addEventListener('click', () => goTo(activeIdx - 1));
  document.getElementById('juice-next').addEventListener('click', () => goTo(activeIdx + 1));

  // ── Touch/swipe ──────────────────────────────────────────────
  stage.addEventListener('touchstart', (e) => { touchStartX = e.touches[0].clientX; }, { passive: true });
  stage.addEventListener('touchend',   (e) => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) > 40) goTo(activeIdx + (dx < 0 ? 1 : -1));
  });

  // ── Initial render ───────────────────────────────────────────
  applyTransforms(0);

  // ── Simple drinks list ───────────────────────────────────────
  simpleWrap.innerHTML = `<div class="juice-simple-title">Autres boissons — مشروبات أخرى</div>`;
  JUICE_SIMPLE.forEach(item => {
    const row = document.createElement('div');
    row.className = 'juice-simple-item';
    row.innerHTML = `
      <div class="juice-simple-names">
        <div class="juice-simple-name">${esc(item.name)}</div>
        <span class="juice-simple-name-ar">${esc(item.nameAr)}</span>
      </div>
      <div class="juice-simple-right">
        <span class="juice-simple-price">${item.price} DA</span>
        <button class="juice-simple-add" aria-label="Ajouter ${esc(item.name)}">+</button>
      </div>
    `;
    row.querySelector('.juice-simple-add').addEventListener('click', (e) => {
      const btn = e.currentTarget;
      addToCart({ id: item.id, name: item.name, nameAr: item.nameAr, price: item.price });
      btn.classList.add('added');
      btn.textContent = '✓';
      setTimeout(() => { btn.classList.remove('added'); btn.textContent = '+'; }, 1200);
    });
    simpleWrap.appendChild(row);
  });
}

// ── Cart persistence ──────────────────────────────────────────────────────────
function saveCartToStorage() {
  try { localStorage.setItem('club54-cart', JSON.stringify(state.cart)); } catch {}
}
function loadCartFromStorage() {
  try {
    const raw = localStorage.getItem('club54-cart');
    if (raw) state.cart = JSON.parse(raw);
  } catch {}
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function makeEl(tag, cls = '', text = '') {
  const el = document.createElement(tag);
  if (cls)  el.className = cls;
  if (text) el.textContent = text;
  return el;
}

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ══════════════════════════════════════════════════════════
   GALLERY LIGHTBOX
══════════════════════════════════════════════════════════ */
function initGalleryLightbox() {
  const lightbox  = document.getElementById('galleryLightbox');
  const lbImg     = document.getElementById('galleryLbImg');
  const lbLabel   = document.getElementById('galleryLbLabel');
  const lbClose   = document.getElementById('galleryLbClose');
  const lbPrev    = document.getElementById('galleryLbPrev');
  const lbNext    = document.getElementById('galleryLbNext');
  if (!lightbox) return;

  let GALLERY = [];
  let current = 0;

  function buildGalleryFromDOM() {
    GALLERY = [];
    document.querySelectorAll('.gallery-item').forEach(el => {
      const img  = el.querySelector('img');
      const lbl  = el.querySelector('.gallery-label');
      const desc = el.querySelector('.gallery-desc');
      if (img) GALLERY.push({
        src:   img.src,
        label: lbl  ? lbl.textContent  : '',
        desc:  desc ? desc.textContent : ''
      });
    });
  }

  function open(idx) {
    buildGalleryFromDOM();
    if (!GALLERY.length) return;
    current = (idx + GALLERY.length) % GALLERY.length;
    const item = GALLERY[current];
    lbImg.src = item.src;
    lbImg.alt = item.label;
    lbLabel.innerHTML = item.label +
      (item.desc ? `<div style="font-size:13px;font-weight:400;opacity:.75;margin-top:5px;letter-spacing:0;text-transform:none">${item.desc}</div>` : '');
    lightbox.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function close() {
    lightbox.classList.remove('active');
    document.body.style.overflow = '';
  }

  // Called after dynamic render to re-attach clicks
  window.bindGalleryLightbox = function() {
    document.querySelectorAll('.gallery-item').forEach(el => {
      el.removeEventListener('click', el._galleryClick);
      el._galleryClick = () => open(Number(el.dataset.index));
      el.addEventListener('click', el._galleryClick);
    });
  };

  lbClose.addEventListener('click', close);
  lbPrev.addEventListener('click', () => open(current - 1));
  lbNext.addEventListener('click', () => open(current + 1));
  lightbox.addEventListener('click', e => { if (e.target === lightbox) close(); });

  // Keyboard navigation
  document.addEventListener('keydown', e => {
    if (!lightbox.classList.contains('active')) return;
    if (e.key === 'Escape')     close();
    if (e.key === 'ArrowLeft')  open(current - 1);
    if (e.key === 'ArrowRight') open(current + 1);
  });
}

function showMenuError() {
  const loader = $('menu-loader');
  if (loader) {
    loader.innerHTML = `<div id="menu-error">
      Impossible de charger le menu. Vérifiez votre connexion et rechargez.
      <br><br>
      <button onclick="location.reload()" style="padding:8px 20px;background:var(--gold);color:#071a0f;border-radius:4px;font-weight:700;font-size:13px;">Recharger</button>
    </div>`;
  }
}
