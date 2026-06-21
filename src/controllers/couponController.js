const db = require('../config/db');
const { id } = require('../utils/ids');

function createCoupon(req, res) {
  if (!['vendor', 'super_admin'].includes(req.user.role)) return res.status(403).json({ error: 'Only vendors and admins can create coupons.' });
  const { code, type, value, minOrderTotal, maxUses, startsAt, expiresAt, vendorScoped } = req.body;
  if (!code || !type || value === undefined) return res.status(400).json({ error: 'Code, type, and value are required.' });
  if (!['percent', 'fixed'].includes(type)) return res.status(400).json({ error: 'Type must be percent or fixed.' });

  const existing = db.get('SELECT id FROM coupons WHERE code = ?', [code.toUpperCase()]);
  if (existing) return res.status(409).json({ error: 'A coupon with this code already exists.' });

  // vendors may only create coupons scoped to their own store
  const vendorId = req.user.role === 'vendor' ? req.vendor.id : (vendorScoped ? req.body.vendorId : null);

  const newId = id('coupon');
  db.run(
    `INSERT INTO coupons (id, code, type, value, min_order_total, max_uses, vendor_id, starts_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [newId, code.toUpperCase(), type, Number(value), Number(minOrderTotal) || 0, maxUses ? Number(maxUses) : null, vendorId, startsAt || null, expiresAt || null]
  );
  res.status(201).json({ coupon: db.get('SELECT * FROM coupons WHERE id = ?', [newId]) });
}

function listCoupons(req, res) {
  let coupons;
  if (req.user.role === 'vendor') {
    coupons = db.all('SELECT * FROM coupons WHERE vendor_id = ? ORDER BY created_at DESC', [req.vendor.id]);
  } else {
    coupons = db.all('SELECT * FROM coupons ORDER BY created_at DESC');
  }
  res.json({ coupons });
}

function deleteCoupon(req, res) {
  const coupon = db.get('SELECT * FROM coupons WHERE id = ?', [req.params.id]);
  if (!coupon) return res.status(404).json({ error: 'Coupon not found.' });
  if (req.user.role === 'vendor' && coupon.vendor_id !== req.vendor.id) return res.status(403).json({ error: 'Not authorized.' });
  db.run('UPDATE coupons SET is_active = 0 WHERE id = ?', [coupon.id]);
  res.json({ ok: true });
}

function validateCoupon(req, res) {
  const { code, subtotal } = req.query;
  const coupon = db.get('SELECT * FROM coupons WHERE code = ? AND is_active = 1', [(code || '').toUpperCase()]);
  if (!coupon) return res.status(404).json({ error: 'Invalid coupon code.' });
  if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) return res.status(400).json({ error: 'This coupon has expired.' });
  if (coupon.max_uses !== null && coupon.used_count >= coupon.max_uses) return res.status(400).json({ error: 'This coupon has reached its usage limit.' });
  if (subtotal && Number(subtotal) < coupon.min_order_total) return res.status(400).json({ error: `Minimum order of Rs. ${coupon.min_order_total} required.` });
  res.json({ coupon });
}

module.exports = { createCoupon, listCoupons, deleteCoupon, validateCoupon };
