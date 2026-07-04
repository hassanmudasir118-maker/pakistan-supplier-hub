const db = require('../config/db');
const bcrypt = require('bcryptjs');
const { id } = require('../utils/ids');

// ---------------------------------------------------------------------------
// GET /api/admin/dashboard — top-level platform analytics
// ---------------------------------------------------------------------------
function dashboard(req, res) {
  const totals = db.get(`
    SELECT
      (SELECT COUNT(*) FROM users WHERE role = 'customer') AS total_customers,
      (SELECT COUNT(*) FROM vendors WHERE status = 'approved') AS active_vendors,
      (SELECT COUNT(*) FROM vendors WHERE status = 'pending') AS pending_vendors,
      (SELECT COUNT(*) FROM products WHERE status = 'active') AS active_products,
      (SELECT COUNT(*) FROM orders) AS total_orders,
      (SELECT COALESCE(SUM(grand_total),0) FROM orders WHERE status != 'cancelled') AS gross_revenue,
      (SELECT COALESCE(SUM(commission_amount),0) FROM order_vendor_groups WHERE status = 'delivered') AS platform_commission_earned,
      (SELECT COALESCE(SUM(amount),0) FROM withdrawals WHERE status = 'pending') AS pending_withdrawal_amount
  `);

  const revenueByDay = db.all(`
    SELECT date(created_at) AS day, SUM(grand_total) AS revenue, COUNT(*) AS orders
    FROM orders WHERE created_at >= date('now','-30 days') AND status != 'cancelled'
    GROUP BY day ORDER BY day ASC
  `);

  const commissionByDay = db.all(`
    SELECT date(o.created_at) AS day, SUM(ovg.commission_amount) AS commission
    FROM order_vendor_groups ovg JOIN orders o ON o.id = ovg.order_id
    WHERE ovg.status = 'delivered' AND o.created_at >= date('now','-30 days')
    GROUP BY day ORDER BY day ASC
  `);

  const topVendors = db.all(`
    SELECT v.id, s.store_name, SUM(ovg.subtotal) AS revenue, COUNT(*) AS orders
    FROM order_vendor_groups ovg JOIN vendors v ON v.id = ovg.vendor_id JOIN stores s ON s.vendor_id = v.id
    WHERE ovg.status = 'delivered' GROUP BY v.id ORDER BY revenue DESC LIMIT 10
  `);

  const topProducts = db.all(`
    SELECT p.id, p.title, p.sold_count, p.rating_avg, s.store_name
    FROM products p JOIN vendors v ON v.id = p.vendor_id JOIN stores s ON s.vendor_id = v.id
    ORDER BY p.sold_count DESC LIMIT 10
  `);

  const ordersByStatus = db.all(`SELECT status, COUNT(*) AS count FROM orders GROUP BY status`);

  res.json({ totals, revenueByDay, commissionByDay, topVendors, topProducts, ordersByStatus });
}

// ---------------------------------------------------------------------------
// GET /api/admin/reports/sales | revenue | suppliers | customers
// ---------------------------------------------------------------------------
function salesReport(req, res) {
  const { from, to } = req.query;
  const where = [];
  const params = [];
  if (from) { where.push('o.created_at >= ?'); params.push(from); }
  if (to) { where.push('o.created_at <= ?'); params.push(to); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = db.all(`
    SELECT date(o.created_at) AS day, COUNT(DISTINCT o.id) AS orders, SUM(o.grand_total) AS revenue, SUM(o.discount_total) AS discounts
    FROM orders o ${whereSql} GROUP BY day ORDER BY day DESC
  `, params);
  res.json({ rows });
}

function revenueReport(req, res) {
  const rows = db.all(`
    SELECT date(o.created_at) AS day,
      SUM(ovg.subtotal) AS gross_sales,
      SUM(ovg.commission_amount) AS platform_revenue,
      SUM(ovg.vendor_earning) AS vendor_payouts
    FROM order_vendor_groups ovg JOIN orders o ON o.id = ovg.order_id
    WHERE ovg.status = 'delivered'
    GROUP BY day ORDER BY day DESC LIMIT 90
  `);
  res.json({ rows });
}

function supplierReport(req, res) {
  const rows = db.all(`
    SELECT v.id, s.store_name, v.business_type, v.status, v.is_verified,
      COUNT(DISTINCT p.id) AS product_count,
      COALESCE(SUM(ovg.subtotal), 0) AS total_sales,
      COALESCE(SUM(ovg.vendor_earning), 0) AS total_earnings,
      v.balance_available
    FROM vendors v
    JOIN stores s ON s.vendor_id = v.id
    LEFT JOIN products p ON p.vendor_id = v.id
    LEFT JOIN order_vendor_groups ovg ON ovg.vendor_id = v.id AND ovg.status = 'delivered'
    GROUP BY v.id ORDER BY total_sales DESC
  `);
  res.json({ rows });
}

function customerReport(req, res) {
  const rows = db.all(`
    SELECT u.id, u.name, u.email, u.is_reseller, u.created_at,
      COUNT(o.id) AS order_count, COALESCE(SUM(o.grand_total), 0) AS total_spent
    FROM users u LEFT JOIN orders o ON o.customer_id = u.id
    WHERE u.role = 'customer'
    GROUP BY u.id ORDER BY total_spent DESC LIMIT 200
  `);
  res.json({ rows });
}

// ---------------------------------------------------------------------------
// User management
// ---------------------------------------------------------------------------
function listUsers(req, res) {
  const { role, q } = req.query;
  const where = [];
  const params = [];
  if (role) { where.push('role = ?'); params.push(role); }
  if (q) { where.push('(name LIKE ? OR email LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const users = db.all(`SELECT id, name, email, phone, role, status, email_verified, is_reseller, created_at FROM users ${whereSql} ORDER BY created_at DESC LIMIT 300`, params);
  res.json({ users });
}

function setUserStatus(req, res) {
  const { status } = req.body;
  if (!['active', 'suspended', 'banned'].includes(status)) return res.status(400).json({ error: 'Invalid status.' });
  const target = db.get('SELECT * FROM users WHERE id = ?', [req.params.id]);
  if (!target) return res.status(404).json({ error: 'User not found.' });
  if (target.role === 'super_admin') return res.status(400).json({ error: 'Cannot modify another admin account.' });
  db.run("UPDATE users SET status = ?, updated_at = datetime('now') WHERE id = ?", [status, req.params.id]);
  if (status !== 'active') db.run('UPDATE sessions SET revoked = 1 WHERE user_id = ?', [req.params.id]);
  res.json({ ok: true });
}

// ---------------------------------------------------------------------------
// Settings (global commission, shipping, payment account numbers)
// ---------------------------------------------------------------------------
function getSettings(req, res) {
  res.json({ settings: db.get('SELECT * FROM settings WHERE id = ?', ['global']) });
}

function updateSettings(req, res) {
  const s = db.get('SELECT * FROM settings WHERE id = ?', ['global']);
  const {
    platformName, globalCommissionPercent, globalCommissionType, globalCommissionFlat,
    flatShippingFee, freeShippingThreshold,
    supportEmail, supportPhone, bankTransferDetails, easypaisaAccount, jazzcashAccount,
  } = req.body;
  db.run(
    `UPDATE settings SET platform_name=?, global_commission_percent=?, global_commission_type=?, global_commission_flat=?,
       flat_shipping_fee=?, free_shipping_threshold=?,
       support_email=?, support_phone=?, bank_transfer_details=?, easypaisa_account=?, jazzcash_account=?, updated_at=datetime('now')
     WHERE id = 'global'`,
    [platformName ?? s.platform_name,
     globalCommissionPercent ?? s.global_commission_percent,
     globalCommissionType   ?? s.global_commission_type ?? 'percent',
     globalCommissionFlat   ?? s.global_commission_flat ?? 10,
     flatShippingFee ?? s.flat_shipping_fee,
     freeShippingThreshold ?? s.free_shipping_threshold,
     supportEmail ?? s.support_email, supportPhone ?? s.support_phone,
     bankTransferDetails ?? s.bank_transfer_details,
     easypaisaAccount ?? s.easypaisa_account, jazzcashAccount ?? s.jazzcash_account]
  );
  res.json({ settings: db.get('SELECT * FROM settings WHERE id = ?', ['global']) });
}

// ---------------------------------------------------------------------------
// Newsletter
// ---------------------------------------------------------------------------
function subscribeNewsletter(req, res) {
  const { email } = req.body;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Please enter a valid email.' });
  try {
    db.run('INSERT INTO newsletter_subscribers (id, email) VALUES (?, ?)', [id('news'), email.toLowerCase()]);
  } catch (e) { /* already subscribed */ }
  res.status(201).json({ ok: true, message: 'Subscribed successfully.' });
}

module.exports = {
  dashboard, salesReport, revenueReport, supplierReport, customerReport,
  listUsers, setUserStatus, getSettings, updateSettings, subscribeNewsletter,
};
