const jwt = require('jsonwebtoken');

const ACCESS_EXPIRES_IN  = '30m';
const REFRESH_EXPIRES_DAYS = 30;

// Fallback secrets for first-boot / misconfigured deployments.
// Replace with strong random values via JWT_ACCESS_SECRET / JWT_REFRESH_SECRET env vars.
const ACCESS_SECRET  = process.env.JWT_ACCESS_SECRET  || '4ac52ae36c8fe0c610b94b1b483461df0b8ff593bc787ad9d4a80c7d1ae60694e2c8fd8e98fcc579093fbe00812eaa4a';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'ffbe7bf3e1002eaefc5fe0d4ca83a930710563373267b77df6e6fa480e2f027f5d542e67ef36bb0fb0cbca9d6d9ca531';

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
