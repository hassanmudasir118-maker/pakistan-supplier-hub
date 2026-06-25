// Simple in-memory TTL cache — avoids repeated DB hits for rarely-changing data
const store = new Map();

function cached(key, ttlMs, fn) {
  const hit = store.get(key);
  if (hit && Date.now() < hit.exp) return hit.val;
  const val = fn();
  store.set(key, { val, exp: Date.now() + ttlMs });
  return val;
}

function invalidate(key)   { store.delete(key); }
function invalidateAll()   { store.clear(); }

module.exports = { cached, invalidate, invalidateAll };
