-- ============================================================================
-- PAKISTAN SUPPLIER HUB — DATABASE SCHEMA
-- Engine: SQLite (via Node's built-in node:sqlite). Pure SQL — portable to
-- PostgreSQL/MySQL with minor type changes (TEXT->VARCHAR, AUTOINCREMENT->SERIAL).
-- ============================================================================

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- USERS  (super_admin | vendor | customer — a vendor row also has a users row)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  email           TEXT UNIQUE NOT NULL,
  phone           TEXT,
  password_hash   TEXT,                 -- NULL if account is Google-only
  google_id       TEXT UNIQUE,
  role            TEXT NOT NULL CHECK(role IN ('super_admin','vendor','customer')) DEFAULT 'customer',
  avatar_url      TEXT,
  is_reseller     INTEGER NOT NULL DEFAULT 0,   -- 1 = customer has activated reseller mode
  email_verified  INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL CHECK(status IN ('active','suspended','banned')) DEFAULT 'active',
  referred_by     TEXT REFERENCES users(id),
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token       TEXT UNIQUE NOT NULL,
  expires_at  TEXT NOT NULL,
  used        INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token       TEXT UNIQUE NOT NULL,
  expires_at  TEXT NOT NULL,
  used        INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,         -- refresh token id
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_agent  TEXT,
  ip_address  TEXT,
  expires_at  TEXT NOT NULL,
  revoked     INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS addresses (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label       TEXT NOT NULL DEFAULT 'Home',
  full_name   TEXT NOT NULL,
  phone       TEXT NOT NULL,
  address_line TEXT NOT NULL,
  city        TEXT NOT NULL,
  province    TEXT NOT NULL,
  postal_code TEXT,
  is_default  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- VENDORS / STORES
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vendors (
  id                  TEXT PRIMARY KEY,
  user_id             TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_name       TEXT NOT NULL,
  business_type       TEXT NOT NULL CHECK(business_type IN ('supplier','wholesaler','manufacturer','importer','dropshipping_vendor')),
  cnic_or_ntn         TEXT,
  business_phone      TEXT NOT NULL,
  business_email      TEXT,
  warehouse_address   TEXT,
  warehouse_city      TEXT,
  warehouse_province  TEXT,
  bank_account_title  TEXT,
  bank_name           TEXT,
  bank_account_number TEXT,
  easypaisa_number    TEXT,
  jazzcash_number     TEXT,
  status              TEXT NOT NULL CHECK(status IN ('pending','approved','rejected','suspended')) DEFAULT 'pending',
  rejection_reason    TEXT,
  is_verified         INTEGER NOT NULL DEFAULT 0,   -- "Verified Supplier" badge
  commission_override REAL,                          -- overrides global/category commission if set
  commission_type     TEXT DEFAULT 'percent' CHECK(commission_type IN ('percent','flat')), -- 'percent' or 'flat' Rs. amount
  balance_available   REAL NOT NULL DEFAULT 0,        -- withdrawable earnings
  balance_pending      REAL NOT NULL DEFAULT 0,        -- earnings from undelivered orders
  total_earned         REAL NOT NULL DEFAULT 0,
  approved_at         TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS stores (
  id            TEXT PRIMARY KEY,
  vendor_id     TEXT UNIQUE NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  slug          TEXT UNIQUE NOT NULL,
  store_name    TEXT NOT NULL,
  tagline       TEXT,
  description   TEXT,
  logo_url      TEXT,
  banner_url    TEXT,
  is_featured   INTEGER NOT NULL DEFAULT 0,
  rating_avg    REAL NOT NULL DEFAULT 0,
  rating_count  INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- CATEGORIES
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  slug              TEXT UNIQUE NOT NULL,
  parent_id         TEXT REFERENCES categories(id),
  image_url         TEXT,
  commission_percent REAL,                 -- category-level commission override
  meta_title        TEXT,
  meta_description  TEXT,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- PRODUCTS / VARIANTS / IMAGES
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
  id                  TEXT PRIMARY KEY,
  vendor_id           TEXT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  category_id         TEXT REFERENCES categories(id),
  title               TEXT NOT NULL,
  slug                TEXT UNIQUE NOT NULL,
  description         TEXT,
  sku                 TEXT,
  retail_price        REAL NOT NULL,        -- price shown to end customers
  wholesale_price     REAL,                 -- bulk pricing (qty-based, see product_wholesale_tiers)
  dropship_price      REAL,                 -- price a reseller pays the supplier
  compare_at_price    REAL,                 -- "old price" for showing a discount
  stock_quantity      INTEGER NOT NULL DEFAULT 0,
  min_order_quantity  INTEGER NOT NULL DEFAULT 1,
  weight_grams        INTEGER,
  status              TEXT NOT NULL CHECK(status IN ('draft','pending_review','active','rejected','archived')) DEFAULT 'active',
  is_featured         INTEGER NOT NULL DEFAULT 0,
  allow_dropshipping  INTEGER NOT NULL DEFAULT 1,
  meta_title          TEXT,
  meta_description    TEXT,
  rating_avg          REAL NOT NULL DEFAULT 0,
  rating_count        INTEGER NOT NULL DEFAULT 0,
  sold_count          INTEGER NOT NULL DEFAULT 0,
  views_count         INTEGER NOT NULL DEFAULT 0,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS product_images (
  id          TEXT PRIMARY KEY,
  product_id  TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url         TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS product_variants (
  id              TEXT PRIMARY KEY,
  product_id      TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,         -- e.g. "Color: Red / Size: M"
  sku             TEXT,
  price_delta     REAL NOT NULL DEFAULT 0,  -- added/subtracted from base retail_price
  stock_quantity  INTEGER NOT NULL DEFAULT 0,
  image_url       TEXT
);

CREATE TABLE IF NOT EXISTS product_wholesale_tiers (
  id          TEXT PRIMARY KEY,
  product_id  TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  min_qty     INTEGER NOT NULL,
  price       REAL NOT NULL
);

-- Reseller "imported" products: a customer (acting as reseller) copies a
-- supplier product into their own catalog with their own markup/price.
CREATE TABLE IF NOT EXISTS reseller_products (
  id              TEXT PRIMARY KEY,
  reseller_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  custom_title    TEXT,
  resale_price    REAL NOT NULL,
  is_active       INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(reseller_id, source_product_id)
);

-- ---------------------------------------------------------------------------
-- CART / WISHLIST
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cart_items (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id  TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_id  TEXT REFERENCES product_variants(id),
  reseller_product_id TEXT REFERENCES reseller_products(id),
  quantity    INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS wishlist_items (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id  TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, product_id)
);

-- ---------------------------------------------------------------------------
-- COUPONS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS coupons (
  id              TEXT PRIMARY KEY,
  code            TEXT UNIQUE NOT NULL,
  type            TEXT NOT NULL CHECK(type IN ('percent','fixed')),
  value           REAL NOT NULL,
  min_order_total REAL NOT NULL DEFAULT 0,
  max_uses        INTEGER,               -- NULL = unlimited
  used_count      INTEGER NOT NULL DEFAULT 0,
  vendor_id       TEXT REFERENCES vendors(id),  -- NULL = platform-wide coupon
  starts_at       TEXT,
  expires_at      TEXT,
  is_active       INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- ORDERS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
  id                  TEXT PRIMARY KEY,
  order_number        TEXT UNIQUE NOT NULL,
  customer_id         TEXT NOT NULL REFERENCES users(id),
  address_id          TEXT REFERENCES addresses(id),
  shipping_name       TEXT NOT NULL,
  shipping_phone      TEXT NOT NULL,
  shipping_address    TEXT NOT NULL,
  shipping_city       TEXT NOT NULL,
  shipping_province   TEXT NOT NULL,
  subtotal            REAL NOT NULL,
  discount_total       REAL NOT NULL DEFAULT 0,
  shipping_total      REAL NOT NULL DEFAULT 0,
  grand_total         REAL NOT NULL,
  coupon_code         TEXT,
  payment_method      TEXT NOT NULL CHECK(payment_method IN ('cod','bank_transfer','easypaisa','jazzcash')),
  payment_status      TEXT NOT NULL CHECK(payment_status IN ('pending','submitted','verified','rejected','refunded')) DEFAULT 'pending',
  status              TEXT NOT NULL CHECK(status IN ('pending','confirmed','processing','shipped','delivered','cancelled','refund_requested','refunded')) DEFAULT 'pending',
  notes               TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

-- One row per vendor represented in an order (an order can span many vendors).
-- This is the unit that vendor dashboards, commission, and order status-per-vendor key off of.
CREATE TABLE IF NOT EXISTS order_vendor_groups (
  id              TEXT PRIMARY KEY,
  order_id        TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  vendor_id       TEXT NOT NULL REFERENCES vendors(id),
  status          TEXT NOT NULL CHECK(status IN ('pending','confirmed','processing','shipped','delivered','cancelled','refund_requested','refunded')) DEFAULT 'pending',
  subtotal        REAL NOT NULL,
  commission_percent REAL NOT NULL,
  commission_amount  REAL NOT NULL,
  vendor_earning     REAL NOT NULL,
  payout_status      TEXT NOT NULL CHECK(payout_status IN ('locked','available','withdrawn')) DEFAULT 'locked',
  courier_name    TEXT,
  tracking_number TEXT,
  tracking_url    TEXT,
  shipped_at      TEXT,
  delivered_at    TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS order_items (
  id                  TEXT PRIMARY KEY,
  order_id            TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  order_vendor_group_id TEXT NOT NULL REFERENCES order_vendor_groups(id) ON DELETE CASCADE,
  product_id          TEXT NOT NULL REFERENCES products(id),
  variant_id          TEXT REFERENCES product_variants(id),
  reseller_id         TEXT REFERENCES users(id),     -- set if sold through a reseller's storefront
  product_title       TEXT NOT NULL,
  variant_title        TEXT,
  unit_price           REAL NOT NULL,    -- price the customer paid per unit
  supplier_unit_cost   REAL NOT NULL,    -- what's owed to the supplier per unit (dropship/wholesale price)
  reseller_margin      REAL NOT NULL DEFAULT 0,
  quantity             INTEGER NOT NULL,
  line_total           REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS payment_proofs (
  id              TEXT PRIMARY KEY,
  order_id        TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  method          TEXT NOT NULL CHECK(method IN ('bank_transfer','easypaisa','jazzcash')),
  transaction_id  TEXT,
  payer_account   TEXT,
  screenshot_url  TEXT,
  status          TEXT NOT NULL CHECK(status IN ('pending','verified','rejected')) DEFAULT 'pending',
  verified_by     TEXT REFERENCES users(id),
  verified_at     TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS refund_requests (
  id          TEXT PRIMARY KEY,
  order_id    TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL REFERENCES users(id),
  reason      TEXT NOT NULL,
  status      TEXT NOT NULL CHECK(status IN ('pending','approved','rejected')) DEFAULT 'pending',
  admin_note  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT
);

-- ---------------------------------------------------------------------------
-- REVIEWS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS product_reviews (
  id          TEXT PRIMARY KEY,
  product_id  TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL REFERENCES users(id),
  order_id    TEXT REFERENCES orders(id),   -- present => verified purchase
  rating      INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
  comment     TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(product_id, customer_id, order_id)
);

CREATE TABLE IF NOT EXISTS vendor_reviews (
  id          TEXT PRIMARY KEY,
  vendor_id   TEXT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL REFERENCES users(id),
  rating      INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
  comment     TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(vendor_id, customer_id)
);

-- ---------------------------------------------------------------------------
-- MESSAGES (customer <-> vendor)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS conversations (
  id          TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES users(id),
  vendor_id   TEXT NOT NULL REFERENCES vendors(id),
  product_id  TEXT REFERENCES products(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(customer_id, vendor_id, product_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       TEXT NOT NULL REFERENCES users(id),
  body            TEXT NOT NULL,
  is_read         INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- NOTIFICATIONS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,        -- order_placed, order_status, vendor_approved, withdrawal_status, message, ...
  title       TEXT NOT NULL,
  body        TEXT,
  link        TEXT,
  is_read     INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- WITHDRAWALS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS withdrawals (
  id              TEXT PRIMARY KEY,
  vendor_id       TEXT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  amount          REAL NOT NULL,
  method          TEXT NOT NULL CHECK(method IN ('bank_transfer','easypaisa','jazzcash')),
  account_details TEXT NOT NULL,
  status          TEXT NOT NULL CHECK(status IN ('pending','approved','paid','rejected')) DEFAULT 'pending',
  admin_note      TEXT,
  requested_at    TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at     TEXT
);

-- ---------------------------------------------------------------------------
-- REFERRALS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS referrals (
  id              TEXT PRIMARY KEY,
  referrer_id     TEXT NOT NULL REFERENCES users(id),
  referred_user_id TEXT UNIQUE NOT NULL REFERENCES users(id),
  reward_amount   REAL NOT NULL DEFAULT 0,
  status          TEXT NOT NULL CHECK(status IN ('pending','rewarded')) DEFAULT 'pending',
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- MARKETING — flash sales / newsletter
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS flash_sales (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  starts_at   TEXT NOT NULL,
  ends_at     TEXT NOT NULL,
  is_active   INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS flash_sale_products (
  id            TEXT PRIMARY KEY,
  flash_sale_id TEXT NOT NULL REFERENCES flash_sales(id) ON DELETE CASCADE,
  product_id    TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sale_price    REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id          TEXT PRIMARY KEY,
  email       TEXT UNIQUE NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- PLATFORM SETTINGS (singleton row, id = 'global')
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS settings (
  id                      TEXT PRIMARY KEY DEFAULT 'global',
  platform_name           TEXT NOT NULL DEFAULT 'Pakistan Supplier Hub',
  global_commission_percent REAL NOT NULL DEFAULT 10,
  global_commission_type    TEXT NOT NULL DEFAULT 'percent' CHECK(global_commission_type IN ('percent','flat')),
  global_commission_flat    REAL NOT NULL DEFAULT 10,
  flat_shipping_fee       REAL NOT NULL DEFAULT 200,
  free_shipping_threshold REAL,
  support_email           TEXT,
  support_phone           TEXT,
  bank_transfer_details   TEXT,
  easypaisa_account       TEXT,
  jazzcash_account        TEXT,
  updated_at              TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- AUDIT LOG (admin actions — vendor approvals, withdrawals, etc.)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id          TEXT PRIMARY KEY,
  actor_id    TEXT REFERENCES users(id),
  action      TEXT NOT NULL,
  target_type TEXT,
  target_id   TEXT,
  meta        TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- INDEXES
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_products_vendor ON products(vendor_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_ovg_vendor ON order_vendor_groups(vendor_id);
CREATE INDEX IF NOT EXISTS idx_order_items_ovg ON order_items(order_vendor_group_id);
CREATE INDEX IF NOT EXISTS idx_cart_user ON cart_items(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_vendors_status ON vendors(status);

-- Performance indexes for 100k+ product catalog
CREATE INDEX IF NOT EXISTS idx_products_featured   ON products(is_featured, status);
CREATE INDEX IF NOT EXISTS idx_products_dropship   ON products(allow_dropshipping, status);
CREATE INDEX IF NOT EXISTS idx_products_price      ON products(retail_price, status);
CREATE INDEX IF NOT EXISTS idx_products_sold       ON products(sold_count);
CREATE INDEX IF NOT EXISTS idx_products_created    ON products(created_at);
CREATE INDEX IF NOT EXISTS idx_products_slug       ON products(slug);
CREATE INDEX IF NOT EXISTS idx_stores_slug         ON stores(slug);
CREATE INDEX IF NOT EXISTS idx_stores_vendor       ON stores(vendor_id);
CREATE INDEX IF NOT EXISTS idx_ovg_payout          ON order_vendor_groups(payout_status, vendor_id);
CREATE INDEX IF NOT EXISTS idx_users_email         ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role          ON users(role, status);
CREATE INDEX IF NOT EXISTS idx_product_images_prod ON product_images(product_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_notifications_read  ON notifications(user_id, is_read);
