const db = require('../config/db');
const { id } = require('../utils/ids');

function hydrateCart(userId) {
  const items = db.all(`
    SELECT ci.id AS cart_item_id, ci.quantity, ci.variant_id, ci.reseller_product_id,
           p.id AS product_id, p.title, p.slug, p.retail_price, p.stock_quantity, p.min_order_quantity, p.vendor_id,
           pv.name AS variant_name, pv.price_delta, pv.stock_quantity AS variant_stock,
           rp.resale_price, rp.custom_title,
           s.store_name,
           (SELECT url FROM product_images WHERE product_id = p.id ORDER BY sort_order ASC LIMIT 1) AS image_url
    FROM cart_items ci
    JOIN products p ON p.id = ci.product_id
    JOIN vendors v ON v.id = p.vendor_id
    JOIN stores s ON s.vendor_id = v.id
    LEFT JOIN product_variants pv ON pv.id = ci.variant_id
    LEFT JOIN reseller_products rp ON rp.id = ci.reseller_product_id
    WHERE ci.user_id = ?
    ORDER BY ci.created_at DESC
  `, [userId]);

  let subtotal = 0;
  const out = items.map((it) => {
    const unitPrice = it.resale_price ?? (it.retail_price + (it.price_delta || 0));
    const lineTotal = unitPrice * it.quantity;
    subtotal += lineTotal;
    return {
      cartItemId: it.cart_item_id,
      productId: it.product_id,
      title: it.custom_title || it.title,
      slug: it.slug,
      imageUrl: it.image_url,
      storeName: it.store_name,
      variantId: it.variant_id,
      variantName: it.variant_name,
      resellerProductId: it.reseller_product_id,
      unitPrice,
      quantity: it.quantity,
      lineTotal,
      stockAvailable: it.variant_id ? it.variant_stock : it.stock_quantity,
      minOrderQuantity: it.min_order_quantity,
    };
  });
  return { items: out, subtotal };
}

function getCart(req, res) {
  res.json(hydrateCart(req.user.id));
}

function addToCart(req, res) {
  const { productId, variantId, resellerProductId, quantity = 1 } = req.body;
  const product = db.get('SELECT * FROM products WHERE id = ? AND status = ?', [productId, 'active']);
  if (!product) return res.status(404).json({ error: 'Product not found.' });
  if (quantity < 1) return res.status(400).json({ error: 'Quantity must be at least 1.' });

  const existing = db.get(
    'SELECT * FROM cart_items WHERE user_id = ? AND product_id = ? AND (variant_id IS ? ) AND (reseller_product_id IS ?)',
    [req.user.id, productId, variantId || null, resellerProductId || null]
  );

  if (existing) {
    db.run('UPDATE cart_items SET quantity = quantity + ? WHERE id = ?', [Number(quantity), existing.id]);
  } else {
    db.run(
      'INSERT INTO cart_items (id, user_id, product_id, variant_id, reseller_product_id, quantity) VALUES (?, ?, ?, ?, ?, ?)',
      [id('cart'), req.user.id, productId, variantId || null, resellerProductId || null, Number(quantity)]
    );
  }
  res.status(201).json(hydrateCart(req.user.id));
}

function updateCartItem(req, res) {
  const { quantity } = req.body;
  const item = db.get('SELECT * FROM cart_items WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  if (!item) return res.status(404).json({ error: 'Cart item not found.' });
  if (quantity < 1) {
    db.run('DELETE FROM cart_items WHERE id = ?', [item.id]);
  } else {
    db.run('UPDATE cart_items SET quantity = ? WHERE id = ?', [Number(quantity), item.id]);
  }
  res.json(hydrateCart(req.user.id));
}

function removeCartItem(req, res) {
  db.run('DELETE FROM cart_items WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  res.json(hydrateCart(req.user.id));
}

function clearCart(req, res) {
  db.run('DELETE FROM cart_items WHERE user_id = ?', [req.user.id]);
  res.json({ items: [], subtotal: 0 });
}

// --- Wishlist ---
function getWishlist(req, res) {
  const items = db.all(`
    SELECT p.id, p.title, p.slug, p.retail_price, p.compare_at_price, p.rating_avg,
           (SELECT url FROM product_images WHERE product_id = p.id ORDER BY sort_order ASC LIMIT 1) AS image_url
    FROM wishlist_items w JOIN products p ON p.id = w.product_id
    WHERE w.user_id = ? ORDER BY w.created_at DESC
  `, [req.user.id]);
  res.json({ items });
}

function addToWishlist(req, res) {
  const { productId } = req.body;
  const product = db.get('SELECT id FROM products WHERE id = ?', [productId]);
  if (!product) return res.status(404).json({ error: 'Product not found.' });
  try {
    db.run('INSERT INTO wishlist_items (id, user_id, product_id) VALUES (?, ?, ?)', [id('wish'), req.user.id, productId]);
  } catch (e) { /* already in wishlist (unique constraint) — no-op */ }
  res.status(201).json({ ok: true });
}

function removeFromWishlist(req, res) {
  db.run('DELETE FROM wishlist_items WHERE user_id = ? AND product_id = ?', [req.user.id, req.params.productId]);
  res.json({ ok: true });
}

module.exports = { getCart, addToCart, updateCartItem, removeCartItem, clearCart, getWishlist, addToWishlist, removeFromWishlist, hydrateCart };
