// Run this on Railway Console to add demo vendors and products:
// node database/demo-seed.js

const db     = require('../src/config/db');
const { id } = require('../src/utils/ids');
const bcrypt = require('bcryptjs');

const pass = bcrypt.hashSync('Vendor@1234', 10);
const vendorIds = [];

const vendorUsers = [
  { name:'Ahmed Electronics',  email:'ahmed@demo.psh',  phone:'03001234567', city:'Lahore',     province:'Punjab', tagline:'Best Electronics at Wholesale Prices' },
  { name:'Fatima Fashion Hub', email:'fatima@demo.psh', phone:'03111234567', city:'Karachi',    province:'Sindh',  tagline:'Premium Women Fashion – COD Available' },
  { name:'Bilal Home Store',   email:'bilal@demo.psh',  phone:'03211234567', city:'Faisalabad', province:'Punjab', tagline:'Home & Kitchen Essentials Wholesale' },
];

for (const vu of vendorUsers) {
  let uid;
  const eu = db.get('SELECT id FROM users WHERE email = ?', [vu.email]);
  if (eu) { uid = eu.id; } else {
    uid = id('user');
    db.run('INSERT INTO users (id,name,email,phone,password_hash,role,email_verified,status) VALUES (?,?,?,?,?,?,1,?)',
      [uid, vu.name, vu.email, vu.phone, pass, 'vendor', 'active']);
  }
  let vid;
  const ev = db.get('SELECT id FROM vendors WHERE user_id = ?', [uid]);
  if (ev) { vid = ev.id; } else {
    vid = id('vend');
    db.run('INSERT INTO vendors (id,user_id,business_name,business_type,business_phone,warehouse_city,warehouse_province,status,is_verified,commission_override) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [vid, uid, vu.name, 'supplier', vu.phone, vu.city, vu.province, 'approved', 1, 10]);
  }
  const es = db.get('SELECT id FROM stores WHERE vendor_id = ?', [vid]);
  if (!es) {
    const sid  = id('stor');
    const slug = vu.name.toLowerCase().replace(/[^a-z0-9]+/g,'-') + '-' + vid.slice(-4);
    db.run('INSERT INTO stores (id,vendor_id,slug,store_name,tagline,description,is_featured) VALUES (?,?,?,?,?,?,0)',
      [sid, vid, slug, vu.name, vu.tagline, vu.name + ' — trusted wholesale supplier in ' + vu.city + '. Competitive prices, fast delivery, COD available.']);
  }
  vendorIds.push(vid);
  console.log('✅ Vendor:', vu.name);
}

const products = [
  { v:0, title:'TWS Earbuds Pro X5 – Bluetooth 5.3',         cat:'cat-electronics', retail:1799, drop:950,  whole:1299, stock:150, img:'https://images.unsplash.com/photo-1606220945770-b5b6c2c55bf1?w=600', desc:'30hr battery, ANC, touch controls.' },
  { v:0, title:'Smart Watch Ultra S8 – Blood Oxygen Monitor', cat:'cat-electronics', retail:3499, drop:1800, whole:2499, stock:80,  img:'https://images.unsplash.com/photo-1546868871-7041f2a55e12?w=600', desc:'1.9" display, SpO2, heart rate, IP68 waterproof.' },
  { v:0, title:'Power Bank 20000mAh – 65W Super Fast Charge', cat:'cat-mobile',      retail:2599, drop:1400, whole:1899, stock:200, img:'https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?w=600', desc:'65W PD, LED display. Charges laptop + phone.' },
  { v:0, title:'Wireless Charging Pad 15W – Qi Universal',   cat:'cat-mobile',      retail:1199, drop:550,  whole:799,  stock:300, img:'https://images.unsplash.com/photo-1586953208448-b95a79798f07?w=600', desc:'Universal Qi charger. Fast 15W output.' },
  { v:1, title:'Women 3-Piece Lawn Suit – Summer 2025',       cat:'cat-fashion',     retail:1999, drop:1100, whole:1499, stock:500, img:'https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=600', desc:'Premium lawn, embroidered neckline. All sizes, 8 colors.' },
  { v:1, title:'Girls Fancy Frock – Party Wear Ages 2-12',    cat:'cat-fashion',     retail:1299, drop:650,  whole:899,  stock:300, img:'https://images.unsplash.com/photo-1518831959646-742c3a14ebf7?w=600', desc:'Soft fabric, lace detail. Perfect for Eid and parties.' },
  { v:1, title:'Women PU Leather Handbag – 5 Colors',         cat:'cat-fashion',     retail:1699, drop:850,  whole:1199, stock:200, img:'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=600', desc:'Multi-compartment, zipper, adjustable strap.' },
  { v:1, title:'Trendy Earrings Set – 12 Pairs Combo Box',    cat:'cat-jewelry',     retail:899,  drop:400,  whole:599,  stock:1000,img:'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=600', desc:'Hoops, studs and drops. Gift box included.' },
  { v:2, title:'12-in-1 Kitchen Vegetable Chopper Cutter',    cat:'cat-home',        retail:1599, drop:750,  whole:1099, stock:400, img:'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=600', desc:'Chop, slice, dice in seconds. BPA free.' },
  { v:2, title:'Stainless Steel Cookware 5-Piece Set',        cat:'cat-home',        retail:4999, drop:2600, whole:3499, stock:100, img:'https://images.unsplash.com/photo-1585515320310-259814833e62?w=600', desc:'Saucepan, frying pan, stockpot. Induction compatible.' },
  { v:2, title:'Insulated Steel Water Bottle 1L – BPA Free',  cat:'cat-home',        retail:999,  drop:480,  whole:699,  stock:600, img:'https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=600', desc:'Cold 24hr, hot 12hr. Leak proof, BPA free.' },
  { v:2, title:'Microfiber Bedsheet Set – King Size 6 Piece', cat:'cat-home',        retail:2499, drop:1300, whole:1799, stock:200, img:'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=600', desc:'Fitted + flat sheet + 4 pillowcases. 12 colors.' },
];

let added = 0;
for (const p of products) {
  const vid = vendorIds[p.v];
  if (!vid) continue;
  const pid  = id('prod');
  const slug = p.title.toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,55)+'-'+pid.slice(-4);
  db.run('INSERT INTO products (id,vendor_id,category_id,title,slug,description,retail_price,dropship_price,wholesale_price,stock_quantity,status,allow_dropshipping,is_featured) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
    [pid,vid,p.cat,p.title,slug,p.desc,p.retail,p.drop,p.whole,p.stock,'active',1,1]);
  db.run('INSERT INTO product_images (id,product_id,url,sort_order) VALUES (?,?,?,0)',[id('pimg'),pid,p.img]);
  added++;
  console.log(' 📦', p.title);
}
console.log('\nDone! Products:', added, '| Vendors:', db.get('SELECT COUNT(*) as c FROM vendors').c);
console.log('Vendor logins — password: Vendor@1234');
vendorUsers.forEach(v => console.log(' ', v.email));
