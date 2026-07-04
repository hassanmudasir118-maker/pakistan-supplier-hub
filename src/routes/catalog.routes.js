const express = require('express');
const router  = express.Router();
const cat     = require('../controllers/categoryController');
const prod    = require('../controllers/productController');
const bulk    = require('../controllers/bulkImportController');
const { requireRole, requireApprovedVendor } = require('../middleware/auth');
const asyncWrap        = require('../utils/asyncWrap');
const { writeLimiter } = require('../middleware/rateLimiters');
const multer  = require('multer');
const os      = require('os');

// CSV upload storage — temp file, deleted after import
const csvUpload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) return cb(null, true);
    cb(new Error('Only CSV files allowed for bulk import.'));
  },
}).single('file');

// Public
router.get('/categories',        asyncWrap(cat.listCategories));
router.get('/categories/:slug',  asyncWrap(cat.getCategory));
router.get('/products',          asyncWrap(prod.listProducts));
router.get('/products/:slug',    asyncWrap(prod.getProduct));

// Admin category management
router.post('/admin/categories',       requireRole('super_admin'), writeLimiter, asyncWrap(cat.createCategory));
router.put('/admin/categories/:id',    requireRole('super_admin'), writeLimiter, asyncWrap(cat.updateCategory));
router.delete('/admin/categories/:id', requireRole('super_admin'), asyncWrap(cat.deleteCategory));

// Admin product moderation
router.get('/admin/products',               requireRole('super_admin'), asyncWrap(prod.adminListProducts));
router.patch('/admin/products/:id/status',  requireRole('super_admin'), writeLimiter, asyncWrap(prod.adminUpdateProductStatus));

// Vendor product management
router.get('/vendor/products',          requireApprovedVendor, asyncWrap(prod.listVendorProducts));
router.post('/vendor/products',         requireApprovedVendor, writeLimiter, asyncWrap(prod.createProduct));
router.put('/vendor/products/:id',      requireApprovedVendor, writeLimiter, asyncWrap(prod.updateProduct));
router.delete('/vendor/products/:id',   requireApprovedVendor, asyncWrap(prod.deleteProduct));

// Bulk import — CSV upload or JSON rows
router.get('/vendor/products/bulk-template', requireApprovedVendor, bulk.downloadTemplate);
router.post('/vendor/products/bulk-import',  requireApprovedVendor, (req, res, next) => {
  csvUpload(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}, asyncWrap(bulk.bulkImport));

module.exports = router;
