/**
 * KORA ROYAL — integrations.js
 * Loads BEFORE main.js
 * Contains: KR config, credentials, krPush, sendToSheets, sendToTelegram,
 *           buildOrderMessage, updateWALink
 *
 * WARNING: Credentials are exposed in frontend — known limitation (static site).
 */

'use strict';

/* ============================================================
   KR CONFIG — Single Source of Truth
   ============================================================ */
const KR = {

  /* ---- GTM / GA4 / Meta (Tab 1 Confirmed) ---- */
  GTM_WEB:    'GTM-MMBJVW59',
  GTM_SERVER: 'GTM-T6DCM6LC',
  GA4_ID:     'G-6P8GTD9T7K',
  GA4_STREAM: '14337807051',
  META_PIXEL: '1635272555265005',
  STAPE_URL:  'https://xqwfxhjh.in.stape.io',

  /* ---- Telegram ---- */
  TELEGRAM_TOKEN: '8413635091:AAGhxTUF1Zr_Tp8NcwxfJL6f62VfsD2ygUY',
  TELEGRAM_CHAT:  '6372405191',

  /* ---- Google Sheets ---- */
  SHEETS_URL: 'https://script.google.com/macros/s/AKfycbwhBVcDKXWepE-3GqPI1CjmeeejHtZNq7fnNsWXfdRLZJKtes0NbRgQKlMjz0tnS6k_/exec',

  /* ---- WhatsApp ---- */
  WHATSAPP: '+8801935158745',

  /* ---- Delivery ---- */
  DELIVERY: {
    DHAKA:    60,
    OUTSIDE:  130,
    FREE_AT:  2999
  },

  /* ---- Coupons (percentage discount) ---- */
  COUPONS: {
    'KORA10':    10,
    'APNALOK20': 20
  },

  /* ---- Products ---- */
  PRODUCTS: {
    1: {
      id:       1,
      name_en:  'Kora Signature',
      name_bn:  'করা সিগনেচার',
      sub_en:   'Premium Shirt',
      sub_bn:   'প্রিমিয়াম শার্ট',
      collection_en: 'Our Exclusive Collection',
      collection_bn: 'আমাদের এক্সক্লুসিভ কালেকশন',
      price:    999,
      sizes:    ['M', 'L', 'XL'],
      colors:   [
        { id: 'black',    name_en: 'Black',           name_bn: 'কালো' },
        { id: 'white',    name_en: 'White',           name_bn: 'সাদা' },
        { id: 'gray',     name_en: 'Gray',            name_bn: 'ধূসর' },
        { id: 'brown',    name_en: 'Brown',           name_bn: 'বাদামি' },
        { id: 'olive',    name_en: 'Olive',           name_bn: 'অলিভ' },
        { id: 'pink',     name_en: 'Light Pink',      name_bn: 'হালকা গোলাপি' },
        { id: 'offwhite', name_en: 'Off White',       name_bn: 'অফ হোয়াইট' },
        { id: 'magenta',  name_en: 'Light Dark Magenta', name_bn: 'ম্যাজেন্টা' }
      ],
      category:  'Exclusive',
      rating:    4.9,
      soldCount: 69,
      imageUrl:  'https://res.cloudinary.com/dvvgofrhs/image/upload/v1775923472/gemini-3-pro-image-preview_nano-banana-pro__a_____SUPER_COMBINED_M_1_jfdfo0.png',
      sizeChart: {
        headers: ['Size', 'Chest (inch)', 'Length (inch)', 'Shoulder (inch)'],
        rows: [
          ['M',  '40', '28', '17'],
          ['L',  '42', '29', '18'],
          ['XL', '44', '30', '19']
        ]
      }
    },
    2: {
      id:       2,
      name_en:  'Kora Polo',
      name_bn:  'করা পোলো',
      sub_en:   'Premium T-Shirt',
      sub_bn:   'প্রিমিয়াম টিশার্ট',
      collection_en: 'Our Exclusive Collection',
      collection_bn: 'আমাদের এক্সক্লুসিভ কালেকশন',
      price:    699,
      sizes:    ['M', 'L', 'XL'],
      colors:   [
        { id: 'black',   name_en: 'Black',            name_bn: 'কালো' },
        { id: 'cream',   name_en: 'Cream',            name_bn: 'ক্রিম' },
        { id: 'gray',    name_en: 'Gray',             name_bn: 'ধূসর' },
        { id: 'brown',   name_en: 'Brown',            name_bn: 'বাদামি' },
        { id: 'olive',   name_en: 'Olive',            name_bn: 'অলিভ' },
        { id: 'magenta', name_en: 'Light Dark Magenta', name_bn: 'ম্যাজেন্টা' }
      ],
      category:  'Exclusive',
      rating:    4.8,
      soldCount: 324,
      imageUrl:  'https://res.cloudinary.com/dvvgofrhs/image/upload/v1775923424/Compare_Image_Generation_AI_Models_Side_by_Side_8_qx8wmj.png',
      sizeChart: {
        headers: ['Size', 'Chest (inch)', 'Length (inch)', 'Shoulder (inch)'],
        rows: [
          ['M',  '38', '26', '16'],
          ['L',  '40', '27', '17'],
          ['XL', '42', '28', '18']
        ]
      }
    },
    3: {
      id:       3,
      name_en:  'Kora Pants',
      name_bn:  'করা পেন্ট',
      sub_en:   'Premium Export Quality Pant',
      sub_bn:   'প্রিমিয়াম এক্সপোর্ট কোয়ালিটি পেন্ট',
      collection_en: 'Our Exclusive Collection',
      collection_bn: 'আমাদের এক্সক্লুসিভ কালেকশন',
      price:    1499,
      sizes:    ['28', '30', '32', '34', '36', '38', '40', '42'],
      colors:   [
        { id: 'black',    name_en: 'Black',       name_bn: 'কালো' },
        { id: 'white',    name_en: 'White',       name_bn: 'সাদা' },
        { id: 'gray',     name_en: 'Gray',        name_bn: 'ধূসর' },
        { id: 'brown',    name_en: 'Brown',       name_bn: 'বাদামি' },
        { id: 'offwhite', name_en: 'Off White',   name_bn: 'অফ হোয়াইট' },
        { id: 'mixed',    name_en: 'Light Dark Mixed', name_bn: 'মিক্সড' }
      ],
      category:  'Exclusive',
      rating:    4.9,
      soldCount: 98,
      imageUrl:  'https://res.cloudinary.com/dvvgofrhs/image/upload/v1775924442/1775452294521-019d6133-36e9-70d9-a210-c24464331f07_pfvsjy.png',
      sizeChart: {
        headers: ['Size (waist)', 'Waist (inch)', 'Hip (inch)', 'Length (inch)'],
        rows: [
          ['28', '28', '36', '40'],
          ['30', '30', '38', '40'],
          ['32', '32', '40', '41'],
          ['34', '34', '42', '41'],
          ['36', '36', '44', '42'],
          ['38', '38', '46', '42'],
          ['40', '40', '48', '43'],
          ['42', '42', '50', '43']
        ]
      }
    }
  },

  /* ---- Cloudinary ---- */
  CLOUDINARY_CLOUD: 'dvvgofrhs',
  CLOUDINARY_API_KEY: '765352335481485',
  CLOUDINARY_BASE: 'https://res.cloudinary.com/dvvgofrhs/image/upload/',

  /* ---- Gallery Images (15 extra for infinite carousel) ---- */
  GALLERY_IMAGES: [
    'https://res.cloudinary.com/dvvgofrhs/image/upload/v1775923474/gemini-3-pro-image-preview_nano-banana-pro__a_____SUPER_COMBINED_M_2_fxj6fa.png',
    'https://res.cloudinary.com/dvvgofrhs/image/upload/v1775923430/8992cf65-b8d2-4c24-a1c3-e9c15d3934f0_1771210054220-019c6454-1dff-7401-beb1-96b7bcdef78f_yq58iv.png',
    'https://res.cloudinary.com/dvvgofrhs/image/upload/v1775923408/AI_Chat_Arena_-_Compare_AI_Models_Side_by_Side_1771088716896_sxubp4.png',
    'https://res.cloudinary.com/dvvgofrhs/image/upload/v1775923379/1775483438867-019d6308-9ebf-79a0-8306-604711cda589_dczlma.png',
    'https://res.cloudinary.com/dvvgofrhs/image/upload/v1775923404/1775452800704-019d613a-f841-7759-9b6d-167f99c8f192_udkeoc.png',
    'https://res.cloudinary.com/dvvgofrhs/image/upload/v1775923413/1774016733838-019d0aa2-f556-740d-b1aa-94456bc6c1d6_k3xqjb.png',
    'https://res.cloudinary.com/dvvgofrhs/image/upload/v1775923437/Arena___Benchmark_Compare_the_Best_AI_Models_6_icukpz.png',
    'https://res.cloudinary.com/dvvgofrhs/image/upload/v1775923450/AI_Chat_Arena_-_Compare_AI_Models_Side_by_Side_khehzo.png',
    'https://res.cloudinary.com/dvvgofrhs/image/upload/v1775923450/Arena___Benchmark_Compare_the_Best_AI_Models_9_y87hbv.png',
    'https://res.cloudinary.com/dvvgofrhs/image/upload/v1775923461/Image_Generation_Arena_-_Compare_AI_Image_Models_3_fsvrwu.png',
    'https://res.cloudinary.com/dvvgofrhs/image/upload/v1775923466/gemini-3-pro-image-preview_nano-banana-pro__a_MASTER_PROMPT_____emtaj2.png',
    'https://res.cloudinary.com/dvvgofrhs/image/upload/v1775923467/gemini-3-pro-image-preview-2k_b_SYSTEM___ROLE__You_a_hskkgb.png',
    'https://res.cloudinary.com/dvvgofrhs/image/upload/v1775923473/gemini-3-pro-image-preview_nano-banana-pro__a_____SUPER_COMBINED_M_aj3x5j.png',
    'https://res.cloudinary.com/dvvgofrhs/image/upload/v1775923458/Arena___Benchmark_Compare_the_Best_AI_Models_4_eeezgw.png',
    'https://res.cloudinary.com/dvvgofrhs/image/upload/v1775923417/AI_Chat_Arena_-_Compare_AI_Models_Side_by_Side_20_t6bd21.png'
  ],

  /* ---- Logos ---- */
  LOGOS: {
    light: 'https://res.cloudinary.com/dvvgofrhs/image/upload/v1776146557/Picsart_26-04-14_11-59-56-382_ueiofu.png',
    dark:  'https://res.cloudinary.com/dvvgofrhs/image/upload/v1776146561/Picsart_26-04-14_12-01-21-890_d8icez.png',
    footer:'https://res.cloudinary.com/dvvgofrhs/image/upload/v1775933197/New_Project_131_Copy_5BEB4D6_ywsvev.png'
  },

  /* ---- Districts — Dhaka detection ---- */
  DHAKA_DISTRICTS: ['Dhaka', 'Gazipur', 'Narayanganj', 'Manikganj', 'Munshiganj', 'Narsingdi'],

  /* ---- All BD Districts ---- */
  DISTRICTS: [
    'Bagerhat','Bandarban','Barguna','Barishal','Bhola','Bogura','Brahmanbaria',
    'Chandpur','Chapai Nawabganj','Chattogram','Chuadanga','Cox\'s Bazar',
    'Cumilla','Dhaka','Dinajpur','Faridpur','Feni','Gaibandha','Gazipur',
    'Gopalganj','Habiganj','Jamalpur','Jashore','Jhalokathi','Jhenaidah',
    'Joypurhat','Khagrachhari','Khulna','Kishoreganj','Kurigram','Kushtia',
    'Lakshmipur','Lalmonirhat','Madaripur','Magura','Manikganj','Meherpur',
    'Moulvibazar','Munshiganj','Mymensingh','Naogaon','Narail','Narayanganj',
    'Narsingdi','Natore','Netrokona','Nilphamari','Noakhali','Pabna',
    'Panchagarh','Patuakhali','Pirojpur','Rajbari','Rajshahi','Rangamati',
    'Rangpur','Satkhira','Shariatpur','Sherpur','Sirajganj','Sunamganj',
    'Sylhet','Tangail','Thakurgaon'
  ]
};

/* ============================================================
   UNIQUE EVENT ID GENERATOR
   ============================================================ */
function genEventId() {
  return `ev_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/* ============================================================
   ORDER ID GENERATOR (v6 Format)
   Format: KR-{ddmmyyyy}-{HHMMSSmmmuuu}
   ============================================================ */
function genOrderId() {
  const now = new Date();
  const d  = String(now.getDate()).padStart(2, '0');
  const mo = String(now.getMonth() + 1).padStart(2, '0');
  const y  = now.getFullYear();
  const h  = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');
  const s  = String(now.getSeconds()).padStart(2, '0');
  const ms = String(now.getMilliseconds()).padStart(3, '0');
  const perf = String(performance.now()).replace('.', '').slice(0, 9).padEnd(9, '0');
  return `KR-${d}${mo}${y}-${h}${mi}${s}${ms}${perf}`;
}

/* ============================================================
   PHONE NORMALIZATION & VALIDATION
   ============================================================ */
function normalizePhone(raw) {
  if (!raw) return '';
  let p = raw.trim().replace(/[\s\-()]/g, '');
  if (p.startsWith('0088')) p = p.slice(4);
  else if (p.startsWith('+880')) p = p.slice(4);
  else if (p.startsWith('880'))  p = p.slice(3);
  if (!p.startsWith('0')) p = '0' + p;
  return p;
}

function isValidBDPhone(raw) {
  const p = normalizePhone(raw);
  return /^01[3-9]\d{8}$/.test(p);
}

/* ============================================================
   DATAAYER PUSH (krPush)
   Always uses window.dataLayer; GTM reads from there.
   ============================================================ */
window.dataLayer = window.dataLayer || [];

function krPush(eventName, data) {
  const eventId = genEventId();
  const payload = {
    event:    eventName,
    event_id: eventId,
    ...data
  };
  window.dataLayer.push({ ecommerce: null }); // Clear previous ecommerce
  window.dataLayer.push(payload);
}

/* ---- Specific event helpers ---- */

function pushViewItem(product) {
  krPush('view_item', {
    ecommerce: {
      currency: 'BDT',
      value: product.price,
      items: [{
        item_id:       String(product.id),
        item_name:     product.name_en,
        category:      product.category,
        price:         product.price,
        quantity:      1
      }],
      detail: {
        products: [{
          id:       String(product.id),
          name:     product.name_en,
          category: product.category,
          price:    product.price
        }]
      }
    }
  });
}

function pushAddToCart(product, qty, size, color) {
  const value = product.price * qty;
  krPush('add_to_cart', {
    ecommerce: {
      currency: 'BDT',
      value:    value,
      items: [{
        item_id:   String(product.id),
        item_name: product.name_en,
        category:  product.category,
        price:     product.price,
        quantity:  qty,
        item_variant: `${size} / ${color}`
      }],
      detail: {
        products: [{
          id:       String(product.id),
          name:     product.name_en,
          category: product.category,
          price:    product.price
        }]
      }
    }
  });
}

function pushBeginCheckout(items, total) {
  krPush('begin_checkout', {
    ecommerce: {
      currency:     'BDT',
      currencyCode: 'BDT',
      value:        total,
      items:        items,
      detail: {
        products: items.map(i => ({
          id:       i.item_id,
          name:     i.item_name,
          category: i.category || 'Exclusive',
          price:    i.price
        }))
      }
    }
  });
}

function pushAddPaymentInfo(value, paymentMethod) {
  krPush('add_payment_info', {
    ecommerce: {
      currency:       'BDT',
      value:          value,
      payment_method: paymentMethod
    }
  });
}

function pushWhatsappOrder(value, numItems) {
  krPush('whatsapp_order', {
    ecommerce: {
      currency:  'BDT',
      value:     value,
      num_items: numItems
    }
  });
}

function pushPurchase(orderData) {
  // Only called from success.html
  const { orderId, totalPayable, deliveryCharge, items, customer, couponCode } = orderData;
  const nameParts = (customer.name || '').trim().split(' ');
  const firstName = nameParts[0] || '';
  const lastName  = nameParts.slice(1).join(' ') || '';
  krPush('purchase', {
    ecommerce: {
      transaction_id: orderId,
      value:          totalPayable,
      currency:       'BDT',
      shipping:       deliveryCharge,
      items:          items.map(i => ({
        item_id:    i.item_id,
        item_name:  i.item_name,
        category:   i.category || 'Exclusive',
        price:      i.price,
        quantity:   i.quantity,
        product_id: i.item_id
      }))
    },
    orderData: {
      customer: {
        billing: {
          email:       customer.email    || '',
          phone:       normalizePhone(customer.phone),
          first_name:  firstName,
          last_name:   lastName,
          country:     'BD',
          city:        customer.district || '',
          postal_code: '',
          coupon:      couponCode        || ''
        }
      }
    }
  });
}

/* ============================================================
   DELIVERY CHARGE CALCULATOR
   ============================================================ */
function calcDelivery(district, subtotal) {
  if (subtotal >= KR.DELIVERY.FREE_AT) return 0;
  const isDhaka = KR.DHAKA_DISTRICTS.some(d =>
    d.toLowerCase() === (district || '').toLowerCase()
  );
  return isDhaka ? KR.DELIVERY.DHAKA : KR.DELIVERY.OUTSIDE;
}

/* ============================================================
   TOTALS CALCULATOR
   ============================================================ */
function calcTotals(instances, district, couponCode, advancePaid) {
  let subtotal = 0;
  instances.forEach(inst => {
    if (inst.qty > 0) {
      const product = KR.PRODUCTS[inst.pid];
      subtotal += (product ? product.price : 0) * inst.qty;
    }
  });
  const discountPct = KR.COUPONS[couponCode && couponCode.toUpperCase()] || 0;
  const discountAmt = Math.round(subtotal * discountPct / 100);
  const subtotalAfterDiscount = subtotal - discountAmt;
  const delivery    = calcDelivery(district, subtotalAfterDiscount);
  const totalPayable = subtotalAfterDiscount + delivery;
  const codRemaining = Math.max(0, totalPayable - (advancePaid || 0));
  return { subtotal, discountPct, discountAmt, subtotalAfterDiscount, delivery, totalPayable, codRemaining };
}

/* ============================================================
   BUILD WHATSAPP ORDER MESSAGE
   ============================================================ */
function buildOrderMessage(orderId, instances, customer, payment, couponCode, totals) {
  const lang = document.documentElement.getAttribute('data-lang') || 'en';
  let msg = '';
  msg += `*KORA ROYAL - New Order*\n`;
  msg += `Order ID: ${orderId}\n`;
  msg += `Date: ${new Date().toLocaleString('en-BD')}\n\n`;

  msg += `*Products:*\n`;
  instances.forEach(inst => {
    if (inst.qty > 0) {
      const p = KR.PRODUCTS[inst.pid];
      if (!p) return;
      const name = lang === 'bn' ? p.name_bn : p.name_en;
      msg += `- ${name} | Size: ${inst.size} | Color: ${inst.color} | Qty: ${inst.qty} | ৳${p.price * inst.qty}\n`;
    }
  });

  msg += `\n*Customer Info:*\n`;
  msg += `Name: ${customer.name}\n`;
  msg += `Phone: ${normalizePhone(customer.phone)}\n`;
  if (customer.email) msg += `Email: ${customer.email}\n`;
  msg += `District: ${customer.district}\n`;
  msg += `Address: ${customer.address}\n`;
  if (customer.note) msg += `Note: ${customer.note}\n`;

  msg += `\n*Payment:*\n`;
  msg += `Method: ${payment.method}\n`;
  if (payment.method !== 'COD') {
    msg += `Advance Paid: ৳${payment.advance || 0}\n`;
    if (payment.trxId) msg += `Trx ID: ${payment.trxId}\n`;
  }

  msg += `\n*Summary:*\n`;
  msg += `Subtotal: ৳${totals.subtotal}\n`;
  if (totals.discountAmt > 0) msg += `Discount (${couponCode}): -৳${totals.discountAmt}\n`;
  msg += `Delivery: ৳${totals.delivery}\n`;
  msg += `*Total: ৳${totals.totalPayable}*\n`;
  if (payment.method !== 'COD') {
    msg += `Advance Paid: -৳${payment.advance || 0}\n`;
    msg += `COD Remaining: ৳${totals.codRemaining}\n`;
  }

  return msg;
}

/* ============================================================
   UPDATE WA ORDER LINK
   ============================================================ */
function updateWALink(orderId, instances, customer, payment, couponCode, totals) {
  const btn = document.getElementById('waOrderBtn');
  if (!btn) return;
  const msg = buildOrderMessage(orderId, instances, customer, payment, couponCode, totals);
  const num = KR.WHATSAPP.replace(/[^0-9]/g, '');
  btn.href = `https://wa.me/${num}?text=${encodeURIComponent(msg)}`;
}

/* ============================================================
   SEND TO GOOGLE SHEETS
   ============================================================ */
async function sendToSheets(orderData) {
  const { orderId, customer, payment, instances, totals, couponCode } = orderData;

  // Build products string
  const productsStr = instances
    .filter(i => i.qty > 0)
    .map(i => {
      const p = KR.PRODUCTS[i.pid];
      return `${p ? p.name_en : 'Unknown'} (Size:${i.size}, Color:${i.color}, Qty:${i.qty})`;
    }).join('; ');

  const totalQty = instances.reduce((s, i) => s + (i.qty || 0), 0);

  const payload = {
    orderId:       orderId,
    date:          new Date().toLocaleString('en-BD'),
    name:          customer.name,
    phone:         normalizePhone(customer.phone),
    email:         customer.email    || '',
    district:      customer.district || '',
    address:       customer.address  || '',
    products:      productsStr,
    qty:           totalQty,
    subtotal:      totals.subtotal,
    shipping:      totals.delivery,
    discount:      totals.discountAmt,
    coupon:        couponCode || '',
    total:         totals.totalPayable,
    payment:       payment.method,
    trxId:         payment.trxId    || '',
    advance:       payment.advance  || 0,
    status:        'Pending'
  };

  try {
    const res = await fetch(KR.SHEETS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' }, // CORS workaround
      body:    JSON.stringify(payload)
    });
    return res.ok;
  } catch (err) {
    console.error('[KR] Sheets error:', err);
    return false;
  }
}

/* ============================================================
   SEND TO TELEGRAM
   ============================================================ */
async function sendToTelegram(orderData) {
  const { orderId, customer, payment, instances, totals, couponCode } = orderData;

  const productsLines = instances
    .filter(i => i.qty > 0)
    .map(i => {
      const p = KR.PRODUCTS[i.pid];
      const name = p ? p.name_en : 'Unknown';
      return `  • <b>${name}</b> — Size: ${i.size}, Color: ${i.color}, Qty: ${i.qty}, ৳${(p ? p.price : 0) * i.qty}`;
    }).join('\n');

  let msg = `<b>NEW ORDER — KORA ROYAL</b>\n`;
  msg += `<b>Order ID:</b> <code>${orderId}</code>\n`;
  msg += `<b>Date:</b> ${new Date().toLocaleString('en-BD')}\n\n`;

  msg += `<b>Products:</b>\n${productsLines}\n\n`;

  msg += `<b>Customer:</b>\n`;
  msg += `Name: ${customer.name}\n`;
  msg += `Phone: ${normalizePhone(customer.phone)}\n`;
  if (customer.email) msg += `Email: ${customer.email}\n`;
  msg += `District: ${customer.district}\n`;
  msg += `Address: ${customer.address}\n`;
  if (customer.note) msg += `Note: ${customer.note}\n`;

  msg += `\n<b>Payment:</b> ${payment.method}\n`;
  if (payment.method !== 'COD') {
    msg += `Advance: ৳${payment.advance || 0}\n`;
    if (payment.trxId) msg += `Trx ID: ${payment.trxId}\n`;
  }

  msg += `\n<b>Summary:</b>\n`;
  msg += `Subtotal: ৳${totals.subtotal}\n`;
  if (totals.discountAmt > 0) msg += `Discount (${couponCode}): -৳${totals.discountAmt}\n`;
  msg += `Delivery: ৳${totals.delivery}\n`;
  msg += `<b>Total: ৳${totals.totalPayable}</b>\n`;
  if (payment.method !== 'COD') {
    msg += `COD Remaining: ৳${totals.codRemaining}\n`;
  }

  const url = `https://api.telegram.org/bot${KR.TELEGRAM_TOKEN}/sendMessage`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id:    KR.TELEGRAM_CHAT,
        text:       msg,
        parse_mode: 'HTML'
      })
    });
    return res.ok;
  } catch (err) {
    console.error('[KR] Telegram error:', err);
    return false;
  }
}
