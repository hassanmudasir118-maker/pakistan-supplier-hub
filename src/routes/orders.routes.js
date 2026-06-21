const express = require('express');
const router = express.Router();
const orders = require('../controllers/orderController');
const withdrawals = require('../controllers/withdrawalController');
const reviews = require('../controllers/reviewController');
const messages = require('../controllers/messageController');
const notifications = require('../controllers/notificationController');
const coupons = require('../controllers/couponController');
const { requireAuth, requireRole, requireApprovedVendor } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/rateLimiters');
const asyncWrap = require('../utils/asyncWrap');

// Orders — customer
router.post('/orders', requireRole('customer'), writeLimiter, asyncWrap(orders.placeOrder));
router.get('/orders', requireRole('customer'), asyncWrap(orders.myOrders));
router.get('/orders/:id', requireAuth, asyncWrap(orders.getOrder));
router.post('/orders/:id/payment-proof', requireRole('customer'), asyncWrap(orders.submitPaymentProof));
router.post('/orders/:id/refund-request', requireRole('customer'), asyncWrap(orders.requestRefund));

// Orders — vendor
router.get('/vendor/orders', requireApprovedVendor, asyncWrap(orders.vendorOrders));
router.patch('/vendor/orders/:groupId/status', requireApprovedVendor, asyncWrap(orders.vendorUpdateOrderStatus));

// Orders — admin
router.get('/admin/orders', requireRole('super_admin'), asyncWrap(orders.adminListOrders));
router.get('/admin/payment-proofs', requireRole('super_admin'), asyncWrap(orders.adminListPaymentProofs));
router.post('/admin/payment-proofs/:id/verify', requireRole('super_admin'), asyncWrap(orders.adminVerifyPaymentProof));
router.get('/admin/refunds', requireRole('super_admin'), asyncWrap(orders.adminListRefunds));
router.post('/admin/refunds/:id/resolve', requireRole('super_admin'), asyncWrap(orders.adminResolveRefund));

// Withdrawals
router.post('/vendor/withdrawals', requireApprovedVendor, asyncWrap(withdrawals.requestWithdrawal));
router.get('/vendor/withdrawals', requireApprovedVendor, asyncWrap(withdrawals.myWithdrawals));
router.get('/admin/withdrawals', requireRole('super_admin'), asyncWrap(withdrawals.adminListWithdrawals));
router.post('/admin/withdrawals/:id/resolve', requireRole('super_admin'), asyncWrap(withdrawals.adminResolveWithdrawal));

// Reviews
router.post('/reviews/product', requireRole('customer'), asyncWrap(reviews.addProductReview));
router.post('/reviews/vendor', requireRole('customer'), asyncWrap(reviews.addVendorReview));

// Messages
router.post('/conversations', requireRole('customer'), asyncWrap(messages.startOrGetConversation));
router.get('/conversations', requireAuth, asyncWrap(messages.listConversations));
router.get('/conversations/:id/messages', requireAuth, asyncWrap(messages.getMessages));
router.post('/conversations/:id/messages', requireAuth, asyncWrap(messages.sendMessage));

// Notifications
router.get('/notifications', requireAuth, asyncWrap(notifications.listNotifications));
router.post('/notifications/:id/read', requireAuth, asyncWrap(notifications.markRead));
router.post('/notifications/read-all', requireAuth, asyncWrap(notifications.markAllRead));

// Coupons
router.post('/coupons', requireAuth, asyncWrap(coupons.createCoupon)); // role-checked inside (vendor or admin)
router.get('/coupons', requireAuth, asyncWrap(coupons.listCoupons));
router.delete('/coupons/:id', requireAuth, asyncWrap(coupons.deleteCoupon));
router.get('/coupons/validate', asyncWrap(coupons.validateCoupon));

module.exports = router;
