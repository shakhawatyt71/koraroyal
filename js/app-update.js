/* ================================================================
   KORA ROYAL — App Update Checker v1.0
   শুধুমাত্র স্ট্যান্ডঅ্যালোন Android অ্যাপের ভেতরে চলে (KRApp ব্রিজ
   আছে কিনা দেখে নেয়)। সাধারণ ওয়েবসাইট-ভিজিটর কোনোদিন এই পপআপ
   দেখবে না — স্ক্রিপ্টটি প্রথম লাইনেই নীরবে বন্ধ হয়ে যায়।

   নিয়ম (অ্যাডমিনের সিদ্ধান্ত):
   - অ্যাপ খোলার সাথে সাথেই চেক করে; পুরনো ভার্সন থাকলে পপআপ দেখায়
   - প্রতিবার অ্যাপ খুললেই আবার দেখায় (লেটেস্টে আপডেট না করা পর্যন্ত)
   - ইউজার চাইলে X চেপে পুরনো ভার্সনেই থেকে যেতে পারে
   - অ্যাপ খোলা থাকলে প্রতি ৬ ঘণ্টায় + ফোরগ্রাউন্ডে ফিরলে আবার চেক
   ================================================================ */
'use strict';
(function () {
  if (!window.KRApp || typeof window.KRApp.appVersion !== 'function') return;

  var API = 'https://kora-api.shakhawatyt77.workers.dev';
  var CHECK_INTERVAL = 6 * 60 * 60 * 1000;  /* খোলা থাকলে ৬ ঘণ্টা পরপর */
  var RESUME_THROTTLE = 30 * 60 * 1000;     /* ফোরগ্রাউন্ডে ফিরলে (অন্তত ৩০ মিনিট ফাঁক) */
  var START_DELAY = 2500;                   /* পেজ স্বাভাবিকভাবে লোড হতে দিই */
  var lastCheck = 0;
  var popupOpen = false;

  /* "2.0.1" → 2001000 (worker-এর krVersionCodeOf-এর সাথে একই নিয়ম) */
  function myVersionCode() {
    var v = '';
    try { v = window.KRApp.appVersion() || ''; } catch (e) {}
    var parts = String(v).replace(/^v/i, '').split('.');
    var code = 0;
    for (var i = 0; i < 4; i++) code = code * 100 + (parseInt(parts[i], 10) || 0);
    return code;
  }

  function check() {
    lastCheck = Date.now();
    try {
      fetch(API + '/api/app/latest', { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) {
          try {
            if (!j || !j.ok || !j.latest) return;
            if (Number(j.latest.versionCode) > myVersionCode()) show(j.latest);
          } catch (e) {}
        })
        .catch(function () {});
    } catch (e) {}
  }

  function fmtSize(bytes) {
    var mb = Number(bytes) / (1024 * 1024);
    return mb >= 1 ? mb.toFixed(1) + ' MB' : Math.round(Number(bytes) / 1024) + ' KB';
  }

  function show(info) {
    if (popupOpen) return;
    popupOpen = true;
    try {
      var style = document.createElement('style');
      style.textContent =
        '.kr-upd-ov{position:fixed;inset:0;z-index:999999;display:flex;align-items:center;justify-content:center;background:rgba(10,10,14,.55);padding:20px;animation:krUpdIn .25s ease}' +
        '@keyframes krUpdIn{from{opacity:0}to{opacity:1}}' +
        '.kr-upd-card{width:100%;max-width:350px;background:#fff;color:#18181B;border-radius:20px;padding:22px 20px 18px;position:relative;box-shadow:0 24px 60px rgba(0,0,0,.3);animation:krUpdUp .3s cubic-bezier(.34,1.4,.64,1);text-align:center}' +
        '@keyframes krUpdUp{from{transform:translateY(18px) scale(.96);opacity:0}to{transform:none;opacity:1}}' +
        '@media (prefers-color-scheme:dark){.kr-upd-card{background:#1C1D22;color:#F4F4F5}}' +
        '.kr-upd-ico{width:52px;height:52px;margin:0 auto 10px;border-radius:16px;background:rgba(255,96,68,.12);display:flex;align-items:center;justify-content:center;color:#FF6044}' +
        '.kr-upd-title{font-family:Outfit,DM Sans,sans-serif;font-size:1.15rem;font-weight:800;margin:0 0 4px}' +
        '.kr-upd-ver{font-size:.85rem;opacity:.75;margin:0 0 10px}' +
        '.kr-upd-log{font-size:.85rem;line-height:1.55;text-align:left;background:rgba(127,127,127,.08);border-radius:12px;padding:10px 12px;margin:0 0 12px;white-space:pre-line;max-height:150px;overflow:auto}' +
        '.kr-upd-meta{font-size:.72rem;opacity:.6;margin:0 0 14px}' +
        '.kr-upd-btn{width:100%;border:none;border-radius:12px;padding:12px 16px;background:#FF6044;color:#fff;font-family:Outfit,sans-serif;font-weight:700;font-size:.95rem;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px}' +
        '.kr-upd-btn:active{transform:scale(.98)}' +
        '.kr-upd-later{border:none;background:none;color:inherit;opacity:.55;font-size:.82rem;margin-top:10px;cursor:pointer;padding:6px 10px}' +
        '.kr-upd-x{position:absolute;top:10px;right:10px;border:none;background:rgba(127,127,127,.1);color:inherit;width:30px;height:30px;border-radius:9px;cursor:pointer;display:flex;align-items:center;justify-content:center}';
      document.head.appendChild(style);

      var esc = function (t) {
        return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
          return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
      };

      var overlay = document.createElement('div');
      overlay.className = 'kr-upd-ov';
      overlay.innerHTML =
        '<div class="kr-upd-card" role="alertdialog" aria-label="App update available">' +
          '<button class="kr-upd-x" aria-label="Close">' +
            '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
          '</button>' +
          '<div class="kr-upd-ico">' +
            '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/><path d="M12 14V7"/><polyline points="9 10 12 7 15 10"/></svg>' +
          '</div>' +
          '<h3 class="kr-upd-title">নতুন ভার্সন এসেছে</h3>' +
          '<p class="kr-upd-ver">ভার্সন ' + esc(info.version) + ' — আপডেট করে নতুন ফিচারগুলো নিন</p>' +
          (info.changelog ? '<div class="kr-upd-log">' + esc(info.changelog) + '</div>' : '') +
          (info.size ? '<p class="kr-upd-meta">সাইজ: ' + fmtSize(info.size) + '</p>' : '') +
          '<button class="kr-upd-btn">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>' +
            'আপডেট করুন' +
          '</button>' +
          '<button class="kr-upd-later">পরে করবো (পুরনো ভার্সনেই থাকবো)</button>' +
        '</div>';

      var close = function () {
        try { overlay.remove(); } catch (e) {}
        popupOpen = false;
      };
      overlay.querySelector('.kr-upd-x').onclick = close;
      overlay.querySelector('.kr-upd-later').onclick = close;
      overlay.querySelector('.kr-upd-btn').onclick = function () {
        /* workers.dev ঠিকানা — অ্যাপের WebView নিজেই এটা ফোনের
           ব্রাউজারে পাঠিয়ে দেবে → সেখানেই ডাউনলোড শুরু হবে */
        try { window.location.href = info.downloadUrl; } catch (e) {}
        setTimeout(close, 1200);
      };
      document.body.appendChild(overlay);
    } catch (e) {
      popupOpen = false;
    }
  }

  /* ট্রিগার: খোলার সাথে + ৬ ঘণ্টা পরপর + ফোরগ্রাউন্ডে ফিরলে */
  var start = function () { setTimeout(check, START_DELAY); };
  if (document.readyState === 'complete' || document.readyState === 'interactive') start();
  else window.addEventListener('DOMContentLoaded', start);

  window.setInterval(check, CHECK_INTERVAL);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && Date.now() - lastCheck > RESUME_THROTTLE) check();
  });
})();
