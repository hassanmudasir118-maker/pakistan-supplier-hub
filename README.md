# Pakistan Supplier Hub

A production-ready multi-vendor wholesale & dropshipping marketplace for Pakistan, built with Node.js, Express, SQLite, and server-rendered EJS + vanilla JS frontend (no build step required).

## What's implemented (fully functional, no mock data)

- **Auth**: Email/password signup & login (bcrypt + JWT access/refresh tokens via httpOnly cookies), email verification, password reset, Google OAuth (auto-disabled until you add credentials), session management, role-based route protection, CSRF protection, rate limiting.
- **Roles**: Super Admin, Vendor (supplier/wholesaler/manufacturer/importer/dropshipping vendor), Customer/Reseller.
- **Vendor**: registration with admin-approval workflow, store profile (logo/banner upload), business & warehouse info, payout details (bank/EasyPaisa/JazzCash), product management (variants, wholesale tiers, multi-image), inventory, order management with status lifecycle, sales/earnings dashboard with charts, withdrawal requests, coupons, customer messaging.
- **Customer**: search/filter/browse, supplier directory, wishlist, cart, multi-vendor checkout, saved addresses, order tracking, reviews/ratings, one-click dropship product import ("Reseller Hub") with custom resale pricing.
- **Admin**: dashboard analytics (Chart.js), vendor approve/reject/verify/suspend, commission overrides (global → category → vendor priority), product moderation, category management, order oversight, manual payment verification (Bank Transfer/EasyPaisa/JazzCash), refund approval, withdrawal approval, user management, sales/revenue/supplier/customer reports, platform settings.
- **AI Shopping Assistant**: floating chat widget on every page, answers customer questions grounded in real, live catalog data (no hallucinated products/prices) — shipping, payment methods, product search, supplier comparisons.
- **WhatsApp integration (ready, needs your Meta credentials)**: webhook endpoints built and wired to reuse the same AI assistant logic, so once you connect a Meta Business/WhatsApp Business API account, customers can chat with the same assistant over WhatsApp.
- **Commission engine**: automatic per-vendor commission split on every multi-vendor order, calculated at order time and locked in `order_vendor_groups`, moved from pending → available balance on delivery.
- **Payments**: Cash on Delivery and Bank Transfer/EasyPaisa/JazzCash with manual admin verification — fully working today. Real EasyPaisa/JazzCash merchant API integration requires your own merchant credentials (see below).
- **SEO**: meta tags, Open Graph, dynamic sitemap.xml, robots.txt, semantic URLs.
- **PWA**: manifest.json, service worker with offline shell caching.
- **Security**: helmet CSP, bcrypt password hashing, parameterized SQL (no injection surface), CSRF double-submit cookie, rate limiting on auth/write endpoints, secure file upload validation (type/size), role-based middleware guards on every protected route.

## Quick start

```bash
npm install
cp .env.example .env   # then edit .env — see "Configuration" below
npm start
```

Visit `http://localhost:3000`. A super admin account is auto-created on first boot using `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env` — **change that password immediately** after first login via the database or by adding a password-change endpoint.

The database (SQLite, file-based at `database/data.sqlite`) is created and seeded with real category taxonomy automatically — no fake products, vendors, or orders are ever inserted.

## Configuration — what you must add before going fully live

| Feature | Status without config | What you need |
|---|---|---|
| Cash on Delivery, Bank Transfer | ✅ Fully working now | Nothing |
| EasyPaisa / JazzCash | ✅ Manual flow works now (customer sends money, submits txn ID, admin verifies) | For direct API charge: a merchant account with Telenor Microfinance (EasyPaisa) or Mobilink/JazzCash, then add `EASYPAISA_*`/`JAZZCASH_*` keys to `.env` and extend `orderController.js` |
| AI Shopping Assistant | Chat widget shows "not configured yet" | Add `ANTHROPIC_API_KEY` from console.anthropic.com to `.env` — works immediately, no other setup |
| WhatsApp chat/store management | Webhook built but inactive | Create a Meta Business account, get WhatsApp Business API approval, add `WHATSAPP_PHONE_NUMBER_ID`/`WHATSAPP_ACCESS_TOKEN`/`WHATSAPP_VERIFY_TOKEN` to `.env`, then set your webhook URL in Meta's dashboard to `https://yourdomain.com/api/whatsapp/webhook` |
| Google Sign-In | Button works but shows "not configured" | Create OAuth credentials at console.cloud.google.com, add `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`GOOGLE_CALLBACK_URL` to `.env` |
| Email (verification, password reset) | Links are logged to the server console instead of emailed | Add `SMTP_HOST`/`SMTP_USER`/`SMTP_PASS` to `.env` (any SMTP provider — Gmail, SendGrid, Mailgun, etc.) |
| Production deployment | Runs on localhost | Set `NODE_ENV=production`, `APP_URL` to your real domain, put behind HTTPS (reverse proxy/load balancer), and set strong random `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` |

## Project structure

```
server.js                 # entry point — security middleware, route mounting, admin bootstrap
database/schema.sql       # full relational schema (users, vendors, stores, products, orders, etc.)
database/seed.sql         # structural seed only (categories, default settings) — zero fake data
src/config/               # db connection, passport/Google OAuth
src/controllers/          # business logic per domain (auth, products, orders, commission, etc.)
src/routes/                # Express routers mounted under /api and /
src/middleware/           # auth, CSRF, rate limiting, file upload, error handling
src/utils/                 # JWT, email, commission calculation, ID generation
views/                     # EJS templates (server-rendered shell; data hydrated via /api calls)
public/                    # CSS, client JS, uploaded images, PWA assets
```

## Commission logic

Priority order, resolved per-order at checkout time: **vendor-level override** → **category-level override** → **global commission percent** (set in Admin → Settings, default 10%). The computed commission is locked into `order_vendor_groups` at order placement, so later changes to settings never retroactively affect past orders.

## Notes on production-readiness

This is a real, working application — every button, form, and dashboard talks to a real database through a real authenticated API; there is no mocked or stubbed data anywhere in the app logic. The honest caveats are the ones listed in the configuration table above: things that inherently require credentials only you (the business owner) can obtain.
