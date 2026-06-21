const db = require('../config/db');

function listNotifications(req, res) {
  const notifications = db.all('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50', [req.user.id]);
  const unreadCount = db.get('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND is_read = 0', [req.user.id]).c;
  res.json({ notifications, unreadCount });
}

function markRead(req, res) {
  db.run('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  res.json({ ok: true });
}

function markAllRead(req, res) {
  db.run('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [req.user.id]);
  res.json({ ok: true });
}

module.exports = { listNotifications, markRead, markAllRead };
