const db = require('../config/db');
const { id } = require('../utils/ids');

function listAddresses(req, res) {
  res.json({ addresses: db.all('SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, created_at DESC', [req.user.id]) });
}

function createAddress(req, res) {
  const { label, fullName, phone, addressLine, city, province, postalCode, isDefault } = req.body;
  if (!fullName || !phone || !addressLine || !city || !province) return res.status(400).json({ error: 'Please fill all required address fields.' });

  if (isDefault) db.run('UPDATE addresses SET is_default = 0 WHERE user_id = ?', [req.user.id]);
  const newId = id('addr');
  db.run(
    `INSERT INTO addresses (id, user_id, label, full_name, phone, address_line, city, province, postal_code, is_default)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [newId, req.user.id, label || 'Home', fullName, phone, addressLine, city, province, postalCode || null, isDefault ? 1 : 0]
  );
  res.status(201).json({ address: db.get('SELECT * FROM addresses WHERE id = ?', [newId]) });
}

function updateAddress(req, res) {
  const addr = db.get('SELECT * FROM addresses WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  if (!addr) return res.status(404).json({ error: 'Address not found.' });
  const { label, fullName, phone, addressLine, city, province, postalCode, isDefault } = req.body;
  if (isDefault) db.run('UPDATE addresses SET is_default = 0 WHERE user_id = ?', [req.user.id]);
  db.run(
    `UPDATE addresses SET label=?, full_name=?, phone=?, address_line=?, city=?, province=?, postal_code=?, is_default=? WHERE id=?`,
    [label ?? addr.label, fullName ?? addr.full_name, phone ?? addr.phone, addressLine ?? addr.address_line, city ?? addr.city,
     province ?? addr.province, postalCode ?? addr.postal_code, isDefault ? 1 : addr.is_default, addr.id]
  );
  res.json({ address: db.get('SELECT * FROM addresses WHERE id = ?', [addr.id]) });
}

function deleteAddress(req, res) {
  db.run('DELETE FROM addresses WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  res.json({ ok: true });
}

module.exports = { listAddresses, createAddress, updateAddress, deleteAddress };
