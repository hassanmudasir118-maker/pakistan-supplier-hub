-- Structural seed data only. NO fake users, vendors, products, or orders.
-- Categories are real taxonomy (standard for Pakistani e-commerce/wholesale),
-- not "demo data" — every marketplace needs categories to exist before
-- vendors can list products.

INSERT OR IGNORE INTO settings (id, platform_name, global_commission_percent, flat_shipping_fee, support_email)
VALUES ('global', 'Pakistan Supplier Hub', 10, 200, 'support@pakistansupplierhub.com');

INSERT OR IGNORE INTO categories (id, name, slug, sort_order) VALUES
 ('cat-electronics',   'Electronics & Gadgets',     'electronics',          1),
 ('cat-fashion',       'Fashion & Apparel',          'fashion-apparel',      2),
 ('cat-home',          'Home & Kitchen',             'home-kitchen',         3),
 ('cat-beauty',        'Beauty & Personal Care',     'beauty-personal-care', 4),
 ('cat-mobile',        'Mobiles & Accessories',      'mobiles-accessories',  5),
 ('cat-textiles',      'Textiles & Fabrics',         'textiles-fabrics',     6),
 ('cat-jewelry',       'Jewelry & Accessories',      'jewelry-accessories',  7),
 ('cat-toys',          'Toys & Baby Products',       'toys-baby',            8),
 ('cat-sports',        'Sports & Fitness',           'sports-fitness',       9),
 ('cat-grocery',       'Grocery & Daily Needs',      'grocery-daily-needs', 10),
 ('cat-auto',          'Automotive & Tools',         'automotive-tools',    11),
 ('cat-office',        'Office & Stationery',        'office-stationery',   12);
