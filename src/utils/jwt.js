const jwt = require('jsonwebtoken');

const ACCESS_EXPIRES_IN   = '30m';
const REFRESH_EXPIRES_DAYS = 30;

// Secrets MUST come from environment variables in production.
// Set JWT_ACCESS_SECRET and JWT_REFRESH_SECRET in Railway Variables.
// Generated with: node -e "require('crypto').randomBytes(48).toString('hex')"
const ACCESS_SECRET  = process.env.JWT_ACCESS_SECRET
  || '8fae2885e5fa5615fe06c088288722445938d5511024beb79b62b23c7e3dc552c74da193aba72a4665386ebb23391762';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET
  || '5392d2132c52b7e1b2b35931404d23a23e56bb812801339e3d1be467a25da5c96ff923ad30fe22ed1880b30784718168';

if (process.env.NODE_ENV === 'production' && !process.env.JWT_ACCESS_SECRET) {
  console.error('[SECURITY] JWT_ACCESS_SECRET env var not set in production! Set it in Railway Variables immediately.');
}

function signAccessToken(user, rememberMe = false) {
  return jwt.sign(
    { sub: user.id, role: user.role, name: user.name, email: user.email },
    ACCESS_SECRET,
    { expiresIn: rememberMe ? '7d' : ACCESS_EXPIRES_IN }
  );
}

function signRefreshToken(sessionId, userId, rememberMe = false) {
  const days = rememberMe ? 90 : REFRESH_EXPIRES_DAYS;
  return jwt.sign({ sid: sessionId, sub: userId }, REFRESH_SECRET, { expiresIn: `${days}d` });
}

function verifyAccessToken(token)  { return jwt.verify(token, ACCESS_SECRET);  }
function verifyRefreshToken(token) { return jwt.verify(token, REFRESH_SECRET); }

module.exports = { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken, REFRESH_EXPIRES_DAYS };
