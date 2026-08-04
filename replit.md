# Club 54 Food

A restaurant menu web app with an admin panel for managing menu items, supplements, and promo codes.

## Versions

### Static site → GitHub Pages (active deployment)
All static files are in `docs/` and are deployed to GitHub Pages:
- **Repo**: https://github.com/club-54/-BISKRA
- **Live site**: https://club-54.github.io/-BISKRA/
- **Admin panel**: https://club-54.github.io/-BISKRA/admin/login.html
- **Admin password**: FARES54

Pages URL base is auto-detected in `docs/js/config.js`. JSONBin credentials must be added there for admin edits to persist.

### v2 server (Replit preview)
- **Backend**: Node.js + Express (ESM), runs from `v2/server.js`
- **Frontend**: Static HTML/CSS/JS (vanilla, no framework), served from `v2/public/`
- **Storage**: Local JSON files in `v2/data/` (with optional JSONBin cloud sync)

## How to run locally (Replit preview)
The workflow is pre-configured. Press **Run** or use the "Start application" workflow.
```
node v2/server.js
```
Server starts on port 5000.

## Static site structure (docs/)
```
docs/
  index.html          ← Public menu page
  admin/
    login.html        ← Admin login (password: FARES54)
    index.html        ← Admin dashboard
  js/
    config.js         ← JSONBin keys + admin password hash + base URL
    api.js            ← JSONBin read/write + static JSON fallback
    admin-shim.js     ← Intercepts fetch('/api/…') calls in the admin panel
    app.js            ← Main frontend logic
  css/style.css
  data/               ← Static JSON fallback data
  favicon.svg
```

## Adding JSONBin for live admin edits
1. Register at https://jsonbin.io
2. Create a bin with `{}` as initial value
3. Fill in `JSONBIN_KEY` and `JSONBIN_BIN_ID` in `docs/js/config.js`
4. Commit & push — GitHub Pages will redeploy automatically

## Environment variables (v2 server only)
| Variable | Required | Description |
|---|---|---|
| `SESSION_SECRET` | Yes | Secret for express-session cookie signing |
| `ADMIN_PASSWORD` | Yes | Plaintext password for the /admin panel |
| `JSONBIN_MASTER_KEY` | No | JSONBin API key for cloud-synced menu overrides |
| `JSONBIN_BIN_ID` | No | JSONBin bin ID for cloud-synced menu overrides |

## User preferences
