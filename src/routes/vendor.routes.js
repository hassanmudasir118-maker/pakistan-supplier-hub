const express = require('express');
const router = express.Router();
const v = require('../controllers/vendorController');
const { requireRole, requireApprovedVendor } = require('../middleware/auth');
const asyncWrap = require('../utils/asyncWrap');

// Public supplier directory
router.get('/suppliers', asyncWrap(v.listSuppliers));
router.get('/suppliers/:slug', asyncWrap(v.getSupplierProfile));

// Vendor self-service
router.get('/vendor/store', requireApprovedVendor, asyncWrap(v.getMyStore));
router.put('/vendor/store', requireApprovedVendor, asyncWrap(v.updateStore));
router.put('/vendor/business', requireApprovedVendor, asyncWrap(v.updateBusinessInfo));
router.get('/vendor/dashboard', requireApprovedVendor, asyncWrap(v.vendorDashboard));

// Admin vendor management
router.get('/admin/vendors', requireRole('super_admin'), asyncWrap(v.adminListVendors));
router.get('/admin/vendors/:id', requireRole('super_admin'), asyncWrap(v.adminGetVendor));
router.post('/admin/vendors/:id/approve', requireRole('super_admin'), asyncWrap(v.adminApproveVendor));
router.post('/admin/vendors/:id/reject', requireRole('super_admin'), asyncWrap(v.adminRejectVendor));
router.post('/admin/vendors/:id/verify', requireRole('super_admin'), asyncWrap(v.adminSetVendorVerified));
router.post('/admin/vendors/:id/commission', requireRole('super_admin'), asyncWrap(v.adminSetVendorCommission));
router.post('/admin/vendors/:id/suspend', requireRole('super_admin'), asyncWrap(v.adminSuspendVendor));

module.exports = router;
