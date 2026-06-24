const jwt = require('jsonwebtoken');

const ACCESS_EXPIRES_IN  = '30m';
const REFRESH_EXPIRES_DAYS = 30;

// Fallback secrets for first-boot / misconfigured deployments.
// Replace with strong random values via JWT_ACCESS_SECRET / JWT_REFRESH_SECRET env vars.
const ACCESS_SECRET  = process.env.JWT_ACCESS_SECRET  || 'psh-default-access-secret-change-me-in-production';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'psh-default-refresh-secret-change-me-in-production';

if (!process.env.JWT_ACCESS_SECRET) console.warn('[warn] JWT_ACCESS_SECRET not set — using insecure default. Set this env var in production!');

function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, name: user.name, email: user.email },
    ACCESS_SECRET,
    { expiresIn: ACCESS_EXPIRES_IN }
  );
}

function signRefreshToken(sessionId, userId) {
  return jwt.sign(
    { sid: sessionId, sub: userId },
    REFRESH_SECRET,
    { expiresIn: `${REFRESH_EXPIRES_DAYS}d` }
  );
}

function verifyAccessToken(token) {
  return jwt.verify(token, ACCESS_SECRET);
}

function verifyRefreshToken(token) {
  return jwt.verify(token, REFRESH_SECRET);
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  REFRESH_EXPIRES_DAYS,
};
