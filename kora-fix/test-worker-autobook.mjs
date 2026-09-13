import { readFileSync } from 'node:fs';

const src = readFileSync('/home/user/koraroyal/kora-fix/worker.js', 'utf8');
const a = src.indexOf('const KR_DEFAULT_INSTRUCTION');
const b = src.indexOf('/* Auto-booking switchboard');
if (a < 0 || b < 0) { console.error('এঙ্কর নেই: a=' + a + ' b=' + b); process.exit(1); }
const region = src.slice(a, b);          // KR_DEFAULT_INSTRUCTION … autoBookPathao

/* ── পাঠাওর আসল city/zone ডেটা (প্রকাশিত API আউটপুট) ── */
const CITIES = [
  {city_id:1,city_name:'Dhaka'},{city_id:2,city_name:'Chittagong'},{city_id:5,city_name:'Cumilla'},
  {city_id:6,city_name:'Rajshahi'},{city_id:9,city_name:'Gazipur'},{city_id:10,city_name:'Narayanganj'},
  {city_id:11,city_name:"Cox's Bazar"},{city_id:17,city_name:'Barisal'},{city_id:32,city_name:'B. Baria'},
  {city_id:34,city_name:'Barguna'},{city_id:50,city_name:'Noakhali'},{city_id:51,city_name:'Feni'},
  {city_id:62,city_name:'Bandarban'}
];
const ZONES_DHAKA = [{zone_id:1016,zone_name:' Dhamrai , Savar'},{zone_id:940,zone_name:'Uttara Sector 9'},
                     {zone_id:352,zone_name:'kafrul'},{zone_id:77,zone_name:'Gulshan'}];

/* ── স্টাব ── */
function makeEnv(settings) {
  const rows = [];
  const stmt = (sql, v = []) => {
    const self = {
      bind(...nv){ return stmt(sql, v.concat(nv)); },          // চেইন করা যায়
      async first(){
        const m = sql.match(/setting_key='([^']+)'/);          // ইনলাইন কী
        const key = m ? m[1] : v[0];                            // নাকি bind() করা কী
        return (key != null && key in settings) ? { setting_value: String(settings[key]) } : undefined;
      },
      async run(){ rows.push({ sql, v }); return { success: true }; },
      async all(){ return []; }
    };
    return self;
  };
  return { DB:{ prepare: (sql) => stmt(sql, []) }, _rows: rows };
}
const calls = { pathao: [], orders: null };
const stubs = `
async function pathaoCachedList(env, key, path){
  if(path.endsWith('/city-list')) return { items: CITIES };
  if(path.includes('/zone-list')) return { items: ZONES_DHAKA };
  if(path.includes('/area-list')) return { items: [] };
  return { items: [] };
}
async function pathaoRequest(path, method, payload, env){
  calls.pathao.push({path, payload});
  return { data: { consignment_id: 'KR-TEST-001', delivery_fee: 60, amount_to_collect: payload.amount_to_collect } };
}
async function getCommerceOrder(env, id){ return { id, status:'confirmed' }; }
async function mirrorCommerceOrderToKV(env, o){ return true; }
`;
const fn = new Function('CITIES','ZONES_DHAKA','calls','getCommerceOrder','mirrorCommerceOrderToKV',
  stubs + region + '\nreturn { autoBookPathao, KR_DEFAULT_INSTRUCTION };');
const api = fn(CITIES, ZONES_DHAKA, calls, async()=>({status:'confirmed'}), async()=>true);

const BASE = { pathao_enabled:'1', pathao_store_id:'55876', pathao_sender_name:'Kora Royal',
               pathao_sender_phone:'01935158745', pathao_default_weight:'0.5',
               pathao_default_item_type:'2', pathao_default_delivery_type:'48' };
const order = (o={}) => ({ orderId:'KR-1042', status:'confirmed',
  customer:{ name:'রফিকুল ইসলাম', phone:'01712345678', address:o.address ?? 'H-12, R-5, Uttara Sector 9, Dhaka',
             district:o.district ?? 'Dhaka', thana:o.thana ?? 'Uttara' },
  items:[{productName:'Kora Polo', sku:'KR-02-L-OLIVE', quantity:2, lineTotal:1378}],
  totals:{ totalPayable:1200, codRemaining:o.cod ?? 1200, delivery:o.delivery ?? 60 } });

let pass=0, fail=0;
const T = (name, got, want) => {
  const ok = JSON.stringify(got)===JSON.stringify(want);
  console.log((ok?'  ✅ ':'  ❌ ')+name+'  →  '+JSON.stringify(got)+(ok?'':'   (চাই: '+JSON.stringify(want)+')'));
  ok?pass++:fail++;
};

console.log('\n\x1b[1mautoBookPathao — আসল কোড চালিয়ে টেস্ট\x1b[0m');
console.log('\n[১] amount_to_collect');
calls.pathao.length=0;
T('সম্পূর্ণ প্রি-পেইড (cod=0)', (await api.autoBookPathao(makeEnv(BASE), order({cod:0}))).amount_to_collect, 0);
T('COD ১২০০',                    (await api.autoBookPathao(makeEnv(BASE), order({cod:1200}))).amount_to_collect, 1200);
T('৳৫০০ অ্যাডভান্স → বকেয়া ৭০০',  (await api.autoBookPathao(makeEnv(BASE), order({cod:700}))).amount_to_collect, 700);
T('দশমিক 689.1 → 689',           (await api.autoBookPathao(makeEnv(BASE), order({cod:689.1}))).amount_to_collect, 689);
T('amountSource=total_payable',  (await api.autoBookPathao(makeEnv({...BASE, pathao_amount_source:'total_payable'}), order({cod:0}))).amount_to_collect, 1200);

console.log('\n[২] city (হার্ডকোড ম্যাপ নেই)');
calls.pathao.length=0;
for (const [d,want] of [['Dhaka',1],['Rajshahi',6],['Barisal',17],['Feni',51],['Comilla',5],["Cox's Bazar",11],['Brahmanbaria',32]]) {
  const r = await api.autoBookPathao(makeEnv(BASE), order({district:d}));
  T(d, calls.pathao.at(-1)?.payload.recipient_city ?? r.reason, want);
}
const nBefore = calls.pathao.length;
const unknown = await api.autoBookPathao(makeEnv(BASE), order({district:'Bhola'}));
T('অজানা জেলা → বুকিং বন্ধ, API কল হয়নি', [unknown.ok, unknown.reason, calls.pathao.length-nBefore], [false,'city_not_matched',0]);

console.log('\n[৩] zone — থানা থেকে ম্যাচ');
calls.pathao.length=0;
await api.autoBookPathao(makeEnv(BASE), order({thana:'Gulshan', address:'Road 27, Gulshan, Dhaka'}));
T('Gulshan', calls.pathao.at(-1).payload.recipient_zone, 77);
calls.pathao.length=0;
await api.autoBookPathao(makeEnv(BASE), order({thana:'Mirpur', address:'Shewrapara, Mirpur, Dhaka'}));
T('থানা+ঠিকানা কোনোটাই না মিললে → zone বাদ', 'recipient_zone' in calls.pathao.at(-1).payload, false);
calls.pathao.length=0;
await api.autoBookPathao(makeEnv(BASE), order({thana:'Mirpur', address:'H-12, Uttara Sector 9, Dhaka'}));
T('থানা না মিললেও ঠিকানা থেকে মেলে', calls.pathao.at(-1).payload.recipient_zone, 940);

console.log('\n[৪] Special Instruction');
calls.pathao.length=0;
await api.autoBookPathao(makeEnv(BASE), order());
const si = calls.pathao.at(-1).payload.special_instruction;
T('{NAME} বসেছে', si.includes('রফিকুল'), true);
T('{RETURN_CHARGE} → আসল ৬০', si.includes('৬০ টাকা')||si.includes('60 টাকা'), true);
T('শেষে 𖹭', [...si].at(-1), '\u{16E6D}');
T('হুবহু ডিফল্ট টেমপ্লেট', si.startsWith('আমাদের সম্মানিত গ্রাহক'), true);
calls.pathao.length=0;
await api.autoBookPathao(makeEnv({...BASE, pathao_instruction_template:'টেস্ট {NAME} / {ORDER_ID} / {RETURN_CHARGE}'}), order());
T('কাস্টম টেমপ্লেট + ORDER_ID', calls.pathao.at(-1).payload.special_instruction, 'টেস্ট রফিকুল / KR-1042 / 60');

console.log('\n[৫] item description — প্যানেলের টগল');
calls.pathao.length=0;
await api.autoBookPathao(makeEnv(BASE), order());
T('ডিফল্ট (SKU+qty+দাম)', calls.pathao.at(-1).payload.item_description, 'Kora Polo [KR-02-L-OLIVE] x2 — ৳1378');
calls.pathao.length=0;
await api.autoBookPathao(makeEnv({...BASE, pathao_item_desc_sku:'0', pathao_item_desc_price:'0'}), order());
T('SKU+দাম বন্ধ', calls.pathao.at(-1).payload.item_description, 'Kora Polo x2');
calls.pathao.length=0;
await api.autoBookPathao(makeEnv({...BASE, pathao_item_desc_qty:'0'}), order());
T('qty বন্ধ', calls.pathao.at(-1).payload.item_description, 'Kora Polo [KR-02-L-OLIVE] — ৳1378');
calls.pathao.length=0;
await api.autoBookPathao(makeEnv({...BASE, pathao_item_desc_fallback:'পোশাক'}), {orderId:'X',status:'confirmed',customer:{name:'ক',phone:'01712345678',address:'Uttara, Dhaka',district:'Dhaka'},items:[],totals:{totalPayable:100,codRemaining:100}});
T('খালি items → fallback', calls.pathao.at(-1).payload.item_description, 'পোশাক');

console.log('\n[৬] গেট ও ডেটাবেস');
calls.pathao.length=0;
const off = await api.autoBookPathao(makeEnv({...BASE, pathao_enabled:'0'}), order());
T('pathao_enabled=0 → skip', [off.skipped, calls.pathao.length], ['pathao_disabled', 0]);
calls.pathao.length=0;
const nostore = await api.autoBookPathao(makeEnv({...BASE, pathao_store_id:''}), order());
T('store_id নেই → skip', [nostore.skipped, calls.pathao.length], ['no_store_id', 0]);
const env2 = makeEnv(BASE);
await api.autoBookPathao(env2, order());
const ins = env2._rows.find(r=>/INSERT INTO courier_shipments/.test(r.sql));
T('courier_shipments-এ draft লেখা হয়েছে', !!ins && /'draft'/.test(ins.sql) && ins.v[0]==='KR-1042' && ins.v[1]==='KR-TEST-001', true);
T('order history-তে নোট লেখা হয়েছে', env2._rows.some(r=>/INSERT INTO commerce_order_history/.test(r.sql) && /Consignment ID: KR-TEST-001/.test(r.v[2]||'')), true);
T('পিকআপ রিকোয়েস্ট কল হয়নি', calls.pathao.some(c=>/pickup/i.test(c.path)), false);
T('orders POST ঠিক এন্ডপয়েন্টে', calls.pathao.at(-1).path, '/aladdin/api/v1/orders');
const p = calls.pathao.at(-1).payload;
T('secondary phone পাঠানো হয়নি', 'recipient_secondary_phone' in p, false);
T('recipient_city null নয়', p.recipient_city != null, true);

console.log('\n' + (fail? '\x1b[31m❌ '+fail+'টা ফেল\x1b[0m' : '\x1b[32m✅ সব '+pass+'টা টেস্ট পাস\x1b[0m'));
process.exit(fail?1:0);
