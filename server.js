require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const compression = require('compression');
const morgan = require('morgan');
const path = require('path');
const bcrypt = require('bcryptjs');

const db = require('./src/config/db');
const { id } = require('./src/utils/ids');
const { attachUser } = require('./src/middleware/auth');
const { ensureCsrfCookie, verifyCsrf } = require('./src/middleware/csrf');
const { apiLimiter } = require('./src/middleware/rateLimiters');
const { notFoundHandler, errorHandler } = require('./src/middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Bootstrap: ensure a super_admin account exists (from .env credentials)
// ---------------------------------------------------------------------------
(async function bootstrapAdmin() {
  const existing = db.get(`SELECT id FROM users WHERE role = 'super_admin' LIMIT 1`);
  if (!existing && process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 12);
    db.run(
      `INSERT INTO users (id, name, email, password_hash, role, email_verified) VALUES (?, ?, ?, ?, 'super_admin', 1)`,
      [id('user'), process.env.ADMIN_NAME || 'Platform Admin', process.env.ADMIN_EMAIL.toLowerCase(), hash]
    );
    console.log(`[bootstrap] Super admin account created: ${process.env.ADMIN_EMAIL}`);
  }
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
app.use(cors({ origin: process.env.APP_URL, credentials: true }));
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
