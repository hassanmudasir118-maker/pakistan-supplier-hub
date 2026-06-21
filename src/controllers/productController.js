const db = require('../config/db');
const { id } = require('../utils/ids');
const { slugify } = require('./categoryController');

// ---------------------------------------------------------------------------
// GET /api/products  — public search/filter/browse
// query: q, category, vendor, minPrice, maxPrice, sort, page, limit, featured, dropshipOnly
// ---------------------------------------------------------------------------
function listProducts(req, res) {
  const {
    q, category, vendor, minPrice, maxPrice, sort = 'newest',
    page = 1, limit = 24, featured, dropshipOnly,
  } = req.query;

  const where = ["p.status = 'active'"];
  const params = [];

  if (q) { where.push('(p.title LIKE ? OR p.description LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
  if (category) { where.push('c.slug = ?'); params.push(category); }
  if (vendor) { where.push('s.slug = ?'); params.push(vendor); }
  if (minPrice) { where.push('p.retail_price >= ?'); params.push(Number(minPrice)); }
  if (maxPrice) { where.push('p.retail_price <= ?'); params.push(Number(maxPrice)); }
  if (featured === '1') { where.push('p.is_featured = 1'); }
  if (dropshipOnly === '1') { where.push('p.allow_dropshipping = 1'); }

  const sortMap = {
    newest: 'p.created_at DESC',
    price_low: 'p.retail_price ASC',
    price_high: 'p.retail_price DESC',
    rating: 'p.rating_avg DESC',
    bestselling: 'p.sold_count DESC',
  };
  const orderBy = sortMap[sort] || sortMap.newest;

  const perPage = Math.min(Number(limit) || 24, 60);
  const offset = (Math.max(Number(page) || 1, 1) - 1) * perPage;

  const baseQuery = `
    FROM products p
    JOIN vendors v ON v.id = p.vendor_id
    JOIN stores s ON s.vendor_id = v.id
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE ${where.join(' AND ')}
  `;

  const total = db.get(`SELECT COUNT(*) AS c ${baseQuery}`, params).c;
  const products = db.all(
    `SELECT p.id, p.title, p.slug, p.retail_price, p.compare_at_price, p.rating_avg, p.rating_count,
            p.sold_count, p.stock_quantity, p.allow_dropshipping, p.is_featured,
            (SELECT url FROM product_images WHERE product_id = p.id ORDER BY sort_order ASC LIMIT 1) AS image_url,
            s.store_name, s.slug AS store_slug, v.is_verified, c.name AS category_name, c.slug AS category_slug
     ${baseQuery}
     ORDER BY ${orderBy}
     LIMIT ? OFFSET ?`,
    [...params, perPage, offset]
  );

  res.json({ products, total, page: Number(page), perPage, totalPages: Math.ceil(total / perPage) });
}

// ---------------------------------------------------------------------------
// GET /api/products/:slug
// ---------------------------------------------------------------------------
function getProduct(req, res) {
  const product = db.get(`
    SELECT p.*, s.store_name, s.slug AS store_slug, s.logo_url AS store_logo, s.rating_avg AS store_rating,
           v.id AS vendor_id, v.is_verified, v.business_phone, c.name AS category_name, c.slug AS category_slug
    FROM products p
    JOIN vendors v ON v.id = p.vendor_id
    JOIN stores s ON s.vendor_id = v.id
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE p.slug = ?
  `, [req.params.slug]);

  if (!product || (product.status !== 'active' && !(req.user && (req.user.role === 'super_admin' || req.vendor?.id === product.vendor_id)))) {
    return res.status(404).json({ error: 'Product not found.' });
  }

  const images = db.all('SELECT * FROM product_images WHERE product_id = ? ORDER BY sort_order ASC', [product.id]);
  const variants = db.all('SELECT * FROM product_variants WHERE product_id = ?', [product.id]);
  const wholesaleTiers = db.all('SELECT * FROM product_wholesale_tiers WHERE product_id = ? ORDER BY min_qty ASC', [product.id]);
  const reviews = db.all(`
    SELECT r.*, u.name AS customer_name FROM product_reviews r JOIN users u ON u.id = r.customer_id
    WHERE r.product_id = ? ORDER BY r.created_at DESC LIMIT 50
  `, [product.id]);

  db.run('UPDATE products SET views_count = views_count + 1 WHERE id = ?', [product.id]);

  res.json({ product, images, variants, wholesaleTiers, reviews });
}

// ---------------------------------------------------------------------------
// POST /api/vendor/products  (vendor creates a product)
// ---------------------------------------------------------------------------
function createProduct(req, res) {
  const vendor = req.vendor;
  const {
    title, description, categoryId, sku, retailPrice, wholesalePrice, dropshipPrice,
    compareAtPrice, stockQuantity, minOrderQuantity, weightGrams, allowDropshipping,
    metaTitle, metaDescription, images, variants, wholesaleTiers,
  } = req.body;

  if (!title || !retailPrice) return res.status(400).json({ error: 'Title and retail price are required.' });
  if (Number(retailPrice) <= 0) return res.status(400).json({ error: 'Retail price must be greater than zero.' });

  const newId = id('prod');
  const slug = slugify(title) + '-' + newId.slice(-6);

  db.run(
    `INSERT INTO products (id, vendor_id, category_id, title, slug, description, sku, retail_price, wholesale_price,
       dropship_price, compare_at_price, stock_quantity, min_order_quantity, weight_grams, allow_dropshipping,
       meta_title, meta_description, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
    [newId, vendor.id, categoryId || null, title.trim(), slug, description || null, sku || null,
     Number(retailPrice), wholesalePrice ? Number(wholesalePrice) : null, dropshipPrice ? Number(dropshipPrice) : null,
     compareAtPrice ? Number(compareAtPrice) : null, Number(stockQuantity) || 0, Number(minOrderQuantity) || 1,
     weightGrams ? Number(weightGrams) : null, allowDropshipping === false ? 0 : 1, metaTitle || title.trim(), metaDescription || null]
  );

  if (Array.isArray(images)) {
    images.forEach((url, idx) => db.run('INSERT INTO product_images (id, product_id, url, sort_order) VALUES (?, ?, ?, ?)', [id('img'), newId, url, idx]));
  }
  if (Array.isArray(variants)) {
    variants.forEach((v) => db.run(
      'INSERT INTO product_variants (id, product_id, name, sku, price_delta, stock_quantity, image_url) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id('var'), newId, v.name, v.sku || null, Number(v.priceDelta) || 0, Number(v.stockQuantity) || 0, v.imageUrl || null]
    ));
  }
  if (Array.isArray(wholesaleTiers)) {
    wholesaleTiers.forEach((t) => db.run(
      'INSERT INTO product_wholesale_tiers (id, product_id, min_qty, price) VALUES (?, ?, ?, ?)',
      [id('tier'), newId, Number(t.minQty), Number(t.price)]
    ));
  }

  res.status(201).json({ product: db.get('SELECT * FROM products WHERE id = ?', [newId]) });
}

// ---------------------------------------------------------------------------
// PUT /api/vendor/products/:id
// ---------------------------------------------------------------------------
function updateProduct(req, res) {
  const product = db.get('SELECT * FROM products WHERE id = ? AND vendor_id = ?', [req.params.id, req.vendor.id]);
  if (!product) return res.status(404).json({ error: 'Product not found.' });

  const fields = ['title', 'description', 'categoryId', 'sku', 'retailPrice', 'wholesalePrice', 'dropshipPrice',
    'compareAtPrice', 'stockQuantity', 'minOrderQuantity', 'weightGrams', 'allowDropshipping', 'metaTitle', 'metaDescription', 'status'];
  const colMap = {
    categoryId: 'category_id', retailPrice: 'retail_price', wholesalePrice: 'wholesale_price', dropshipPrice: 'dropship_price',
    compareAtPrice: 'compare_at_price', stockQuantity: 'stock_quantity', minOrderQuantity: 'min_order_quantity',
    weightGrams: 'weight_grams', allowDropshipping: 'allow_dropshipping', metaTitle: 'meta_title', metaDescription: 'meta_description',
  };

  const updates = [];
  const params = [];
  for (const f of fields) {
    if (req.body[f] !== undefined) {
      const col = colMap[f] || f;
      let val = req.body[f];
      if (f === 'allowDropshipping') val = val ? 1 : 0;
      updates.push(`${col} = ?`);
      params.push(val);
    }
  }
  if (updates.length) {
    updates.push("updated_at = datetime('now')");
    db.run(`UPDATE products SET ${updates.join(', ')} WHERE id = ?`, [...params, product.id]);
  }

  if (Array.isArray(req.body.images)) {
    db.run('DELETE FROM product_images WHERE product_id = ?', [product.id]);
    req.body.images.forEach((url, idx) => db.run('INSERT INTO product_images (id, product_id, url, sort_order) VALUES (?, ?, ?, ?)', [id('img'), product.id, url, idx]));
  }
  if (Array.isArray(req.body.variants)) {
    db.run('DELETE FROM product_variants WHERE product_id = ?', [product.id]);
    req.body.variants.forEach((v) => db.run(
      'INSERT INTO product_variants (id, product_id, name, sku, price_delta, stock_quantity, image_url) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id('var'), product.id, v.name, v.sku || null, Number(v.priceDelta) || 0, Number(v.stockQuantity) || 0, v.imageUrl || null]
    ));
  }

  res.json({ product: db.get('SELECT * FROM products WHERE id = ?', [product.id]) });
}

function deleteProduct(req, res) {
  const product = db.get('SELECT * FROM products WHERE id = ? AND vendor_id = ?', [req.params.id, req.vendor.id]);
  if (!product) return res.status(404).json({ error: 'Product not found.' });
  db.run('DELETE FROM products WHERE id = ?', [product.id]);
  res.json({ ok: true });
}

// ---------------------------------------------------------------------------
// GET /api/vendor/products  (vendor's own product list, includes drafts)
// ---------------------------------------------------------------------------
function listVendorProducts(req, res) {
  const products = db.all(`
    SELECT p.*, (SELECT url FROM product_images WHERE product_id = p.id ORDER BY sort_order ASC LIMIT 1) AS image_url,
           c.name AS category_name
    FROM products p LEFT JOIN categories c ON c.id = p.category_id
    WHERE p.vendor_id = ? ORDER BY p.created_at DESC
  `, [req.vendor.id]);
  res.json({ products });
}

// ---------------------------------------------------------------------------
// Admin: list all / moderate
// ---------------------------------------------------------------------------
function adminListProducts(req, res) {
  const { status, q } = req.query;
  const where = [];
  const params = [];
  if (status) { where.push('p.status = ?'); params.push(status); }
  if (q) { where.push('p.title LIKE ?'); params.push(`%${q}%`); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const products = db.all(`
    SELECT p.*, s.store_name, (SELECT url FROM product_images WHERE product_id = p.id ORDER BY sort_order ASC LIMIT 1) AS image_url
    FROM products p JOIN vendors v ON v.id = p.vendor_id JOIN stores s ON s.vendor_id = v.id
    ${whereSql} ORDER BY p.created_at DESC LIMIT 200
  `, params);
  res.json({ products });
}

function adminUpdateProductStatus(req, res) {
  const { status, isFeatured } = req.body;
  const product = db.get('SELECT * FROM products WHERE id = ?', [req.params.id]);
  if (!product) return res.status(404).json({ error: 'Product not found.' });
  if (status) db.run('UPDATE products SET status = ? WHERE id = ?', [status, product.id]);
  if (isFeatured !== undefined) db.run('UPDATE products SET is_featured = ? WHERE id = ?', [isFeatured ? 1 : 0, product.id]);
  res.json({ product: db.get('SELECT * FROM products WHERE id = ?', [product.id]) });
}

module.exports = {
  listProducts, getProduct, createProduct, updateProduct, deleteProduct,
  listVendorProducts, adminListProducts, adminUpdateProductStatus,
};
