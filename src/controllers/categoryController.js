const db = require('../config/db');
const { id } = require('../utils/ids');

function slugify(text) {
  return text.toString().toLowerCase().trim()
    .replace(/[^\w\s-]/g, '').replace(/[\s_-]+/g, '-').replace(/^-+|-+$/g, '');
}

function listCategories(req, res) {
  const categories = db.all(`
    SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.status = 'active') AS product_count
    FROM categories c ORDER BY sort_order ASC, name ASC
  `);
  res.json({ categories });
}

function getCategory(req, res) {
  const cat = db.get('SELECT * FROM categories WHERE slug = ?', [req.params.slug]);
  if (!cat) return res.status(404).json({ error: 'Category not found.' });
  res.json({ category: cat });
}

function createCategory(req, res) {
  const { name, parentId, commissionPercent, metaTitle, metaDescription, imageUrl, sortOrder } = req.body;
  if (!name) return res.status(400).json({ error: 'Category name is required.' });
  const newId = id('cat');
  const slug = slugify(name);
  const exists = db.get('SELECT id FROM categories WHERE slug = ?', [slug]);
  if (exists) return res.status(409).json({ error: 'A category with this name already exists.' });
  db.run(
    `INSERT INTO categories (id, name, slug, parent_id, commission_percent, meta_title, meta_description, image_url, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [newId, name.trim(), slug, parentId || null, commissionPercent ?? null, metaTitle || null, metaDescription || null, imageUrl || null, sortOrder || 0]
  );
  res.status(201).json({ category: db.get('SELECT * FROM categories WHERE id = ?', [newId]) });
}

function updateCategory(req, res) {
  const cat = db.get('SELECT * FROM categories WHERE id = ?', [req.params.id]);
  if (!cat) return res.status(404).json({ error: 'Category not found.' });
  const { name, parentId, commissionPercent, metaTitle, metaDescription, imageUrl, sortOrder } = req.body;
  db.run(
    `UPDATE categories SET name = ?, parent_id = ?, commission_percent = ?, meta_title = ?, meta_description = ?, image_url = ?, sort_order = ? WHERE id = ?`,
    [name ?? cat.name, parentId ?? cat.parent_id, commissionPercent ?? cat.commission_percent, metaTitle ?? cat.meta_title, metaDescription ?? cat.meta_description, imageUrl ?? cat.image_url, sortOrder ?? cat.sort_order, cat.id]
  );
  res.json({ category: db.get('SELECT * FROM categories WHERE id = ?', [cat.id]) });
}

function deleteCategory(req, res) {
  const inUse = db.get('SELECT COUNT(*) AS c FROM products WHERE category_id = ?', [req.params.id]);
  if (inUse.c > 0) return res.status(400).json({ error: 'Cannot delete a category that still has products. Move or delete those products first.' });
  db.run('DELETE FROM categories WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
}

module.exports = { listCategories, getCategory, createCategory, updateCategory, deleteCategory, slugify };
