/* ── Club 54 Food — Static Configuration ─────────────────────────────────────
   أضف مفاتيح JSONBin هنا ليعمل الأدمن وتحديثات المنيو
─────────────────────────────────────────────────────────────────────────────── */
const CONFIG = (() => {
  // Auto-detect base URL (localhost vs GitHub Pages)
  const parts = location.pathname.split('/').filter(Boolean);
  const isGH  = location.hostname.includes('github.io');
  const base  = location.origin + (isGH && parts.length ? '/' + parts[0] : '');

  return {
    // ─── JSONBin credentials ───────────────────────────────────────────────────
    // سجّل في https://jsonbin.io واحصل على مفتاحك
    JSONBIN_KEY:    '',   // ← X-Master-Key مثال: $2a$10$...
    JSONBIN_BIN_ID: '',   // ← Bin ID  مثال: 6812abc123...

    // ─── Admin password hash (SHA-256 of "FARES54") ───────────────────────────
    ADMIN_HASH: '80aa9063dd4d673c66e8f87592698f6360765e9aec8328bb6e44a8cca8a666ed',

    // ─── Base URL (auto-detected, don't change) ───────────────────────────────
    BASE: base,
  };
})();
