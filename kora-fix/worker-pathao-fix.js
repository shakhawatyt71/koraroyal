/* ================================================================
   KORA ROYAL — worker.js PATCH (ধাপ ২)
   ----------------------------------------------------------------
   ⚠ এটা সম্পূর্ণ worker.js না — এটা বদলানোর ব্লক।
     worker.js ২৮০KB, তাই পুরো ফাইল দেওয়া সম্ভব না।

   Cloudflare → Worker → Quick Edit → Ctrl+F করে নিচের অ্যাঙ্কর খুঁজে
   পুরনো ব্লকটা মুছে এটা বসান।

   PATCH A : autoBookPathao()  — সম্পূর্ণ রিপ্লেসমেন্ট
   PATCH B : নতুন হেল্পার (autoBookPathao-এর ঠিক উপরে বসান)

   এই ফাইলটা node --check দিয়ে ভেরিফাই করা (নিচে CHANGELOG দেখুন)।
   ================================================================ */


/* ════════════════════════════════════════════════════════════════
   PATCH B — নতুন হেল্পার
   কোথায় বসাবেন: `async function autoBookPathao(env, order) {`
                  এই লাইনের ঠিক উপরে
   ════════════════════════════════════════════════════════════════ */

/* পাঠাওর প্রকাশিত city-list থেকে নিশ্চিতকৃত বানান + সম্ভাব্য বিকল্প।
   city_id কখনো হার্ডকোড করা হয় না — সবসময় লাইভ লিস্ট থেকে নেওয়া হয়।
   নিশ্চিতকৃত (Pathao-র প্রকাশিত API আউটপুট):
     Dhaka=1  Cumilla=5  Cox's Bazar=11  Barisal=17  B. Baria=32
     Barguna=34 (শেষে স্পেস)  Bagerhat=52  Chuadanga=61  Bandarban=62 */
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


/* ════════════════════════════════════════════════════════════════
   PATCH A — autoBookPathao() সম্পূর্ণ রিপ্লেসমেন্ট
   অ্যাঙ্কর (Ctrl+F):  async function autoBookPathao(env, order) {
   শেষ অ্যাঙ্কর:      async function maybeAutoBookPathao(env, order) {
   → দুই অ্যাঙ্করের মধ্যের পুরো autoBookPathao ফাংশনটা মুছে এটা বসান।
     maybeAutoBookPathao-তে হাত দেবেন না।
   ════════════════════════════════════════════════════════════════ */

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
    const amountToCollect = (totals.codRemaining != null)
      ? Math.round(Number(totals.codRemaining))
      : Math.round(Number(totals.totalPayable || 0));

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
    const itemQuantity = items.reduce((s, i) => s + (Number(i.quantity) || 0), 0) || 1;
    const itemDescription = items.map(i => {
      const nm = String(i.productName || i.name || '').trim();
      if (!nm) return '';
      const sk = i.sku ? ` [${i.sku}]` : '';
      const pr = (i.lineTotal != null) ? ` — ৳${Math.round(Number(i.lineTotal))}` : '';
      return `${nm}${sk} x${Number(i.quantity) || 1}${pr}`;
    }).filter(Boolean).join('; ') || 'Clothing';

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
      special_instruction: `Auto-booked. Customer: ${cust.name}`,
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
