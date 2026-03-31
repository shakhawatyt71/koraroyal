/* ═══════════════════════════════════════════════════════════════
   KORA ROYAL — main.js v3
   All fixes applied. No feature missed.
   Products: 5 images from ibb.co
   Quantity: fixed (1→2→3)
   Carousel: auto + manual drag/touch
   WhatsApp: full message with advance/COD payable
   Phone: multi-format validation
   Size chart popup
   Emoji removed completely
════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ════════════════════════════════════════
     1. CONFIG
  ════════════════════════════════════════ */
  const KR = {
    TELEGRAM_TOKEN: '8413635091:AAGhxTUF1Zr_Tp8NcwxfJL6f62VfsD2ygUY',
    TELEGRAM_CHAT:  '6372405191',
    SHEETS_URL:     'https://script.google.com/macros/s/AKfycbwhBVcDKXWepE-3GqPI1CjmeeejHtZNq7fnNsWXfdRLZJKtes0NbRgQKlMjz0tnS6k_/exec',
    WHATSAPP:       '8801935158745',
    DELIVERY:       { DHAKA: 60, OUTSIDE: 130, FREE_AT: 2999 },
    COUPONS: {
      'KORA10':    { type: 'percent', value: 10 },
      'APNALOK20': { type: 'percent', value: 20 }
    },
    PRODUCTS: {
      1: {
        id: 'KR-PRD-001',
        name: 'Royal Classic Polo',
        nameBn: 'রয়্যাল ক্লাসিক পোলো',
        price: 1499, compare: 1999, discount: 25,
        category: "Men's Collection",
        soldCount: 1247, rating: 4.9, reviewCount: 142,
        img: 'https://i.ibb.co/Q38M5xKj/gemini-3-pro-image-preview-nano-banana-pro-a-MASTER-PROMPT.png',
        images: [
          'https://i.ibb.co/Q38M5xKj/gemini-3-pro-image-preview-nano-banana-pro-a-MASTER-PROMPT.png',
          'https://i.ibb.co/4xfRxkj/Image-Generation-Arena-Compare-AI-Image-Models-4.png'
        ],
        colors: [
          { name: 'Navy',  hex: '#1a1a2e' },
          { name: 'White', hex: '#f0f0f0' },
          { name: 'Coral', hex: '#FF6044' }
        ],
        sizes: ['M','L','XL'],
        sizeChart: [
          { size:'M',  chest:'38-40"', length:'28"', sleeve:'8.5"' },
          { size:'L',  chest:'40-42"', length:'29"', sleeve:'9"'   },
          { size:'XL', chest:'42-44"', length:'30"', sleeve:'9.5"' }
        ]
      },
      2: {
        id: 'KR-PRD-002',
        name: 'Elite Oxford Shirt',
        nameBn: 'এলিট অক্সফোর্ড শার্ট',
        price: 1799, compare: 2499, discount: 28,
        category: "Men's Collection",
        soldCount: 893, rating: 4.8, reviewCount: 98,
        img: 'https://i.ibb.co/pv9MvYCM/gemini-3-pro-image-preview-nano-banana-pro-a-SUPER-COMBINED.png',
        images: [
          'https://i.ibb.co/pv9MvYCM/gemini-3-pro-image-preview-nano-banana-pro-a-SUPER-COMBINED.png',
          'https://i.ibb.co/7NR1wJFd/gemini-3-pro-image-preview-nano-banana-pro-a-SUPER-COMBINED-M-1.png'
        ],
        colors: [
          { name: 'Royal Blue', hex: '#2d5a8e' },
          { name: 'Charcoal',   hex: '#2d2d2d' },
          { name: 'Khaki',      hex: '#c8a882' },
          { name: 'White',      hex: '#f0f0f0' }
        ],
        sizes: ['M','L','XL'],
        sizeChart: [
          { size:'M',  chest:'38-40"', length:'29"', sleeve:'9"'   },
          { size:'L',  chest:'40-42"', length:'30"', sleeve:'9.5"' },
          { size:'XL', chest:'42-44"', length:'31"', sleeve:'10"'  }
        ]
      },
      3: {
        id: 'KR-PRD-003',
        name: 'Luxe Casual Tee',
        nameBn: 'লাক্স ক্যাজুয়াল টি',
        price: 999, compare: 1499, discount: 33,
        category: 'Unisex Collection',
        soldCount: 567, rating: 4.7, reviewCount: 67,
        img: 'https://i.ibb.co/gLmL1qZR/gemini-3-pro-image-preview-nano-banana-pro-a-SUPER-COMBINED-M.png',
        images: [
          'https://i.ibb.co/gLmL1qZR/gemini-3-pro-image-preview-nano-banana-pro-a-SUPER-COMBINED-M.png',
          'https://i.ibb.co/7NR1wJFd/gemini-3-pro-image-preview-nano-banana-pro-a-SUPER-COMBINED-M-1.png'
        ],
        colors: [
          { name: 'Black', hex: '#1a1a1a' },
          { name: 'Brown', hex: '#8B4513' },
          { name: 'Olive', hex: '#556B2F' }
        ],
        sizes: ['M','L','XL'],
        sizeChart: [
          { size:'M',  chest:'36-38"', length:'27"', sleeve:'8"'   },
          { size:'L',  chest:'38-40"', length:'28"', sleeve:'8.5"' },
          { size:'XL', chest:'40-42"', length:'29"', sleeve:'9"'   }
        ]
      }
    }
  };

  /* ════════════════════════════════════════
     2. STATE
  ════════════════════════════════════════ */
  // Per-product selection — qty starts at 0
  const selections = {
    1: { size: null, color: null, qty: 0 },
    2: { size: null, color: null, qty: 0 },
    3: { size: null, color: null, qty: 0 }
  };

  const state = {
    theme: 'light',
    lang: 'en',
    couponCode: '',
    couponApplied: false,
    isSubmitting: false,
    orderCounter: parseInt(localStorage.getItem('kr_order_counter') || '0'),
    // Carousel drag state
    carouselDragging: false,
    carouselStartX: 0,
    carouselScrollLeft: 0
  };

  /* ════════════════════════════════════════
     3. HELPERS
  ════════════════════════════════════════ */
  const $  = id  => document.getElementById(id);
  const $$ = sel => document.querySelectorAll(sel);

  function fmt(n) {
    return parseInt(n || 0).toLocaleString('en-IN');
  }

  function getPayment() {
    return document.querySelector('input[name="payment"]:checked')?.value || 'cod';
  }

  function getAdvance() {
    const pay = getPayment();
    if (pay === 'bkash') return parseFloat($('bkashAdvance')?.value) || 0;
    if (pay === 'nagad')  return parseFloat($('nagadAdvance')?.value) || 0;
    return 0;
  }

  /* ════════════════════════════════════════
     4. THEME
  ════════════════════════════════════════ */
  function initTheme() {
    setTheme(localStorage.getItem('kr_theme') || 'light', false);
  }

  function setTheme(t, save = true) {
    state.theme = t;
    document.documentElement.setAttribute('data-theme', t);
    if (save) localStorage.setItem('kr_theme', t);
    const sun  = $('themeIconSun');
    const moon = $('themeIconMoon');
    if (sun)  sun.style.display  = t === 'dark' ? 'none'  : 'block';
    if (moon) moon.style.display = t === 'dark' ? 'block' : 'none';
  }

  /* ════════════════════════════════════════
     5. LANGUAGE — announcement bar fixed
  ════════════════════════════════════════ */
  function initLang() {
    setLang(localStorage.getItem('kr_lang') || 'en', false);
  }

  function setLang(lang, save = true) {
    state.lang = lang;
    document.documentElement.setAttribute('lang', lang === 'bn' ? 'bn' : 'en');
    if (save) localStorage.setItem('kr_lang', lang);

    // Update label
    const lbl = $('langLabel');
    if (lbl) lbl.textContent = lang === 'bn' ? 'EN' : 'বাং';

    // Apply Bengali font to html element
    if (lang === 'bn') {
      document.documentElement.style.setProperty('--font-heading', "'Hind Siliguri', sans-serif");
      document.documentElement.style.setProperty('--font-body',    "'Hind Siliguri', sans-serif");
    } else {
      document.documentElement.style.setProperty('--font-heading', "'Outfit', sans-serif");
      document.documentElement.style.setProperty('--font-body',    "'Inter', sans-serif");
    }

    // Apply to ALL elements with data-en / data-bn
    $$('[data-en][data-bn]').forEach(el => {
      const txt = el.getAttribute('data-' + lang);
      if (txt !== null) el.textContent = txt;
    });

    // Placeholders
    $$('[data-placeholder-en][data-placeholder-bn]').forEach(el => {
      const ph = el.getAttribute('data-placeholder-' + lang);
      if (ph) el.placeholder = ph;
    });

    // Rebuild dynamic sections (language-sensitive)
    buildCarousel();
    buildCheckoutProducts();
    updateSummary();
    updateWALink();
  }

  /* ════════════════════════════════════════
     6. ANNOUNCEMENT BAR
  ════════════════════════════════════════ */
  function initAnnouncement() {
    if (localStorage.getItem('kr_announce_closed') === '1') {
      const bar = $('kr-announcement');
      if (bar) bar.classList.add('is-hidden');
      return;
    }
    $('announcementClose')?.addEventListener('click', () => {
      $('kr-announcement')?.classList.add('is-hidden');
      localStorage.setItem('kr_announce_closed', '1');
    });
  }

  /* ════════════════════════════════════════
     7. NAVBAR
  ════════════════════════════════════════ */
  function initNavbar() {
    window.addEventListener('scroll', () => {
      $('kr-navbar')?.classList.toggle('is-scrolled', window.scrollY > 10);

      // Hide fixed bottom btn when user is inside order form section
      const fixedBtn    = $('kr-fixed-btn');
      const orderSection = $('kr-order-form');
      if (fixedBtn && orderSection) {
        const rect   = orderSection.getBoundingClientRect();
        const inForm = rect.top < window.innerHeight && rect.bottom > 80;
        fixedBtn.style.transform = inForm ? 'translateY(100%)' : 'translateY(0)';
        fixedBtn.style.opacity   = inForm ? '0' : '1';
      }
    }, { passive: true });

    // Hamburger
    const ham  = $('navHamburger');
    const menu = $('kr-mobile-menu');
    if (ham && menu) {
      ham.addEventListener('click', () => {
        const open = menu.classList.toggle('is-open');
        ham.setAttribute('aria-expanded', open);
        $('hamburgerOpen').style.display  = open ? 'none'  : 'block';
        $('hamburgerClose').style.display = open ? 'block' : 'none';
      });
    }
    $$('.kr-mobile-menu__item').forEach(item => {
      item.addEventListener('click', () => {
        menu?.classList.remove('is-open');
        ham?.setAttribute('aria-expanded', 'false');
        if ($('hamburgerOpen'))  $('hamburgerOpen').style.display  = 'block';
        if ($('hamburgerClose')) $('hamburgerClose').style.display = 'none';
      });
    });
  }

  /* ════════════════════════════════════════
     8. HERO GALLERY
  ════════════════════════════════════════ */
  function initGallery() {
    const mainImg = $('heroMainImg');
    const thumbs  = $('heroThumbs');
    if (!mainImg || !thumbs) return;

    thumbs.addEventListener('click', e => {
      const thumb = e.target.closest('.kr-hero__thumb');
      if (!thumb) return;
      const src = thumb.getAttribute('data-img');
      mainImg.style.transition = 'transform .35s ease, opacity .2s ease';
      mainImg.style.transform  = 'rotateY(90deg)';
      mainImg.style.opacity    = '0.2';
      setTimeout(() => {
        mainImg.src = src;
        mainImg.style.transform = 'rotateY(0)';
        mainImg.style.opacity   = '1';
      }, 250);
      $$('.kr-hero__thumb').forEach(t => t.classList.remove('kr-hero__thumb--active'));
      thumb.classList.add('kr-hero__thumb--active');
    });

    // Touch swipe
    let tx = 0;
    mainImg.addEventListener('touchstart', e => { tx = e.touches[0].clientX; }, { passive: true });
    mainImg.addEventListener('touchend', e => {
      const diff = tx - e.changedTouches[0].clientX;
      if (Math.abs(diff) < 40) return;
      const all = $$('.kr-hero__thumb');
      let idx = 0;
      all.forEach((t, i) => { if (t.classList.contains('kr-hero__thumb--active')) idx = i; });
      const next = diff > 0 ? Math.min(idx + 1, all.length - 1) : Math.max(idx - 1, 0);
      all[next].click();
    }, { passive: true });
  }

  /* ════════════════════════════════════════
     9. DYNAMIC ISLAND
  ════════════════════════════════════════ */
  let islandTimer = null;

  function showIsland(icon, title, body, dur = 4000) {
    const el = $('kr-island');
    if (!el) return;
    const ic = $('islandIcon');
    const ti = $('islandTitle');
    const bo = $('islandBody');
    if (ic) ic.innerHTML = icon; // SVG or text
    if (ti) ti.textContent = title;
    if (bo) bo.textContent = body;
    if (islandTimer) clearTimeout(islandTimer);
    el.classList.add('is-active');
    islandTimer = setTimeout(() => el.classList.remove('is-active'), dur);
  }

  function initIsland() {
    const msgs = [
      {
        icon: `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FF6044" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
        en: { title: 'Limited Time Offer', body: 'Only 2 days left — Grab it now!' },
        bn: { title: 'সীমিত সময়ের অফার',  body: 'মাত্র ২ দিন বাকি — এখনই নিন!' }
      },
      {
        icon: `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FF6044" stroke-width="2.5"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>`,
        en: { title: '1,247+ Happy Customers', body: 'Join our growing family today!' },
        bn: { title: '১,২৪৭+ সন্তুষ্ট গ্রাহক',  body: 'আজই আমাদের পরিবারে যোগ দিন!' }
      },
      {
        icon: `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FF6044" stroke-width="2.5"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>`,
        en: { title: 'Exclusive Discount', body: 'Use KORA10 for 10% OFF your order!' },
        bn: { title: 'বিশেষ ছাড়',         body: '১০% ছাড় পেতে KORA10 ব্যবহার করুন!' }
      },
      {
        icon: `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FF6044" stroke-width="2.5"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>`,
        en: { title: 'Fast Delivery',    body: 'Dhaka 1-2 days via Pathao Courier' },
        bn: { title: 'দ্রুত ডেলিভারি',   body: 'ঢাকায় ১-২ দিনে পাঠাও কুরিয়ারে' }
      },
      {
        icon: `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FF6044" stroke-width="2.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
        en: { title: '4.9 Star Rated Brand', body: '307 verified reviews — Shop now!' },
        bn: { title: '৪.৯ স্টার ব্র্যান্ড',   body: '৩০৭ যাচাইকৃত রিভিউ — এখনই কিনুন!' }
      }
    ];

    let idx = 0;
    const fire = () => {
      const m = msgs[idx];
      const c = m[state.lang] || m.en;
      showIsland(m.icon, c.title, c.body, 5000);
      idx = (idx + 1) % msgs.length;
    };

    setTimeout(fire, 3000);
    setInterval(fire, 45000);
  }

  /* ════════════════════════════════════════
     10. CAROUSEL — auto + manual drag/touch
  ════════════════════════════════════════ */
  function buildCarousel() {
    const track = $('carouselTrack');
    if (!track) return;

    const badgeMap   = { 1: 'Best Seller',      2: 'Most Popular',      3: 'Limited Stock'   };
    const badgeMapBn = { 1: 'সেরা বিক্রয়',       2: 'সবচেয়ে জনপ্রিয়',    3: 'সীমিত স্টক'      };
    const badgeCls   = { 1: 'kr-badge--hot',     2: 'kr-badge--new',     3: 'kr-badge--sale'  };

    // 5 images for carousel (all products including extras)
    const carouselItems = [
      { pid: 1, img: KR.PRODUCTS[1].images[0] },
      { pid: 2, img: KR.PRODUCTS[2].images[0] },
      { pid: 3, img: KR.PRODUCTS[3].images[0] },
      { pid: 1, img: KR.PRODUCTS[1].images[1] },
      { pid: 2, img: KR.PRODUCTS[2].images[1] },
      { pid: 3, img: KR.PRODUCTS[3].images[1] }
    ];

    // Duplicate for infinite scroll
    const allItems = [...carouselItems, ...carouselItems];

    track.innerHTML = allItems.map(({ pid, img }) => {
      const p    = KR.PRODUCTS[pid];
      const nm   = state.lang === 'bn' ? p.nameBn : p.name;
      const badge = state.lang === 'bn' ? badgeMapBn[pid] : badgeMap[pid];
      const isSel = selections[pid].qty > 0;
      const selTxt = state.lang === 'bn'
        ? (isSel ? 'নির্বাচিত' : 'এটি বাছুন')
        : (isSel ? 'Selected'   : 'Select This');
      return `
      <div class="kr-carousel-card" data-pid="${pid}">
        <div class="kr-carousel-card__img-wrap">
          <img src="${img}" alt="${nm}" class="kr-carousel-card__img" loading="lazy" />
          <div class="kr-carousel-card__badge">
            <span class="kr-badge ${badgeCls[pid]}">${badge}</span>
          </div>
          <div class="kr-carousel-card__stats">
            <span class="kr-cstat">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
              ${fmt(p.soldCount)}+
            </span>
            <span class="kr-cstat">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="#f59e0b" stroke="#f59e0b" stroke-width="1"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
              ${p.rating}
            </span>
          </div>
        </div>
        <div class="kr-carousel-card__body">
          <div class="kr-carousel-card__name">${nm}</div>
          <div class="kr-carousel-card__price">
            <span class="cur">৳${fmt(p.price)}</span>
            <span class="ori">৳${fmt(p.compare)}</span>
            <span class="off">${p.discount}% OFF</span>
          </div>
          <button class="kr-carousel-card__btn${isSel ? ' is-selected' : ''}" data-pid="${pid}">
            ${selTxt}
          </button>
        </div>
      </div>`;
    }).join('');

    // Click: select product
    track.addEventListener('click', e => {
      if (state.carouselDragging) return;
      const btn = e.target.closest('.kr-carousel-card__btn');
      if (!btn) return;
      const pid = parseInt(btn.getAttribute('data-pid'));
      if (selections[pid].qty === 0) {
        selections[pid].qty = 1;
        updateCheckoutProductQty(pid);
        updateSummary();
      }
      const form = $('kr-order-form');
      if (form) {
        const navH = $('kr-navbar')?.offsetHeight || 70;
        window.scrollTo({ top: form.getBoundingClientRect().top + window.scrollY - navH - 16, behavior: 'smooth' });
      }
      setTimeout(() => {
        const row = document.querySelector(`.kr-co-product[data-pid="${pid}"]`);
        if (row) { row.classList.add('is-active'); row.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
      }, 700);
    });

    initCarouselDrag();
  }

  function initCarouselDrag() {
    const wrap  = document.querySelector('.kr-carousel-wrap');
    const track = $('carouselTrack');
    if (!wrap || !track) return;

    let animPaused = false;

    // Mouse drag
    wrap.addEventListener('mousedown', e => {
      state.carouselDragging = false;
      state.carouselStartX    = e.pageX - wrap.offsetLeft;
      state.carouselScrollLeft = wrap.scrollLeft;
      wrap.style.cursor = 'grabbing';
      // Pause CSS animation
      track.style.animationPlayState = 'paused';
      animPaused = true;

      const onMove = mv => {
        const moved = mv.pageX - wrap.offsetLeft - state.carouselStartX;
        if (Math.abs(moved) > 5) state.carouselDragging = true;
        wrap.scrollLeft = state.carouselScrollLeft - moved;
      };
      const onUp = () => {
        wrap.style.cursor = 'grab';
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        // Resume after 200ms
        setTimeout(() => {
          track.style.animationPlayState = 'running';
          animPaused = false;
          setTimeout(() => { state.carouselDragging = false; }, 100);
        }, 200);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    // Touch drag
    let touchStartX = 0, touchScrollLeft = 0;
    wrap.addEventListener('touchstart', e => {
      touchStartX    = e.touches[0].pageX;
      touchScrollLeft = wrap.scrollLeft;
      track.style.animationPlayState = 'paused';
    }, { passive: true });

    wrap.addEventListener('touchmove', e => {
      const moved = touchStartX - e.touches[0].pageX;
      wrap.scrollLeft = touchScrollLeft + moved;
    }, { passive: true });

    wrap.addEventListener('touchend', () => {
      setTimeout(() => {
        track.style.animationPlayState = 'running';
      }, 300);
    }, { passive: true });

    // Hover: pause
    wrap.addEventListener('mouseenter', () => {
      if (!animPaused) track.style.animationPlayState = 'paused';
    });
    wrap.addEventListener('mouseleave', () => {
      if (!animPaused) track.style.animationPlayState = 'running';
    });
  }

  /* ════════════════════════════════════════
     11. CHECKOUT PRODUCTS (multi, qty fixed)
  ════════════════════════════════════════ */
  function buildCheckoutProducts() {
    const wrap = $('checkoutProducts');
    if (!wrap) return;

    wrap.innerHTML = Object.keys(KR.PRODUCTS).map(pid => {
      const p   = KR.PRODUCTS[parseInt(pid)];
      const sel = selections[pid];
      const nm  = state.lang === 'bn' ? p.nameBn : p.name;

      const sizes = p.sizes.map(s =>
        `<button type="button" class="kr-co-size-btn${sel.size === s ? ' is-selected' : ''}"
          data-pid="${pid}" data-size="${s}">${s}</button>`
      ).join('');

      const colors = p.colors.map(c => {
        const needBorder = ['#f0f0f0','#f5f5f5','#ffffff','#fff'].includes(c.hex.toLowerCase());
        return `<button type="button" class="kr-co-color-btn${sel.color === c.name ? ' is-selected' : ''}"
          data-pid="${pid}" data-color="${c.name}"
          style="background:${c.hex}${needBorder ? ';border:1.5px solid #ccc' : ''}"
          title="${c.name}" aria-label="${c.name}"></button>`;
      }).join('');

      return `
      <div class="kr-co-product${sel.qty > 0 ? ' is-active' : ''}" data-pid="${pid}">
        <img src="${p.img}" alt="${nm}" class="kr-co-product__img" loading="lazy" />
        <div class="kr-co-product__right">
          <div class="kr-co-product__top">
            <span class="kr-co-product__name">${nm}</span>
            <span class="kr-co-product__price">৳${fmt(p.price)}</span>
          </div>
          <div class="kr-co-product__row">${sizes}</div>
          <div class="kr-co-product__row">
            ${colors}
            <div class="kr-co-qty" style="margin-left:auto">
              <button type="button" class="kr-co-qty-btn" data-pid="${pid}" data-action="minus">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"/></svg>
              </button>
              <span class="kr-co-qty-num" id="coQty${pid}">${sel.qty}</span>
              <button type="button" class="kr-co-qty-btn" data-pid="${pid}" data-action="plus">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              </button>
            </div>
          </div>
        </div>
      </div>`;
    }).join('');

    // ── Event delegation — ONE listener only ──
    wrap.addEventListener('click', handleCheckoutClick);
  }

  function handleCheckoutClick(e) {
    // Size button
    const sBtn = e.target.closest('.kr-co-size-btn');
    if (sBtn) {
      const pid  = sBtn.getAttribute('data-pid');
      const size = sBtn.getAttribute('data-size');
      selections[pid].size = size;
      if (selections[pid].qty === 0) selections[pid].qty = 1;
      // Update visual only (no full rebuild to avoid qty bug)
      document.querySelectorAll(`.kr-co-size-btn[data-pid="${pid}"]`).forEach(b =>
        b.classList.toggle('is-selected', b === sBtn)
      );
      updateCheckoutProductQty(pid);
      updateSummary();
      clearSelectErr(pid);
      return;
    }

    // Color button
    const cBtn = e.target.closest('.kr-co-color-btn');
    if (cBtn) {
      const pid   = cBtn.getAttribute('data-pid');
      const color = cBtn.getAttribute('data-color');
      selections[pid].color = color;
      if (selections[pid].qty === 0) selections[pid].qty = 1;
      document.querySelectorAll(`.kr-co-color-btn[data-pid="${pid}"]`).forEach(b =>
        b.classList.toggle('is-selected', b === cBtn)
      );
      updateCheckoutProductQty(pid);
      updateSummary();
      clearSelectErr(pid);
      return;
    }

    // Qty button — THE FIX: change by exactly 1
    const qBtn = e.target.closest('.kr-co-qty-btn');
    if (qBtn) {
      const pid    = qBtn.getAttribute('data-pid');
      const action = qBtn.getAttribute('data-action');
      const cur    = parseInt(selections[pid].qty) || 0; // ensure integer

      if (action === 'plus')  selections[pid].qty = Math.min(cur + 1, 10);
      if (action === 'minus') selections[pid].qty = Math.max(cur - 1, 0);

      updateCheckoutProductQty(pid);
      updateSummary();
    }
  }

  function updateCheckoutProductQty(pid) {
    const el  = $(`coQty${pid}`);
    if (el) el.textContent = selections[pid].qty;
    const row = document.querySelector(`.kr-co-product[data-pid="${pid}"]`);
    if (row) row.classList.toggle('is-active', selections[pid].qty > 0);
  }

  function clearSelectErr(pid) {
    const row = document.querySelector(`.kr-co-product[data-pid="${pid}"]`);
    if (row) row.style.outline = '';
  }

  /* ════════════════════════════════════════
     12. PRICING CALCULATION
  ════════════════════════════════════════ */
  function calcTotals() {
    let subtotal = 0;
    Object.keys(selections).forEach(pid => {
      const sel = selections[pid];
      if (sel.qty > 0) subtotal += KR.PRODUCTS[pid].price * sel.qty;
    });

    const district = $('customerDistrict')?.value || '';
    let delivery = 0;
    if (subtotal > 0) {
      if (subtotal >= KR.DELIVERY.FREE_AT) {
        delivery = 0;
      } else if (district) {
        delivery = district.toLowerCase() === 'dhaka' ? KR.DELIVERY.DHAKA : KR.DELIVERY.OUTSIDE;
      }
    }

    let discount = 0;
    if (state.couponApplied && state.couponCode) {
      const c = KR.COUPONS[state.couponCode];
      if (c) {
        discount = c.type === 'percent'
          ? Math.round(subtotal * c.value / 100)
          : c.value;
      }
    }

    const advance   = getAdvance();
    const total     = Math.max(0, subtotal + delivery - discount);
    const remaining = Math.max(0, total - advance);

    return { subtotal, delivery, discount, advance, total, remaining, district };
  }

  /* ════════════════════════════════════════
     13. SUMMARY UPDATE
  ════════════════════════════════════════ */
  function updateSummary() {
    const { subtotal, delivery, discount, advance, total, remaining, district } = calcTotals();
    const lang = state.lang;

    // Products list
    const listEl = $('summaryProductsList');
    if (listEl) {
      const active = Object.keys(selections).filter(pid => selections[pid].qty > 0);
      if (active.length === 0) {
        listEl.innerHTML = `<p style="font-size:.8rem;color:var(--text-muted);padding:4px 0">${lang === 'bn' ? 'কোনো পণ্য নির্বাচন করা হয়নি' : 'No product selected yet'}</p>`;
      } else {
        listEl.innerHTML = active.map(pid => {
          const sel = selections[pid];
          const p   = KR.PRODUCTS[pid];
          const nm  = lang === 'bn' ? p.nameBn : p.name;
          return `<div class="kr-summary-row" style="font-size:.82rem;padding:4px 0">
            <span>${nm}<br><small style="color:var(--text-muted)">${sel.size || '?'} / ${sel.color || '?'} &times; ${sel.qty}</small></span>
            <span style="font-weight:800;color:var(--brand-coral)">৳${fmt(p.price * sel.qty)}</span>
          </div>`;
        }).join('');
      }
    }

    // Subtotal
    setText('summarySubtotal', '৳' + fmt(subtotal));

    // Shipping
    const sh = $('summaryShipping');
    if (sh) {
      if (!district || subtotal === 0) {
        sh.innerHTML = `<span style="color:var(--text-muted)">${lang === 'bn' ? 'জেলা নির্বাচন করুন' : 'Select district'}</span>`;
      } else if (delivery === 0) {
        sh.innerHTML = `<span style="color:#22c55e;font-weight:700">FREE</span>`;
      } else {
        sh.textContent = '৳' + fmt(delivery);
      }
    }

    // Discount
    const sdLine = $('summaryDiscountLine');
    if (sdLine) sdLine.style.display = discount > 0 ? 'flex' : 'none';
    if (discount > 0) setText('summaryDiscount', '-৳' + fmt(discount));

    // Total
    setText('summaryTotal', '৳' + fmt(total));

    // Advance
    const saLine = $('summaryAdvanceLine');
    if (saLine) saLine.style.display = advance > 0 ? 'flex' : 'none';
    if (advance > 0) setText('summaryAdvance', '-৳' + fmt(advance));

    // Remaining / COD payable
    const srWrap = $('summaryRemainingWrap');
    if (srWrap) srWrap.style.display = total > 0 ? 'flex' : 'none';
    setText('summaryRemaining', '৳' + fmt(remaining));

    updateWALink();
  }

  function setText(id, val) {
    const el = $(id);
    if (el) el.textContent = val;
  }

  /* ════════════════════════════════════════
     14. WHATSAPP ORDER LINK — full message
  ════════════════════════════════════════ */
  function buildOrderMessage(orderId) {
    const { subtotal, delivery, discount, advance, total, remaining } = calcTotals();
    const lang      = state.lang;
    const pay       = getPayment();
    const payLabel  = pay === 'cod' ? 'Cash on Delivery (COD)' : pay === 'bkash' ? 'bKash' : 'Nagad';
    const trxId     = pay === 'bkash' ? ($('bkashTrxId')?.value.trim() || 'N/A')
                    : pay === 'nagad'  ? ($('nagadTrxId')?.value.trim() || 'N/A') : '';

    const name     = $('customerName')?.value.trim()    || '—';
    const phone    = $('customerPhone')?.value.trim()   || '—';
    const email    = $('customerEmail')?.value.trim()   || 'N/A';
    const district = $('customerDistrict')?.value       || '—';
    const address  = $('customerAddress')?.value.trim() || '—';
    const note     = $('orderNote')?.value.trim()       || 'N/A';

    const productLines = Object.keys(selections)
      .filter(pid => selections[pid].qty > 0)
      .map(pid => {
        const sel = selections[pid];
        const p   = KR.PRODUCTS[pid];
        return `   Product: ${p.name}\n   Size: ${sel.size || '?'} | Color: ${sel.color || '?'} | Qty: ${sel.qty}\n   Price: BDT ${fmt(p.price * sel.qty)}`;
      }).join('\n   ─────────\n');

    const discountLine  = discount > 0  ? `\nDiscount: -BDT ${fmt(discount)} (${state.couponCode})` : '';
    const advanceLine   = advance > 0   ? `\nAdvance Paid: BDT ${fmt(advance)}\nCOD Payable: BDT ${fmt(remaining)}` : `\nCOD Payable: BDT ${fmt(total)}`;
    const trxLine       = trxId ? `\nTransaction ID: ${trxId}` : '';
    const now           = orderId ? '' : new Date().toLocaleString('en-BD', { timeZone: 'Asia/Dhaka' });
    const oid           = orderId || 'DRAFT';

    return (
`Order ID: ${oid}
Date: ${now || ''}
━━━━━━━━━━━━━━━━━━━━
CUSTOMER
Name: ${name}
Phone: ${phone}
Email: ${email}
District: ${district}
Address: ${address}
━━━━━━━━━━━━━━━━━━━━
PRODUCTS
${productLines}
━━━━━━━━━━━━━━━━━━━━
PAYMENT SUMMARY
Subtotal: BDT ${fmt(subtotal)}
Delivery: ${delivery === 0 ? 'FREE' : 'BDT ' + fmt(delivery)}${discountLine}
Total: BDT ${fmt(total)}
Payment: ${payLabel}${trxLine}${advanceLine}
━━━━━━━━━━━━━━━━━━━━
Note: ${note}`
    );
  }

  function updateWALink() {
    const btn = $('waOrderBtn');
    if (!btn) return;
    const msg = buildOrderMessage();
    btn.href = `https://wa.me/${KR.WHATSAPP}?text=${encodeURIComponent(msg)}`;
  }

  /* ════════════════════════════════════════
     15. COUPON
  ════════════════════════════════════════ */
  function initCoupon() {
    $('applyCouponBtn')?.addEventListener('click', applyCoupon);
    $('couponInput')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); applyCoupon(); }
    });
  }

  function applyCoupon() {
    const code = $('couponInput')?.value.trim().toUpperCase() || '';
    const fb   = $('couponFeedback');
    const lang = state.lang;

    if (!code) {
      setFB(fb, 'error', lang === 'bn' ? 'কুপন কোড লিখুন' : 'Please enter a coupon code');
      return;
    }
    const c = KR.COUPONS[code];
    if (!c) {
      state.couponApplied = false;
      state.couponCode    = '';
      setFB(fb, 'error', lang === 'bn' ? 'অবৈধ কুপন কোড' : 'Invalid coupon code');
      updateSummary();
      return;
    }
    state.couponApplied = true;
    state.couponCode    = code;
    const { subtotal }  = calcTotals();
    const dis = c.type === 'percent' ? Math.round(subtotal * c.value / 100) : c.value;
    setFB(fb, 'success',
      lang === 'bn'
        ? `${c.value}% ছাড় প্রয়োগ হয়েছে! (-৳${fmt(dis)})`
        : `${c.value}% discount applied! (-৳${fmt(dis)})`
    );
    updateSummary();
    showIsland(
      `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`,
      lang === 'bn' ? 'কুপন প্রয়োগ হয়েছে!' : 'Coupon Applied!',
      `${c.value}% discount unlocked`, 3000
    );
  }

  function setFB(el, type, msg) {
    if (!el) return;
    el.textContent = msg;
    el.className   = 'kr-coupon-feedback is-' + type;
  }

  /* ════════════════════════════════════════
     16. PAYMENT SWITCHING
  ════════════════════════════════════════ */
  function initPayment() {
    $$('input[name="payment"]').forEach(r => {
      r.addEventListener('change', function () {
        const bp = $('bkashPanel');
        const np = $('nagadPanel');
        if (bp) bp.hidden = this.value !== 'bkash';
        if (np) np.hidden  = this.value !== 'nagad';
        updateSummary();
        krPush('add_payment_info', { dlv_payment_method: this.value, dlv_currency: 'BDT' });
      });
    });
    [$('bkashAdvance'), $('nagadAdvance')].forEach(inp => {
      inp?.addEventListener('input', updateSummary);
    });
  }

  /* ════════════════════════════════════════
     17. PHONE VALIDATION — multi-format
  ════════════════════════════════════════ */
  function normalizePhone(raw) {
    // Strip spaces, dashes, dots
    let p = raw.replace(/[\s\-\.]/g, '');
    // +880XXXXXXXXXX → 0XXXXXXXXXX
    if (p.startsWith('+880')) p = '0' + p.slice(4);
    // 880XXXXXXXXXX (without +)
    else if (p.startsWith('880') && p.length >= 13) p = '0' + p.slice(3);
    // 0088XXXXXXXXXX
    else if (p.startsWith('0088')) p = '0' + p.slice(4);
    return p;
  }

  function isValidBDPhone(raw) {
    const p = normalizePhone(raw);
    return /^(01)[3-9][0-9]{8}$/.test(p);
  }

  /* ════════════════════════════════════════
     18. FORM VALIDATION
  ════════════════════════════════════════ */
  function validate() {
    let ok   = true;
    const lang = state.lang;

    // At least 1 product with qty > 0
    const hasProduct = Object.values(selections).some(s => s.qty > 0);
    if (!hasProduct) {
      showIsland(
        `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
        lang === 'bn' ? 'পণ্য নির্বাচন করুন' : 'Select a Product',
        lang === 'bn' ? 'কমপক্ষে একটি পণ্য বাছুন' : 'Please select at least one product',
        3500
      );
      ok = false;
    }

    // Size & color for active products
    Object.keys(selections).forEach(pid => {
      const sel = selections[pid];
      if (sel.qty > 0 && (!sel.size || !sel.color)) {
        const row = document.querySelector(`.kr-co-product[data-pid="${pid}"]`);
        if (row) {
          row.style.outline = '2px solid #ef4444';
          row.style.borderRadius = '14px';
          setTimeout(() => { row.style.outline = ''; }, 2500);
        }
        ok = false;
      }
    });

    // Name
    const name = $('customerName')?.value.trim() || '';
    if (name.length < 2) {
      setErr('nameError', lang === 'bn' ? 'সঠিক নাম লিখুন' : 'Enter your name');
      $('customerName')?.classList.add('is-error');
      ok = false;
    }

    // Phone — multi-format
    const rawPhone = $('customerPhone')?.value.trim() || '';
    if (!isValidBDPhone(rawPhone)) {
      setErr('phoneError',
        lang === 'bn'
          ? 'সঠিক ফোন নম্বর দিন (01XXXXXXXXX / +880XXXXXXXXXX)'
          : 'Enter valid BD phone (01XXXXXXXXX or +880...)');
      $('customerPhone')?.classList.add('is-error');
      ok = false;
    }

    // Email (optional)
    const email = $('customerEmail')?.value.trim() || '';
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setErr('emailError', lang === 'bn' ? 'সঠিক ইমেইল দিন' : 'Invalid email address');
      $('customerEmail')?.classList.add('is-error');
      ok = false;
    }

    // District
    if (!$('customerDistrict')?.value) {
      setErr('districtError', lang === 'bn' ? 'জেলা নির্বাচন করুন' : 'Select your district');
      $('customerDistrict')?.classList.add('is-error');
      ok = false;
    }

    // Address
    const addr = $('customerAddress')?.value.trim() || '';
    if (addr.length < 10) {
      setErr('addressError',
        lang === 'bn' ? 'সম্পূর্ণ ঠিকানা লিখুন (কমপক্ষে ১০ অক্ষর)' : 'Enter full address (min 10 chars)');
      $('customerAddress')?.classList.add('is-error');
      ok = false;
    }

    // bKash/Nagad Trx ID
    const pay = getPayment();
    if (pay === 'bkash' && !$('bkashTrxId')?.value.trim()) {
      $('bkashTrxId')?.classList.add('is-error');
      ok = false;
    }
    if (pay === 'nagad' && !$('nagadTrxId')?.value.trim()) {
      $('nagadTrxId')?.classList.add('is-error');
      ok = false;
    }

    if (!ok) shake($('submitOrderBtn'));
    return ok;
  }

  function setErr(id, msg) {
    const el = $(id);
    if (el) el.textContent = msg;
  }

  function shake(el) {
    if (!el) return;
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = 'inputShake .4s cubic-bezier(.34,1.56,.64,1)';
  }

  function initLiveValidation() {
    [
      { id: 'customerName',    errId: 'nameError'     },
      { id: 'customerPhone',   errId: 'phoneError'    },
      { id: 'customerEmail',   errId: 'emailError'    },
      { id: 'customerAddress', errId: 'addressError'  }
    ].forEach(({ id, errId }) => {
      $(id)?.addEventListener('input', () => {
        $(id)?.classList.remove('is-error');
        setErr(errId, '');
      });
    });

    $('customerDistrict')?.addEventListener('change', () => {
      $('customerDistrict')?.classList.remove('is-error');
      setErr('districtError', '');
      updateSummary();
    });

    let checkoutFired = false;
    $$('#orderForm input, #orderForm textarea, #orderForm select').forEach(el => {
      el.addEventListener('focus', () => {
        if (!checkoutFired) {
          checkoutFired = true;
          krPush('begin_checkout', { dlv_currency: 'BDT' });
        }
      });
    });
  }

  /* ════════════════════════════════════════
     19. ORDER ID
  ════════════════════════════════════════ */
  function genOrderId() {
    state.orderCounter++;
    localStorage.setItem('kr_order_counter', state.orderCounter);
    const now = new Date();
    const dd  = String(now.getDate()).padStart(2, '0');
    const mm  = String(now.getMonth() + 1).padStart(2, '0');
    const yy  = now.getFullYear();
    return `KR-${String(state.orderCounter).padStart(4, '0')}-${dd}${mm}${yy}`;
  }

  /* ════════════════════════════════════════
     20. ORDER SUBMIT
  ════════════════════════════════════════ */
  function initOrderForm() {
    const form = $('orderForm');
    if (!form) return;

    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (state.isSubmitting) return;
      if (!validate()) return;

      state.isSubmitting = true;
      setLoading(true);

      try {
        const orderId  = genOrderId();
        const { subtotal, delivery, discount, advance, total, remaining } = calcTotals();
        const pay      = getPayment();
        const trxId    = pay === 'bkash' ? ($('bkashTrxId')?.value.trim() || '')
                       : pay === 'nagad'  ? ($('nagadTrxId')?.value.trim()  || '') : '';

        const rawPhone = $('customerPhone').value.trim();
        const phone    = normalizePhone(rawPhone);

        const productStr = Object.keys(selections)
          .filter(pid => selections[pid].qty > 0)
          .map(pid => {
            const sel = selections[pid];
            const p   = KR.PRODUCTS[pid];
            return `${p.name}(${sel.size}/${sel.color}x${sel.qty})`;
          }).join(' + ');

        const totalQty = Object.values(selections).reduce((s, sel) => s + (sel.qty || 0), 0);
        const firstPid = Object.keys(selections).find(pid => selections[pid].qty > 0) || '1';
        const firstSel = selections[firstPid];
        const firstP   = KR.PRODUCTS[firstPid];

        const orderData = {
          orderId,
          date:     new Date().toLocaleString('en-BD', { timeZone: 'Asia/Dhaka' }),
          name:     $('customerName').value.trim(),
          phone,
          email:    $('customerEmail')?.value.trim() || '',
          district: $('customerDistrict').value,
          address:  $('customerAddress').value.trim(),
          products: productStr,
          qty:      totalQty,
          subtotal, shipping: delivery, discount,
          coupon:   state.couponCode,
          total, payment: pay, trxId, advance,
          note:     $('orderNote')?.value.trim() || '',
          // For success page
          productName: firstP.name, productId: firstP.id,
          category:    firstP.category,
          size:        firstSel.size, color: firstSel.color,
          remaining
        };

        // Send in parallel — fail gracefully
        await Promise.allSettled([
          sendToSheets(orderData),
          sendToTelegram(orderData)
        ]);

        // GTM
        krPush('purchase', {
          dlv_order_id:       orderId,
          dlv_value:          total,
          dlv_currency:       'BDT',
          dlv_item_name:      productStr,
          dlv_quantity:       totalQty,
          dlv_shipping:       delivery,
          dlv_discount:       discount,
          dlv_coupon:         state.couponCode,
          dlv_payment_method: pay,
          dlv_customer_district: $('customerDistrict').value
        });

        localStorage.setItem('kr_last_order', JSON.stringify(orderData));
        setSuccess();
        setTimeout(() => { window.location.href = `success.html?id=${orderId}`; }, 1200);

      } catch (err) {
        console.error('[KR]', err);
        state.isSubmitting = false;
        setLoading(false);
        showIsland(
          `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
          'Something went wrong!',
          'Please try again or WhatsApp us', 5000
        );
      }
    });
  }

  function setLoading(on) {
    const btn = $('submitOrderBtn');
    if (!btn) return;
    const di = btn.querySelector('.kr-submit-icon--default');
    const li = btn.querySelector('.kr-submit-icon--loading');
    const tx = btn.querySelector('.kr-submit-text');
    btn.classList.toggle('is-loading', on);
    btn.disabled = on;
    if (di) di.style.display = on ? 'none'  : 'block';
    if (li) li.style.display = on ? 'block' : 'none';
    if (tx) tx.textContent = on
      ? (state.lang === 'bn' ? 'পাঠানো হচ্ছে...' : 'Sending...')
      : (state.lang === 'bn' ? 'অর্ডার কনফার্ম করুন' : 'Confirm Order');
    if (on) btn.classList.remove('kr-btn--confirm-shake');
  }

  function setSuccess() {
    const btn = $('submitOrderBtn');
    if (!btn) return;
    const li = btn.querySelector('.kr-submit-icon--loading');
    const tx = btn.querySelector('.kr-submit-text');
    btn.classList.remove('is-loading', 'kr-btn--confirm-shake');
    btn.classList.add('is-success');
    if (li) li.style.display = 'none';
    if (tx) tx.textContent = state.lang === 'bn' ? 'অর্ডার সফল!' : 'Order Placed!';
    showIsland(
      `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`,
      state.lang === 'bn' ? 'অর্ডার সফল!' : 'Order Confirmed!',
      state.lang === 'bn' ? 'ধন্যবাদ! শীঘ্রই কল করা হবে।' : "Thank you! We'll call you soon.",
      5000
    );
  }

  /* ════════════════════════════════════════
     21. GOOGLE SHEETS
  ════════════════════════════════════════ */
  async function sendToSheets(d) {
    const body = JSON.stringify({
      orderId:  d.orderId,  date:     d.date,
      name:     d.name,     phone:    d.phone,
      email:    d.email,    district: d.district,
      address:  d.address,  products: d.products,
      qty:      d.qty,      subtotal: d.subtotal,
      shipping: d.shipping, discount: d.discount,
      coupon:   d.coupon,   total:    d.total,
      payment:  d.payment,  trxId:    d.trxId,
      advance:  d.advance
    });
    const res = await fetch(KR.SHEETS_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'text/plain' },
      body
    });
    return res.json();
  }

  /* ════════════════════════════════════════
     22. TELEGRAM — same format as WhatsApp
  ════════════════════════════════════════ */
  async function sendToTelegram(d) {
    const pay = d.payment;
    const payLabel = pay === 'cod'   ? 'Cash on Delivery (COD)'
                   : pay === 'bkash' ? `bKash | TrxID: ${d.trxId || 'N/A'}`
                   :                   `Nagad | TrxID: ${d.trxId || 'N/A'}`;
    const discountLine = d.discount > 0 ? `\nDiscount: -BDT ${fmt(d.discount)} (${d.coupon})` : '';
    const advanceLine  = d.advance  > 0
      ? `\nAdvance Paid: BDT ${fmt(d.advance)}\nCOD Payable: BDT ${fmt(d.remaining)}`
      : `\nCOD Payable: BDT ${fmt(d.total)}`;

    const msg =
`New Order Received!
━━━━━━━━━━━━━━━━━━━━
Order ID: ${d.orderId}
Date: ${d.date}
━━━━━━━━━━━━━━━━━━━━
CUSTOMER
Name: ${d.name}
Phone: ${d.phone}
Email: ${d.email || 'N/A'}
District: ${d.district}
Address: ${d.address}
━━━━━━━━━━━━━━━━━━━━
PRODUCTS
${d.products}
Total Qty: ${d.qty}
━━━━━━━━━━━━━━━━━━━━
PAYMENT SUMMARY
Subtotal: BDT ${fmt(d.subtotal)}
Delivery: ${d.shipping === 0 ? 'FREE' : 'BDT ' + fmt(d.shipping)}${discountLine}
Total: BDT ${fmt(d.total)}
Payment: ${payLabel}${advanceLine}
━━━━━━━━━━━━━━━━━━━━
Note: ${d.note || 'N/A'}
Saved to Google Sheets`;

    const res = await fetch(
      `https://api.telegram.org/bot${KR.TELEGRAM_TOKEN}/sendMessage`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          chat_id:    KR.TELEGRAM_CHAT,
          text:       msg,
          parse_mode: 'HTML'
        })
      }
    );
    return res.json();
  }

  /* ════════════════════════════════════════
     23. SIZE CHART POPUP
  ════════════════════════════════════════ */
  function initSizeChart() {
    const overlay = $('sizeChartOverlay');
    const closeBtn = $('sizeChartClose');

    $$('.kr-size-chart-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        // Render table based on first active product, else product 1
        const activePid = Object.keys(selections).find(pid => selections[pid].qty > 0) || '1';
        renderSizeChart(parseInt(activePid));
        if (overlay) { overlay.removeAttribute('hidden'); overlay.classList.add('is-active'); }
        document.body.style.overflow = 'hidden';
      });
    });

    if (closeBtn) {
      closeBtn.addEventListener('click', closeSizeChart);
    }
    if (overlay) {
      overlay.addEventListener('click', e => {
        if (e.target === overlay) closeSizeChart();
      });
    }
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeSizeChart();
    });
  }

  function closeSizeChart() {
    const overlay = $('sizeChartOverlay');
    if (overlay) { overlay.classList.remove('is-active'); overlay.setAttribute('hidden', ''); }
    document.body.style.overflow = '';
  }

  function renderSizeChart(pid) {
    const p       = KR.PRODUCTS[pid];
    const lang    = state.lang;
    const titleEl = $('sizeChartTitle');
    const bodyEl  = $('sizeChartBody');
    if (titleEl) titleEl.textContent = lang === 'bn' ? `${p.nameBn} — সাইজ চার্ট` : `${p.name} — Size Chart`;
    if (bodyEl && p.sizeChart) {
      bodyEl.innerHTML = `
        <table class="kr-size-table">
          <thead>
            <tr>
              <th>${lang === 'bn' ? 'সাইজ' : 'Size'}</th>
              <th>${lang === 'bn' ? 'বুকের মাপ' : 'Chest'}</th>
              <th>${lang === 'bn' ? 'দৈর্ঘ্য' : 'Length'}</th>
              <th>${lang === 'bn' ? 'হাতা' : 'Sleeve'}</th>
            </tr>
          </thead>
          <tbody>
            ${p.sizeChart.map(row => `
              <tr>
                <td><strong>${row.size}</strong></td>
                <td>${row.chest}</td>
                <td>${row.length}</td>
                <td>${row.sleeve}</td>
              </tr>`).join('')}
          </tbody>
        </table>
        <p style="font-size:.75rem;color:var(--text-muted);margin-top:.75rem;text-align:center">
          ${lang === 'bn' ? 'সব মাপ ইঞ্চিতে। সন্দেহ হলে এক সাইজ বড় নিন।' : 'All measurements in inches. When in doubt, size up.'}
        </p>`;
    }
  }

  /* ════════════════════════════════════════
     24. GTM
  ════════════════════════════════════════ */
  function krPush(ev, data) {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: ev, ...data });
  }

  /* ════════════════════════════════════════
     25. FAQ
  ════════════════════════════════════════ */
  function initFAQ() {
    $$('.kr-faq-item').forEach(item => {
      const btn = item.querySelector('.kr-faq-item__q');
      if (!btn) return;
      btn.addEventListener('click', () => {
        const open = item.classList.contains('is-open');
        $$('.kr-faq-item').forEach(i => {
          i.classList.remove('is-open');
          i.querySelector('.kr-faq-item__q')?.setAttribute('aria-expanded', 'false');
        });
        if (!open) {
          item.classList.add('is-open');
          btn.setAttribute('aria-expanded', 'true');
        }
      });
    });
  }

  /* ════════════════════════════════════════
     26. SCROLL ANIMATIONS — both directions
  ════════════════════════════════════════ */
  function initScrollAnimations() {
    const els = $$('.anim-fade-up, .anim-fade-left, .anim-scale-in');
    if (!els.length) return;
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('is-visible');
        } else {
          if (!e.target.closest('.kr-hero')) {
            e.target.classList.remove('is-visible');
          }
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -30px 0px' });
    els.forEach(el => obs.observe(el));
  }

  /* ════════════════════════════════════════
     27. COUNT-UP
  ════════════════════════════════════════ */
  function initCountUp() {
    const els = $$('[data-count]');
    if (!els.length) return;
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        const el     = e.target;
        const target = parseInt(el.getAttribute('data-count')) || 0;
        const dur    = 1800;
        const start  = performance.now();
        const step   = now => {
          const p  = Math.min((now - start) / dur, 1);
          const ep = 1 - Math.pow(1 - p, 3);
          el.textContent = Math.floor(ep * target).toLocaleString('en-IN');
          if (p < 1) requestAnimationFrame(step);
          else el.textContent = target.toLocaleString('en-IN');
        };
        requestAnimationFrame(step);
        obs.unobserve(el);
      });
    }, { threshold: 0.5 });
    els.forEach(el => obs.observe(el));
  }

  /* ════════════════════════════════════════
     28. SMOOTH SCROLL
  ════════════════════════════════════════ */
  function initSmoothScroll() {
    $$('a[href^="#"]').forEach(a => {
      a.addEventListener('click', e => {
        const href = a.getAttribute('href');
        if (!href || href === '#') return;
        const target = document.querySelector(href);
        if (!target) return;
        e.preventDefault();
        const navH = $('kr-navbar')?.offsetHeight || 70;
        const top  = target.getBoundingClientRect().top + window.scrollY - navH - 16;
        window.scrollTo({ top, behavior: 'smooth' });
      });
    });
  }

  /* ════════════════════════════════════════
     29. INIT
  ════════════════════════════════════════ */
  function init() {
    initTheme();
    initLang();
    initAnnouncement();
    initNavbar();
    initGallery();
    initIsland();

    buildCarousel();
    buildCheckoutProducts();

    initCoupon();
    initPayment();
    initLiveValidation();
    initOrderForm();
    initSizeChart();
    initFAQ();
    initScrollAnimations();
    initCountUp();
    initSmoothScroll();

    if (typeof lucide !== 'undefined') lucide.createIcons();

    $('themeToggle')?.addEventListener('click', () =>
      setTheme(state.theme === 'dark' ? 'light' : 'dark')
    );
    $('langToggle')?.addEventListener('click', () =>
      setLang(state.lang === 'bn' ? 'en' : 'bn')
    );

    $('customerDistrict')?.addEventListener('change', updateSummary);

    updateSummary();
    setTimeout(() => krPush('view_item', { dlv_page_type: 'landing', dlv_currency: 'BDT' }), 500);

    console.log('[KR] v3 initialized');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
