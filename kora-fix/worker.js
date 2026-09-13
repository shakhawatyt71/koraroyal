/* ================================================================
   KORA ROYAL — Cloudflare Worker v5.1 (Audit Fixes + Coupon Engine)

   ভাগ/সেকশন মানচিত্র (ফাইলটা একটাই — Cloudflare Dashboard-এ
   সরাসরি paste করে deploy করা যায়):

   ① D1 SCHEMA & MIGRATIONS ... KR_MOBILE_SCHEMA / PHASE3A / PHASE3B /
                                 PATHAO / OPERATIONS / COUPON statements
   ② PATHAO HELPERS .......... token cache, pathaoRequest, pathaoList,
                               pathaoCachedList (24h KV cache), autoBookPathao,
                               maybeAutoBookPathao (opt-in auto booking)
   ③ ROUTES — PUBLIC ......... /api/order, /api/lead, /api/track, /api/cancel,
                               /api/order/service-request, /api/catalog (+/version),
                               /api/products/*, /api/reviews*, /api/coupons/validate,
                               /api/order/invoice/request (phone-verified)
   ④ ROUTES — ADMIN .......... login, orders, status, stats, customers/CRM,
                               service-requests, heroes, size-charts, products,
                               inventory, gallery, pathao (cached), coupons CRUD,
                               reviews moderation + migrate-images, migrations
   ⑤ WEBHOOKS ................ /api/pathao/webhook, /api/telegram/webhook
                               (secret-token shielded)
   ⑥ COMMERCE CORE ........... resolveCommerceItems, placeCommerceOrder,
                               placeAdminOrder, transition/cancel, coupon engine
                               (resolveCoupon/saveCoupon), stats
   ⑦ CATALOG/D1 LOADERS ...... loadCatalogFromD1, saveProductGraph, mappers
   ⑧ REVIEW HELPERS .......... priority score, filters, safe-public DTO
   ⑨ PLATFORM UTILS .......... sanitize (cleanText/cleanToken), crypto
                               (HMAC token, SHA-1/256), CORS, Telegram, Sheets,
                               Cloudinary (signed upload, auto-optimized URL)

   v5.1 FIXES:
   - Cloudinary signature parameter order fixed (alphabetical) → uploads work;
     URLs stored auto-optimized (f_auto,q_auto,w_*). No more 6MB base64 payloads.
   - Broken \${...} template literals fixed (Pathao/Telegram messages).
   - Dead duplicated Pathao auto-book blocks removed → single autoBookPathao()
     behind opt-in setting pathao_auto_book.
   - Invoice endpoint now requires the order's phone number (admin bypass).
   - Review text/name sanitized server-side; Telegram review alerts escaped.
   - NEW: full coupon engine (percent/fixed/free_delivery/BOGO + validity,
     global & per-customer limits, min-shopping, percent cap, apply-base).
   - NEW: /api/catalog/version for smart frontend caching.
   - NEW: TELEGRAM_WEBHOOK_SECRET verification (optional, backward-compatible).
   ================================================================

   ORIGINAL ENDPOINTS (অপরিবর্তিত):
   POST /api/order
   POST /api/lead
   GET  /api/track
   POST /api/admin/login
   GET  /api/admin/orders
   GET  /api/admin/order/:id
   POST /api/admin/status
   POST /api/admin/cancel
   POST /api/cancel
   GET  /api/admin/stats
   POST /api/admin/telegram-test

   NEW — REVIEW ENDPOINTS:
   GET  /api/reviews              → Approved + Auto reviews (public)
   GET  /api/reviews/stats        → Live rating summary (public)
   POST /api/reviews/submit       → Submit new review (public)
   POST /api/reviews/like         → Like / Unlike (public)
   GET  /api/admin/reviews        → All reviews (admin)
   POST /api/admin/reviews/approve → Approve review (admin)
   POST /api/admin/reviews/reject  → Reject review (admin)
   POST /api/admin/reviews/revoke  → Revoke approval (admin)
   POST /api/admin/reviews/priority → Set priority boost (admin)
   DELETE /api/admin/reviews/delete → Delete permanently (admin)

   KV PREFIX STRATEGY (KR_ORDERS namespace):
   order:*        → existing orders (unchanged)
   stat:*         → existing stats (unchanged)
   review:*       → individual review data
   rv_stat:*      → review stats cache
   rv_like:*      → per-review like tracking
   rv_anon        → anonymous counter
   rv_index       → review ID index (fast list)

   NEW SECRETS NEEDED:
   (কোনো নতুন secret লাগবে না, ADMIN_SECRET ব্যবহার হবে)
   ================================================================ */


const KR_MOBILE_SCHEMA_STATEMENTS = [
  "CREATE TABLE IF NOT EXISTS products (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  slug TEXT NOT NULL UNIQUE,\n  name_en TEXT NOT NULL,\n  name_bn TEXT NOT NULL DEFAULT '',\n  sub_en TEXT NOT NULL DEFAULT '',\n  sub_bn TEXT NOT NULL DEFAULT '',\n  category TEXT NOT NULL DEFAULT 'Exclusive',\n  price REAL NOT NULL CHECK (price >= 0),\n  compare_price REAL NOT NULL DEFAULT 0 CHECK (compare_price >= 0),\n  description_en TEXT NOT NULL DEFAULT '',\n  description_bn TEXT NOT NULL DEFAULT '',\n  main_image_url TEXT NOT NULL DEFAULT '',\n  hero_image_url TEXT NOT NULL DEFAULT '',\n  hero_lines_en TEXT NOT NULL DEFAULT '[]',\n  hero_lines_bn TEXT NOT NULL DEFAULT '[]',\n  size_chart_json TEXT NOT NULL DEFAULT '{}',\n  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),\n  sales_status TEXT NOT NULL DEFAULT 'available' CHECK (sales_status IN ('available','limited','out_of_stock')),\n  allow_backorder INTEGER NOT NULL DEFAULT 1 CHECK (allow_backorder IN (0,1)),\n  priority INTEGER NOT NULL DEFAULT 100,\n  showcase_row INTEGER,\n  showcase_position INTEGER,\n  created_at INTEGER NOT NULL,\n  updated_at INTEGER NOT NULL,\n  archived_at INTEGER\n)",
  "CREATE INDEX IF NOT EXISTS idx_products_public\n  ON products(status, priority, showcase_row, showcase_position)",
  "CREATE INDEX IF NOT EXISTS idx_products_sales_status\n  ON products(sales_status)",
  "CREATE TABLE IF NOT EXISTS product_media (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,\n  media_type TEXT NOT NULL DEFAULT 'detail' CHECK (media_type IN ('detail')),\n  url TEXT NOT NULL,\n  alt_en TEXT NOT NULL DEFAULT '',\n  alt_bn TEXT NOT NULL DEFAULT '',\n  sort_order INTEGER NOT NULL DEFAULT 0,\n  created_at INTEGER NOT NULL\n)",
  "CREATE INDEX IF NOT EXISTS idx_product_media_product\n  ON product_media(product_id, sort_order)",
  "CREATE TABLE IF NOT EXISTS product_options (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,\n  code TEXT NOT NULL,\n  label_en TEXT NOT NULL,\n  label_bn TEXT NOT NULL DEFAULT '',\n  display_type TEXT NOT NULL DEFAULT 'buttons'\n    CHECK (display_type IN ('buttons','swatches','dropdown','text')),\n  is_required INTEGER NOT NULL DEFAULT 1 CHECK (is_required IN (0,1)),\n  creates_variant INTEGER NOT NULL DEFAULT 1 CHECK (creates_variant IN (0,1)),\n  sort_order INTEGER NOT NULL DEFAULT 0,\n  UNIQUE(product_id, code)\n)",
  "CREATE INDEX IF NOT EXISTS idx_product_options_product\n  ON product_options(product_id, sort_order)",
  "CREATE TABLE IF NOT EXISTS product_option_values (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  option_id INTEGER NOT NULL REFERENCES product_options(id) ON DELETE CASCADE,\n  value_code TEXT NOT NULL,\n  value_en TEXT NOT NULL,\n  value_bn TEXT NOT NULL DEFAULT '',\n  color_hex TEXT NOT NULL DEFAULT '',\n  sort_order INTEGER NOT NULL DEFAULT 0,\n  UNIQUE(option_id, value_code)\n)",
  "CREATE INDEX IF NOT EXISTS idx_option_values_option\n  ON product_option_values(option_id, sort_order)",
  "CREATE TABLE IF NOT EXISTS product_variants (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,\n  sku TEXT NOT NULL UNIQUE,\n  title TEXT NOT NULL DEFAULT '',\n  stock_qty INTEGER NOT NULL DEFAULT 0,\n  reserved_qty INTEGER NOT NULL DEFAULT 0,\n  price_override REAL,\n  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),\n  sales_status TEXT NOT NULL DEFAULT 'available'\n    CHECK (sales_status IN ('available','limited','out_of_stock')),\n  low_stock_threshold INTEGER NOT NULL DEFAULT 5,\n  created_at INTEGER NOT NULL,\n  updated_at INTEGER NOT NULL,\n  CHECK (reserved_qty >= 0)\n)",
  "CREATE INDEX IF NOT EXISTS idx_variants_product\n  ON product_variants(product_id, is_active)",
  "CREATE INDEX IF NOT EXISTS idx_variants_low_stock\n  ON product_variants(stock_qty, low_stock_threshold, sales_status)",
  "CREATE TABLE IF NOT EXISTS variant_option_values (\n  variant_id INTEGER NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,\n  option_id INTEGER NOT NULL REFERENCES product_options(id) ON DELETE CASCADE,\n  option_value_id INTEGER NOT NULL REFERENCES product_option_values(id) ON DELETE CASCADE,\n  PRIMARY KEY (variant_id, option_id)\n)",
  "CREATE INDEX IF NOT EXISTS idx_variant_values_value\n  ON variant_option_values(option_value_id)",
  "CREATE TABLE IF NOT EXISTS product_stats (\n  product_id INTEGER PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,\n  view_count INTEGER NOT NULL DEFAULT 0,\n  like_count INTEGER NOT NULL DEFAULT 0,\n  cart_count INTEGER NOT NULL DEFAULT 0,\n  website_sold INTEGER NOT NULL DEFAULT 0,\n  whatsapp_sold INTEGER NOT NULL DEFAULT 0,\n  call_sold INTEGER NOT NULL DEFAULT 0,\n  offline_sold INTEGER NOT NULL DEFAULT 0,\n  manual_adjustment INTEGER NOT NULL DEFAULT 0,\n  updated_at INTEGER NOT NULL\n)",
  "CREATE TABLE IF NOT EXISTS product_likes (\n  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,\n  visitor_hash TEXT NOT NULL,\n  created_at INTEGER NOT NULL,\n  PRIMARY KEY (product_id, visitor_hash)\n)",
  "CREATE TABLE IF NOT EXISTS product_daily_views (\n  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,\n  day TEXT NOT NULL,\n  view_count INTEGER NOT NULL DEFAULT 0,\n  PRIMARY KEY (product_id, day)\n)",
  "CREATE TABLE IF NOT EXISTS product_cart_events (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,\n  page_session_id TEXT NOT NULL,\n  action_key TEXT NOT NULL,\n  visitor_hash TEXT NOT NULL DEFAULT '',\n  action_type TEXT NOT NULL,\n  detail TEXT NOT NULL DEFAULT '',\n  created_at INTEGER NOT NULL,\n  UNIQUE(product_id, page_session_id, action_key)\n)",
  "CREATE INDEX IF NOT EXISTS idx_cart_events_created\n  ON product_cart_events(created_at)",
  "CREATE TABLE IF NOT EXISTS inventory_movements (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  product_id INTEGER NOT NULL REFERENCES products(id),\n  variant_id INTEGER REFERENCES product_variants(id),\n  movement_type TEXT NOT NULL CHECK (movement_type IN (\n    'opening','stock_in','reserve','release','confirmed_sale',\n    'cancel_restore','return','correction','manual_sale'\n  )),\n  quantity INTEGER NOT NULL,\n  before_qty INTEGER,\n  after_qty INTEGER,\n  order_id TEXT,\n  source TEXT NOT NULL DEFAULT 'admin',\n  note TEXT NOT NULL DEFAULT '',\n  admin_ref TEXT NOT NULL DEFAULT '',\n  created_at INTEGER NOT NULL,\n  idempotency_key TEXT UNIQUE\n)",
  "CREATE INDEX IF NOT EXISTS idx_inventory_variant_time\n  ON inventory_movements(variant_id, created_at DESC)",
  "CREATE INDEX IF NOT EXISTS idx_inventory_product_time\n  ON inventory_movements(product_id, created_at DESC)",
  "CREATE TABLE IF NOT EXISTS sale_events (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  product_id INTEGER NOT NULL REFERENCES products(id),\n  variant_id INTEGER REFERENCES product_variants(id),\n  order_id TEXT,\n  source TEXT NOT NULL CHECK (source IN ('website','whatsapp','call','offline','adjustment','reversal')),\n  quantity INTEGER NOT NULL,\n  adjust_stock INTEGER NOT NULL DEFAULT 0 CHECK (adjust_stock IN (0,1)),\n  note TEXT NOT NULL DEFAULT '',\n  admin_ref TEXT NOT NULL DEFAULT '',\n  created_at INTEGER NOT NULL,\n  idempotency_key TEXT UNIQUE\n)",
  "CREATE INDEX IF NOT EXISTS idx_sale_events_product_time\n  ON sale_events(product_id, created_at DESC)",
  "CREATE TABLE IF NOT EXISTS commerce_orders (\n  id TEXT PRIMARY KEY,\n  channel TEXT NOT NULL DEFAULT 'website' CHECK (channel IN ('website','whatsapp')),\n  status TEXT NOT NULL DEFAULT 'pending',\n  customer_json TEXT NOT NULL,\n  payment_json TEXT NOT NULL,\n  totals_json TEXT NOT NULL,\n  coupon_code TEXT NOT NULL DEFAULT '',\n  created_at INTEGER NOT NULL,\n  updated_at INTEGER NOT NULL,\n  confirmed_at INTEGER,\n  sold_credit_at INTEGER,\n  sold_credited_at INTEGER,\n  cancel_deadline INTEGER,\n  cancel_reason TEXT,\n  idempotency_key TEXT UNIQUE\n)",
  "CREATE INDEX IF NOT EXISTS idx_commerce_orders_status\n  ON commerce_orders(status, created_at DESC)",
  "CREATE INDEX IF NOT EXISTS idx_commerce_orders_sold_due\n  ON commerce_orders(sold_credit_at, sold_credited_at, status)",
  "CREATE TABLE IF NOT EXISTS commerce_order_items (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  order_id TEXT NOT NULL REFERENCES commerce_orders(id) ON DELETE CASCADE,\n  product_id INTEGER NOT NULL REFERENCES products(id),\n  variant_id INTEGER REFERENCES product_variants(id),\n  product_name_snapshot TEXT NOT NULL,\n  sku_snapshot TEXT NOT NULL DEFAULT '',\n  options_json TEXT NOT NULL DEFAULT '[]',\n  unit_price REAL NOT NULL,\n  quantity INTEGER NOT NULL CHECK (quantity > 0),\n  line_total REAL NOT NULL,\n  sold_credited INTEGER NOT NULL DEFAULT 0 CHECK (sold_credited IN (0,1))\n)",
  "CREATE INDEX IF NOT EXISTS idx_order_items_order\n  ON commerce_order_items(order_id)",
  "CREATE INDEX IF NOT EXISTS idx_order_items_product\n  ON commerce_order_items(product_id)",
  "CREATE TABLE IF NOT EXISTS commerce_order_history (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  order_id TEXT NOT NULL REFERENCES commerce_orders(id) ON DELETE CASCADE,\n  status TEXT NOT NULL,\n  note TEXT NOT NULL DEFAULT '',\n  actor TEXT NOT NULL DEFAULT 'system',\n  created_at INTEGER NOT NULL\n)",
  "CREATE INDEX IF NOT EXISTS idx_order_history_order\n  ON commerce_order_history(order_id, created_at)",
  "CREATE TABLE IF NOT EXISTS gallery_items (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  url TEXT NOT NULL,\n  name_en TEXT NOT NULL DEFAULT 'KORA ROYAL Collection',\n  name_bn TEXT NOT NULL DEFAULT 'করা রয়্যাল কালেকশন',\n  sort_order INTEGER NOT NULL DEFAULT 100,\n  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),\n  created_at INTEGER NOT NULL,\n  updated_at INTEGER NOT NULL\n)",
  "CREATE INDEX IF NOT EXISTS idx_gallery_public\n  ON gallery_items(status, sort_order)",
  "CREATE TABLE IF NOT EXISTS app_settings (\n  setting_key TEXT PRIMARY KEY,\n  setting_value TEXT NOT NULL,\n  updated_at INTEGER NOT NULL\n)",
  "CREATE TABLE IF NOT EXISTS admin_audit_logs (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  action TEXT NOT NULL,\n  entity_type TEXT NOT NULL,\n  entity_id TEXT NOT NULL DEFAULT '',\n  detail_json TEXT NOT NULL DEFAULT '{}',\n  admin_ref TEXT NOT NULL DEFAULT '',\n  ip_hash TEXT NOT NULL DEFAULT '',\n  created_at INTEGER NOT NULL\n)",
  "CREATE INDEX IF NOT EXISTS idx_admin_audit_time\n  ON admin_audit_logs(created_at DESC)",
  "INSERT OR IGNORE INTO app_settings(setting_key, setting_value, updated_at)\nVALUES\n  ('catalog_version', '1', unixepoch() * 1000),\n  ('showcase_layout_mode', 'auto', unixepoch() * 1000),\n  ('showcase_max_per_row', '10', unixepoch() * 1000),\n  ('sold_delay_hours', '0', unixepoch() * 1000)"
];

const KR_MOBILE_SEED_STATEMENTS = [
  "INSERT OR IGNORE INTO products (id,slug,name_en,name_bn,sub_en,sub_bn,category,price,compare_price,description_en,description_bn,main_image_url,hero_image_url,hero_lines_en,hero_lines_bn,size_chart_json,status,sales_status,allow_backorder,priority,showcase_row,showcase_position,created_at,updated_at,archived_at) VALUES\n(1,'kora-signature','Kora Signature','করা সিগনেচার','Premium Shirt','প্রিমিয়াম শার্ট','Exclusive',999.0,0.0,'Premium KORA ROYAL apparel. Add your complete product description from the Inventory panel.','প্রিমিয়াম KORA ROYAL পণ্য। Inventory panel থেকে সম্পূর্ণ বিবরণ সম্পাদনা করুন।','https://res.cloudinary.com/dvvgofrhs/image/upload/v1779090280/Puma_gemini-3-pro-image-preview_nano-banana-pro__a_____SUPER_COMBINED_M_1_ykh6i2.webp','https://res.cloudinary.com/dvvgofrhs/image/upload/v1779260556/Puma_Firefly_ylasp7.webp','[{\"text\":\"Crafted For\",\"style\":\"light\"},{\"text\":\"BOLD\",\"style\":\"accent\"},{\"text\":\"Simplicity—\",\"style\":\"light\"}]','[{\"text\":\"তৈরি\",\"style\":\"light\"},{\"text\":\"সাহসী\",\"style\":\"accent\"},{\"text\":\"সরলতার জন্য—\",\"style\":\"light\"}]','{\"headers\":[\"Size\",\"Chest (inch)\",\"Length (inch)\",\"Shoulder (inch)\"],\"rows\":[[\"M\",\"40\",\"28\",\"17\"],[\"L\",\"42\",\"29\",\"18\"],[\"XL\",\"44\",\"30\",\"19\"]]}','active','available',1,1,NULL,NULL,1785337727000,1785337727000,NULL),\n(2,'kora-polo','Kora Polo','করা পোলো','Premium T-Shirt','প্রিমিয়াম টিশার্ট','Exclusive',699.0,0.0,'Premium KORA ROYAL apparel. Add your complete product description from the Inventory panel.','প্রিমিয়াম KORA ROYAL পণ্য। Inventory panel থেকে সম্পূর্ণ বিবরণ সম্পাদনা করুন।','https://res.cloudinary.com/dvvgofrhs/image/upload/v1779090288/Puma_Arena___Benchmark_Compare_the_Best_AI_Models_1771145677248_eximcx.webp','https://res.cloudinary.com/dvvgofrhs/image/upload/v1779260556/Puma_1779256219340-019e43ee-653f-75d1-8245-feb189cd5a34_gt2anj.webp','[{\"text\":\"Redefine\",\"style\":\"light\"},{\"text\":\"Your\",\"style\":\"light\"},{\"text\":\"Style—\",\"style\":\"accent\"}]','[{\"text\":\"নতুনভাবে\",\"style\":\"light\"},{\"text\":\"আপনার\",\"style\":\"light\"},{\"text\":\"স্টাইল—\",\"style\":\"accent\"}]','{\"headers\":[\"Size\",\"Chest (inch)\",\"Length (inch)\",\"Shoulder (inch)\"],\"rows\":[[\"M\",\"38\",\"26\",\"16\"],[\"L\",\"40\",\"27\",\"17\"],[\"XL\",\"42\",\"28\",\"18\"]]}','active','available',1,2,NULL,NULL,1785337727000,1785337727000,NULL),\n(3,'kora-pants','Kora Pants','করা পেন্ট','Export Quality Pant','এক্সপোর্ট কোয়ালিটি পেন্ট','Exclusive',1499.0,0.0,'Premium KORA ROYAL apparel. Add your complete product description from the Inventory panel.','প্রিমিয়াম KORA ROYAL পণ্য। Inventory panel থেকে সম্পূর্ণ বিবরণ সম্পাদনা করুন।','https://res.cloudinary.com/dvvgofrhs/image/upload/v1779090280/Puma_gemini-3-pro-image-preview_nano-banana-pro__a_____SUPER_COMBINED_M_jzbmi9.webp','https://res.cloudinary.com/dvvgofrhs/image/upload/v1779260556/Puma_1779259198114-019e441b-98d6-78e6-bce6-6dab15cb5d09_ml3zrm.webp','[{\"text\":\"Wear What\",\"style\":\"light\"},{\"text\":\"Feels\",\"style\":\"light\"},{\"text\":\"REAL—\",\"style\":\"accent\"}]','[{\"text\":\"পরুন যা\",\"style\":\"light\"},{\"text\":\"মনে হয়\",\"style\":\"light\"},{\"text\":\"আসল—\",\"style\":\"accent\"}]','{\"headers\":[\"Size (waist)\",\"Waist (inch)\",\"Hip (inch)\",\"Length (inch)\"],\"rows\":[[\"28\",\"28\",\"36\",\"40\"],[\"30\",\"30\",\"38\",\"40\"],[\"32\",\"32\",\"40\",\"41\"],[\"34\",\"34\",\"42\",\"41\"],[\"36\",\"36\",\"44\",\"42\"],[\"38\",\"38\",\"46\",\"42\"],[\"40\",\"40\",\"48\",\"43\"],[\"42\",\"42\",\"50\",\"43\"]]}','active','available',1,3,NULL,NULL,1785337727000,1785337727000,NULL)",
  "INSERT OR IGNORE INTO product_stats (product_id,view_count,like_count,cart_count,website_sold,whatsapp_sold,call_sold,offline_sold,manual_adjustment,updated_at) VALUES\n(1,0,0,0,0,0,0,0,0,1785337727000),\n(2,0,0,0,0,0,0,0,0,1785337727000),\n(3,0,0,0,0,0,0,0,0,1785337727000)",
  "INSERT OR IGNORE INTO product_options (id,product_id,code,label_en,label_bn,display_type,is_required,creates_variant,sort_order) VALUES\n(1,1,'size','Size','সাইজ','buttons',1,1,1),\n(2,1,'color','Color','রং','swatches',1,1,2),\n(3,2,'size','Size','সাইজ','buttons',1,1,1),\n(4,2,'color','Color','রং','swatches',1,1,2),\n(5,3,'size','Size','সাইজ','buttons',1,1,1),\n(6,3,'color','Color','রং','swatches',1,1,2)",
  "INSERT OR IGNORE INTO product_option_values (id,option_id,value_code,value_en,value_bn,color_hex,sort_order) VALUES\n(1,1,'m','M','M','',1),\n(2,1,'l','L','L','',2),\n(3,1,'xl','XL','XL','',3),\n(4,2,'black','Black','কালো','#121313',1),\n(5,2,'white','White','সাদা','#F5F5F5',2),\n(6,2,'gray','Gray','ধূসর','#808080',3),\n(7,2,'brown','Brown','বাদামি','#8B4513',4),\n(8,2,'olive','Olive','অলিভ','#6B7B3A',5),\n(9,2,'pink','Light Pink','হালকা গোলাপি','#F5B6C6',6),\n(10,2,'offwhite','Off White','অফ হোয়াইট','#FAF6F0',7),\n(11,2,'magenta','Light Dark Magenta','ম্যাজেন্টা','#A33668',8),\n(12,3,'m','M','M','',1),\n(13,3,'l','L','L','',2),\n(14,3,'xl','XL','XL','',3),\n(15,4,'black','Black','কালো','#121313',1),\n(16,4,'cream','Cream','ক্রিম','#EFE9D9',2),\n(17,4,'gray','Gray','ধূসর','#808080',3),\n(18,4,'brown','Brown','বাদামি','#8B4513',4),\n(19,4,'olive','Olive','অলিভ','#6B7B3A',5),\n(20,4,'magenta','Light Dark Magenta','ম্যাজেন্টা','#A33668',6),\n(21,5,'28','28','28','',1),\n(22,5,'30','30','30','',2),\n(23,5,'32','32','32','',3),\n(24,5,'34','34','34','',4),\n(25,5,'36','36','36','',5),\n(26,5,'38','38','38','',6),\n(27,5,'40','40','40','',7),\n(28,5,'42','42','42','',8),\n(29,6,'black','Black','কালো','#121313',1),\n(30,6,'white','White','সাদা','#F5F5F5',2),\n(31,6,'gray','Gray','ধূসর','#808080',3),\n(32,6,'brown','Brown','বাদামি','#8B4513',4),\n(33,6,'offwhite','Off White','অফ হোয়াইট','#FAF6F0',5),\n(34,6,'mixed','Light Dark Mixed','মিক্সড','#6F6670',6)",
  "INSERT OR IGNORE INTO product_variants (id,product_id,sku,title,stock_qty,reserved_qty,price_override,is_active,sales_status,low_stock_threshold,created_at,updated_at) VALUES\n(1,1,'KR-01-M-BLACK','M / Black',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(2,1,'KR-01-M-WHITE','M / White',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(3,1,'KR-01-M-GRAY','M / Gray',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(4,1,'KR-01-M-BROWN','M / Brown',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(5,1,'KR-01-M-OLIVE','M / Olive',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(6,1,'KR-01-M-PINK','M / Light Pink',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(7,1,'KR-01-M-OFFWHITE','M / Off White',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(8,1,'KR-01-M-MAGENTA','M / Light Dark Magenta',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(9,1,'KR-01-L-BLACK','L / Black',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(10,1,'KR-01-L-WHITE','L / White',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(11,1,'KR-01-L-GRAY','L / Gray',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(12,1,'KR-01-L-BROWN','L / Brown',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(13,1,'KR-01-L-OLIVE','L / Olive',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(14,1,'KR-01-L-PINK','L / Light Pink',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(15,1,'KR-01-L-OFFWHITE','L / Off White',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(16,1,'KR-01-L-MAGENTA','L / Light Dark Magenta',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(17,1,'KR-01-XL-BLACK','XL / Black',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(18,1,'KR-01-XL-WHITE','XL / White',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(19,1,'KR-01-XL-GRAY','XL / Gray',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(20,1,'KR-01-XL-BROWN','XL / Brown',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(21,1,'KR-01-XL-OLIVE','XL / Olive',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(22,1,'KR-01-XL-PINK','XL / Light Pink',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(23,1,'KR-01-XL-OFFWHITE','XL / Off White',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(24,1,'KR-01-XL-MAGENTA','XL / Light Dark Magenta',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(25,2,'KR-02-M-BLACK','M / Black',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(26,2,'KR-02-M-CREAM','M / Cream',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(27,2,'KR-02-M-GRAY','M / Gray',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(28,2,'KR-02-M-BROWN','M / Brown',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(29,2,'KR-02-M-OLIVE','M / Olive',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(30,2,'KR-02-M-MAGENTA','M / Light Dark Magenta',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(31,2,'KR-02-L-BLACK','L / Black',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(32,2,'KR-02-L-CREAM','L / Cream',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(33,2,'KR-02-L-GRAY','L / Gray',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(34,2,'KR-02-L-BROWN','L / Brown',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(35,2,'KR-02-L-OLIVE','L / Olive',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(36,2,'KR-02-L-MAGENTA','L / Light Dark Magenta',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(37,2,'KR-02-XL-BLACK','XL / Black',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(38,2,'KR-02-XL-CREAM','XL / Cream',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(39,2,'KR-02-XL-GRAY','XL / Gray',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(40,2,'KR-02-XL-BROWN','XL / Brown',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(41,2,'KR-02-XL-OLIVE','XL / Olive',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(42,2,'KR-02-XL-MAGENTA','XL / Light Dark Magenta',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(43,3,'KR-03-28-BLACK','28 / Black',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(44,3,'KR-03-28-WHITE','28 / White',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(45,3,'KR-03-28-GRAY','28 / Gray',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(46,3,'KR-03-28-BROWN','28 / Brown',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(47,3,'KR-03-28-OFFWHITE','28 / Off White',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(48,3,'KR-03-28-MIXED','28 / Light Dark Mixed',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(49,3,'KR-03-30-BLACK','30 / Black',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(50,3,'KR-03-30-WHITE','30 / White',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(51,3,'KR-03-30-GRAY','30 / Gray',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(52,3,'KR-03-30-BROWN','30 / Brown',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(53,3,'KR-03-30-OFFWHITE','30 / Off White',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(54,3,'KR-03-30-MIXED','30 / Light Dark Mixed',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(55,3,'KR-03-32-BLACK','32 / Black',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(56,3,'KR-03-32-WHITE','32 / White',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(57,3,'KR-03-32-GRAY','32 / Gray',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(58,3,'KR-03-32-BROWN','32 / Brown',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(59,3,'KR-03-32-OFFWHITE','32 / Off White',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(60,3,'KR-03-32-MIXED','32 / Light Dark Mixed',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(61,3,'KR-03-34-BLACK','34 / Black',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(62,3,'KR-03-34-WHITE','34 / White',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(63,3,'KR-03-34-GRAY','34 / Gray',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(64,3,'KR-03-34-BROWN','34 / Brown',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(65,3,'KR-03-34-OFFWHITE','34 / Off White',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(66,3,'KR-03-34-MIXED','34 / Light Dark Mixed',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(67,3,'KR-03-36-BLACK','36 / Black',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(68,3,'KR-03-36-WHITE','36 / White',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(69,3,'KR-03-36-GRAY','36 / Gray',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(70,3,'KR-03-36-BROWN','36 / Brown',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(71,3,'KR-03-36-OFFWHITE','36 / Off White',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(72,3,'KR-03-36-MIXED','36 / Light Dark Mixed',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(73,3,'KR-03-38-BLACK','38 / Black',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(74,3,'KR-03-38-WHITE','38 / White',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(75,3,'KR-03-38-GRAY','38 / Gray',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(76,3,'KR-03-38-BROWN','38 / Brown',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(77,3,'KR-03-38-OFFWHITE','38 / Off White',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(78,3,'KR-03-38-MIXED','38 / Light Dark Mixed',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(79,3,'KR-03-40-BLACK','40 / Black',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(80,3,'KR-03-40-WHITE','40 / White',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(81,3,'KR-03-40-GRAY','40 / Gray',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(82,3,'KR-03-40-BROWN','40 / Brown',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(83,3,'KR-03-40-OFFWHITE','40 / Off White',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(84,3,'KR-03-40-MIXED','40 / Light Dark Mixed',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(85,3,'KR-03-42-BLACK','42 / Black',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(86,3,'KR-03-42-WHITE','42 / White',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(87,3,'KR-03-42-GRAY','42 / Gray',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(88,3,'KR-03-42-BROWN','42 / Brown',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(89,3,'KR-03-42-OFFWHITE','42 / Off White',0,0,NULL,1,'available',5,1785337727000,1785337727000),\n(90,3,'KR-03-42-MIXED','42 / Light Dark Mixed',0,0,NULL,1,'available',5,1785337727000,1785337727000)",
  "INSERT OR IGNORE INTO variant_option_values (variant_id,option_id,option_value_id) VALUES\n(1,1,1),\n(1,2,4),\n(2,1,1),\n(2,2,5),\n(3,1,1),\n(3,2,6),\n(4,1,1),\n(4,2,7),\n(5,1,1),\n(5,2,8),\n(6,1,1),\n(6,2,9),\n(7,1,1),\n(7,2,10),\n(8,1,1),\n(8,2,11),\n(9,1,2),\n(9,2,4),\n(10,1,2),\n(10,2,5),\n(11,1,2),\n(11,2,6),\n(12,1,2),\n(12,2,7),\n(13,1,2),\n(13,2,8),\n(14,1,2),\n(14,2,9),\n(15,1,2),\n(15,2,10),\n(16,1,2),\n(16,2,11),\n(17,1,3),\n(17,2,4),\n(18,1,3),\n(18,2,5),\n(19,1,3),\n(19,2,6),\n(20,1,3),\n(20,2,7),\n(21,1,3),\n(21,2,8),\n(22,1,3),\n(22,2,9),\n(23,1,3),\n(23,2,10),\n(24,1,3),\n(24,2,11),\n(25,3,12),\n(25,4,15),\n(26,3,12),\n(26,4,16),\n(27,3,12),\n(27,4,17),\n(28,3,12),\n(28,4,18),\n(29,3,12),\n(29,4,19),\n(30,3,12),\n(30,4,20),\n(31,3,13),\n(31,4,15),\n(32,3,13),\n(32,4,16),\n(33,3,13),\n(33,4,17),\n(34,3,13),\n(34,4,18),\n(35,3,13),\n(35,4,19),\n(36,3,13),\n(36,4,20),\n(37,3,14),\n(37,4,15),\n(38,3,14),\n(38,4,16),\n(39,3,14),\n(39,4,17),\n(40,3,14),\n(40,4,18),\n(41,3,14),\n(41,4,19),\n(42,3,14),\n(42,4,20),\n(43,5,21),\n(43,6,29),\n(44,5,21),\n(44,6,30),\n(45,5,21),\n(45,6,31),\n(46,5,21),\n(46,6,32),\n(47,5,21),\n(47,6,33),\n(48,5,21),\n(48,6,34),\n(49,5,22),\n(49,6,29),\n(50,5,22),\n(50,6,30),\n(51,5,22),\n(51,6,31),\n(52,5,22),\n(52,6,32),\n(53,5,22),\n(53,6,33),\n(54,5,22),\n(54,6,34),\n(55,5,23),\n(55,6,29),\n(56,5,23),\n(56,6,30),\n(57,5,23),\n(57,6,31),\n(58,5,23),\n(58,6,32),\n(59,5,23),\n(59,6,33),\n(60,5,23),\n(60,6,34),\n(61,5,24),\n(61,6,29),\n(62,5,24),\n(62,6,30),\n(63,5,24),\n(63,6,31),\n(64,5,24),\n(64,6,32),\n(65,5,24),\n(65,6,33),\n(66,5,24),\n(66,6,34),\n(67,5,25),\n(67,6,29),\n(68,5,25),\n(68,6,30),\n(69,5,25),\n(69,6,31),\n(70,5,25),\n(70,6,32),\n(71,5,25),\n(71,6,33),\n(72,5,25),\n(72,6,34),\n(73,5,26),\n(73,6,29),\n(74,5,26),\n(74,6,30),\n(75,5,26),\n(75,6,31),\n(76,5,26),\n(76,6,32),\n(77,5,26),\n(77,6,33),\n(78,5,26),\n(78,6,34),\n(79,5,27),\n(79,6,29),\n(80,5,27),\n(80,6,30),\n(81,5,27),\n(81,6,31),\n(82,5,27),\n(82,6,32),\n(83,5,27),\n(83,6,33),\n(84,5,27),\n(84,6,34),\n(85,5,28),\n(85,6,29),\n(86,5,28),\n(86,6,30),\n(87,5,28),\n(87,6,31),\n(88,5,28),\n(88,6,32),\n(89,5,28),\n(89,6,33),\n(90,5,28),\n(90,6,34)"
];

const KR_PHASE3A_MIGRATION_STATEMENTS = [
  "CREATE TABLE IF NOT EXISTS hero_slides (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  internal_name TEXT NOT NULL DEFAULT '',\n  image_url TEXT NOT NULL,\n  line1_en TEXT NOT NULL DEFAULT '',\n  line2_en TEXT NOT NULL DEFAULT '',\n  line3_en TEXT NOT NULL DEFAULT '',\n  line1_bn TEXT NOT NULL DEFAULT '',\n  line2_bn TEXT NOT NULL DEFAULT '',\n  line3_bn TEXT NOT NULL DEFAULT '',\n  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),\n  priority INTEGER NOT NULL DEFAULT 100,\n  created_at INTEGER NOT NULL,\n  updated_at INTEGER NOT NULL\n)",
  "CREATE INDEX IF NOT EXISTS idx_hero_slides_public\n  ON hero_slides(status, priority, id)",
  "CREATE TABLE IF NOT EXISTS product_view_windows (\n  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,\n  visitor_hash TEXT NOT NULL,\n  last_counted_at INTEGER NOT NULL,\n  PRIMARY KEY (product_id, visitor_hash)\n)",
  "CREATE INDEX IF NOT EXISTS idx_product_view_windows_time\n  ON product_view_windows(last_counted_at)",
  "CREATE TABLE IF NOT EXISTS product_cart_windows (\n  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,\n  visitor_hash TEXT NOT NULL,\n  last_counted_at INTEGER NOT NULL,\n  PRIMARY KEY (product_id, visitor_hash)\n)",
  "CREATE INDEX IF NOT EXISTS idx_product_cart_windows_time\n  ON product_cart_windows(last_counted_at)",
  "INSERT OR IGNORE INTO hero_slides\n(id,internal_name,image_url,line1_en,line2_en,line3_en,line1_bn,line2_bn,line3_bn,status,priority,created_at,updated_at)\nVALUES\n(1,'Original Hero 1','https://res.cloudinary.com/dvvgofrhs/image/upload/v1779260556/Puma_Firefly_ylasp7.webp','Crafted For','BOLD','Simplicity—','তৈরি','সাহসী','সরলতার জন্য—','active',1,unixepoch()*1000,unixepoch()*1000),\n(2,'Original Hero 2','https://res.cloudinary.com/dvvgofrhs/image/upload/v1779260556/Puma_1779256219340-019e43ee-653f-75d1-8245-feb189cd5a34_gt2anj.webp','Redefine','Your','Style—','নতুনভাবে','আপনার','স্টাইল—','active',2,unixepoch()*1000,unixepoch()*1000),\n(3,'Original Hero 3','https://res.cloudinary.com/dvvgofrhs/image/upload/v1779260556/Puma_1779259198114-019e441b-98d6-78e6-bce6-6dab15cb5d09_ml3zrm.webp','Wear What','Feels','REAL—','পরুন যা','মনে হয়','আসল—','active',3,unixepoch()*1000,unixepoch()*1000)",
  "UPDATE product_stats\nSET view_count=0,cart_count=0,updated_at=unixepoch()*1000\nWHERE NOT EXISTS(SELECT 1 FROM app_settings WHERE setting_key='phase3a_migrated')",
  "DELETE FROM product_daily_views\nWHERE NOT EXISTS(SELECT 1 FROM app_settings WHERE setting_key='phase3a_migrated')",
  "DELETE FROM product_cart_events\nWHERE NOT EXISTS(SELECT 1 FROM app_settings WHERE setting_key='phase3a_migrated')",
  "INSERT INTO app_settings(setting_key,setting_value,updated_at)\nVALUES('phase3a_migrated','1',unixepoch()*1000)\nON CONFLICT(setting_key) DO UPDATE SET setting_value='1',updated_at=excluded.updated_at"
];

const KR_PHASE3B_MIGRATION_STATEMENTS = [
  "CREATE TABLE IF NOT EXISTS size_chart_templates (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  internal_name TEXT NOT NULL,\n  title_en TEXT NOT NULL DEFAULT '',\n  title_bn TEXT NOT NULL DEFAULT '',\n  description_en TEXT NOT NULL DEFAULT '',\n  description_bn TEXT NOT NULL DEFAULT '',\n  grid_json TEXT NOT NULL DEFAULT '{\"cells\":[]}',\n  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),\n  priority INTEGER NOT NULL DEFAULT 100,\n  created_at INTEGER NOT NULL,\n  updated_at INTEGER NOT NULL\n)",
  "CREATE INDEX IF NOT EXISTS idx_size_chart_templates_public\n  ON size_chart_templates(status,priority,id)",
  "CREATE TABLE IF NOT EXISTS product_size_chart_assignments (\n  product_id INTEGER PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,\n  template_id INTEGER NOT NULL REFERENCES size_chart_templates(id) ON DELETE RESTRICT,\n  updated_at INTEGER NOT NULL\n)",
  "CREATE INDEX IF NOT EXISTS idx_size_chart_assignments_template\n  ON product_size_chart_assignments(template_id)",
  "CREATE TABLE IF NOT EXISTS inventory_bulk_jobs (\n  id TEXT PRIMARY KEY,\n  variant_count INTEGER NOT NULL,\n  quantity_delta INTEGER NOT NULL,\n  note TEXT NOT NULL DEFAULT '',\n  created_at INTEGER NOT NULL\n)",
  "INSERT OR IGNORE INTO size_chart_templates\n(id,internal_name,title_en,title_bn,description_en,description_bn,grid_json,status,priority,created_at,updated_at)\nSELECT id,\n       name_en || ' Size Chart',\n       name_en || ' — Size Chart',\n       CASE WHEN name_bn<>'' THEN name_bn || ' — সাইজ চার্ট' ELSE 'সাইজ চার্ট' END,\n       'All measurements are shown in the table below.',\n       'সব পরিমাপ নিচের টেবিলে দেওয়া আছে।',\n       size_chart_json,\n       'active',\n       priority,\n       unixepoch()*1000,\n       unixepoch()*1000\nFROM products\nWHERE size_chart_json IS NOT NULL\n  AND size_chart_json NOT IN ('','{}','{\"headers\":[],\"rows\":[]}')",
  "INSERT OR IGNORE INTO product_size_chart_assignments(product_id,template_id,updated_at)\nSELECT p.id,p.id,unixepoch()*1000\nFROM products p\nJOIN size_chart_templates t ON t.id=p.id\nWHERE p.size_chart_json IS NOT NULL\n  AND p.size_chart_json NOT IN ('','{}','{\"headers\":[],\"rows\":[]}')",
  "INSERT INTO app_settings(setting_key,setting_value,updated_at)\nVALUES('phase3b_migrated','1',unixepoch()*1000)\nON CONFLICT(setting_key) DO UPDATE SET setting_value='1',updated_at=excluded.updated_at"
];


/* Size-chart SVG diagrams — optional one-to-one diagram for each reusable template. */
const KR_SIZE_DIAGRAM_MIGRATION_STATEMENTS = [
  "CREATE TABLE IF NOT EXISTS size_chart_diagrams (\n  template_id INTEGER PRIMARY KEY REFERENCES size_chart_templates(id) ON DELETE CASCADE,\n  svg_code TEXT NOT NULL,\n  alt_en TEXT NOT NULL DEFAULT '',\n  alt_bn TEXT NOT NULL DEFAULT '',\n  view_box TEXT NOT NULL DEFAULT '0 0 1200 675',\n  aspect_ratio TEXT NOT NULL DEFAULT '16/9',\n  position TEXT NOT NULL DEFAULT 'before_table' CHECK(position IN ('before_table','after_table')),\n  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),\n  content_hash TEXT NOT NULL DEFAULT '',\n  updated_at INTEGER NOT NULL\n)",
  "CREATE INDEX IF NOT EXISTS idx_size_chart_diagrams_enabled ON size_chart_diagrams(enabled,updated_at)"
];


const KR_PATHAO_MIGRATION_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS courier_shipments (
    order_id TEXT PRIMARY KEY,
    provider TEXT DEFAULT 'pathao',
    consignment_id TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    delivery_fee REAL DEFAULT 0,
    collect_amount REAL DEFAULT 0,
    raw_last_event TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_courier_shipments_consignment ON courier_shipments(consignment_id)`,
  `INSERT OR IGNORE INTO app_settings(setting_key,setting_value,updated_at) VALUES
   ('pathao_enabled','0',unixepoch()*1000),
   ('pathao_mode','sandbox',unixepoch()*1000),
   ('pathao_default_weight','0.5',unixepoch()*1000),
   ('pathao_default_item_type','2',unixepoch()*1000),
   ('pathao_default_delivery_type','48',unixepoch()*1000),
   ('pathao_sender_name','Kora Royal',unixepoch()*1000),
   ('pathao_sender_phone','01935158745',unixepoch()*1000),
   ('pathao_store_id','',unixepoch()*1000),
   ('pathao_default_quantity','1',unixepoch()*1000),
   ('pathao_amount_source','cod_remaining',unixepoch()*1000),
   ('pathao_instruction_template','আমাদের সম্মানিত গ্রাহক "{NAME}" স্যার/ম্যাম-এর পার্সেলটি খুব যত্নসহকারে পৌঁছে দিবেন। আর, উনি যদি পার্সেল রিটার্ন করেন, তাহলে {RETURN_CHARGE} টাকা ডেলিভারি চার্জ নেওয়ার চেষ্টা করবেন। ধন্যবাদ। 𖹭',unixepoch()*1000),
   ('pathao_item_desc_sku','1',unixepoch()*1000),
   ('pathao_item_desc_price','1',unixepoch()*1000),
   ('pathao_item_desc_qty','1',unixepoch()*1000),
   ('pathao_item_desc_fallback','Clothing',unixepoch()*1000),
   ('pathao_webhook_secret','',unixepoch()*1000),
   ('pathao_migrated','1',unixepoch()*1000)`
];

const KR_OPERATIONS_MIGRATION_STATEMENTS = [
  "CREATE TABLE IF NOT EXISTS customers (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  primary_phone TEXT NOT NULL UNIQUE,\n  display_name TEXT NOT NULL DEFAULT '',\n  email TEXT NOT NULL DEFAULT '',\n  district TEXT NOT NULL DEFAULT '',\n  communication_preference TEXT NOT NULL DEFAULT 'unknown',\n  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived','blocked')),\n  tags_json TEXT NOT NULL DEFAULT '[]',\n  follow_up_at INTEGER,\n  created_at INTEGER NOT NULL,\n  updated_at INTEGER NOT NULL\n)",
  "CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(display_name)",
  "CREATE INDEX IF NOT EXISTS idx_customers_district ON customers(district)",
  "CREATE INDEX IF NOT EXISTS idx_customers_followup ON customers(follow_up_at)",
  "CREATE TABLE IF NOT EXISTS customer_phones (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,\n  phone TEXT NOT NULL UNIQUE,\n  label TEXT NOT NULL DEFAULT 'Primary',\n  is_primary INTEGER NOT NULL DEFAULT 0 CHECK(is_primary IN (0,1)),\n  created_at INTEGER NOT NULL\n)",
  "CREATE INDEX IF NOT EXISTS idx_customer_phones_customer ON customer_phones(customer_id)",
  "CREATE TABLE IF NOT EXISTS customer_addresses (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,\n  district TEXT NOT NULL DEFAULT '',\n  thana TEXT NOT NULL DEFAULT '',\n  address TEXT NOT NULL,\n  label TEXT NOT NULL DEFAULT '',\n  last_used_at INTEGER,\n  created_at INTEGER NOT NULL,\n  UNIQUE(customer_id,district,thana,address)\n)",
  "CREATE INDEX IF NOT EXISTS idx_customer_addresses_customer ON customer_addresses(customer_id)",
  "CREATE TABLE IF NOT EXISTS customer_notes (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,\n  note TEXT NOT NULL,\n  note_type TEXT NOT NULL DEFAULT 'general',\n  admin_ref TEXT NOT NULL DEFAULT 'admin',\n  created_at INTEGER NOT NULL,\n  updated_at INTEGER NOT NULL\n)",
  "CREATE INDEX IF NOT EXISTS idx_customer_notes_customer ON customer_notes(customer_id,created_at DESC)",
  "CREATE TABLE IF NOT EXISTS customer_interactions (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,\n  channel TEXT NOT NULL DEFAULT 'note',\n  outcome TEXT NOT NULL DEFAULT '',\n  detail TEXT NOT NULL DEFAULT '',\n  follow_up_at INTEGER,\n  admin_ref TEXT NOT NULL DEFAULT 'admin',\n  created_at INTEGER NOT NULL\n)",
  "CREATE INDEX IF NOT EXISTS idx_customer_interactions_customer ON customer_interactions(customer_id,created_at DESC)",
  "CREATE TABLE IF NOT EXISTS order_customer_links (\n  order_id TEXT PRIMARY KEY REFERENCES commerce_orders(id) ON DELETE CASCADE,\n  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,\n  created_at INTEGER NOT NULL\n)",
  "CREATE INDEX IF NOT EXISTS idx_order_customer_links_customer ON order_customer_links(customer_id)",
  "CREATE TABLE IF NOT EXISTS leads (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  visitor_id TEXT NOT NULL UNIQUE,\n  linked_customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,\n  name TEXT NOT NULL DEFAULT '',\n  phone TEXT NOT NULL DEFAULT '',\n  email TEXT NOT NULL DEFAULT '',\n  district TEXT NOT NULL DEFAULT '',\n  address TEXT NOT NULL DEFAULT '',\n  stage TEXT NOT NULL DEFAULT 'landing',\n  source TEXT NOT NULL DEFAULT '',\n  campaign TEXT NOT NULL DEFAULT '',\n  product_views_json TEXT NOT NULL DEFAULT '[]',\n  cart_json TEXT NOT NULL DEFAULT '[]',\n  form_json TEXT NOT NULL DEFAULT '{}',\n  notes TEXT NOT NULL DEFAULT '',\n  first_seen_at INTEGER NOT NULL,\n  last_seen_at INTEGER NOT NULL\n)",
  "CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone)",
  "CREATE INDEX IF NOT EXISTS idx_leads_stage ON leads(stage,last_seen_at DESC)",
  "CREATE TABLE IF NOT EXISTS lead_events (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,\n  event_type TEXT NOT NULL,\n  detail_json TEXT NOT NULL DEFAULT '{}',\n  created_at INTEGER NOT NULL\n)",
  "CREATE INDEX IF NOT EXISTS idx_lead_events_lead ON lead_events(lead_id,created_at DESC)",
  "CREATE TABLE IF NOT EXISTS order_service_requests (\n  id TEXT PRIMARY KEY,\n  order_id TEXT NOT NULL REFERENCES commerce_orders(id) ON DELETE CASCADE,\n  request_type TEXT NOT NULL CHECK(request_type IN ('return','refund','exchange')),\n  reason TEXT NOT NULL,\n  customer_note TEXT NOT NULL DEFAULT '',\n  items_json TEXT NOT NULL DEFAULT '[]',\n  status TEXT NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','reviewing','approved','rejected','received','completed','cancelled')),\n  resolution_json TEXT NOT NULL DEFAULT '{}',\n  resolution_applied_at INTEGER,\n  customer_phone_hash TEXT NOT NULL DEFAULT '',\n  created_at INTEGER NOT NULL,\n  updated_at INTEGER NOT NULL,\n  idempotency_key TEXT NOT NULL UNIQUE\n)",
  "CREATE INDEX IF NOT EXISTS idx_service_requests_order ON order_service_requests(order_id,created_at DESC)",
  "CREATE INDEX IF NOT EXISTS idx_service_requests_status ON order_service_requests(status,created_at DESC)",
  "CREATE TABLE IF NOT EXISTS order_service_request_history (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  request_id TEXT NOT NULL REFERENCES order_service_requests(id) ON DELETE CASCADE,\n  status TEXT NOT NULL,\n  note TEXT NOT NULL DEFAULT '',\n  actor TEXT NOT NULL DEFAULT 'system',\n  created_at INTEGER NOT NULL\n)",
  "CREATE INDEX IF NOT EXISTS idx_request_history_request ON order_service_request_history(request_id,created_at)",
  "CREATE TABLE IF NOT EXISTS order_financial_adjustments (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  order_id TEXT NOT NULL REFERENCES commerce_orders(id) ON DELETE CASCADE,\n  request_id TEXT REFERENCES order_service_requests(id) ON DELETE SET NULL,\n  adjustment_type TEXT NOT NULL CHECK(adjustment_type IN ('refund','return','exchange_fee','manual')),\n  amount REAL NOT NULL,\n  note TEXT NOT NULL DEFAULT '',\n  created_at INTEGER NOT NULL,\n  idempotency_key TEXT NOT NULL UNIQUE\n)",
  "CREATE INDEX IF NOT EXISTS idx_financial_adjustments_order ON order_financial_adjustments(order_id)",
  "CREATE TABLE IF NOT EXISTS legacy_customer_orders (\n  order_id TEXT PRIMARY KEY,\n  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,\n  status TEXT NOT NULL DEFAULT '',\n  total REAL NOT NULL DEFAULT 0,\n  district TEXT NOT NULL DEFAULT '',\n  products TEXT NOT NULL DEFAULT '',\n  created_at INTEGER NOT NULL\n)",
  "CREATE INDEX IF NOT EXISTS idx_legacy_customer_orders_customer ON legacy_customer_orders(customer_id)",
  "INSERT OR IGNORE INTO app_settings(setting_key,setting_value,updated_at) VALUES\n('return_request_days','7',unixepoch()*1000),\n('refund_request_days','7',unixepoch()*1000),\n('exchange_request_days','7',unixepoch()*1000),\n('operations_update_migrated','1',unixepoch()*1000)",
  "INSERT OR IGNORE INTO customers(primary_phone,display_name,email,district,created_at,updated_at)\nSELECT DISTINCT\n  CASE\n    WHEN json_extract(customer_json,'$.phone') LIKE '+880%' THEN '0'||substr(json_extract(customer_json,'$.phone'),5)\n    WHEN json_extract(customer_json,'$.phone') LIKE '880%' THEN '0'||substr(json_extract(customer_json,'$.phone'),4)\n    WHEN json_extract(customer_json,'$.phone') LIKE '00880%' THEN '0'||substr(json_extract(customer_json,'$.phone'),6)\n    ELSE json_extract(customer_json,'$.phone')\n  END,\n  COALESCE(json_extract(customer_json,'$.name'),''),\n  COALESCE(json_extract(customer_json,'$.email'),''),\n  COALESCE(json_extract(customer_json,'$.district'),''),\n  created_at,updated_at\nFROM commerce_orders\nWHERE json_extract(customer_json,'$.phone') IS NOT NULL\n  AND json_extract(customer_json,'$.phone')<>''",
  "INSERT OR IGNORE INTO customer_phones(customer_id,phone,label,is_primary,created_at)\nSELECT c.id,c.primary_phone,'Primary',1,c.created_at FROM customers c",
  "INSERT OR IGNORE INTO order_customer_links(order_id,customer_id,created_at)\nSELECT o.id,c.id,o.created_at\nFROM commerce_orders o\nJOIN customers c ON c.primary_phone=(CASE\n  WHEN json_extract(o.customer_json,'$.phone') LIKE '+880%' THEN '0'||substr(json_extract(o.customer_json,'$.phone'),5)\n  WHEN json_extract(o.customer_json,'$.phone') LIKE '880%' THEN '0'||substr(json_extract(o.customer_json,'$.phone'),4)\n  WHEN json_extract(o.customer_json,'$.phone') LIKE '00880%' THEN '0'||substr(json_extract(o.customer_json,'$.phone'),6)\n  ELSE json_extract(o.customer_json,'$.phone') END)",
  "INSERT OR IGNORE INTO customer_addresses(customer_id,district,thana,address,label,last_used_at,created_at)\nSELECT c.id,\n  COALESCE(json_extract(o.customer_json,'$.district'),''),\n  COALESCE(json_extract(o.customer_json,'$.thana'),''),\n  json_extract(o.customer_json,'$.address'),\n  'Order address',o.created_at,o.created_at\nFROM commerce_orders o\nJOIN order_customer_links l ON l.order_id=o.id\nJOIN customers c ON c.id=l.customer_id\nWHERE json_extract(o.customer_json,'$.address') IS NOT NULL\n  AND json_extract(o.customer_json,'$.address')<>''"
];


/* ================================================================
   COUPON SYSTEM (D1-backed, admin-managed) — migration
   Types: percent | fixed | free_delivery | bogo
   Rules: validity window, global usage limit (1 = OTP-style one-time),
   per-customer usage limit, min shopping amount, percent cap
   (e.g. 50% up to ৳80), apply-base (products subtotal vs after-delivery total)
   ================================================================ */
const KR_COUPON_MIGRATION_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS coupons (
    code TEXT PRIMARY KEY,
    type TEXT NOT NULL DEFAULT 'percent' CHECK(type IN ('percent','fixed','free_delivery','bogo')),
    value REAL NOT NULL DEFAULT 0,
    max_discount REAL NOT NULL DEFAULT 0,
    min_subtotal REAL NOT NULL DEFAULT 0,
    apply_base TEXT NOT NULL DEFAULT 'subtotal' CHECK(apply_base IN ('subtotal','total')),
    bogo_buy INTEGER NOT NULL DEFAULT 1,
    bogo_get INTEGER NOT NULL DEFAULT 1,
    starts_at INTEGER NOT NULL DEFAULT 0,
    ends_at INTEGER NOT NULL DEFAULT 0,
    usage_limit_total INTEGER NOT NULL DEFAULT 0,
    usage_limit_per_customer INTEGER NOT NULL DEFAULT 0,
    used_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','disabled')),
    note TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS coupon_redemptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    coupon_code TEXT NOT NULL REFERENCES coupons(code) ON DELETE CASCADE,
    order_id TEXT NOT NULL UNIQUE,
    customer_phone TEXT NOT NULL DEFAULT '',
    discount_amount REAL NOT NULL DEFAULT 0,
    free_delivery INTEGER NOT NULL DEFAULT 0 CHECK(free_delivery IN (0,1)),
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_code ON coupon_redemptions(coupon_code, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_phone ON coupon_redemptions(coupon_code, customer_phone)`,
  `INSERT OR IGNORE INTO coupons(code,type,value,max_discount,min_subtotal,apply_base,bogo_buy,bogo_get,starts_at,ends_at,usage_limit_total,usage_limit_per_customer,used_count,status,note,created_at,updated_at) VALUES
   ('KORA10','percent',10,0,0,'subtotal',1,1,0,0,0,0,0,'active','Migrated from legacy hardcoded coupon',unixepoch()*1000,unixepoch()*1000),
   ('APNALOK20','percent',20,0,0,'subtotal',1,1,0,0,0,0,0,'active','Migrated from legacy hardcoded coupon',unixepoch()*1000,unixepoch()*1000)`,
  `INSERT OR IGNORE INTO app_settings(setting_key,setting_value,updated_at) VALUES('coupons_migrated','1',unixepoch()*1000)`
];

/* ================================================================
   PATHAO COURIER INTEGRATION HELPERS
   ================================================================ */
async function getPathaoAccessToken(env) {
  const modeRow = await env.DB.prepare("SELECT setting_value FROM app_settings WHERE setting_key='pathao_mode'").first();
  const isLive = modeRow?.setting_value === 'live';
  /* Cache key is MODE-SPECIFIC so a sandbox token is never reused on the live
     endpoint (and vice-versa). */
  const cacheKey = isLive ? 'pathao_access_token_live' : 'pathao_access_token_sandbox';

  if (env.KR_ORDERS) {
    const cached = await env.KR_ORDERS.get(cacheKey);
    if (cached) return cached;
  }

  const clientId = env.PATHAO_CLIENT_ID;
  const clientSecret = env.PATHAO_CLIENT_SECRET;
  const username = env.PATHAO_USERNAME;
  const password = env.PATHAO_PASSWORD;

  if (!clientId || !clientSecret || !username || !password) {
    throw new Error('Pathao API credentials are not set in Worker Environment Secrets');
  }

  const baseUrl = isLive ? 'https://api-hermes.pathao.com' : 'https://courier-api-sandbox.pathao.com';

  const res = await fetch(`${baseUrl}/aladdin/api/v1/issue-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      username: username,
      password: password,
      grant_type: 'password'
    })
  });

  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(`[Pathao ${isLive?'LIVE':'SANDBOX'}] Token failed (${res.status}): ${data.message || data.detail || res.statusText}`);
  }

  const token = data.access_token;
  const expiresSec = Number(data.expires_in) || 3600;

  if (env.KR_ORDERS) {
    await env.KR_ORDERS.put(cacheKey, token, { expirationTtl: Math.max(60, expiresSec - 60) });
  }

  return token;
}

async function pathaoRequest(endpoint, method, body, env) {
  const modeRow = await env.DB.prepare("SELECT setting_value FROM app_settings WHERE setting_key='pathao_mode'").first();
  const isLive = modeRow?.setting_value === 'live';
  const baseUrl = isLive ? 'https://api-hermes.pathao.com' : 'https://courier-api-sandbox.pathao.com';

  const token = await getPathaoAccessToken(env);
  const options = {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    }
  };
  if (body) {
    options.body = JSON.stringify(body);
  }

  const res = await fetch(`${baseUrl}${endpoint}`, options);
  const text = await res.text();
  let json = {};
  try { json = text ? JSON.parse(text) : {}; } catch (e) { json = { message: text }; }
  if (!res.ok) {
    const code = json.code || '';
    throw new Error(`[Pathao ${isLive?'LIVE':'SANDBOX'} ${endpoint}] (${res.status}) ${json.message || json.detail || res.statusText}${code?' | code:'+code:''}`);
  }
  return json;
}

/* Pathao বিভিন্ন list-response shape নর্মালাইজ করে plain array বানায়
   ({data:[...]}, {data:{data:[...]}} দুটোই সাপোর্ট) — ভুল shape এলে আর
   চুপচাপ খালি/object ফেরত যায় না। */
function pathaoList(data) {
  const d = data?.data;
  if (Array.isArray(d)) return d;
  if (Array.isArray(d?.data)) return d.data;
  return [];
}

/* City/Zone/Area লিস্ট প্রায়-স্ট্যাটিক — ২৪ ঘণ্টা KV cache:
   ① অ্যাডমিন মোডাল ~৫-১০x দ্রুত খোলে  ② Pathao API নামলেও পুরনো cache
   থেকে কাজ চলে (stale flag সহ) */
async function pathaoCachedList(env, cacheKey, endpoint) {
  if (env.KR_ORDERS) {
    try {
      const cached = await env.KR_ORDERS.get(cacheKey);
      if (cached) {
        const p = JSON.parse(cached);
        if (Array.isArray(p?.items) && p.items.length) return { items: p.items, cached: true };
      }
    } catch (_) { /* cache read fail → fresh fetch */ }
  }
  const data = await pathaoRequest(endpoint, 'GET', null, env);
  const items = pathaoList(data);
  if (!items.length) {
    throw new Error(`Pathao returned an empty/unexpected list (${endpoint}). Check mode (sandbox/live) & credentials.`);
  }
  if (env.KR_ORDERS) {
    try { await env.KR_ORDERS.put(cacheKey, JSON.stringify({ items, at: Date.now() }), { expirationTtl: 86400 }); } catch (_) {}
  }
  return { items, cached: false };
}

/* ================================================================
   PATHOO AUTO-BOOKING HELPER
   When an order is marked confirmed/packing/packed and Pathao is
   enabled, this books the parcel automatically (if not already).
   ================================================================ */
/* Courier প্যানেলে instruction টেমপ্লেট খালি থাকলে এই ডিফল্ট।
   শেষের 𖹭 (U+16E6D) গ্রাহকের চাওয়া — same to same রাখা হয়েছে। */
const KR_DEFAULT_INSTRUCTION = "আমাদের সম্মানিত গ্রাহক \"{NAME}\" স্যার/ম্যাম-এর পার্সেলটি খুব যত্নসহকারে পৌঁছে দিবেন। আর, উনি যদি পার্সেল রিটার্ন করেন, তাহলে {RETURN_CHARGE} টাকা ডেলিভারি চার্জ নেওয়ার চেষ্টা করবেন। ধন্যবাদ। 𖹭";

const KR_CITY_ALIASES = {
  'brahmanbaria': ['b. baria', 'brahmanbaria'],
  'barishal':     ['barisal', 'barishal'],
  'comilla':      ['cumilla', 'comilla'],
  "cox's bazar":  ["cox's bazar", 'coxs bazar', 'cox bazar'],
  'cox bazar':    ["cox's bazar", 'coxs bazar', 'cox bazar'],
  'coxs bazar':   ["cox's bazar", "cox's bazar", 'cox bazar'],
  'chattogram':   ['chattogram', 'chittagong'],
  'chittagong':   ['chittagong', 'chattogram'],
  'jashore':      ['jashore', 'jessore'],
  'jessore':      ['jessore', 'jashore'],
  'bogura':       ['bogura', 'bogra'],
  'bogra':        ['bogra', 'bogura'],
  'khagrachari':  ['khagrachhari', 'khagrachari'],
  'khagrachhari': ['khagrachhari', 'khagrachari'],
  'panchagar':    ['panchagarh', 'panchagar'],
  'panchagarh':   ['panchagarh', 'panchagar'],
  'nawabganj':    ['chapai nawabganj', 'nawabganj'],
  'habigonj':     ['habiganj', 'habigonj'],
  'habiganj':     ['habiganj', 'habigonj'],
  'netrokon':     ['netrokona', 'netrokon'],
  'netrokona':    ['netrokona', 'netrokon'],
  'sunamgonj':    ['sunamganj', 'sunamgonj'],
  'sunamganj':    ['sunamganj', 'sunamgonj'],
  'maulvibazar':  ['moulvibazar', 'maulvibazar'],
  'moulvibazar':  ['moulvibazar', 'maulvibazar'],
  'gazipur':      ['gazipur', 'gajipur'],
  'gajipur':      ['gajipur', 'gazipur'],
  'narayangonj':  ['narayanganj', 'narayangonj'],
  'narayanganj':  ['narayanganj', 'narayangonj'],
  'daynajpur':    ['dinajpur', 'daynajpur'],
  'dinajpur':     ['dinajpur', 'daynajpur']
};

function krNormPlace(s) {
  return String(s == null ? '' : s).toLowerCase().replace(/\s+/g, ' ').trim();
}

/* জেলার সব সম্ভাব্য বানান (নিশ্চিতকৃতগুলো আগে) */
function krCityCandidates(district) {
  const base = krNormPlace(district);
  const out = [];
  if (!base) return out;
  const push = v => { const n = krNormPlace(v); if (n && !out.includes(n)) out.push(n); };
  push(base);
  (KR_CITY_ALIASES[base] || []).forEach(push);
  return out;
}

/* জেলার সাথে পাঠাওর কোন city মিলছে? না মিললে null */
function krFindPathaoCity(list, district) {
  const cands = krCityCandidates(district);
  if (!cands.length || !Array.isArray(list) || !list.length) return null;
  for (const cand of cands) {
    const hit = list.find(x => krNormPlace(x.city_name) === cand);
    if (hit) return hit;
  }
  for (const cand of cands) {
    const hit = list.find(x => {
      const nm = krNormPlace(x.city_name);
      return nm && (nm.includes(cand) || cand.includes(nm));
    });
    if (hit) return hit;
  }
  return null;
}

/* থানা/ঠিকানার সাথে zone বা area মেলানো।
   হুবহু মিল সর্বোচ্চ অগ্রাধিকার, না হলে দীর্ঘতম মিল, না মিললে null।
   (পুরনো কোড লিস্টের প্রথম fuzzy ম্যাচ নিত — ঢাকার প্রথমটা
    ' Dhamrai , Savar', তাই গুলশানের পার্সেল ধামরাই হয়ে যেত) */
function krFindPathaoPlace(list, needle, nameKey) {
  if (!Array.isArray(list) || !list.length) return null;
  const words = krNormPlace(needle).split(' ').filter(w => w.length >= 3);
  if (!words.length) return null;
  let exact = null, best = null, bestLen = 0;
  for (const it of list) {
    const nm = krNormPlace(it[nameKey]);
    if (!nm) continue;
    if (words.includes(nm)) { if (!exact) exact = it; continue; }
    if (words.some(w => nm.includes(w) || w.includes(nm)) && nm.length > bestLen) {
      best = it; bestLen = nm.length;
    }
  }
  return exact || best;
}

/* Pathao city-list ২৪ ঘণ্টা KV ক্যাশসহ (pathaoCachedList আগে থেকেই আছে) */
async function krGetPathaoCities(env) {
  try {
    const r = await pathaoCachedList(env, 'pathao_cities_v1', '/aladdin/api/v1/city-list');
    return Array.isArray(r.items) ? r.items : [];
  } catch (e) {
    console.error('[Pathao city-list]', e.message);
    return [];
  }
}


async function autoBookPathao(env, order) {
  try {
    const enabledRow = await env.DB.prepare(`SELECT setting_value FROM app_settings WHERE setting_key='pathao_enabled'`).first();
    if (!(enabledRow?.setting_value === '1')) return { skipped: 'pathao_disabled' };

    const existing = await env.DB.prepare(`SELECT consignment_id FROM courier_shipments WHERE order_id=?`).bind(order.orderId).first();
    if (existing) return { skipped: 'already_booked', consignment_id: existing.consignment_id };

    const get = async k => {
      const r = await env.DB.prepare(`SELECT setting_value FROM app_settings WHERE setting_key=?`).bind(k).first();
      return r?.setting_value || '';
    };
    const storeId = Number(await get('pathao_store_id') || 0);
    if (!(storeId > 0)) return { skipped: 'no_store_id' };

    const senderName  = await get('pathao_sender_name')  || 'Kora Royal';
    const senderPhone = await get('pathao_sender_phone') || '01935158745';
    const weight      = Number(await get('pathao_default_weight') || 0.5);
    const itemType    = Number(await get('pathao_default_item_type') || 2);
    const deliveryType= Number(await get('pathao_default_delivery_type') || 48);

    /* PATCH D — Courier প্যানেলের কন্ট্রোল এখন worker পড়ে।
       আগে এগুলো শুধু ব্রাউজারের localStorage-এ থাকত, তাই auto-booking
       অ্যাডমিনের পছন্দ পুরোপুরি উপেক্ষা করত। */
    const amountSource  = (await get('pathao_amount_source')) === 'total_payable' ? 'total_payable' : 'cod_remaining';
    const defaultQty    = Math.max(1, Math.trunc(Number(await get('pathao_default_quantity')) || 1));
    const descShowSku   = (await get('pathao_item_desc_sku'))   !== '0';
    const descShowPrice = (await get('pathao_item_desc_price')) !== '0';
    const descShowQty   = (await get('pathao_item_desc_qty'))   !== '0';
    const descFallback  = (await get('pathao_item_desc_fallback')) || 'Clothing';
    const instrTemplate = (await get('pathao_instruction_template')) || KR_DEFAULT_INSTRUCTION;

    const cust  = order.customer || {};
    const items = Array.isArray(order.items) ? order.items : [];

    /* ─────────────────────────────────────────────────────────────
       FIX 1 — amount_to_collect (প্রি-পেইড ডাবল কালেকশন)
       পুরনো: Number(order.totals?.codRemaining || order.totals?.totalPayable || 0)
       JS-এ 0 falsy, তাই codRemaining=0 (সম্পূর্ণ প্রি-পেইড) হলে
       আবার পুরো totalPayable যেত → রাইডার দ্বিতীয়বার টাকা চাইত।
       Pathao amount_to_collect পূর্ণসংখ্যা চায়, তাই Math.round।
       ───────────────────────────────────────────────────────────── */
    const totals = order.totals || {};
    /* প্যানেলে 'সম্পূর্ণ পেমেন্ট' বাছা থাকলে codRemaining উপেক্ষা করে
       totalPayable যায়; নাহলে codRemaining — আর সেটা null হলে totalPayable।
       (0 বৈধ মান, তাই != null চেক — পুরনো || লজিকে প্রি-পেইড অর্ডারে
        রাইডার দ্বিতীয়বার টাকা চাইত) */
    const amountToCollect = (amountSource === 'total_payable')
      ? Math.round(Number(totals.totalPayable || 0))
      : ((totals.codRemaining != null)
          ? Math.round(Number(totals.codRemaining))
          : Math.round(Number(totals.totalPayable || 0)));

    /* ─────────────────────────────────────────────────────────────
       FIX 2 — শহর/জোন/এরিয়া
       পুরনো কোডে ১০টা হার্ডকোড cityId ছিল (rajshahi→5, কিন্তু পাঠাওর
       লিস্টে 5 = Cumilla; barisal→7, কিন্তু Barisal = 17), আর ম্যাপে
       না থাকা ৫৪ জেলা চুপচাপ ঢাকা (1) হয়ে যেত। জোন নেওয়া হতো লিস্টের
       প্রথমটা — ঢাকার প্রথমটা ' Dhamrai , Savar'।
       এখন: লাইভ city-list + alias; না মিললে বুকিং বন্ধ + নোটিফিকেশন।
       ───────────────────────────────────────────────────────────── */
    const cities = await krGetPathaoCities(env);
    const cityHit = krFindPathaoCity(cities, cust.district);

    if (!cityHit) {
      /* চুপচাপ ঢাকা বানিয়ে দেওয়া হবে না — অ্যাডমিনকে জানানো হয় */
      const now0 = Date.now();
      await env.DB.prepare(`INSERT INTO commerce_order_history(order_id, status, note, actor, created_at) VALUES(?, ?, ?, 'system', ?)`)
        .bind(order.orderId, order.status,
          `Pathao auto-booking skipped: district "${cust.district || '—'}" Pathao city list-এ মেলেনি। Orders → Send to Pathao থেকে City/Zone নিজে বাছুন।`,
          now0).run();
      const upd0 = await getCommerceOrder(env, order.orderId);
      if (upd0) await mirrorCommerceOrderToKV(env, upd0);
      return { ok: false, needsManual: true, reason: 'city_not_matched', district: cust.district || '' };
    }

    /* জোন — থানা/উপজেলা/ঠিকানা থেকে ম্যাচ; না মিললে ফিল্ডটাই বাদ
       (Pathao ডক: recipient_city/zone/area optional, "do not send null") */
    let zoneHit = null;
    try {
      const zoneRes = await pathaoCachedList(env, `pathao_zones_v1_${cityHit.city_id}`,
        `/aladdin/api/v1/cities/${cityHit.city_id}/zone-list`);
      const zones = Array.isArray(zoneRes.items) ? zoneRes.items : [];
      const needle = [cust.thana, cust.upazila, cust.address].filter(Boolean).join(' , ');
      zoneHit = krFindPathaoPlace(zones, needle, 'zone_name');
    } catch (e) {
      console.error('[Pathao zone-list]', e.message);
    }

    /* এরিয়া — ঐচ্ছিক; পাঠাওর স্যাম্পল CSV-তেও খালি। না মিললে বাদ। */
    let areaHit = null;
    if (zoneHit) {
      try {
        const areaRes = await pathaoCachedList(env, `pathao_areas_v1_${zoneHit.zone_id}`,
          `/aladdin/api/v1/zones/${zoneHit.zone_id}/area-list`);
        const areas = Array.isArray(areaRes.items) ? areaRes.items : [];
        const needle = [cust.thana, cust.upazila, cust.address].filter(Boolean).join(' , ');
        areaHit = krFindPathaoPlace(areas, needle, 'area_name');
      } catch (e) {
        console.error('[Pathao area-list]', e.message);
      }
    }

    /* ─────────────────────────────────────────────────────────────
       FIX 3 — item_quantity / item_description
       পুরনো: quantity ঠিক ছিল, কিন্তু item_description হার্ডকোড 'Clothing'।
       এখন আসল পণ্য + SKU + দাম।
       ───────────────────────────────────────────────────────────── */
    const realQty = items.reduce((s, i) => s + (Number(i.quantity) || 0), 0);
    const itemQuantity = realQty > 0 ? realQty : defaultQty;
    /* SKU / দাম / সংখ্যা — প্যানেলের টগল অনুযায়ী বসে বা বাদ পড়ে */
    const itemDescription = items.map(i => {
      const nm = String(i.productName || i.name || '').trim();
      if (!nm) return '';
      const sk = (descShowSku && i.sku) ? ` [${i.sku}]` : '';
      const qt = descShowQty ? ` x${Number(i.quantity) || 1}` : '';
      const pr = (descShowPrice && i.lineTotal != null) ? ` — ৳${Math.round(Number(i.lineTotal))}` : '';
      return `${nm}${sk}${qt}${pr}`;
    }).filter(Boolean).join('; ') || descFallback;

    /* Special Instruction — প্যানেলের টেমপ্লেট, placeholder বসিয়ে।
       {RETURN_CHARGE} = অর্ডারের আসল ডেলিভারি চার্জ (হার্ডকোড ১৩০ নয়) */
    const returnCharge = Math.round(Number(totals.delivery || 0)) || 130;
    const firstName = String(cust.name || '').trim().split(/\s+/)[0] || 'গ্রাহক';
    const specialInstruction = String(instrTemplate)
      .replace(/\{NAME\}/g, firstName)
      .replace(/\{PHONE\}/g, String(cust.phone || ''))
      .replace(/\{ORDER_ID\}/g, String(order.orderId || ''))
      .replace(/\{RETURN_CHARGE\}/g, String(returnCharge));

    const payload = {
      store_id: storeId,
      merchant_order_id: order.orderId,
      sender_name: senderName,
      sender_phone: senderPhone,
      recipient_name: cust.name,
      recipient_phone: cust.phone,
      recipient_address: cust.address || cust.district || 'Dhaka',
      recipient_city: Number(cityHit.city_id),
      delivery_type: deliveryType,
      item_type: itemType,
      special_instruction: specialInstruction,
      item_quantity: itemQuantity,
      item_weight: weight,
      amount_to_collect: amountToCollect,
      item_description: itemDescription
    };
    /* zone/area শুধু মিললেই — কখনো null/'' পাঠানো হয় না */
    if (zoneHit) payload.recipient_zone = Number(zoneHit.zone_id);
    if (areaHit) payload.recipient_area = Number(areaHit.area_id);

    const res = await pathaoRequest('/aladdin/api/v1/orders', 'POST', payload, env);
    if (!res.data || !res.data.consignment_id) {
      return { ok: false, error: res.message || 'Failed to get consignment ID from Pathao' };
    }
    const consignmentId = res.data.consignment_id;
    const deliveryFee = Number(res.data.delivery_fee || 0);
    const collectAmt = Number(res.data.amount_to_collect || 0);
    const now = Date.now();

    /* পার্সেল DRAFT হিসেবে তৈরি — পিকআপ রিকোয়েস্ট এখানে হয় না।
       পাঠাওর API-তে পিকআপ রিকোয়েস্টের কোনো এন্ডপয়েন্টই নেই;
       মার্চেন্ট প্যানেল থেকে ম্যানুয়ালি দিতে হয়। অর্ডার স্ট্যাটাস অপরিবর্তিত। */
    await env.DB.prepare(`INSERT INTO courier_shipments(order_id, provider, consignment_id, status, delivery_fee, collect_amount, raw_last_event, created_at, updated_at) VALUES(?, 'pathao', ?, 'draft', ?, ?, 'DRAFT_CREATED', ?, ?)`)
      .bind(order.orderId, consignmentId, deliveryFee, collectAmt, now, now).run();

    await env.DB.prepare(`INSERT INTO commerce_order_history(order_id, status, note, actor, created_at) VALUES(?, ?, ?, 'system', ?)`)
      .bind(order.orderId, order.status,
        `Parcel drafted on Pathao. Consignment ID: ${consignmentId}. ` +
        `City: ${cityHit.city_name}. Zone: ${zoneHit ? zoneHit.zone_name : '(auto by Pathao)'}. ` +
        `Amount to collect: ৳${amountToCollect}. Delivery Fee: ৳${deliveryFee}. ` +
        `(Pickup request পাঠাওর প্যানেল থেকে ম্যানুয়ালি দিতে হবে)`,
        now).run();

    const updated = await getCommerceOrder(env, order.orderId);
    if (updated) await mirrorCommerceOrderToKV(env, updated);

    return {
      ok: true, draft: true,
      consignment_id: consignmentId,
      delivery_fee: deliveryFee,
      city: cityHit.city_name,
      zone: zoneHit ? zoneHit.zone_name : null,
      amount_to_collect: amountToCollect
    };
  } catch (e) {
    console.error('[Auto Pathao Booking Error]', e.message);
    return { ok: false, error: e.message };
  }
}

/* Auto-booking switchboard — books via autoBookPathao() ONLY when the merchant
   explicitly opts in (app_settings: pathao_auto_book='1' AND pathao_enabled='1').
   Otherwise a no-op, so manual booking stays the default everywhere. */
async function maybeAutoBookPathao(env, order) {
  try {
    if (!order || !order.orderId) return { skipped: 'no_order' };
    const row = await env.DB.prepare(`SELECT setting_value FROM app_settings WHERE setting_key='pathao_auto_book'`).first();
    if (row?.setting_value !== '1') return { skipped: 'auto_book_disabled' };
    return await autoBookPathao(env, order);
  } catch (e) {
    console.error('[maybeAutoBookPathao]', e.message);
    return { ok: false, error: e.message };
  }
}

/* ================================================================
   ERP MANUAL ORDER CREATION BY ADMIN
   ================================================================ */
async function placeAdminOrder(request, env, orderData) {
  requireD1(env);
  const orderId = validOrderId(orderData.orderId);
  if (!orderId) throw new HttpError(400, 'Invalid order ID format');
  
  const existing = await env.DB.prepare("SELECT id FROM commerce_orders WHERE id=?").bind(orderId).first();
  if (existing) throw new HttpError(409, 'Order ID already exists');
  
  const rawChannel = cleanToken(orderData.channel || 'whatsapp', 30);
  /* DB only allows 'website' or 'whatsapp'. Map admin channels safely. */
  const channel = (rawChannel === 'whatsapp' || rawChannel === 'website') ? rawChannel : 'whatsapp';
  const status = cleanToken(orderData.status || 'pending', 50);

  const customer = validateAdminCustomer(orderData.customer, rawChannel);
  const items = await resolveCommerceItems(env, orderData.items || orderData.instances);

  const couponSub = roundMoney(items.reduce((s,i)=>s+i.lineTotal,0));
  const coupon = orderData.couponCode ? await resolveCoupon(env, orderData.couponCode, customer.phone, items, couponSub, baseDeliveryFee(customer.district, couponSub, rawChannel==='local')) : null;
  const preliminary = calculateServerTotals(items, customer.district, coupon, Number(orderData.payment?.advance) || 0, rawChannel==='local');
  const payment = validateCommercePayment(orderData.payment, preliminary.totalPayable);
  const totals = calculateServerTotals(items, customer.district, coupon, payment.advance, rawChannel==='local');
  const couponCode = coupon ? coupon.code : '';
  const now = Date.now();
  const idempotencyKey = cleanToken(orderData.idempotencyKey || `admin-${orderId}-${now}`, 120);
  
  const statements = [
    env.DB.prepare(`INSERT INTO commerce_orders(id,channel,status,customer_json,payment_json,totals_json,coupon_code,created_at,updated_at,cancel_deadline,idempotency_key) VALUES(?,'${channel}',?,?,?,?,?,?,?,null,?)`).bind(orderId, status, JSON.stringify(customer), JSON.stringify(payment), JSON.stringify(totals), couponCode, now, now, idempotencyKey)
  ];
  
  const itemRows = items.map(i => [orderId, i.productId, i.variantId, i.productName, i.sku, JSON.stringify(i.options), i.unitPrice, i.quantity, i.lineTotal, status === 'pending' ? 0 : 1]);
  addChunkedRows(statements, env, `INSERT INTO commerce_order_items(order_id,product_id,variant_id,product_name_snapshot,sku_snapshot,options_json,unit_price,quantity,line_total,sold_credited) VALUES `, itemRows);
  
  statements.push(env.DB.prepare(`INSERT INTO commerce_order_history(order_id,status,note,actor,created_at) VALUES(?,?,'Order created manually by admin','admin',?)`).bind(orderId, status, now));

  if (coupon && !coupon.legacy) {
    statements.push(env.DB.prepare(`INSERT INTO coupon_redemptions(coupon_code,order_id,customer_phone,discount_amount,free_delivery,created_at) VALUES(?,?,?,?,?,?)`).bind(coupon.code,orderId,customer.phone,coupon.discountAmt,coupon.freeDelivery?1:0,now));
    statements.push(env.DB.prepare(`UPDATE coupons SET used_count=used_count+1,updated_at=? WHERE code=? AND (usage_limit_total=0 OR used_count<usage_limit_total)`).bind(now,coupon.code));
  }

  const byVariant = groupQuantities(items, 'variantId');
  const movementRows = [];
  
  if (status === 'pending') {
    for (const [variantId, qty] of byVariant) {
      statements.push(env.DB.prepare("UPDATE product_variants SET reserved_qty=reserved_qty+?,updated_at=? WHERE id=?").bind(qty, now, variantId));
      const item = items.find(i => i.variantId === variantId);
      movementRows.push([item.productId, variantId, 'reserve', qty, null, null, orderId, 'website', 'Admin manual reservation', 'admin', now, `admin-reserve:${orderId}:${variantId}`]);
    }
  } else if (status !== 'cancelled_by_seller') {
    for (const [variantId, qty] of byVariant) {
      statements.push(env.DB.prepare("UPDATE product_variants SET stock_qty=stock_qty-?,updated_at=? WHERE id=?").bind(qty, now, variantId));
      const item = items.find(i => i.variantId === variantId);
      movementRows.push([item.productId, variantId, 'confirmed_sale', -qty, null, null, orderId, 'website', 'Admin manual sale', 'admin', now, `admin-sale:${orderId}:${variantId}`]);
    }
    
    const byProduct = groupQuantities(items, 'productId');
    for (const [productId, qty] of byProduct) {
      /* Update the real product_stats table (product_sales_cache does not exist) */
      statements.push(env.DB.prepare("INSERT INTO product_stats(product_id,website_sold,updated_at) VALUES(?,?,?) ON CONFLICT(product_id) DO UPDATE SET website_sold=product_stats.website_sold+excluded.website_sold,updated_at=excluded.updated_at").bind(productId, qty, now));
    }
  }
  
  if (movementRows.length > 0) {
    addChunkedRows(statements, env, `INSERT OR IGNORE INTO inventory_movements(product_id,variant_id,movement_type,quantity,before_qty,after_qty,order_id,source,note,admin_ref,created_at,idempotency_key) VALUES `, movementRows);
  }
  
  if (statements.length > 49) throw new HttpError(400, 'Order contains too many items');
  await env.DB.batch(statements);
  
  const order = await getCommerceOrder(env, orderId);
  await mirrorCommerceOrderToKV(env, order);
  await upsertCustomerFromOrder(env, order);
  
  const lines = items.map(i => `🔹 <b>${htmlEsc(i.productName)}</b>\n      ${i.sku || 'Default'} × ${i.quantity} = <b>৳${(i.lineTotal).toLocaleString()}</b>`).join('\n');
  const tgMsg = `🛒 <b>MANUAL ORDER CREATED (${channel.toUpperCase()})</b>\n🆔 <code>${orderId}</code>\n👤 Name: <code>${htmlEsc(customer.name)}</code>\n📞 Phone: <code>${htmlEsc(customer.phone)}</code>\n📍 Dist: ${htmlEsc(customer.district)}\n💰 <b>Total Payable: ৳${totals.totalPayable.toLocaleString()}</b>\n📦 <b>PRODUCTS:</b>\n${lines}`;
  await sendTelegramMsg(tgMsg, env.TELEGRAM_TOKEN, env.TELEGRAM_CHAT);
  
  return { ok: true, orderId, order };
}


export default {
  async fetch(request, env) {
    const corsHeaders = buildCors(request, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url  = new URL(request.url);
    const path = url.pathname;

    try {

      /* ════════════════════════════════════════════
         EXISTING ENDPOINTS — একদম অপরিবর্তিত
         ════════════════════════════════════════════ */

      /* POST /api/order — D1 authoritative, legacy-compatible */
      if (path === '/api/order' && request.method === 'POST') {
        const body = await readJson(request, 750000);
        if (body.orderData && env.DB) {
          const result = await placeCommerceOrder(request, env, body.orderData);
          return jsonRes(result, 200, corsHeaders);
        }
        /* Legacy storefront fallback until all frontend files are upgraded. */
        const { telegramMessage, sheetsPayload } = body;
        if (!sheetsPayload || !sheetsPayload.orderId) return jsonRes({ ok:false,error:'Missing order data' },400,corsHeaders);
        const orderId=sheetsPayload.orderId,now=Date.now(),orderRecord={orderId,createdAt:now,status:'pending',statusHistory:[{status:'pending',time:now,note:'Legacy order placed'}],customer:sheetsPayload,cancelDeadline:now+5*60*1000,autoStatusAt:null,packedAt:null,cancelReason:null};
        /* During rollout, mirror legacy storefront orders into D1 so Admin Orders does not lose them. */
        if(env.DB){
          const legacyCustomer={name:cleanText(sheetsPayload.name,120),phone:normalizeBDPhone(sheetsPayload.phone),email:cleanText(sheetsPayload.email,180),district:cleanText(sheetsPayload.district,100),thana:cleanText(sheetsPayload.thana,150),address:cleanText(sheetsPayload.address,500),note:''};
          const legacyPayment={method:cleanText(sheetsPayload.payment,30)||'COD',advance:Number(sheetsPayload.advance||0),trxId:cleanText(sheetsPayload.trxId,100)};
          const legacyTotals={subtotal:Number(sheetsPayload.subtotal||0),discountAmt:Number(sheetsPayload.discount||0),delivery:Number(sheetsPayload.shipping||0),totalPayable:Number(sheetsPayload.total||0),codRemaining:Math.max(0,Number(sheetsPayload.total||0)-Number(sheetsPayload.advance||0))};
          await env.DB.batch([
            env.DB.prepare(`INSERT OR IGNORE INTO commerce_orders(id,channel,status,customer_json,payment_json,totals_json,coupon_code,created_at,updated_at,cancel_deadline,idempotency_key) VALUES(?,'website','pending',?,?,?,?,?,?,?,?)`).bind(orderId,JSON.stringify(legacyCustomer),JSON.stringify(legacyPayment),JSON.stringify(legacyTotals),cleanText(sheetsPayload.coupon,40),now,now,orderRecord.cancelDeadline,`legacy:${orderId}`),
            env.DB.prepare(`INSERT INTO commerce_order_history(order_id,status,note,actor,created_at) SELECT ?,'pending','Legacy storefront order','customer',? WHERE NOT EXISTS(SELECT 1 FROM commerce_order_history WHERE order_id=?)`).bind(orderId,now,orderId)
          ]);
        }
        if(env.KR_ORDERS)await env.KR_ORDERS.put(`order:${orderId}`,JSON.stringify(orderRecord),{expirationTtl:60*60*24*90});
        const [tg,sheet]=await Promise.allSettled([sendOrderToTelegram(body,env),sendOrderToSheets(body,env)]);
        return jsonRes({ok:true,legacy:true,orderId,cancelDeadline:orderRecord.cancelDeadline,telegram:tg.status==='fulfilled'&&tg.value,sheets:sheet.status==='fulfilled'&&sheet.value},200,corsHeaders);
      }

      /* POST /api/lead */
      if (path === '/api/lead' && request.method === 'POST') {
        const body = await request.json();
        if(env.DB)await saveLeadSnapshot(env,body.sheetsPayload||body);
        const [tgResult, sheetResult] = await Promise.allSettled([
          sendLeadToTelegram(body, env),
          sendLeadToSheets(body, env)
        ]);
        return jsonRes({
          ok:       true,
          telegram: tgResult.status    === 'fulfilled' && tgResult.value,
          sheets:   sheetResult.status === 'fulfilled' && sheetResult.value
        }, 200, corsHeaders);
      }

      /* GET /api/track — D1 first, KV legacy fallback */
      if (path === '/api/track' && request.method === 'GET') {
        const orderId=validOrderId(url.searchParams.get('id'));
        if(!orderId)return jsonRes({ok:false,error:'Valid Order ID required'},400,corsHeaders);
        if(env.DB){
          const order=await getCommerceOrder(env,orderId);
          if(order){const [requests,settings]=await Promise.all([listOrderRequests(env,orderId),d1TableExists(env,'order_service_requests').then(ok=>ok?getRequestSettings(env):{})]);return jsonRes({ok:true,orderId:order.orderId,status:order.status,statusHistory:order.statusHistory,createdAt:order.createdAt,updatedAt:order.updatedAt,cancelDeadline:order.cancelDeadline,cancelReason:order.cancelReason,items:order.items.map(i=>({id:i.id,productName:i.productName,productNameBn:i.productNameBn,sku:i.sku,quantity:i.quantity,unitPrice:i.unitPrice,options:i.options})),customer:{name:order.customer.name,district:order.customer.district},requests,requestWindows:{return:requestWindowDays(settings,'return'),refund:requestWindowDays(settings,'refund'),exchange:requestWindowDays(settings,'exchange')}},200,corsHeaders,{ 'Cache-Control':'no-store' });}
        }
        if(env.KR_ORDERS){const raw=await env.KR_ORDERS.get(`order:${orderId}`);if(raw){const o=JSON.parse(raw);return jsonRes({ok:true,orderId:o.orderId,status:o.status,statusHistory:o.statusHistory||[],createdAt:o.createdAt,cancelDeadline:o.cancelDeadline,cancelReason:o.cancelReason||null,customer:{name:o.customer?.name,district:o.customer?.district}},200,corsHeaders);}}
        return jsonRes({ok:false,error:'Order not found'},404,corsHeaders);
      }

      /* POST /api/cancel — releases reservation / reverses confirmed stock */
      if (path === '/api/cancel' && request.method === 'POST') {
        const body=await readJson(request,20000),orderId=validOrderId(body.orderId),reason=cleanText(body.reason,150),reasonNote=cleanText(body.reasonNote,400);
        if(!orderId||!reason)return jsonRes({ok:false,error:'orderId and reason required'},400,corsHeaders);
        if(env.DB){
          const existing=await getCommerceOrder(env,orderId);
          if(existing){
            try{const order=await cancelCommerceOrder(env,orderId,reason,reasonNote,'customer',false);await sendTelegramMsg(`❌ <b>ORDER CANCELLED BY CUSTOMER</b>\n🆔 <code>${htmlEsc(orderId)}</code>\n👤 ${htmlEsc(order.customer.name)}\n📞 ${htmlEsc(order.customer.phone)}\n📝 ${htmlEsc(order.cancelReason)}`,env.TELEGRAM_TOKEN,env.TELEGRAM_CHAT);return jsonRes({ok:true,status:order.status,order},200,corsHeaders);}catch(e){if(e instanceof HttpError)return jsonRes({ok:false,error:e.message,expired:e.status===403},e.status,corsHeaders);throw e;}
          }
        }
        /* Legacy KV cancellation. */
        if(!env.KR_ORDERS)return jsonRes({ok:false,error:'Order not found'},404,corsHeaders);
        const raw=await env.KR_ORDERS.get(`order:${orderId}`);if(!raw)return jsonRes({ok:false,error:'Order not found'},404,corsHeaders);const order=JSON.parse(raw),now=Date.now();
        if(now>order.cancelDeadline)return jsonRes({ok:false,error:'Cancel window expired.',expired:true},403,corsHeaders);
        if(['cancelled_by_customer','cancelled_by_seller','delivered'].includes(order.status))return jsonRes({ok:false,error:`Order already ${order.status}`},400,corsHeaders);
        const cancelNote=reasonNote?`${reason}: ${reasonNote}`:reason;order.status='cancelled_by_customer';order.cancelReason=cancelNote;order.statusHistory.push({status:'cancelled_by_customer',time:now,note:cancelNote});await env.KR_ORDERS.put(`order:${orderId}`,JSON.stringify(order),{expirationTtl:60*60*24*90});return jsonRes({ok:true,status:order.status},200,corsHeaders);
      }

      /* PUBLIC RETURN / REFUND / EXCHANGE REQUEST */
      if(path==='/api/order/service-request'&&request.method==='POST'){
        const body=await readJson(request,100000);try{return jsonRes({ok:true,request:await createServiceRequest(request,env,body)},200,corsHeaders)}catch(e){if(e instanceof HttpError)return jsonRes({ok:false,error:e.message},e.status,corsHeaders);throw e;}
      }

      /* ADMIN SERVICE REQUESTS */
      if(path==='/api/admin/service-requests'&&request.method==='GET'){
        if(!await verifyAdmin(request,env))return jsonRes({ok:false,error:'Unauthorized'},401,corsHeaders);requireD1(env);const page=Math.max(1,Number(url.searchParams.get('page'))||1),limit=20,status=url.searchParams.get('status')||'all',type=url.searchParams.get('type')||'all',where=[],params=[];if(status!=='all'){where.push('r.status=?');params.push(status)}if(type!=='all'){where.push('r.request_type=?');params.push(type)}const ws=where.length?'WHERE '+where.join(' AND '):'';const[count,rows]=await Promise.all([env.DB.prepare(`SELECT COUNT(*) total FROM order_service_requests r ${ws}`).bind(...params).first(),env.DB.prepare(`SELECT r.*,o.customer_json FROM order_service_requests r JOIN commerce_orders o ON o.id=r.order_id ${ws} ORDER BY r.created_at DESC LIMIT ? OFFSET ?`).bind(...params,limit,(page-1)*limit).all()]);const total=Number(count?.total||0);return jsonRes({ok:true,requests:(rows.results||[]).map(x=>({...x,customer:safeJsonParse(x.customer_json,{}),items:safeJsonParse(x.items_json,[]),resolution:safeJsonParse(x.resolution_json,{})})),total,page,pages:Math.ceil(total/limit)},200,corsHeaders);
      }
      if(path==='/api/admin/service-requests/update'&&request.method==='POST'){
        if(!await verifyAdmin(request,env))return jsonRes({ok:false,error:'Unauthorized'},401,corsHeaders);requireD1(env);const b=await readJson(request,100000),id=cleanToken(b.id,100),status=['reviewing','approved','rejected','received','completed','cancelled'].includes(b.status)?b.status:null,note=cleanText(b.note,1000);if(!id||!status)return jsonRes({ok:false,error:'Invalid request update'},400,corsHeaders);const req=await env.DB.prepare(`SELECT * FROM order_service_requests WHERE id=?`).bind(id).first();if(!req)return jsonRes({ok:false,error:'Request not found'},404,corsHeaders);if(status==='completed')await applyRequestResolution(env,req,b.resolution||{},request);const now=Date.now();await env.DB.batch([env.DB.prepare(`UPDATE order_service_requests SET status=?,updated_at=? WHERE id=?`).bind(status,now,id),env.DB.prepare(`INSERT INTO order_service_request_history(request_id,status,note,actor,created_at) VALUES(?,?,?,'admin',?)`).bind(id,status,note,now)]);await writeAudit(env,request,'service_request_status','service_request',id,{status,note,resolution:b.resolution||{}});return jsonRes({ok:true,id,status},200,corsHeaders);
      }

      /* ADMIN CUSTOMERS / LEADS CRM */
      if(path==='/api/admin/customer-stats'&&request.method==='GET'){
        if(!await verifyAdmin(request,env))return jsonRes({ok:false,error:'Unauthorized'},401,corsHeaders);requireD1(env);const now=Date.now(),[base,top,leads,requests]=await Promise.all([env.DB.prepare(`SELECT COUNT(*) total_customers,SUM(CASE WHEN follow_up_at IS NOT NULL AND follow_up_at<=? THEN 1 ELSE 0 END) followups_due FROM customers`).bind(now).first(),env.DB.prepare(`SELECT district,COUNT(*) count FROM customers WHERE district<>'' GROUP BY district ORDER BY count DESC LIMIT 1`).first(),env.DB.prepare(`SELECT COUNT(*) count FROM leads WHERE linked_customer_id IS NULL`).first(),env.DB.prepare(`SELECT COUNT(*) total,SUM(CASE WHEN status IN ('requested','reviewing','approved','received') THEN 1 ELSE 0 END) open FROM order_service_requests`).first()]);const orders=await env.DB.prepare(`SELECT COUNT(DISTINCT CASE WHEN x.cnt>=2 THEN x.customer_id END) repeat_customers,COALESCE(AVG(x.delivered_value),0) avg_delivered_value,COALESCE(SUM(x.delivered_count),0) delivered_orders,COALESCE(SUM(x.cancelled_count),0) cancelled_orders FROM (SELECT l.customer_id,COUNT(o.id) cnt,SUM(CASE WHEN o.status='delivered' THEN CAST(json_extract(o.totals_json,'$.totalPayable') AS REAL) ELSE 0 END) delivered_value,SUM(CASE WHEN o.status='delivered' THEN 1 ELSE 0 END) delivered_count,SUM(CASE WHEN o.status IN ('cancelled_by_customer','cancelled_by_seller') THEN 1 ELSE 0 END) cancelled_count FROM order_customer_links l JOIN commerce_orders o ON o.id=l.order_id GROUP BY l.customer_id)x`).first();return jsonRes({ok:true,totalCustomers:Number(base?.total_customers||0),repeatCustomers:Number(orders?.repeat_customers||0),topDistrict:top?.district||'—',avgDeliveredValue:Math.round(Number(orders?.avg_delivered_value||0)),deliveredOrders:Number(orders?.delivered_orders||0),cancelledOrders:Number(orders?.cancelled_orders||0),leads:Number(leads?.count||0),followupsDue:Number(base?.followups_due||0),requestsTotal:Number(requests?.total||0),requestsOpen:Number(requests?.open||0)},200,corsHeaders);
      }

      if(path==='/api/admin/customers'&&request.method==='GET'){
        if(!await verifyAdmin(request,env))return jsonRes({ok:false,error:'Unauthorized'},401,corsHeaders);requireD1(env);return jsonRes(await customerSummaryQuery(env,url),200,corsHeaders);
      }
      if(path.startsWith('/api/admin/customer/')&&request.method==='GET'){
        if(!await verifyAdmin(request,env))return jsonRes({ok:false,error:'Unauthorized'},401,corsHeaders);const id=positiveInt(path.split('/').pop());if(!id)return jsonRes({ok:false,error:'Invalid customer'},400,corsHeaders);const data=await customerDetail(env,id);return data?jsonRes({ok:true,...data},200,corsHeaders):jsonRes({ok:false,error:'Customer not found'},404,corsHeaders);
      }
      if(path==='/api/admin/customers/update'&&request.method==='POST'){
        if(!await verifyAdmin(request,env))return jsonRes({ok:false,error:'Unauthorized'},401,corsHeaders);const b=await readJson(request,50000),id=positiveInt(b.id);if(!id)return jsonRes({ok:false,error:'Invalid customer'},400,corsHeaders);await env.DB.prepare(`UPDATE customers SET display_name=?,email=?,district=?,communication_preference=?,status=?,tags_json=?,follow_up_at=?,updated_at=? WHERE id=?`).bind(cleanText(b.name,120),cleanText(b.email,180),cleanText(b.district,100),['call','text','voice','whatsapp','unknown'].includes(b.preference)?b.preference:'unknown',['active','archived','blocked'].includes(b.status)?b.status:'active',JSON.stringify(Array.isArray(b.tags)?b.tags.slice(0,30).map(x=>cleanText(x,50)):[]),Number(b.followUpAt)||null,Date.now(),id).run();await writeAudit(env,request,'customer_update','customer',String(id),b);return jsonRes({ok:true,id},200,corsHeaders);
      }
      if(path==='/api/admin/customers/note'&&request.method==='POST'){
        if(!await verifyAdmin(request,env))return jsonRes({ok:false,error:'Unauthorized'},401,corsHeaders);const b=await readJson(request,20000),id=positiveInt(b.customerId),note=cleanText(b.note,2000);if(!id||!note)return jsonRes({ok:false,error:'Customer and note required'},400,corsHeaders);const now=Date.now();await env.DB.prepare(`INSERT INTO customer_notes(customer_id,note,note_type,admin_ref,created_at,updated_at) VALUES(?,?,?,?,?,?)`).bind(id,note,cleanToken(b.noteType,50)||'general','admin',now,now).run();return jsonRes({ok:true},200,corsHeaders);
      }
      if(path==='/api/admin/customers/interaction'&&request.method==='POST'){
        if(!await verifyAdmin(request,env))return jsonRes({ok:false,error:'Unauthorized'},401,corsHeaders);const b=await readJson(request,30000),id=positiveInt(b.customerId);if(!id)return jsonRes({ok:false,error:'Customer required'},400,corsHeaders);await env.DB.prepare(`INSERT INTO customer_interactions(customer_id,channel,outcome,detail,follow_up_at,admin_ref,created_at) VALUES(?,?,?,?,?,'admin',?)`).bind(id,cleanToken(b.channel,50)||'note',cleanText(b.outcome,150),cleanText(b.detail,1500),Number(b.followUpAt)||null,Date.now()).run();return jsonRes({ok:true},200,corsHeaders);
      }
      if(path==='/api/admin/leads'&&request.method==='GET'){
        if(!await verifyAdmin(request,env))return jsonRes({ok:false,error:'Unauthorized'},401,corsHeaders);const page=Math.max(1,Number(url.searchParams.get('page'))||1),limit=20,q=cleanText(url.searchParams.get('search'),100),stage=cleanToken(url.searchParams.get('stage'),60),where=['linked_customer_id IS NULL'],params=[];if(q){where.push('(name LIKE ? OR phone LIKE ? OR email LIKE ? OR district LIKE ?)');params.push(`%${q}%`,`%${q}%`,`%${q}%`,`%${q}%`)}if(stage&&stage!=='all'){where.push('stage=?');params.push(stage)}const ws='WHERE '+where.join(' AND '),[count,rows]=await Promise.all([env.DB.prepare(`SELECT COUNT(*) total FROM leads ${ws}`).bind(...params).first(),env.DB.prepare(`SELECT * FROM leads ${ws} ORDER BY last_seen_at DESC LIMIT ? OFFSET ?`).bind(...params,limit,(page-1)*limit).all()]);const total=Number(count?.total||0);return jsonRes({ok:true,leads:rows.results||[],total,page,pages:Math.ceil(total/limit)},200,corsHeaders);
      }
      if(path==='/api/admin/customers/import-kv'&&request.method==='POST'){
        if(!await verifyAdmin(request,env))return jsonRes({ok:false,error:'Unauthorized'},401,corsHeaders);if(!env.KR_ORDERS)return jsonRes({ok:false,error:'KV not configured'},503,corsHeaders);const b=await readJson(request,20000),cursor=cleanText(b.cursor,500)||undefined,list=await env.KR_ORDERS.list({prefix:'order:',limit:100,cursor}),now=Date.now();let imported=0;for(const key of list.keys){const raw=await env.KR_ORDERS.get(key.name);if(!raw)continue;const o=safeJsonParse(raw,{}),c=o.customer||{},phone=normalizeCustomerPhone(c.phone);if(!/^01[3-9]\d{8}$/.test(phone))continue;await env.DB.prepare(`INSERT INTO customers(primary_phone,display_name,email,district,created_at,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(primary_phone) DO UPDATE SET display_name=CASE WHEN excluded.display_name<>'' THEN excluded.display_name ELSE customers.display_name END,district=CASE WHEN excluded.district<>'' THEN excluded.district ELSE customers.district END,updated_at=excluded.updated_at`).bind(phone,cleanText(c.name,120),cleanText(c.email,180),cleanText(c.district,100),Number(o.createdAt)||now,now).run();const row=await env.DB.prepare(`SELECT id FROM customers WHERE primary_phone=?`).bind(phone).first();await env.DB.batch([env.DB.prepare(`INSERT OR IGNORE INTO customer_phones(customer_id,phone,label,is_primary,created_at) VALUES(?,?,'Primary',1,?)`).bind(row.id,phone,now),env.DB.prepare(`INSERT OR IGNORE INTO legacy_customer_orders(order_id,customer_id,status,total,district,products,created_at) VALUES(?,?,?,?,?,?,?)`).bind(o.orderId||key.name.slice(6),row.id,o.status||'',Number(c.total||0),cleanText(c.district,100),cleanText(c.products,2000),Number(o.createdAt)||now)]);imported++;}return jsonRes({ok:true,imported,cursor:list.list_complete?null:list.cursor,complete:list.list_complete},200,corsHeaders);
      }

      /* POST /api/admin/login */
      if (path === '/api/admin/login' && request.method === 'POST') {
        if (!env.ADMIN_PASSWORD || !env.ADMIN_SECRET) {
          return jsonRes({ ok:false, error:'Admin security secrets are not configured' }, 503, corsHeaders);
        }
        const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
        const ipHash = await hashString(ip);
        const rateKey = `admin_login_rl:${ipHash}`;
        let attempts = 0;
        if (env.KR_ORDERS) attempts = parseInt(await env.KR_ORDERS.get(rateKey) || '0');
        if (attempts >= 8) return jsonRes({ ok:false, error:'Too many login attempts. Try again later.' }, 429, corsHeaders);
        const body = await readJson(request, 10000);
        if (body.password !== env.ADMIN_PASSWORD) {
          if (env.KR_ORDERS) await env.KR_ORDERS.put(rateKey, String(attempts + 1), { expirationTtl: 15 * 60 });
          return jsonRes({ ok: false, error: 'Invalid password' }, 401, corsHeaders);
        }
        if (env.KR_ORDERS) await env.KR_ORDERS.delete(rateKey);
        const token = await makeToken(env.ADMIN_SECRET);
        return jsonRes({ ok: true, token, expiresIn: 8 * 60 * 60 }, 200, corsHeaders);
      }

      /* POST /api/admin/setup-database — mobile/no-PC bootstrap */
      if (path === '/api/admin/setup-database' && request.method === 'POST') {
        if (!await verifyAdmin(request, env)) {
          return jsonRes({ ok:false, error:'Unauthorized' }, 401, corsHeaders);
        }
        requireD1(env);
        const body = await readJson(request, 10000);
        if (body.confirm !== 'INITIALIZE_KORA_DATABASE') {
          return jsonRes({ ok:false, error:'Setup confirmation is required' }, 400, corsHeaders);
        }
        /* One prepared statement per D1 query. This avoids D1Database.exec()
           multi-line parsing failures and unsupported PRAGMA mutations.
           44 setup statements + 1 verification query = 45 (Free-plan safe). */
        try {
          /* Execute schema first so seed statements are only prepared after tables exist. */
          await env.DB.batch(KR_MOBILE_SCHEMA_STATEMENTS.map(sql => env.DB.prepare(sql)));
          await env.DB.batch(KR_MOBILE_SEED_STATEMENTS.map(sql => env.DB.prepare(sql)));
          const counts = await env.DB.prepare(`SELECT
            (SELECT COUNT(*) FROM products) AS products,
            (SELECT COUNT(*) FROM product_variants) AS variants,
            (SELECT COUNT(*) FROM product_options) AS options,
            (SELECT COUNT(*) FROM product_option_values) AS option_values`).first();
          return jsonRes({ ok:true, initialized:true, counts, message:'D1 schema and seed are ready' }, 200, corsHeaders);
        } catch (setupError) {
          console.error('[D1 Setup]', setupError.message, setupError.stack);
          return jsonRes({
            ok:false,
            error:'Database initialization failed',
            detail:String(setupError.message || setupError).slice(0,500)
          }, 500, corsHeaders);
        }
      }

      /* POST /api/admin/migrate-phase3a — idempotent mobile migration */
      if (path === '/api/admin/migrate-phase3a' && request.method === 'POST') {
        if (!await verifyAdmin(request, env)) return jsonRes({ok:false,error:'Unauthorized'},401,corsHeaders);
        requireD1(env);
        const body=await readJson(request,10000);
        if(body.confirm!=='MIGRATE_PHASE3A')return jsonRes({ok:false,error:'Migration confirmation required'},400,corsHeaders);
        try {
          await env.DB.batch(KR_PHASE3A_MIGRATION_STATEMENTS.map(sql=>env.DB.prepare(sql)));
          const counts=await env.DB.prepare(`SELECT (SELECT COUNT(*) FROM hero_slides) hero_slides,(SELECT COUNT(*) FROM product_view_windows) view_windows,(SELECT COUNT(*) FROM product_cart_windows) cart_windows`).first();
          return jsonRes({ok:true,migrated:true,counts},200,corsHeaders);
        } catch(e) {
          console.error('[Phase3A Migration]',e.message,e.stack);
          return jsonRes({ok:false,error:'Phase 3A migration failed',detail:String(e.message||e).slice(0,500)},500,corsHeaders);
        }
      }

      /* POST /api/admin/migrate-phase3b — idempotent mobile migration */
      if(path==='/api/admin/migrate-phase3b'&&request.method==='POST'){
        if(!await verifyAdmin(request,env))return jsonRes({ok:false,error:'Unauthorized'},401,corsHeaders);requireD1(env);const b=await readJson(request,10000);if(b.confirm!=='MIGRATE_PHASE3B')return jsonRes({ok:false,error:'Migration confirmation required'},400,corsHeaders);
        try{await env.DB.batch(KR_PHASE3B_MIGRATION_STATEMENTS.map(sql=>env.DB.prepare(sql)));const counts=await env.DB.prepare(`SELECT (SELECT COUNT(*) FROM size_chart_templates) size_templates,(SELECT COUNT(*) FROM product_size_chart_assignments) assignments`).first();return jsonRes({ok:true,migrated:true,counts},200,corsHeaders)}catch(e){console.error('[Phase3B Migration]',e.message,e.stack);return jsonRes({ok:false,error:'Phase 3B migration failed',detail:String(e.message||e).slice(0,500)},500,corsHeaders)}
      }

      /* POST /api/admin/migrate-size-diagrams — idempotent SVG diagram schema */
      if(path==='/api/admin/migrate-size-diagrams'&&request.method==='POST'){
        if(!await verifyAdmin(request,env))return jsonRes({ok:false,error:'Unauthorized'},401,corsHeaders);
        requireD1(env);
        const b=await readJson(request,10000);
        if(b.confirm!=='MIGRATE_SIZE_DIAGRAMS')return jsonRes({ok:false,error:'Migration confirmation required'},400,corsHeaders);
        try{
          await env.DB.batch(KR_SIZE_DIAGRAM_MIGRATION_STATEMENTS.map(sql=>env.DB.prepare(sql)));
          const counts=await env.DB.prepare(`SELECT (SELECT COUNT(*) FROM size_chart_templates) size_templates,(SELECT COUNT(*) FROM size_chart_diagrams) diagrams`).first();
          return jsonRes({ok:true,migrated:true,counts},200,corsHeaders);
        }catch(e){
          console.error('[Size Diagram Migration]',e.message,e.stack);
          return jsonRes({ok:false,error:'Size diagram migration failed',detail:String(e.message||e).slice(0,500)},500,corsHeaders);
        }
      }

      /* POST /api/admin/migrate-operations — idempotent mobile migration */
      if(path==='/api/admin/migrate-operations'&&request.method==='POST'){
        if(!await verifyAdmin(request,env))return jsonRes({ok:false,error:'Unauthorized'},401,corsHeaders);requireD1(env);const b=await readJson(request,10000);if(b.confirm!=='MIGRATE_OPERATIONS')return jsonRes({ok:false,error:'Migration confirmation required'},400,corsHeaders);
        try{await env.DB.batch(KR_OPERATIONS_MIGRATION_STATEMENTS.map(sql=>env.DB.prepare(sql)));const counts=await env.DB.prepare(`SELECT (SELECT COUNT(*) FROM customers) customers,(SELECT COUNT(*) FROM leads) leads,(SELECT COUNT(*) FROM order_service_requests) requests`).first();return jsonRes({ok:true,migrated:true,counts},200,corsHeaders)}catch(e){console.error('[Operations Migration]',e.message,e.stack);return jsonRes({ok:false,error:'Operations migration failed',detail:String(e.message||e).slice(0,500)},500,corsHeaders)}
      }

      /* POST /api/admin/migrate-coupons — idempotent coupon schema */
      if(path==='/api/admin/migrate-coupons'&&request.method==='POST'){
        if(!await verifyAdmin(request,env))return jsonRes({ok:false,error:'Unauthorized'},401,corsHeaders);
        requireD1(env);
        const b=await readJson(request,10000);
        if(b.confirm!=='MIGRATE_COUPONS')return jsonRes({ok:false,error:'Migration confirmation required'},400,corsHeaders);
        try{
          await env.DB.batch(KR_COUPON_MIGRATION_STATEMENTS.map(sql=>env.DB.prepare(sql)));
          const counts=await env.DB.prepare(`SELECT (SELECT COUNT(*) FROM coupons) coupons,(SELECT COUNT(*) FROM coupon_redemptions) redemptions`).first();
          return jsonRes({ok:true,migrated:true,counts},200,corsHeaders);
        }catch(e){
          console.error('[Coupons Migration]',e.message,e.stack);
          return jsonRes({ok:false,error:'Coupons migration failed',detail:String(e.message||e).slice(0,500)},500,corsHeaders);
        }
      }

      /* POST /api/admin/migrate-courier */
      if(path==='/api/admin/migrate-courier'&&request.method==='POST'){
        if(!await verifyAdmin(request,env))return jsonRes({ok:false,error:'Unauthorized'},401,corsHeaders);
        requireD1(env);
        const b=await readJson(request,10000);
        if(b.confirm!=='MIGRATE_COURIER')return jsonRes({ok:false,error:'Migration confirmation required'},400,corsHeaders);
        try{
          // Add column last_invoice_requested_at to commerce_orders (ignore duplicate column errors safely)
          try {
            await env.DB.prepare("ALTER TABLE commerce_orders ADD COLUMN last_invoice_requested_at INTEGER DEFAULT 0").run();
          } catch(colErr) {
            console.log('[Migration Info] Column check (can ignore):', colErr.message);
          }
          await env.DB.batch(KR_PATHAO_MIGRATION_STATEMENTS.map(sql=>env.DB.prepare(sql)));
          return jsonRes({ok:true,migrated:true},200,corsHeaders);
        }catch(e){
          console.error('[Courier Migration]',e.message,e.stack);
          return jsonRes({ok:false,error:'Courier migration failed',detail:String(e.message||e).slice(0,500)},500,corsHeaders);
        }
      }

      /* GET /api/admin/pathao/stores */
      if (path === '/api/admin/pathao/stores' && request.method === 'GET') {
        if (!await verifyAdmin(request, env)) return jsonRes({ ok: false, error: 'Unauthorized' }, 401, corsHeaders);
        try {
          const data = await pathaoRequest('/aladdin/api/v1/stores', 'GET', null, env);
          return jsonRes({ ok: true, stores: data.data?.data || data.data || [] }, 200, corsHeaders);
        } catch (e) {
          return jsonRes({ ok: false, error: e.message }, 500, corsHeaders);
        }
      }

      /* GET /api/admin/pathao/cities — cached + normalized */
      if (path === '/api/admin/pathao/cities' && request.method === 'GET') {
        if (!await verifyAdmin(request, env)) return jsonRes({ ok: false, error: 'Unauthorized' }, 401, corsHeaders);
        try {
          const { items, cached } = await pathaoCachedList(env, 'pathao_cities', '/aladdin/api/v1/cities');
          return jsonRes({ ok: true, cities: items, cached }, 200, corsHeaders, { 'Cache-Control': 'no-store' });
        } catch (e) {
          return jsonRes({ ok: false, error: e.message }, 500, corsHeaders);
        }
      }

      /* GET /api/admin/pathao/zones — cached + normalized */
      if (path === '/api/admin/pathao/zones' && request.method === 'GET') {
        if (!await verifyAdmin(request, env)) return jsonRes({ ok: false, error: 'Unauthorized' }, 401, corsHeaders);
        const cityId = url.searchParams.get('city_id');
        if (!cityId || !/^\d{1,6}$/.test(cityId)) return jsonRes({ ok: false, error: 'Missing or invalid city_id' }, 400, corsHeaders);
        try {
          const { items, cached } = await pathaoCachedList(env, `pathao_zones_${cityId}`, `/aladdin/api/v1/cities/${cityId}/zone-list`);
          return jsonRes({ ok: true, zones: items, cached }, 200, corsHeaders, { 'Cache-Control': 'no-store' });
        } catch (e) {
          return jsonRes({ ok: false, error: e.message }, 500, corsHeaders);
        }
      }

      /* GET /api/admin/pathao/areas — cached + normalized */
      if (path === '/api/admin/pathao/areas' && request.method === 'GET') {
        if (!await verifyAdmin(request, env)) return jsonRes({ ok: false, error: 'Unauthorized' }, 401, corsHeaders);
        const zoneId = url.searchParams.get('zone_id');
        if (!zoneId || !/^\d{1,6}$/.test(zoneId)) return jsonRes({ ok: false, error: 'Missing or invalid zone_id' }, 400, corsHeaders);
        try {
          const { items, cached } = await pathaoCachedList(env, `pathao_areas_${zoneId}`, `/aladdin/api/v1/zones/${zoneId}/area-list`);
          return jsonRes({ ok: true, areas: items, cached }, 200, corsHeaders, { 'Cache-Control': 'no-store' });
        } catch (e) {
          return jsonRes({ ok: false, error: e.message }, 500, corsHeaders);
        }
      }

      /* POST /api/admin/pathao/order/create */
      if (path === '/api/admin/pathao/order/create' && request.method === 'POST') {
        if (!await verifyAdmin(request, env)) return jsonRes({ ok: false, error: 'Unauthorized' }, 401, corsHeaders);
        requireD1(env);
        const b = await readJson(request, 30000);
        const orderId = validOrderId(b.orderId);
        if (!orderId) return jsonRes({ ok: false, error: 'Invalid order ID' }, 400, corsHeaders);
        
        const existing = await env.DB.prepare(`SELECT consignment_id FROM courier_shipments WHERE order_id=?`).bind(orderId).first();
        if (existing) {
          return jsonRes({ ok: false, error: 'Order is already booked with Pathao', consignmentId: existing.consignment_id }, 400, corsHeaders);
        }
        
        try {
          const payload = {
            store_id: Number(b.storeId),
            merchant_order_id: orderId,
            sender_name: b.senderName || 'Kora Royal',
            sender_phone: b.senderPhone || '01935158745',
            recipient_name: b.recipientName,
            recipient_phone: b.recipientPhone,
            recipient_address: b.recipientAddress,
            recipient_city: Number(b.recipientCity),
            recipient_zone: Number(b.recipientZone),
            recipient_area: b.recipientArea ? Number(b.recipientArea) : null,
            delivery_type: Number(b.deliveryType || 48),
            item_type: Number(b.itemType || 2),
            special_instruction: b.specialInstruction || '',
            item_quantity: Number(b.itemQuantity || 1),
            item_weight: Number(b.itemWeight || 0.5),
            amount_to_collect: Number(b.amountToCollect || 0),
            item_description: b.itemDescription || 'Clothing'
          };
          
          const data = await pathaoRequest('/aladdin/api/v1/orders', 'POST', payload, env);
          if (!data.data || !data.data.consignment_id) {
            throw new Error(data.message || 'Failed to get consignment ID from Pathao');
          }
          
          const consignmentId = data.data.consignment_id;
          const deliveryFee = Number(data.data.delivery_fee || 0);
          const collectAmount = Number(data.data.amount_to_collect || 0);
          const now = Date.now();
          
          await env.DB.prepare(`INSERT INTO courier_shipments(order_id, provider, consignment_id, status, delivery_fee, collect_amount, raw_last_event, created_at, updated_at) VALUES(?, 'pathao', ?, 'draft', ?, ?, 'DRAFT_CREATED', ?, ?)`).bind(orderId, consignmentId, deliveryFee, collectAmount, now, now).run();
          await env.DB.prepare(`INSERT INTO commerce_order_history(order_id, status, note, actor, created_at) VALUES(?, ?, ?, 'system', ?)`).bind(orderId, 'draft', `Parcel drafted on Pathao. Consignment ID: ${consignmentId}. Delivery Fee: ৳${deliveryFee}. (Pickup request to be sent manually)`, now).run();
          
          const updated = await getCommerceOrder(env, orderId);
          if (updated) await mirrorCommerceOrderToKV(env, updated);
          
          return jsonRes({ ok: true, consignmentId, deliveryFee, order: commerceOrderForAdmin(updated) }, 200, corsHeaders);
        } catch (e) {
          console.error('[Pathao Order Create Error]', e.message);
          return jsonRes({ ok: false, error: e.message }, 500, corsHeaders);
        }
      }

      /* POST /api/admin/orders/create — ERP manual order creation */
      if (path === '/api/admin/orders/create' && request.method === 'POST') {
        if (!await verifyAdmin(request, env)) return jsonRes({ ok: false, error: 'Unauthorized' }, 401, corsHeaders);
        try {
          const body = await readJson(request, 50000);
          const res = await placeAdminOrder(request, env, body);
          
          /* Optional Pathao auto-booking — opt-in via Operations Settings
             ('pathao_auto_book' = '1'). Default OFF: merchant books manually.
             Uses the single shared autoBookPathao() helper (fixed URLs). */
          if (body.channel !== 'local' && ['confirmed','packing','packed'].includes(String(body.status||'pending'))) {
            try { await maybeAutoBookPathao(env, res.order); }
            catch (autoErr) { console.error('[Auto Pathao Admin Order]', autoErr.message); }
          }
          
          return jsonRes(res, 200, corsHeaders);
        } catch (e) {
          console.error('[Admin Order Create Error]', e.message);
          return jsonRes({ ok: false, error: e.message }, e.status || 500, corsHeaders);
        }
      }

      /* POST /api/pathao/webhook — public webhook callback from Pathao */
      if (path === '/api/pathao/webhook' && request.method === 'POST') {
        const body = await readJson(request, 100000).catch(() => ({}));
        console.log('[Pathao Webhook Received]', JSON.stringify(body));
        
        const secretRow = await env.DB.prepare(`SELECT setting_value FROM app_settings WHERE setting_key='pathao_webhook_secret'`).first();
        const secret = secretRow?.setting_value || '';

        /* Pathao webhook integration handshake:
           Pathao sends a `webhook_integration` event when you add the URL in the
           merchant portal. It requires a 202 response that echoes the
           X-Pathao-Merchant-Webhook-Integration-Secret header back.
           The secret can arrive in the request header OR in the body — we mirror
           whichever Pathao sent, falling back to the configured secret. */
        if (body && body.event === 'webhook_integration') {
          const hdrSecret = request.headers.get('X-Pathao-Merchant-Webhook-Integration-Secret') || '';
          const bodySecret = String(body.secret || body.integration_secret || body.merchant_secret || '').trim();
          const integrationSecret = hdrSecret || bodySecret || secret || '';
          return new Response(JSON.stringify({ ok: true, message: 'Webhook integrated' }), {
            status: 202,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json; charset=utf-8',
              'X-Pathao-Merchant-Webhook-Integration-Secret': integrationSecret
            }
          });
        }
        
        /* FIX — পাঠাও কোনো HMAC signature পাঠায় না; ভেরিফিকেশন হয়
           X-Pathao-Merchant-Webhook-Integration-Secret হেডার দিয়ে।
           পুরনো কোড X-Pathao-Signature চাইত — ওটা পাঠাও কখনো পাঠায় না।
           ফলে প্যানেলে webhook secret সেট করলে হ্যান্ডশেক ঠিকই হতো (ওটা
           আগেই return করে) কিন্তু প্রতিটা অর্ডার-ইভেন্ট 401 খেত।
           এখন integration-secret হেডারই প্রধান; পুরনোটাও ফলব্যাক হিসেবে চলে। */
        if (secret) {
          const got = request.headers.get('X-Pathao-Merchant-Webhook-Integration-Secret')
                   || request.headers.get('X-Pathao-Signature') || '';
          if (got !== secret) {
            console.warn('[Pathao Webhook] Secret mismatch (len received=%d, expected=%d)', got.length, secret.length);
            return jsonRes({ ok: false, error: 'Unauthorized signature' }, 401, corsHeaders);
          }
        }
        
        const event = body.event;
        const consignmentId = body.consignment_id;
        
        if (!consignmentId) {
          return jsonRes({ ok: false, error: 'Missing consignment_id' }, 400, corsHeaders);
        }
        
        requireD1(env);
        const shipment = await env.DB.prepare(`SELECT order_id, status FROM courier_shipments WHERE consignment_id=?`).bind(consignmentId).first();
        if (!shipment) {
          console.warn('[Pathao Webhook] Consignment ID not found in database:', consignmentId);
          return jsonRes({ ok: true, message: 'Consignment not found, ignored' }, 200, corsHeaders);
        }
        
        const orderId = shipment.order_id;
        let targetStatus = '';
        let note = `Pathao courier update: ${event}`;
        
        if (event === 'order.picked' || event === 'order.at-the-sorting-hub' || event === 'order.in-transit') {
          targetStatus = 'shipped';
        } else if (event === 'order.delivered') {
          targetStatus = 'delivered';
          note = `Pathao courier: Delivered successfully. Collected amount: ৳${body.collected_amount || 0}`;
        } else if (event === 'order.returned') {
          note = `Pathao courier: Parcel returned. Reason: ${body.reason || 'None'}`;
        } else if (event === 'order.delivery-failed') {
          note = `Pathao courier: Delivery failed. Reason: ${body.reason || 'None'}`;
        }
        
        await env.DB.prepare(`UPDATE courier_shipments SET status=?, raw_last_event=?, updated_at=? WHERE consignment_id=?`).bind(event, JSON.stringify(body), Date.now(), consignmentId).run();
        
        if (targetStatus) {
          try {
            const existingOrder = await getCommerceOrder(env, orderId);
            if (existingOrder && existingOrder.status !== targetStatus) {
              await transitionCommerceOrder(env, orderId, targetStatus, note, request);
              await sendTelegramMsg(`🚚 <b>COURIER AUTO-UPDATE</b>\n🆔 Order: <code>${htmlEsc(orderId)}</code>\n📦 Consignment: <code>${htmlEsc(consignmentId)}</code>\n➡️ Status: <b>${htmlEsc(targetStatus.toUpperCase())}</b>\n📝 Note: ${htmlEsc(note)}`, env.TELEGRAM_TOKEN, env.TELEGRAM_CHAT);
            }
          } catch (err) {
            console.error('[Pathao Webhook Transition Error]', err.message);
          }
        } else {
          await env.DB.prepare(`INSERT INTO commerce_order_history(order_id, status, note, actor, created_at) VALUES(?, (SELECT status FROM commerce_orders WHERE id=?), ?, 'system', ?)`).bind(orderId, orderId, note, Date.now()).run();
          await sendTelegramMsg(`ℹ️ <b>COURIER EVENT LOG</b>\n🆔 Order: <code>${htmlEsc(orderId)}</code>\n📦 Consignment: <code>${htmlEsc(consignmentId)}</code>\n🔔 Event: <b>${htmlEsc(event.toUpperCase())}</b>\n📝 Note: ${htmlEsc(note)}`, env.TELEGRAM_TOKEN, env.TELEGRAM_CHAT);
        }
        
        return jsonRes({ ok: true }, 200, corsHeaders);
      }

      /* POST /api/telegram/webhook — public webhook callback from Telegram Bot */
      if (path === '/api/telegram/webhook' && request.method === 'POST') {
        /* Extra shield: যদি TELEGRAM_WEBHOOK_SECRET সেট করা থাকে, Telegram-কে
           X-Telegram-Bot-Api-Secret-Token হেডারে সেটি দিতেই হবে।
           (BotFather/@Bot API দিয়ে setWebhook করার সময় secret_token দিন) */
        if (env.TELEGRAM_WEBHOOK_SECRET) {
          const hdr = request.headers.get('X-Telegram-Bot-Api-Secret-Token') || '';
          if (hdr !== env.TELEGRAM_WEBHOOK_SECRET) {
            console.warn('[Telegram Webhook] Bad/missing secret token');
            return jsonRes({ ok: false, error: 'Forbidden' }, 403, corsHeaders);
          }
        }
        const body = await readJson(request, 50000).catch(() => ({}));
        if (!body || !body.message) {
          return jsonRes({ ok: true }, 200, corsHeaders);
        }
        
        const msg = body.message;
        const chat = msg.chat || {};
        const text = msg.text || '';
        
        const authorizedChat = String(env.TELEGRAM_CHAT || '');
        if (authorizedChat && String(chat.id) !== authorizedChat) {
          console.log('[Telegram Webhook] Unauthorized Chat ID:', chat.id);
          return jsonRes({ ok: true, error: 'Unauthorized chat group' }, 200, corsHeaders);
        }
        
        if (text.includes('#status_update')) {
          const lines = text.split('\n');
          let orderId = '';
          let rawStatus = '';
          let note = '';
          
          for (const line of lines) {
            const lower = line.toLowerCase();
            if (lower.includes('order id:') || lower.includes('orderid:')) {
              orderId = line.split(':').slice(1).join(':').trim().replace(/`/g, '');
            } else if (lower.includes('status:')) {
              rawStatus = line.split(':').slice(1).join(':').trim().replace(/✅/g, '').replace(/❌/g, '').replace(/🚫/g, '').replace(/📦/g, '').replace(/🎁/g, '').replace(/🚚/g, '').replace(/🏠/g, '').trim();
            } else if (lower.includes('reviewed via:') || lower.includes('note:') || lower.includes('reason:')) {
              note = line.split(':').slice(1).join(':').trim();
            }
          }
          
          let targetStatus = '';
          const cleanStatus = rawStatus.toLowerCase();
          if (cleanStatus.includes('pending')) targetStatus = 'pending';
          else if (cleanStatus.includes('confirm')) targetStatus = 'confirmed';
          else if (cleanStatus.includes('packing')) targetStatus = 'packing';
          else if (cleanStatus.includes('packed')) targetStatus = 'packed';
          else if (cleanStatus.includes('shipped')) targetStatus = 'shipped';
          else if (cleanStatus.includes('deliver')) targetStatus = 'delivered';
          else if (cleanStatus.includes('cancel')) targetStatus = 'cancelled_by_seller';
          
          const validId = validOrderId(orderId);
          if (!validId) {
            await sendTelegramMsg(`⚠️ <b>Invalid Order ID format:</b> <code>${htmlEsc(orderId)}</code>`, env.TELEGRAM_TOKEN, env.TELEGRAM_CHAT);
            return jsonRes({ ok: true }, 200, corsHeaders);
          }
          
          if (!targetStatus) {
            await sendTelegramMsg(`⚠️ <b>Could not recognize status.</b> Specify: Pending, Confirmed, Packing, Packed, Shipped, Delivered, or Cancel.`, env.TELEGRAM_TOKEN, env.TELEGRAM_CHAT);
            return jsonRes({ ok: true }, 200, corsHeaders);
          }
          
          try {
            requireD1(env);
            const existing = await getCommerceOrder(env, validId);
            if (!existing) {
              await sendTelegramMsg(`⚠️ <b>Order not found:</b> <code>${htmlEsc(validId)}</code>`, env.TELEGRAM_TOKEN, env.TELEGRAM_CHAT);
              return jsonRes({ ok: true }, 200, corsHeaders);
            }
            
            const updated = await transitionCommerceOrder(env, validId, targetStatus, note || 'Status updated via Telegram bot', request);
            let replyMsg = `✅ <b>ORDER UPDATED VIA TELEGRAM</b>\n🆔 <code>${htmlEsc(validId)}</code>\n➡️ <b>${htmlEsc(targetStatus.toUpperCase())}</b>\n👤 ${htmlEsc(updated.customer.name)}\n📞 ${htmlEsc(updated.customer.phone)}`;
            
            /* Optional Pathao auto-booking — opt-in via Operations Settings
               ('pathao_auto_book' = '1'). Default OFF: merchant books manually.
               Uses the single shared autoBookPathao() helper (fixed URLs). */
            if (['confirmed','packing','packed'].includes(targetStatus)) {
              try { await maybeAutoBookPathao(env, updated); }
              catch (autoErr) { console.error('[Auto Pathao Telegram]', autoErr.message); }
            }
            
            await sendTelegramMsg(replyMsg, env.TELEGRAM_TOKEN, env.TELEGRAM_CHAT);
          } catch (e) {
            await sendTelegramMsg(`❌ <b>Failed to update order:</b> ${htmlEsc(e.message)}`, env.TELEGRAM_TOKEN, env.TELEGRAM_CHAT);
          }
        }
        
        return jsonRes({ ok: true }, 200, corsHeaders);
      }

      /* GET /api/order/invoice/request — customer/admin invoice request with 24h rate limit */
      if (path === '/api/order/invoice/request' && request.method === 'GET') {
        const orderId = validOrderId(url.searchParams.get('orderId'));
        if (!orderId) return jsonRes({ ok: false, error: 'Invalid order ID' }, 400, corsHeaders);
        
        requireD1(env);
        const order = await getCommerceOrder(env, orderId);
        if (!order) return jsonRes({ ok: false, error: 'Order not found' }, 404, corsHeaders);
        
        const lastReq = order.lastInvoiceRequestedAt || 0;
        const now = Date.now();
        const diff = now - lastReq;
        const is_admin = await verifyAdmin(request, env);

        /* Invoice-এ সম্পূর্ণ অর্ডার (ফোন/ঠিকানা/TrxID) থাকে — তাই কাস্টমারকে
           অর্ডারে ব্যবহৃত ফোন নম্বর দিয়ে verify করতে হয়। Admin skip. */
        if (!is_admin) {
          const phoneParam = normalizeBDPhone(url.searchParams.get('phone') || '');
          const orderPhone = normalizeBDPhone(order.customer?.phone || '');
          if (!phoneParam || phoneParam !== orderPhone) {
            return jsonRes({ ok:false, error:'Please provide the phone number used in this order', needPhone:true }, 403, corsHeaders);
          }
        }

        if (!is_admin && diff < 86400000) {
          const remaining = 86400000 - diff;
          return jsonRes({ ok: false, rateLimitTriggered: true, remaining }, 200, corsHeaders);
        }
        
        if (!is_admin) {
          await env.DB.prepare(`UPDATE commerce_orders SET last_invoice_requested_at=?, updated_at=? WHERE id=?`).bind(now, now, orderId).run();
          order.lastInvoiceRequestedAt = now;
          await mirrorCommerceOrderToKV(env, order);
        }
        
        return jsonRes({ ok: true, order }, 200, corsHeaders);
      }


      /* GET /api/admin/orders — server pagination */
      if (path === '/api/admin/orders' && request.method === 'GET') {
        if(!await verifyAdmin(request,env))return jsonRes({ok:false,error:'Unauthorized'},401,corsHeaders);
        requireD1(env);return jsonRes(await listCommerceOrders(env,url),200,corsHeaders);
      }

      /* GET /api/admin/order/:id */
      if (path.startsWith('/api/admin/order/') && request.method === 'GET') {
        if(!await verifyAdmin(request,env))return jsonRes({ok:false,error:'Unauthorized'},401,corsHeaders);
        const orderId=validOrderId(decodeURIComponent(path.split('/').pop()));if(!orderId)return jsonRes({ok:false,error:'Invalid order ID'},400,corsHeaders);
        if(env.DB){const order=await getCommerceOrder(env,orderId);if(order)return jsonRes({ok:true,order:commerceOrderForAdmin(order)},200,corsHeaders);}
        if(env.KR_ORDERS){const raw=await env.KR_ORDERS.get(`order:${orderId}`);if(raw)return jsonRes({ok:true,order:JSON.parse(raw)},200,corsHeaders);}
        return jsonRes({ok:false,error:'Order not found'},404,corsHeaders);
      }

      /* POST /api/admin/status — validates transitions and drives stock/sold */
      if (path === '/api/admin/status' && request.method === 'POST') {
        if(!await verifyAdmin(request,env))return jsonRes({ok:false,error:'Unauthorized'},401,corsHeaders);
        const body=await readJson(request,30000),orderId=validOrderId(body.orderId),status=cleanToken(body.status,50),note=cleanText(body.note||body.cancelReason,500);
        if(!orderId||!['confirmed','packing','packed','shipped','delivered','cancelled_by_seller'].includes(status))return jsonRes({ok:false,error:'Invalid order status request'},400,corsHeaders);
        if(env.DB){const existing=await getCommerceOrder(env,orderId);if(existing){const updated=await transitionCommerceOrder(env,orderId,status,note,request);await sendTelegramMsg(`🔄 <b>ORDER STATUS UPDATED</b>\n🆔 <code>${htmlEsc(orderId)}</code>\n➡️ <b>${htmlEsc(status.toUpperCase())}</b>\n👤 ${htmlEsc(updated.customer.name)}\n📞 ${htmlEsc(updated.customer.phone)}`,env.TELEGRAM_TOKEN,env.TELEGRAM_CHAT);
            /* NO auto booking — merchant manually sends each order to Pathao. */
            return jsonRes({ok:true,orderId,status:updated.status,order:commerceOrderForAdmin(updated)},200,corsHeaders);}}
        /* Legacy KV status update, without automatic stock accounting. */
        if(!env.KR_ORDERS)return jsonRes({ok:false,error:'Order not found'},404,corsHeaders);const raw=await env.KR_ORDERS.get(`order:${orderId}`);if(!raw)return jsonRes({ok:false,error:'Order not found'},404,corsHeaders);const o=JSON.parse(raw),now=Date.now();o.status=status;if(status==='cancelled_by_seller')o.cancelReason=note;o.statusHistory.push({status,time:now,note:note||'Status updated by admin'});await env.KR_ORDERS.put(`order:${orderId}`,JSON.stringify(o),{expirationTtl:60*60*24*90});return jsonRes({ok:true,orderId,status},200,corsHeaders);
      }

      if(path==='/api/admin/orders/bulk-status'&&request.method==='POST'){
        if(!await verifyAdmin(request,env))return jsonRes({ok:false,error:'Unauthorized'},401,corsHeaders);const b=await readJson(request,50000),ids=[...new Set((Array.isArray(b.orderIds)?b.orderIds:[]).map(validOrderId).filter(Boolean))].slice(0,5),status=cleanToken(b.status,50),note=cleanText(b.note,500);if(!ids.length||!['confirmed','packing','packed','shipped','delivered','cancelled_by_seller'].includes(status))return jsonRes({ok:false,error:'Select up to 5 orders and a valid status'},400,corsHeaders);const results=[];for(const id of ids){try{const o=await transitionCommerceOrder(env,id,status,note,request);results.push({orderId:id,ok:true,status:o.status})}catch(e){results.push({orderId:id,ok:false,error:e.message})}}return jsonRes({ok:true,results,successful:results.filter(x=>x.ok).length,failed:results.filter(x=>!x.ok).length},200,corsHeaders);
      }

      /* GET /api/admin/stats — D1 commerce statistics */
      if (path === '/api/admin/stats' && request.method === 'GET') {
        if(!await verifyAdmin(request,env))return jsonRes({ok:false,error:'Unauthorized'},401,corsHeaders);
        requireD1(env);return jsonRes(await commerceAdminStats(env),200,corsHeaders);
      }

      if(path==='/api/admin/operations-settings'&&request.method==='GET'){
        if(!await verifyAdmin(request,env))return jsonRes({ok:false,error:'Unauthorized'},401,corsHeaders);
        const keys=['return_request_days','refund_request_days','exchange_request_days','pathao_enabled','pathao_mode','pathao_sender_name','pathao_sender_phone','pathao_default_weight','pathao_default_item_type','pathao_default_delivery_type','pathao_store_id','pathao_webhook_secret','pathao_auto_book','pathao_default_quantity','pathao_amount_source','pathao_instruction_template','pathao_item_desc_sku','pathao_item_desc_price','pathao_item_desc_qty','pathao_item_desc_fallback'];
        const ph=keys.map(()=>'?').join(',');
        const q=await env.DB.prepare(`SELECT setting_key,setting_value FROM app_settings WHERE setting_key IN (${ph})`).bind(...keys).all();
        return jsonRes({ok:true,settings:Object.fromEntries((q.results||[]).map(x=>[x.setting_key,x.setting_value]))},200,corsHeaders);
      }
      if(path==='/api/admin/operations-settings'&&request.method==='POST'){
        if(!await verifyAdmin(request,env))return jsonRes({ok:false,error:'Unauthorized'},401,corsHeaders);
        const b=await readJson(request,20000),now=Date.now();
        const rows=[
          ['return_request_days',Math.max(0,Math.min(90,Number.isFinite(Number(b.returnDays))?Number(b.returnDays):7))],
          ['refund_request_days',Math.max(0,Math.min(90,Number.isFinite(Number(b.refundDays))?Number(b.refundDays):7))],
          ['exchange_request_days',Math.max(0,Math.min(90,Number.isFinite(Number(b.exchangeDays))?Number(b.exchangeDays):7))],
          ['pathao_enabled', (b.pathaoEnabled===true||b.pathaoEnabled===1||b.pathaoEnabled==='1')?'1':'0'],
          ['pathao_mode', b.pathaoMode==='live'?'live':'sandbox'],
          ['pathao_sender_name', cleanText(b.pathaoSenderName,120)],
          ['pathao_sender_phone', cleanText(b.pathaoSenderPhone,40)],
          ['pathao_default_weight', String(Math.max(0,Number(b.pathaoDefaultWeight)||0.5))],
          ['pathao_default_item_type', String(Math.trunc(Number(b.pathaoDefaultItemType)||2))],
          ['pathao_default_delivery_type', String(Math.trunc(Number(b.pathaoDefaultDeliveryType)||48))],
          ['pathao_store_id', String(Math.trunc(Number(b.pathaoStoreId)||0))],
          ['pathao_webhook_secret', cleanText(b.pathaoWebhookSecret,200)],
          ['pathao_auto_book', (b.pathaoAutoBook===true||b.pathaoAutoBook===1||b.pathaoAutoBook==='1')?'1':'0']
          ,['pathao_default_quantity', String(Math.max(1,Math.min(50,Math.trunc(Number(b.pathaoDefaultQuantity)||1))))]
          ,['pathao_amount_source', (b.pathaoAmountSource==='total_payable')?'total_payable':'cod_remaining']
          ,['pathao_instruction_template', cleanText(b.pathaoInstructionTemplate,400)]
          ,['pathao_item_desc_sku',  (b.pathaoItemDescSku  ===false||b.pathaoItemDescSku  ===0||b.pathaoItemDescSku  ==='0')?'0':'1']
          ,['pathao_item_desc_price',(b.pathaoItemDescPrice===false||b.pathaoItemDescPrice===0||b.pathaoItemDescPrice==='0')?'0':'1']
          ,['pathao_item_desc_qty',  (b.pathaoItemDescQty  ===false||b.pathaoItemDescQty  ===0||b.pathaoItemDescQty  ==='0')?'0':'1']
          ,['pathao_item_desc_fallback', cleanText(b.pathaoItemDescFallback,60) || 'Clothing']
        ];
        await env.DB.batch(rows.map(x=>env.DB.prepare(`INSERT INTO app_settings(setting_key,setting_value,updated_at) VALUES(?,?,?) ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value,updated_at=excluded.updated_at`).bind(x[0],String(x[1]),now)));
        await writeAudit(env,request,'operations_settings_update','settings','operations',Object.fromEntries(rows));
        return jsonRes({ok:true},200,corsHeaders);
      }

      /* POST /api/admin/telegram-test */
      if (path === '/api/admin/telegram-test' && request.method === 'POST') {
        if (!await verifyAdmin(request, env)) {
          return jsonRes({ ok: false, error: 'Unauthorized' }, 401, corsHeaders);
        }
        const body = await request.json();
        const msg  = body.message || '🧪 Test from KORA ROYAL Admin';
        const ok   = await sendTelegramMsg(msg, env.TELEGRAM_TOKEN, env.TELEGRAM_CHAT);
        return jsonRes({ ok }, 200, corsHeaders);
      }



      /* ════════════════════════════════════════════════════════
         PRODUCT CATALOG / INVENTORY V3 (D1)
         ════════════════════════════════════════════════════════ */

      const sizeDiagramMatch=path.match(/^\/api\/size-charts\/(\d+)\/diagram\.svg$/);
      if(sizeDiagramMatch&&request.method==='GET'){
        requireD1(env);
        const templateId=positiveInt(sizeDiagramMatch[1]);
        let row=null;
        try{
          row=await env.DB.prepare(`SELECT d.svg_code,d.content_hash,d.updated_at FROM size_chart_diagrams d JOIN size_chart_templates t ON t.id=d.template_id WHERE d.template_id=? AND d.enabled=1 AND t.status='active'`).bind(templateId).first();
        }catch(e){
          if(!String(e.message||'').toLowerCase().includes('no such table'))throw e;
        }
        if(!row)return jsonRes({ok:false,error:'Size diagram not found'},404,corsHeaders);
        const etag=`"${row.content_hash||row.updated_at||templateId}"`;
        if(request.headers.get('If-None-Match')===etag)return new Response(null,{status:304,headers:{...corsHeaders,ETag:etag}});
        return new Response(row.svg_code,{status:200,headers:{
          ...corsHeaders,
          'Content-Type':'image/svg+xml; charset=utf-8',
          'Cache-Control':'public, max-age=86400, immutable',
          'Content-Security-Policy':"sandbox; default-src 'none'; img-src data:; style-src 'unsafe-inline'",
          'X-Content-Type-Options':'nosniff',
          'Cross-Origin-Resource-Policy':'cross-origin',
          'ETag':etag
        }});
      }

      if (path === '/api/catalog' && request.method === 'GET') {
        requireD1(env);
        const catalog = await loadCatalogFromD1(env, false);
        return jsonRes({ ok: true, ...catalog }, 200, corsHeaders, {
          'Cache-Control': 'no-store, max-age=0',
          'X-Catalog-Version': String(catalog.version || 1)
        });
      }

      /* GET /api/catalog/version — ~৩০ বাইটের probe। ফ্রন্টএন্ড catalog-কে
         localStorage-এ cache করে রাখে এবং শুধু version বদলালেই পূর্ণ catalog
         আবার ডাউনলোড করে (আগের ?_=Date.now() cache-busting বন্ধ)।
         অ্যাডমিনের যেকোনো কন্টেন্ট এডিট bumpCatalogVersion()-এ version বাড়ায়। */
      if (path === '/api/catalog/version' && request.method === 'GET') {
        requireD1(env);
        const row = await env.DB.prepare(`SELECT setting_value FROM app_settings WHERE setting_key='catalog_version'`).first();
        return jsonRes({ ok: true, version: Number(row?.setting_value || 1) }, 200, corsHeaders, {
          'Cache-Control': 'no-store',
          'X-Catalog-Version': String(row?.setting_value || '1')
        });
      }

      if (path === '/api/products/view' && request.method === 'POST') {
        requireD1(env);
        const body=await readJson(request),productId=positiveInt(body.productId),visitorId=cleanText(body.visitorId,180);
        if(!productId||visitorId.length<12||!await isPublicProduct(env,productId))return jsonRes({ok:false,error:'Invalid product view'},400,corsHeaders);
        const now=Date.now(),cutoff=now-30*60*1000,visitorHash=await hashString(`product-view|${visitorId}|${env.VISITOR_SALT||env.ADMIN_SECRET||'kr'}`);
        await ensureProductStats(env,productId);
        const windowResult=await env.DB.prepare(`INSERT INTO product_view_windows(product_id,visitor_hash,last_counted_at) VALUES(?,?,?) ON CONFLICT(product_id,visitor_hash) DO UPDATE SET last_counted_at=excluded.last_counted_at WHERE product_view_windows.last_counted_at<=?`).bind(productId,visitorHash,now,cutoff).run();
        const counted=dbChanges(windowResult)>0;
        if(counted){const day=new Date(now).toISOString().slice(0,10);await env.DB.batch([env.DB.prepare(`UPDATE product_stats SET view_count=view_count+1,updated_at=? WHERE product_id=?`).bind(now,productId),env.DB.prepare(`INSERT INTO product_daily_views(product_id,day,view_count) VALUES(?,?,1) ON CONFLICT(product_id,day) DO UPDATE SET view_count=view_count+1`).bind(productId,day)]);}
        const stats=await getProductStats(env,productId);
        return jsonRes({ok:true,counted,nextEligibleAt:counted?now+30*60*1000:null,stats},200,corsHeaders);
      }

      if (path === '/api/products/like' && request.method === 'POST') {
        requireD1(env);
        const body = await readJson(request);
        const productId = positiveInt(body.productId);
        const action = body.action === 'unlike' ? 'unlike' : 'like';
        const visitorId = cleanText(body.visitorId, 180);
        if (!productId || visitorId.length < 12 || !await isPublicProduct(env, productId)) {
          return jsonRes({ ok: false, error: 'Invalid like request' }, 400, corsHeaders);
        }
        const visitorHash = await hashString(`product-like|${visitorId}|${env.VISITOR_SALT || env.ADMIN_SECRET || 'kr'}`);
        await ensureProductStats(env, productId);
        let changed = false;
        if (action === 'like') {
          const result = await env.DB.prepare(`INSERT OR IGNORE INTO product_likes(product_id,visitor_hash,created_at) VALUES(?,?,?)`)
            .bind(productId, visitorHash, Date.now()).run();
          changed = dbChanges(result) > 0;
          if (changed) {
            await env.DB.prepare(`UPDATE product_stats SET like_count=like_count+1,updated_at=? WHERE product_id=?`)
              .bind(Date.now(), productId).run();
          }
        } else {
          const result = await env.DB.prepare(`DELETE FROM product_likes WHERE product_id=? AND visitor_hash=?`)
            .bind(productId, visitorHash).run();
          changed = dbChanges(result) > 0;
          if (changed) {
            await env.DB.prepare(`UPDATE product_stats SET like_count=MAX(0,like_count-1),updated_at=? WHERE product_id=?`)
              .bind(Date.now(), productId).run();
          }
        }
        const stats = await getProductStats(env, productId);
        return jsonRes({ ok: true, action, changed, liked: action === 'like' ? changed || true : false, stats }, 200, corsHeaders);
      }

      if (path === '/api/products/like-state' && request.method === 'POST') {
        requireD1(env);
        const body = await readJson(request);
        const productId = positiveInt(body.productId);
        const visitorId = cleanText(body.visitorId, 180);
        if (!productId || visitorId.length < 12) return jsonRes({ ok:false, liked:false }, 200, corsHeaders);
        const visitorHash = await hashString(`product-like|${visitorId}|${env.VISITOR_SALT || env.ADMIN_SECRET || 'kr'}`);
        const row = await env.DB.prepare(`SELECT 1 AS liked FROM product_likes WHERE product_id=? AND visitor_hash=?`)
          .bind(productId, visitorHash).first();
        return jsonRes({ ok: true, liked: !!row }, 200, corsHeaders);
      }

      if (path === '/api/products/cart' && request.method === 'POST') {
        requireD1(env);
        const body=await readJson(request),productId=positiveInt(body.productId),pageSessionId=cleanToken(body.pageSessionId,120),actionKey=cleanToken(body.actionKey,180),actionType=cleanToken(body.actionType,60)||'selection',detail=cleanText(body.detail,400),visitorId=cleanText(body.visitorId,180);
        if(!productId||visitorId.length<12||pageSessionId.length<8||actionKey.length<2||!await isPublicProduct(env,productId))return jsonRes({ok:false,error:'Invalid cart event'},400,corsHeaders);
        const now=Date.now(),cutoff=now-24*60*60*1000,visitorHash=await hashString(`product-cart|${visitorId}|${env.VISITOR_SALT||env.ADMIN_SECRET||'kr'}`);
        await ensureProductStats(env,productId);
        const windowResult=await env.DB.prepare(`INSERT INTO product_cart_windows(product_id,visitor_hash,last_counted_at) VALUES(?,?,?) ON CONFLICT(product_id,visitor_hash) DO UPDATE SET last_counted_at=excluded.last_counted_at WHERE product_cart_windows.last_counted_at<=?`).bind(productId,visitorHash,now,cutoff).run();
        const counted=dbChanges(windowResult)>0;
        await env.DB.prepare(`INSERT OR IGNORE INTO product_cart_events(product_id,page_session_id,action_key,visitor_hash,action_type,detail,created_at) VALUES(?,?,?,?,?,?,?)`).bind(productId,pageSessionId,actionKey,visitorHash,actionType,detail,now).run();
        if(counted)await env.DB.prepare(`UPDATE product_stats SET cart_count=cart_count+1,updated_at=? WHERE product_id=?`).bind(now,productId).run();
        const stats=await getProductStats(env,productId);
        return jsonRes({ok:true,counted,nextEligibleAt:counted?now+24*60*60*1000:null,stats},200,corsHeaders);
      }

      /* HERO MANAGER — independent from products */
      if (path === '/api/admin/heroes' && request.method === 'GET') {
        if(!await verifyAdmin(request,env))return jsonRes({ok:false,error:'Unauthorized'},401,corsHeaders);
        requireD1(env);const rows=await env.DB.prepare(`SELECT * FROM hero_slides ORDER BY priority,id`).all();
        return jsonRes({ok:true,slides:(rows.results||[]).map(mapHeroSlideRow)},200,corsHeaders);
      }
      if (path === '/api/admin/heroes/save' && request.method === 'POST') {
        if(!await verifyAdmin(request,env))return jsonRes({ok:false,error:'Unauthorized'},401,corsHeaders);
        requireD1(env);const b=await readJson(request,50000),id=nullablePositiveInt(b.id),imageUrl=validHttpsUrl(b.imageUrl),now=Date.now();
        if(!imageUrl)return jsonRes({ok:false,error:'Valid HTTPS hero image URL required'},400,corsHeaders);
        const vals=[cleanText(b.internalName,150),imageUrl,cleanText(b.line1_en,300),cleanText(b.line2_en,300),cleanText(b.line3_en,300),cleanText(b.line1_bn,300),cleanText(b.line2_bn,300),cleanText(b.line3_bn,300),b.status==='archived'?'archived':'active',Math.trunc(Number(b.priority)||100)];
        if(id){const exists=await env.DB.prepare(`SELECT id FROM hero_slides WHERE id=?`).bind(id).first();if(!exists)return jsonRes({ok:false,error:'Hero slide not found'},404,corsHeaders);await env.DB.prepare(`UPDATE hero_slides SET internal_name=?,image_url=?,line1_en=?,line2_en=?,line3_en=?,line1_bn=?,line2_bn=?,line3_bn=?,status=?,priority=?,updated_at=? WHERE id=?`).bind(...vals,now,id).run();}
        else{await env.DB.prepare(`INSERT INTO hero_slides(internal_name,image_url,line1_en,line2_en,line3_en,line1_bn,line2_bn,line3_bn,status,priority,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).bind(...vals,now,now).run();}
        await bumpCatalogVersion(env);await writeAudit(env,request,id?'hero_update':'hero_create','hero',String(id||''),{internalName:vals[0],status:vals[8],priority:vals[9]});
        return jsonRes({ok:true},200,corsHeaders);
      }
      if (path === '/api/admin/heroes/status' && request.method === 'POST') {
        if(!await verifyAdmin(request,env))return jsonRes({ok:false,error:'Unauthorized'},401,corsHeaders);
        requireD1(env);const b=await readJson(request),id=positiveInt(b.id),status=['active','archived'].includes(b.status)?b.status:null;if(!id||!status)return jsonRes({ok:false,error:'Invalid hero status'},400,corsHeaders);
        await env.DB.prepare(`UPDATE hero_slides SET status=?,updated_at=? WHERE id=?`).bind(status,Date.now(),id).run();await bumpCatalogVersion(env);await writeAudit(env,request,'hero_status','hero',String(id),{status});return jsonRes({ok:true,id,status},200,corsHeaders);
      }
      if (path === '/api/admin/heroes/reorder' && request.method === 'POST') {
        if(!await verifyAdmin(request,env))return jsonRes({ok:false,error:'Unauthorized'},401,corsHeaders);
        requireD1(env);const b=await readJson(request),items=Array.isArray(b.items)?b.items.slice(0,100):[];if(!items.length)return jsonRes({ok:false,error:'No slides supplied'},400,corsHeaders);const now=Date.now();
        await env.DB.batch([...items.map((x,i)=>env.DB.prepare(`UPDATE hero_slides SET priority=?,updated_at=? WHERE id=?`).bind(i+1,now,positiveInt(x.id))),catalogVersionStatement(env,now)]);await writeAudit(env,request,'hero_reorder','hero','',{count:items.length});return jsonRes({ok:true},200,corsHeaders);
      }
      if (path === '/api/admin/heroes/delete' && request.method === 'DELETE') {
        if(!await verifyAdmin(request,env))return jsonRes({ok:false,error:'Unauthorized'},401,corsHeaders);
        requireD1(env);const b=await readJson(request),id=positiveInt(b.id);if(!id)return jsonRes({ok:false,error:'Invalid hero ID'},400,corsHeaders);await env.DB.prepare(`DELETE FROM hero_slides WHERE id=?`).bind(id).run();await bumpCatalogVersion(env);await writeAudit(env,request,'hero_delete','hero',String(id),{});return jsonRes({ok:true,id},200,corsHeaders);
      }

      /* SIZE CHART TEMPLATE MANAGER */
      if(path==='/api/admin/size-charts'&&request.method==='GET'){
        if(!await verifyAdmin(request,env))return jsonRes({ok:false,error:'Unauthorized'},401,corsHeaders);
        requireD1(env);
        const [t,a]=await Promise.all([
          env.DB.prepare(`SELECT * FROM size_chart_templates ORDER BY priority,id`).all(),
          env.DB.prepare(`SELECT product_id,template_id FROM product_size_chart_assignments`).all()
        ]);
        const diagrams=await loadSizeDiagramMap(env);
        return jsonRes({ok:true,templates:(t.results||[]).map(r=>mapSizeChartRow(r,diagrams.get(Number(r.id)),true)),assignments:a.results||[]},200,corsHeaders);
      }
      if(path==='/api/admin/size-charts/save'&&request.method==='POST'){
        if(!await verifyAdmin(request,env))return jsonRes({ok:false,error:'Unauthorized'},401,corsHeaders);
        requireD1(env);
        const b=await readJson(request,600000),id=nullablePositiveInt(b.id),grid=normalizeSizeGrid(b.grid),now=Date.now();
        const vals=[cleanText(b.internalName,150)||'Untitled Size Chart',cleanText(b.title_en,250),cleanText(b.title_bn,250),cleanText(b.description_en,3000),cleanText(b.description_bn,3000),JSON.stringify(grid),b.status==='archived'?'archived':'active',Math.trunc(Number(b.priority)||100)];
        let templateId=id;
        if(id){
          const exists=await env.DB.prepare(`SELECT id FROM size_chart_templates WHERE id=?`).bind(id).first();
          if(!exists)return jsonRes({ok:false,error:'Size chart not found'},404,corsHeaders);
          await env.DB.prepare(`UPDATE size_chart_templates SET internal_name=?,title_en=?,title_bn=?,description_en=?,description_bn=?,grid_json=?,status=?,priority=?,updated_at=? WHERE id=?`).bind(...vals,now,id).run();
        }else{
          const result=await env.DB.prepare(`INSERT INTO size_chart_templates(internal_name,title_en,title_bn,description_en,description_bn,grid_json,status,priority,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(...vals,now,now).run();
          templateId=Number(result?.meta?.last_row_id||0);
          if(!templateId){const saved=await env.DB.prepare(`SELECT id FROM size_chart_templates WHERE internal_name=? ORDER BY id DESC LIMIT 1`).bind(vals[0]).first();templateId=Number(saved?.id||0);}
        }
        if(!templateId)throw new HttpError(500,'Could not resolve saved size-chart ID');
        if(b.removeDiagram===true){
          try{await env.DB.prepare(`DELETE FROM size_chart_diagrams WHERE template_id=?`).bind(templateId).run();}catch(e){if(!String(e.message||'').toLowerCase().includes('no such table'))throw e;}
        }else if(b.diagram&&typeof b.diagram==='object'&&String(b.diagram.svg||'').trim()){
          const diagram=normalizeSizeDiagram(b.diagram);
          const contentHash=await hashString(diagram.svg);
          try{
            await env.DB.prepare(`INSERT INTO size_chart_diagrams(template_id,svg_code,alt_en,alt_bn,view_box,aspect_ratio,position,enabled,content_hash,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(template_id) DO UPDATE SET svg_code=excluded.svg_code,alt_en=excluded.alt_en,alt_bn=excluded.alt_bn,view_box=excluded.view_box,aspect_ratio=excluded.aspect_ratio,position=excluded.position,enabled=excluded.enabled,content_hash=excluded.content_hash,updated_at=excluded.updated_at`).bind(templateId,diagram.svg,diagram.alt_en,diagram.alt_bn,diagram.viewBox,diagram.aspectRatio,diagram.position,diagram.enabled?1:0,contentHash,now).run();
          }catch(e){
            if(String(e.message||'').toLowerCase().includes('no such table'))throw new HttpError(409,'Run the Size Diagram migration before saving SVG diagrams');
            throw e;
          }
        }else if(b.diagram&&typeof b.diagram==='object'){
          try{await env.DB.prepare(`UPDATE size_chart_diagrams SET alt_en=?,alt_bn=?,position=?,enabled=?,updated_at=? WHERE template_id=?`).bind(cleanText(b.diagram.alt_en,300),cleanText(b.diagram.alt_bn,300),b.diagram.position==='after_table'?'after_table':'before_table',b.diagram.enabled===false?0:1,now,templateId).run();}catch(e){if(!String(e.message||'').toLowerCase().includes('no such table'))throw e;}
        }
        await bumpCatalogVersion(env);
        await writeAudit(env,request,id?'size_chart_update':'size_chart_create','size_chart',String(templateId),{internalName:vals[0],rows:grid.cells.length,columns:grid.cells[0]?.length||0,diagram:!!String(b.diagram?.svg||'').trim(),removedDiagram:b.removeDiagram===true});
        return jsonRes({ok:true,id:templateId},200,corsHeaders);
      }
      if(path==='/api/admin/size-charts/status'&&request.method==='POST'){
        if(!await verifyAdmin(request,env))return jsonRes({ok:false,error:'Unauthorized'},401,corsHeaders);requireD1(env);const b=await readJson(request),id=positiveInt(b.id),status=['active','archived'].includes(b.status)?b.status:null;if(!id||!status)return jsonRes({ok:false,error:'Invalid size chart status'},400,corsHeaders);if(status==='archived'){const used=await env.DB.prepare(`SELECT COUNT(*) count FROM product_size_chart_assignments WHERE template_id=?`).bind(id).first();if(Number(used?.count||0)>0)return jsonRes({ok:false,error:'Template is assigned to products. Reassign them before archiving.'},409,corsHeaders);}await env.DB.prepare(`UPDATE size_chart_templates SET status=?,updated_at=? WHERE id=?`).bind(status,Date.now(),id).run();await bumpCatalogVersion(env);await writeAudit(env,request,'size_chart_status','size_chart',String(id),{status});return jsonRes({ok:true,id,status},200,corsHeaders);
      }
      if(path==='/api/admin/size-charts/reorder'&&request.method==='POST'){
        if(!await verifyAdmin(request,env))return jsonRes({ok:false,error:'Unauthorized'},401,corsHeaders);requireD1(env);const b=await readJson(request),items=Array.isArray(b.items)?b.items.slice(0,100):[];if(!items.length)return jsonRes({ok:false,error:'No templates supplied'},400,corsHeaders);const now=Date.now();await env.DB.batch([...items.map((x,i)=>env.DB.prepare(`UPDATE size_chart_templates SET priority=?,updated_at=? WHERE id=?`).bind(i+1,now,positiveInt(x.id))),catalogVersionStatement(env,now)]);return jsonRes({ok:true},200,corsHeaders);
      }
      if(path==='/api/admin/size-charts/delete'&&request.method==='DELETE'){
        if(!await verifyAdmin(request,env))return jsonRes({ok:false,error:'Unauthorized'},401,corsHeaders);requireD1(env);const b=await readJson(request),id=positiveInt(b.id);if(!id)return jsonRes({ok:false,error:'Invalid template ID'},400,corsHeaders);const used=await env.DB.prepare(`SELECT COUNT(*) count FROM product_size_chart_assignments WHERE template_id=?`).bind(id).first();if(Number(used?.count||0)>0)return jsonRes({ok:false,error:'Template is assigned to products. Reassign or archive it instead.'},409,corsHeaders);await env.DB.prepare(`DELETE FROM size_chart_templates WHERE id=?`).bind(id).run();await bumpCatalogVersion(env);return jsonRes({ok:true,id},200,corsHeaders);
      }

      if (path === '/api/admin/products' && request.method === 'GET') {
        if (!await verifyAdmin(request, env)) return jsonRes({ ok:false,error:'Unauthorized' }, 401, corsHeaders);
        requireD1(env);
        const catalog = await loadCatalogFromD1(env, true);
        return jsonRes({ ok: true, ...catalog }, 200, corsHeaders);
      }

      if (path.startsWith('/api/admin/product/') && request.method === 'GET') {
        if (!await verifyAdmin(request, env)) return jsonRes({ ok:false,error:'Unauthorized' }, 401, corsHeaders);
        requireD1(env);
        const id = positiveInt(path.split('/').pop());
        const catalog = await loadCatalogFromD1(env, true);
        const product = catalog.products.find(p => p.id === id);
        if (!product) return jsonRes({ ok:false,error:'Product not found' }, 404, corsHeaders);
        return jsonRes({ ok:true, product }, 200, corsHeaders);
      }

      if (path === '/api/admin/products/save' && request.method === 'POST') {
        if (!await verifyAdmin(request, env)) return jsonRes({ ok:false,error:'Unauthorized' }, 401, corsHeaders);
        requireD1(env);
        const body = await readJson(request, 750000);
        const product = await saveProductGraph(env, body, request);
        return jsonRes({ ok:true, product, message:'Product saved and catalog published' }, 200, corsHeaders);
      }

      if (path === '/api/admin/products/status' && request.method === 'POST') {
        if (!await verifyAdmin(request, env)) return jsonRes({ ok:false,error:'Unauthorized' }, 401, corsHeaders);
        requireD1(env);
        const body = await readJson(request);
        const productId = positiveInt(body.productId);
        const status = ['draft','active','archived'].includes(body.status) ? body.status : null;
        const salesStatus = ['available','limited','out_of_stock'].includes(body.salesStatus) ? body.salesStatus : null;
        if (!productId || (!status && !salesStatus)) return jsonRes({ok:false,error:'Invalid status'},400,corsHeaders);
        const now = Date.now();
        if (status) {
          await env.DB.prepare(`UPDATE products SET status=?,archived_at=?,updated_at=? WHERE id=?`)
            .bind(status, status === 'archived' ? now : null, now, productId).run();
        }
        if (salesStatus) {
          await env.DB.prepare(`UPDATE products SET sales_status=?,updated_at=? WHERE id=?`)
            .bind(salesStatus, now, productId).run();
        }
        await bumpCatalogVersion(env);
        await writeAudit(env, request, 'product_status', 'product', String(productId), {status,salesStatus});
        return jsonRes({ok:true,productId,status,salesStatus},200,corsHeaders);
      }

      if (path === '/api/admin/products/reorder' && request.method === 'POST') {
        if (!await verifyAdmin(request, env)) return jsonRes({ ok:false,error:'Unauthorized' }, 401, corsHeaders);
        requireD1(env);
        const body = await readJson(request);
        const items = Array.isArray(body.items) ? body.items.slice(0,500) : [];
        if (!items.length) return jsonRes({ok:false,error:'No products supplied'},400,corsHeaders);
        const now = Date.now();
        const statements = items.map((item,index) => env.DB.prepare(`UPDATE products SET priority=?,showcase_row=?,showcase_position=?,updated_at=? WHERE id=?`)
          .bind(Number.isFinite(Number(item.priority)) ? Number(item.priority) : index+1,
                nullablePositiveInt(item.row), nullablePositiveInt(item.position), now, positiveInt(item.id)));
        statements.push(catalogVersionStatement(env, now));
        await env.DB.batch(statements);
        await writeAudit(env, request, 'product_reorder', 'product', '', {count:items.length});
        return jsonRes({ok:true},200,corsHeaders);
      }

      if (path === '/api/admin/inventory/adjust' && request.method === 'POST') {
        if (!await verifyAdmin(request, env)) return jsonRes({ ok:false,error:'Unauthorized' }, 401, corsHeaders);
        requireD1(env);
        const body = await readJson(request);
        const variantId = positiveInt(body.variantId);
        const delta = Math.trunc(Number(body.delta));
        const note = cleanText(body.note, 600);
        if (!variantId || !Number.isFinite(delta) || delta === 0 || Math.abs(delta) > 100000) {
          return jsonRes({ok:false,error:'Invalid stock adjustment'},400,corsHeaders);
        }
        const variant = await env.DB.prepare(`SELECT id,product_id,stock_qty FROM product_variants WHERE id=?`).bind(variantId).first();
        if (!variant) return jsonRes({ok:false,error:'Variant not found'},404,corsHeaders);
        const after = Number(variant.stock_qty) + delta;
        const now = Date.now();
        await env.DB.batch([
          env.DB.prepare(`UPDATE product_variants SET stock_qty=?,updated_at=? WHERE id=?`).bind(after,now,variantId),
          env.DB.prepare(`INSERT INTO inventory_movements(product_id,variant_id,movement_type,quantity,before_qty,after_qty,source,note,admin_ref,created_at)
            VALUES(?,?,?,?,?,?,?,?,?,?)`)
            .bind(variant.product_id,variantId,'correction',delta,variant.stock_qty,after,'admin',note,'admin',now)
        ]);
        await writeAudit(env, request, 'stock_adjust', 'variant', String(variantId), {delta,before:variant.stock_qty,after,note});
        return jsonRes({ok:true,variantId,stockQty:after},200,corsHeaders);
      }

      if(path==='/api/admin/inventory/bulk-adjust'&&request.method==='POST'){
        if(!await verifyAdmin(request,env))return jsonRes({ok:false,error:'Unauthorized'},401,corsHeaders);requireD1(env);const b=await readJson(request,100000),ids=[...new Set((Array.isArray(b.variantIds)?b.variantIds:[]).map(positiveInt).filter(Boolean))].slice(0,500),delta=Math.trunc(Number(b.delta)),note=cleanText(b.note,600),jobId=cleanToken(b.jobId,120)||crypto.randomUUID();
        if(!ids.length||!Number.isFinite(delta)||delta===0||Math.abs(delta)>100000)return jsonRes({ok:false,error:'Select variants and enter a non-zero stock change'},400,corsHeaders);
        const job=await env.DB.prepare(`INSERT OR IGNORE INTO inventory_bulk_jobs(id,variant_count,quantity_delta,note,created_at) VALUES(?,?,?,?,?)`).bind(jobId,ids.length,delta,note,Date.now()).run();if(dbChanges(job)===0)return jsonRes({ok:true,duplicate:true,jobId,updated:0},200,corsHeaders);
        const now=Date.now(),statements=[];for(let i=0;i<ids.length;i+=80){const chunk=ids.slice(i,i+80),marks=chunk.map(()=>'?').join(',');statements.push(env.DB.prepare(`INSERT OR IGNORE INTO inventory_movements(product_id,variant_id,movement_type,quantity,before_qty,after_qty,source,note,admin_ref,created_at,idempotency_key) SELECT product_id,id,'correction',?,stock_qty,stock_qty+?,'admin',?,'admin',?,?||':'||id FROM product_variants WHERE id IN (${marks})`).bind(delta,delta,note,now,`bulk:${jobId}`,...chunk));statements.push(env.DB.prepare(`UPDATE product_variants SET stock_qty=stock_qty+?,updated_at=? WHERE id IN (${marks})`).bind(delta,now,...chunk));}
        try{await env.DB.batch(statements);await writeAudit(env,request,'bulk_stock_adjust','inventory',jobId,{variantIds:ids,delta,note});return jsonRes({ok:true,jobId,updated:ids.length,delta},200,corsHeaders)}catch(e){await env.DB.prepare(`DELETE FROM inventory_bulk_jobs WHERE id=?`).bind(jobId).run();throw e;}
      }

      if (path === '/api/admin/sales/manual' && request.method === 'POST') {
        if (!await verifyAdmin(request, env)) return jsonRes({ ok:false,error:'Unauthorized' }, 401, corsHeaders);
        requireD1(env);
        const body = await readJson(request);
        const productId = positiveInt(body.productId);
        const variantId = nullablePositiveInt(body.variantId);
        const source = ['whatsapp','call','offline','adjustment'].includes(body.source) ? body.source : null;
        const quantity = Math.trunc(Number(body.quantity));
        const adjustStock = body.adjustStock === true || body.adjustStock === 1;
        const note = cleanText(body.note, 600);
        if (!productId || !source || !Number.isFinite(quantity) || quantity === 0 || Math.abs(quantity) > 100000) {
          return jsonRes({ok:false,error:'Invalid manual sale'},400,corsHeaders);
        }
        if (source !== 'adjustment' && quantity < 1) return jsonRes({ok:false,error:'Quantity must be positive'},400,corsHeaders);
        const product = await env.DB.prepare(`SELECT id FROM products WHERE id=?`).bind(productId).first();
        if (!product) return jsonRes({ok:false,error:'Product not found'},404,corsHeaders);
        let variant = null;
        if (variantId) {
          variant = await env.DB.prepare(`SELECT id,product_id,stock_qty FROM product_variants WHERE id=? AND product_id=?`)
            .bind(variantId,productId).first();
          if (!variant) return jsonRes({ok:false,error:'Variant not found'},404,corsHeaders);
        }
        await ensureProductStats(env, productId);
        const column = source === 'whatsapp' ? 'whatsapp_sold'
          : source === 'call' ? 'call_sold'
          : source === 'offline' ? 'offline_sold' : 'manual_adjustment';
        const now = Date.now();
        const statements = [
          env.DB.prepare(`INSERT INTO sale_events(product_id,variant_id,source,quantity,adjust_stock,note,admin_ref,created_at)
            VALUES(?,?,?,?,?,?,?,?)`).bind(productId,variantId,source,quantity,adjustStock?1:0,note,'admin',now),
          env.DB.prepare(`UPDATE product_stats SET ${column}=MAX(0,${column}+?),updated_at=? WHERE product_id=?`)
            .bind(quantity,now,productId)
        ];
        if (adjustStock && variant) {
          const after = Number(variant.stock_qty) - quantity;
          statements.push(env.DB.prepare(`UPDATE product_variants SET stock_qty=?,updated_at=? WHERE id=?`).bind(after,now,variantId));
          statements.push(env.DB.prepare(`INSERT INTO inventory_movements(product_id,variant_id,movement_type,quantity,before_qty,after_qty,source,note,admin_ref,created_at)
            VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(productId,variantId,'manual_sale',-quantity,variant.stock_qty,after,source,note,'admin',now));
        }
        await env.DB.batch(statements);
        await writeAudit(env, request, 'manual_sale', 'product', String(productId), {variantId,source,quantity,adjustStock,note});
        const stats = await getProductStats(env, productId);
        return jsonRes({ok:true,stats},200,corsHeaders);
      }

      if (path === '/api/admin/inventory/alerts' && request.method === 'GET') {
        if (!await verifyAdmin(request, env)) return jsonRes({ ok:false,error:'Unauthorized' }, 401, corsHeaders);
        requireD1(env);
        const result = await env.DB.prepare(`SELECT v.id AS variant_id,v.product_id,v.sku,v.title,v.stock_qty,v.reserved_qty,v.low_stock_threshold,
            p.name_en,p.name_bn,p.sales_status
          FROM product_variants v JOIN products p ON p.id=v.product_id
          WHERE p.status='active' AND v.is_active=1 AND v.stock_qty-v.reserved_qty<=v.low_stock_threshold
          ORDER BY (v.stock_qty-v.reserved_qty) ASC,p.priority ASC LIMIT 500`).all();
        return jsonRes({ok:true,alerts:result.results||[]},200,corsHeaders);
      }

      if (path === '/api/admin/gallery' && request.method === 'GET') {
        if (!await verifyAdmin(request, env)) return jsonRes({ok:false,error:'Unauthorized'},401,corsHeaders);
        requireD1(env);
        const rows = await env.DB.prepare(`SELECT * FROM gallery_items ORDER BY sort_order,id`).all();
        return jsonRes({ok:true,items:(rows.results||[]).map(mapGalleryRow)},200,corsHeaders);
      }

      if (path === '/api/admin/gallery/save' && request.method === 'POST') {
        if (!await verifyAdmin(request, env)) return jsonRes({ok:false,error:'Unauthorized'},401,corsHeaders);
        requireD1(env);
        const body = await readJson(request);
        const id = nullablePositiveInt(body.id);
        const urlValue = validHttpsUrl(body.url);
        if (!urlValue) return jsonRes({ok:false,error:'Valid HTTPS image URL required'},400,corsHeaders);
        const now = Date.now();
        if (id) {
          await env.DB.prepare(`UPDATE gallery_items SET url=?,name_en=?,name_bn=?,sort_order=?,status=?,updated_at=? WHERE id=?`)
            .bind(urlValue,cleanText(body.nameEn,150)||'KORA ROYAL Collection',cleanText(body.nameBn,150)||'করা রয়্যাল কালেকশন',Number(body.sortOrder)||100,body.status==='archived'?'archived':'active',now,id).run();
        } else {
          await env.DB.prepare(`INSERT INTO gallery_items(url,name_en,name_bn,sort_order,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)`)
            .bind(urlValue,cleanText(body.nameEn,150)||'KORA ROYAL Collection',cleanText(body.nameBn,150)||'করা রয়্যাল কালেকশন',Number(body.sortOrder)||100,'active',now,now).run();
        }
        await bumpCatalogVersion(env);
        return jsonRes({ok:true},200,corsHeaders);
      }


      /* ════════════════════════════════════════════════════════
         COUPON ENGINE — D1-backed, admin-managed
         ════════════════════════════════════════════════════════ */

      /* POST /api/coupons/validate — public preview quote.
         ক্লায়েন্টের পাঠানো দাম শুধু preview-এর জন্য; আসল অর্ডারে
         resolveCoupon আবার সার্ভার-সাইডে D1 থেকে দাম নিয়ে চলে। */
      if (path === '/api/coupons/validate' && request.method === 'POST') {
        requireD1(env);
        const body = await readJson(request, 20000);
        try {
          const code = cleanText(body.code, 40).toUpperCase();
          if (!code) throw new HttpError(400, 'Enter a coupon code');
          const rawItems = Array.isArray(body.items) ? body.items.slice(0, 20) : [];
          const items = rawItems.map(i => ({
            quantity: Math.max(0, Math.trunc(Number(i.quantity)) || 0),
            unitPrice: Math.max(0, Number(i.unitPrice) || 0)
          })).filter(i => i.quantity > 0 && i.unitPrice > 0);
          const subtotal = roundMoney(items.reduce((s, i) => s + i.unitPrice * i.quantity, 0));
          if (!(subtotal > 0)) throw new HttpError(400, 'Add products before applying a coupon');
          const district = cleanText(body.district, 100);
          const delivery0 = baseDeliveryFee(district, subtotal, false);
          const coupon = await resolveCoupon(env, code, body.phone, items, subtotal, delivery0);
          const after = subtotal - coupon.discountAmt;
          const delivery = coupon.freeDelivery ? 0 : baseDeliveryFee(district, after, false);
          return jsonRes({
            ok: true, code: coupon.code, type: coupon.type, value: coupon.value,
            discountAmt: coupon.discountAmt, freeDelivery: coupon.freeDelivery,
            subtotalAfterDiscount: roundMoney(after), delivery
          }, 200, corsHeaders);
        } catch (e) {
          if (e instanceof HttpError) return jsonRes({ ok:false, error:e.message }, e.status, corsHeaders);
          throw e;
        }
      }

      /* GET /api/admin/coupons — list with usage counts */
      if (path === '/api/admin/coupons' && request.method === 'GET') {
        if (!await verifyAdmin(request, env)) return jsonRes({ok:false,error:'Unauthorized'},401,corsHeaders);
        requireD1(env);
        if (!await couponsTableReady(env)) return jsonRes({ ok:true, coupons:[], needsMigration:true }, 200, corsHeaders);
        const rows = await env.DB.prepare(`SELECT c.*,(SELECT COUNT(*) FROM coupon_redemptions r WHERE r.coupon_code=c.code) redemptions FROM coupons c ORDER BY c.created_at DESC`).all();
        return jsonRes({ ok:true, coupons:(rows.results||[]).map(mapCouponRow) }, 200, corsHeaders);
      }

      /* POST /api/admin/coupons/save — create or update */
      if (path === '/api/admin/coupons/save' && request.method === 'POST') {
        if (!await verifyAdmin(request, env)) return jsonRes({ok:false,error:'Unauthorized'},401,corsHeaders);
        requireD1(env);
        if (!await couponsTableReady(env)) return jsonRes({ ok:false, error:'Coupon tables are not ready. Run POST /api/admin/migrate-coupons first.', needsMigration:true }, 400, corsHeaders);
        const b = await readJson(request, 20000);
        try {
          const out = await saveCoupon(env, b, request);
          return jsonRes({ ok:true, ...out }, 200, corsHeaders);
        } catch (e) {
          if (e instanceof HttpError) return jsonRes({ok:false,error:e.message},e.status,corsHeaders);
          throw e;
        }
      }

      /* POST /api/admin/coupons/status — enable/disable */
      if (path === '/api/admin/coupons/status' && request.method === 'POST') {
        if (!await verifyAdmin(request, env)) return jsonRes({ok:false,error:'Unauthorized'},401,corsHeaders);
        requireD1(env);
        const b = await readJson(request, 10000);
        const code = cleanText(b.code, 40).toUpperCase();
        const status = ['active','disabled'].includes(b.status) ? b.status : null;
        if (!code || !status) return jsonRes({ ok:false, error:'Invalid coupon status request' }, 400, corsHeaders);
        const r = await env.DB.prepare(`UPDATE coupons SET status=?,updated_at=? WHERE code=?`).bind(status, Date.now(), code).run();
        if (dbChanges(r) === 0) return jsonRes({ ok:false, error:'Coupon not found' }, 404, corsHeaders);
        await writeAudit(env, request, 'coupon_status', 'coupon', code, {status});
        return jsonRes({ ok:true, code, status }, 200, corsHeaders);
      }

      /* DELETE /api/admin/coupons/delete */
      if (path === '/api/admin/coupons/delete' && request.method === 'DELETE') {
        if (!await verifyAdmin(request, env)) return jsonRes({ok:false,error:'Unauthorized'},401,corsHeaders);
        requireD1(env);
        const b = await readJson(request, 10000);
        const code = cleanText(b.code, 40).toUpperCase();
        if (!code) return jsonRes({ ok:false, error:'Coupon code required' }, 400, corsHeaders);
        const r = await env.DB.prepare(`DELETE FROM coupons WHERE code=?`).bind(code).run();
        if (dbChanges(r) === 0) return jsonRes({ ok:false, error:'Coupon not found' }, 404, corsHeaders);
        /* D1 FKs are not enforced — clean redemptions manually. */
        await env.DB.prepare(`DELETE FROM coupon_redemptions WHERE coupon_code=?`).bind(code).run();
        await writeAudit(env, request, 'coupon_delete', 'coupon', code, {});
        return jsonRes({ ok:true, code }, 200, corsHeaders);
      }

      /* GET /api/admin/coupons/redemptions?code= — recent usage history */
      if (path === '/api/admin/coupons/redemptions' && request.method === 'GET') {
        if (!await verifyAdmin(request, env)) return jsonRes({ok:false,error:'Unauthorized'},401,corsHeaders);
        requireD1(env);
        if (!await couponsTableReady(env)) return jsonRes({ ok:true, redemptions:[], needsMigration:true }, 200, corsHeaders);
        const code = cleanText(url.searchParams.get('code'), 40).toUpperCase();
        const rows = code
          ? await env.DB.prepare(`SELECT * FROM coupon_redemptions WHERE coupon_code=? ORDER BY created_at DESC LIMIT 100`).bind(code).all()
          : await env.DB.prepare(`SELECT * FROM coupon_redemptions ORDER BY created_at DESC LIMIT 100`).all();
        return jsonRes({ ok:true, redemptions: rows.results || [] }, 200, corsHeaders);
      }

      /* ════════════════════════════════════════════════════════
         NEW — REVIEW ENDPOINTS
         ════════════════════════════════════════════════════════ */

      /* ──────────────────────────────────────────
         GET /api/reviews
         Public: Approved + Auto-shown reviews
         Query: ?filter=all|5|4|3|lowest|images
                &page=1
         ────────────────────────────────────────── */
      if (path === '/api/reviews' && request.method === 'GET') {
        if (!env.KR_ORDERS) {
          return jsonRes({ ok: false, error: 'Storage not configured' }, 500, corsHeaders);
        }

        const filter = url.searchParams.get('filter') || 'all';
        const page   = parseInt(url.searchParams.get('page') || '1');
        const limit  = 50; /* একসাথে max 50 review */

        /* Index থেকে ID list আনি */
        const indexRaw = await env.KR_ORDERS.get('rv_index');
        const index    = indexRaw ? JSON.parse(indexRaw) : [];

        /* প্রতিটা review fetch */
        const reviews = [];
        for (const id of index) {
          const raw = await env.KR_ORDERS.get(`review:${id}`);
          if (!raw) continue;
          const r = JSON.parse(raw);

          /* শুধু approved বা auto-shown দেখাবো */
          if (r.status !== 'approved' && r.status !== 'auto') continue;

          /* Image data ছাড়া frontend পাঠাই (URL শুধু) */
          reviews.push(safeReviewForPublic(r));
        }

        /* Filter apply */
        const filtered = applyReviewFilter(reviews, filter);

        /* Priority sort */
        const sorted = sortByPriorityScore(filtered);

        /* Pagination */
        const total     = sorted.length;
        const start     = (page - 1) * limit;
        const paginated = sorted.slice(start, start + limit);

        return jsonRes({
          ok: true,
          reviews: paginated,
          total,
          page,
          pages: Math.ceil(total / limit)
        }, 200, corsHeaders);
      }

      /* ──────────────────────────────────────────
         GET /api/reviews/stats
         Public: Live rating summary
         ────────────────────────────────────────── */
      if (path === '/api/reviews/stats' && request.method === 'GET') {
        if (!env.KR_ORDERS) {
          return jsonRes({ ok: false, error: 'Storage not configured' }, 500, corsHeaders);
        }

        /* Cache check (5 min) */
        const cacheRaw = await env.KR_ORDERS.get('rv_stat:summary');
        if (cacheRaw) {
          const cache = JSON.parse(cacheRaw);
          if (Date.now() - cache.cachedAt < 5 * 60 * 1000) {
            return jsonRes({ ok: true, ...cache.data }, 200, corsHeaders);
          }
        }

        /* Fresh calculate */
        const indexRaw = await env.KR_ORDERS.get('rv_index');
        const index    = indexRaw ? JSON.parse(indexRaw) : [];

        const breakdown = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
        let sum   = 0;
        let total = 0;
        let withImages = 0;

        for (const id of index) {
          const raw = await env.KR_ORDERS.get(`review:${id}`);
          if (!raw) continue;
          const r = JSON.parse(raw);
          if (r.status !== 'approved' && r.status !== 'auto') continue;

          sum += r.rating;
          total++;
          breakdown[r.rating] = (breakdown[r.rating] || 0) + 1;
          if (r.hasProductImages) withImages++;
        }

        const avg = total ? (sum / total).toFixed(1) : '0.0';

        const statsData = { avg, total, breakdown, withImages };

        /* Cache সেভ */
        await env.KR_ORDERS.put('rv_stat:summary', JSON.stringify({
          data: statsData,
          cachedAt: Date.now()
        }), { expirationTtl: 3600 });

        return jsonRes({ ok: true, ...statsData }, 200, corsHeaders);
      }

      /* ──────────────────────────────────────────
         POST /api/reviews/submit
         Public: Submit new review
         Body: {
           rating, text_en, name?,
           avatar?,        ← base64 string (max 2MB)
           productImgs?,   ← base64 array (max 3, 5MB each)
           lang?
         }
         ────────────────────────────────────────── */
      if (path === '/api/reviews/submit' && request.method === 'POST') {
        if (!env.KR_ORDERS) {
          return jsonRes({ ok: false, error: 'Storage not configured' }, 500, corsHeaders);
        }

        const body = await readJson(request, 7000000);

        /* ── Validation ── */
        const rating = parseInt(body.rating);
        if (!rating || rating < 1 || rating > 5) {
          return jsonRes({ ok: false, error: 'Invalid rating (1-5 required)' }, 400, corsHeaders);
        }

        /* Server-side sanitization — raw HTML/script কখনোই KV-তে জমা হয় না */
        const text = cleanText(body.text_en, 500);
        if (!text || text.length < 10) {
          return jsonRes({ ok: false, error: 'Review text must be at least 10 characters' }, 400, corsHeaders);
        }
        if (text.length > 500) {
          return jsonRes({ ok: false, error: 'Review text must be under 500 characters' }, 400, corsHeaders);
        }

        /* ── Image validation ── */
        const MAX_AVATAR_BYTES  = 2 * 1024 * 1024;  /* 2MB */
        const MAX_PRODUCT_BYTES = 5 * 1024 * 1024;  /* 5MB */

        let avatarData = null;
        if (body.avatar) {
          const b64Size = estimateBase64Size(body.avatar);
          if (b64Size > MAX_AVATAR_BYTES) {
            return jsonRes({ ok: false, error: 'Avatar image too large (max 2MB)' }, 400, corsHeaders);
          }
          if (!isValidImageBase64(body.avatar)) {
            return jsonRes({ ok: false, error: 'Invalid avatar format. JPG/PNG/WEBP only' }, 400, corsHeaders);
          }
          avatarData = body.avatar;
        }

        let productImgsData = [];
        if (body.productImgs && Array.isArray(body.productImgs)) {
          if (body.productImgs.length > 3) {
            return jsonRes({ ok: false, error: 'Maximum 3 product images allowed' }, 400, corsHeaders);
          }
          for (const img of body.productImgs) {
            const b64Size = estimateBase64Size(img);
            if (b64Size > MAX_PRODUCT_BYTES) {
              return jsonRes({ ok: false, error: 'Product image too large (max 5MB each)' }, 400, corsHeaders);
            }
            if (!isValidImageBase64(img)) {
              return jsonRes({ ok: false, error: 'Invalid product image format. JPG/PNG/WEBP only' }, 400, corsHeaders);
            }
            productImgsData.push(img);
          }
        }

        /* যদি Cloudinary configured না থাকে তবে base64 সরাসরি KV-তে যায় —
           সেক্ষেত্রে কঠোর cap, নাহলে আগের মতো 5-6MB রিভিউ রেসপন্স হয়ে যাবে */
        if (!isCloudinaryConfigured(env)) {
          const NO_CL_LIMIT = 750 * 1024; /* 750KB প্রতি ছবি */
          if ((avatarData && estimateBase64Size(avatarData) > NO_CL_LIMIT) ||
              productImgsData.some(i => estimateBase64Size(i) > NO_CL_LIMIT)) {
            return jsonRes({ ok:false, error:'Image too large for this server (keep each image under 750KB)' }, 400, corsHeaders);
          }
        }

        /* ── Anonymous counter ── */
        let anonNum = null;
        const nameRaw = cleanText(body.name, 80);
        if (!nameRaw) {
          const counterRaw = await env.KR_ORDERS.get('rv_anon');
          const counter    = counterRaw ? parseInt(counterRaw) + 1 : 1;
          await env.KR_ORDERS.put('rv_anon', String(counter));
          anonNum = counter;
        }

        /* ── Rate limiting (IP based, basic) ── */
        const clientIP   = request.headers.get('CF-Connecting-IP') || 'unknown';
        const ipHash     = await hashString(clientIP);
        const rateLimKey = `rv_rl:${ipHash}`;
        const rateLimRaw = await env.KR_ORDERS.get(rateLimKey);
        if (rateLimRaw) {
          const rl = JSON.parse(rateLimRaw);
          /* Same IP থেকে 1 ঘণ্টায় max 3 review */
          if (rl.count >= 3) {
            return jsonRes({
              ok: false,
              error: 'Too many reviews. Please wait before submitting again.'
            }, 429, corsHeaders);
          }
          rl.count++;
          await env.KR_ORDERS.put(rateLimKey, JSON.stringify(rl), {
            expirationTtl: 3600
          });
        } else {
          await env.KR_ORDERS.put(rateLimKey, JSON.stringify({ count: 1 }), {
            expirationTtl: 3600
          });
        }

        /* ── Build review object ── */
        const id  = `rv-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
        const now = Date.now();

        const hasProductImages = productImgsData.length > 0;

        /* Auto-show rule:
           rating >= 4 AND (has avatar OR has product images)
           → status = 'auto', shown immediately without approval */
        const autoShow = rating >= 4 && (avatarData || hasProductImages);

        /* ── Cloudinary upload (base64 → AUTO-OPTIMIZED URL) ──
           Secrets configured থাকলে upload বাধ্যতামূলক — fail হলে স্পষ্ট error
           (চুপচাপ base64 fallback = আবার 6MB রেসপন্স)। configured না থাকলেই
           শুধু base64 fallback (উপরের কঠোর cap সহ)। */
        let avatarStored = avatarData;
        let productImgsStored = productImgsData;
        if (isCloudinaryConfigured(env) && (avatarData || productImgsData.length)) {
          try {
            const folder = 'kora-royal/reviews';
            if (avatarData) {
              avatarStored = await cloudinaryUpload(env, avatarData, folder, `${id}-avatar`, 'f_auto,q_auto,w_300,h_300,c_fill,g_auto');
            }
            if (productImgsData.length) {
              const uploaded = [];
              for (let i = 0; i < productImgsData.length; i++) {
                uploaded.push(await cloudinaryUpload(env, productImgsData[i], folder, `${id}-${i}`, 'f_auto,q_auto,w_1200,c_limit'));
              }
              productImgsStored = uploaded;
            }
          } catch (ce) {
            console.error('[Cloudinary Upload]', ce.message);
            return jsonRes({ ok:false, error:'Image upload failed. Please try again with a smaller image.' }, 502, corsHeaders);
          }
        }

        const review = {
          id,
          rating,
          text_en:         text,
          text_bn:         text,       /* User এক ভাষায় লেখে */
          name:            nameRaw || null,
          anonNum,
          location_en:     '',
          location_bn:     '',
          avatar:          avatarStored,       /* URL (or base64 fallback) stored in KV */
          productImgs:     productImgsStored,  /* URL array (or base64 fallback) */
          hasProductImages,
          likes:           0,
          status:          autoShow ? 'auto' : 'pending',
          verified:        false,
          approvedBy:      autoShow ? 'auto' : null,
          approvedAt:      autoShow ? now : null,
          rejectedAt:      null,
          date:            new Date(now).toISOString(),
          createdAt:       now,
          priorityBoost:   0,
          ipHash,
        };

        /* ── KV তে সেভ ── */
        await env.KR_ORDERS.put(
          `review:${id}`,
          JSON.stringify(review),
          { expirationTtl: 60 * 60 * 24 * 365 } /* 1 বছর */
        );

        /* ── Index আপডেট ── */
        const indexRaw = await env.KR_ORDERS.get('rv_index');
        const index    = indexRaw ? JSON.parse(indexRaw) : [];
        index.unshift(id); /* নতুন review সামনে */
        await env.KR_ORDERS.put('rv_index', JSON.stringify(index));

        /* ── Stats cache invalidate ── */
        await env.KR_ORDERS.delete('rv_stat:summary');

        /* ── Telegram notification to admin ── */
        const tgMsg = buildReviewTelegramMsg(review, autoShow);
        await sendTelegramMsg(tgMsg, env.TELEGRAM_TOKEN, env.TELEGRAM_CHAT);

        return jsonRes({
          ok: true,
          id,
          status:    review.status,
          autoShown: autoShow,
          message:   autoShow
            ? 'Review is now visible (pending full verification)'
            : 'Review submitted successfully. It will appear after approval.'
        }, 200, corsHeaders);
      }

      /* ──────────────────────────────────────────
         POST /api/reviews/like
         Public: Like / Unlike a review
         Body: { id, action: 'like'|'unlike' }
         ────────────────────────────────────────── */
      if (path === '/api/reviews/like' && request.method === 'POST') {
        if (!env.KR_ORDERS) {
          return jsonRes({ ok: false, error: 'Storage not configured' }, 500, corsHeaders);
        }

        const body = await request.json();
        const { id, action } = body;

        if (!id || !['like','unlike'].includes(action)) {
          return jsonRes({ ok: false, error: 'Invalid request' }, 400, corsHeaders);
        }

        /* IP-based spam prevention */
        const clientIP   = request.headers.get('CF-Connecting-IP') || 'unknown';
        const ipHash     = await hashString(clientIP);
        const likeKey    = `rv_like:${id}:${ipHash}`;
        const alreadyRaw = await env.KR_ORDERS.get(likeKey);
        const alreadyLiked = !!alreadyRaw;

        if (action === 'like' && alreadyLiked) {
          return jsonRes({ ok: false, error: 'Already liked' }, 400, corsHeaders);
        }
        if (action === 'unlike' && !alreadyLiked) {
          return jsonRes({ ok: false, error: 'Not liked yet' }, 400, corsHeaders);
        }

        /* Review fetch & update */
        const raw = await env.KR_ORDERS.get(`review:${id}`);
        if (!raw) return jsonRes({ ok: false, error: 'Review not found' }, 404, corsHeaders);

        const review    = JSON.parse(raw);
        review.likes    = Math.max(0, (review.likes || 0) + (action === 'like' ? 1 : -1));

        await env.KR_ORDERS.put(`review:${id}`, JSON.stringify(review), {
          expirationTtl: 60 * 60 * 24 * 365
        });

        /* Like record save/delete */
        if (action === 'like') {
          await env.KR_ORDERS.put(likeKey, '1', { expirationTtl: 60 * 60 * 24 * 365 });
        } else {
          await env.KR_ORDERS.delete(likeKey);
        }

        return jsonRes({ ok: true, likes: review.likes, action }, 200, corsHeaders);
      }

      /* ──────────────────────────────────────────
         GET /api/admin/reviews
         Admin: All reviews (all statuses)
         Query: ?status=all|pending|approved|auto|rejected
                &page=1
         ────────────────────────────────────────── */
      if (path === '/api/admin/reviews' && request.method === 'GET') {
        if (!await verifyAdmin(request, env)) {
          return jsonRes({ ok: false, error: 'Unauthorized' }, 401, corsHeaders);
        }
        if (!env.KR_ORDERS) {
          return jsonRes({ ok: false, error: 'Storage not configured' }, 500, corsHeaders);
        }

        const statusFilter = url.searchParams.get('status') || 'all';
        const page         = parseInt(url.searchParams.get('page') || '1');
        const limit        = 30;

        const indexRaw = await env.KR_ORDERS.get('rv_index');
        const index    = indexRaw ? JSON.parse(indexRaw) : [];

        const reviews = [];
        for (const id of index) {
          const raw = await env.KR_ORDERS.get(`review:${id}`);
          if (!raw) continue;
          const r = JSON.parse(raw);

          if (statusFilter !== 'all' && r.status !== statusFilter) continue;

          /* Admin কে full data দেই (images সহ) */
          reviews.push(r);
        }

        /* Newest first */
        reviews.sort((a, b) => b.createdAt - a.createdAt);

        const total     = reviews.length;
        const start     = (page - 1) * limit;
        const paginated = reviews.slice(start, start + limit);

        /* Count by status */
        const counts = { pending: 0, auto: 0, approved: 0, rejected: 0 };
        for (const id of index) {
          const raw = await env.KR_ORDERS.get(`review:${id}`);
          if (!raw) continue;
          const r = JSON.parse(raw);
          if (counts[r.status] !== undefined) counts[r.status]++;
        }

        return jsonRes({
          ok: true,
          reviews: paginated,
          total,
          page,
          pages: Math.ceil(total / limit),
          counts
        }, 200, corsHeaders);
      }

      /* ──────────────────────────────────────────
         POST /api/admin/reviews/approve
         Admin: Approve a review
         Body: { id, approvedBy: 'admin'|'moderator'|'employee'|'auto' }
         ────────────────────────────────────────── */
      if (path === '/api/admin/reviews/approve' && request.method === 'POST') {
        if (!await verifyAdmin(request, env)) {
          return jsonRes({ ok: false, error: 'Unauthorized' }, 401, corsHeaders);
        }

        const body = await request.json();
        const { id, approvedBy } = body;

        if (!id) return jsonRes({ ok: false, error: 'Review ID required' }, 400, corsHeaders);

        const validBy = ['admin','moderator','employee','auto'];
        const byValue = validBy.includes(approvedBy) ? approvedBy : 'admin';

        const raw = await env.KR_ORDERS.get(`review:${id}`);
        if (!raw) return jsonRes({ ok: false, error: 'Review not found' }, 404, corsHeaders);

        const review       = JSON.parse(raw);
        review.status      = 'approved';
        review.verified    = true;
        review.approvedBy  = byValue;
        review.approvedAt  = Date.now();
        review.rejectedAt  = null;

        await env.KR_ORDERS.put(`review:${id}`, JSON.stringify(review), {
          expirationTtl: 60 * 60 * 24 * 365
        });

        /* Stats cache invalidate */
        await env.KR_ORDERS.delete('rv_stat:summary');

        return jsonRes({
          ok: true,
          id,
          status: 'approved',
          approvedBy: byValue,
          message: 'Review approved and now visible on frontend'
        }, 200, corsHeaders);
      }

      /* ──────────────────────────────────────────
         POST /api/admin/reviews/reject
         Admin: Reject a review
         Body: { id, reason? }
         ────────────────────────────────────────── */
      if (path === '/api/admin/reviews/reject' && request.method === 'POST') {
        if (!await verifyAdmin(request, env)) {
          return jsonRes({ ok: false, error: 'Unauthorized' }, 401, corsHeaders);
        }

        const body = await request.json();
        const { id, reason } = body;

        if (!id) return jsonRes({ ok: false, error: 'Review ID required' }, 400, corsHeaders);

        const raw = await env.KR_ORDERS.get(`review:${id}`);
        if (!raw) return jsonRes({ ok: false, error: 'Review not found' }, 404, corsHeaders);

        const review      = JSON.parse(raw);
        review.status     = 'rejected';
        review.verified   = false;
        review.approvedBy = null;
        review.approvedAt = null;
        review.rejectedAt = Date.now();
        review.rejectReason = reason || null;

        await env.KR_ORDERS.put(`review:${id}`, JSON.stringify(review), {
          expirationTtl: 60 * 60 * 24 * 365
        });

        /* Stats cache invalidate */
        await env.KR_ORDERS.delete('rv_stat:summary');

        return jsonRes({ ok: true, id, status: 'rejected' }, 200, corsHeaders);
      }

      /* ──────────────────────────────────────────
         POST /api/admin/reviews/revoke
         Admin: Revoke approval → back to pending
         Body: { id }
         ────────────────────────────────────────── */
      if (path === '/api/admin/reviews/revoke' && request.method === 'POST') {
        if (!await verifyAdmin(request, env)) {
          return jsonRes({ ok: false, error: 'Unauthorized' }, 401, corsHeaders);
        }

        const body = await request.json();
        const { id } = body;

        if (!id) return jsonRes({ ok: false, error: 'Review ID required' }, 400, corsHeaders);

        const raw = await env.KR_ORDERS.get(`review:${id}`);
        if (!raw) return jsonRes({ ok: false, error: 'Review not found' }, 404, corsHeaders);

        const review      = JSON.parse(raw);
        review.status     = 'pending';
        review.verified   = false;
        review.approvedBy = null;
        review.approvedAt = null;

        await env.KR_ORDERS.put(`review:${id}`, JSON.stringify(review), {
          expirationTtl: 60 * 60 * 24 * 365
        });

        await env.KR_ORDERS.delete('rv_stat:summary');

        return jsonRes({ ok: true, id, status: 'pending', message: 'Approval revoked' }, 200, corsHeaders);
      }

      /* ──────────────────────────────────────────
         POST /api/admin/reviews/priority
         Admin: Set priority boost
         Body: { id, boost: 0-20 }
         ────────────────────────────────────────── */
      if (path === '/api/admin/reviews/priority' && request.method === 'POST') {
        if (!await verifyAdmin(request, env)) {
          return jsonRes({ ok: false, error: 'Unauthorized' }, 401, corsHeaders);
        }

        const body = await request.json();
        const { id, boost } = body;

        if (!id) return jsonRes({ ok: false, error: 'Review ID required' }, 400, corsHeaders);

        const boostVal = Math.max(0, Math.min(20, parseInt(boost) || 0));

        const raw = await env.KR_ORDERS.get(`review:${id}`);
        if (!raw) return jsonRes({ ok: false, error: 'Review not found' }, 404, corsHeaders);

        const review       = JSON.parse(raw);
        review.priorityBoost = boostVal;

        await env.KR_ORDERS.put(`review:${id}`, JSON.stringify(review), {
          expirationTtl: 60 * 60 * 24 * 365
        });

        return jsonRes({ ok: true, id, priorityBoost: boostVal }, 200, corsHeaders);
      }

      /* ──────────────────────────────────────────
         DELETE /api/admin/reviews/delete
         Admin: Permanently delete a review
         Body: { id }
         ────────────────────────────────────────── */
      if (path === '/api/admin/reviews/delete' && request.method === 'DELETE') {
        if (!await verifyAdmin(request, env)) {
          return jsonRes({ ok: false, error: 'Unauthorized' }, 401, corsHeaders);
        }

        const body = await request.json();
        const { id } = body;

        if (!id) return jsonRes({ ok: false, error: 'Review ID required' }, 400, corsHeaders);

        /* KV থেকে delete */
        await env.KR_ORDERS.delete(`review:${id}`);

        /* Index থেকে সরাই */
        const indexRaw = await env.KR_ORDERS.get('rv_index');
        if (indexRaw) {
          const index    = JSON.parse(indexRaw);
          const newIndex = index.filter(i => i !== id);
          await env.KR_ORDERS.put('rv_index', JSON.stringify(newIndex));
        }

        await env.KR_ORDERS.delete('rv_stat:summary');

        return jsonRes({ ok: true, id, message: 'Review permanently deleted' }, 200, corsHeaders);
      }

      /* ──────────────────────────────────────────
         POST /api/admin/reviews/migrate-images
         Admin (one-time repair): KV-তে জমে থাকা পুরনো base64
         ইমেজগুলো Cloudinary-তে তুলে optimized URL বসায়।
         ────────────────────────────────────────── */
      if (path === '/api/admin/reviews/migrate-images' && request.method === 'POST') {
        if (!await verifyAdmin(request, env)) {
          return jsonRes({ ok: false, error: 'Unauthorized' }, 401, corsHeaders);
        }
        if (!env.KR_ORDERS) return jsonRes({ ok: false, error: 'Storage not configured' }, 500, corsHeaders);
        if (!isCloudinaryConfigured(env)) {
          return jsonRes({ ok: false, error: 'Cloudinary secrets are not configured in this Worker' }, 503, corsHeaders);
        }
        const indexRaw = await env.KR_ORDERS.get('rv_index');
        const index = indexRaw ? JSON.parse(indexRaw) : [];
        let scanned = 0, migrated = 0, failed = 0, alreadyOk = 0;
        for (const id of index.slice(0, 50)) {
          const raw = await env.KR_ORDERS.get(`review:${id}`);
          if (!raw) continue;
          const r = JSON.parse(raw);
          scanned++;
          let changed = false;
          try {
            if (r.avatar && String(r.avatar).startsWith('data:image')) {
              r.avatar = await cloudinaryUpload(env, r.avatar, 'kora-royal/reviews', `${id}-avatar`, 'f_auto,q_auto,w_300,h_300,c_fill,g_auto');
              changed = true;
            }
            if (Array.isArray(r.productImgs)) {
              const out = [];
              for (let i = 0; i < r.productImgs.length; i++) {
                const img = r.productImgs[i];
                if (String(img).startsWith('data:image')) {
                  out.push(await cloudinaryUpload(env, img, 'kora-royal/reviews', `${id}-${i}`, 'f_auto,q_auto,w_1200,c_limit'));
                  changed = true;
                } else out.push(img);
              }
              r.productImgs = out;
            }
            if (changed) {
              await env.KR_ORDERS.put(`review:${id}`, JSON.stringify(r), { expirationTtl: 60 * 60 * 24 * 365 });
              migrated++;
            } else alreadyOk++;
          } catch (e) {
            failed++;
            console.error('[Review image migrate]', id, e.message);
          }
        }
        await env.KR_ORDERS.delete('rv_stat:summary');
        return jsonRes({ ok: true, scanned, migrated, alreadyCloudinary: alreadyOk, failed }, 200, corsHeaders);
      }

      /* ════════════════════════════════════════
         UNKNOWN PATH
         ════════════════════════════════════════ */
      return jsonRes({ ok: false, error: 'Not found' }, 404, corsHeaders);

    } catch (err) {
      console.error('[Worker] Error:', err.message, err.stack);
      const status = err instanceof HttpError ? err.status : 500;
      const message = err instanceof HttpError ? err.message : 'Internal error';
      return jsonRes({ ok: false, error: message }, status, corsHeaders);
    }
  },

  /* Scheduled maintenance only — no fake automatic order statuses. */
  async scheduled(event, env, ctx) {
    if(env.DB){
      const cutoff=Date.now()-30*24*60*60*1000;
      ctx.waitUntil(env.DB.batch([
        env.DB.prepare(`DELETE FROM product_cart_events WHERE created_at<?`).bind(cutoff),
        env.DB.prepare(`DELETE FROM product_view_windows WHERE last_counted_at<?`).bind(cutoff),
        env.DB.prepare(`DELETE FROM product_cart_windows WHERE last_counted_at<?`).bind(cutoff)
      ]));
    }
  }
};





/* ================================================================
   OPERATIONS / CRM / SERVICE REQUEST HELPERS
   ================================================================ */
function normalizeCustomerPhone(raw){return normalizeBDPhone(raw);}
async function upsertCustomerFromOrder(env,order){
  try{
    if(!await d1TableExists(env,'customers'))return null;const c=order.customer||{},phone=normalizeCustomerPhone(c.phone);if(!/^01[3-9]\d{8}$/.test(phone))return null;const now=Date.now();
    await env.DB.prepare(`INSERT INTO customers(primary_phone,display_name,email,district,created_at,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(primary_phone) DO UPDATE SET display_name=CASE WHEN excluded.display_name<>'' THEN excluded.display_name ELSE customers.display_name END,email=CASE WHEN excluded.email<>'' THEN excluded.email ELSE customers.email END,district=CASE WHEN excluded.district<>'' THEN excluded.district ELSE customers.district END,updated_at=excluded.updated_at`).bind(phone,cleanText(c.name,120),cleanText(c.email,180),cleanText(c.district,100),now,now).run();
    const row=await env.DB.prepare(`SELECT id FROM customers WHERE primary_phone=?`).bind(phone).first();if(!row)return null;const id=Number(row.id);
    await env.DB.batch([
      env.DB.prepare(`INSERT OR IGNORE INTO customer_phones(customer_id,phone,label,is_primary,created_at) VALUES(?,?,'Primary',1,?)`).bind(id,phone,now),
      env.DB.prepare(`INSERT OR IGNORE INTO order_customer_links(order_id,customer_id,created_at) VALUES(?,?,?)`).bind(order.orderId,id,now),
      ...(c.address?[env.DB.prepare(`INSERT OR IGNORE INTO customer_addresses(customer_id,district,thana,address,label,last_used_at,created_at) VALUES(?,?,?,?, 'Order address',?,?)`).bind(id,cleanText(c.district,100),cleanText(c.thana,150),cleanText(c.address,500),now,now)]:[]),
      env.DB.prepare(`UPDATE leads SET linked_customer_id=?,stage='purchased',last_seen_at=? WHERE phone=?`).bind(id,now,phone)
    ]);return id;
  }catch(e){console.error('[CRM upsert]',e.message);return null;}
}
async function saveLeadSnapshot(env,payload){
  try{if(!await d1TableExists(env,'leads'))return;const visitor=cleanToken(payload.userId||payload.visitorId||payload.sessionId,150);if(!visitor)return;const now=Date.now(),phone=normalizeCustomerPhone(payload.phone),stage=cleanToken(payload.stage,60)||'landing';
    await env.DB.prepare(`INSERT INTO leads(visitor_id,name,phone,email,district,address,stage,source,campaign,product_views_json,cart_json,form_json,first_seen_at,last_seen_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(visitor_id) DO UPDATE SET name=CASE WHEN excluded.name<>'' THEN excluded.name ELSE leads.name END,phone=CASE WHEN excluded.phone<>'' THEN excluded.phone ELSE leads.phone END,email=CASE WHEN excluded.email<>'' THEN excluded.email ELSE leads.email END,district=CASE WHEN excluded.district<>'' THEN excluded.district ELSE leads.district END,address=CASE WHEN excluded.address<>'' THEN excluded.address ELSE leads.address END,stage=excluded.stage,source=CASE WHEN excluded.source<>'' THEN excluded.source ELSE leads.source END,campaign=CASE WHEN excluded.campaign<>'' THEN excluded.campaign ELSE leads.campaign END,product_views_json=excluded.product_views_json,cart_json=excluded.cart_json,form_json=excluded.form_json,last_seen_at=excluded.last_seen_at`).bind(visitor,cleanText(payload.name,120),phone,cleanText(payload.email,180),cleanText(payload.district,100),cleanText(payload.address,500),stage,cleanText(payload.source,100),cleanText(payload.campaign,100),JSON.stringify(payload.productsViewed||[]),JSON.stringify(payload.cartItems||[]),JSON.stringify(payload),now,now).run();
  }catch(e){console.error('[Lead snapshot]',e.message)}
}
function requestWindowDays(settings,type){return Math.max(0,Math.min(90,Number(settings[`${type}_request_days`]||7)));}
async function getRequestSettings(env){const r=await env.DB.prepare(`SELECT setting_key,setting_value FROM app_settings WHERE setting_key IN ('return_request_days','refund_request_days','exchange_request_days')`).all();return Object.fromEntries((r.results||[]).map(x=>[x.setting_key,x.setting_value]));}
async function listOrderRequests(env,orderId){if(!await d1TableExists(env,'order_service_requests'))return[];const r=await env.DB.prepare(`SELECT id,order_id,request_type,reason,customer_note,items_json,status,resolution_json,created_at,updated_at FROM order_service_requests WHERE order_id=? ORDER BY created_at DESC`).bind(orderId).all();return(r.results||[]).map(x=>({...x,items:safeJsonParse(x.items_json,[]),resolution:safeJsonParse(x.resolution_json,{})}));}
async function createServiceRequest(request,env,body){
  requireD1(env);const orderId=validOrderId(body.orderId),type=['return','refund','exchange'].includes(body.requestType)?body.requestType:null,phone=normalizeCustomerPhone(body.phone);if(!orderId||!type||!phone)throw new HttpError(400,'Order ID, request type and phone are required');const order=await getCommerceOrder(env,orderId);if(!order)throw new HttpError(404,'Order not found');if(normalizeCustomerPhone(order.customer.phone)!==phone)throw new HttpError(403,'Phone number does not match this order');
  const settings=await getRequestSettings(env),days=requestWindowDays(settings,type),deliveredEvent=[...(order.statusHistory||[])].reverse().find(h=>h.status==='delivered'),base=order.status==='delivered'?(deliveredEvent?.time||order.updatedAt):order.createdAt;if(order.status!=='delivered')throw new HttpError(409,'This request is available after delivery');if(Date.now()>base+days*86400000)throw new HttpError(403,`${type} request window has expired`);
  const requested=Array.isArray(body.items)?body.items.slice(0,30):[],valid=[];for(const x of requested){const item=order.items.find(i=>Number(i.id)===Number(x.orderItemId));const qty=Math.min(Number(item?.quantity||0),Math.max(1,Math.trunc(Number(x.quantity)||1)));if(item)valid.push({orderItemId:item.id,productId:item.productId,variantId:item.variantId,productName:item.productName,sku:item.sku,quantity:qty,unitPrice:item.unitPrice});}if(!valid.length)throw new HttpError(400,'Select at least one order item');
  const now=Date.now(),id=`REQ-${now}-${crypto.randomUUID().slice(0,8).toUpperCase()}`,key=cleanToken(body.idempotencyKey,150)||`${orderId}:${type}:${now}`,reason=cleanText(body.reason,250),note=cleanText(body.note,1000);if(!reason)throw new HttpError(400,'Reason is required');const duplicate=await env.DB.prepare(`SELECT id,order_id,request_type,status FROM order_service_requests WHERE idempotency_key=?`).bind(key).first();if(duplicate)return{id:duplicate.id,orderId:duplicate.order_id,type:duplicate.request_type,status:duplicate.status,duplicate:true};const phoneHash=await hashString(`request|${phone}|${env.VISITOR_SALT||env.ADMIN_SECRET||'kr'}`);
  await env.DB.batch([env.DB.prepare(`INSERT INTO order_service_requests(id,order_id,request_type,reason,customer_note,items_json,status,customer_phone_hash,created_at,updated_at,idempotency_key) VALUES(?,?,?,?,?,?,'requested',?,?,?,?)`).bind(id,orderId,type,reason,note,JSON.stringify(valid),phoneHash,now,now,key),env.DB.prepare(`INSERT INTO order_service_request_history(request_id,status,note,actor,created_at) VALUES(?,'requested',?,'customer',?)`).bind(id,reason,now)]);
  await sendTelegramMsg(`📨 <b>${type.toUpperCase()} REQUEST</b>\nRequest: <code>${id}</code>\nOrder: <code>${orderId}</code>\nCustomer: ${htmlEsc(order.customer.name)}\nPhone: <code>${htmlEsc(phone)}</code>\nReason: ${htmlEsc(reason)}\nItems: ${valid.map(x=>`${htmlEsc(x.productName)} x${x.quantity}`).join(', ')}`,env.TELEGRAM_TOKEN,env.TELEGRAM_CHAT);return{id,orderId,type,status:'requested'};
}
async function applyRequestResolution(env,req,resolution,request){
  if(req.resolution_applied_at)return;const items=safeJsonParse(req.items_json,[]),now=Date.now(),statements=[],movementRows=[],saleRows=[];if(resolution.stockAction==='restore_sellable'){const byVar=new Map();for(const i of items)if(i.variantId)byVar.set(i.variantId,(byVar.get(i.variantId)||0)+i.quantity);for(const[variantId,qty]of byVar){const i=items.find(x=>x.variantId===variantId);statements.push(env.DB.prepare(`UPDATE product_variants SET stock_qty=stock_qty+?,updated_at=? WHERE id=?`).bind(qty,now,variantId));movementRows.push([i.productId,variantId,'return',qty,null,null,req.order_id,'service_request',`Request ${req.id}`,'admin',now,`request-stock:${req.id}:${variantId}`]);}}
  if(resolution.reverseSold===true){const byProduct=new Map();for(const i of items)byProduct.set(i.productId,(byProduct.get(i.productId)||0)+i.quantity);for(const[productId,qty]of byProduct){statements.push(env.DB.prepare(`UPDATE product_stats SET website_sold=MAX(0,website_sold-?),updated_at=? WHERE product_id=?`).bind(qty,now,productId));saleRows.push([productId,null,req.order_id,'reversal',-qty,0,`Service request ${req.id}`,'admin',now,`request-sold:${req.id}:${productId}`]);}}
  const amount=Math.max(0,Number(resolution.refundAmount)||0);if(amount>0)statements.push(env.DB.prepare(`INSERT OR IGNORE INTO order_financial_adjustments(order_id,request_id,adjustment_type,amount,note,created_at,idempotency_key) VALUES(?,?,?,?,?,?,?)`).bind(req.order_id,req.id,req.request_type==='exchange'?'exchange_fee':req.request_type==='return'?'return':'refund',amount,cleanText(resolution.note,500),now,`request-finance:${req.id}`));addChunkedRows(statements,env,`INSERT OR IGNORE INTO inventory_movements(product_id,variant_id,movement_type,quantity,before_qty,after_qty,order_id,source,note,admin_ref,created_at,idempotency_key) VALUES `,movementRows);addChunkedRows(statements,env,`INSERT OR IGNORE INTO sale_events(product_id,variant_id,order_id,source,quantity,adjust_stock,note,admin_ref,created_at,idempotency_key) VALUES `,saleRows);statements.push(env.DB.prepare(`UPDATE order_service_requests SET resolution_json=?,resolution_applied_at=?,updated_at=? WHERE id=? AND resolution_applied_at IS NULL`).bind(JSON.stringify(resolution),now,now,req.id));if(statements.length>49)throw new HttpError(400,'Resolution contains too many items');await env.DB.batch(statements);await writeAudit(env,request,'service_request_resolution','service_request',req.id,resolution);
}
async function customerSummaryQuery(env,url){
  const page=Math.max(1,Number(url.searchParams.get('page'))||1),limit=Math.min(50,Math.max(10,Number(url.searchParams.get('limit'))||20)),q=cleanText(url.searchParams.get('search'),100),district=cleanText(url.searchParams.get('district'),100),sort=url.searchParams.get('sort')||'delivered_spend_desc',from=Number(url.searchParams.get('from'))||0,to=Number(url.searchParams.get('to'))||0,where=[],params=[];if(q){where.push(`(c.display_name LIKE ? OR c.primary_phone LIKE ? OR c.email LIKE ? OR c.district LIKE ?)`);params.push(`%${q}%`,`%${q}%`,`%${q}%`,`%${q}%`)}if(district){where.push('c.district=?');params.push(district)}const orderDate=from?` AND o.created_at>=${Math.trunc(from)}`:'';const orderTo=to?` AND o.created_at<=${Math.trunc(to)}`:'';const ws=where.length?'WHERE '+where.join(' AND '):'',orders=`LEFT JOIN order_customer_links l ON l.customer_id=c.id LEFT JOIN commerce_orders o ON o.id=l.order_id${orderDate}${orderTo}`,sortMap={delivered_spend_desc:'delivered_spend DESC',orders_desc:'order_count DESC',recent_desc:'last_order_at DESC',returns_desc:'return_count DESC',name_asc:'c.display_name ASC',district_asc:'c.district ASC'},orderBy=sortMap[sort]||sortMap.delivered_spend_desc;
  const base=`FROM customers c ${orders} ${ws}`,[count,rows]=await Promise.all([env.DB.prepare(`SELECT COUNT(*) total FROM customers c ${ws}`).bind(...params).first(),env.DB.prepare(`SELECT c.*,COUNT(DISTINCT o.id)+(SELECT COUNT(*) FROM legacy_customer_orders lo WHERE lo.customer_id=c.id) order_count,COALESCE(SUM(CASE WHEN o.status='delivered' THEN CAST(json_extract(o.totals_json,'$.totalPayable') AS REAL) ELSE 0 END),0)+(SELECT COALESCE(SUM(total),0) FROM legacy_customer_orders lo WHERE lo.customer_id=c.id AND lo.status='delivered') delivered_spend,COALESCE(SUM(CASE WHEN o.status='delivered' THEN 1 ELSE 0 END),0)+(SELECT COUNT(*) FROM legacy_customer_orders lo WHERE lo.customer_id=c.id AND lo.status='delivered') delivered_count,COALESCE(SUM(CASE WHEN o.status IN ('cancelled_by_customer','cancelled_by_seller') THEN 1 ELSE 0 END),0)+(SELECT COUNT(*) FROM legacy_customer_orders lo WHERE lo.customer_id=c.id AND lo.status LIKE 'cancelled%') cancelled_count,MAX(COALESCE(MAX(o.created_at),0),(SELECT COALESCE(MAX(created_at),0) FROM legacy_customer_orders lo WHERE lo.customer_id=c.id)) last_order_at,(SELECT COUNT(*) FROM order_service_requests r WHERE r.order_id IN (SELECT l2.order_id FROM order_customer_links l2 WHERE l2.customer_id=c.id) AND r.request_type='return') return_count ${base} GROUP BY c.id ORDER BY ${orderBy} LIMIT ? OFFSET ?`).bind(...params,limit,(page-1)*limit).all()]);const total=Number(count?.total||0);return{ok:true,customers:(rows.results||[]).map(r=>({...r,order_count:Number(r.order_count||0),delivered_spend:Number(r.delivered_spend||0),delivered_count:Number(r.delivered_count||0),cancelled_count:Number(r.cancelled_count||0),return_count:Number(r.return_count||0)})),total,page,pages:Math.ceil(total/limit)};
}
async function customerDetail(env,id){
  const c=await env.DB.prepare(`SELECT * FROM customers WHERE id=?`).bind(id).first();if(!c)return null;const[phones,addresses,notes,interactions,orders,legacy]=await Promise.all([env.DB.prepare(`SELECT * FROM customer_phones WHERE customer_id=? ORDER BY is_primary DESC,id`).bind(id).all(),env.DB.prepare(`SELECT * FROM customer_addresses WHERE customer_id=? ORDER BY last_used_at DESC,id DESC`).bind(id).all(),env.DB.prepare(`SELECT * FROM customer_notes WHERE customer_id=? ORDER BY created_at DESC`).bind(id).all(),env.DB.prepare(`SELECT * FROM customer_interactions WHERE customer_id=? ORDER BY created_at DESC`).bind(id).all(),env.DB.prepare(`SELECT o.* FROM commerce_orders o JOIN order_customer_links l ON l.order_id=o.id WHERE l.customer_id=? ORDER BY o.created_at DESC`).bind(id).all(),env.DB.prepare(`SELECT * FROM legacy_customer_orders WHERE customer_id=? ORDER BY created_at DESC`).bind(id).all()]);const rows=orders.results||[],ids=rows.map(o=>o.id),itemMap=new Map();if(ids.length){const ir=await env.DB.prepare(`SELECT order_id,product_name_snapshot,sku_snapshot,quantity,unit_price FROM commerce_order_items WHERE order_id IN (${ids.map(()=>'?').join(',')}) ORDER BY id`).bind(...ids).all();for(const i of(ir.results||[])){if(!itemMap.has(i.order_id))itemMap.set(i.order_id,[]);itemMap.get(i.order_id).push({name:i.product_name_snapshot,sku:i.sku_snapshot,quantity:Number(i.quantity),unitPrice:Number(i.unit_price)})}}return{customer:c,phones:phones.results||[],addresses:addresses.results||[],notes:notes.results||[],interactions:interactions.results||[],orders:[...rows.map(o=>({orderId:o.id,status:o.status,createdAt:Number(o.created_at),totals:safeJsonParse(o.totals_json,{}),items:itemMap.get(o.id)||[],legacy:false})),...(legacy.results||[]).map(o=>({orderId:o.order_id,status:o.status,createdAt:Number(o.created_at),totals:{totalPayable:Number(o.total||0)},items:[{name:o.products,sku:'',quantity:1}],legacy:true}))].sort((a,b)=>b.createdAt-a.createdAt)};
}
/* COMMERCE ORDER / INVENTORY CONSTANTS */
const KR_DHAKA_DISTRICTS=new Set(['dhaka','gazipur','narayanganj','manikganj','munshiganj','narsingdi']);
const KR_SERVER_COUPONS={KORA10:10,APNALOK20:20};
const KR_ORDER_RANK={pending:0,confirmed:1,packing:2,packed:3,shipped:4,delivered:5};
function normalizeBDPhone(raw){let p=String(raw||'').trim().replace(/[\s\-()]/g,'');if(p.startsWith('0088'))p=p.slice(4);else if(p.startsWith('+880'))p=p.slice(4);else if(p.startsWith('880'))p=p.slice(3);if(!p.startsWith('0'))p='0'+p;return p;}
function htmlEsc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function validOrderId(v){const id=cleanText(v,80).toUpperCase();return /^KR-[A-Z0-9-]{8,70}$/.test(id)?id:null;}
function roundMoney(v){return Math.round((Number(v)||0)*100)/100;}
function parseOptionInput(raw){
  if(Array.isArray(raw)) return raw.slice(0,20).map(x=>({code:cleanCode(x.code),valueCode:cleanCode(x.valueCode??x.value_code),text:cleanText(x.text??x.value,300)}));
  if(raw&&typeof raw==='object') return Object.entries(raw).slice(0,20).map(([code,v])=>({code:cleanCode(code),valueCode:cleanCode(typeof v==='object'?(v.code??v.valueCode):v),text:cleanText(typeof v==='object'?(v.text??v.value_en??v.value):v,300)}));
  return [];
}
function groupQuantities(items,key){const m=new Map();for(const item of items){const k=item[key];if(k)m.set(k,(m.get(k)||0)+item.quantity);}return m;}

async function checkOrderRate(request,env){
  if(!env.KR_ORDERS)return;
  const ip=request.headers.get('CF-Connecting-IP')||'unknown',hash=await hashString(ip),key=`order_rl:${hash}`;
  const raw=await env.KR_ORDERS.get(key);const count=raw?Number(raw):0;
  if(count>=20)throw new HttpError(429,'Too many order attempts. Please try again later.');
  await env.KR_ORDERS.put(key,String(count+1),{expirationTtl:3600});
}

async function resolveCommerceItems(env,rawItems){
  const incoming=Array.isArray(rawItems)?rawItems.slice(0,20):[];
  if(!incoming.length)throw new HttpError(400,'Select at least one product');
  const productIds=[...new Set(incoming.map(x=>positiveInt(x.productId??x.pid)).filter(Boolean))];
  const variantIds=[...new Set(incoming.map(x=>nullablePositiveInt(x.variantId)).filter(Boolean))];
  if(!productIds.length)throw new HttpError(400,'Invalid products');
  const pp=productIds.map(()=>'?').join(',');
  const [pr,or,vr,xr]=await Promise.all([
    env.DB.prepare(`SELECT * FROM products WHERE id IN (${pp})`).bind(...productIds).all(),
    env.DB.prepare(`SELECT o.*,v.id value_id,v.value_code,v.value_en,v.value_bn,v.color_hex
      FROM product_options o LEFT JOIN product_option_values v ON v.option_id=o.id WHERE o.product_id IN (${pp}) ORDER BY o.sort_order,v.sort_order`).bind(...productIds).all(),
    variantIds.length?env.DB.prepare(`SELECT * FROM product_variants WHERE id IN (${variantIds.map(()=>'?').join(',')})`).bind(...variantIds).all():Promise.resolve({results:[]}),
    variantIds.length?env.DB.prepare(`SELECT vv.variant_id,o.code,v.value_code,v.value_en,v.value_bn FROM variant_option_values vv JOIN product_options o ON o.id=vv.option_id JOIN product_option_values v ON v.id=vv.option_value_id WHERE vv.variant_id IN (${variantIds.map(()=>'?').join(',')})`).bind(...variantIds).all():Promise.resolve({results:[]})
  ]);
  const products=new Map((pr.results||[]).map(p=>[Number(p.id),p]));
  const optionsByProduct=new Map(),optionMap=new Map();
  for(const row of(or.results||[])){
    let o=optionMap.get(Number(row.id));
    if(!o){o={id:Number(row.id),productId:Number(row.product_id),code:row.code,label_en:row.label_en,label_bn:row.label_bn,required:!!row.is_required,createsVariant:!!row.creates_variant,values:[]};optionMap.set(o.id,o);if(!optionsByProduct.has(o.productId))optionsByProduct.set(o.productId,[]);optionsByProduct.get(o.productId).push(o);}
    if(row.value_id!=null)o.values.push({id:Number(row.value_id),code:row.value_code,value_en:row.value_en,value_bn:row.value_bn,colorHex:row.color_hex||''});
  }
  const variants=new Map((vr.results||[]).map(v=>[Number(v.id),v])),variantValues=new Map();
  for(const row of(xr.results||[])){if(!variantValues.has(Number(row.variant_id)))variantValues.set(Number(row.variant_id),{});variantValues.get(Number(row.variant_id))[row.code]={code:row.value_code,value_en:row.value_en,value_bn:row.value_bn};}
  const resolved=[];
  for(const raw of incoming){
    const productId=positiveInt(raw.productId??raw.pid),p=products.get(productId),quantity=Math.trunc(Number(raw.quantity??raw.qty));
    if(!p||p.status!=='active')throw new HttpError(409,'A selected product is no longer available');
    if(p.sales_status==='out_of_stock')throw new HttpError(409,`${p.name_en} is out of stock`);
    if(!quantity||quantity<1||quantity>50)throw new HttpError(400,'Quantity must be between 1 and 50');
    const defs=optionsByProduct.get(productId)||[],selectionInput=parseOptionInput(raw.selectedOptions??raw.selections??raw.options),selectedByCode=new Map(selectionInput.map(x=>[x.code,x]));
    const variantId=nullablePositiveInt(raw.variantId),variant=variantId?variants.get(variantId):null;
    const variantDefs=defs.filter(o=>o.createsVariant);
    if(variantDefs.length&&(!variant||Number(variant.product_id)!==productId))throw new HttpError(400,`Select a valid variant for ${p.name_en}`);
    if(variant&&(!variant.is_active||variant.sales_status==='out_of_stock'))throw new HttpError(409,`${p.name_en} variant is unavailable`);
    const vv=variant?variantValues.get(Number(variant.id))||{}:{};
    const snapshots=[];
    for(const def of defs){
      const input=selectedByCode.get(def.code);let valueCode=input?.valueCode||'',text=input?.text||'';
      if(def.createsVariant&&vv[def.code]){valueCode=vv[def.code].code;text=vv[def.code].value_en;}
      const value=def.values.find(v=>v.code===valueCode);
      if(def.required&&!value&&!text)throw new HttpError(400,`${def.label_en} is required for ${p.name_en}`);
      if(valueCode&&!value&&def.values.length)throw new HttpError(400,`Invalid ${def.label_en} selection`);
      if(value||text)snapshots.push({code:def.code,label_en:def.label_en,label_bn:def.label_bn,valueCode:value?.code||'',value_en:value?.value_en||text,value_bn:value?.value_bn||text});
    }
    const unitPrice=roundMoney(variant?.price_override??p.price),available=variant?Number(variant.stock_qty)-Number(variant.reserved_qty):null;
    if(variant&&!p.allow_backorder&&available<quantity)throw new HttpError(409,`Only ${Math.max(0,available)} unit(s) available for ${p.name_en}`);
    resolved.push({productId,variantId:variant?Number(variant.id):null,productName:p.name_en,productNameBn:p.name_bn||p.name_en,sku:variant?.sku||'',imageUrl:p.main_image_url||'',quantity,unitPrice,lineTotal:roundMoney(unitPrice*quantity),options:snapshots});
  }
  return resolved;
}

/* কুপন-বিহীন shipping fee — coupon engine-কে base fee দিতে ব্যবহৃত */
function baseDeliveryFee(district,subtotal,local=false){
  return local?0:(subtotal>=2999?0:(KR_DHAKA_DISTRICTS.has(cleanText(district,100).toLowerCase())?60:130));
}

/* Authoritative totals. `coupon` = resolveCoupon()-এর result (বা null)।
   কুপন কোড কখনো সরাসরি frontend থেকে বিশ্বাস করা হয় না। */
function calculateServerTotals(items,district,coupon,advance,local=false){
  const subtotal=roundMoney(items.reduce((s,i)=>s+i.lineTotal,0));
  const discountAmt=roundMoney(Math.max(0,Math.min(subtotal,Number(coupon?.discountAmt||0))));
  const discountPct=coupon?.type==='percent'?Number(coupon.value||0):0;
  const after=subtotal-discountAmt;
  const delivery=(local||coupon?.freeDelivery)?0:baseDeliveryFee(district,after,false);
  const totalPayable=roundMoney(after+delivery),paid=Math.max(0,Math.min(totalPayable,roundMoney(advance)));
  return {subtotal,discountPct,discountAmt,subtotalAfterDiscount:after,delivery,totalPayable,advance:paid,codRemaining:roundMoney(totalPayable-paid),freeDelivery:!!coupon?.freeDelivery,couponType:coupon?.type||''};
}

/* ================================================================
   COUPON ENGINE — resolve/validate/save (D1; legacy map fallback)
   ================================================================ */
async function couponsTableReady(env) {
  try { return await d1TableExists(env, 'coupons'); } catch (e) { return false; }
}

/* সব নিয়ম (type/validity/limits/min-shopping/cap/apply-base) এক জায়গায়।
   ব্যতিক্রম ছুঁড়ে HttpError — বার্তাটাই কাস্টমারকে দেখানো হয়। */
async function resolveCoupon(env, rawCode, phone, items, subtotal, deliveryBase) {
  const code = cleanText(rawCode, 40).toUpperCase();
  if (!code) return null;
  if (!await couponsTableReady(env)) {
    /* Migration চালানোর আগে পুরনো হার্ডকোডেড ম্যাপ — সাইট কখনো ভাঙে না */
    const pct = KR_SERVER_COUPONS[code] || 0;
    if (!pct) throw new HttpError(400, 'Invalid coupon code');
    return { code, type:'percent', value:pct, discountAmt:roundMoney(Math.min(subtotal, subtotal*pct/100)), freeDelivery:false, legacy:true };
  }
  const row = await env.DB.prepare(`SELECT * FROM coupons WHERE code=?`).bind(code).first();
  if (!row || row.status !== 'active') throw new HttpError(400, 'Invalid coupon code');
  const now = Date.now();
  if (Number(row.starts_at) > 0 && now < Number(row.starts_at)) throw new HttpError(400, 'This coupon is not active yet');
  if (Number(row.ends_at) > 0 && now > Number(row.ends_at)) throw new HttpError(400, 'This coupon has expired');
  if (subtotal < Number(row.min_subtotal || 0)) throw new HttpError(400, `Minimum ৳${Number(row.min_subtotal).toLocaleString()} shopping is required for this coupon`);
  if (Number(row.usage_limit_total) > 0 && Number(row.used_count) >= Number(row.usage_limit_total)) throw new HttpError(400, 'This coupon has been fully used');
  const normPhone = normalizeBDPhone(phone || '');
  if (Number(row.usage_limit_per_customer) > 0 && /^01/.test(normPhone)) {
    const r = await env.DB.prepare(`SELECT COUNT(*) c FROM coupon_redemptions WHERE coupon_code=? AND customer_phone=?`).bind(code, normPhone).first();
    if (Number(r?.c || 0) >= Number(row.usage_limit_per_customer)) throw new HttpError(400, 'You have already used this coupon the maximum number of times');
  }
  const type = row.type;
  let discountAmt = 0, freeDelivery = false;
  if (type === 'percent') {
    const base = row.apply_base === 'total' ? subtotal + deliveryBase : subtotal;
    discountAmt = base * Number(row.value) / 100;
    if (Number(row.max_discount) > 0) discountAmt = Math.min(discountAmt, Number(row.max_discount));
  } else if (type === 'fixed') {
    const base = row.apply_base === 'total' ? subtotal + deliveryBase : subtotal;
    discountAmt = Math.min(Number(row.value), base);
  } else if (type === 'free_delivery') {
    freeDelivery = true;
  } else if (type === 'bogo') {
    /* প্রতি line-এ floor(qty/(buy+get))*get টা unit ফ্রি */
    const buy = Math.max(1, Math.trunc(Number(row.bogo_buy) || 1));
    const get = Math.max(1, Math.trunc(Number(row.bogo_get) || 1));
    for (const i of items) {
      const freeUnits = Math.floor((Number(i.quantity) || 0) / (buy + get)) * get;
      discountAmt += freeUnits * Number(i.unitPrice || 0);
    }
  } else {
    throw new HttpError(400, 'Unsupported coupon type');
  }
  discountAmt = roundMoney(Math.max(0, Math.min(subtotal, discountAmt)));
  if (!freeDelivery && discountAmt <= 0) throw new HttpError(400, 'This coupon does not apply to the selected items');
  return {
    code, type, value: Number(row.value), discountAmt, freeDelivery,
    applyBase: row.apply_base, minSubtotal: Number(row.min_subtotal || 0),
    maxDiscount: Number(row.max_discount || 0)
  };
}

function mapCouponRow(r) {
  return {
    code: r.code, type: r.type, value: Number(r.value),
    maxDiscount: Number(r.max_discount), minSubtotal: Number(r.min_subtotal),
    applyBase: r.apply_base, bogoBuy: Number(r.bogo_buy), bogoGet: Number(r.bogo_get),
    startsAt: Number(r.starts_at) || 0, endsAt: Number(r.ends_at) || 0,
    usageLimitTotal: Number(r.usage_limit_total), usageLimitPerCustomer: Number(r.usage_limit_per_customer),
    usedCount: Number(r.used_count), redemptions: Number(r.redemptions ?? r.used_count),
    status: r.status, note: r.note || '', createdAt: Number(r.created_at) || 0, updatedAt: Number(r.updated_at) || 0
  };
}

async function saveCoupon(env, b, request) {
  const code = cleanText(b.code, 40).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{2,39}$/.test(code)) throw new HttpError(400, 'Coupon code must be 3-40 characters (A-Z, 0-9, -, _)');
  const type = ['percent','fixed','free_delivery','bogo'].includes(b.type) ? b.type : null;
  if (!type) throw new HttpError(400, 'Coupon type must be percent, fixed, free_delivery or bogo');
  let value = Number(b.value);
  if (type === 'percent') { if (!(value > 0 && value <= 100)) throw new HttpError(400, 'Percent must be between 1 and 100'); }
  else if (type === 'fixed') { if (!(value > 0 && value <= 1000000)) throw new HttpError(400, 'Fixed amount must be greater than 0'); }
  else value = 0;
  const maxDiscount = Math.max(0, Number(b.maxDiscount) || 0);
  const minSubtotal = Math.max(0, Number(b.minSubtotal) || 0);
  const applyBase = b.applyBase === 'total' ? 'total' : 'subtotal';
  const bogoBuy = Math.max(1, Math.min(50, Math.trunc(Number(b.bogoBuy) || 1)));
  const bogoGet = Math.max(1, Math.min(50, Math.trunc(Number(b.bogoGet) || 1)));
  const startsAt = Math.max(0, Number(b.startsAt) || 0);
  const endsAt = Math.max(0, Number(b.endsAt) || 0);
  if (startsAt && endsAt && endsAt <= startsAt) throw new HttpError(400, 'End date must be after the start date');
  const limitTotal = Math.max(0, Math.min(1000000, Math.trunc(Number(b.usageLimitTotal) || 0)));
  const limitPer = Math.max(0, Math.min(100000, Math.trunc(Number(b.usageLimitPerCustomer) || 0)));
  const status = b.status === 'disabled' ? 'disabled' : 'active';
  const note = cleanText(b.note, 300);
  const now = Date.now();
  const exists = await env.DB.prepare(`SELECT code FROM coupons WHERE code=?`).bind(code).first();
  await env.DB.prepare(`INSERT INTO coupons(code,type,value,max_discount,min_subtotal,apply_base,bogo_buy,bogo_get,starts_at,ends_at,usage_limit_total,usage_limit_per_customer,status,note,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(code) DO UPDATE SET type=excluded.type,value=excluded.value,max_discount=excluded.max_discount,min_subtotal=excluded.min_subtotal,apply_base=excluded.apply_base,bogo_buy=excluded.bogo_buy,bogo_get=excluded.bogo_get,starts_at=excluded.starts_at,ends_at=excluded.ends_at,usage_limit_total=excluded.usage_limit_total,usage_limit_per_customer=excluded.usage_limit_per_customer,status=excluded.status,note=excluded.note,updated_at=excluded.updated_at`)
    .bind(code,type,value,maxDiscount,minSubtotal,applyBase,bogoBuy,bogoGet,startsAt,endsAt,limitTotal,limitPer,status,note,now,now).run();
  await writeAudit(env, request, exists ? 'coupon_update' : 'coupon_create', 'coupon', code, { type, value, minSubtotal, limitTotal, limitPer });
  return { code, updated: !!exists };
}

function validateCommerceCustomer(raw){
  const c=raw||{},phone=normalizeBDPhone(c.phone),name=cleanText(c.name,120),district=cleanText(c.district,100),address=cleanText(c.address,500);
  if(!name)throw new HttpError(400,'Customer name is required');
  if(!/^01[3-9]\d{8}$/.test(phone))throw new HttpError(400,'Valid Bangladesh phone number is required');
  if(!district)throw new HttpError(400,'District is required');
  if(address.length<10)throw new HttpError(400,'Complete delivery address is required');
  return {name,phone,email:cleanText(c.email,180),district,thana:cleanText(c.thana,150),address,note:cleanText(c.note,600)};
}
function validateCommercePayment(raw,total){
  const p=raw||{},method=['COD','Cash','bKash','Nagad','Rocket'].includes(p.method)?p.method:'COD';
  let advance;
  if(method==='COD') advance=0;
  else if(method==='Cash') advance=total;              /* cash collected, fully paid */
  else advance=Math.max(0,Math.min(total,roundMoney(p.advance)));
  const trxId=cleanText(p.trxId,100);
  if((method==='bKash'||method==='Nagad'||method==='Rocket')&&!trxId)throw new HttpError(400,'Transaction ID is required');
  return {method,advance,trxId};
}

/* Admin ERP customer validation — manual orders are flexible:
   only a name is required; phone/district/address are optional (filled
   in later, e.g. before sending to Pathao). */
function validateAdminCustomer(raw, channel){
  const c=raw||{};
  const isLocal = channel==='local';
  const name = cleanText(c.name,120) || (isLocal ? 'Local Customer' : '');
  if(!name) throw new HttpError(400,'Customer name is required');
  const phone = normalizeBDPhone(c.phone);
  return {
    name,
    phone: /^01[3-9]\d{8}$/.test(phone) ? phone : (isLocal ? '01000000000' : (phone && /^\d{5,}$/.test(phone) ? phone.slice(0,15) : '')),
    email:cleanText(c.email,180),
    district:cleanText(c.district,100)||(isLocal?'Local':''),
    thana:cleanText(c.thana,150),
    address:cleanText(c.address,500)||(isLocal?'Local sale':''),
    note:cleanText(c.note,600)
  };
}

async function placeCommerceOrder(request,env,orderData){
  requireD1(env);await checkOrderRate(request,env);
  const orderId=validOrderId(orderData.orderId);if(!orderId)throw new HttpError(400,'Invalid order ID');
  const existing=await env.DB.prepare(`SELECT id FROM commerce_orders WHERE id=?`).bind(orderId).first();
  if(existing){const order=await getCommerceOrder(env,orderId);return {ok:true,duplicate:true,orderId,cancelDeadline:order.cancelDeadline,order};}
  const customer=validateCommerceCustomer(orderData.customer),items=await resolveCommerceItems(env,orderData.items||orderData.instances);
  /* Authoritative coupon (D1 rules; legacy fallback pre-migration) */
  const couponSub=roundMoney(items.reduce((s,i)=>s+i.lineTotal,0));
  const coupon=orderData.couponCode?await resolveCoupon(env,orderData.couponCode,customer.phone,items,couponSub,baseDeliveryFee(customer.district,couponSub,false)):null;
  const preliminary=calculateServerTotals(items,customer.district,coupon,Number(orderData.payment?.advance)||0),payment=validateCommercePayment(orderData.payment,preliminary.totalPayable);
  const totals=calculateServerTotals(items,customer.district,coupon,payment.advance),couponCode=coupon?coupon.code:'',now=Date.now(),cancelDeadline=now+5*60*1000,idempotencyKey=cleanToken(orderData.idempotencyKey||request.headers.get('Idempotency-Key')||orderId,120);
  const statements=[env.DB.prepare(`INSERT INTO commerce_orders(id,channel,status,customer_json,payment_json,totals_json,coupon_code,created_at,updated_at,cancel_deadline,idempotency_key) VALUES(?,'website','pending',?,?,?,?,?,?,?,?)`).bind(orderId,JSON.stringify(customer),JSON.stringify(payment),JSON.stringify(totals),couponCode,now,now,cancelDeadline,idempotencyKey)];
  const itemRows=items.map(i=>[orderId,i.productId,i.variantId,i.productName,i.sku,JSON.stringify(i.options),i.unitPrice,i.quantity,i.lineTotal,0]);
  addChunkedRows(statements,env,`INSERT INTO commerce_order_items(order_id,product_id,variant_id,product_name_snapshot,sku_snapshot,options_json,unit_price,quantity,line_total,sold_credited) VALUES `,itemRows);
  statements.push(env.DB.prepare(`INSERT INTO commerce_order_history(order_id,status,note,actor,created_at) VALUES(?,'pending','Order placed by customer','customer',?)`).bind(orderId,now));
  /* Coupon redemption — একই batch-এ atomic (one-time/per-customer limit
     resolveCoupon-এ যাচাই হয়েছে; এখানে শুধু রেকর্ড + কাউন্ট) */
  if (coupon && !coupon.legacy) {
    statements.push(env.DB.prepare(`INSERT INTO coupon_redemptions(coupon_code,order_id,customer_phone,discount_amount,free_delivery,created_at) VALUES(?,?,?,?,?,?)`).bind(coupon.code,orderId,customer.phone,coupon.discountAmt,coupon.freeDelivery?1:0,now));
    statements.push(env.DB.prepare(`UPDATE coupons SET used_count=used_count+1,updated_at=? WHERE code=? AND (usage_limit_total=0 OR used_count<usage_limit_total)`).bind(now,coupon.code));
  }
  const byVariant=groupQuantities(items,'variantId');
  const movementRows=[];
  for(const [variantId,qty] of byVariant){
    statements.push(env.DB.prepare(`UPDATE product_variants SET reserved_qty=reserved_qty+?,updated_at=? WHERE id=?`).bind(qty,now,variantId));
    const item=items.find(i=>i.variantId===variantId);movementRows.push([item.productId,variantId,'reserve',qty,null,null,orderId,'website','Order reservation','system',now,`reserve:${orderId}:${variantId}`]);
  }
  addChunkedRows(statements,env,`INSERT OR IGNORE INTO inventory_movements(product_id,variant_id,movement_type,quantity,before_qty,after_qty,order_id,source,note,admin_ref,created_at,idempotency_key) VALUES `,movementRows);
  if(statements.length>45)throw new HttpError(400,'Order contains too many separate variants');
  try{await env.DB.batch(statements);}catch(e){if(String(e.message).includes('UNIQUE')){const order=await getCommerceOrder(env,orderId);return {ok:true,duplicate:true,orderId,cancelDeadline:order.cancelDeadline,order};}throw e;}
  const order={orderId,status:'pending',createdAt:now,cancelDeadline,cancelReason:null,customer,payment,totals,couponCode,items,statusHistory:[{status:'pending',time:now,note:'Order placed by customer'}]};
  await mirrorCommerceOrderToKV(env,order);
  await upsertCustomerFromOrder(env,order);
  const notify=buildCommerceNotifications(order),[tg,sheet]=await Promise.allSettled([sendTelegramMsg(notify.telegramMessage,env.TELEGRAM_TOKEN,env.TELEGRAM_CHAT),sendCommerceSheet(notify.sheetsPayload,env)]);
  return {ok:true,orderId,cancelDeadline,telegram:tg.status==='fulfilled'&&tg.value,sheets:sheet.status==='fulfilled'&&sheet.value,order};
}

async function getCommerceOrder(env,orderId){
  if(!env.DB)return null;
  const row=await env.DB.prepare(`SELECT o.*, s.consignment_id, s.status AS courier_status, s.delivery_fee AS courier_fee, s.collect_amount AS courier_collect FROM commerce_orders o LEFT JOIN courier_shipments s ON s.order_id=o.id WHERE o.id=?`).bind(orderId).first();
  if(!row)return null;
  const [ir,hr]=await Promise.all([env.DB.prepare(`SELECT i.*,p.main_image_url,p.name_bn FROM commerce_order_items i LEFT JOIN products p ON p.id=i.product_id WHERE i.order_id=? ORDER BY i.id`).bind(orderId).all(),env.DB.prepare(`SELECT status,note,actor,created_at FROM commerce_order_history WHERE order_id=? ORDER BY created_at,id`).bind(orderId).all()]);
  return {
    orderId:row.id,
    status:row.status,
    createdAt:Number(row.created_at),
    updatedAt:Number(row.updated_at),
    confirmedAt:row.confirmed_at?Number(row.confirmed_at):null,
    cancelDeadline:row.cancel_deadline?Number(row.cancel_deadline):null,
    cancelReason:row.cancel_reason||null,
    customer:safeJsonParse(row.customer_json,{}),
    payment:safeJsonParse(row.payment_json,{}),
    totals:safeJsonParse(row.totals_json,{}),
    couponCode:row.coupon_code||'',
    consignmentId:row.consignment_id||null,
    courierStatus:row.courier_status||null,
    courierFee:row.courier_fee!=null?Number(row.courier_fee):null,
    courierCollect:row.courier_collect!=null?Number(row.courier_collect):null,
    lastInvoiceRequestedAt:row.last_invoice_requested_at?Number(row.last_invoice_requested_at):0,
    items:(ir.results||[]).map(i=>({id:Number(i.id),productId:Number(i.product_id),variantId:i.variant_id==null?null:Number(i.variant_id),productName:i.product_name_snapshot,productNameBn:i.name_bn||i.product_name_snapshot,sku:i.sku_snapshot,options:safeJsonParse(i.options_json,[]),unitPrice:Number(i.unit_price),quantity:Number(i.quantity),lineTotal:Number(i.line_total),imageUrl:i.main_image_url||'',soldCredited:!!i.sold_credited})),
    statusHistory:(hr.results||[]).map(h=>({status:h.status,note:h.note,time:Number(h.created_at),actor:h.actor}))
  };
}

function commerceOrderForAdmin(order){
  const products=order.items.map(i=>`${i.productName}${i.sku?` [${i.sku}]`:''} ×${i.quantity}`).join('; ');
  return {
    orderId:order.orderId,status:order.status,createdAt:order.createdAt,updatedAt:order.updatedAt,
    confirmedAt:order.confirmedAt,cancelDeadline:order.cancelDeadline,cancelReason:order.cancelReason,
    statusHistory:order.statusHistory,items:order.items,
    consignmentId:order.consignmentId,courierStatus:order.courierStatus,courierFee:order.courierFee,courierCollect:order.courierCollect,
    lastInvoiceRequestedAt:order.lastInvoiceRequestedAt || 0,
    customer:{...order.customer,total:order.totals.totalPayable,products,payment:order.payment,totals:order.totals,items:order.items}
  };
}

async function mirrorCommerceOrderToKV(env,order){
  if(!env.KR_ORDERS)return;const products=order.items.map(i=>`${i.productName}${i.sku?` [${i.sku}]`:''} ×${i.quantity}`).join('; ');
  const record={orderId:order.orderId,createdAt:order.createdAt,status:order.status,statusHistory:order.statusHistory,customer:{...order.customer,total:order.totals.totalPayable,products,payment:order.payment.method,items:order.items,totals:order.totals},cancelDeadline:order.cancelDeadline,autoStatusAt:null,packedAt:null,cancelReason:order.cancelReason};
  await env.KR_ORDERS.put(`order:${order.orderId}`,JSON.stringify(record),{expirationTtl:60*60*24*90});
}

function buildCommerceNotifications(order){
  const lines=order.items.map(i=>`🔹 <b>${htmlEsc(i.productName)}</b>${i.sku?` <code>${htmlEsc(i.sku)}</code>`:''}\n   ${htmlEsc(i.options.map(o=>`${o.label_en}: ${o.value_en}`).join(' / '))} × ${i.quantity} = <b>৳${i.lineTotal.toLocaleString()}</b>`).join('\n');
  const c=order.customer,t=order.totals,p=order.payment;
  const telegramMessage=`🛒 <b>NEW WEBSITE ORDER — KORA ROYAL</b>\n━━━━━━━━━━━━━━━━━━━━\n🆔 <code>${htmlEsc(order.orderId)}</code>\n👤 ${htmlEsc(c.name)}\n📞 <code>${htmlEsc(c.phone)}</code>\n📍 ${htmlEsc(c.district)}${c.thana?`, ${htmlEsc(c.thana)}`:''}\n🏠 ${htmlEsc(c.address)}\n━━━━━━━━━━━━━━━━━━━━\n${lines}\n━━━━━━━━━━━━━━━━━━━━\nSubtotal: ৳${t.subtotal.toLocaleString()}\nDelivery: ৳${t.delivery.toLocaleString()}\nDiscount: -৳${t.discountAmt.toLocaleString()}\n<b>Total: ৳${t.totalPayable.toLocaleString()}</b>\nPayment: ${htmlEsc(p.method)}${p.trxId?` | Trx: <code>${htmlEsc(p.trxId)}</code>`:''}`;
  const sheetsPayload={orderId:order.orderId,date:new Date(order.createdAt).toLocaleString('en-BD'),name:c.name,phone:c.phone,email:c.email,district:c.district,thana:c.thana,address:c.address,products:order.items.map(i=>`${i.productName} [${i.sku}] (${i.options.map(o=>`${o.label_en}:${o.value_en}`).join(', ')}) x${i.quantity}`).join('; '),qty:order.items.reduce((s,i)=>s+i.quantity,0),subtotal:t.subtotal,shipping:t.delivery,discount:t.discountAmt,coupon:order.couponCode,total:t.totalPayable,payment:p.method,trxId:p.trxId,advance:p.advance,status:'Pending'};
  return {telegramMessage,sheetsPayload};
}
async function sendCommerceSheet(payload,env){if(!env.SHEETS_URL)return false;try{const r=await fetch(env.SHEETS_URL,{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify(payload)});return r.ok;}catch{return false;}}

async function cancelCommerceOrder(env,orderId,reason,note,actor='customer',ignoreDeadline=false){
  const order=await getCommerceOrder(env,orderId);if(!order)return null;const now=Date.now();
  if(!ignoreDeadline&&now>order.cancelDeadline)throw new HttpError(403,'Cancel window expired.');
  if(['cancelled_by_customer','cancelled_by_seller'].includes(order.status))return order;
  if(['shipped','delivered'].includes(order.status))throw new HttpError(409,'This order can no longer be cancelled');
  const target=actor==='customer'?'cancelled_by_customer':'cancelled_by_seller',cancelNote=note?`${reason}: ${note}`:reason;
  const statements=[env.DB.prepare(`UPDATE commerce_orders SET status=?,cancel_reason=?,updated_at=? WHERE id=?`).bind(target,cancelNote,now,orderId),env.DB.prepare(`INSERT INTO commerce_order_history(order_id,status,note,actor,created_at) VALUES(?,?,?,?,?)`).bind(orderId,target,cancelNote,actor,now)];
  const pending=order.items.filter(i=>!i.soldCredited),credited=order.items.filter(i=>i.soldCredited),releaseByVariant=groupQuantities(pending,'variantId'),restoreByVariant=groupQuantities(credited,'variantId'),soldByProduct=groupQuantities(credited,'productId'),movementRows=[],saleRows=[];
  for(const [variantId,qty] of releaseByVariant){statements.push(env.DB.prepare(`UPDATE product_variants SET reserved_qty=MAX(0,reserved_qty-?),updated_at=? WHERE id=?`).bind(qty,now,variantId));const i=pending.find(x=>x.variantId===variantId);movementRows.push([i.productId,variantId,'release',-qty,null,null,orderId,'website',cancelNote,actor,now,`release:${orderId}:${variantId}`]);}
  for(const [variantId,qty] of restoreByVariant){statements.push(env.DB.prepare(`UPDATE product_variants SET stock_qty=stock_qty+?,updated_at=? WHERE id=?`).bind(qty,now,variantId));const i=credited.find(x=>x.variantId===variantId);movementRows.push([i.productId,variantId,'cancel_restore',qty,null,null,orderId,'website',cancelNote,actor,now,`restore:${orderId}:${variantId}`]);}
  if(soldByProduct.size){
    const entries=[...soldByProduct.entries()],cases=entries.map(()=>`WHEN ? THEN ?`).join(' '),ids=entries.map(()=>'?').join(','),params=[];
    for(const [productId,qty] of entries)params.push(productId,qty);
    params.push(now,...entries.map(([productId])=>productId));
    statements.push(env.DB.prepare(`UPDATE product_stats SET website_sold=MAX(0,website_sold-CASE product_id ${cases} ELSE 0 END),updated_at=? WHERE product_id IN (${ids})`).bind(...params));
    for(const [productId,qty] of entries)saleRows.push([productId,null,orderId,'reversal',-qty,0,cancelNote,actor,now,`sold-reverse:${orderId}:${productId}`]);
  }
  if(credited.length)statements.push(env.DB.prepare(`UPDATE commerce_order_items SET sold_credited=0 WHERE order_id=?`).bind(orderId));
  addChunkedRows(statements,env,`INSERT OR IGNORE INTO inventory_movements(product_id,variant_id,movement_type,quantity,before_qty,after_qty,order_id,source,note,admin_ref,created_at,idempotency_key) VALUES `,movementRows);
  addChunkedRows(statements,env,`INSERT OR IGNORE INTO sale_events(product_id,variant_id,order_id,source,quantity,adjust_stock,note,admin_ref,created_at,idempotency_key) VALUES `,saleRows);
  if(statements.length>49)throw new HttpError(400,'Order is too large to cancel safely');await env.DB.batch(statements);
  const updated=await getCommerceOrder(env,orderId);await mirrorCommerceOrderToKV(env,updated);return updated;
}

function validateStatusTransition(current,target){
  if(target==='cancelled_by_seller')return !['shipped','delivered','cancelled_by_customer','cancelled_by_seller'].includes(current);
  if(!(target in KR_ORDER_RANK)||!(current in KR_ORDER_RANK))return false;
  return KR_ORDER_RANK[target]>KR_ORDER_RANK[current];
}

async function transitionCommerceOrder(env,orderId,target,note,request){
  const order=await getCommerceOrder(env,orderId);if(!order)return null;
  if(target==='cancelled_by_seller')return cancelCommerceOrder(env,orderId,note||'Cancelled by seller','', 'admin',true);
  if(!validateStatusTransition(order.status,target))throw new HttpError(409,`Cannot change ${order.status} to ${target}`);
  const now=Date.now(),statements=[];
  const needsConfirmation=KR_ORDER_RANK[order.status]===0&&KR_ORDER_RANK[target]>=1;
  if(needsConfirmation){
    const byVariant=groupQuantities(order.items,'variantId'),byProduct=groupQuantities(order.items,'productId'),movementRows=[],saleRows=[];
    for(const [variantId,qty] of byVariant){const i=order.items.find(x=>x.variantId===variantId);statements.push(env.DB.prepare(`UPDATE product_variants SET stock_qty=stock_qty-?,reserved_qty=MAX(0,reserved_qty-?),updated_at=? WHERE id=?`).bind(qty,qty,now,variantId));movementRows.push([i.productId,variantId,'confirmed_sale',-qty,null,null,orderId,'website','Admin confirmed order','admin',now,`confirm-stock:${orderId}:${variantId}`]);}
    const soldRows=[];
    for(const [productId,qty] of byProduct){soldRows.push([productId,qty,now]);saleRows.push([productId,null,orderId,'website',qty,1,'Admin confirmed order','admin',now,`sold-confirm:${orderId}:${productId}`]);}
    addChunkedRows(statements,env,`INSERT INTO product_stats(product_id,website_sold,updated_at) VALUES `,soldRows,` ON CONFLICT(product_id) DO UPDATE SET website_sold=product_stats.website_sold+excluded.website_sold,updated_at=excluded.updated_at`);
    statements.push(env.DB.prepare(`UPDATE commerce_order_items SET sold_credited=1 WHERE order_id=?`).bind(orderId));
    addChunkedRows(statements,env,`INSERT OR IGNORE INTO inventory_movements(product_id,variant_id,movement_type,quantity,before_qty,after_qty,order_id,source,note,admin_ref,created_at,idempotency_key) VALUES `,movementRows);
    addChunkedRows(statements,env,`INSERT OR IGNORE INTO sale_events(product_id,variant_id,order_id,source,quantity,adjust_stock,note,admin_ref,created_at,idempotency_key) VALUES `,saleRows);
    statements.push(env.DB.prepare(`UPDATE commerce_orders SET status=?,confirmed_at=?,sold_credit_at=?,sold_credited_at=?,updated_at=? WHERE id=?`).bind(target,now,now,now,now,orderId));
    statements.push(env.DB.prepare(`INSERT INTO commerce_order_history(order_id,status,note,actor,created_at) VALUES(?,'confirmed',?,'admin',?)`).bind(orderId,note||'Order confirmed by admin',now));
    if(target!=='confirmed')statements.push(env.DB.prepare(`INSERT INTO commerce_order_history(order_id,status,note,actor,created_at) VALUES(?,?,?,'admin',?)`).bind(orderId,target,note||`Status updated to ${target}`,now));
  }else{
    statements.push(env.DB.prepare(`UPDATE commerce_orders SET status=?,updated_at=? WHERE id=?`).bind(target,now,orderId));
    statements.push(env.DB.prepare(`INSERT INTO commerce_order_history(order_id,status,note,actor,created_at) VALUES(?,?,?,'admin',?)`).bind(orderId,target,note||`Status updated to ${target}`,now));
  }
  if(statements.length>49)throw new HttpError(400,'Order has too many items for one status update');await env.DB.batch(statements);
  await writeAudit(env,request,'order_status','order',orderId,{from:order.status,to:target,note});const updated=await getCommerceOrder(env,orderId);await mirrorCommerceOrderToKV(env,updated);return updated;
}

async function listCommerceOrders(env,url){
  const status=url.searchParams.get('status')||'all',page=Math.max(1,Number(url.searchParams.get('page'))||1),limit=Math.min(50,Math.max(10,Number(url.searchParams.get('limit'))||20)),search=cleanText(url.searchParams.get('search'),100),district=cleanText(url.searchParams.get('district'),100),payment=cleanText(url.searchParams.get('payment'),30),from=Number(url.searchParams.get('from'))||0,to=Number(url.searchParams.get('to'))||0,min=Number(url.searchParams.get('min'))||0,max=Number(url.searchParams.get('max'))||0,sort=url.searchParams.get('sort')||'newest',where=[],params=[];
  if(status!=='all'){where.push('o.status=?');params.push(status)}if(search){where.push(`(o.id LIKE ? OR o.customer_json LIKE ? OR EXISTS(SELECT 1 FROM commerce_order_items si WHERE si.order_id=o.id AND (si.product_name_snapshot LIKE ? OR si.sku_snapshot LIKE ?)))`);params.push(`%${search}%`,`%${search}%`,`%${search}%`,`%${search}%`)}if(district){where.push(`json_extract(o.customer_json,'$.district')=?`);params.push(district)}if(payment&&payment!=='all'){where.push(`json_extract(o.payment_json,'$.method')=?`);params.push(payment)}if(from){where.push('o.created_at>=?');params.push(from)}if(to){where.push('o.created_at<=?');params.push(to)}if(min){where.push(`CAST(json_extract(o.totals_json,'$.totalPayable') AS REAL)>=?`);params.push(min)}if(max){where.push(`CAST(json_extract(o.totals_json,'$.totalPayable') AS REAL)<=?`);params.push(max)}const ws=where.length?'WHERE '+where.join(' AND '):'',sortMap={newest:'o.created_at DESC',oldest:'o.created_at ASC',amount_desc:`CAST(json_extract(o.totals_json,'$.totalPayable') AS REAL) DESC`,amount_asc:`CAST(json_extract(o.totals_json,'$.totalPayable') AS REAL) ASC`,status:'o.status ASC,o.created_at DESC',district:`json_extract(o.customer_json,'$.district') ASC,o.created_at DESC`},orderBy=sortMap[sort]||sortMap.newest;
  const[countRow,rows]=await Promise.all([env.DB.prepare(`SELECT COUNT(*) total FROM commerce_orders o ${ws}`).bind(...params).first(),env.DB.prepare(`SELECT o.*, s.consignment_id, s.status AS courier_status FROM commerce_orders o LEFT JOIN courier_shipments s ON s.order_id=o.id ${ws} ORDER BY ${orderBy} LIMIT ? OFFSET ?`).bind(...params,limit,(page-1)*limit).all()]);const orderRows=rows.results||[],ids=orderRows.map(r=>r.id);let itemRows=[];if(ids.length)itemRows=(await env.DB.prepare(`SELECT order_id,product_name_snapshot,sku_snapshot,quantity FROM commerce_order_items WHERE order_id IN (${ids.map(()=>'?').join(',')}) ORDER BY id`).bind(...ids).all()).results||[];const byOrder=new Map();for(const i of itemRows){if(!byOrder.has(i.order_id))byOrder.set(i.order_id,[]);byOrder.get(i.order_id).push(i)}const orders=orderRows.map(r=>{const c=safeJsonParse(r.customer_json,{}),t=safeJsonParse(r.totals_json,{}),p=safeJsonParse(r.payment_json,{}),items=byOrder.get(r.id)||[];return{orderId:r.id,status:r.status,createdAt:Number(r.created_at),name:c.name,phone:c.phone,district:c.district,total:Number(t.totalPayable||0),products:items.map(i=>`${i.product_name_snapshot}${i.sku_snapshot?` [${i.sku_snapshot}]`:''} ×${i.quantity}`).join('; '),payment:p.method||'COD',consignmentId:r.consignment_id||null,courierStatus:r.courier_status||null,source:'d1'}});const total=Number(countRow?.total||0);return{ok:true,orders,total,page,pages:Math.ceil(total/limit)};
}

async function commerceAdminStats(env){
  const dayStart=Math.floor((Date.now()+6*3600000)/86400000)*86400000-6*3600000;
  const hasAdjustments=await d1TableExists(env,'order_financial_adjustments');
  const [agg,statuses,adjustments]=await Promise.all([env.DB.prepare(`SELECT COUNT(*) total_orders,SUM(CASE WHEN created_at>=? THEN 1 ELSE 0 END) today_orders,SUM(CASE WHEN status='delivered' THEN CAST(json_extract(totals_json,'$.totalPayable') AS REAL) ELSE 0 END) delivered_revenue,SUM(CASE WHEN status NOT IN ('cancelled_by_customer','cancelled_by_seller') THEN CAST(json_extract(totals_json,'$.totalPayable') AS REAL) ELSE 0 END) booked_revenue FROM commerce_orders`).bind(dayStart).first(),env.DB.prepare(`SELECT status,COUNT(*) count FROM commerce_orders GROUP BY status`).all(),hasAdjustments?env.DB.prepare(`SELECT COALESCE(SUM(amount),0) total FROM order_financial_adjustments WHERE adjustment_type IN ('refund','return')`).first():Promise.resolve({total:0})]);
  const breakdown={};for(const r of(statuses.results||[]))breakdown[r.status]=Number(r.count);const adjustmentTotal=Number(adjustments?.total||0);
  return{ok:true,totalOrders:Number(agg?.total_orders||0),todayOrders:Number(agg?.today_orders||0),totalRevenue:Math.max(0,Number(agg?.delivered_revenue||0)-adjustmentTotal),bookedRevenue:Number(agg?.booked_revenue||0),financialAdjustments:adjustmentTotal,statusBreakdown:breakdown};
}


/* ================================================================
   PRODUCT / INVENTORY V3 HELPERS (D1)
   ================================================================ */

function requireD1(env) {
  if (!env.DB) throw new HttpError(503, 'Product database is not configured');
}
async function d1TableExists(env,name){const row=await env.DB.prepare(`SELECT 1 ok FROM sqlite_master WHERE type='table' AND name=?`).bind(name).first();return !!row;}

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function readJson(request, maxChars = 250000) {
  const text = await request.text();
  if (!text || text.length > maxChars) throw new HttpError(413, 'Request payload is too large');
  try { return JSON.parse(text); }
  catch { throw new HttpError(400, 'Invalid JSON body'); }
}

function positiveInt(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}
function nullablePositiveInt(v) { return v == null || v === '' ? null : positiveInt(v); }
function cleanText(v, max = 5000) {
  /* Product/admin plain-text fields never accept executable HTML. */
  return String(v == null ? '' : v)
    .replace(/\u0000/g, '')
    .replace(/[<>\"]/g, '')
    .trim()
    .slice(0, max);
}
function cleanToken(v, max = 120) {
  return cleanText(v, max).replace(/[^a-zA-Z0-9_.:@|\-]/g, '');
}
function cleanCode(v, fallback = '') {
  const s = cleanText(v, 80).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return s || fallback;
}
function validHttpsUrl(v) {
  const value = cleanText(v, 2000);
  if (!value) return '';
  try { const u = new URL(value); return u.protocol === 'https:' ? u.href : ''; }
  catch { return ''; }
}
function safeJsonParse(v, fallback) {
  try { const parsed = JSON.parse(v); return parsed == null ? fallback : parsed; }
  catch { return fallback; }
}
function dbChanges(result) { return Number(result?.meta?.changes || result?.changes || 0); }
function generatedNumericId() {
  const words = new Uint32Array(2);
  crypto.getRandomValues(words);
  /* 53-bit positive integer, safe in JavaScript and SQLite INTEGER. */
  return (words[0] & 0x1fffff) * 4294967296 + words[1] || 1;
}
function boolInt(v, fallback = 0) {
  if (v === undefined || v === null) return fallback;
  return v === true || v === 1 || v === '1' || v === 'true' ? 1 : 0;
}

async function ensureProductStats(env, productId) {
  await env.DB.prepare(`INSERT OR IGNORE INTO product_stats(product_id,updated_at) VALUES(?,?)`)
    .bind(productId, Date.now()).run();
}

function statsFromRow(row = {}) {
  const website = Number(row.website_sold || 0);
  const whatsapp = Number(row.whatsapp_sold || 0);
  const call = Number(row.call_sold || 0);
  const offline = Number(row.offline_sold || 0);
  const adjustment = Number(row.manual_adjustment || 0);
  return {
    views: Number(row.view_count || 0),
    likes: Number(row.like_count || 0),
    carts: Number(row.cart_count || 0),
    sold: Math.max(0, website + whatsapp + call + offline + adjustment),
    soldBySource: { website, whatsapp, call, offline, adjustment }
  };
}

async function getProductStats(env, productId) {
  const row = await env.DB.prepare(`SELECT * FROM product_stats WHERE product_id=?`).bind(productId).first();
  return statsFromRow(row || {});
}

async function isPublicProduct(env, productId) {
  const row = await env.DB.prepare(`SELECT 1 AS ok FROM products WHERE id=? AND status='active'`).bind(productId).first();
  return !!row;
}

function mapGalleryRow(r) {
  return {
    id: Number(r.id), url: r.url, name_en: r.name_en, name_bn: r.name_bn,
    sortOrder: Number(r.sort_order || 0), status: r.status
  };
}

function normalizeSizeGrid(raw){
  let cells=[];
  if(Array.isArray(raw?.cells))cells=raw.cells;
  else if(Array.isArray(raw?.headers))cells=[raw.headers,...(Array.isArray(raw.rows)?raw.rows:[])];
  cells=cells.slice(0,50).map(row=>(Array.isArray(row)?row:[]).slice(0,20).map(cell=>cleanText(cell,200)));
  const columns=Math.max(0,...cells.map(r=>r.length));
  if(!cells.length||!columns)throw new HttpError(400,'Size chart needs at least one row and one column');
  cells=cells.map(row=>Array.from({length:columns},(_,i)=>row[i]||''));
  return {cells};
}
function sanitizeSvgCode(raw){
  let svg=String(raw||'').trim();
  if(!svg)throw new HttpError(400,'SVG code is required');
  if(new TextEncoder().encode(svg).length>220000)throw new HttpError(413,'SVG diagram must be 220 KB or smaller');
  if(!/^<svg\b/i.test(svg)||!/<\/svg>\s*$/i.test(svg))throw new HttpError(400,'Paste one complete SVG element');
  if(!/\bviewBox\s*=\s*(["'])[\s\d.\-]+\1/i.test(svg))throw new HttpError(400,'SVG viewBox is required');
  if(/<!DOCTYPE|<!ENTITY/i.test(svg))throw new HttpError(400,'DOCTYPE and ENTITY are not allowed in SVG');
  if(/<(?:script|foreignObject|iframe|object|embed|audio|video|a|animate|animateTransform|animateMotion|set)\b/i.test(svg))throw new HttpError(400,'SVG contains a forbidden element');
  if(/\son[a-z]+\s*=/i.test(svg)||/javascript\s*:/i.test(svg)||/data\s*:\s*text\/html/i.test(svg))throw new HttpError(400,'SVG contains unsafe script or event content');
  const refs=[...svg.matchAll(/(?:href|xlink:href|src)\s*=\s*(["'])(.*?)\1/gi)].map(m=>m[2].trim());
  if(refs.some(v=>v&&!v.startsWith('#')&&!/^data:image\/(?:png|jpeg|jpg|webp);base64,/i.test(v)))throw new HttpError(400,'External SVG resources are not allowed');
  const urls=[...svg.matchAll(/url\(\s*(["']?)(.*?)\1\s*\)/gi)].map(m=>m[2].trim());
  if(urls.some(v=>v&&!v.startsWith('#')&&!/^data:image\/(?:png|jpeg|jpg|webp);base64,/i.test(v)))throw new HttpError(400,'External CSS URLs are not allowed');
  if(/@import/i.test(svg))throw new HttpError(400,'CSS imports are not allowed');
  return svg;
}
function normalizeSizeDiagram(raw){
  const svg=sanitizeSvgCode(raw?.svg),m=svg.match(/\bviewBox\s*=\s*(["'])([^"']+)\1/i),viewBox=cleanText(m?.[2]||'0 0 1200 675',100);
  const nums=viewBox.trim().split(/[\s,]+/).map(Number),w=nums[2],h=nums[3];
  const aspectRatio=Number.isFinite(w)&&Number.isFinite(h)&&w>0&&h>0?`${Number(w.toFixed(3))}/${Number(h.toFixed(3))}`:'16/9';
  return {svg,alt_en:cleanText(raw.alt_en,300),alt_bn:cleanText(raw.alt_bn,300),viewBox,aspectRatio,position:raw.position==='after_table'?'after_table':'before_table',enabled:raw.enabled!==false};
}
async function loadSizeDiagramMap(env){
  try{
    const rows=await env.DB.prepare(`SELECT * FROM size_chart_diagrams`).all();
    return new Map((rows.results||[]).map(r=>[Number(r.template_id),r]));
  }catch(e){
    if(String(e.message||'').toLowerCase().includes('no such table'))return new Map();
    throw e;
  }
}
function mapSizeChartRow(r,d=null,includeSvg=false){
  const id=Number(r.id),diagram=d?{
    available:!!d.enabled,
    url:`/api/size-charts/${id}/diagram.svg?v=${Number(d.updated_at||0)}`,
    alt_en:d.alt_en||'',alt_bn:d.alt_bn||'',viewBox:d.view_box||'0 0 1200 675',
    aspectRatio:d.aspect_ratio||'16/9',position:d.position==='after_table'?'after_table':'before_table',
    enabled:!!d.enabled,updatedAt:Number(d.updated_at||0),...(includeSvg?{svg:d.svg_code||''}:{})
  }:null;
  return {id,internalName:r.internal_name,title_en:r.title_en,title_bn:r.title_bn,description_en:r.description_en,description_bn:r.description_bn,grid:safeJsonParse(r.grid_json,{cells:[]}),diagram,status:r.status,priority:Number(r.priority||100),createdAt:Number(r.created_at||0),updatedAt:Number(r.updated_at||0)};
}

function mapHeroSlideRow(r) {
  return {
    id:Number(r.id), internalName:r.internal_name||'', imageUrl:r.image_url,
    lines_en:[r.line1_en,r.line2_en,r.line3_en], lines_bn:[r.line1_bn,r.line2_bn,r.line3_bn],
    status:r.status, priority:Number(r.priority||100), createdAt:Number(r.created_at||0), updatedAt:Number(r.updated_at||0)
  };
}

async function loadCatalogFromD1(env, includePrivate = false) {
  requireD1(env);
  const productSql = includePrivate
    ? `SELECT p.*,s.view_count,s.like_count,s.cart_count,s.website_sold,s.whatsapp_sold,s.call_sold,s.offline_sold,s.manual_adjustment
       FROM products p LEFT JOIN product_stats s ON s.product_id=p.id
       ORDER BY p.priority,p.id`
    : `SELECT p.*,s.view_count,s.like_count,s.cart_count,s.website_sold,s.whatsapp_sold,s.call_sold,s.offline_sold,s.manual_adjustment
       FROM products p LEFT JOIN product_stats s ON s.product_id=p.id
       WHERE p.status='active' ORDER BY p.priority,p.id`;

  /* D1 allows up to six simultaneous connections per invocation. */
  const [pr, mr, or, vr, xr, gr] = await Promise.all([
    env.DB.prepare(productSql).all(),
    env.DB.prepare(`SELECT * FROM product_media ORDER BY product_id,sort_order,id`).all(),
    env.DB.prepare(`SELECT o.*,v.id AS value_id,v.value_code,v.value_en,v.value_bn,v.color_hex,v.sort_order AS value_sort
      FROM product_options o LEFT JOIN product_option_values v ON v.option_id=o.id
      ORDER BY o.product_id,o.sort_order,o.id,v.sort_order,v.id`).all(),
    env.DB.prepare(`SELECT * FROM product_variants ORDER BY product_id,id`).all(),
    env.DB.prepare(`SELECT vv.variant_id,o.code AS option_code,v.value_code,v.value_en,v.value_bn,v.color_hex
      FROM variant_option_values vv
      JOIN product_options o ON o.id=vv.option_id
      JOIN product_option_values v ON v.id=vv.option_value_id`).all(),
    env.DB.prepare(`SELECT * FROM gallery_items WHERE ${includePrivate ? '1=1' : "status='active'"} ORDER BY sort_order,id`).all()
  ]);
  const sr = await env.DB.prepare(`SELECT setting_key,setting_value FROM app_settings`).all();
  let hr={results:[]},tr={results:[]},ar={results:[]};
  try { hr=await env.DB.prepare(`SELECT * FROM hero_slides WHERE ${includePrivate ? '1=1' : "status='active'"} ORDER BY priority,id`).all(); }
  catch(e){ if(!String(e.message).toLowerCase().includes('no such table')) throw e; }
  try {
    [tr,ar]=await Promise.all([
      env.DB.prepare(`SELECT * FROM size_chart_templates WHERE ${includePrivate ? '1=1' : "status='active'"} ORDER BY priority,id`).all(),
      env.DB.prepare(`SELECT product_id,template_id FROM product_size_chart_assignments`).all()
    ]);
  } catch(e){ if(!String(e.message).toLowerCase().includes('no such table')) throw e; }

  const productRows = pr.results || [];
  const allowed = new Set(productRows.map(p => Number(p.id)));
  const mediaByProduct = new Map();
  for (const m of (mr.results || [])) {
    if (!allowed.has(Number(m.product_id))) continue;
    if (!mediaByProduct.has(Number(m.product_id))) mediaByProduct.set(Number(m.product_id), []);
    mediaByProduct.get(Number(m.product_id)).push({
      id:Number(m.id), url:m.url, alt_en:m.alt_en, alt_bn:m.alt_bn, sortOrder:Number(m.sort_order||0)
    });
  }

  const optionsByProduct = new Map();
  const optionById = new Map();
  for (const r of (or.results || [])) {
    if (!allowed.has(Number(r.product_id))) continue;
    let option = optionById.get(Number(r.id));
    if (!option) {
      option = {
        id:Number(r.id), code:r.code, label_en:r.label_en, label_bn:r.label_bn,
        displayType:r.display_type, required:!!r.is_required, createsVariant:!!r.creates_variant,
        sortOrder:Number(r.sort_order||0), values:[]
      };
      optionById.set(Number(r.id), option);
      if (!optionsByProduct.has(Number(r.product_id))) optionsByProduct.set(Number(r.product_id), []);
      optionsByProduct.get(Number(r.product_id)).push(option);
    }
    if (r.value_id != null) option.values.push({
      id:Number(r.value_id), code:r.value_code, value_en:r.value_en, value_bn:r.value_bn,
      colorHex:r.color_hex || '', sortOrder:Number(r.value_sort||0)
    });
  }

  const variantValues = new Map();
  for (const x of (xr.results || [])) {
    if (!variantValues.has(Number(x.variant_id))) variantValues.set(Number(x.variant_id), {});
    variantValues.get(Number(x.variant_id))[x.option_code] = {
      code:x.value_code, value_en:x.value_en, value_bn:x.value_bn, colorHex:x.color_hex || ''
    };
  }
  const variantsByProduct = new Map();
  for (const v of (vr.results || [])) {
    if (!allowed.has(Number(v.product_id))) continue;
    if (!includePrivate && !v.is_active) continue;
    if (!variantsByProduct.has(Number(v.product_id))) variantsByProduct.set(Number(v.product_id), []);
    const stockQty = Number(v.stock_qty || 0), reservedQty = Number(v.reserved_qty || 0);
    variantsByProduct.get(Number(v.product_id)).push({
      id:Number(v.id), sku:v.sku, title:v.title || '', stockQty, reservedQty,
      availableQty:stockQty-reservedQty, priceOverride:v.price_override == null ? null : Number(v.price_override),
      active:!!v.is_active, salesStatus:v.sales_status, lowStockThreshold:Number(v.low_stock_threshold||0),
      optionValues:variantValues.get(Number(v.id)) || {}
    });
  }

  const sizeDiagramMap=await loadSizeDiagramMap(env);
  const sizeTemplates=(tr.results||[]).map(r=>mapSizeChartRow(r,sizeDiagramMap.get(Number(r.id)),false)),sizeTemplateMap=new Map(sizeTemplates.map(t=>[t.id,t]));
  const sizeAssignmentMap=new Map((ar.results||[]).map(a=>[Number(a.product_id),Number(a.template_id)]));
  const products = productRows.map(p => {
    const sizeChartTemplateId=sizeAssignmentMap.get(Number(p.id))||null,assignedTemplate=sizeTemplateMap.get(sizeChartTemplateId);
    return ({
    id:Number(p.id), slug:p.slug, name_en:p.name_en, name_bn:p.name_bn,
    sub_en:p.sub_en, sub_bn:p.sub_bn, category:p.category,
    price:Number(p.price||0), comparePrice:Number(p.compare_price||0),
    description_en:p.description_en, description_bn:p.description_bn,
    mainImageUrl:p.main_image_url, heroImageUrl:p.hero_image_url,
    heroLines_en:safeJsonParse(p.hero_lines_en,[]), heroLines_bn:safeJsonParse(p.hero_lines_bn,[]),
    sizeChartTemplateId, sizeChart:assignedTemplate?.grid||safeJsonParse(p.size_chart_json,{}), status:p.status, salesStatus:p.sales_status,
    allowBackorder:!!p.allow_backorder, priority:Number(p.priority||100),
    showcaseRow:p.showcase_row == null ? null : Number(p.showcase_row),
    showcasePosition:p.showcase_position == null ? null : Number(p.showcase_position),
    detailImages:mediaByProduct.get(Number(p.id)) || [],
    options:optionsByProduct.get(Number(p.id)) || [],
    variants:variantsByProduct.get(Number(p.id)) || [],
    stats:statsFromRow(p), createdAt:Number(p.created_at||0), updatedAt:Number(p.updated_at||0)
  });
  });

  const settings = Object.fromEntries((sr.results || []).map(r => [r.setting_key,r.setting_value]));
  return {
    version:Number(settings.catalog_version || 1),
    settings:{
      showcaseLayoutMode:settings.showcase_layout_mode || 'auto',
      showcaseMaxPerRow:Number(settings.showcase_max_per_row || 10),
      soldDelayHours:Number(settings.sold_delay_hours || 0)
    },
    products,
    sizeChartTemplates:sizeTemplates,
    heroSlides:(hr.results||[]).map(mapHeroSlideRow),
    gallery:(gr.results || []).map(mapGalleryRow)
  };
}

function normalizeProductInput(body) {
  const p = body?.product || body || {};
  const id = nullablePositiveInt(p.id);
  const nameEn = cleanText(p.name_en ?? p.nameEn, 180);
  if (!nameEn) throw new HttpError(400, 'English product name is required');
  const price = Number(p.price);
  if (!Number.isFinite(price) || price < 0) throw new HttpError(400, 'Valid product price is required');
  const status = ['draft','active','archived'].includes(p.status) ? p.status : 'draft';
  const salesStatus = ['available','limited','out_of_stock'].includes(p.salesStatus ?? p.sales_status)
    ? (p.salesStatus ?? p.sales_status) : 'available';
  const mainImageUrl = validHttpsUrl(p.mainImageUrl ?? p.main_image_url);
  const heroImageUrl = validHttpsUrl(p.heroImageUrl ?? p.hero_image_url);
  if (status === 'active' && !mainImageUrl) throw new HttpError(400, 'Active product requires a valid HTTPS main image URL');
  const slug = cleanCode(p.slug, cleanCode(nameEn, `product-${Date.now()}`));
  const heroLinesEn = Array.isArray(p.heroLines_en ?? p.hero_lines_en) ? (p.heroLines_en ?? p.hero_lines_en).slice(0,8) : [];
  const heroLinesBn = Array.isArray(p.heroLines_bn ?? p.hero_lines_bn) ? (p.heroLines_bn ?? p.hero_lines_bn).slice(0,8) : [];
  const sizeChart = p.sizeChart && typeof p.sizeChart === 'object' ? p.sizeChart : {};
  return {
    id, slug, nameEn, nameBn:cleanText(p.name_bn ?? p.nameBn,180),
    subEn:cleanText(p.sub_en ?? p.subEn,250), subBn:cleanText(p.sub_bn ?? p.subBn,250),
    category:cleanText(p.category,100)||'Exclusive', price,
    comparePrice:Math.max(0,Number(p.comparePrice ?? p.compare_price)||0),
    descriptionEn:cleanText(p.description_en ?? p.descriptionEn,100000),
    descriptionBn:cleanText(p.description_bn ?? p.descriptionBn,100000),
    mainImageUrl,heroImageUrl,heroLinesEn,heroLinesBn,sizeChart,status,salesStatus,
    allowBackorder:boolInt(p.allowBackorder ?? p.allow_backorder,1),
    priority:Number.isFinite(Number(p.priority)) ? Math.trunc(Number(p.priority)) : 100,
    showcaseRow:nullablePositiveInt(p.showcaseRow ?? p.showcase_row),
    showcasePosition:nullablePositiveInt(p.showcasePosition ?? p.showcase_position),
    sizeChartTemplateId:nullablePositiveInt(p.sizeChartTemplateId ?? p.size_chart_template_id),
    media:Array.isArray(body.media ?? p.detailImages) ? (body.media ?? p.detailImages).slice(0,100) : [],
    options:Array.isArray(body.options ?? p.options) ? (body.options ?? p.options).slice(0,12) : [],
    variants:Array.isArray(body.variants ?? p.variants) ? (body.variants ?? p.variants).slice(0,1500) : []
  };
}

function addChunkedRows(statements, env, prefix, rows, suffix = '', maxParams = 90) {
  if (!rows.length) return;
  const width = rows[0].length;
  const perChunk = Math.max(1, Math.floor(maxParams / width));
  for (let i=0; i<rows.length; i+=perChunk) {
    const chunk = rows.slice(i, i+perChunk);
    const placeholders = chunk.map(() => `(${Array(width).fill('?').join(',')})`).join(',');
    statements.push(env.DB.prepare(`${prefix}${placeholders}${suffix}`).bind(...chunk.flat()));
  }
}

async function uniqueProductSlug(env,base,productId){let slug=base||`product-${Date.now()}`,n=2;while(true){const row=await env.DB.prepare(`SELECT id FROM products WHERE slug=? AND (? IS NULL OR id<>?)`).bind(slug,productId,productId).first();if(!row)return slug;slug=`${base}-${n++}`;if(n>1000)throw new HttpError(409,'Could not create a unique product slug');}}
async function saveProductGraph(env, body, request) {
  const input = normalizeProductInput(body);
  input.slug=await uniqueProductSlug(env,input.slug,input.id);
  const now = Date.now();
  let productId = input.id;
  if (productId) {
    const exists = await env.DB.prepare(`SELECT id FROM products WHERE id=?`).bind(productId).first();
    if (!exists) throw new HttpError(404, 'Product not found');
    await env.DB.prepare(`UPDATE products SET slug=?,name_en=?,name_bn=?,sub_en=?,sub_bn=?,category=?,price=?,compare_price=?,
      description_en=?,description_bn=?,main_image_url=?,hero_image_url=?,hero_lines_en=?,hero_lines_bn=?,size_chart_json=?,
      status=?,sales_status=?,allow_backorder=?,priority=?,showcase_row=?,showcase_position=?,archived_at=?,updated_at=? WHERE id=?`)
      .bind(input.slug,input.nameEn,input.nameBn,input.subEn,input.subBn,input.category,input.price,input.comparePrice,
        input.descriptionEn,input.descriptionBn,input.mainImageUrl,input.heroImageUrl,JSON.stringify(input.heroLinesEn),JSON.stringify(input.heroLinesBn),JSON.stringify(input.sizeChart),
        input.status,input.salesStatus,input.allowBackorder,input.priority,input.showcaseRow,input.showcasePosition,
        input.status==='archived'?now:null,now,productId).run();
  } else {
    const result = await env.DB.prepare(`INSERT INTO products(slug,name_en,name_bn,sub_en,sub_bn,category,price,compare_price,
      description_en,description_bn,main_image_url,hero_image_url,hero_lines_en,hero_lines_bn,size_chart_json,status,sales_status,
      allow_backorder,priority,showcase_row,showcase_position,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(input.slug,input.nameEn,input.nameBn,input.subEn,input.subBn,input.category,input.price,input.comparePrice,
        input.descriptionEn,input.descriptionBn,input.mainImageUrl,input.heroImageUrl,JSON.stringify(input.heroLinesEn),JSON.stringify(input.heroLinesBn),JSON.stringify(input.sizeChart),
        input.status,input.salesStatus,input.allowBackorder,input.priority,input.showcaseRow,input.showcasePosition,now,now).run();
    productId = Number(result?.meta?.last_row_id);
    if (!productId) throw new HttpError(500, 'Could not create product');
  }

  const currentVariants = await env.DB.prepare(`SELECT id,sku FROM product_variants WHERE product_id=?`).bind(productId).all();
  const variantIdBySku = new Map((currentVariants.results||[]).map(v=>[String(v.sku).toUpperCase(),Number(v.id)]));
  const mediaRows=[], optionRows=[], valueRows=[], variantRows=[], mappingRows=[];

  for (let i=0;i<input.media.length;i++) {
    const m=input.media[i]||{}; const url=validHttpsUrl(m.url||m);
    if (url) mediaRows.push([productId,'detail',url,cleanText(m.alt_en??m.altEn,180),cleanText(m.alt_bn??m.altBn,180),Number(m.sortOrder)||i+1,now]);
  }

  const optionIdByCode = new Map(), valueIdByPair = new Map();
  for (let oi=0;oi<input.options.length;oi++) {
    const o=input.options[oi]||{}, code=cleanCode(o.code,`option-${oi+1}`), optionId=generatedNumericId();
    optionIdByCode.set(code,optionId);
    const display=['buttons','swatches','dropdown','text'].includes(o.displayType)?o.displayType:'buttons';
    optionRows.push([optionId,productId,code,cleanText(o.label_en??o.labelEn,100)||code,cleanText(o.label_bn??o.labelBn,100),display,boolInt(o.required,1),boolInt(o.createsVariant,1),Number(o.sortOrder)||oi+1]);
    const values=Array.isArray(o.values)?o.values.slice(0,100):[];
    for(let vi=0;vi<values.length;vi++){
      const v=values[vi]||{}, valueCode=cleanCode(v.code??v.value_code??v.value_en,`value-${vi+1}`), valueId=generatedNumericId();
      valueIdByPair.set(`${code}:${valueCode}`,valueId);
      valueRows.push([valueId,optionId,valueCode,cleanText(v.value_en??v.valueEn,100)||valueCode,cleanText(v.value_bn??v.valueBn,100),cleanText(v.colorHex??v.color_hex,20),Number(v.sortOrder)||vi+1]);
    }
  }

  const usedSkus=new Set();
  for(let vi=0;vi<input.variants.length;vi++){
    const v=input.variants[vi]||{}, sku=cleanText(v.sku,100).toUpperCase().replace(/[^A-Z0-9_.\-]/g,'');
    if(!sku||usedSkus.has(sku)) throw new HttpError(400,`Duplicate or invalid SKU at variant ${vi+1}`);
    usedSkus.add(sku);
    const variantId=variantIdBySku.get(sku)||generatedNumericId();
    const status=['available','limited','out_of_stock'].includes(v.salesStatus)?v.salesStatus:'available';
    variantRows.push([variantId,productId,sku,cleanText(v.title,180),Math.trunc(Number(v.stockQty)||0),0,
      v.priceOverride==null||v.priceOverride===''?null:Number(v.priceOverride),boolInt(v.active,1),status,
      Math.max(0,Math.trunc(Number(v.lowStockThreshold)||5)),now,now]);
    const ovs=v.optionValues&&typeof v.optionValues==='object'?v.optionValues:{};
    for(const [rawCode,rawValue] of Object.entries(ovs)){
      const code=cleanCode(rawCode), valueCode=cleanCode(typeof rawValue==='object'?(rawValue.code??rawValue.value_code):rawValue);
      const optionId=optionIdByCode.get(code), valueId=valueIdByPair.get(`${code}:${valueCode}`);
      if(optionId&&valueId) mappingRows.push([variantId,optionId,valueId]);
    }
  }

  const hasSizeAssignments=await d1TableExists(env,'product_size_chart_assignments');
  const statements = [
    env.DB.prepare(`DELETE FROM product_media WHERE product_id=?`).bind(productId),
    env.DB.prepare(`DELETE FROM product_options WHERE product_id=?`).bind(productId),
    env.DB.prepare(`UPDATE product_variants SET is_active=0,updated_at=? WHERE product_id=?`).bind(now,productId),
    env.DB.prepare(`INSERT OR IGNORE INTO product_stats(product_id,updated_at) VALUES(?,?)`).bind(productId,now)
  ];
  if(hasSizeAssignments){statements.push(env.DB.prepare(`DELETE FROM product_size_chart_assignments WHERE product_id=?`).bind(productId));if(input.sizeChartTemplateId)statements.push(env.DB.prepare(`INSERT INTO product_size_chart_assignments(product_id,template_id,updated_at) VALUES(?,?,?)`).bind(productId,input.sizeChartTemplateId,now));}
  addChunkedRows(statements,env,`INSERT INTO product_media(product_id,media_type,url,alt_en,alt_bn,sort_order,created_at) VALUES `,mediaRows);
  addChunkedRows(statements,env,`INSERT INTO product_options(id,product_id,code,label_en,label_bn,display_type,is_required,creates_variant,sort_order) VALUES `,optionRows);
  addChunkedRows(statements,env,`INSERT INTO product_option_values(id,option_id,value_code,value_en,value_bn,color_hex,sort_order) VALUES `,valueRows);
  addChunkedRows(statements,env,`INSERT INTO product_variants(id,product_id,sku,title,stock_qty,reserved_qty,price_override,is_active,sales_status,low_stock_threshold,created_at,updated_at) VALUES `,variantRows,
    ` ON CONFLICT(sku) DO UPDATE SET title=excluded.title,stock_qty=excluded.stock_qty,price_override=excluded.price_override,is_active=excluded.is_active,sales_status=excluded.sales_status,low_stock_threshold=excluded.low_stock_threshold,updated_at=excluded.updated_at`);
  addChunkedRows(statements,env,`INSERT INTO variant_option_values(variant_id,option_id,option_value_id) VALUES `,mappingRows);
  statements.push(catalogVersionStatement(env,now));

  if (statements.length > 45) throw new HttpError(400,'This product graph is too large for one safe save. Reduce variants or split the product.');
  try { await env.DB.batch(statements); }
  catch(err){
    if(String(err.message).toLowerCase().includes('unique')) throw new HttpError(409,'Slug or SKU already exists');
    throw err;
  }
  await writeAudit(env,request,input.id?'product_update':'product_create','product',String(productId),{name:input.nameEn,status:input.status,variants:input.variants.length,queries:statements.length});
  const catalog=await loadCatalogFromD1(env,true);
  return catalog.products.find(p=>p.id===productId);
}
function catalogVersionStatement(env, now=Date.now()) {
  return env.DB.prepare(`INSERT INTO app_settings(setting_key,setting_value,updated_at) VALUES('catalog_version','2',?)
    ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(CAST(setting_value AS INTEGER)+1 AS TEXT),updated_at=excluded.updated_at`).bind(now);
}
async function bumpCatalogVersion(env) { await catalogVersionStatement(env).run(); }

async function writeAudit(env, request, action, entityType, entityId, detail) {
  try {
    if(!env.DB) return;
    const ip=request.headers.get('CF-Connecting-IP')||'';
    const ipHash=ip?await hashString(ip):'';
    await env.DB.prepare(`INSERT INTO admin_audit_logs(action,entity_type,entity_id,detail_json,admin_ref,ip_hash,created_at) VALUES(?,?,?,?,?,?,?)`)
      .bind(action,entityType,entityId||'',JSON.stringify(detail||{}),'admin',ipHash,Date.now()).run();
  } catch(_){}
}


/* ================================================================
   REVIEW HELPERS
   ================================================================ */

/* Priority score calculation — same logic as frontend */
function calcPriorityScore(r) {
  const hasImg = r.hasProductImages;
  const boost  = r.priorityBoost || 0;
  const map = {
    5: hasImg ? 100 : 80,
    4: hasImg ?  60 : 40,
    3: hasImg ?  20 : 10,
    2: hasImg ?   5 :  2,
    1:              1,
  };
  return (map[r.rating] || 0) + boost + (r.likes || 0) * 0.5;
}

function sortByPriorityScore(arr) {
  return [...arr].sort((a, b) =>
    calcPriorityScore(b) - calcPriorityScore(a)
  );
}

function applyReviewFilter(reviews, filter) {
  switch (filter) {
    case '5':      return reviews.filter(r => r.rating === 5);
    case '4':      return reviews.filter(r => r.rating === 4);
    case '3':      return reviews.filter(r => r.rating === 3);
    case 'lowest': return reviews.filter(r => r.rating <= 2);
    case 'images': return reviews.filter(r => r.hasProductImages);
    default:       return reviews;
  }
}

/* Frontend এ safe data (image data ছাড়া URL/flag পাঠাই) */
function safeReviewForPublic(r) {
  return {
    id:              r.id,
    rating:          r.rating,
    text_en:         r.text_en,
    text_bn:         r.text_bn,
    name:            r.name,
    anonNum:         r.anonNum,
    location_en:     r.location_en,
    location_bn:     r.location_bn,
    avatar:          r.avatar || null,     /* base64 পাঠাই */
    productImgs:     r.productImgs || [],  /* base64 array */
    hasProductImages: r.hasProductImages,
    likes:           r.likes || 0,
    status:          r.status,
    verified:        r.verified,
    approvedBy:      r.approvedBy,
    date:            r.date,
    createdAt:       r.createdAt,
    priorityBoost:   r.priorityBoost || 0,
  };
}

/* Telegram message for new review (visitor text is ESCAPED — Telegram HTML
   parse_mode injection থেকে admin chat সুরক্ষিত থাকে) */
function buildReviewTelegramMsg(review, autoShow) {
  const name = htmlEsc(review.name || `Anonymous_${String(review.anonNum||'').padStart(3,'0')}`);
  const safeText = htmlEsc(String(review.text_en || '').substring(0, 200));
  const stars = '★'.repeat(review.rating) + '☆'.repeat(5 - review.rating);
  const imgInfo = review.hasProductImages
    ? `\n📸 Images: ${review.productImgs.length}`
    : '';
  const avatarInfo = review.avatar ? '\n🖼 Avatar: Yes' : '';
  const status = autoShow ? '⚡ AUTO-SHOWN (pending verification)' : '⏳ PENDING APPROVAL';

  return `💬 <b>NEW REVIEW — KORA ROYAL</b>\n` +
    `━━━━━━━━━━━━━━━━━\n` +
    `⭐ ${stars}  (${review.rating}/5)\n` +
    `👤 ${name}\n` +
    `📝 ${safeText}${review.text_en.length > 200 ? '...' : ''}\n` +
    `${imgInfo}${avatarInfo}\n` +
    `━━━━━━━━━━━━━━━━━\n` +
    `Status: <b>${status}</b>\n` +
    `ID: <code>${review.id}</code>`;
}

/* Base64 size estimate */
function estimateBase64Size(b64) {
  if (!b64) return 0;
  const base = b64.split(',')[1] || b64;
  return Math.ceil(base.length * 0.75);
}

/* Image format validation */
function isValidImageBase64(b64) {
  if (!b64) return false;
  const validPrefixes = [
    'data:image/jpeg;base64,',
    'data:image/jpg;base64,',
    'data:image/png;base64,',
    'data:image/webp;base64,',
  ];
  return validPrefixes.some(p => b64.startsWith(p));
}

/* Simple hash for IP */
async function hashString(str) {
  const encoder = new TextEncoder();
  const data    = encoder.encode(str);
  const hash    = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2,'0'))
    .join('')
    .slice(0, 16);
}

/* ================================================================
   CLOUDINARY UPLOAD — signed upload from the Worker.
   Secrets needed (Cloudflare): CLOUDINARY_CLOUD_NAME,
   CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET.
   ================================================================ */
async function sha1Hex(str) {
  const data = new TextEncoder().encode(str);
  const buf  = await crypto.subtle.digest('SHA-1', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}

function isCloudinaryConfigured(env) {
  return !!(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET);
}

/* Uploads a base64 data-URI to Cloudinary and returns an AUTO-OPTIMIZED
   secure URL (f_auto + q_auto + optional size transform), so visitors never
   download multi-megabyte originals. Returns null if not configured. */
async function cloudinaryUpload(env, dataUri, folder, publicId, transform) {
  if (!isCloudinaryConfigured(env)) return null;
  const ts = Math.floor(Date.now() / 1000);
  const params = { folder: folder || 'kora-royal/reviews', timestamp: String(ts) };
  if (publicId) params.public_id = publicId;
  /* Cloudinary signature rule: ALL signing params (except file/api_key) sorted
     ALPHABETICALLY, joined with '&', then the API secret appended at the end.
     (আগের বাগ: timestamp সবার আগে বসে ছিল → "Invalid Signature" → নীরব base64
     fallback-এ ~6MB রেসপন্স।) */
  const toSign = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join('&') + env.CLOUDINARY_API_SECRET;
  const signature = await sha1Hex(toSign);

  const fd = new FormData();
  fd.append('file', dataUri);
  fd.append('api_key', env.CLOUDINARY_API_KEY);
  for (const k of Object.keys(params)) fd.append(k, params[k]);
  fd.append('signature', signature);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/auto/upload`, {
    method: 'POST', body: fd
  });
  const j = await res.json();
  if (j.secure_url) {
    const t = transform || 'f_auto,q_auto';
    return j.secure_url.replace('/upload/', `/upload/${t}/`);
  }
  throw new Error('Cloudinary upload failed: ' + (j.error?.message || `HTTP ${res.status}`));
}


/* ================================================================
   ORIGINAL HELPERS — অপরিবর্তিত
   ================================================================ */

function buildCors(request, env) {
  const origin = request.headers.get('Origin') || '';
  const configured = String(env.ALLOWED_ORIGIN || '').split(',').map(x => x.trim()).filter(Boolean);
  /* Mobile local-preview servers may use localhost, loopback or a private LAN IP. */
  const localAllowed = /^https?:\/\/(([^./]+\.)?localhost|127\.0\.0\.1|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})(:\d+)?$/.test(origin);
  const allowed = !origin || localAllowed || configured.includes(origin);
  return {
    'Access-Control-Allow-Origin': allowed && origin ? origin : (configured[0] || 'null'),
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Idempotency-Key',
    'Access-Control-Max-Age': '86400',
  };
}

function jsonRes(data, status, corsHeaders, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, ...extraHeaders, 'Content-Type': 'application/json; charset=utf-8' }
  });
}

async function makeToken(secret) {
  if (!secret) throw new HttpError(503, 'ADMIN_SECRET is not configured');
  const payload = {
    iat: Date.now(),
    exp: Date.now() + 8 * 60 * 60 * 1000,
    nonce: crypto.randomUUID()
  };
  const encoded = base64UrlEncode(JSON.stringify(payload));
  const signature = await hmacSign(encoded, secret);
  return `${encoded}.${signature}`;
}

async function verifyAdmin(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token || !env.ADMIN_SECRET) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const expected = await hmacSign(parts[0], env.ADMIN_SECRET);
  if (!constantTimeEqual(expected, parts[1])) return false;
  try {
    const payload = JSON.parse(base64UrlDecode(parts[0]));
    return Number(payload.exp) > Date.now() && Number(payload.iat) <= Date.now() + 60000;
  } catch { return false; }
}

async function hmacSign(value, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name:'HMAC', hash:'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(value));
  return bytesToBase64Url(new Uint8Array(sig));
}
function bytesToBase64Url(bytes) {
  let binary=''; for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function base64UrlEncode(value) { return bytesToBase64Url(new TextEncoder().encode(value)); }
function base64UrlDecode(value) {
  const normalized=value.replace(/-/g,'+').replace(/_/g,'/');
  const binary=atob(normalized + '='.repeat((4-normalized.length%4)%4));
  const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
function constantTimeEqual(a,b) {
  if (a.length !== b.length) return false;
  let out=0; for(let i=0;i<a.length;i++) out |= a.charCodeAt(i)^b.charCodeAt(i);
  return out===0;
}

async function incrementStat(env, key) {
  try {
    const raw = await env.KR_ORDERS.get(`stat:${key}`);
    const val = raw ? parseInt(raw) + 1 : 1;
    await env.KR_ORDERS.put(`stat:${key}`, String(val));
  } catch (e) { /* ignore */ }
}

async function sendTelegramMsg(text, token, chatId) {
  if (!token || !chatId) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' })
    });
    const json = await res.json();
    return json.ok === true;
  } catch { return false; }
}

async function sendOrderToTelegram(data, env) {
  return sendTelegramMsg(data.telegramMessage, env.TELEGRAM_TOKEN, env.TELEGRAM_CHAT);
}

async function sendOrderToSheets(data, env) {
  const sheetsUrl = env.SHEETS_URL;
  if (!sheetsUrl || !data.sheetsPayload) return false;
  try {
    const res = await fetch(sheetsUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(data.sheetsPayload)
    });
    return res.ok;
  } catch { return false; }
}

async function sendLeadToTelegram(data, env) {
  return sendTelegramMsg(data.telegramMessage, env.LEAD_BOT_TOKEN, env.LEAD_BOT_CHAT);
}

async function sendLeadToSheets(data, env) {
  const sheetsUrl = env.LEAD_SHEETS_URL;
  if (!sheetsUrl || !data.sheetsPayload) return false;
  try {
    const res = await fetch(sheetsUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(data.sheetsPayload)
    });
    return res.ok;
  } catch { return false; }
}