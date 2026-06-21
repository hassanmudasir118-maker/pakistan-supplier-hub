const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('../config/db');
const { id } = require('../utils/ids');
const { signAccessToken, signRefreshToken, verifyRefreshToken, REFRESH_EXPIRES_DAYS } = require('../utils/jwt');
const { sendEmail, verificationEmailHtml, resetEmailHtml } = require('../utils/email');

const ACCESS_COOKIE = 'psh_access';
const REFRESH_COOKIE = 'psh_refresh';

function cookieOpts(maxAgeMs) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: maxAgeMs,
  };
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isStrongPassword(pw) {
  return typeof pw === 'string' && pw.length >= 8;
}

async function issueSession(res, user, req) {
  const accessToken = signAccessToken(user);
  const sessionId = id('sess');
  const expiresAt = new Date(Date.now() + REFRESH_EXPIRES_DAYS * 24 * 60 * 60 * 1000).toISOString();
  db.run(
    `INSERT INTO sessions (id, user_id, user_agent, ip_address, expires_at) VALUES (?, ?, ?, ?, ?)`,
    [sessionId, user.id, req.get('User-Agent') || null, req.ip, expiresAt]
  );
  const refreshToken = signRefreshToken(sessionId, user.id);
  res.cookie(ACCESS_COOKIE, accessToken, cookieOpts(30 * 60 * 1000));
  res.cookie(REFRESH_COOKIE, refreshToken, cookieOpts(REFRESH_EXPIRES_DAYS * 24 * 60 * 60 * 1000));
}

async function sendVerificationEmail(user) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  db.run(
    `INSERT INTO email_verification_tokens (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)`,
    [id('evt'), user.id, token, expiresAt]
  );
  const link = `${process.env.APP_URL}/verify-email?token=${token}`;
  await sendEmail({
    to: user.email,
    subject: 'Verify your email — Pakistan Supplier Hub',
    html: verificationEmailHtml(user.name, link),
    text: `Verify your email: ${link}`,
  });
}

// ---------------------------------------------------------------------------
// POST /api/auth/register  (customer)
// ---------------------------------------------------------------------------
async function registerCustomer(req, res) {
  const { name, email, password, phone, referralCode } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email, and password are required.' });
  if (!isValidEmail(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
  if (!isStrongPassword(password)) return res.status(400).json({ error: 'Password must be at least 8 characters.' });

  const existing = db.get('SELECT id FROM users WHERE email = ?', [email.toLowerCase()]);
  if (existing) return res.status(409).json({ error: 'An account with this email already exists.' });

  let referredBy = null;
  if (referralCode) {
    const refUser = db.get('SELECT id FROM users WHERE id = ?', [referralCode]);
    if (refUser) referredBy = refUser.id;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const newId = id('user');
  db.run(
    `INSERT INTO users (id, name, email, phone, password_hash, role, referred_by) VALUES (?, ?, ?, ?, ?, 'customer', ?)`,
    [newId, name.trim(), email.toLowerCase(), phone || null, passwordHash, referredBy]
  );

  if (referredBy) {
    db.run(`INSERT INTO referrals (id, referrer_id, referred_user_id) VALUES (?, ?, ?)`, [id('ref'), referredBy, newId]);
  }

  const user = db.get('SELECT * FROM users WHERE id = ?', [newId]);
  await sendVerificationEmail(user);
  await issueSession(res, user, req);
  res.status(201).json({ user: publicUser(user) });
}

// ---------------------------------------------------------------------------
// POST /api/auth/register-vendor
// ---------------------------------------------------------------------------
async function registerVendor(req, res) {
  const {
    name, email, password, phone,
    businessName, businessType, cnicOrNtn, businessPhone, businessEmail,
    warehouseAddress, warehouseCity, warehouseProvince,
  } = req.body;

  if (!name || !email || !password || !businessName || !businessType || !businessPhone) {
    return res.status(400).json({ error: 'Please fill in all required fields.' });
  }
  if (!isValidEmail(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
  if (!isStrongPassword(password)) return res.status(400).json({ error: 'Password must be at least 8 characters.' });

  const validTypes = ['supplier', 'wholesaler', 'manufacturer', 'importer', 'dropshipping_vendor'];
  if (!validTypes.includes(businessType)) return res.status(400).json({ error: 'Invalid business type.' });

  const existing = db.get('SELECT id FROM users WHERE email = ?', [email.toLowerCase()]);
  if (existing) return res.status(409).json({ error: 'An account with this email already exists.' });

  const passwordHash = await bcrypt.hash(password, 12);
  const userId = id('user');
  db.run(
    `INSERT INTO users (id, name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?, 'vendor')`,
    [userId, name.trim(), email.toLowerCase(), phone || null, passwordHash]
  );

  const vendorId = id('vendor');
  db.run(
    `INSERT INTO vendors (id, user_id, business_name, business_type, cnic_or_ntn, business_phone, business_email, warehouse_address, warehouse_city, warehouse_province)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [vendorId, userId, businessName.trim(), businessType, cnicOrNtn || null, businessPhone, businessEmail || null, warehouseAddress || null, warehouseCity || null, warehouseProvince || null]
  );

  // Pre-create the store shell (vendor fills in logo/banner/description later)
  const slug = slugify(businessName) + '-' + vendorId.slice(-6);
  db.run(`INSERT INTO stores (id, vendor_id, slug, store_name) VALUES (?, ?, ?, ?)`, [id('store'), vendorId, slug, businessName.trim()]);

  // Notify admins
  const admins = db.all(`SELECT id FROM users WHERE role = 'super_admin'`);
  for (const admin of admins) {
    db.run(
      `INSERT INTO notifications (id, user_id, type, title, body, link) VALUES (?, ?, 'vendor_application', ?, ?, ?)`,
      [id('notif'), admin.id, 'New vendor application', `${businessName} applied to sell on the platform.`, '/dashboard/admin/vendors']
    );
  }

  const user = db.get('SELECT * FROM users WHERE id = ?', [userId]);
  await sendVerificationEmail(user);
  await issueSession(res, user, req);
  res.status(201).json({ user: publicUser(user), message: 'Application submitted. An admin will review your store shortly.' });
}

function slugify(text) {
  return text.toString().toLowerCase().trim()
    .replace(/[^\w\s-]/g, '').replace(/[\s_-]+/g, '-').replace(/^-+|-+$/g, '');
}

// ---------------------------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------------------------
async function login(req, res) {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

  const user = db.get('SELECT * FROM users WHERE email = ?', [email.toLowerCase()]);
  if (!user || !user.password_hash) return res.status(401).json({ error: 'Invalid email or password.' });

  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) return res.status(401).json({ error: 'Invalid email or password.' });

  if (user.status !== 'active') return res.status(403).json({ error: 'This account has been suspended. Contact support.' });

  await issueSession(res, user, req);
  res.json({ user: publicUser(user) });
}

// ---------------------------------------------------------------------------
// POST /api/auth/logout
// ---------------------------------------------------------------------------
function logout(req, res) {
  const refreshToken = req.cookies && req.cookies[REFRESH_COOKIE];
  if (refreshToken) {
    try {
      const payload = verifyRefreshToken(refreshToken);
      db.run('UPDATE sessions SET revoked = 1 WHERE id = ?', [payload.sid]);
    } catch (e) { /* already invalid, nothing to revoke */ }
  }
  res.clearCookie(ACCESS_COOKIE);
  res.clearCookie(REFRESH_COOKIE);
  res.json({ ok: true });
}

// ---------------------------------------------------------------------------
// POST /api/auth/refresh
// ---------------------------------------------------------------------------
function refresh(req, res) {
  const refreshToken = req.cookies && req.cookies[REFRESH_COOKIE];
  if (!refreshToken) return res.status(401).json({ error: 'Not logged in.' });
  try {
    const payload = verifyRefreshToken(refreshToken);
    const session = db.get('SELECT * FROM sessions WHERE id = ?', [payload.sid]);
    if (!session || session.revoked || new Date(session.expires_at) < new Date()) {
      return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }
    const user = db.get('SELECT * FROM users WHERE id = ?', [payload.sub]);
    if (!user || user.status !== 'active') return res.status(401).json({ error: 'Account unavailable.' });
    const accessToken = signAccessToken(user);
    res.cookie(ACCESS_COOKIE, accessToken, cookieOpts(30 * 60 * 1000));
    res.json({ user: publicUser(user) });
  } catch (e) {
    res.status(401).json({ error: 'Session expired. Please log in again.' });
  }
}

// ---------------------------------------------------------------------------
// GET /api/auth/me
// ---------------------------------------------------------------------------
function me(req, res) {
  if (!req.user) return res.status(401).json({ error: 'Not logged in.' });
  const full = db.get('SELECT * FROM users WHERE id = ?', [req.user.id]);
  const out = publicUser(full);
  if (req.user.role === 'vendor') out.vendor = req.vendor || null;
  res.json({ user: out });
}

// ---------------------------------------------------------------------------
// GET /api/auth/verify-email?token=...
// ---------------------------------------------------------------------------
function verifyEmail(req, res) {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: 'Missing token.' });
  const record = db.get('SELECT * FROM email_verification_tokens WHERE token = ?', [token]);
  if (!record || record.used || new Date(record.expires_at) < new Date()) {
    return res.status(400).json({ error: 'This verification link is invalid or has expired.' });
  }
  db.run('UPDATE users SET email_verified = 1 WHERE id = ?', [record.user_id]);
  db.run('UPDATE email_verification_tokens SET used = 1 WHERE id = ?', [record.id]);
  res.json({ ok: true, message: 'Email verified successfully.' });
}

async function resendVerification(req, res) {
  if (!req.user) return res.status(401).json({ error: 'Not logged in.' });
  const user = db.get('SELECT * FROM users WHERE id = ?', [req.user.id]);
  if (user.email_verified) return res.json({ ok: true, message: 'Your email is already verified.' });
  await sendVerificationEmail(user);
  res.json({ ok: true, message: 'Verification email sent.' });
}

// ---------------------------------------------------------------------------
// POST /api/auth/forgot-password
// ---------------------------------------------------------------------------
async function forgotPassword(req, res) {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required.' });
  const user = db.get('SELECT * FROM users WHERE email = ?', [email.toLowerCase()]);
  // Always respond success — don't leak which emails exist
  if (user && user.password_hash) {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    db.run(`INSERT INTO password_reset_tokens (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)`, [id('prt'), user.id, token, expiresAt]);
    const link = `${process.env.APP_URL}/reset-password?token=${token}`;
    await sendEmail({ to: user.email, subject: 'Reset your password', html: resetEmailHtml(user.name, link), text: `Reset your password: ${link}` });
  }
  res.json({ ok: true, message: 'If that email is registered, a reset link has been sent.' });
}

// ---------------------------------------------------------------------------
// POST /api/auth/reset-password
// ---------------------------------------------------------------------------
async function resetPassword(req, res) {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'Missing token or password.' });
  if (!isStrongPassword(password)) return res.status(400).json({ error: 'Password must be at least 8 characters.' });

  const record = db.get('SELECT * FROM password_reset_tokens WHERE token = ?', [token]);
  if (!record || record.used || new Date(record.expires_at) < new Date()) {
    return res.status(400).json({ error: 'This reset link is invalid or has expired.' });
  }
  const passwordHash = await bcrypt.hash(password, 12);
  db.run('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, record.user_id]);
  db.run('UPDATE password_reset_tokens SET used = 1 WHERE id = ?', [record.id]);
  db.run('UPDATE sessions SET revoked = 1 WHERE user_id = ?', [record.user_id]); // log out everywhere
  res.json({ ok: true, message: 'Password updated. Please log in.' });
}

function publicUser(user) {
  return {
    id: user.id, name: user.name, email: user.email, phone: user.phone,
    role: user.role, avatarUrl: user.avatar_url, isReseller: !!user.is_reseller,
    emailVerified: !!user.email_verified,
  };
}

module.exports = {
  registerCustomer, registerVendor, login, logout, refresh, me,
  verifyEmail, resendVerification, forgotPassword, resetPassword,
  issueSession, publicUser, ACCESS_COOKIE, REFRESH_COOKIE,
};
