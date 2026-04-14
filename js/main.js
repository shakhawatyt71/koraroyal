/**
 * KORA ROYAL — main.js
 * UI Logic Only (IIFE pattern)
 * Depends on: integrations.js (must load first)
 */

(function () {
  'use strict';

  /* ============================================================
     STATE
     ============================================================ */
  const state = {
    theme:            'light',
    lang:             'en',
    couponCode:       '',
    couponApplied:    false,
    discountPct:      0,
    isSubmitting:     false,
    carouselDragging: false,
    carouselStartX:   0,
    carouselScrollLeft:0,
    paymentMethod:    'COD',
    currentHeroPid:   1,
    heroAutoTimer:    null,
    heroZoomTimer:    null,
    checkoutObserved: false,
    beginCheckoutFired: false
  };

  // Checkout instances: flat array of { instanceId, pid, size, color, qty }
  let checkoutInstances = [];

  // Init with one base instance per product
  function initCheckoutInstances() {
    checkoutInstances = Object.keys(KR.PRODUCTS).map(pid => ({
      instanceId: `base_${pid}`,
      pid: parseInt(pid),
      size:  '',
      color: '',
      qty:   0
    }));
  }

  /* ============================================================
     HELPERS
     ============================================================ */
  function t(el, key_en, key_bn) {
    if (!el) return;
    const lang = document.documentElement.getAttribute('data-lang') || 'en';
    el.textContent = lang === 'bn' ? (key_bn || key_en) : key_en;
  }

  function getLang()  { return document.documentElement.getAttribute('data-lang') || 'en'; }
  function getTheme() { return document.documentElement.getAttribute('data-theme') || 'light'; }

  function fmtPrice(n) { return '৳' + Number(n).toLocaleString('en-BD'); }

  function getProductName(product) {
    return getLang() === 'bn' ? product.name_bn : product.name_en;
  }

  function getColorName(product, colorId) {
    const c = product.colors.find(x => x.id === colorId);
    if (!c) return colorId;
    return getLang() === 'bn' ? c.name_bn : c.name_en;
  }

  /* ============================================================
     1. THEME
     ============================================================ */
  function initTheme() {
    const saved = localStorage.getItem('kr_theme') || 'light';
    setTheme(saved, false);
  }

  function setTheme(t, save) {
    state.theme = t;
    document.documentElement.setAttribute('data-theme', t);
    if (save) localStorage.setItem('kr_theme', t);

    // Toggle icon visibility
    const iconLight = document.querySelector('#krThemeToggle .icon-light');
    const iconDark  = document.querySelector('#krThemeToggle .icon-dark');
    if (iconLight && iconDark) {
      iconLight.style.display = t === 'light' ? 'block' : 'none';
      iconDark.style.display  = t === 'dark'  ? 'block' : 'none';
    }

    // Logo swap with fade
    swapLogos(t);
  }

  function swapLogos(theme) {
    const logoLight = document.getElementById('krLogoLight');
    const logoDark  = document.getElementById('krLogoDark');
    const footer    = document.getElementById('krFooterLogo');

    if (logoLight) {
      logoLight.classList.add('logo-fade');
      logoLight.src = KR.LOGOS.light;
      setTimeout(() => logoLight.classList.remove('logo-fade'), 300);
    }
    if (logoDark) {
      logoDark.classList.add('logo-fade');
      logoDark.src = KR.LOGOS.dark;
      setTimeout(() => logoDark.classList.remove('logo-fade'), 300);
    }
    if (footer) footer.src = KR.LOGOS.footer;
  }

  /* ============================================================
     2. LANGUAGE
     ============================================================ */
  function initLang() {
    const saved = localStorage.getItem('kr_lang') || 'en';
    setLang(saved, false);
  }

  function setLang(lang, save) {
    state.lang = lang;
    document.documentElement.setAttribute('data-lang', lang);
    if (save) localStorage.setItem('kr_lang', lang);

    // Update lang toggle button
    const btn = document.getElementById('krLangToggle');
    if (btn) btn.textContent = lang === 'bn' ? 'BN' : 'EN';

    // Update all data-en/data-bn elements
    document.querySelectorAll('[data-en]').forEach(el => {
      const val = el.getAttribute('data-' + lang);
      if (val) el.textContent = val;
    });

    // Update all placeholders
    document.querySelectorAll('[data-placeholder-en]').forEach(el => {
      const val = el.getAttribute('data-placeholder-' + lang);
      if (val) el.placeholder = val;
    });

    // Rebuild dynamic sections
    buildCarousel();
    buildCheckoutProducts();
    updateSummary();
    refreshWALink();
  }

  /* ============================================================
     3. ANNOUNCEMENT BAR
     ============================================================ */
  function initAnnouncement() {
    const bar   = document.getElementById('kr-announcement');
    const close = document.getElementById('krAnnounceClose');
    if (!bar) return;

    if (localStorage.getItem('kr_announce_closed') === '1') {
      bar.style.display = 'none';
      return;
    }

    if (close) {
      close.addEventListener('click', () => {
        bar.style.display = 'none';
        localStorage.setItem('kr_announce_closed', '1');
      });
    }
  }

  /* ============================================================
     4. NAVBAR
     ============================================================ */
  function initNavbar() {
    const navbar    = document.getElementById('kr-navbar');
    const hamburger = document.getElementById('krHamburger');
    const mobileMenu= document.getElementById('kr-mobile-menu');

    // Scroll → .is-scrolled
    window.addEventListener('scroll', () => {
      if (!navbar) return;
      if (window.scrollY > 20) {
        navbar.classList.add('is-scrolled');
      } else {
        navbar.classList.remove('is-scrolled');
      }
    }, { passive: true });

    // Hamburger
    if (hamburger && mobileMenu) {
      hamburger.addEventListener('click', () => {
        const open = mobileMenu.classList.toggle('is-open');
        hamburger.classList.toggle('is-open', open);
        hamburger.setAttribute('aria-expanded', open ? 'true' : 'false');
      });

      // Close on mobile link click
      mobileMenu.querySelectorAll('a').forEach(a => {
        a.addEventListener('click', () => {
          mobileMenu.classList.remove('is-open');
          hamburger.classList.remove('is-open');
          hamburger.setAttribute('aria-expanded', 'false');
        });
      });
    }

    // Theme toggle
    const themeBtn = document.getElementById('krThemeToggle');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        const next = getTheme() === 'light' ? 'dark' : 'light';
        setTheme(next, true);
      });
    }

    // Language toggle
    const langBtn = document.getElementById('krLangToggle');
    if (langBtn) {
      langBtn.addEventListener('click', () => {
        const next = getLang() === 'en' ? 'bn' : 'en';
        setLang(next, true);
      });
    }
  }

  /* ============================================================
     5. DYNAMIC ISLAND
     ============================================================ */
  let islandTimer = null;

  function showIsland(type, title, body, duration) {
    const island  = document.getElementById('kr-island');
    const iconEl  = document.getElementById('krIslandIcon');
    const titleEl = document.getElementById('krIslandTitle');
    const bodyEl  = document.getElementById('krIslandBody');
    if (!island) return;

    // Icons per type
    const icons = {
      success: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
      error:   '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
      offer:   '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>',
      info:    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
    };

    iconEl.className = `kr-island-icon kr-island-icon--${type}`;
    iconEl.innerHTML = icons[type] || icons.info;
    titleEl.textContent = title;
    bodyEl.textContent  = body;

    island.classList.add('is-visible');

    if (islandTimer) clearTimeout(islandTimer);
    islandTimer = setTimeout(() => {
      island.classList.remove('is-visible');
    }, duration || 3500);
  }

  const islandMessages = [
    { type: 'offer',   title: '10% Off Today!',        body: 'Use code KORA10 at checkout' },
    { type: 'info',    title: 'Free Delivery',          body: 'On orders above ৳2999' },
    { type: 'success', title: '491+ Happy Customers',   body: 'Join the KORA ROYAL family' },
    { type: 'offer',   title: 'New Coupon: APNALOK20',  body: '20% off on your order' },
    { type: 'info',    title: 'COD Available',          body: 'Cash on Delivery across Bangladesh' }
  ];
  const islandMessagesBn = [
    { type: 'offer',   title: 'আজ ১০% ছাড়!',           body: 'চেকআউটে KORA10 ব্যবহার করুন' },
    { type: 'info',    title: 'ফ্রি ডেলিভারি',          body: '৳২৯৯৯-এর বেশি অর্ডারে' },
    { type: 'success', title: '৪৯১+ সন্তুষ্ট গ্রাহক',   body: 'করা রয়্যাল পরিবারে যোগ দিন' },
    { type: 'offer',   title: 'নতুন কুপন: APNALOK20',   body: 'আপনার অর্ডারে ২০% ছাড়' },
    { type: 'info',    title: 'COD পাওয়া যাচ্ছে',       body: 'সারা বাংলাদেশে ক্যাশ অন ডেলিভারি' }
  ];

  let islandMsgIdx = 0;
  function initIsland() {
    setTimeout(() => rotateIsland(), 3000);
  }

  function rotateIsland() {
    const msgs = getLang() === 'bn' ? islandMessagesBn : islandMessages;
    const m    = msgs[islandMsgIdx % msgs.length];
    showIsland(m.type, m.title, m.body, 3000);
    islandMsgIdx++;
    setTimeout(rotateIsland, 45000);
  }

  /* ============================================================
     6. HERO GALLERY
     ============================================================ */
  function initGallery() {
    const products = Object.values(KR.PRODUCTS);
    const thumbsEl = document.getElementById('krHeroThumbs');
    const mainWrap = document.getElementById('krHeroMainImg');
    const mainImg  = document.getElementById('krHeroMainImgEl');
    if (!thumbsEl || !mainImg) return;

    // Build thumbnails
    thumbsEl.innerHTML = '';
    products.forEach((p, i) => {
      const btn = document.createElement('button');
      btn.className   = 'kr-hero-thumb' + (i === 0 ? ' is-active' : '');
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-label', getProductName(p));
      btn.setAttribute('data-pid', p.id);
      btn.innerHTML = `<img src="${p.imageUrl}" alt="${getProductName(p)}" loading="lazy" />`;
      btn.addEventListener('click', () => selectHeroProduct(p.id));
      thumbsEl.appendChild(btn);
    });

    // Set initial product
    selectHeroProduct(1, false);

    // Auto-slide
    startHeroAutoSlide();

    // Touch swipe
    let touchStartX = 0;
    mainWrap.addEventListener('touchstart', e => {
      touchStartX = e.touches[0].clientX;
    }, { passive: true });
    mainWrap.addEventListener('touchend', e => {
      const diff = touchStartX - e.changedTouches[0].clientX;
      if (Math.abs(diff) > 40) {
        const pids = products.map(p => p.id);
        const cur  = pids.indexOf(state.currentHeroPid);
        if (diff > 0) {
          selectHeroProduct(pids[(cur + 1) % pids.length]);
        } else {
          selectHeroProduct(pids[(cur - 1 + pids.length) % pids.length]);
        }
      }
    });

    // Click/hover → zoom + popup
    mainWrap.addEventListener('mouseenter', () => {
      mainWrap.classList.add('is-zoomed');
      pauseHeroAutoSlide();
      state.heroZoomTimer = setTimeout(() => {
        mainWrap.classList.remove('is-zoomed');
        startHeroAutoSlide();
      }, 10000);
    });
    mainWrap.addEventListener('mouseleave', () => {
      mainWrap.classList.remove('is-zoomed');
      if (state.heroZoomTimer) clearTimeout(state.heroZoomTimer);
      startHeroAutoSlide();
    });
    mainWrap.addEventListener('click', e => {
      if (e.target.closest('.kr-hero-select-btn')) return;
      mainWrap.classList.toggle('is-zoomed');
      pauseHeroAutoSlide();
      if (state.heroZoomTimer) clearTimeout(state.heroZoomTimer);
      state.heroZoomTimer = setTimeout(() => {
        mainWrap.classList.remove('is-zoomed');
        startHeroAutoSlide();
      }, 10000);
    });

    // Select this button
    const selectBtn = document.getElementById('krHeroSelectBtn');
    if (selectBtn) {
      selectBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const pid = parseInt(mainWrap.getAttribute('data-pid'));
        handleSelectFromHero(pid);
      });
    }

    // IntersectionObserver for view_item
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const pid = parseInt(mainWrap.getAttribute('data-pid'));
          const p   = KR.PRODUCTS[pid];
          if (p) pushViewItem(p);
        }
      });
    }, { threshold: 0.5 });
    observer.observe(mainWrap);
  }

  function selectHeroProduct(pid, animate) {
    const products = Object.values(KR.PRODUCTS);
    const product  = KR.PRODUCTS[pid];
    if (!product) return;

    state.currentHeroPid = pid;

    const mainImg  = document.getElementById('krHeroMainImgEl');
    const mainWrap = document.getElementById('krHeroMainImg');
    const selectBtn= document.getElementById('krHeroSelectBtn');
    const popupName = document.getElementById('krHeroPopupName');
    const popupPrice= document.getElementById('krHeroPopupPrice');
    const popupRating=document.getElementById('krHeroPopupRating');

    // rotateY animation
    if (mainImg && animate !== false) {
      mainImg.style.transform = 'rotateY(90deg)';
      setTimeout(() => {
        mainImg.src = product.imageUrl;
        mainImg.alt = getProductName(product);
        mainImg.style.transform = 'rotateY(0deg)';
        mainImg.style.transition = 'transform 0.35s ease';
      }, 200);
    } else if (mainImg) {
      mainImg.src = product.imageUrl;
      mainImg.alt = getProductName(product);
    }

    if (mainWrap) mainWrap.setAttribute('data-pid', pid);
    if (selectBtn) selectBtn.setAttribute('data-pid', pid);

    // Update popup
    if (popupName)  popupName.textContent  = getProductName(product);
    if (popupPrice) popupPrice.textContent  = fmtPrice(product.price);
    if (popupRating) {
      popupRating.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="#FFB800" stroke="#FFB800" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> ${product.rating} · ${product.soldCount} sold`;
    }

    // Thumbnails
    document.querySelectorAll('.kr-hero-thumb').forEach(btn => {
      btn.classList.toggle('is-active', parseInt(btn.getAttribute('data-pid')) === pid);
    });

    // Fire view_item
    pushViewItem(product);
  }

  function startHeroAutoSlide() {
    pauseHeroAutoSlide();
    const products = Object.values(KR.PRODUCTS);
    state.heroAutoTimer = setInterval(() => {
      const pids = products.map(p => p.id);
      const cur  = pids.indexOf(state.currentHeroPid);
      const next = pids[(cur + 1) % pids.length];
      selectHeroProduct(next);
    }, 4000);
  }

  function pauseHeroAutoSlide() {
    if (state.heroAutoTimer) {
      clearInterval(state.heroAutoTimer);
      state.heroAutoTimer = null;
    }
  }

  function handleSelectFromHero(pid) {
    const product = KR.PRODUCTS[pid];
    if (!product) return;

    // Find base instance for this product
    const inst = checkoutInstances.find(i => i.pid === pid && i.instanceId === `base_${pid}`);
    if (inst) {
      if (inst.qty === 0) inst.qty = 1;
      else inst.qty++;
    }

    pushAddToCart(product, inst ? inst.qty : 1, inst ? inst.size : '', inst ? inst.color : '');
    buildCheckoutProducts();
    updateSummary();
    refreshWALink();

    // Scroll to form
    const form = document.getElementById('kr-order-form');
    if (form) form.scrollIntoView({ behavior: 'smooth', block: 'start' });

    showIsland('success',
      getLang() === 'bn' ? 'পণ্য যোগ করা হয়েছে' : 'Added to Order',
      getLang() === 'bn' ? getProductName(product) + ' বেছে নেওয়া হয়েছে' : getProductName(product) + ' selected'
    );
  }

  /* ============================================================
     7. CAROUSEL (Infinite gallery)
     ============================================================ */
  function buildCarousel() {
    const track = document.getElementById('krCarouselTrack');
    if (!track) return;

    // Merge product images + gallery images
    const allImages = [
      ...Object.values(KR.PRODUCTS).map(p => ({
        imageUrl:  p.imageUrl,
        name:      getProductName(p),
        price:     p.price,
        rating:    p.rating,
        soldCount: p.soldCount,
        pid:       p.id
      })),
      ...KR.GALLERY_IMAGES.map((url, i) => ({
        imageUrl:  url,
        name:      getLang() === 'bn' ? 'করা রয়্যাল কালেকশন' : 'KORA ROYAL Collection',
        price:     null,
        rating:    null,
        soldCount: null,
        pid:       null
      }))
    ];

    // x2 for infinite loop
    const doubled = [...allImages, ...allImages];
    track.innerHTML = doubled.map((item, i) => `
      <div class="kr-carousel-card" data-pid="${item.pid || ''}" style="animation-delay:0s;">
        <img class="kr-carousel-card-img" src="${item.imageUrl}" alt="${item.name}" loading="lazy" />
        <div class="kr-carousel-card-info">
          <div class="kr-carousel-card-name">${item.name}</div>
          <div class="kr-carousel-card-meta">
            ${item.rating ? `<span style="color:var(--text-muted);font-size:0.75rem;">
              <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="#FFB800" stroke="#FFB800" stroke-width="2" style="display:inline;vertical-align:middle;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
              ${item.rating} · ${item.soldCount} ${getLang() === 'bn' ? 'বিক্রি' : 'sold'}</span>` : '<span></span>'}
            ${item.price ? `<span class="kr-carousel-card-price">${fmtPrice(item.price)}</span>` : ''}
          </div>
        </div>
      </div>
    `).join('');

    // Click on product card
    track.querySelectorAll('.kr-carousel-card[data-pid]').forEach(card => {
      const pid = parseInt(card.getAttribute('data-pid'));
      if (!pid) return;
      card.addEventListener('click', () => {
        handleSelectFromHero(pid);
      });
    });
  }

  function initCarouselDrag() {
    const viewport = document.getElementById('krCarouselViewport');
    const track    = document.getElementById('krCarouselTrack');
    if (!viewport || !track) return;

    // Hover pause
    viewport.addEventListener('mouseenter', () => track.classList.add('is-paused'));
    viewport.addEventListener('mouseleave', () => {
      if (!state.carouselDragging) track.classList.remove('is-paused');
    });

    // Mouse drag
    viewport.addEventListener('mousedown', e => {
      state.carouselDragging  = true;
      state.carouselStartX    = e.pageX - viewport.offsetLeft;
      state.carouselScrollLeft= viewport.scrollLeft;
      track.classList.add('is-paused');
      viewport.style.cursor   = 'grabbing';
    });
    viewport.addEventListener('mouseleave', () => {
      if (state.carouselDragging) {
        state.carouselDragging = false;
        track.classList.remove('is-paused');
        viewport.style.cursor  = 'grab';
      }
    });
    viewport.addEventListener('mouseup', () => {
      state.carouselDragging = false;
      track.classList.remove('is-paused');
      viewport.style.cursor  = 'grab';
    });
    viewport.addEventListener('mousemove', e => {
      if (!state.carouselDragging) return;
      e.preventDefault();
      const x    = e.pageX - viewport.offsetLeft;
      const walk = (x - state.carouselStartX) * 1.5;
      viewport.scrollLeft = state.carouselScrollLeft - walk;
    });

    // Touch drag
    let touchStart = 0;
    viewport.addEventListener('touchstart', e => {
      touchStart = e.touches[0].clientX;
      track.classList.add('is-paused');
    }, { passive: true });
    viewport.addEventListener('touchend', () => {
      track.classList.remove('is-paused');
    });
    viewport.addEventListener('touchmove', e => {
      const diff = touchStart - e.touches[0].clientX;
      viewport.scrollLeft += diff * 0.5;
      touchStart = e.touches[0].clientX;
    }, { passive: true });
  }

  /* ============================================================
     8. DISTRICT DROPDOWN
     ============================================================ */
  function initDistrict() {
  const trigger  = document.getElementById('krDistrictTrigger');
  const dropdown = document.getElementById('krDistrictDropdown');
  const list     = document.getElementById('krDistrictList');
  const search   = document.getElementById('krDistrictSearch');
  const hidden   = document.getElementById('krDistrictVal');
  const display  = document.getElementById('krDistrictDisplay');
  if (!trigger || !dropdown || !list) return;

  // ✅ search element টা input নিজে নাকি container সেটা একবারই বের করো
  const searchInp = search
    ? (search.tagName === 'INPUT' ? search : search.querySelector('input'))
    : null;

  // Build list
  function buildList(filter) {
    list.innerHTML = KR.DISTRICTS
      .filter(d => !filter || d.toLowerCase().includes(filter.toLowerCase()))
      .map(d => `<div class="kr-district-option" data-val="${d}" role="option">${d}</div>`)
      .join('');

    list.querySelectorAll('.kr-district-option').forEach(opt => {
      opt.addEventListener('click', () => {
        const val = opt.getAttribute('data-val');
        hidden.value = val;
        display.textContent = val;
        display.style.color = 'var(--text-primary)';
        dropdown.classList.remove('is-open');
        trigger.classList.remove('is-open');
        trigger.setAttribute('aria-expanded', 'false');
        list.querySelectorAll('.kr-district-option').forEach(o => o.classList.remove('is-selected'));
        opt.classList.add('is-selected');
        // ✅ Search box clear করো select করার পর
        if (searchInp) {
          searchInp.value = '';
          buildList('');
        }
        updateSummary();
        refreshWALink();
        const field = document.getElementById('fieldDistrict');
        if (field) field.classList.remove('is-error');
      });
    });
  }
  buildList('');

  // Toggle open
  trigger.addEventListener('click', () => {
    const open = dropdown.classList.toggle('is-open');
    trigger.classList.toggle('is-open', open);
    trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
    // ✅ Open হলে search এ focus
    if (open && searchInp) {
      setTimeout(() => searchInp.focus(), 50);
    }
  });

  // ✅ Search filter - এখন কাজ করবে
  if (searchInp) {
    searchInp.addEventListener('input', () => buildList(searchInp.value));
  }

  // Close on outside click
  document.addEventListener('click', e => {
    if (!trigger.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.classList.remove('is-open');
      trigger.classList.remove('is-open');
      trigger.setAttribute('aria-expanded', 'false');
    }
  });
}

  /* ============================================================
     9. CHECKOUT PRODUCT ROWS
     ============================================================ */
  function buildCheckoutProducts() {
    const container = document.getElementById('krCoList');
    if (!container) return;
    container.innerHTML = '';

    // Group instances by pid
    const byPid = {};
    checkoutInstances.forEach(inst => {
      if (!byPid[inst.pid]) byPid[inst.pid] = [];
      byPid[inst.pid].push(inst);
    });

    Object.keys(byPid).forEach(pid => {
      const product   = KR.PRODUCTS[pid];
      const instances = byPid[pid];
      if (!product) return;

      instances.forEach((inst, idx) => {
        const isBase = inst.instanceId === `base_${pid}`;
        const el = document.createElement('div');
        el.className = `kr-co-row${inst.qty > 0 ? ' is-active' : ''}`;
        el.setAttribute('data-instance', inst.instanceId);

        // Color buttons HTML
        const colorBtns = product.colors.map(c => {
          const isSelected = inst.color === c.id;
          const cls = `kr-color-${c.id}`;
          return `<button class="kr-color-btn ${cls}${isSelected ? ' is-selected' : ''}" 
                    data-color="${c.id}" 
                    data-instance="${inst.instanceId}"
                    title="${getLang() === 'bn' ? c.name_bn : c.name_en}"
                    aria-label="${getLang() === 'bn' ? c.name_bn : c.name_en}"
                    aria-pressed="${isSelected}"></button>`;
        }).join('');

        // Size buttons HTML
        const sizeBtns = product.sizes.map(s => {
          const isSelected = inst.size === s;
          return `<button class="kr-size-btn${isSelected ? ' is-selected' : ''}" 
                    data-size="${s}" 
                    data-instance="${inst.instanceId}"
                    aria-pressed="${isSelected}">${s}</button>`;
        }).join('');

        const subtotal = product.price * inst.qty;
        const lang     = getLang();

        el.innerHTML = `
          <div class="kr-co-row-header">
            <img class="kr-co-thumb" src="${product.imageUrl}" alt="${getProductName(product)}" loading="lazy" />
            <div class="kr-co-info">
              <div class="kr-co-name">${isBase
                ? getProductName(product)
                : `${getProductName(product)} — ${lang === 'bn' ? 'ভ্যারিয়েন্ট ' : 'Variant '} ${idx + 1}`
              }</div>
              <div class="kr-co-price">${fmtPrice(product.price)}</div>
            </div>
            <button class="kr-co-sizechart-btn" data-pid="${pid}">
              ${lang === 'bn' ? 'সাইজ চার্ট' : 'Size Chart'}
            </button>
            ${!isBase ? `
              <button class="kr-co-instance-remove" data-instance="${inst.instanceId}" title="Remove variant">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>` : ''}
          </div>
          <div class="kr-co-controls">
            <div>
              <span class="kr-size-label">${lang === 'bn' ? 'সাইজ বেছে নিন' : 'Select Size'}</span>
              <div class="kr-size-buttons">${sizeBtns}</div>
            </div>
            <div>
              <span class="kr-color-label">${lang === 'bn' ? 'রং বেছে নিন' : 'Select Color'}</span>
              <div class="kr-color-buttons">${colorBtns}</div>
            </div>
            <div class="kr-qty-row">
              <div style="display:flex;align-items:center;gap:var(--space-3);">
                <span style="font-size:0.8rem;font-weight:600;color:var(--text-muted);">${lang === 'bn' ? 'পরিমাণ' : 'Quantity'}</span>
                <div class="kr-qty-wrap">
                  <button class="kr-qty-btn kr-qty-minus" data-instance="${inst.instanceId}" aria-label="Decrease">−</button>
                  <div class="kr-qty-val" id="qtyVal_${inst.instanceId}">${inst.qty}</div>
                  <button class="kr-qty-btn kr-qty-plus"  data-instance="${inst.instanceId}" aria-label="Increase">+</button>
                </div>
              </div>
              <div class="kr-co-subtotal" id="subtotal_${inst.instanceId}">${subtotal > 0 ? fmtPrice(subtotal) : '—'}</div>
            </div>
          </div>
          ${isBase ? `
          <button class="kr-duplicate-btn" data-pid="${pid}">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            <span>${lang === 'bn' ? 'ডুপ্লিকেট করুন' : 'Duplicate this product'}</span>
          </button>` : ''}
        `;
        container.appendChild(el);
      });
    });

    // Attach event delegation once
    attachCheckoutEvents(container);
  }

  function attachCheckoutEvents(container) {
    container.addEventListener('click', handleCheckoutClick);
    container.addEventListener('change', handleCheckoutChange);
  }

  function handleCheckoutClick(e) {
    const target = e.target.closest('[data-instance],[data-pid],[data-size],[data-color]');
    if (!target) return;

    // Size button
    if (target.classList.contains('kr-size-btn')) {
      const instanceId = target.getAttribute('data-instance');
      const size       = target.getAttribute('data-size');
      const inst       = checkoutInstances.find(i => i.instanceId === instanceId);
      if (!inst) return;
      inst.size = size;
      if (inst.qty === 0) inst.qty = 1;
      rebuildInstance(instanceId);
      updateSummary();
      refreshWALink();
      firePushAddToCartIfReady(inst);
      return;
    }

    // Color button
    if (target.classList.contains('kr-color-btn')) {
      const instanceId = target.getAttribute('data-instance');
      const color      = target.getAttribute('data-color');
      const inst       = checkoutInstances.find(i => i.instanceId === instanceId);
      if (!inst) return;
      inst.color = color;
      if (inst.qty === 0) inst.qty = 1;
      rebuildInstance(instanceId);
      updateSummary();
      refreshWALink();
      firePushAddToCartIfReady(inst);
      return;
    }

    // Qty minus
    if (target.classList.contains('kr-qty-minus')) {
      const instanceId = target.getAttribute('data-instance');
      const inst       = checkoutInstances.find(i => i.instanceId === instanceId);
      if (inst && inst.qty > 0) {
        inst.qty--;
        rebuildInstance(instanceId);
        updateSummary();
        refreshWALink();
      }
      return;
    }

    // Qty plus
    if (target.classList.contains('kr-qty-plus')) {
      const instanceId = target.getAttribute('data-instance');
      const inst       = checkoutInstances.find(i => i.instanceId === instanceId);
      if (inst) {
        inst.qty++;
        rebuildInstance(instanceId);
        updateSummary();
        refreshWALink();
        firePushAddToCartIfReady(inst);
      }
      return;
    }

    // Duplicate button
    if (target.classList.contains('kr-duplicate-btn')) {
      const pid = parseInt(target.getAttribute('data-pid'));
      duplicateInstance(pid);
      return;
    }

    // Remove variant
    if (target.classList.contains('kr-co-instance-remove')) {
      const instanceId = target.getAttribute('data-instance');
      checkoutInstances = checkoutInstances.filter(i => i.instanceId !== instanceId);
      buildCheckoutProducts();
      updateSummary();
      refreshWALink();
      return;
    }

    // Size chart button
    if (target.classList.contains('kr-co-sizechart-btn')) {
      const pid = parseInt(target.getAttribute('data-pid'));
      openSizeChart(pid);
      return;
    }
  }

  function handleCheckoutChange(e) {
    // No selects in our UI but keeping for future
  }

  function firePushAddToCartIfReady(inst) {
    if (inst.qty > 0 && inst.size && inst.color) {
      const product = KR.PRODUCTS[inst.pid];
      if (product) pushAddToCart(product, inst.qty, inst.size, inst.color);
    }
  }

  function rebuildInstance(instanceId) {
    const inst    = checkoutInstances.find(i => i.instanceId === instanceId);
    if (!inst) return;
    const product = KR.PRODUCTS[inst.pid];
    if (!product) return;

    // Update qty display
    const qtyEl = document.getElementById(`qtyVal_${instanceId}`);
    if (qtyEl) qtyEl.textContent = inst.qty;

    // Update subtotal
    const subtotalEl = document.getElementById(`subtotal_${instanceId}`);
    if (subtotalEl) {
      const sub = product.price * inst.qty;
      subtotalEl.textContent = sub > 0 ? fmtPrice(sub) : '—';
    }

    // Update row active state
    const row = document.querySelector(`[data-instance="${instanceId}"].kr-co-row`);
    if (row) row.classList.toggle('is-active', inst.qty > 0);

    // Update size buttons
    row && row.querySelectorAll('.kr-size-btn').forEach(btn => {
      btn.classList.toggle('is-selected', btn.getAttribute('data-size') === inst.size);
      btn.setAttribute('aria-pressed', btn.getAttribute('data-size') === inst.size ? 'true' : 'false');
    });

    // Update color buttons
    row && row.querySelectorAll('.kr-color-btn').forEach(btn => {
      btn.classList.toggle('is-selected', btn.getAttribute('data-color') === inst.color);
      btn.setAttribute('aria-pressed', btn.getAttribute('data-color') === inst.color ? 'true' : 'false');
    });
  }

  function duplicateInstance(pid) {
    const product    = KR.PRODUCTS[pid];
    if (!product) return;
    const instanceId = `dup_${pid}_${Date.now()}`;
    checkoutInstances.push({ instanceId, pid, size: '', color: '', qty: 1 });
    buildCheckoutProducts();
    updateSummary();
    refreshWALink();

    // Scroll to new row
    setTimeout(() => {
      const row = document.querySelector(`[data-instance="${instanceId}"]`);
      if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);

    showIsland('info',
      getLang() === 'bn' ? 'ডুপ্লিকেট যোগ হয়েছে' : 'Variant Added',
      getLang() === 'bn' ? 'নতুন ভ্যারিয়েন্ট নির্বাচন করুন' : 'Select size & color for new variant'
    );
  }

  /* ============================================================
     10. ORDER SUMMARY
     ============================================================ */
  function updateSummary() {
    const district   = document.getElementById('krDistrictVal') ? document.getElementById('krDistrictVal').value : '';
    const couponCode = state.couponApplied ? state.couponCode : '';
    const payment    = state.paymentMethod;
    let   advance    = 0;
    if (payment === 'bKash') {
      advance = parseFloat(document.getElementById('krBkashAdvance') ? document.getElementById('krBkashAdvance').value : 0) || 0;
    } else if (payment === 'Nagad') {
      advance = parseFloat(document.getElementById('krNagadAdvance') ? document.getElementById('krNagadAdvance').value : 0) || 0;
    }

    const totals = calcTotals(checkoutInstances, district, couponCode, advance);

    // Get active instances
    const activeInstances = checkoutInstances.filter(i => i.qty > 0);

    const itemsEl   = document.getElementById('krSummaryItems');
    const totalsEl  = document.getElementById('krSummaryTotals');

    if (!itemsEl) return;

    if (activeInstances.length === 0) {
      itemsEl.innerHTML = `
        <div class="kr-summary-empty">
          <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin:0 auto var(--space-3);display:block;opacity:0.35;"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
          <span data-en="No items selected yet" data-bn="এখনো কোনো পণ্য বেছে নেননি">
            ${getLang() === 'bn' ? 'এখনো কোনো পণ্য বেছে নেননি' : 'No items selected yet'}
          </span>
        </div>`;
      if (totalsEl) totalsEl.style.display = 'none';
      return;
    }

    // Build item rows
    itemsEl.innerHTML = activeInstances.map(inst => {
      const p    = KR.PRODUCTS[inst.pid];
      if (!p) return '';
      const colorName = inst.color ? getColorName(p, inst.color) : '—';
      return `
        <div class="kr-summary-item">
          <img class="kr-summary-item-img" src="${p.imageUrl}" alt="${getProductName(p)}" />
          <div class="kr-summary-item-info">
            <div class="kr-summary-item-name">${getProductName(p)}</div>
            <div class="kr-summary-item-meta">${inst.size || '—'} · ${colorName} · x${inst.qty}</div>
          </div>
          <div class="kr-summary-item-price">${fmtPrice(p.price * inst.qty)}</div>
        </div>`;
    }).join('');

    if (totalsEl) {
      totalsEl.style.display = 'flex';

      const el = id => document.getElementById(id);
      if (el('krSumSubtotal')) el('krSumSubtotal').textContent = fmtPrice(totals.subtotal);
      if (el('krSumDelivery')) el('krSumDelivery').textContent = totals.delivery === 0 ? (getLang() === 'bn' ? 'ফ্রি' : 'Free') : fmtPrice(totals.delivery);
      if (el('krSumTotal'))    el('krSumTotal').textContent    = fmtPrice(totals.totalPayable);

      // Discount row
      const discRow = el('krSumDiscountRow');
      if (discRow) {
        discRow.style.display = totals.discountAmt > 0 ? 'flex' : 'none';
        if (el('krSumDiscount')) el('krSumDiscount').textContent = '-' + fmtPrice(totals.discountAmt);
        if (el('krSumDiscountLabel')) el('krSumDiscountLabel').textContent = getLang() === 'bn' ? `ছাড় (${couponCode})` : `Discount (${couponCode})`;
      }

      // Advance row
      const advRow = el('krSumAdvanceRow');
      if (advRow) {
        advRow.style.display = advance > 0 ? 'flex' : 'none';
        if (el('krSumAdvance')) el('krSumAdvance').textContent = '-' + fmtPrice(advance);
      }

      // COD remaining
      const codRow = el('krSumCodRow');
      if (codRow) {
        codRow.style.display = (payment !== 'COD' && advance > 0) ? 'flex' : 'none';
        if (el('krSumCod')) el('krSumCod').textContent = fmtPrice(totals.codRemaining);
      }
    }

    // Fire begin_checkout once when user has selected items
    if (activeInstances.length > 0 && !state.beginCheckoutFired) {
      // Only if customer has started filling form
      const name = document.getElementById('krName');
      if (name && name.value.trim()) {
        const items = activeInstances.map(inst => {
          const p = KR.PRODUCTS[inst.pid];
          return { item_id: String(inst.pid), item_name: p ? p.name_en : '', price: p ? p.price : 0, quantity: inst.qty };
        });
        pushBeginCheckout(items, totals.totalPayable);
        state.beginCheckoutFired = true;
      }
    }
  }

  function refreshWALink() {
    const district   = document.getElementById('krDistrictVal') ? document.getElementById('krDistrictVal').value : '';
    const couponCode = state.couponApplied ? state.couponCode : '';
    const payment    = state.paymentMethod;
    let   advance    = 0;
    if (payment === 'bKash') advance = parseFloat(document.getElementById('krBkashAdvance') ? document.getElementById('krBkashAdvance').value : 0) || 0;
    if (payment === 'Nagad') advance = parseFloat(document.getElementById('krNagadAdvance') ? document.getElementById('krNagadAdvance').value : 0) || 0;

    const totals = calcTotals(checkoutInstances, district, couponCode, advance);
    const orderId = 'KR-WA-PENDING';

    const customer = {
      name:     (document.getElementById('krName')    || {}).value || '',
      phone:    (document.getElementById('krPhone')   || {}).value || '',
      email:    (document.getElementById('krEmail')   || {}).value || '',
      district: district,
      address:  (document.getElementById('krAddress') || {}).value || '',
      note:     (document.getElementById('krNote')    || {}).value || ''
    };
    const paymentObj = {
      method:  payment,
      advance: advance,
      trxId:   payment === 'bKash' ? ((document.getElementById('krBkashTrx') || {}).value || '') :
                payment === 'Nagad' ? ((document.getElementById('krNagadTrx') || {}).value || '') : ''
    };

    // Call integrations.js updateWALink
    updateWALink(orderId, checkoutInstances.filter(i => i.qty > 0), customer, paymentObj, couponCode, totals);
  }

  /* ============================================================
     11. PAYMENT METHOD
     ============================================================ */
  function initPayment() {
    const radios    = document.querySelectorAll('input[name="krPayment"]');
    const bkashPanel= document.getElementById('krBkashPanel');
    const nagadPanel= document.getElementById('krNagadPanel');
    if (!radios.length) return;

    function updatePanel(val) {
      state.paymentMethod = val;
      if (bkashPanel) bkashPanel.classList.toggle('is-open', val === 'bKash');
      if (nagadPanel) nagadPanel.classList.toggle('is-open', val === 'Nagad');
      updateSummary();
      refreshWALink();
    }

    radios.forEach(radio => {
      radio.addEventListener('change', () => {
        if (radio.checked) {
          updatePanel(radio.value);
          // Fire add_payment_info
          const district   = document.getElementById('krDistrictVal') ? document.getElementById('krDistrictVal').value : '';
          const couponCode = state.couponApplied ? state.couponCode : '';
          const totals     = calcTotals(checkoutInstances, district, couponCode, 0);
          pushAddPaymentInfo(totals.totalPayable, radio.value);
        }
      });
    });

    // Advance amount changes → update summary
    ['krBkashAdvance', 'krNagadAdvance'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', () => { updateSummary(); refreshWALink(); });
    });
  }

  /* ============================================================
     12. COUPON
     ============================================================ */
  function initCoupon() {
    const btn      = document.getElementById('krCouponApply');
    const input    = document.getElementById('krCoupon');
    const feedback = document.getElementById('krCouponFeedback');
    if (!btn || !input) return;

    function applyCoupon() {
      const code  = input.value.trim().toUpperCase();
      if (!code) {
        if (feedback) {
          feedback.textContent  = getLang() === 'bn' ? 'কুপন কোড দিন' : 'Please enter a coupon code';
          feedback.className    = 'kr-coupon-feedback is-error';
        }
        return;
      }
      if (KR.COUPONS[code]) {
        state.couponCode    = code;
        state.couponApplied = true;
        state.discountPct   = KR.COUPONS[code];
        if (feedback) {
          feedback.textContent = getLang() === 'bn'
            ? `কুপন প্রযোজ্য! ${KR.COUPONS[code]}% ছাড় পেয়েছেন`
            : `Coupon applied! ${KR.COUPONS[code]}% discount`;
          feedback.className = 'kr-coupon-feedback is-success';
        }
        updateSummary();
        refreshWALink();
        showIsland('offer',
          getLang() === 'bn' ? 'কুপন সফল!' : 'Coupon Applied!',
          getLang() === 'bn' ? `${KR.COUPONS[code]}% ছাড় পেয়েছেন` : `${KR.COUPONS[code]}% discount added`
        );
      } else {
        state.couponApplied = false;
        state.couponCode    = '';
        state.discountPct   = 0;
        if (feedback) {
          feedback.textContent = getLang() === 'bn' ? 'অবৈধ কুপন কোড' : 'Invalid coupon code';
          feedback.className   = 'kr-coupon-feedback is-error';
        }
        updateSummary();
        showIsland('error',
          getLang() === 'bn' ? 'অবৈধ কুপন' : 'Invalid Coupon',
          getLang() === 'bn' ? 'এই কুপন কোডটি সঠিক নয়' : 'This coupon code is not valid'
        );
      }
    }

    btn.addEventListener('click', applyCoupon);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); applyCoupon(); } });
  }

  /* ============================================================
     13. VALIDATION
     ============================================================ */
  function clearError(fieldId) {
    const field = document.getElementById(fieldId);
    if (field) field.classList.remove('is-error');
    const input = field ? field.querySelector('.kr-input, .kr-textarea') : null;
    if (input) input.classList.remove('is-error');
    const trigger = document.getElementById('krDistrictTrigger');
    if (fieldId === 'fieldDistrict' && trigger) trigger.classList.remove('is-error');
  }

  function setError(fieldId, scrollTo) {
    const field = document.getElementById(fieldId);
    if (field) {
      field.classList.add('is-error');
      const input = field.querySelector('.kr-input, .kr-textarea');
      if (input) {
        input.classList.add('is-error');
        input.style.animation = 'none';
        setTimeout(() => { input.style.animation = ''; }, 10);
      }
      if (fieldId === 'fieldDistrict') {
        const trigger = document.getElementById('krDistrictTrigger');
        if (trigger) trigger.classList.add('is-error');
      }
      if (scrollTo) field.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function validate() {
    let firstError = null;
    const lang = getLang();

    // At least one product with qty > 0
    const activeInsts = checkoutInstances.filter(i => i.qty > 0);
    if (activeInsts.length === 0) {
      showIsland('error',
        lang === 'bn' ? 'পণ্য বেছে নিন' : 'Select a Product',
        lang === 'bn' ? 'অন্তত একটি পণ্য বেছে নিন' : 'Please select at least one product'
      );
      const coList = document.getElementById('krCoList');
      if (coList) coList.scrollIntoView({ behavior: 'smooth', block: 'center' });
      shakeConfirmBtn();
      return false;
    }

    // Each active instance: size required, color required
    for (const inst of activeInsts) {
      const p = KR.PRODUCTS[inst.pid];
      if (!inst.size) {
        showIsland('error',
          lang === 'bn' ? 'সাইজ বেছে নিন' : 'Size Required',
          lang === 'bn' ? `${getProductName(p)}-এর সাইজ বেছে নিন` : `Select a size for ${p ? p.name_en : ''}`
        );
        const row = document.querySelector(`[data-instance="${inst.instanceId}"]`);
        if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        shakeConfirmBtn();
        return false;
      }
      if (!inst.color) {
        showIsland('error',
          lang === 'bn' ? 'রং বেছে নিন' : 'Color Required',
          lang === 'bn' ? `${getProductName(p)}-এর রং বেছে নিন` : `Select a color for ${p ? p.name_en : ''}`
        );
        const row = document.querySelector(`[data-instance="${inst.instanceId}"]`);
        if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        shakeConfirmBtn();
        return false;
      }
    }

    // Name
    const name = document.getElementById('krName');
    if (!name || !name.value.trim()) {
      setError('fieldName', true);
      if (!firstError) firstError = name;
      showIsland('error', lang === 'bn' ? 'নাম দিন' : 'Name Required', lang === 'bn' ? 'আপনার পুরো নাম লিখুন' : 'Please enter your full name');
      shakeConfirmBtn();
      return false;
    }
    clearError('fieldName');

    // Phone
    const phone = document.getElementById('krPhone');
    if (!phone || !isValidBDPhone(phone.value)) {
      setError('fieldPhone', true);
      showIsland('error', lang === 'bn' ? 'সঠিক নম্বর দিন' : 'Valid Phone Required', lang === 'bn' ? '01XXXXXXXXX ফরম্যাটে নম্বর দিন' : 'Enter a valid BD phone number');
      shakeConfirmBtn();
      return false;
    }
    clearError('fieldPhone');

    // District
    const district = document.getElementById('krDistrictVal');
    if (!district || !district.value.trim()) {
      setError('fieldDistrict', true);
      showIsland('error', lang === 'bn' ? 'জেলা বেছে নিন' : 'District Required', lang === 'bn' ? 'আপনার জেলা বেছে নিন' : 'Please select your district');
      shakeConfirmBtn();
      return false;
    }
    clearError('fieldDistrict');

    // Address
    const address = document.getElementById('krAddress');
    if (!address || address.value.trim().length < 10) {
      setError('fieldAddress', true);
      showIsland('error', lang === 'bn' ? 'ঠিকানা দিন' : 'Address Required', lang === 'bn' ? 'কমপক্ষে ১০ অক্ষরের ঠিকানা দিন' : 'Enter at least 10 characters');
      shakeConfirmBtn();
      return false;
    }
    clearError('fieldAddress');

    // bKash/Nagad trxId
    if (state.paymentMethod === 'bKash') {
      const trx = document.getElementById('krBkashTrx');
      if (!trx || !trx.value.trim()) {
        setError('fieldBkashTrx', true);
        showIsland('error', lang === 'bn' ? 'ট্রানজেকশন আইডি দিন' : 'Transaction ID Required', lang === 'bn' ? 'বিকাশ ট্রানজেকশন আইডি দিন' : 'Enter bKash Transaction ID');
        shakeConfirmBtn();
        return false;
      }
      clearError('fieldBkashTrx');
    }
    if (state.paymentMethod === 'Nagad') {
      const trx = document.getElementById('krNagadTrx');
      if (!trx || !trx.value.trim()) {
        setError('fieldNagadTrx', true);
        showIsland('error', lang === 'bn' ? 'ট্রানজেকশন আইডি দিন' : 'Transaction ID Required', lang === 'bn' ? 'নগদ ট্রানজেকশন আইডি দিন' : 'Enter Nagad Transaction ID');
        shakeConfirmBtn();
        return false;
      }
      clearError('fieldNagadTrx');
    }

    return true;
  }

  function shakeConfirmBtn() {
    const btn = document.getElementById('kr-confirm-btn');
    if (!btn) return;
    btn.classList.add('is-shaking');
    setTimeout(() => btn.classList.remove('is-shaking'), 500);
    // Also shake fixed confirm
    const fixed = document.getElementById('krFixedConfirm');
    if (fixed) {
      fixed.classList.add('is-shaking');
      setTimeout(() => fixed.classList.remove('is-shaking'), 500);
    }
  }

  /* ============================================================
     14. ORDER FORM SUBMIT
     ============================================================ */
  function initOrderForm() {
    const confirmBtn = document.getElementById('kr-confirm-btn');
    if (!confirmBtn) return;

    confirmBtn.addEventListener('click', async () => {
      if (state.isSubmitting) return;
      if (!validate()) return;

      state.isSubmitting = true;
      confirmBtn.classList.add('is-loading');
      confirmBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation:spin 1s linear infinite;">
          <path d="M21 12a9 9 0 11-6.219-8.56"/>
        </svg>
        <span>${getLang() === 'bn' ? 'প্রক্রিয়াকরণ হচ্ছে...' : 'Processing...'}</span>`;

      const orderId    = genOrderId();
      const district   = document.getElementById('krDistrictVal').value;
      const couponCode = state.couponApplied ? state.couponCode : '';
      const payment    = state.paymentMethod;
      let   advance    = 0;
      let   trxId      = '';
      if (payment === 'bKash') {
        advance = parseFloat(document.getElementById('krBkashAdvance').value) || 0;
        trxId   = document.getElementById('krBkashTrx').value.trim();
      } else if (payment === 'Nagad') {
        advance = parseFloat(document.getElementById('krNagadAdvance').value) || 0;
        trxId   = document.getElementById('krNagadTrx').value.trim();
      }

      const totals = calcTotals(checkoutInstances, district, couponCode, advance);

      const customer = {
        name:     document.getElementById('krName').value.trim(),
        phone:    normalizePhone(document.getElementById('krPhone').value),
        email:    document.getElementById('krEmail').value.trim(),
        district: district,
        address:  document.getElementById('krAddress').value.trim(),
        note:     document.getElementById('krNote').value.trim()
      };

      const paymentObj = { method: payment, advance, trxId };

      const activeInstances = checkoutInstances.filter(i => i.qty > 0);

      const orderData = {
        orderId,
        customer,
        payment: paymentObj,
        instances: activeInstances,
        totals,
        couponCode,
        items: activeInstances.map(inst => {
          const p = KR.PRODUCTS[inst.pid];
          return {
            item_id:   String(inst.pid),
            item_name: p ? p.name_en : '',
            category:  p ? p.category : 'Exclusive',
            price:     p ? p.price : 0,
            quantity:  inst.qty,
            size:      inst.size,
            color:     inst.color
          };
        })
      };

      // Save to localStorage BEFORE redirect
      localStorage.setItem('kr_last_order', JSON.stringify(orderData));

      // Parallel: Sheets + Telegram
      const [sheetsOk, telegramOk] = await Promise.allSettled([
        sendToSheets(orderData),
        sendToTelegram(orderData)
      ]);

      // Redirect regardless (we have order saved in localStorage)
      window.location.href = `success.html?id=${encodeURIComponent(orderId)}`;
    });

    // WhatsApp order button
const waBtn = document.getElementById('waOrderBtn');
if (waBtn) {
  waBtn.addEventListener('click', (e) => {
    e.preventDefault();

    // ✅ Confirm Order এর মতোই same validate() call করো
    if (!validate()) return;

    const district   = document.getElementById('krDistrictVal').value;
    const couponCode = state.couponApplied ? state.couponCode : '';
    const payment    = state.paymentMethod;
    let   advance    = 0;
    let   trxId      = '';

    if (payment === 'bKash') {
      advance = parseFloat(document.getElementById('krBkashAdvance').value) || 0;
      trxId   = document.getElementById('krBkashTrx').value.trim();
    } else if (payment === 'Nagad') {
      advance = parseFloat(document.getElementById('krNagadAdvance').value) || 0;
      trxId   = document.getElementById('krNagadTrx').value.trim();
    }

    const totals = calcTotals(checkoutInstances, district, couponCode, advance);
    const customer = {
      name:     document.getElementById('krName').value.trim(),
      phone:    normalizePhone(document.getElementById('krPhone').value),
      email:    document.getElementById('krEmail').value.trim(),
      district: district,
      address:  document.getElementById('krAddress').value.trim(),
      note:     document.getElementById('krNote').value.trim()
    };
    const paymentObj = { method: payment, advance, trxId };

    const waOrderId = 'KR-WA-' + Date.now().toString().slice(-6);
    const activeInsts = checkoutInstances.filter(i => i.qty > 0);
    const msg = buildOrderMessage(waOrderId, activeInsts, customer, paymentObj, couponCode, totals);
    const num = KR.WHATSAPP.replace(/[^0-9]/g, '');
    const url = `https://wa.me/${num}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank', 'noopener');

    // Fire event
    pushWhatsappOrder(totals.totalPayable, activeInsts.reduce((s, i) => s + i.qty, 0));
  });
}

    // begin_checkout on scroll into payment section
    const paySection = document.getElementById('krPaymentSection');
    if (paySection) {
      const obs = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting && !state.beginCheckoutFired) {
            const activeInsts = checkoutInstances.filter(i => i.qty > 0);
            if (activeInsts.length > 0) {
              const district   = document.getElementById('krDistrictVal') ? document.getElementById('krDistrictVal').value : '';
              const totals     = calcTotals(activeInsts, district, '', 0);
              const items = activeInsts.map(inst => {
                const p = KR.PRODUCTS[inst.pid];
                return { item_id: String(inst.pid), item_name: p ? p.name_en : '', price: p ? p.price : 0, quantity: inst.qty };
              });
              pushBeginCheckout(items, totals.totalPayable);
              state.beginCheckoutFired = true;
            }
          }
        });
      }, { threshold: 0.3 });
      obs.observe(paySection);
    }
  }

  /* ============================================================
     15. FIXED BOTTOM BUTTONS (context-aware)
     ============================================================ */
  function initFixedButtons() {
    const fixedOrderNow = document.getElementById('krFixedOrderNow');
    const fixedConfirm  = document.getElementById('krFixedConfirm');
    const orderSection  = document.getElementById('kr-order-form');
    if (!orderSection) return;

    const obs = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const inside = entry.isIntersecting;
        if (fixedOrderNow) fixedOrderNow.classList.toggle('is-hidden', inside);
        if (fixedConfirm)  fixedConfirm.classList.toggle('is-visible', inside);
      });
    }, { threshold: 0.1 });
    obs.observe(orderSection);
  }

  /* ============================================================
     16. SIZE CHART
     ============================================================ */
  function initSizeChart() {
    const overlay = document.getElementById('sizeChartOverlay');
    const closeBtn= document.getElementById('krSizeChartClose');
    if (!overlay) return;

    // Expose globally for inline onclick usage
    window._krOpenSizeChart = openSizeChart;

    closeBtn && closeBtn.addEventListener('click', closeSizeChart);
    overlay.addEventListener('click', e => {
      if (e.target === overlay) closeSizeChart();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeSizeChart();
    });
  }

  function openSizeChart(pid) {
    const product = KR.PRODUCTS[pid];
    const overlay = document.getElementById('sizeChartOverlay');
    const body    = document.getElementById('krSizeChartBody');
    const title   = document.getElementById('krSizeChartTitle');
    if (!overlay || !product) return;

    if (title) title.textContent = `${getProductName(product)} — ${getLang() === 'bn' ? 'সাইজ চার্ট' : 'Size Chart'}`;

    if (body && product.sizeChart) {
      const { headers, rows } = product.sizeChart;
      body.innerHTML = `
        <table class="kr-sizechart-table">
          <thead>
            <tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>
          </thead>
          <tbody>
            ${rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('')}
          </tbody>
        </table>
        <p style="font-size:0.8rem;color:var(--text-muted);margin-top:var(--space-4);text-align:center;">
          ${getLang() === 'bn' ? 'সব পরিমাপ ইঞ্চিতে। সাইজ নিয়ে সন্দেহ হলে বড় সাইজ নিন।' : 'All measurements in inches. When in doubt, size up.'}
        </p>`;
    }

    overlay.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }

  function closeSizeChart() {
    const overlay = document.getElementById('sizeChartOverlay');
    if (overlay) overlay.classList.remove('is-open');
    document.body.style.overflow = '';
  }

  /* ============================================================
     17. FAQ ACCORDION
     ============================================================ */
  function initFAQ() {
    const items = document.querySelectorAll('.kr-faq-item');
    items.forEach(item => {
      const q = item.querySelector('.kr-faq-q');
      if (!q) return;
      q.addEventListener('click', () => toggleFAQ(item));
      q.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggleFAQ(item);
        }
      });
    });
  }

  function toggleFAQ(item) {
    const isOpen = item.classList.contains('is-open');
    // Close all
    document.querySelectorAll('.kr-faq-item.is-open').forEach(i => i.classList.remove('is-open'));
    // Open this one if it was closed
    if (!isOpen) item.classList.add('is-open');
  }

  /* ============================================================
     18. SCROLL ANIMATIONS
     ============================================================ */
  function initScrollAnimations() {
    const els = document.querySelectorAll('.anim-fade-up');
    if (!els.length) return;

    const obs = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });

    els.forEach(el => obs.observe(el));
  }

  /* ============================================================
     19. COUNT-UP ANIMATION
     ============================================================ */
  function initCountUp() {
    const els = document.querySelectorAll('[data-count]');
    if (!els.length) return;

    const obs = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const el     = entry.target;
        const target = parseInt(el.getAttribute('data-count'));
        const dur    = 1800;
        const start  = performance.now();
        obs.unobserve(el);

        function tick(now) {
          const elapsed  = now - start;
          const progress = Math.min(elapsed / dur, 1);
          // cubic ease out
          const eased = 1 - Math.pow(1 - progress, 3);
          el.textContent = Math.round(eased * target).toLocaleString();
          if (progress < 1) requestAnimationFrame(tick);
          else el.textContent = target.toLocaleString() + '+';
        }
        requestAnimationFrame(tick);
      });
    }, { threshold: 0.5 });

    els.forEach(el => obs.observe(el));
  }

  /* ============================================================
     20. SMOOTH SCROLL
     ============================================================ */
  function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(a => {
      a.addEventListener('click', e => {
        const id  = a.getAttribute('href').slice(1);
        const target = document.getElementById(id);
        if (!target) return;
        e.preventDefault();
        const navH   = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--navbar-h')) || 64;
        const announceH = document.getElementById('kr-announcement') ?
          (document.getElementById('kr-announcement').style.display === 'none' ? 0 : document.getElementById('kr-announcement').offsetHeight) : 0;
        const top = target.getBoundingClientRect().top + window.scrollY - navH - announceH - 8;
        window.scrollTo({ top, behavior: 'smooth' });
      });
    });
  }

  /* ============================================================
     21. SPIN ANIMATION (for loading)
     ============================================================ */
  const spinStyle = document.createElement('style');
  spinStyle.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`;
  document.head.appendChild(spinStyle);

  /* ============================================================
     INIT — Run everything
     ============================================================ */
  function init() {
    initCheckoutInstances();
    initTheme();
    initLang();
    initAnnouncement();
    initNavbar();
    initIsland();
    initGallery();
    buildCarousel();
    initCarouselDrag();
    initDistrict();
    buildCheckoutProducts();
    initPayment();
    initCoupon();
    initSizeChart();
    initOrderForm();
    initFixedButtons();
    initFAQ();
    initScrollAnimations();
    initCountUp();
    initSmoothScroll();

    // Initial summary
    updateSummary();
    refreshWALink();

    // Lucide icons render
    if (window.lucide) lucide.createIcons();

    // Size chart buttons (event delegation on document)
    document.addEventListener('click', e => {
      const btn = e.target.closest('.kr-co-sizechart-btn, #krGlobalSizeChartBtn');
      if (btn) {
        const pid = parseInt(btn.getAttribute('data-pid')) || 1;
        openSizeChart(pid);
      }
    });
  }

  // DOMContentLoaded guard
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
