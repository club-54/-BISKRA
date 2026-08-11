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
    // The static GitHub Pages admin uses separate Bins for each data group.
    // Never put the JSONBin master key in this public GitHub Pages file.
    JSONBIN_KEY: '',
    JSONBIN_BINS: {
      menu:        '6a60762fda38895dfe7e48fd',
      supplements: '6a60762ff5f4af5e29afc502',
      promos:      '6a60762fda38895dfe7e48fc',
      overrides:   '6a5e4d70f5f4af5e29a88fe1',
    },

    // ─── Admin password hash (SHA-256 of "FARES54") ───────────────────────────
    ADMIN_HASH: '80aa9063dd4d673c66e8f87592698f6360765e9aec8328bb6e44a8cca8a666ed',

    // ─── Base URL (auto-detected, don't change) ───────────────────────────────
    BASE: base,
  };
})();
