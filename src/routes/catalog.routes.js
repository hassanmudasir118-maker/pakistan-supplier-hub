const express = require('express');
const router = express.Router();
const cat = require('../controllers/categoryController');
const prod = require('../controllers/productController');
const { requireRole, requireApprovedVendor } = require('../middleware/auth');
const asyncWrap = require('../utils/asyncWrap');

// Public
router.get('/categories', asyncWrap(cat.listCategories));
router.get('/categories/:slug', asyncWrap(cat.getCategory));
router.get('/products', asyncWrap(prod.listProducts));
router.get('/products/:slug', asyncWrap(prod.getProduct));

// Admin category management
router.post('/admin/categories', requireRole('super_admin'), asyncWrap(cat.createCategory));
router.put('/admin/categories/:id', requireRole('super_admin'), asyncWrap(cat.updateCategory));
router.delete('/admin/categories/:id', requireRole('super_admin'), asyncWrap(cat.deleteCategory));

// Admin product moderation
router.get('/admin/products', requireRole('super_admin'), asyncWrap(prod.adminListProducts));
router.patch('/admin/products/:id/status', requireRole('super_admin'), asyncWrap(prod.adminUpdateProductStatus));

// Vendor product management
router.get('/vendor/products', requireApprovedVendor, asyncWrap(prod.listVendorProducts));
router.post('/vendor/products', requireApprovedVendor, asyncWrap(prod.createProduct));
router.put('/vendor/products/:id', requireApprovedVendor, asyncWrap(prod.updateProduct));
router.delete('/vendor/products/:id', requireApprovedVendor, asyncWrap(prod.deleteProduct));

module.exports = router;
