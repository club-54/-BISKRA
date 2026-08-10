# Club 54 Food v2 — Plan de Travail

## État actuel (Juillet 2026)

### ✅ Terminé
- Réécriture complète du projet dans `/v2/`
- Serveur Express propre (`server.js`) avec toutes les API
- Interface principale (`public/index.html`) — vanilla JS, zéro framework
- Panel admin (`public/admin/index.html` + `login.html`)
- Correction du bug principal : la page ne bloque plus après le chargement de la vidéo
- CSS dark theme propre et cohérent
- Système de panier complet (localStorage)
- Validation et consommation des codes promo
- Commande via WhatsApp

### ⚠️ À configurer (secrets Replit)
- `ADMIN_PASSWORD` : mot de passe admin (obligatoire pour /admin)
- `SESSION_SECRET` : déjà configuré
- `ADMIN_PASSWORD_BACKUP` : mot de passe bcrypt de secours (optionnel)

### 🔧 À finaliser
1. **Numéro WhatsApp** — chercher `213XXXXXXXXX` dans `public/js/app.js` et remplacer par le vrai numéro
2. **Images locales** — les images `/images/burgers/`, `/images/sandwichs/`, `/images/tacos/`, `/pizzas/` n'existent pas dans le repo. Deux options :
   - Uploader les images dans `v2/public/images/` et `v2/public/pizzas/`
   - Ou utiliser des URLs Cloudinary pour tous les items
3. **JSONBin (optionnel)** — si `JSONBIN_MASTER_KEY` et `JSONBIN_BIN_ID` sont configurés dans les secrets, les overrides se synchronisent sur le cloud. Sinon, les fichiers locaux sont utilisés.

### 🗂 Structure des fichiers
```
v2/
├── server.js              # API Express (menu, promos, supplements, auth)
├── package.json
├── PLAN.md                # Ce fichier
├── data/
│   ├── menu.json          # Menu de base (92 items, 10 catégories)
│   ├── menu-overrides.json # Surcharges admin (prix, badges, items custom)
│   ├── promo-codes.json   # Codes promo (format CLUB54-XXXXXXXX)
│   └── supplements.json   # Suppléments (frite, fromages, etc.)
└── public/
    ├── index.html         # Page principale (SPA)
    ├── css/
    │   └── style.css      # Dark theme, responsive
    ├── js/
    │   └── app.js         # Logique : menu, panier, promo, commande
    └── admin/
        ├── login.html     # Page de connexion admin
        └── index.html     # Dashboard admin (menu, promos, supplements)
```

### 🐛 Bug original corrigé
Le bug principal (`page breaks after video`) était causé par un `page-loader` qui bloquait tout le contenu en attendant l'événement `canplay` de la vidéo hero. Si la vidéo ne chargeait pas (réseau lent, CDN indisponible), la page était bloquée.

**Solution v2** : 
- Pas de loader bloquant
- La vidéo hero se charge en arrière-plan
- Le contenu est visible immédiatement
- La vidéo s'affiche en fondu si elle charge, sinon l'image de fond reste

### 📡 API Endpoints
```
GET  /api/menu              → menu fusionné (base + overrides)
GET  /api/menu/base         → menu de base seulement (admin)
POST /api/menu/overrides    → remplacer les overrides (admin)
PATCH /api/menu/item/:id    → modifier un item (admin)
POST /api/menu/item         → ajouter un item (admin)
DELETE /api/menu/item/:id   → supprimer un item (admin)
POST /api/menu/item/:id/restore → restaurer un item supprimé (admin)
POST /api/categories        → ajouter une catégorie (admin)
DELETE /api/categories/:id  → supprimer une catégorie (admin)
GET  /api/supplements       → liste des suppléments
POST /api/supplements       → ajouter un supplément (admin)
PATCH /api/supplements/:id  → modifier un supplément (admin)
DELETE /api/supplements/:id → supprimer un supplément (admin)
GET  /api/promos            → tous les codes promo (admin)
POST /api/promos/generate   → générer N codes (admin)
DELETE /api/promos/:code    → supprimer un code (admin)
POST /api/promos/validate   → vérifier un code (public)
POST /api/promos/redeem     → consommer un code (public)
POST /admin/login           → authentification admin
GET  /admin/logout          → déconnexion admin
```

### 🚀 Pour démarrer
```bash
cd v2
npm install
node server.js
```
Ou configurer le workflow Replit pour pointer vers `v2/server.js`.
