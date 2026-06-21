const db = require('../config/db');
const { id, orderNumber } = require('../utils/ids');
const { calculateVendorCommission, round2 } = require('../utils/commission');
const { hydrateCart } = require('./cartController');

const VALID_TRANSITIONS = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['processing', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: ['refund_requested'],
  refund_requested: ['refunded', 'delivered'],
};

// ---------------------------------------------------------------------------
// POST /api/orders — place an order (checkout)
// ---------------------------------------------------------------------------
function placeOrder(req, res) {
  const { shippingName, shippingPhone, shippingAddress, shippingCity, shippingProvince, paymentMethod, couponCode, notes, addressId } = req.body;

  if (!shippingName || !shippingPhone || !shippingAddress || !shippingCity || !shippingProvince) {
    return res.status(400).json({ error: 'Please provide complete shipping details.' });
  }
  const validMethods = ['cod', 'bank_transfer', 'easypaisa', 'jazzcash'];
  if (!validMethods.includes(paymentMethod)) return res.status(400).json({ error: 'Invalid payment method.' });

  const { items } = hydrateCart(req.user.id);
  if (!items.length) return res.status(400).json({ error: 'Your cart is empty.' });

  // Validate stock
  for (const it of items) {
    if (it.quantity < it.minOrderQuantity) {
      return res.status(400).json({ error: `${it.title} requires a minimum order of ${it.minOrderQuantity}.` });
    }
    if (it.stockAvailable !== null && it.quantity > it.stockAvailable) {
      return res.status(400).json({ error: `Not enough stock for ${it.title}. Only ${it.stockAvailable} left.` });
    }
  }

  let subtotal = items.reduce((s, it) => s + it.lineTotal, 0);

  // Coupon
  let discountTotal = 0;
  let coupon = null;
  if (couponCode) {
    coupon = db.get(`SELECT * FROM coupons WHERE code = ? AND is_active = 1`, [couponCode.toUpperCase()]);
    if (!coupon) return res.status(400).json({ error: 'Invalid or expired coupon code.' });
    if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) return res.status(400).json({ error: 'This coupon has expired.' });
    if (coupon.max_uses !== null && coupon.used_count >= coupon.max_uses) return res.status(400).json({ error: 'This coupon has reached its usage limit.' });
    if (subtotal < coupon.min_order_total) return res.status(400).json({ error: `This coupon requires a minimum order of Rs. ${coupon.min_order_total}.` });
    discountTotal = coupon.type === 'percent' ? round2((subtotal * coupon.value) / 100) : Math.min(coupon.value, subtotal);
  }

  // Shipping
  const settings = db.get('SELECT * FROM settings WHERE id = ?', ['global']);
  let shippingTotal = settings.flat_shipping_fee || 0;
  if (settings.free_shipping_threshold && subtotal >= settings.free_shipping_threshold) shippingTotal = 0;

  const grandTotal = round2(subtotal - discountTotal + shippingTotal);

  const newOrderId = id('order');
  const orderNum = orderNumber();

  db.run(
    `INSERT INTO orders (id, order_number, customer_id, address_id, shipping_name, shipping_phone, shipping_address, shipping_city, shipping_province,
       subtotal, discount_total, shipping_total, grand_total, coupon_code, payment_method, payment_status, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
    [newOrderId, orderNum, req.user.id, addressId || null, shippingName, shippingPhone, shippingAddress, shippingCity, shippingProvince,
     round2(subtotal), discountTotal, shippingTotal, grandTotal, coupon ? coupon.code : null, paymentMethod,
     paymentMethod === 'cod' ? 'pending' : 'pending']
  );

  // Group items by vendor for commission split
  const byVendor = {};
  for (const it of items) {
    const product = db.get('SELECT * FROM products WHERE id = ?', [it.productId]);
    if (!byVendor[product.vendor_id]) byVendor[product.vendor_id] = [];
    byVendor[product.vendor_id].push({ ...it, product });
  }

  for (const vendorId of Object.keys(byVendor)) {
    const vendorItems = byVendor[vendorId];
    const vendorLineTotal = round2(vendorItems.reduce((s, it) => s + it.lineTotal, 0));
    const categoryId = vendorItems[0].product.category_id;
    const { percent, commissionAmount, vendorEarning } = calculateVendorCommission({ vendorId, categoryId, lineTotal: vendorLineTotal });

    const ovgId = id('ovg');
    db.run(
      `INSERT INTO order_vendor_groups (id, order_id, vendor_id, status, subtotal, commission_percent, commission_amount, vendor_earning, payout_status)
       VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, 'locked')`,
      [ovgId, newOrderId, vendorId, vendorLineTotal, percent, commissionAmount, vendorEarning]
    );

    for (const it of vendorItems) {
      const supplierUnitCost = it.resellerProductId ? (it.product.dropship_price || it.product.retail_price) : it.unitPrice;
      const resellerMargin = it.resellerProductId ? round2(it.unitPrice - supplierUnitCost) : 0;
      db.run(
        `INSERT INTO order_items (id, order_id, order_vendor_group_id, product_id, variant_id, reseller_id, product_title, variant_title, unit_price, supplier_unit_cost, reseller_margin, quantity, line_total)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id('oi'), newOrderId, ovgId, it.productId, it.variantId || null, it.resellerProductId ? req.user.id : null,
         it.title, it.variantName || null, it.unitPrice, supplierUnitCost, resellerMargin, it.quantity, round2(it.lineTotal)]
      );
      // decrement stock
      if (it.variantId) {
        db.run('UPDATE product_variants SET stock_quantity = MAX(0, stock_quantity - ?) WHERE id = ?', [it.quantity, it.variantId]);
      } else {
        db.run('UPDATE products SET stock_quantity = MAX(0, stock_quantity - ?), sold_count = sold_count + ? WHERE id = ?', [it.quantity, it.quantity, it.productId]);
      }
    }

    // pending balance for vendor (locked until delivered)
    db.run('UPDATE vendors SET balance_pending = balance_pending + ? WHERE id = ?', [vendorEarning, vendorId]);

    // notify vendor
    const vendorUser = db.get('SELECT user_id FROM vendors WHERE id = ?', [vendorId]);
    db.run(
      `INSERT INTO notifications (id, user_id, type, title, body, link) VALUES (?, ?, 'order_placed', 'New order received', ?, ?)`,
      [id('notif'), vendorUser.user_id, `Order ${orderNum} — Rs. ${vendorLineTotal}`, '/dashboard/vendor/orders']
    );
  }

  if (coupon) db.run('UPDATE coupons SET used_count = used_count + 1 WHERE id = ?', [coupon.id]);
  db.run('DELETE FROM cart_items WHERE user_id = ?', [req.user.id]);

  db.run(
    `INSERT INTO notifications (id, user_id, type, title, body, link) VALUES (?, ?, 'order_confirmation', 'Order placed successfully', ?, ?)`,
    [id('notif'), req.user.id, `Your order ${orderNum} has been placed.`, `/dashboard/orders/${newOrderId}`]
  );

  res.status(201).json({ order: getOrderFull(newOrderId) });
}

function getOrderFull(orderId) {
  const order = db.get('SELECT * FROM orders WHERE id = ?', [orderId]);
  if (!order) return null;
  const groups = db.all('SELECT * FROM order_vendor_groups WHERE order_id = ?', [orderId]);
  const items = db.all('SELECT * FROM order_items WHERE order_id = ?', [orderId]);
  for (const g of groups) g.items = items.filter((it) => it.order_vendor_group_id === g.id);
  order.vendorGroups = groups;
  return order;
}

// ---------------------------------------------------------------------------
// GET /api/orders — customer's own orders
// ---------------------------------------------------------------------------
function myOrders(req, res) {
  const orders = db.all('SELECT * FROM orders WHERE customer_id = ? ORDER BY created_at DESC', [req.user.id]);
  res.json({ orders: orders.map((o) => getOrderFull(o.id)) });
}

// ---------------------------------------------------------------------------
// GET /api/orders/:id
// ---------------------------------------------------------------------------
function getOrder(req, res) {
  const order = db.get('SELECT * FROM orders WHERE id = ?', [req.params.id]);
  if (!order) return res.status(404).json({ error: 'Order not found.' });

  const isOwner = order.customer_id === req.user.id;
  const isAdmin = req.user.role === 'super_admin';
  const isVendorOnOrder = req.vendor && db.get('SELECT id FROM order_vendor_groups WHERE order_id = ? AND vendor_id = ?', [order.id, req.vendor.id]);
  if (!isOwner && !isAdmin && !isVendorOnOrder) return res.status(403).json({ error: 'Not authorized to view this order.' });

  res.json({ order: getOrderFull(order.id) });
}

// ---------------------------------------------------------------------------
// GET /api/vendor/orders — vendor sees only their slice of orders
// ---------------------------------------------------------------------------
function vendorOrders(req, res) {
  const { status } = req.query;
  const where = ['ovg.vendor_id = ?'];
  const params = [req.vendor.id];
  if (status) { where.push('ovg.status = ?'); params.push(status); }
  const groups = db.all(`
    SELECT ovg.*, o.order_number, o.shipping_name, o.shipping_phone, o.shipping_address, o.shipping_city, o.shipping_province,
           o.payment_method, o.payment_status, o.created_at AS order_created_at
    FROM order_vendor_groups ovg JOIN orders o ON o.id = ovg.order_id
    WHERE ${where.join(' AND ')} ORDER BY ovg.created_at DESC
  `, params);
  for (const g of groups) g.items = db.all('SELECT * FROM order_items WHERE order_vendor_group_id = ?', [g.id]);
  res.json({ orders: groups });
}

// ---------------------------------------------------------------------------
// PATCH /api/vendor/orders/:groupId/status — vendor updates their slice's status
// ---------------------------------------------------------------------------
function vendorUpdateOrderStatus(req, res) {
  const { status } = req.body;
  const group = db.get('SELECT * FROM order_vendor_groups WHERE id = ? AND vendor_id = ?', [req.params.groupId, req.vendor.id]);
  if (!group) return res.status(404).json({ error: 'Order not found.' });
  if (!VALID_TRANSITIONS[group.status] || !VALID_TRANSITIONS[group.status].includes(status)) {
    return res.status(400).json({ error: `Cannot move order from ${group.status} to ${status}.` });
  }

  db.run('UPDATE order_vendor_groups SET status = ? WHERE id = ?', [status, group.id]);

  if (status === 'delivered') {
    db.run('UPDATE order_vendor_groups SET payout_status = ? WHERE id = ?', ['available', group.id]);
    db.run('UPDATE vendors SET balance_pending = MAX(0, balance_pending - ?), balance_available = balance_available + ?, total_earned = total_earned + ? WHERE id = ?',
      [group.vendor_earning, group.vendor_earning, group.vendor_earning, group.vendor_id]);
  }
  if (status === 'cancelled') {
    db.run('UPDATE vendors SET balance_pending = MAX(0, balance_pending - ?) WHERE id = ?', [group.vendor_earning, group.vendor_id]);
    // restock items
    const items = db.all('SELECT * FROM order_items WHERE order_vendor_group_id = ?', [group.id]);
    for (const it of items) {
      if (it.variant_id) db.run('UPDATE product_variants SET stock_quantity = stock_quantity + ? WHERE id = ?', [it.quantity, it.variant_id]);
      else db.run('UPDATE products SET stock_quantity = stock_quantity + ? WHERE id = ?', [it.quantity, it.product_id]);
    }
  }

  syncParentOrderStatus(group.order_id);

  const order = db.get('SELECT customer_id, order_number FROM orders WHERE id = ?', [group.order_id]);
  db.run(`INSERT INTO notifications (id, user_id, type, title, body, link) VALUES (?, ?, 'order_status', ?, ?, ?)`,
    [id('notif'), order.customer_id, `Order ${order.order_number} update`, `Status changed to ${status.replace('_', ' ')}.`, `/dashboard/orders/${group.order_id}`]);

  res.json({ orderVendorGroup: db.get('SELECT * FROM order_vendor_groups WHERE id = ?', [group.id]) });
}

/** Parent order status reflects the least-advanced vendor group status (simple, predictable rule). */
function syncParentOrderStatus(orderId) {
  const groups = db.all('SELECT status FROM order_vendor_groups WHERE order_id = ?', [orderId]);
  const order = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refund_requested', 'refunded'];
  let worst = groups[0].status;
  for (const g of groups) if (order.indexOf(g.status) < order.indexOf(worst)) worst = g.status;
  db.run("UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?", [worst, orderId]);
}

// ---------------------------------------------------------------------------
// POST /api/orders/:id/payment-proof — submit manual payment proof
// ---------------------------------------------------------------------------
function submitPaymentProof(req, res) {
  const order = db.get('SELECT * FROM orders WHERE id = ? AND customer_id = ?', [req.params.id, req.user.id]);
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  if (order.payment_method === 'cod') return res.status(400).json({ error: 'Cash on delivery orders do not require payment proof.' });

  const { transactionId, payerAccount, screenshotUrl } = req.body;
  if (!transactionId) return res.status(400).json({ error: 'Transaction ID is required.' });

  db.run(
    `INSERT INTO payment_proofs (id, order_id, method, transaction_id, payer_account, screenshot_url) VALUES (?, ?, ?, ?, ?, ?)`,
    [id('pp'), order.id, order.payment_method, transactionId, payerAccount || null, screenshotUrl || null]
  );
  db.run("UPDATE orders SET payment_status = 'submitted' WHERE id = ?", [order.id]);
  res.status(201).json({ ok: true, message: 'Payment proof submitted. An admin will verify it shortly.' });
}

// ---------------------------------------------------------------------------
// Admin: verify payment proofs
// ---------------------------------------------------------------------------
function adminListPaymentProofs(req, res) {
  const proofs = db.all(`
    SELECT pp.*, o.order_number, o.grand_total, o.customer_id, u.name AS customer_name
    FROM payment_proofs pp JOIN orders o ON o.id = pp.order_id JOIN users u ON u.id = o.customer_id
    WHERE pp.status = 'pending' ORDER BY pp.created_at ASC
  `);
  res.json({ proofs });
}

function adminVerifyPaymentProof(req, res) {
  const { approve, note } = req.body;
  const proof = db.get('SELECT * FROM payment_proofs WHERE id = ?', [req.params.id]);
  if (!proof) return res.status(404).json({ error: 'Payment proof not found.' });

  db.run('UPDATE payment_proofs SET status = ?, verified_by = ?, verified_at = datetime(\'now\') WHERE id = ?', [approve ? 'verified' : 'rejected', req.user.id, proof.id]);
  db.run('UPDATE orders SET payment_status = ? WHERE id = ?', [approve ? 'verified' : 'rejected', proof.order_id]);
  if (approve) {
    const order = db.get('SELECT status FROM orders WHERE id = ?', [proof.order_id]);
    if (order.status === 'pending') {
      db.run("UPDATE order_vendor_groups SET status = 'confirmed' WHERE order_id = ? AND status = 'pending'", [proof.order_id]);
      syncParentOrderStatus(proof.order_id);
    }
  }
  res.json({ ok: true });
}

// ---------------------------------------------------------------------------
// Refund requests
// ---------------------------------------------------------------------------
function requestRefund(req, res) {
  const { reason } = req.body;
  const order = db.get('SELECT * FROM orders WHERE id = ? AND customer_id = ?', [req.params.id, req.user.id]);
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  if (order.status !== 'delivered') return res.status(400).json({ error: 'Refunds can only be requested for delivered orders.' });
  if (!reason) return res.status(400).json({ error: 'Please describe the reason for your refund request.' });

  db.run('INSERT INTO refund_requests (id, order_id, customer_id, reason) VALUES (?, ?, ?, ?)', [id('rf'), order.id, req.user.id, reason]);
  db.run("UPDATE orders SET status = 'refund_requested' WHERE id = ?", [order.id]);
  db.run("UPDATE order_vendor_groups SET status = 'refund_requested' WHERE order_id = ?", [order.id]);
  res.status(201).json({ ok: true, message: 'Refund request submitted.' });
}

function adminListRefunds(req, res) {
  const refunds = db.all(`
    SELECT rf.*, o.order_number, o.grand_total, u.name AS customer_name
    FROM refund_requests rf JOIN orders o ON o.id = rf.order_id JOIN users u ON u.id = rf.customer_id
    WHERE rf.status = 'pending' ORDER BY rf.created_at ASC
  `);
  res.json({ refunds });
}

function adminResolveRefund(req, res) {
  const { approve, adminNote } = req.body;
  const refund = db.get('SELECT * FROM refund_requests WHERE id = ?', [req.params.id]);
  if (!refund) return res.status(404).json({ error: 'Refund request not found.' });

  db.run("UPDATE refund_requests SET status = ?, admin_note = ?, resolved_at = datetime('now') WHERE id = ?", [approve ? 'approved' : 'rejected', adminNote || null, refund.id]);
  if (approve) {
    db.run("UPDATE orders SET status = 'refunded', payment_status = 'refunded' WHERE id = ?", [refund.order_id]);
    db.run("UPDATE order_vendor_groups SET status = 'refunded', payout_status = 'locked' WHERE order_id = ?", [refund.order_id]);
  } else {
    db.run("UPDATE orders SET status = 'delivered' WHERE id = ?", [refund.order_id]);
    db.run("UPDATE order_vendor_groups SET status = 'delivered' WHERE order_id = ?", [refund.order_id]);
  }
  res.json({ ok: true });
}

// ---------------------------------------------------------------------------
// Admin: all orders
// ---------------------------------------------------------------------------
function adminListOrders(req, res) {
  const { status, q } = req.query;
  const where = [];
  const params = [];
  if (status) { where.push('o.status = ?'); params.push(status); }
  if (q) { where.push('(o.order_number LIKE ? OR u.name LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const orders = db.all(`
    SELECT o.*, u.name AS customer_name, u.email AS customer_email
    FROM orders o JOIN users u ON u.id = o.customer_id ${whereSql}
    ORDER BY o.created_at DESC LIMIT 200
  `, params);
  res.json({ orders });
}

module.exports = {
  placeOrder, myOrders, getOrder, vendorOrders, vendorUpdateOrderStatus,
  submitPaymentProof, adminListPaymentProofs, adminVerifyPaymentProof,
  requestRefund, adminListRefunds, adminResolveRefund, adminListOrders,
};
