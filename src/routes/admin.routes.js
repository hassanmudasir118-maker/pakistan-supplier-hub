const express = require('express');
const router = express.Router();
const admin = require('../controllers/adminController');
const { requireRole, requireAuth, requireApprovedVendor } = require('../middleware/auth');
const { uploader } = require('../middleware/upload');
const asyncWrap = require('../utils/asyncWrap');
const path = require('path');

router.get('/admin/dashboard', requireRole('super_admin'), asyncWrap(admin.dashboard));
router.get('/admin/reports/sales', requireRole('super_admin'), asyncWrap(admin.salesReport));
router.get('/admin/reports/revenue', requireRole('super_admin'), asyncWrap(admin.revenueReport));
router.get('/admin/reports/suppliers', requireRole('super_admin'), asyncWrap(admin.supplierReport));
router.get('/admin/reports/customers', requireRole('super_admin'), asyncWrap(admin.customerReport));

router.get('/admin/users', requireRole('super_admin'), asyncWrap(admin.listUsers));
router.patch('/admin/users/:id/status', requireRole('super_admin'), asyncWrap(admin.setUserStatus));

router.get('/settings', asyncWrap(admin.getSettings)); // public-readable (shipping fee, support email shown in footer/checkout)
router.put('/admin/settings', requireRole('super_admin'), asyncWrap(admin.updateSettings));

router.post('/newsletter/subscribe', asyncWrap(admin.subscribeNewsletter));

function handleUpload(mw) {
  return (req, res, next) => mw(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Upload failed.' });
    next();
  });
}

// --- Secure file uploads ---
router.post('/upload/logo', requireApprovedVendor, handleUpload(uploader('logos', { singleField: 'file' })), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
  res.status(201).json({ url: `/uploads/logos/${req.file.filename}` });
});
router.post('/upload/banner', requireApprovedVendor, handleUpload(uploader('banners', { singleField: 'file' })), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
  res.status(201).json({ url: `/uploads/banners/${req.file.filename}` });
});
router.post('/upload/product-images', requireApprovedVendor, handleUpload(uploader('products', { fieldName: 'files', maxCount: 8 })), (req, res) => {
  const files = (req.files && req.files.files) || [];
  if (!files.length) return res.status(400).json({ error: 'No files uploaded.' });
  res.status(201).json({ urls: files.map((f) => `/uploads/products/${f.filename}`) });
});
router.post('/upload/payment-proof', requireAuth, handleUpload(uploader('proofs', { singleField: 'file' })), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
  res.status(201).json({ url: `/uploads/proofs/${req.file.filename}` });
});
router.post('/upload/avatar', requireAuth, handleUpload(uploader('avatars', { singleField: 'file' })), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
  res.status(201).json({ url: `/uploads/avatars/${req.file.filename}` });
});

module.exports = router;
