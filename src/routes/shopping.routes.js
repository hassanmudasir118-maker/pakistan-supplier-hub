const express = require('express');
const router = express.Router();
const cart = require('../controllers/cartController');
const reseller = require('../controllers/resellerController');
const address = require('../controllers/addressController');
const { requireAuth, requireRole } = require('../middleware/auth');
const asyncWrap = require('../utils/asyncWrap');

router.get('/cart', requireAuth, asyncWrap(cart.getCart));
router.post('/cart', requireAuth, asyncWrap(cart.addToCart));
router.put('/cart/:id', requireAuth, asyncWrap(cart.updateCartItem));
router.delete('/cart/:id', requireAuth, asyncWrap(cart.removeCartItem));
router.delete('/cart', requireAuth, asyncWrap(cart.clearCart));

router.get('/wishlist', requireAuth, asyncWrap(cart.getWishlist));
router.post('/wishlist', requireAuth, asyncWrap(cart.addToWishlist));
router.delete('/wishlist/:productId', requireAuth, asyncWrap(cart.removeFromWishlist));

router.post('/reseller/import', requireRole('customer'), asyncWrap(reseller.importProduct));
router.get('/reseller/products', requireRole('customer'), asyncWrap(reseller.myResellerProducts));
router.put('/reseller/products/:id', requireRole('customer'), asyncWrap(reseller.updateResellerProduct));
router.delete('/reseller/products/:id', requireRole('customer'), asyncWrap(reseller.removeResellerProduct));

router.get('/addresses', requireAuth, asyncWrap(address.listAddresses));
router.post('/addresses', requireAuth, asyncWrap(address.createAddress));
router.put('/addresses/:id', requireAuth, asyncWrap(address.updateAddress));
router.delete('/addresses/:id', requireAuth, asyncWrap(address.deleteAddress));

module.exports = router;
