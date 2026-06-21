const db = require('../config/db');

/**
 * Resolves the commission percent that applies to a given product, using
 * the priority order specified in the brief:
 *   1. Supplier-based override (vendors.commission_override)
 *   2. Category-based commission (categories.commission_percent)
 *   3. Global commission percent (settings.global_commission_percent)
 */
function resolveCommissionPercent({ vendorId, categoryId }) {
  if (vendorId) {
    const vendor = db.get('SELECT commission_override FROM vendors WHERE id = ?', [vendorId]);
    if (vendor && vendor.commission_override !== null && vendor.commission_override !== undefined) {
      return vendor.commission_override;
    }
  }
  if (categoryId) {
    const cat = db.get('SELECT commission_percent FROM categories WHERE id = ?', [categoryId]);
    if (cat && cat.commission_percent !== null && cat.commission_percent !== undefined) {
      return cat.commission_percent;
    }
  }
  const settings = db.get('SELECT global_commission_percent FROM settings WHERE id = ?', ['global']);
  return settings ? settings.global_commission_percent : 10;
}

/**
 * Given a list of cart line items (already grouped by vendor) computes the
 * commission split for that vendor's slice of the order.
 * lineTotal = sum of (unit_price * quantity) for this vendor's items.
 */
function calculateVendorCommission({ vendorId, categoryId, lineTotal }) {
  const percent = resolveCommissionPercent({ vendorId, categoryId });
  const commissionAmount = round2((lineTotal * percent) / 100);
  const vendorEarning = round2(lineTotal - commissionAmount);
  return { percent, commissionAmount, vendorEarning };
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

module.exports = { resolveCommissionPercent, calculateVendorCommission, round2 };
