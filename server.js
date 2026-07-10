require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const compression = require('compression');
const morgan = require('morgan');
const path = require('path');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const db = require('./src/config/db');
const { id } = require('./src/utils/ids');
const { attachUser } = require('./src/middleware/auth');
const { ensureCsrfCookie, verifyCsrf } = require('./src/middleware/csrf');
const { apiLimiter } = require('./src/middleware/rateLimiters');
const { notFoundHandler, errorHandler } = require('./src/middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust Railway's (and similar PaaS) reverse proxy so that:
// 1. req.secure === true on HTTPS requests (cookie secure flag works)
// 2. req.ip reflects the real client IP, not the proxy's IP
app.set('trust proxy', 1);

// ---------------------------------------------------------------------------
// Dual-domain experience (Daraz-style): the SAME app + database serves two
// domains. SHOP_DOMAIN (set in Railway Variables once you generate a second
// domain) gets a clean customer-only storefront experience — no vendor/seller
// prompts. Every other domain (the original one) gets the seller-portal-
// forward experience with vendor registration prominent. All actual data
// (products, orders, vendors) is identical on both — only the presentation
// differs based on which domain the visitor is on.
// ---------------------------------------------------------------------------
const SHOP_DOMAIN = (process.env.SHOP_DOMAIN || '').trim().toLowerCase();
app.use((req, res, next) => {
  // No second domain configured yet → default to the clean customer experience
  // everywhere. Once SHOP_DOMAIN is set (a real second domain later), this
  // domain automatically switches to the seller-portal-forward experience.
  res.locals.isShopDomain = !SHOP_DOMAIN || req.hostname.toLowerCase() === SHOP_DOMAIN;
  next();
});

// Force HTTPS in production (Railway terminates TLS — x-forwarded-proto is set)
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.get('x-forwarded-proto') === 'https' || req.secure) return next();
    return res.redirect(301, 'https://' + req.get('host') + req.url);
  });
}

// ---------------------------------------------------------------------------
// Bootstrap: always upsert super_admin synchronously BEFORE server starts.
// Env vars are cleaned (trimmed + quotes stripped) since dashboard UIs often
// introduce stray whitespace/newlines/quotes when variables are pasted in.
// A guaranteed-working recovery admin is also ensured so login never breaks
// even if ADMIN_EMAIL/ADMIN_PASSWORD env vars are missing or malformed.
// ---------------------------------------------------------------------------
function cleanEnv(v) {
  if (!v) return '';
  return String(v)
    .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '') // zero-width & non-breaking space chars (common in mobile copy-paste)
    .trim()
    .replace(/^["']|["']$/g, '')
    .trim();
}

function upsertAdmin(email, password, name) {
  email = email.toLowerCase();
  const hash = bcrypt.hashSync(password, 10); // sync — blocking is fine at startup
  const existing = db.get(`SELECT id FROM users WHERE email = ?`, [email]);
  if (existing) {
    db.run(
      `UPDATE users SET password_hash = ?, name = ?, role = 'super_admin', email_verified = 1, status = 'active' WHERE id = ?`,
      [hash, name, existing.id]
    );
  } else {
    db.run(
      `INSERT INTO users (id, name, email, password_hash, role, email_verified, status)
       VALUES (?, ?, ?, ?, 'super_admin', 1, 'active')`,
      [id('user'), name, email, hash]
    );
  }
}

(function bootstrapAdmin() {
  const envEmail    = cleanEnv(process.env.ADMIN_EMAIL);
  const envPassword = cleanEnv(process.env.ADMIN_PASSWORD);
  const envName     = cleanEnv(process.env.ADMIN_NAME) || 'Platform Admin';

  // Custom admin from env vars, if both are provided and valid.
  if (envEmail && envPassword && envEmail.includes('@') && envPassword.length >= 8) {
    upsertAdmin(envEmail, envPassword, envName);
    console.log(`[bootstrap] Admin ready → ${envEmail}`);
    return;
  }

  if (process.env.ADMIN_EMAIL || process.env.ADMIN_PASSWORD) {
    console.warn('[bootstrap] ADMIN_EMAIL/ADMIN_PASSWORD env vars present but invalid (email must contain @, password must be 8+ chars).');
  }

  // No valid env-configured admin. Since this repo is public, we deliberately
  // do NOT hardcode a fallback password in source code — that would let
  // anyone reading GitHub log in as super_admin. Instead, generate a random
  // password now and print it ONLY to the server log (Railway → Console/Logs,
  // visible only to the account owner). It changes on every restart until
  // ADMIN_EMAIL/ADMIN_PASSWORD are set properly in Railway → Variables.
  const fallbackEmail    = 'admin@psh.com';
  const fallbackPassword = crypto.randomBytes(9).toString('base64').replace(/[+/=]/g, '').slice(0, 12) + '!A1';
  upsertAdmin(fallbackEmail, fallbackPassword, 'Platform Admin');
  console.log('==================================================================');
  console.log('[bootstrap] No valid ADMIN_EMAIL/ADMIN_PASSWORD set — generated a');
  console.log('  temporary admin login (changes on every restart):');
  console.log(`  Email:    ${fallbackEmail}`);
  console.log(`  Password: ${fallbackPassword}`);
  console.log('  To make this permanent, set ADMIN_EMAIL and ADMIN_PASSWORD in');
  console.log('  Railway → Variables, then redeploy.');
  console.log('==================================================================');
})();

// ---------------------------------------------------------------------------
// Demo seed — runs once on fresh DB (no vendors yet) to populate sample data
// ---------------------------------------------------------------------------
(function bootstrapDemoData() {
  try {
    const hasVendors = db.get('SELECT COUNT(*) as c FROM vendors').c > 0;
    if (hasVendors) return; // already seeded
    const demoSeedPath = require('path').join(__dirname, 'database', 'demo-seed.js');
    if (require('fs').existsSync(demoSeedPath)) {
      require(demoSeedPath);
      console.log('[bootstrap] Demo vendors and products seeded.');
    }
  } catch(e) { console.warn('[bootstrap] Demo seed skipped:', e.message); }
})();

// ---------------------------------------------------------------------------
// Security & core middleware
// ---------------------------------------------------------------------------
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://cdnjs.cloudflare.com', 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdnjs.cloudflare.com'],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      connectSrc: ["'self'"],
    },
  },
}));
app.use(compression());
app.use(cors({
  origin: (origin, cb) => {
    // Allow same-origin requests (origin is undefined) and the configured APP_URL
    if (!origin || !process.env.APP_URL || origin === process.env.APP_URL) return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(cookieParser());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(attachUser);
app.use(ensureCsrfCookie);
app.use('/api', apiLimiter);
app.use('/api/whatsapp', require('./src/routes/whatsapp.routes')); // before CSRF — Meta's servers call this, not our frontend
app.use('/api', verifyCsrf);

// ---------------------------------------------------------------------------
// View engine
// ---------------------------------------------------------------------------
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Uploaded images — served from UPLOADS_DIR if set (e.g. a Railway volume
// mount), otherwise from the default public/uploads folder. Registered
// before the general static handler below so it takes precedence.
app.use('/uploads', express.static(
  process.env.UPLOADS_DIR || path.join(__dirname, 'public', 'uploads'),
  { maxAge: process.env.NODE_ENV === 'production' ? '7d' : 0 }
));

// Static assets (public/, including uploaded images)
app.use(express.static(path.join(__dirname, 'public'), { maxAge: process.env.NODE_ENV === 'production' ? '7d' : 0 }));

// robots.txt / sitemap.xml
app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /dashboard\nDisallow: /api\nSitemap: ${process.env.APP_URL}/sitemap.xml`);
});
app.get('/sitemap.xml', (req, res) => {
  const staticUrls = ['/', '/shop', '/categories', '/suppliers', '/about', '/contact', '/privacy-policy', '/terms-conditions'];
  const products = db.all(`SELECT slug, updated_at FROM products WHERE status = 'active' LIMIT 5000`);
  const stores = db.all(`SELECT s.slug FROM stores s JOIN vendors v ON v.id = s.vendor_id WHERE v.status = 'approved'`);
  const urls = [
    ...staticUrls.map((u) => `<url><loc>${process.env.APP_URL}${u}</loc></url>`),
    ...products.map((p) => `<url><loc>${process.env.APP_URL}/product/${p.slug}</loc></url>`),
    ...stores.map((s) => `<url><loc>${process.env.APP_URL}/supplier/${s.slug}</loc></url>`),
  ].join('\n');
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`);
});

// manifest.json for PWA
app.get('/manifest.json', (req, res) => {
  res.json({
    name: 'Pakistan Supplier Hub',
    short_name: 'PSH',
    start_url: '/',
    display: 'standalone',
    background_color: '#0B1220',
    theme_color: '#1F3A5F',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  });
});
app.get('/service-worker.js', (req, res) => res.sendFile(path.join(__dirname, 'public', 'js', 'service-worker.js')));

// ---------------------------------------------------------------------------
// API routes
// ---------------------------------------------------------------------------
app.use('/api/auth', require('./src/routes/auth.routes'));
app.use('/api', require('./src/routes/catalog.routes'));
app.use('/api', require('./src/routes/vendor.routes'));
app.use('/api', require('./src/routes/shopping.routes'));
app.use('/api', require('./src/routes/orders.routes'));
app.use('/api', require('./src/routes/admin.routes'));
app.use('/api', require('./src/routes/chat.routes'));

// ---------------------------------------------------------------------------
// TEMPORARY one-time admin repair link — self-disables after first use.
// Gated by a random token (not a guessable password). Remove this block
// once the admin login is confirmed working; it is not meant to stay.
// ---------------------------------------------------------------------------
const SETUP_TOKEN = '361d07a13d34b436fa36c46834f0202560e3731f48097428';
const SETUP_MARKER_ID = 'setup_marker_used_361d07a1';
app.get('/api/_setup/:token', (req, res) => {
  if (req.params.token !== SETUP_TOKEN) return res.status(404).send('Not found.');
  const used = db.get(`SELECT id FROM users WHERE id = ?`, [SETUP_MARKER_ID]);
  if (used) return res.status(410).send('This setup link has already been used and is now disabled.');

  const email    = String(req.query.email || '').trim().toLowerCase();
  const password = String(req.query.password || '').trim();
  const name     = String(req.query.name || 'Admin').trim();
  if (!email.includes('@') || password.length < 8) {
    return res.status(400).send('Usage: ?email=you@example.com&password=YourPass123&name=YourName (password must be 8+ chars)');
  }

  const hash = bcrypt.hashSync(password, 10);
  const existing = db.get('SELECT id FROM users WHERE email = ?', [email]);
  if (existing) {
    db.run(`UPDATE users SET password_hash = ?, name = ?, role = 'super_admin', email_verified = 1, status = 'active' WHERE id = ?`, [hash, name, existing.id]);
  } else {
    db.run(`INSERT INTO users (id, name, email, password_hash, role, email_verified, status) VALUES (?, ?, ?, ?, 'super_admin', 1, 'active')`, [id('user'), name, email, hash]);
  }
  // Mark this setup link as permanently used so it can't be triggered again.
  db.run(`INSERT INTO users (id, name, email, password_hash, role, email_verified, status) VALUES (?, 'setup-marker', ?, '-', 'customer', 0, 'suspended')`, [SETUP_MARKER_ID, SETUP_MARKER_ID + '@internal.invalid']);

  res.send(`Done. Admin account ready: ${email}. This link is now disabled — you can close this tab and log in at /login.`);
});

// ---------------------------------------------------------------------------
// Frontend page routes (server-rendered shell; pages hydrate via /api calls)
// ---------------------------------------------------------------------------
app.use('/', require('./src/routes/pages.routes'));

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------
app.use(notFoundHandler);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`\n  Pakistan Supplier Hub running at ${process.env.APP_URL || `http://localhost:${PORT}`}\n`);
});
