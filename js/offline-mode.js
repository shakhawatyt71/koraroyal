/* ================================================================
   KORA ROYAL — Offline Mode v1.0
   ---------------------------------------------------------------
   কাজ:
   1) অনলাইনে থাকা অবস্থায় catalog + reviews ডেটা localStorage-এ
      স্ন্যাপশট হিসেবে সেভ থাকে (প্রতি সফল লোডে বদলে যায়)
   2) নেট না থাকলে: সেভ-করা স্ন্যাপশট দিয়েই সাইট দেখায়
      (catalog.js / reviews.js কিছু টেরও পায় না — তাদের কোড
       বদলানোর দরকার পড়েনি)
   3) অফলাইনে অর্ডার / রিভিউ / রিকোয়েস্ট বন্ধ — বার্তা দেখায়
   4) নেট ফিরলে অটো-রিফ্রেশ (নতুন ডেটা এসে পুরোনোটা রিপ্লেস করে)
   ---------------------------------------------------------------
   নোট: এই ফাইলটি sw.js-এর সাথে মিলে কাজ করে — sw.js ক্যাশ করে
   (দ্রুত), এই ফাইল স্ন্যাপশট রাখে (নিরাপদ ফলব্যাক)।
   ================================================================ */

'use strict';

(function () {
  if (window.KR_OFFLINE) return; /* ডাবল-লোড ঠেকাই */

  var API_BASE = (window.KR_API && window.KR_API.WORKER_URL) ||
                 'https://kora-api.shakhawatyt77.workers.dev';

  var LS_CATALOG = 'kr_offline_catalog_v1';
  var LS_REVIEWS = 'kr_offline_reviews_v1';
  var SS_RELOADED = 'kr_offline_reloaded_at';

  /* যেসব POST ব্যর্থ হলে ব্যবহারকারীকে বার্তা দেখানো হবে */
  var POST_TOAST_PREFIXES = ['/api/order', '/api/reviews', '/api/request', '/api/track'];

  var netFailedRecently = false;
  var wasOffline = false;
  var toastTimer = null;

  function isBn() {
    try { return localStorage.getItem('kr_lang') === 'bn'; } catch (e) { return false; }
  }

  function lsGet(k) {
    try { return localStorage.getItem(k); } catch (e) { return null; }
  }
  function lsSet(k, v) {
    try { localStorage.setItem(k, v); } catch (e) { /* storage full — চুপচাপ */ }
  }

  /* ---------------- ব্যানার ---------------- */
  var banner = null;

  function ensureBanner() {
    if (banner) return banner;
    banner = document.createElement('div');
    banner.id = 'krOfflineBanner';
    banner.setAttribute('role', 'status');
    banner.style.cssText =
      'position:fixed;top:0;left:0;right:0;z-index:2147483000;' +
      'display:none;align-items:center;justify-content:center;gap:8px;' +
      'padding:8px 14px;font:600 12.5px/1.4 system-ui,-apple-system,sans-serif;' +
      'text-align:center;box-shadow:0 2px 10px rgba(0,0,0,.15);' +
      'transition:transform .25s ease;';
    banner.innerHTML =
      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M2 2l20 20"/><path d="M8.5 16.5a5 5 0 0 1 7 0"/><path d="M5 12.9a10 10 0 0 1 5.2-2.8"/>' +
      '<path d="M19 12.9a10 10 0 0 0-3-2.2"/><path d="M2 8.8A15 15 0 0 1 8.7 5.1"/><path d="M16.3 5.3A15 15 0 0 1 22 8.8"/>' +
      '</svg><span class="kr-offline-txt"></span>';
    document.body.appendChild(banner);
    return banner;
  }

  function showBanner(mode) {
    var b = ensureBanner();
    var dark = false;
    try {
      dark = document.documentElement.dataset.theme === 'dark' ||
             (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    } catch (e) {}
    var txt = b.querySelector('.kr-offline-txt');
    if (mode === 'sync') {
      b.style.background = dark ? '#0f3d2e' : '#e7f8f0';
      b.style.color = dark ? '#7ee2b8' : '#0b7a4b';
      txt.textContent = isBn()
        ? 'ইন্টারনেট ফিরেছে — নতুন ডেটা আনা হচ্ছে…'
        : 'Back online — updating…';
    } else {
      b.style.background = dark ? '#452324' : '#fdecea';
      b.style.color = dark ? '#ffb3a7' : '#c0392b';
      txt.textContent = isBn()
        ? 'আপনি এখন অফলাইনে — সেভ করা ডেটা দেখানো হচ্ছে। অর্ডার করতে ইন্টারনেট লাগবে।'
        : 'You are offline — showing saved data. Ordering needs internet.';
    }
    b.style.display = 'flex';
  }

  function hideBanner() {
    if (banner) banner.style.display = 'none';
  }

  /* ---------------- টোস্ট ---------------- */
  function offlineToast() {
    if (toastTimer) return;
    var t = document.createElement('div');
    t.setAttribute('role', 'alert');
    t.style.cssText =
      'position:fixed;left:50%;bottom:84px;transform:translateX(-50%);' +
      'z-index:2147483000;max-width:88vw;padding:11px 18px;border-radius:12px;' +
      'background:#1f2430;color:#fff;font:600 13px/1.5 system-ui,-apple-system,sans-serif;' +
      'text-align:center;box-shadow:0 8px 26px rgba(0,0,0,.35);';
    t.textContent = isBn()
      ? 'এখন অফলাইনে আছেন — অর্ডার বা রিকোয়েস্ট করা যাবে না। ইন্টারনেট ফিরলে আবার চেষ্টা করুন।'
      : 'You are offline — orders and requests are disabled. Please try again when internet returns.';
    document.body.appendChild(t);
    toastTimer = setTimeout(function () {
      t.remove();
      toastTimer = null;
    }, 3400);
  }

  /* ---------------- fetch র‍্যাপার ----------------
     catalog/reviews-এর GET সফল হলে স্ন্যাপশট সেভ করি;
     নেট ফেল করলে স্ন্যাপশট থেকে নকল Response বানিয়ে দিই। */
  var origFetch = window.fetch ? window.fetch.bind(window) : null;
  if (!origFetch) return;

  function isCatalogGet(url, method) {
    return method === 'GET' && url.indexOf('/api/catalog') !== -1;
  }
  function isReviewsListGet(url, method) {
    if (method !== 'GET') return false;
    if (url.indexOf('/api/reviews') === -1) return false;
    /* submit/like/stats/delete ইত্যাদি বাদ; শুধু লিস্ট */
    return url.indexOf('/submit') === -1 && url.indexOf('/like') === -1 &&
           url.indexOf('/stats') === -1 && url.indexOf('/delete') === -1;
  }
  function isWatchedPost(url, method) {
    if (method !== 'POST') return false;
    for (var i = 0; i < POST_TOAST_PREFIXES.length; i++) {
      if (url.indexOf(POST_TOAST_PREFIXES[i]) !== -1) return true;
    }
    return false;
  }

  window.fetch = function (input, init) {
    var url = '';
    var method = 'GET';
    try {
      if (typeof input === 'string') { url = input; }
      else if (input && input.url) { url = input.url; }
      if (init && init.method) method = String(init.method).toUpperCase();
      else if (input && input.method) method = String(input.method).toUpperCase();
    } catch (e) { /* স্বাভাবিক পথেই যাক */ }

    /* অফলাইনে নজরাকৃত POST আগেই থামিয়ে দিই (নেটওয়ার্ক এররের আগেই) */
    if (isWatchedPost(url, method) && isOfflineNow()) {
      offlineToast();
      return Promise.reject(new TypeError('KORA offline: request blocked'));
    }

    var p = origFetch(input, init);

    if (isCatalogGet(url, method)) {
      return p.then(function (res) {
        try {
          if (res && res.ok) {
            res.clone().text().then(function (txt) {
              lsSet(LS_CATALOG, txt);
              lsSet(LS_CATALOG + '_ts', String(Date.now()));
            }).catch(function () {});
          }
        } catch (e) {}
        return res;
      }, function (err) {
        var snap = lsGet(LS_CATALOG);
        if (snap) {
          netFailedRecently = true;
          showBanner('offline');
          return fakeJson(snap);
        }
        throw err;
      });
    }

    if (isReviewsListGet(url, method)) {
      return p.then(function (res) {
        try {
          if (res && res.ok) {
            res.clone().text().then(function (txt) {
              saveReviewSnapshot(url, txt);
            }).catch(function () {});
          }
        } catch (e) {}
        return res;
      }, function (err) {
        var snap = getReviewSnapshot(url);
        if (snap) {
          netFailedRecently = true;
          showBanner('offline');
          return fakeJson(snap);
        }
        throw err;
      });
    }

    if (method === 'POST') {
      return p.catch(function (err) {
        /* নেটওয়ার্ক-লেভেল ব্যর্থতা (সার্ভারের NO নয়) */
        netFailedRecently = true;
        if (isWatchedPost(url, method)) offlineToast();
        throw err;
      });
    }

    return p;
  };

  function fakeJson(text) {
    return new Response(text, {
      status: 200,
      statusText: 'OK (offline snapshot)',
      headers: { 'Content-Type': 'application/json' }
    });
  }

  function saveReviewSnapshot(url, text) {
    var map = {};
    try { map = JSON.parse(lsGet(LS_REVIEWS) || '{}'); } catch (e) { map = {}; }
    var key = 'all';
    try {
      var m = /[?&]filter=([^&]+)/.exec(url);
      if (m) key = decodeURIComponent(m[1]);
    } catch (e) {}
    map[key] = { ts: Date.now(), body: text };
    /* সর্বোচ্চ ৫টা ফিল্টার রাখি */
    var keys = Object.keys(map);
    if (keys.length > 5) {
      keys.sort(function (a, b) { return (map[a].ts || 0) - (map[b].ts || 0); });
      delete map[keys[0]];
    }
    lsSet(LS_REVIEWS, JSON.stringify(map));
  }

  function getReviewSnapshot(url) {
    try {
      var map = JSON.parse(lsGet(LS_REVIEWS) || '{}');
      var key = 'all';
      var m = /[?&]filter=([^&]+)/.exec(url);
      if (m) key = decodeURIComponent(m[1]);
      if (map[key]) return map[key].body;
      if (map['all']) return map['all'].body;
    } catch (e) {}
    return null;
  }

  /* ---------------- অফলাইন অবস্থা ---------------- */
  function isOfflineNow() {
    /* v1.1: অ্যাপের ভেতরে KRApp ব্রিজ সঠিক তথ্য দেয়; ব্রাউজারে navigator.onLine */
    try {
      if (window.KRApp && typeof window.KRApp.isOnline === 'function') {
        return !window.KRApp.isOnline();
      }
    } catch (e) {}
    if (typeof navigator.onLine === 'boolean' && !navigator.onLine) return true;
    return false;
  }

  /* ফর্ম submit আটকানো (অর্ডার ফর্ম, রিভিউ ফর্ম ইত্যাদি) */
  document.addEventListener('submit', function (e) {
    if (!isOfflineNow()) return;
    e.preventDefault();
    e.stopPropagation();
    offlineToast();
    showBanner('offline');
  }, true);

  /* ---------------- online / offline ইভেন্ট ---------------- */
  window.addEventListener('offline', function () {
    wasOffline = true;
    showBanner('offline');
  });

  window.addEventListener('online', function () {
    if (!wasOffline && !netFailedRecently) return;
    showBanner('sync');
    /* অল্প সময় পর নিজে থেকেই রিফ্রেশ — নতুন ডেটা এসে পুরোনোটা রিপ্লেস করবে */
    var last = 0;
    try { last = Number(sessionStorage.getItem(SS_RELOADED) || 0); } catch (e) {}
    var now = Date.now();
    if (now - last > 10000) {
      try { sessionStorage.setItem(SS_RELOADED, String(now)); } catch (e) {}
      setTimeout(function () { location.reload(); }, 900);
    } else {
      setTimeout(function () {
        hideBanner();
        netFailedRecently = false;
        wasOffline = false;
      }, 1600);
    }
  });

  /* পেজ খোলা অবস্থায় যদি ইতিমধ্যেই অফলাইন থাকি */
  if (isOfflineNow()) {
    wasOffline = true;
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { showBanner('offline'); });
    } else {
      showBanner('offline');
    }
  }

  /* ---------------- ডিবাগ/তথ্য ---------------- */
  window.KR_OFFLINE = {
    version: '1.3',
    isOffline: isOfflineNow,
    catalogSnapshotTime: function () {
      var ts = Number(lsGet(LS_CATALOG + '_ts') || 0);
      return ts ? new Date(ts).toISOString() : null;
    },
    hasCatalogSnapshot: function () { return !!lsGet(LS_CATALOG); },
    clearSnapshots: function () {
      try {
        localStorage.removeItem(LS_CATALOG);
        localStorage.removeItem(LS_CATALOG + '_ts');
        localStorage.removeItem(LS_REVIEWS);
      } catch (e) {}
    }
  };
  /* v1.2: Periodic Background Sync — ইনস্টল করা PWA হলে ব্রাউজারকে বলি
     ব্যাকগ্রাউন্ডে ক্যাটালগ টাটকা রাখতে। অনুমতি/সাপোর্ট না থাকলে নীরব। */
  try {
    if ('serviceWorker' in navigator && 'PeriodicSyncManager' in window) {
      navigator.serviceWorker.ready.then((reg) => {
        if (reg && reg.periodicSync) {
          reg.periodicSync.register('kora-catalog-refresh', {
            minInterval: 12 * 60 * 60 * 1000
          }).catch(() => {});
        }
      }).catch(() => {});
    }
  } catch (e) {}

  /* v1.3: web+koraroyal: প্রোটোকল-হ্যান্ডলার + Android শেয়ার-ট্রে রিসিভার */
  try {
    var q = new URLSearchParams(window.location.search);
    var openParam = q.get('open');
    if (openParam) {
      var target = String(openParam).replace(/^web\+koraroyal:/i, '');
      if (target.charAt(0) === '/' && target.indexOf('//') !== 0) {
        window.history.replaceState({}, '', '/');
        window.location.replace(target);
      }
    } else if (q.get('text') || q.get('url') || q.get('title')) {
      var shared = String(q.get('title') || '') + ' ' + String(q.get('text') || '') + ' ' + String(q.get('url') || '');
      shared = shared.trim().slice(0, 100);
      window.history.replaceState({}, '', '/');
      if (typeof window.showIsland === 'function') {
        window.showIsland('info', 'শেয়ার পেয়েছি: ' + (shared || 'কনটেন্ট'), 'Shared content', 5000);
      }
    }
  } catch (e) {}

})();
