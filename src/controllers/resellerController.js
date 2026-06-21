const db = require('../config/db');
const { id } = require('../utils/ids');

// ---------------------------------------------------------------------------
// POST /api/reseller/import — one-click copy a supplier product into "my store"
// ---------------------------------------------------------------------------
function importProduct(req, res) {
  const { productId, resalePrice, customTitle } = req.body;
  const product = db.get('SELECT * FROM products WHERE id = ? AND status = ?', [productId, 'active']);
  if (!product) return res.status(404).json({ error: 'Product not found.' });
  if (!product.allow_dropshipping) return res.status(400).json({ error: 'This supplier has not enabled dropshipping for this product.' });

  const basePrice = product.dropship_price || product.retail_price;
  const finalResalePrice = resalePrice ? Number(resalePrice) : basePrice;
  if (finalResalePrice < basePrice) {
    return res.status(400).json({ error: `Resale price can't be lower than your cost (Rs. ${basePrice}).` });
  }

  const existing = db.get('SELECT * FROM reseller_products WHERE reseller_id = ? AND source_product_id = ?', [req.user.id, productId]);
  if (existing) {
    db.run('UPDATE reseller_products SET resale_price = ?, custom_title = ?, is_active = 1 WHERE id = ?', [finalResalePrice, customTitle || null, existing.id]);
    return res.json({ resellerProduct: db.get('SELECT * FROM reseller_products WHERE id = ?', [existing.id]) });
  }

  const newId = id('rprod');
  db.run(
    'INSERT INTO reseller_products (id, reseller_id, source_product_id, custom_title, resale_price) VALUES (?, ?, ?, ?, ?)',
    [newId, req.user.id, productId, customTitle || null, finalResalePrice]
  );

  if (!req.user.isReseller) {
    db.run('UPDATE users SET is_reseller = 1 WHERE id = ?', [req.user.id]);
  }

  res.status(201).json({ resellerProduct: db.get('SELECT * FROM reseller_products WHERE id = ?', [newId]) });
}

// ---------------------------------------------------------------------------
// GET /api/reseller/products — "my store" catalog for a reseller
// ---------------------------------------------------------------------------
function myResellerProducts(req, res) {
  const items = db.all(`
    SELECT rp.*, p.title AS original_title, p.slug, p.dropship_price, p.retail_price,
           (SELECT url FROM product_images WHERE product_id = p.id ORDER BY sort_order ASC LIMIT 1) AS image_url,
           s.store_name AS supplier_name
    FROM reseller_products rp
    JOIN products p ON p.id = rp.source_product_id
    JOIN vendors v ON v.id = p.vendor_id JOIN stores s ON s.vendor_id = v.id
    WHERE rp.reseller_id = ? ORDER BY rp.created_at DESC
  `, [req.user.id]);
  res.json({ items });
}

function updateResellerProduct(req, res) {
  const item = db.get('SELECT rp.*, p.dropship_price, p.retail_price FROM reseller_products rp JOIN products p ON p.id = rp.source_product_id WHERE rp.id = ? AND rp.reseller_id = ?', [req.params.id, req.user.id]);
  if (!item) return res.status(404).json({ error: 'Not found.' });
  const { resalePrice, customTitle, isActive } = req.body;
  const basePrice = item.dropship_price || item.retail_price;
  if (resalePrice !== undefined && Number(resalePrice) < basePrice) {
    return res.status(400).json({ error: `Resale price can't be lower than your cost (Rs. ${basePrice}).` });
  }
  db.run('UPDATE reseller_products SET resale_price = ?, custom_title = ?, is_active = ? WHERE id = ?', [
    resalePrice !== undefined ? Number(resalePrice) : item.resale_price,
    customTitle !== undefined ? customTitle : item.custom_title,
    isActive !== undefined ? (isActive ? 1 : 0) : item.is_active,
    item.id,
  ]);
  res.json({ resellerProduct: db.get('SELECT * FROM reseller_products WHERE id = ?', [item.id]) });
}

function removeResellerProduct(req, res) {
  db.run('DELETE FROM reseller_products WHERE id = ? AND reseller_id = ?', [req.params.id, req.user.id]);
  res.json({ ok: true });
}

module.exports = { importProduct, myResellerProducts, updateResellerProduct, removeResellerProduct };
