const db = require('../config/db');

/**
 * Commission resolution priority:
 *  1. Vendor-level override (vendors.commission_override + commission_type)
 *  2. Category-level (categories.commission_percent — always percent)
 *  3. Global setting (settings.global_commission_percent/flat/type)
 *
 * Returns { type: 'percent'|'flat', value: Number }
 */
function resolveCommission({ vendorId, categoryId }) {
  // 1. Vendor override
  if (vendorId) {
    const vendor = db.get('SELECT commission_override, commission_type FROM vendors WHERE id = ?', [vendorId]);
    if (vendor && vendor.commission_override !== null && vendor.commission_override !== undefined) {
      return { type: vendor.commission_type || 'percent', value: vendor.commission_override };
    }
  }

  // 2. Category override (percent only)
  if (categoryId) {
    const cat = db.get('SELECT commission_percent FROM categories WHERE id = ?', [categoryId]);
    if (cat && cat.commission_percent !== null && cat.commission_percent !== undefined) {
      return { type: 'percent', value: cat.commission_percent };
    }
  }

  // 3. Global setting
  const settings = db.get('SELECT global_commission_percent, global_commission_type, global_commission_flat FROM settings WHERE id = ?', ['global']);
  if (!settings) return { type: 'percent', value: 10 };

  const type = settings.global_commission_type || 'percent';
  const value = type === 'flat'
    ? (settings.global_commission_flat || 10)
    : (settings.global_commission_percent || 10);

  return { type, value };
}

// Backward-compatible wrapper — returns percent value for old code
function resolveCommissionPercent({ vendorId, categoryId }) {
  return resolveCommission({ vendorId, categoryId }).value;
}

/**
 * Calculate commission split for a vendor's order slice.
 * lineTotal = sum of (unit_price × quantity) for this vendor's items.
 * orderItemCount = number of line items (for flat fee — charged per item or per order)
 */
function calculateVendorCommission({ vendorId, categoryId, lineTotal, orderItemCount = 1 }) {
  const { type, value } = resolveCommission({ vendorId, categoryId });

  let commissionAmount;
  if (type === 'flat') {
    // Flat Rs. amount per order group (one charge per vendor per order)
    commissionAmount = round2(value);
  } else {
    commissionAmount = round2((lineTotal * value) / 100);
  }

  // Commission can never exceed the order total
  commissionAmount = Math.min(commissionAmount, lineTotal);
  const vendorEarning = round2(lineTotal - commissionAmount);

  return {
    percent: type === 'percent' ? value : round2((commissionAmount / lineTotal) * 100),
    commissionAmount,
    vendorEarning,
    type,
    flatValue: type === 'flat' ? value : null,
  };
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

module.exports = { resolveCommission, resolveCommissionPercent, calculateVendorCommission, round2 };
