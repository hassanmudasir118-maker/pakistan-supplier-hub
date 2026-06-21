const db = require('../config/db');
const { id } = require('../utils/ids');

function startOrGetConversation(req, res) {
  const { vendorId, productId } = req.body;
  const vendor = db.get('SELECT * FROM vendors WHERE id = ?', [vendorId]);
  if (!vendor) return res.status(404).json({ error: 'Supplier not found.' });

  let convo = db.get('SELECT * FROM conversations WHERE customer_id = ? AND vendor_id = ? AND (product_id IS ?)', [req.user.id, vendorId, productId || null]);
  if (!convo) {
    const newId = id('conv');
    db.run('INSERT INTO conversations (id, customer_id, vendor_id, product_id) VALUES (?, ?, ?, ?)', [newId, req.user.id, vendorId, productId || null]);
    convo = db.get('SELECT * FROM conversations WHERE id = ?', [newId]);
  }
  res.status(201).json({ conversation: convo });
}

function listConversations(req, res) {
  let convos;
  if (req.user.role === 'vendor' && req.vendor) {
    convos = db.all(`
      SELECT c.*, u.name AS customer_name, p.title AS product_title,
        (SELECT body FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_message,
        (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.is_read = 0 AND m.sender_id != ?) AS unread_count
      FROM conversations c JOIN users u ON u.id = c.customer_id LEFT JOIN products p ON p.id = c.product_id
      WHERE c.vendor_id = ? ORDER BY c.created_at DESC
    `, [req.user.id, req.vendor.id]);
  } else {
    convos = db.all(`
      SELECT c.*, s.store_name, p.title AS product_title,
        (SELECT body FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_message,
        (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.is_read = 0 AND m.sender_id != ?) AS unread_count
      FROM conversations c JOIN stores s ON s.vendor_id = c.vendor_id LEFT JOIN products p ON p.id = c.product_id
      WHERE c.customer_id = ? ORDER BY c.created_at DESC
    `, [req.user.id, req.user.id]);
  }
  res.json({ conversations: convos });
}

function getMessages(req, res) {
  const convo = db.get('SELECT * FROM conversations WHERE id = ?', [req.params.id]);
  if (!convo) return res.status(404).json({ error: 'Conversation not found.' });
  const isCustomer = convo.customer_id === req.user.id;
  const isVendor = req.vendor && convo.vendor_id === req.vendor.id;
  if (!isCustomer && !isVendor) return res.status(403).json({ error: 'Not authorized.' });

  const messages = db.all('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC', [convo.id]);
  db.run('UPDATE messages SET is_read = 1 WHERE conversation_id = ? AND sender_id != ?', [convo.id, req.user.id]);
  res.json({ messages });
}

function sendMessage(req, res) {
  const convo = db.get('SELECT * FROM conversations WHERE id = ?', [req.params.id]);
  if (!convo) return res.status(404).json({ error: 'Conversation not found.' });
  const isCustomer = convo.customer_id === req.user.id;
  const isVendor = req.vendor && convo.vendor_id === req.vendor.id;
  if (!isCustomer && !isVendor) return res.status(403).json({ error: 'Not authorized.' });

  const { body } = req.body;
  if (!body || !body.trim()) return res.status(400).json({ error: 'Message cannot be empty.' });

  const newId = id('msg');
  db.run('INSERT INTO messages (id, conversation_id, sender_id, body) VALUES (?, ?, ?, ?)', [newId, convo.id, req.user.id, body.trim()]);

  const recipientId = isCustomer
    ? db.get('SELECT user_id FROM vendors WHERE id = ?', [convo.vendor_id]).user_id
    : convo.customer_id;
  db.run(`INSERT INTO notifications (id, user_id, type, title, body, link) VALUES (?, ?, 'message', 'New message', ?, ?)`,
    [id('notif'), recipientId, body.trim().slice(0, 80), `/dashboard/messages/${convo.id}`]);

  res.status(201).json({ message: db.get('SELECT * FROM messages WHERE id = ?', [newId]) });
}

module.exports = { startOrGetConversation, listConversations, getMessages, sendMessage };
