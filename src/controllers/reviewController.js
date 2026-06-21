const db = require('../config/db');
const { id } = require('../utils/ids');

function recalcProductRating(productId) {
  const agg = db.get('SELECT AVG(rating) AS avg, COUNT(*) AS cnt FROM product_reviews WHERE product_id = ?', [productId]);
  db.run('UPDATE products SET rating_avg = ?, rating_count = ? WHERE id = ?', [agg.avg ? Math.round(agg.avg * 10) / 10 : 0, agg.cnt, productId]);
}
function recalcVendorRating(vendorId) {
  const agg = db.get('SELECT AVG(rating) AS avg, COUNT(*) AS cnt FROM vendor_reviews WHERE vendor_id = ?', [vendorId]);
  db.run('UPDATE stores SET rating_avg = ?, rating_count = ? WHERE vendor_id = ?', [agg.avg ? Math.round(agg.avg * 10) / 10 : 0, agg.cnt, vendorId]);
}

function addProductReview(req, res) {
  const { productId, rating, comment } = req.body;
  if (!productId || !rating) return res.status(400).json({ error: 'Rating is required.' });
  if (rating < 1 || rating > 5) return res.status(400).json({ error: 'Rating must be between 1 and 5.' });

  const product = db.get('SELECT id FROM products WHERE id = ?', [productId]);
  if (!product) return res.status(404).json({ error: 'Product not found.' });

  // Verified purchase: a delivered order_item for this product by this customer
  const verifiedOrder = db.get(`
    SELECT o.id FROM orders o JOIN order_items oi ON oi.order_id = o.id
    WHERE o.customer_id = ? AND oi.product_id = ? AND o.status = 'delivered' LIMIT 1
  `, [req.user.id, productId]);

  try {
    db.run('INSERT INTO product_reviews (id, product_id, customer_id, order_id, rating, comment) VALUES (?, ?, ?, ?, ?, ?)',
      [id('rev'), productId, req.user.id, verifiedOrder ? verifiedOrder.id : null, Number(rating), comment || null]);
  } catch (e) {
    return res.status(409).json({ error: 'You have already reviewed this product for this order.' });
  }
  recalcProductRating(productId);
  res.status(201).json({ ok: true });
}

function addVendorReview(req, res) {
  const { vendorId, rating, comment } = req.body;
  if (!vendorId || !rating) return res.status(400).json({ error: 'Rating is required.' });
  if (rating < 1 || rating > 5) return res.status(400).json({ error: 'Rating must be between 1 and 5.' });
  const vendor = db.get('SELECT id FROM vendors WHERE id = ?', [vendorId]);
  if (!vendor) return res.status(404).json({ error: 'Supplier not found.' });

  const existing = db.get('SELECT id FROM vendor_reviews WHERE vendor_id = ? AND customer_id = ?', [vendorId, req.user.id]);
  if (existing) {
    db.run('UPDATE vendor_reviews SET rating = ?, comment = ? WHERE id = ?', [Number(rating), comment || null, existing.id]);
  } else {
    db.run('INSERT INTO vendor_reviews (id, vendor_id, customer_id, rating, comment) VALUES (?, ?, ?, ?, ?)', [id('vrev'), vendorId, req.user.id, Number(rating), comment || null]);
  }
  recalcVendorRating(vendorId);
  res.status(201).json({ ok: true });
}

module.exports = { addProductReview, addVendorReview };
