const db = require('../config/db');
const { id } = require('../utils/ids');
const { slugify } = require('./categoryController');

// ---------------------------------------------------------------------------
// GET /api/suppliers — public supplier directory with search/filter
// ---------------------------------------------------------------------------
function listSuppliers(req, res) {
  const { q, businessType, city, verifiedOnly, sort = 'newest' } = req.query;
  const where = ["v.status = 'approved'"];
  const params = [];
  if (q) { where.push('(s.store_name LIKE ? OR v.business_name LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
  if (businessType) { where.push('v.business_type = ?'); params.push(businessType); }
  if (city) { where.push('v.warehouse_city = ?'); params.push(city); }
  if (verifiedOnly === '1') { where.push('v.is_verified = 1'); }

  const sortMap = {
    newest: 'v.approved_at DESC',
    rating: 's.rating_avg DESC',
    name: 's.store_name ASC',
  };

  const suppliers = db.all(`
    SELECT v.id, v.business_name, v.business_type, v.is_verified, v.warehouse_city, v.warehouse_province,
           s.store_name, s.slug, s.tagline, s.logo_url, s.banner_url, s.rating_avg, s.rating_count, s.is_featured,
           (SELECT COUNT(*) FROM products p WHERE p.vendor_id = v.id AND p.status = 'active') AS product_count
    FROM vendors v JOIN stores s ON s.vendor_id = v.id
    WHERE ${where.join(' AND ')}
    ORDER BY ${sortMap[sort] || sortMap.newest}
  `, params);

  res.json({ suppliers });
}

// ---------------------------------------------------------------------------
// GET /api/suppliers/:slug — public store profile
// ---------------------------------------------------------------------------
function getSupplierProfile(req, res) {
  const store = db.get(`
    SELECT s.*, v.business_name, v.business_type, v.is_verified, v.business_phone, v.warehouse_city, v.warehouse_province, v.id AS vendor_id
    FROM stores s JOIN vendors v ON v.id = s.vendor_id
    WHERE s.slug = ? AND v.status = 'approved'
  `, [req.params.slug]);
  if (!store) return res.status(404).json({ error: 'Supplier not found.' });

  const products = db.all(`
    SELECT p.id, p.title, p.slug, p.retail_price, p.compare_at_price, p.rating_avg, p.rating_count,
           (SELECT url FROM product_images WHERE product_id = p.id ORDER BY sort_order ASC LIMIT 1) AS image_url
    FROM products p WHERE p.vendor_id = ? AND p.status = 'active' ORDER BY p.created_at DESC LIMIT 60
  `, [store.vendor_id]);

  const reviews = db.all(`
    SELECT r.*, u.name AS customer_name FROM vendor_reviews r JOIN users u ON u.id = r.customer_id
    WHERE r.vendor_id = ? ORDER BY r.created_at DESC LIMIT 30
  `, [store.vendor_id]);

  res.json({ store, products, reviews });
}

// ---------------------------------------------------------------------------
// GET /api/vendor/store — vendor fetches their own store profile
// ---------------------------------------------------------------------------
function getMyStore(req, res) {
  const store = db.get('SELECT * FROM stores WHERE vendor_id = ?', [req.vendor.id]);
  if (!store) return res.status(404).json({ error: 'Store not found.' });
  res.json({ store });
}

// ---------------------------------------------------------------------------
// PUT /api/vendor/store — vendor edits their own store profile
// ---------------------------------------------------------------------------
function updateStore(req, res) {
  const store = db.get('SELECT * FROM stores WHERE vendor_id = ?', [req.vendor.id]);
  if (!store) return res.status(404).json({ error: 'Store not found.' });
  const { storeName, tagline, description, logoUrl, bannerUrl, socialWhatsapp, socialInstagram, socialFacebook } = req.body;
  let newSlug = store.slug || req.vendor.id;
  if (storeName && storeName !== store.store_name) newSlug = slugify(storeName) + '-' + store.id.slice(-6);
  db.run(
    `UPDATE stores SET store_name=?,slug=?,tagline=?,description=?,logo_url=?,banner_url=?,social_whatsapp=?,social_instagram=?,social_facebook=?,updated_at=datetime('now') WHERE id=?`,
    [storeName??store.store_name,newSlug,tagline??store.tagline,description??store.description,
     logoUrl??store.logo_url,bannerUrl??store.banner_url,
     socialWhatsapp??store.social_whatsapp??null,
     socialInstagram??store.social_instagram??null,
     socialFacebook??store.social_facebook??null,store.id]
  );
  res.json({ store: db.get('SELECT * FROM stores WHERE id = ?', [store.id]) });
}

// ---------------------------------------------------------------------------
// PUT /api/vendor/business — vendor edits business/warehouse/payout info
// ---------------------------------------------------------------------------
function updateBusinessInfo(req, res) {
  const v = req.vendor;
  const {
    businessPhone, businessEmail, warehouseAddress, warehouseCity, warehouseProvince,
    bankAccountTitle, bankName, bankAccountNumber, easypaisaNumber, jazzcashNumber,
  } = req.body;
  db.run(
    `UPDATE vendors SET business_phone = ?, business_email = ?, warehouse_address = ?, warehouse_city = ?, warehouse_province = ?,
       bank_account_title = ?, bank_name = ?, bank_account_number = ?, easypaisa_number = ?, jazzcash_number = ?, updated_at = datetime('now')
     WHERE id = ?`,
    [businessPhone ?? v.business_phone, businessEmail ?? v.business_email, warehouseAddress ?? v.warehouse_address,
     warehouseCity ?? v.warehouse_city, warehouseProvince ?? v.warehouse_province, bankAccountTitle ?? v.bank_account_title,
     bankName ?? v.bank_name, bankAccountNumber ?? v.bank_account_number, easypaisaNumber ?? v.easypaisa_number,
     jazzcashNumber ?? v.jazzcash_number, v.id]
  );
  res.json({ vendor: db.get('SELECT * FROM vendors WHERE id = ?', [v.id]) });
}

// ---------------------------------------------------------------------------
// Admin: vendor approval workflow
// ---------------------------------------------------------------------------
function adminListVendors(req, res) {
  const { status } = req.query;
  const where = status ? 'WHERE v.status = ?' : '';
  const params = status ? [status] : [];
  const vendors = db.all(`
    SELECT v.*, u.name AS owner_name, u.email AS owner_email, s.store_name, s.slug,
           (SELECT COUNT(*) FROM products p WHERE p.vendor_id = v.id) AS product_count
    FROM vendors v JOIN users u ON u.id = v.user_id JOIN stores s ON s.vendor_id = v.id
    ${where} ORDER BY v.created_at DESC
  `, params);
  res.json({ vendors });
}

function adminGetVendor(req, res) {
  const vendor = db.get(`
    SELECT v.*, u.name AS owner_name, u.email AS owner_email, s.* FROM vendors v
    JOIN users u ON u.id = v.user_id JOIN stores s ON s.vendor_id = v.id WHERE v.id = ?
  `, [req.params.id]);
  if (!vendor) return res.status(404).json({ error: 'Vendor not found.' });
  res.json({ vendor });
}

function adminApproveVendor(req, res) {
  const vendor = db.get('SELECT * FROM vendors WHERE id = ?', [req.params.id]);
  if (!vendor) return res.status(404).json({ error: 'Vendor not found.' });
  db.run(`UPDATE vendors SET status = 'approved', approved_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`, [vendor.id]);
  db.run(`INSERT INTO notifications (id, user_id, type, title, body, link) VALUES (?, ?, 'vendor_approved', 'Your store has been approved!', 'You can now start listing products.', '/dashboard/vendor')`,
    [id('notif'), vendor.user_id]);
  db.run(`INSERT INTO audit_logs (id, actor_id, action, target_type, target_id) VALUES (?, ?, 'approve_vendor', 'vendor', ?)`, [id('log'), req.user.id, vendor.id]);
  res.json({ vendor: db.get('SELECT * FROM vendors WHERE id = ?', [vendor.id]) });
}

function adminRejectVendor(req, res) {
  const { reason } = req.body;
  const vendor = db.get('SELECT * FROM vendors WHERE id = ?', [req.params.id]);
  if (!vendor) return res.status(404).json({ error: 'Vendor not found.' });
  db.run(`UPDATE vendors SET status = 'rejected', rejection_reason = ?, updated_at = datetime('now') WHERE id = ?`, [reason || null, vendor.id]);
  db.run(`INSERT INTO notifications (id, user_id, type, title, body, link) VALUES (?, ?, 'vendor_rejected', 'Your vendor application was not approved', ?, '/vendor/register')`,
    [id('notif'), vendor.user_id, reason || 'Please contact support for details.']);
  db.run(`INSERT INTO audit_logs (id, actor_id, action, target_type, target_id, meta) VALUES (?, ?, 'reject_vendor', 'vendor', ?, ?)`, [id('log'), req.user.id, vendor.id, reason || null]);
  res.json({ vendor: db.get('SELECT * FROM vendors WHERE id = ?', [vendor.id]) });
}

function adminSetVendorVerified(req, res) {
  const { isVerified } = req.body;
  db.run('UPDATE vendors SET is_verified = ? WHERE id = ?', [isVerified ? 1 : 0, req.params.id]);
  res.json({ vendor: db.get('SELECT * FROM vendors WHERE id = ?', [req.params.id]) });
}

function adminSetVendorCommission(req, res) {
  const { commissionOverride } = req.body;
  db.run('UPDATE vendors SET commission_override = ? WHERE id = ?', [commissionOverride === null ? null : Number(commissionOverride), req.params.id]);
  res.json({ vendor: db.get('SELECT * FROM vendors WHERE id = ?', [req.params.id]) });
}

function adminSuspendVendor(req, res) {
  db.run("UPDATE vendors SET status = 'suspended', updated_at = datetime('now') WHERE id = ?", [req.params.id]);
  res.json({ vendor: db.get('SELECT * FROM vendors WHERE id = ?', [req.params.id]) });
}

// ---------------------------------------------------------------------------
// GET /api/vendor/dashboard — vendor's sales/earnings summary
// ---------------------------------------------------------------------------
function vendorDashboard(req, res) {
  const vendorId = req.vendor.id;
  const totals = db.get(`
    SELECT
      (SELECT COUNT(*) FROM products WHERE vendor_id = ? AND status = 'active') AS active_products,
      (SELECT COUNT(*) FROM order_vendor_groups WHERE vendor_id = ?) AS total_orders,
      (SELECT COUNT(*) FROM order_vendor_groups WHERE vendor_id = ? AND status = 'pending') AS pending_orders,
      (SELECT COALESCE(SUM(vendor_earning),0) FROM order_vendor_groups WHERE vendor_id = ? AND status = 'delivered') AS lifetime_earnings
  `, [vendorId, vendorId, vendorId, vendorId]);

  const vendor = db.get('SELECT balance_available, balance_pending, total_earned FROM vendors WHERE id = ?', [vendorId]);

  const recentOrders = db.all(`
    SELECT ovg.id, ovg.status, ovg.subtotal, ovg.vendor_earning, ovg.created_at, o.order_number, o.customer_id, u.name AS customer_name
    FROM order_vendor_groups ovg JOIN orders o ON o.id = ovg.order_id JOIN users u ON u.id = o.customer_id
    WHERE ovg.vendor_id = ? ORDER BY ovg.created_at DESC LIMIT 10
  `, [vendorId]);

  const salesByDay = db.all(`
    SELECT date(ovg.created_at) AS day, SUM(ovg.subtotal) AS revenue, COUNT(*) AS orders
    FROM order_vendor_groups ovg WHERE ovg.vendor_id = ? AND ovg.created_at >= date('now','-30 days')
    GROUP BY day ORDER BY day ASC
  `, [vendorId]);

  res.json({ totals, balances: vendor, recentOrders, salesByDay });
}

module.exports = {
  listSuppliers, getSupplierProfile, getMyStore, updateStore, updateBusinessInfo,
  adminListVendors, adminGetVendor, adminApproveVendor, adminRejectVendor,
  adminSetVendorVerified, adminSetVendorCommission, adminSuspendVendor, vendorDashboard,
};
