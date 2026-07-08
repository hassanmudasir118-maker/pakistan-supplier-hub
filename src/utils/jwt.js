const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const ACCESS_EXPIRES_IN   = '30m';
const REFRESH_EXPIRES_DAYS = 30;

// Secrets MUST come from JWT_ACCESS_SECRET / JWT_REFRESH_SECRET env vars in
// production (set them in Railway → Variables). This repo is public, so we
// deliberately do NOT hardcode a fallback secret here — a fallback baked into
// public source code would let anyone forge valid login tokens, including
// admin tokens. If the env vars are missing, a random secret is generated
// for this process only; it changes on every restart (logging everyone out),
// which is safe — unlike a permanently-known public secret.
function resolveSecret(envVar) {
  const fromEnv = process.env[envVar];
  if (fromEnv && fromEnv.trim().length >= 32) return fromEnv.trim();
  const generated = crypto.randomBytes(48).toString('hex');
  console.error(`[SECURITY] ${envVar} is not set (or too short) — generated a temporary secret for this run. ` +
    `Set ${envVar} in Railway → Variables with a value from: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))" ` +
    `Until you do, all sessions will be invalidated on every restart/redeploy.`);
  return generated;
}

const ACCESS_SECRET  = resolveSecret('JWT_ACCESS_SECRET');
const REFRESH_SECRET = resolveSecret('JWT_REFRESH_SECRET');

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
