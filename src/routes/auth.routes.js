const express = require('express');
const router = express.Router();
const auth = require('../controllers/authController');
const { authLimiter } = require('../middleware/rateLimiters');
const { requireAuth } = require('../middleware/auth');
const { passport, googleEnabled } = require('../config/passport');

router.post('/register', authLimiter, asyncWrap(auth.registerCustomer));
router.post('/register-vendor', authLimiter, asyncWrap(auth.registerVendor));
router.post('/login', authLimiter, asyncWrap(auth.login));
router.post('/logout', auth.logout);
router.post('/refresh', auth.refresh);
router.get('/me', requireAuth, auth.me);
router.get('/verify-email', auth.verifyEmail);
router.post('/resend-verification', requireAuth, authLimiter, asyncWrap(auth.resendVerification));
router.post('/forgot-password', authLimiter, asyncWrap(auth.forgotPassword));
router.post('/reset-password', authLimiter, asyncWrap(auth.resetPassword));

router.get('/google', (req, res, next) => {
  if (!googleEnabled) return res.status(503).json({ error: 'Google sign-in is not configured on this server yet.' });
  passport.authenticate('google', { scope: ['profile', 'email'], session: false })(req, res, next);
});

router.get('/google/callback', (req, res, next) => {
  if (!googleEnabled) return res.redirect('/login?error=google_not_configured');
  passport.authenticate('google', { session: false, failureRedirect: '/login?error=google_failed' }, async (err, user) => {
    if (err || !user) return res.redirect('/login?error=google_failed');
    await auth.issueSession(res, user, req);
    res.redirect(user.role === 'vendor' ? '/dashboard/vendor' : user.role === 'super_admin' ? '/dashboard/admin' : '/dashboard');
  })(req, res, next);
});

function asyncWrap(fn) {
  return (req, res, next) => fn(req, res, next).catch(next);
}

module.exports = router;
