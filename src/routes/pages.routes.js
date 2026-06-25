const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');

function render(view, extra = {}) {
  return (req, res) => res.render(view, { currentPath: req.originalUrl, ...extra });
}

// ---------------------------------------------------------------------------
// Public marketing / shop pages
// ---------------------------------------------------------------------------
router.get('/', render('home', { title: 'Home' }));
router.get('/shop', render('shop', { title: 'Shop' }));
router.get('/categories', render('categories', { title: 'Categories' }));
router.get('/suppliers', render('suppliers', { title: 'Suppliers' }));
router.get('/supplier/:slug', (req, res) => res.render('supplier-profile', { title: 'Supplier', currentPath: req.originalUrl, slug: req.params.slug }));
router.get('/product/:slug', (req, res) => res.render('product', { title: 'Product', currentPath: req.originalUrl, slug: req.params.slug }));
router.get('/cart', render('cart', { title: 'Your Cart' }));
router.get('/checkout', render('checkout', { title: 'Checkout' }));
router.get('/wishlist', render('wishlist', { title: 'Wishlist' }));
router.get('/about', render('about', { title: 'About Us' }));
router.get('/contact', render('contact', { title: 'Contact Us' }));
router.get('/privacy-policy', render('privacy-policy', { title: 'Privacy Policy' }));
router.get('/terms-conditions', render('terms-conditions', { title: 'Terms & Conditions' }));

// ---------------------------------------------------------------------------
// Auth pages
// ---------------------------------------------------------------------------
router.get('/login',    render('login',    { title: 'Log In',   googleEnabled: !!process.env.GOOGLE_CLIENT_ID }));
router.get('/register', render('register', { title: 'Sign Up',  googleEnabled: !!process.env.GOOGLE_CLIENT_ID }));
router.get('/vendor/register', render('vendor-register', { title: 'Become a Vendor' }));
router.get('/forgot-password', render('forgot-password', { title: 'Forgot Password' }));
router.get('/reset-password', render('reset-password', { title: 'Reset Password' }));
router.get('/verify-email', render('verify-email', { title: 'Verify Email' }));

// ---------------------------------------------------------------------------
// Customer dashboard
// ---------------------------------------------------------------------------
router.get('/dashboard', requireRole('customer'), render('dashboard/customer/overview', { title: 'My Dashboard' }));
router.get('/dashboard/orders', requireAuth, render('dashboard/customer/orders', { title: 'My Orders' }));
router.get('/dashboard/orders/:id', requireAuth, (req, res) => res.render('dashboard/customer/order-detail', { title: 'Order Detail', currentPath: req.originalUrl, orderId: req.params.id }));
router.get('/dashboard/addresses', requireAuth, render('dashboard/customer/addresses', { title: 'Saved Addresses' }));
router.get('/dashboard/reseller', requireRole('customer'), render('dashboard/customer/reseller', { title: 'Reseller Hub' }));
router.get('/dashboard/messages', requireAuth, render('dashboard/messages', { title: 'Messages' }));
router.get('/dashboard/notifications', requireAuth, render('dashboard/notifications', { title: 'Notifications' }));

// ---------------------------------------------------------------------------
// Vendor dashboard
// ---------------------------------------------------------------------------
router.get('/dashboard/vendor', requireRole('vendor'), render('dashboard/vendor/overview', { title: 'Vendor Dashboard' }));
router.get('/dashboard/vendor/products', requireRole('vendor'), render('dashboard/vendor/products', { title: 'My Products' }));
router.get('/dashboard/vendor/products/new', requireRole('vendor'), render('dashboard/vendor/product-form', { title: 'Add Product' }));
router.get('/dashboard/vendor/products/:id/edit', requireRole('vendor'), (req, res) => res.render('dashboard/vendor/product-form', { title: 'Edit Product', currentPath: req.originalUrl, productId: req.params.id }));
router.get('/dashboard/vendor/orders', requireRole('vendor'), render('dashboard/vendor/orders', { title: 'Orders' }));
router.get('/dashboard/vendor/store', requireRole('vendor'), render('dashboard/vendor/store', { title: 'Store Profile' }));
router.get('/dashboard/vendor/earnings', requireRole('vendor'), render('dashboard/vendor/earnings', { title: 'Earnings & Withdrawals' }));
router.get('/dashboard/vendor/coupons', requireRole('vendor'), render('dashboard/vendor/coupons', { title: 'Coupons' }));

// ---------------------------------------------------------------------------
// Admin dashboard
// ---------------------------------------------------------------------------
router.get('/dashboard/admin', requireRole('super_admin'), render('dashboard/admin/overview', { title: 'Admin Dashboard' }));
router.get('/dashboard/admin/vendors', requireRole('super_admin'), render('dashboard/admin/vendors', { title: 'Manage Vendors' }));
router.get('/dashboard/admin/products', requireRole('super_admin'), render('dashboard/admin/products', { title: 'Manage Products' }));
router.get('/dashboard/admin/categories', requireRole('super_admin'), render('dashboard/admin/categories', { title: 'Manage Categories' }));
router.get('/dashboard/admin/orders', requireRole('super_admin'), render('dashboard/admin/orders', { title: 'Manage Orders' }));
router.get('/dashboard/admin/users', requireRole('super_admin'), render('dashboard/admin/users', { title: 'Manage Users' }));
router.get('/dashboard/admin/withdrawals', requireRole('super_admin'), render('dashboard/admin/withdrawals', { title: 'Withdrawals' }));
router.get('/dashboard/admin/payments', requireRole('super_admin'), render('dashboard/admin/payments', { title: 'Payment Verification' }));
router.get('/dashboard/admin/reports', requireRole('super_admin'), render('dashboard/admin/reports', { title: 'Reports & Analytics' }));
router.get('/dashboard/admin/settings', requireRole('super_admin'), render('dashboard/admin/settings', { title: 'Platform Settings' }));

module.exports = router;
