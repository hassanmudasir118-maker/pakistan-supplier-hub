const { verifyAccessToken } = require('../utils/jwt');
const db = require('../config/db');

/** Reads the access token cookie, attaches req.user if valid. Never blocks — use requireAuth for that. */
function attachUser(req, res, next) {
  const token = req.cookies && req.cookies.psh_access;
  if (!token) return next();
  try {
    const payload = verifyAccessToken(token);
    const user = db.get('SELECT id, name, email, role, status, avatar_url, is_reseller FROM users WHERE id = ?', [payload.sub]);
    if (user && user.status === 'active') {
      req.user = user;
      if (user.role === 'vendor') {
        req.vendor = db.get('SELECT * FROM vendors WHERE user_id = ?', [user.id]);
      }
    }
  } catch (e) {
    // expired/invalid access token — client should call /api/auth/refresh
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) {
    if (req.originalUrl.startsWith('/api/')) return res.status(401).json({ error: 'Please log in to continue.' });
    return res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
  }
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      if (req.originalUrl.startsWith('/api/')) return res.status(401).json({ error: 'Please log in to continue.' });
      return res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "You don't have permission to do that." });
    }
    next();
  };
}

/** For vendor routes — also requires the vendor account to be approved. */
function requireApprovedVendor(req, res, next) {
  if (!req.user || req.user.role !== 'vendor') {
    return res.status(403).json({ error: 'Vendor account required.' });
  }
  if (!req.vendor || req.vendor.status !== 'approved') {
    return res.status(403).json({ error: 'Your vendor account is not approved yet.' });
  }
  next();
}

module.exports = { attachUser, requireAuth, requireRole, requireApprovedVendor };
