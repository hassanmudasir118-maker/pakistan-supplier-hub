const db = require('../config/db');
const { id } = require('../utils/ids');

function requestWithdrawal(req, res) {
  const { amount, method, accountDetails } = req.body;
  const vendor = req.vendor;
  const amt = Number(amount);
  if (!amount || amt <= 0) return res.status(400).json({ error: 'Enter a valid amount.' });
  if (!['bank_transfer', 'easypaisa', 'jazzcash'].includes(method)) return res.status(400).json({ error: 'Invalid payout method.' });
  if (!accountDetails) return res.status(400).json({ error: 'Account details are required.' });

  // Atomic check-and-deduct: the WHERE clause re-checks balance_available at the
  // moment of the write (not the stale value loaded earlier in req.vendor), so two
  // concurrent withdrawal requests can never both succeed against the same balance.
  const deduction = db.run(
    'UPDATE vendors SET balance_available = balance_available - ? WHERE id = ? AND balance_available >= ?',
    [amt, vendor.id, amt]
  );
  if (deduction.changes === 0) {
    return res.status(400).json({ error: 'Withdrawal amount exceeds your available balance.' });
  }

  const newId = id('wd');
  db.run('INSERT INTO withdrawals (id, vendor_id, amount, method, account_details) VALUES (?, ?, ?, ?, ?)', [newId, vendor.id, amt, method, accountDetails]);
  res.status(201).json({ withdrawal: db.get('SELECT * FROM withdrawals WHERE id = ?', [newId]) });
}

function myWithdrawals(req, res) {
  const withdrawals = db.all('SELECT * FROM withdrawals WHERE vendor_id = ? ORDER BY requested_at DESC', [req.vendor.id]);
  res.json({ withdrawals });
}

function adminListWithdrawals(req, res) {
  const { status } = req.query;
  const where = status ? 'WHERE w.status = ?' : '';
  const params = status ? [status] : [];
  const withdrawals = db.all(`
    SELECT w.*, v.business_name, s.store_name
    FROM withdrawals w JOIN vendors v ON v.id = w.vendor_id JOIN stores s ON s.vendor_id = v.id
    ${where} ORDER BY w.requested_at ASC
  `, params);
  res.json({ withdrawals });
}

function adminResolveWithdrawal(req, res) {
  const { action, adminNote } = req.body; // action: 'approve' | 'mark_paid' | 'reject'
  const wd = db.get('SELECT * FROM withdrawals WHERE id = ?', [req.params.id]);
  if (!wd) return res.status(404).json({ error: 'Withdrawal not found.' });

  if (action === 'approve') {
    db.run("UPDATE withdrawals SET status = 'approved', admin_note = ? WHERE id = ?", [adminNote || null, wd.id]);
  } else if (action === 'mark_paid') {
    db.run("UPDATE withdrawals SET status = 'paid', admin_note = ?, resolved_at = datetime('now') WHERE id = ?", [adminNote || null, wd.id]);
    db.run(`INSERT INTO notifications (id, user_id, type, title, body) SELECT ?, v.user_id, 'withdrawal_paid', 'Withdrawal paid', ? FROM vendors v WHERE v.id = ?`,
      [id('notif'), `Rs. ${wd.amount} has been sent to your account.`, wd.vendor_id]);
  } else if (action === 'reject') {
    db.run("UPDATE withdrawals SET status = 'rejected', admin_note = ?, resolved_at = datetime('now') WHERE id = ?", [adminNote || null, wd.id]);
    db.run('UPDATE vendors SET balance_available = balance_available + ? WHERE id = ?', [wd.amount, wd.vendor_id]); // refund the hold
  } else {
    return res.status(400).json({ error: 'Invalid action.' });
  }
  res.json({ withdrawal: db.get('SELECT * FROM withdrawals WHERE id = ?', [wd.id]) });
}

module.exports = { requestWithdrawal, myWithdrawals, adminListWithdrawals, adminResolveWithdrawal };
