const crypto = require('crypto');

const COOKIE_NAME = 'psh_csrf';

/** Ensures every visitor has a CSRF token cookie (readable by JS, so it can be echoed back in a header). */
function ensureCsrfCookie(req, res, next) {
  if (!req.cookies || !req.cookies[COOKIE_NAME]) {
    const token = crypto.randomBytes(32).toString('hex');
    res.cookie(COOKIE_NAME, token, {
      httpOnly: false, // must be readable by client JS to echo back
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    req.csrfToken = token;
  } else {
    req.csrfToken = req.cookies[COOKIE_NAME];
  }
  next();
}

/** Verifies the X-CSRF-Token header matches the cookie for state-changing requests. */
function verifyCsrf(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const cookieToken = req.cookies && req.cookies[COOKIE_NAME];
  const headerToken = req.get('X-CSRF-Token');
  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return res.status(403).json({ error: 'Security check failed. Please refresh the page and try again.' });
  }
  next();
}

module.exports = { ensureCsrfCookie, verifyCsrf, COOKIE_NAME };
