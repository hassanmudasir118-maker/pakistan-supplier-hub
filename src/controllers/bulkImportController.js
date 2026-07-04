const db     = require('../config/db');
const { id } = require('../utils/ids');
const path   = require('path');
const fs     = require('fs');

// ---------------------------------------------------------------------------
// CSV parser — no external dependency, handles quoted fields
// ---------------------------------------------------------------------------
function parseCSV(text) {
  const lines  = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const headers = splitCSVLine(lines[0]).map(h => h.trim().toLowerCase().replace(/\s+/g,'_'));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const vals = splitCSVLine(lines[i]);
    const row  = {};
    headers.forEach((h, idx) => { row[h] = (vals[idx] || '').trim(); });
    rows.push(row);
  }
  return rows;
}

function splitCSVLine(line) {
  const cols = []; let cur = ''; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQ = !inQ; continue; }
    if (c === ',' && !inQ) { cols.push(cur); cur = ''; continue; }
    cur += c;
  }
  cols.push(cur);
  return cols;
}

// Slugify helper
function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// ---------------------------------------------------------------------------
// POST /api/vendor/products/bulk-import
// Accepts: multipart file upload (CSV) or JSON body { rows: [...] }
// CSV columns (case-insensitive):
//   title, description, category, retail_price, dropship_price, wholesale_price,
//   stock_quantity, image_url, image_url_2, image_url_3, allow_dropshipping,
//   compare_at_price, min_order_quantity, sku, tags
// ---------------------------------------------------------------------------
async function bulkImport(req, res) {
  const vendor = req.vendor;
  let rows = [];

  // ── Parse input ──────────────────────────────────────────────────────────
  if (req.file) {
    const text = fs.readFileSync(req.file.path, 'utf8');
    rows = parseCSV(text);
    fs.unlinkSync(req.file.path); // cleanup
  } else if (req.body && Array.isArray(req.body.rows)) {
    rows = req.body.rows;
  } else {
    return res.status(400).json({ error: 'Provide a CSV file or rows array.' });
  }

  if (!rows.length) return res.status(400).json({ error: 'No rows found in file.' });
  if (rows.length > 10000) return res.status(400).json({ error: 'Maximum 10,000 products per import. Split into multiple files.' });

  // ── Load categories for name→id mapping ─────────────────────────────────
  const cats = db.all('SELECT id, name, slug FROM categories');
  const catByName = {};
  const catBySlug = {};
  cats.forEach(c => { catByName[c.name.toLowerCase()] = c.id; catBySlug[c.slug] = c.id; });

  // ── Insert products in a transaction ────────────────────────────────────
  let imported = 0;
  let skipped  = 0;
  const errors = [];

  // Use a loop with try/catch per row for resilience
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // 1-indexed, row 1 is header

    // Required field
    const title = (row.title || row.product_title || row.name || '').trim();
    if (!title) { skipped++; continue; }

    const retailPrice = parseFloat(row.retail_price || row.price || 0);
    if (!retailPrice || retailPrice <= 0) {
      errors.push(`Row ${rowNum}: "${title}" — retail_price missing or 0`);
      skipped++; continue;
    }

    // Category lookup
    const catRaw = (row.category || row.category_name || '').trim().toLowerCase();
    let catId = catByName[catRaw] || catBySlug[slugify(catRaw)] || null;

    // Prices
    const dropshipPrice   = parseFloat(row.dropship_price  || row.reseller_price || retailPrice * 0.65) || null;
    const wholesalePrice  = parseFloat(row.wholesale_price || retailPrice * 0.75) || null;
    const compareAtPrice  = parseFloat(row.compare_at_price || row.original_price || 0) || null;

    // Stock
    const stock    = parseInt(row.stock_quantity || row.stock || row.qty || 0) || 0;
    const moq      = parseInt(row.min_order_quantity || row.moq || 1) || 1;
    const sku      = (row.sku || '').trim() || null;
    const allowDs  = ['0','false','no'].includes((row.allow_dropshipping||'').toLowerCase()) ? 0 : 1;

    // Slug — ensure unique
    let baseSlug = slugify(title).slice(0, 55);
    let slug = baseSlug + '-' + id('prod').slice(-4);
    // check collision
    const existing = db.get('SELECT id FROM products WHERE slug = ?', [slug]);
    if (existing) slug = baseSlug + '-' + Date.now().toString(36);

    const pid = id('prod');
    try {
      db.run(
        `INSERT INTO products
          (id,vendor_id,category_id,title,slug,description,sku,retail_price,dropship_price,wholesale_price,
           compare_at_price,stock_quantity,min_order_quantity,status,allow_dropshipping,is_featured)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'active',?,0)`,
        [pid, vendor.id, catId, title, slug,
         (row.description||row.desc||'').trim()||null, sku,
         retailPrice, dropshipPrice, wholesalePrice,
         compareAtPrice, stock, moq, allowDs]
      );

      // Images — up to 3 image URLs per row
      const imgCols = ['image_url','image_url_2','image_url_3','image1','image2','image3'];
      let sortOrder = 0;
      for (const col of imgCols) {
        const url = (row[col]||'').trim();
        if (url && url.startsWith('http')) {
          db.run('INSERT INTO product_images (id,product_id,url,sort_order) VALUES (?,?,?,?)',
            [id('pimg'), pid, url, sortOrder++]);
        }
      }

      imported++;
    } catch(e) {
      errors.push(`Row ${rowNum}: "${title}" — ${e.message}`);
      skipped++;
    }
  }

  res.json({
    ok: true,
    imported,
    skipped,
    total: rows.length,
    errors: errors.slice(0, 20), // cap error list
    message: `${imported} products imported successfully${skipped ? `, ${skipped} skipped` : ''}.`,
  });
}

// ---------------------------------------------------------------------------
// GET /api/vendor/products/bulk-template — download sample CSV
// ---------------------------------------------------------------------------
function downloadTemplate(req, res) {
  const csv = [
    'title,description,category,retail_price,dropship_price,wholesale_price,compare_at_price,stock_quantity,min_order_quantity,allow_dropshipping,sku,image_url,image_url_2,image_url_3',
    '"TWS Earbuds Pro X5","High quality earbuds with 30hr battery","Electronics & Gadgets",1799,950,1299,2499,100,1,yes,SKU-001,https://images.unsplash.com/photo-1606220945770-b5b6c2c55bf1?w=600,,',
    '"Women Lawn Suit 3-Piece","Premium lawn suit all sizes","Fashion & Apparel",1999,1100,1499,2499,500,5,yes,SKU-002,https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=600,,',
    '"Kitchen Chopper 12-in-1","Multi function vegetable chopper","Home & Kitchen",1599,750,1099,1999,200,1,yes,SKU-003,https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=600,,',
  ].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="psh-bulk-import-template.csv"');
  res.send(csv);
}

module.exports = { bulkImport, downloadTemplate };
