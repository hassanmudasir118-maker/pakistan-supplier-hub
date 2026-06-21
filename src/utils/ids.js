const { v4: uuidv4 } = require('uuid');

function id(prefix) {
  return `${prefix}_${uuidv4()}`;
}

function orderNumber() {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `PSH-${stamp}-${rand}`;
}

module.exports = { id, orderNumber };
