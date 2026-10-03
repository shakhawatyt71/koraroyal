/* ================================================================
   KORA ROYAL — App Update + Announcement Popups v1.1
   শুধুমাত্র স্ট্যান্ডঅ্যালোন Android অ্যাপের ভেতরে চলে (KRApp ব্রিজ
   আছে কিনা দেখে নেয়)। সাধারণ ওয়েবসাইট-ভিজিটর কোনোদিন কোনো পপআপ
   দেখবে না — স্ক্রিপ্টটি প্রথম লাইনেই নীরবে বন্ধ হয়ে যায়।

   দুই ধরনের পপআপ:
   ১) আপডেট-পপআপ: এডমিন App Releases-এ নতুন ভার্সন দিলে (প্রাধান্য বেশি)
   ২) ঘোষণা-পপআপ: এডমিন App Popup থেকে যেকোনো কাস্টম বার্তা পাঠালে
      (চাইলে বাটন+লিংকসহ; এডমিন যখন চায় বন্ধ/ডিলিট করলেই থেমে যায়)

   নিয়ম: অ্যাপ খোলার সাথে সাথেই চেক; পুরনো ভার্সন/সচল ঘোষণা থাকলে
   পপআপ; প্রতিবার খুললেই আবার; ইউজার X চেপে বন্ধ করতে পারে।
   ================================================================ */
'use strict';
(function () {
  if (!window.KRApp || typeof window.KRApp.appVersion !== 'function') return;

  var API = 'https://kora-api.shakhawatyt77.workers.dev';
  var CHECK_INTERVAL = 6 * 60 * 60 * 1000;
  var RESUME_THROTTLE = 30 * 60 * 1000;
  var START_DELAY = 2500;
  var lastCheck = 0;
  var popupOpen = false;

  function myVersionCode() {
    var v = '';
    try { v = window.KRApp.appVersion() || ''; } catch (e) {}
    var parts = String(v).replace(/^v/i, '').split('.');
    var code = 0;
    for (var i = 0; i < 4; i++) code = code * 100 + (parseInt(parts[i], 10) || 0);
    return code;
  }

  /* ---------- সাধারণ পপআপ-বিল্ডার ---------- */
  function showPopup(cfg) {
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
        '<div class="kr-upd-card" role="alertdialog" aria-label="' + esc(cfg.title) + '">' +
          '<button class="kr-upd-x" aria-label="Close">' +
            '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
          '</button>' +
          '<div class="kr-upd-ico">' + (cfg.icon || '') + '</div>' +
          '<h3 class="kr-upd-title">' + esc(cfg.title) + '</h3>' +
          (cfg.sub ? '<p class="kr-upd-ver">' + esc(cfg.sub) + '</p>' : '') +
          (cfg.body ? '<div class="kr-upd-log">' + esc(cfg.body) + '</div>' : '') +
          (cfg.meta ? '<p class="kr-upd-meta">' + esc(cfg.meta) + '</p>' : '') +
          (cfg.btnUrl ? (
            '<button class="kr-upd-btn">' +
              '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>' +
              esc(cfg.btnLabel || 'খুলুন') +
            '</button>' +
            '<button class="kr-upd-later">' + esc(cfg.laterLabel || 'বন্ধ করুন') + '</button>'
          ) : '<button class="kr-upd-later" style="margin-top:6px">ঠিক আছে</button>') +
        '</div>';

      var close = function () {
        try { overlay.remove(); } catch (e) {}
        popupOpen = false;
      };
      overlay.querySelector('.kr-upd-x').onclick = close;
      var later = overlay.querySelector('.kr-upd-later');
      if (later) later.onclick = close;
      var btn = overlay.querySelector('.kr-upd-btn');
      if (btn) {
        btn.onclick = function () {
          /* APK-লিংক হলে অ্যাপ সিস্টেম-চুজার দেখাবে (ব্রাউজার নাকি KORA ROYAL);
             অন্য লিংক হলে ব্রাউজারে খোলে। দুটোই WebView-এর বাইরের URL-নিয়মে চলে। */
          try { window.location.href = cfg.btnUrl; } catch (e) {}
          setTimeout(close, 1200);
        };
      }
      document.body.appendChild(overlay);
    } catch (e) {
      popupOpen = false;
    }
  }

  var ICO_APK = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/><path d="M12 14V7"/><polyline points="9 10 12 7 15 10"/></svg>';
  var ICO_MEGAPHONE = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 11l18-8v18l-18-8v-2z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg>';

  function fmtSize(bytes) {
    var mb = Number(bytes) / (1024 * 1024);
    return mb >= 1 ? mb.toFixed(1) + ' MB' : Math.round(Number(bytes) / 1024) + ' KB';
  }

  /* ---------- চেক: আপডেট (প্রাধান্য ১) + ঘোষণা (প্রাধান্য ২) ---------- */
  function check() {
    lastCheck = Date.now();
    var latest = null;
    var announcements = [];
    var pending = 2;

    function done() {
      if (pending > 0) return;
      if (latest && Number(latest.versionCode) > myVersionCode()) {
        showPopup({
          icon: ICO_APK,
          title: 'নতুন ভার্সন এসেছে',
          sub: 'ভার্সন ' + latest.version + ' — আপডেট করে নতুন ফিচারগুলো নিন',
          body: latest.changelog || '',
          meta: latest.size ? ('সাইজ: ' + fmtSize(latest.size)) : '',
          btnUrl: latest.downloadUrl,
          btnLabel: 'আপডেট করুন',
          laterLabel: 'পরে করবো (পুরনো ভার্সনেই থাকবো)'
        });
      } else if (announcements.length) {
        var a = announcements[0];
        showPopup({
          icon: ICO_MEGAPHONE,
          title: a.title,
          body: a.body || '',
          btnUrl: a.btnUrl || '',
          btnLabel: a.btnLabel || '',
          meta: ''
        });
      }
    }

    try {
      fetch(API + '/api/app/latest', { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) { try { latest = (j && j.ok && j.latest) || null; } catch (e) {} pending--; done(); })
        .catch(function () { pending--; done(); });
      fetch(API + '/api/app/announcements', { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) { try { announcements = (j && j.ok && j.items) || []; } catch (e) {} pending--; done(); })
        .catch(function () { pending--; done(); });
    } catch (e) {}
  }

  var start = function () { setTimeout(check, START_DELAY); };
  if (document.readyState === 'complete' || document.readyState === 'interactive') start();
  else window.addEventListener('DOMContentLoaded', start);

  window.setInterval(check, CHECK_INTERVAL);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && Date.now() - lastCheck > RESUME_THROTTLE) check();
  });
})();
