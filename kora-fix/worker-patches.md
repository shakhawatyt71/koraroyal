# worker.js — বাকি Patch-সমূহ

`worker-pathao-fix.js`-এ PATCH A ও B আছে (সেগুলো টেস্ট করা, কপি-পেস্ট করার মতো)।
এই ফাইলে বাকি patch-গুলো — এগুলো **খুঁজে বসানোর** নির্দেশ, কারণ worker.txt-এর
সেই অংশগুলো আমি পড়তে পারিনি (কোন চাঙ্কে আছে বের করতে পারিনি)।

প্রতিটা patch-এ **"Ctrl+F অ্যাঙ্কর"** দেওয়া আছে — Cloudflare → Worker → Quick Edit →
Ctrl+F করে খুঁজে নিন।

---

## PATCH C — Webhook: HTTP 202 + Integration Secret header

### সমস্যা (পাঠাওর নিজের এরর মেসেজ)
```
Your URL should return status code 202 for this specific event.          ❌
Your URL should return a response with header
  X-Pathao-Merchant-Webhook-Integration-Secret                          ❌
The header value should be exactly f3992ecc-59da-4cbe-a049-a13da2018d51  ❌
To integrate webhook, you will received the following body:
  { event: "webhook_integration" }
```

### ধাপ ১ — Cloudflare secret
Cloudflare → Worker → **Settings → Variables and Secrets** → Add:

| Name | Value | Type |
|---|---|---|
| `PATHAO_WEBHOOK_INTEGRATION_SECRET` | পাঠাওর প্যানেল থেকে কপি করা UUID | Secret |

🔒 উপরের UUID এই চ্যাটে পাবলিক হয়ে গেছে। পাঠাও পোর্টালে webhook মুছে **নতুন**
বানালে নতুন UUID পাবেন — সেটাই ব্যবহার করা নিরাপদ।

### ধাপ ২ — কোড
**Ctrl+F অ্যাঙ্কর:** `pathao/webhook`

ওই রুটের রেসপন্সগুলোতে এই দুটো জিনিস লাগবে:

```js
/* ১. প্রতিটা webhook রেসপন্সের headers-এ যোগ করুন */
'X-Pathao-Merchant-Webhook-Integration-Secret': env.PATHAO_WEBHOOK_INTEGRATION_SECRET || ''

/* ২. Pathao-র integration টেস্ট ইভেন্টে 202 রিটার্ন করুন */
if (body.event === 'webhook_integration') {
  return new Response(JSON.stringify({ ok: true }), {
    status: 202,                       /* ← 200 না, 202 */
    headers: {
      'Content-Type': 'application/json',
      'X-Pathao-Merchant-Webhook-Integration-Secret': env.PATHAO_WEBHOOK_INTEGRATION_SECRET || ''
    }
  });
}
```

⚠ **গুরুত্বপূর্ণ:** হেডারটা **শুধু test event-এ না, প্রতিটা রেসপন্সে** দিতে হবে —
পাঠাওর চেকলিস্ট আলাদা করে বলে না, কিন্তু নিরাপদ হলো সব রেসপন্সে দেওয়া।

### ধাপ ৩ — ২২টা ইভেন্ট → আপনার ৮টা স্ট্যাটাস
Pathao-র webhook এই ইভেন্টগুলো পাঠায়। ম্যাপিং:

| Pathao event | আপনার স্ট্যাটাস |
|---|---|
| `order.created` | অপরিবর্তিত (draft) |
| `order.pickup-requested` | অপরিবর্তিত (courier_shipments.status = `pickup_requested`) |
| `order.picked` / `order.picked-up` | `shipped` |
| `order.in-transit` / `order.out-for-delivery` | `shipped` |
| `order.delivered` | `delivered` |
| `order.returned-to-merchant` | `cancelled_by_seller` (বা নতুন `returned`) |
| `order.cancelled` | `cancelled_by_seller` |
| `order.failed-to-deliver` / `order.attempted-delivery-failed` | অপরিবর্তিত + নোট |

⚠ **unverified:** ইভেন্টের হুবহু স্ট্রিং আমি পাঠাওর অফিসিয়াল ডক থেকে যাচাই
করেছি, কিন্তু আপনার worker কোনগুলো হ্যান্ডেল করে সেটা দেখিনি। patch করার আগে
worker-এর webhook ফাংশনটা দেখে নিন।

---

## PATCH D — operations-settings: নতুন Courier কী

**Ctrl+F অ্যাঙ্কর:** `operations-settings`

আমার বানানো Courier পেজ এখন **worker-backed কী** ব্যবহার করে যেগুলো আগেই আছে:
`pathao_enabled`, `pathao_auto_book`, `pathao_mode`, `pathao_sender_name`,
`pathao_sender_phone`, `pathao_default_weight`, `pathao_default_item_type`,
`pathao_default_delivery_type`, `pathao_store_id`, `pathao_webhook_secret`

বাকি কন্ট্রোলগুলো (quantity, item description টগল, instruction টেমপ্লেট,
auto-detect টগল, CSV অপশন) এখন **ব্রাউজারের localStorage**-এ থাকে — মানে
ম্যানুয়াল বুকিং আর CSV-তে কাজ করে, কিন্তু **auto-booking-এ নয়**।

auto-booking-এও লাগাতে চাইলে worker-এ এই কীগুলো যোগ করতে হবে
(`/api/admin/operations-settings` POST হ্যান্ডলারের হোয়াইটলিস্টে):

```
pathao_default_quantity        (সংখ্যা)
pathao_item_desc_sku           ('1'/'0')
pathao_item_desc_price         ('1'/'0')
pathao_item_desc_qty           ('1'/'0')
pathao_item_desc_fallback      (টেক্সট)
pathao_instruction_template    (টেক্সট)
pathao_auto_detect_city        ('1'/'0')
pathao_auto_detect_zone        ('1'/'0')
pathao_auto_detect_area        ('1'/'0')
pathao_amount_source           ('cod_remaining'/'total_payable')
```

তারপর `autoBookPathao`-তে `await get('pathao_instruction_template')` ইত্যাদি
পড়ে ব্যবহার করতে হবে।

---

## PATCH E — Manual order: `local` চ্যানেল

**Ctrl+F অ্যাঙ্কর:** `placeAdminOrder`

আমি যা পড়েছি (worker.txt চাঙ্ক ৭):
```js
const rawChannel = cleanToken(orderData.channel || 'whatsapp', 30);
/* DB only allows 'website' or 'whatsapp'. Map admin channels safely. */
const channel = (rawChannel === 'whatsapp' || rawChannel === 'website') ? rawChannel : 'whatsapp';
```

**সমস্যা:** আপনার চাওয়া `call` / `online` / `local` চ্যানেলগুলো সব `whatsapp`
হয়ে যাচ্ছে। মানে কোন অর্ডার কোন সূত্র থেকে এসেছে সেটা হারিয়ে যাচ্ছে।

**ফিক্স:**
1. D1-এ `commerce_orders.channel` কলামের CHECK কনস্ট্রেইন্ট আপডেট করতে হবে
   (নতুন migration statement):
   ```sql
   -- SQLite-এ CHECK বদলাতে টেবিল রিবিল্ড করতে হয়
   ```
2. তারপর:
   ```js
   const ALLOWED = ['website','whatsapp','call','online','local'];
   const channel = ALLOWED.includes(rawChannel) ? rawChannel : 'whatsapp';
   ```
3. **`local` হলে পাঠাওর সাথে কোনো সম্পর্ক থাকবে না** —
   `maybeAutoBookPathao`-এর শুরুতে যোগ করুন:
   ```js
   if (order.channel === 'local') return { skipped: 'local_order' };
   ```

⚠ এই patch-এর জন্য DB schema দেখা দরকার — আমি `commerce_orders` টেবিলের
CHECK কনস্ট্রেইন্ট পড়িনি। তাই এটা এখনো **করিিনি**।

---

## PATCH F — Legacy হার্ডকোড কুপন সরানো

**Ctrl+F অ্যাঙ্কর:** `KR_SERVER_COUPONS`

```js
const KR_SERVER_COUPONS={KORA10:10,APNALOK20:20};
```

কুপন ইঞ্জিন এখন সম্পূর্ণ D1-backed (আমি schema আর `/api/coupons/validate`
রুট পড়েছি — `resolveCoupon()` ব্যবহার করে)। কিন্তু এই হার্ডকোড ম্যাপটা
এখনো কোডে আছে।

**করনীয়:** Ctrl+F করে `KR_SERVER_COUPONS` খুঁজে দেখুন কোথায় কোথায় ব্যবহার
হচ্ছে। যদি `resolveCoupon`-এ ফলব্যাক হিসেবে থাকে, তাহলে `coupons` টেবিলে
`KORA10` আর `APNALOK20` আগেই migrate হয়েছে (আমি migration statement পড়েছি),
তাই ফলব্যাকটা সরিয়ে দেওয়া নিরাপদ।

⚠ ব্যবহারের জায়গা না দেখে সরালে কুপন ভাঙতে পারে — তাই **এখন সরাইনি**।

---

## PATCH G — নতুন স্ট্যাটাস: `picked` / `manual`

**Ctrl+F অ্যাঙ্কর:** `commerce_order_history` বা `status IN (`

আপনি দুটো নতুন স্ট্যাটাসের কথা বলেছিলেন (`picked`, `manual`)। এগুলো যোগ করতে:
1. DB CHECK কনস্ট্রেইন্ট আপডেট (migration)
2. worker-এর status transition whitelist-এ যোগ
3. `admin/admin-core.js`-এর `STATUS_META` ও `STATUS_OPTIONS`-এ যোগ
4. `admin/orders.html`-এর ফিল্টার ট্যাবে যোগ

⚠ DB CHECK কনস্ট্রেইন্ট না দেখে এটা করিনি — ভুল migration ডেটা নষ্ট করতে পারে।

---

## 📋 কোনটা কোন অবস্থায়

| Patch | অবস্থা | কেন |
|---|---|---|
| **A** autoBookPathao রিপ্লেসমেন্ট | ✅ **কopi-পেস্ট রেডি, টেস্ট করা** | আসল কোড আমার হাতে ছিল |
| **B** নতুন হেল্পার | ✅ **কপি-পেস্ট রেডি, টেস্ট করা** | নতুন কোড |
| C Webhook | ⚠ নির্দেশ দেওয়া, কোড দেওয়া যায়নি | হ্যান্ডলার পড়িনি |
| D operations-settings কী | ⚠ কী-লিস্ট দেওয়া | হোয়াইটলিস্ট পড়িনি |
| E local চ্যানেল | ⚠ নির্দেশ দেওয়া | DB CHECK পড়িনি |
| F KR_SERVER_COUPONS | ⚠ নির্দেশ দেওয়া | ব্যবহারের জায়গা পড়িনি |
| G নতুন স্ট্যাটাস | ⚠ নির্দেশ দেওয়া | DB CHECK পড়িনি |

**⚠⚠⚠ PATCH A লাগানোর আগে Auto Pathao Booking অফ রাখুন।**
