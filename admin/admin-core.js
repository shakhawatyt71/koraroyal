/* ================================================================
   KORA ROYAL — Admin Core v2.1
   admin/admin-core.js  |  সব admin page এ load করতে হবে
   ================================================================ */
'use strict';

const KR_ADMIN = {
  WORKER:      'https://kora-api.shakhawatyt77.workers.dev',
  SESSION_KEY: 'kr_admin_token',
  SESSION_EXP: 'kr_admin_exp',
  SESSION_HRS: 8,
  NAV_ITEMS: [
    { id:'dashboard', label:'Dashboard',  icon:'grid',         href:'dashboard.html' },
    { id:'orders',    label:'Orders',     icon:'bag',          href:'orders.html'    },
    { id:'requests',  label:'Requests',   icon:'refresh',      href:'requests.html'  },
    { id:'inventory', label:'Inventory',  icon:'package',      href:'inventory.html' },
    { id:'hero',      label:'Hero Slides',icon:'image',        href:'hero.html'      },
    { id:'sizecharts',label:'Size Charts',icon:'ruler',        href:'size-charts.html' },
    { id:'customers', label:'Customers',  icon:'users',        href:'customers.html' },
    { id:'coupons',   label:'Coupons',    icon:'tag',          href:'coupons.html'   },
    { id:'settings',  label:'Settings',   icon:'settings',     href:'settings.html'  },
    { id:'reviews',  label:'Reviews',   icon:'reviews',     href:'reviews.html'  },
  ],
  STATUS_META: {
    pending:               { label:'Pending',         color:'#F59E0B', bg:'rgba(245,158,11,0.12)', icon:'⏳' },
    confirmed:             { label:'Confirmed',       color:'#3B82F6', bg:'rgba(59,130,246,0.12)', icon:'✅' },
    packing:               { label:'Packing',         color:'#8B5CF6', bg:'rgba(139,92,246,0.12)', icon:'📦' },
    packed:                { label:'Packed',          color:'#06B6D4', bg:'rgba(6,182,212,0.12)',  icon:'🎁' },
    shipped:               { label:'Shipped',         color:'#10B981', bg:'rgba(16,185,129,0.12)', icon:'🚚' },
    delivered:             { label:'Delivered',       color:'#22C55E', bg:'rgba(34,197,94,0.12)',  icon:'🏠' },
    cancelled_by_customer: { label:'Cxl-Customer',   color:'#EF4444', bg:'rgba(239,68,68,0.10)',  icon:'❌' },
    cancelled_by_seller:   { label:'Cxl-You',        color:'#DC2626', bg:'rgba(220,38,38,0.10)',  icon:'🚫' },
  },
  STATUS_OPTIONS: [
    { value:'confirmed',           label:'Confirmed',        icon:'✅' },
    { value:'packing',             label:'Packing',          icon:'📦' },
    { value:'packed',              label:'Packed',           icon:'🎁' },
    { value:'shipped',             label:'Shipped',          icon:'🚚' },
    { value:'delivered',           label:'Delivered',        icon:'🏠' },
    { value:'cancelled_by_seller', label:'Cancel by Seller', icon:'🚫' },
  ],
  CANCEL_REASONS: [
    'Out of stock',
    'Payment issue',
    'Wrong address / unreachable',
    'Duplicate order',
    'Fraud suspected',
    'Customer requested via WhatsApp',
    'Other',
  ],
};

/* ── SVG icons ── */
const _SVG = {
  grid:     `<svg width="17" height="17" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>`,
  bag:      `<svg width="17" height="17" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>`,
  package:  `<svg width="17" height="17" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`,
  image:    `<svg width="17" height="17" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`,
  ruler:    `<svg width="17" height="17" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M2 12h20M6 8v8M10 8v8M14 8v8M18 8v8"/></svg>`, 
  users:    `<svg width="17" height="17" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  settings: `<svg width="17" height="17" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
  logout:   `<svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`,
  sun:      `<svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`,
  moon:     `<svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`,
  menu:     `<svg width="21" height="21" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>`,
  chevron:  `<svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>`,
  check:    `<svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`,
  refresh:  `<svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>`,
  wa:       `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg>`,
    reviews:  `<svg width="17" height="17" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  tag:      `<svg width="17" height="17" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>`
  ,
};
window._SVG = _SVG;

/* ══ SESSION ══ */
function krAdminCheckSession() {
  const token = sessionStorage.getItem(KR_ADMIN.SESSION_KEY);
  const exp   = parseInt(sessionStorage.getItem(KR_ADMIN.SESSION_EXP)||'0');
  if (!token || Date.now() > exp) {
    sessionStorage.removeItem(KR_ADMIN.SESSION_KEY);
    sessionStorage.removeItem(KR_ADMIN.SESSION_EXP);
    window.location.replace('index.html');
    return null;
  }
  return token;
}
function krAdminGetToken() { return sessionStorage.getItem(KR_ADMIN.SESSION_KEY); }
function krAdminLogout() {
  sessionStorage.removeItem(KR_ADMIN.SESSION_KEY);
  sessionStorage.removeItem(KR_ADMIN.SESSION_EXP);
  window.location.replace('index.html');
}
(function() {
  let last = Date.now();
  ['click','keydown','scroll','touchstart'].forEach(ev =>
    document.addEventListener(ev, () => {
      const now = Date.now();
      if (now - last < 60000) return;
      last = now;
      const exp = parseInt(sessionStorage.getItem(KR_ADMIN.SESSION_EXP)||'0');
      if (exp > 0 && Date.now() < exp)
        sessionStorage.setItem(KR_ADMIN.SESSION_EXP, String(now + KR_ADMIN.SESSION_HRS*3600000));
    }, { passive: true })
  );
})();

/* ══ API FETCH ══ */
async function krAdminFetch(path, options = {}) {
  const token = krAdminGetToken();
  const res = await fetch(`${KR_ADMIN.WORKER}${path}`, {
    ...options,
    headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${token}`, ...(options.headers||{}) }
  });
  if (res.status === 401) { krAdminLogout(); throw new Error('Session expired'); }
  return res.json();
}

/* ══ NAV ══ */
function krAdminRenderNav(activeId) {
  const sidebar = document.getElementById('krAdminSidebar');
  if (!sidebar) return;
  const theme = localStorage.getItem('kr_admin_theme') || 'light';
  document.documentElement.setAttribute('data-theme', theme);
  const logoL = 'https://res.cloudinary.com/dvvgofrhs/image/upload/v1776146557/Picsart_26-04-14_11-59-56-382_ueiofu.png';
  const logoD = 'https://res.cloudinary.com/dvvgofrhs/image/upload/v1776146561/Picsart_26-04-14_12-01-21-890_d8icez.png';

  sidebar.innerHTML = `
    <div class="kr-nav-logo">
      <img id="krNavLogo" src="${theme==='dark'?logoD:logoL}" alt="KORA ROYAL" style="height:30px;width:auto;" />
      <span class="kr-nav-badge">Admin</span>
    </div>
    <nav class="kr-nav-links">
      ${KR_ADMIN.NAV_ITEMS.map(item=>`
        <a href="${item.href}" class="kr-nav-item${item.id===activeId?' is-active':''}">
          ${_SVG[item.icon]||''}
          <span>${item.label}</span>
          ${item.id==='orders'?'<span class="kr-pending-badge" id="navPendingCount" style="display:none;"></span>':''}
        </a>`).join('')}
    </nav>
    <div class="kr-nav-footer">
      <button class="kr-nav-btn" id="krThemeBtn">
        <span id="themeIco">${theme==='dark'?_SVG.sun:_SVG.moon}</span>
        <span id="themeLabel">${theme==='dark'?'Light mode':'Dark mode'}</span>
      </button>
      <button class="kr-nav-btn is-danger" id="krLogoutBtn">
        ${_SVG.logout}<span>Sign out</span>
      </button>
    </div>`;

  document.getElementById('krThemeBtn').onclick = () => {
    const cur = document.documentElement.getAttribute('data-theme');
    const next = cur==='dark'?'light':'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('kr_admin_theme', next);
    document.getElementById('themeIco').innerHTML = next==='dark'?_SVG.sun:_SVG.moon;
    document.getElementById('themeLabel').textContent = next==='dark'?'Light mode':'Dark mode';
    const logo = document.getElementById('krNavLogo');
    if (logo) logo.src = next==='dark'?logoD:logoL;
  };
  document.getElementById('krLogoutBtn').onclick = () => {
    if (confirm('Sign out?')) krAdminLogout();
  };
  krAdminLoadPendingCount();
}

async function krAdminLoadPendingCount() {
  try {
    const data = await krAdminFetch('/api/admin/stats');
    const n = data.statusBreakdown?.pending || 0;
    const el = document.getElementById('navPendingCount');
    if (el && n > 0) { el.textContent = n; el.style.display = 'inline-flex'; }
  } catch(e) {}
}

function krAdminInitMobileNav() {
  const btn     = document.getElementById('krMobileMenuBtn');
  const sidebar = document.getElementById('krAdminSidebar');
  const overlay = document.getElementById('krSidebarOverlay');
  if (!btn || !sidebar) return;
  const open  = () => { sidebar.classList.add('is-open');    overlay?.classList.add('is-visible'); };
  const close = () => { sidebar.classList.remove('is-open'); overlay?.classList.remove('is-visible'); };
  btn.onclick     = () => sidebar.classList.contains('is-open') ? close() : open();
  overlay&&(overlay.onclick = close);
}

/* ══ CUSTOM DROPDOWN ══
   Usage:
   krDropdown({ anchor: el, options:[{value,label,icon}], selected, onSelect })
══ */
function krDropdown({ anchor, options, selected = '', onSelect }) {
  document.querySelectorAll('.kr-dd-menu').forEach(d => d.remove());

  const menu = document.createElement('div');
  menu.className = 'kr-dd-menu';
  options.forEach(opt => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'kr-dd-item' + (opt.value === selected ? ' is-sel' : '');
    btn.innerHTML = `<span class="kr-dd-ico">${opt.icon||''}</span><span class="kr-dd-lbl">${opt.label}</span>${opt.value===selected?`<span class="kr-dd-chk">${_SVG.check}</span>`:''}`;
    btn.onclick = e => { e.stopPropagation(); onSelect(opt.value, opt.label, opt); menu.remove(); document.removeEventListener('click', outsideClick); };
    menu.appendChild(btn);
  });

  document.body.appendChild(menu);
  const rect = anchor.getBoundingClientRect();
  const menuW = Math.max(anchor.offsetWidth, 210);
  let top  = rect.bottom + window.scrollY + 4;
  let left = rect.left + window.scrollX;
  if (left + menuW > window.innerWidth - 8) left = window.innerWidth - menuW - 8;
  menu.style.cssText = `top:${top}px;left:${left}px;width:${menuW}px;`;

  const outsideClick = e => { if (!menu.contains(e.target) && e.target !== anchor) { menu.remove(); document.removeEventListener('click', outsideClick); } };
  setTimeout(() => document.addEventListener('click', outsideClick), 10);
}

/* Build a trigger button that wraps krDropdown — drop-in replacement for <select> */
function krDropdownSelect({ container, options, value = '', placeholder = '— Select —', onSelect }) {
  container.innerHTML = '';
  let _val = value;

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'kr-dd-trigger';

  const refresh = () => {
    const cur = options.find(o => o.value === _val);
    trigger.innerHTML = `
      <span style="display:flex;align-items:center;gap:8px;flex:1;min-width:0;">
        <span>${cur?.icon||''}</span>
        <span style="flex:1;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${cur?.label||placeholder}</span>
      </span>
      <span style="opacity:0.5;flex-shrink:0;">${_SVG.chevron}</span>`;
  };
  refresh();

  trigger.onclick = e => {
    e.stopPropagation();
    krDropdown({
      anchor: trigger,
      options,
      selected: _val,
      onSelect: (val, label, opt) => {
        _val = val;
        refresh();
        onSelect(val, label, opt);
      }
    });
  };

  container.appendChild(trigger);
  return {
    getValue: () => _val,
    setValue: v => { _val = v; refresh(); },
  };
}

/* ══ TOAST ══ */
function krToast(message, type = 'info', duration = 3500) {
  let box = document.getElementById('krToastBox');
  if (!box) {
    box = document.createElement('div');
    box.id = 'krToastBox';
    Object.assign(box.style, { position:'fixed', bottom:'1.25rem', right:'1.25rem',
      zIndex:'9999', display:'flex', flexDirection:'column', gap:'7px',
      pointerEvents:'none', maxWidth:'300px', width:'calc(100vw - 2.5rem)' });
    document.body.appendChild(box);
  }
  const C = { success:'#22C55E', error:'#EF4444', info:'#3B82F6', warning:'#F59E0B' };
  const I = { success:'✓', error:'✕', info:'ℹ', warning:'⚠' };
  const col = C[type] || C.info;
  const t = document.createElement('div');
  t.style.cssText = `display:flex;align-items:flex-start;gap:9px;background:var(--bg-card);
    border:1px solid var(--border-subtle);border-left:3px solid ${col};border-radius:10px;
    padding:10px 13px;font-family:'DM Sans',sans-serif;font-size:0.855rem;color:var(--text-primary);
    box-shadow:0 4px 20px rgba(0,0,0,0.12);pointer-events:auto;
    animation:krTIn 0.28s cubic-bezier(0.34,1.56,0.64,1) both;`;
  t.innerHTML = `<span style="width:20px;height:20px;border-radius:50%;background:${col};color:#fff;display:flex;align-items:center;justify-content:center;font-size:0.68rem;font-weight:700;flex-shrink:0;margin-top:1px;">${I[type]}</span><span style="line-height:1.45;">${message}</span>`;
  box.appendChild(t);
  setTimeout(() => { t.style.animation = 'krTOut 0.22s ease forwards'; setTimeout(() => t.remove(), 240); }, duration);
}

/* ══ STATUS BADGE ══ */
function krStatusBadge(status) {
  const m = KR_ADMIN.STATUS_META[status] || { label:status, color:'#717777', bg:'rgba(113,119,119,0.1)', icon:'•' };
  return `<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 9px;border-radius:9999px;background:${m.bg};color:${m.color};font-size:0.7rem;font-weight:600;font-family:'Outfit',sans-serif;white-space:nowrap;">${m.icon} ${m.label}</span>`;
}

/* ══ FORMATTERS ══ */
function krFmtDate(ts) { if(!ts) return '—'; return new Date(ts).toLocaleString('en-BD',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:true}); }
function krFmtDateShort(ts) { if(!ts) return '—'; return new Date(ts).toLocaleString('en-BD',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hour12:true}); }
function krFmtMoney(n) { return '৳' + Number(n||0).toLocaleString('en-BD'); }
function krNormalizeWaNumber(raw){let p=String(raw||'').replace(/\D/g,'');if(p.startsWith('0088'))p=p.slice(2);if(p.startsWith('0'))p='88'+p;else if(p.startsWith('1'))p='880'+p;return /^8801[3-9]\d{8}$/.test(p)?p:'';}
function krWhatsAppUrl(phone,text=''){const n=krNormalizeWaNumber(phone);return n?`https://wa.me/${n}${text?`?text=${encodeURIComponent(text)}`:''}`:'#';}
function krTimeAgo(ts) {
  const d=Date.now()-ts, m=Math.floor(d/60000), h=Math.floor(d/3600000), dy=Math.floor(d/86400000);
  if(m<1) return 'Just now'; if(m<60) return `${m}m ago`; if(h<24) return `${h}h ago`; return `${dy}d ago`;
}

/* ══ CONFIRM ══ */
function krConfirm(message, title = 'Are you sure?') {
  return new Promise(resolve => {
    let m = document.getElementById('krConfirmModal');
    if (!m) {
      m = document.createElement('div');
      m.id = 'krConfirmModal';
      m.className = 'kr-modal-backdrop';
      m.innerHTML = `<div class="kr-modal-box" style="max-width:340px;">
        <div id="krCT" style="font-family:'Outfit',sans-serif;font-size:1.05rem;font-weight:700;margin-bottom:6px;"></div>
        <div id="krCM" style="font-size:0.875rem;color:var(--text-muted);line-height:1.6;margin-bottom:1.5rem;"></div>
        <div style="display:flex;gap:8px;">
          <button id="krCN" class="kr-btn kr-btn-ghost" style="flex:1;justify-content:center;">Cancel</button>
          <button id="krCY" class="kr-btn kr-btn-primary" style="flex:1;justify-content:center;">Confirm</button>
        </div></div>`;
      document.body.appendChild(m);
    }
    document.getElementById('krCT').textContent = title;
    document.getElementById('krCM').textContent = message;
    m.style.display = 'flex';
    const done = r => { m.style.display='none'; resolve(r); };
    document.getElementById('krCY').onclick = () => done(true);
    document.getElementById('krCN').onclick = () => done(false);
    m.onclick = e => { if(e.target===m) done(false); };
  });
}

/* ══ LOADING ══ */
function krShowLoading(show = true) {
  let el = document.getElementById('krLoadingOverlay');
  if (!el && show) {
    el = document.createElement('div');
    el.id = 'krLoadingOverlay';
    el.className = 'kr-modal-backdrop';
    el.style.zIndex = '3000';
    el.innerHTML = `<div style="background:var(--bg-card);border-radius:14px;padding:1.25rem 1.75rem;display:flex;align-items:center;gap:12px;box-shadow:0 8px 32px rgba(0,0,0,0.18);">
      <div style="width:20px;height:20px;border:2.5px solid rgba(255,96,68,0.2);border-top-color:var(--brand-coral);border-radius:50%;animation:krSpin 0.7s linear infinite;"></div>
      <span style="font-family:'DM Sans',sans-serif;color:var(--text-primary);font-weight:500;font-size:0.9rem;">Loading...</span>
    </div>`;
    document.body.appendChild(el);
  }
  if (el) el.style.display = show ? 'flex' : 'none';
}

/* ══ CSS ══ */
(function() {
  if (document.getElementById('krCoreCss')) return;
  const s = document.createElement('style');
  s.id = 'krCoreCss';
  s.textContent = `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
html{font-size:16px;-webkit-font-smoothing:antialiased;}
body{font-family:'DM Sans',sans-serif;background:var(--bg-body);color:var(--text-primary);min-height:100vh;overflow-x:hidden;}
a{color:inherit;text-decoration:none;}

:root{
  --brand-coral:#FF6044;--brand-black:#121313;
  --bg-body:#F2EFE9;--bg-card:#FFFFFF;--bg-hover:#FFF6ED;--bg-sidebar:#FFFFFF;--bg-input:#F7F4EF;
  --text-primary:#121313;--text-secondary:#3A3D3D;--text-muted:#717777;
  --border-subtle:#E0D9CF;--border-input:#C8C2B8;--border-focus:#FF6044;
  --shadow-sm:0 1px 6px rgba(0,0,0,0.06);--shadow-md:0 4px 16px rgba(0,0,0,0.08);
  --shadow-lg:0 8px 32px rgba(0,0,0,0.10);--shadow-coral:0 4px 18px rgba(255,96,68,0.26);
  --radius-sm:6px;--radius-md:10px;--radius-lg:14px;--radius-xl:20px;--radius-full:9999px;
  --sidebar-w:224px;
}
[data-theme="dark"]{
  --bg-body:#0E0F0F;--bg-card:#1A1C1C;--bg-hover:#232525;--bg-sidebar:#141616;--bg-input:#212323;
  --text-primary:#F2EFE9;--text-secondary:#C8C2B8;--text-muted:#717777;
  --border-subtle:#292B2B;--border-input:#383B3B;
}

@keyframes krSpin{to{transform:rotate(360deg);}}
@keyframes krMIn{from{transform:scale(0.9) translateY(8px);opacity:0}to{transform:none;opacity:1}}
@keyframes krFUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
@keyframes krTIn{from{opacity:0;transform:translateX(10px)}to{opacity:1;transform:none}}
@keyframes krTOut{to{opacity:0;transform:translateX(10px)}}
@keyframes krShim{from{background-position:200% 0}to{background-position:-200% 0}}

/* Layout */
.kr-admin-layout{display:grid;grid-template-columns:var(--sidebar-w) 1fr;min-height:100vh;overflow-x:hidden;}
.kr-admin-right{display:flex;flex-direction:column;min-width:0;overflow:hidden;}

/* Sidebar */
#krAdminSidebar{background:var(--bg-sidebar);border-right:1px solid var(--border-subtle);display:flex;flex-direction:column;padding:1rem 0.625rem;position:sticky;top:0;height:100vh;overflow-y:auto;overflow-x:hidden;flex-shrink:0;width:var(--sidebar-w);}
.kr-nav-logo{display:flex;align-items:center;gap:8px;padding:0 0.375rem 1rem;border-bottom:1px solid var(--border-subtle);margin-bottom:0.75rem;flex-shrink:0;}
.kr-nav-badge{font-family:'Outfit',sans-serif;font-size:0.6rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;background:rgba(255,96,68,0.1);color:var(--brand-coral);border:1px solid rgba(255,96,68,0.2);border-radius:var(--radius-full);padding:2px 6px;white-space:nowrap;}
.kr-nav-links{flex:1;display:flex;flex-direction:column;gap:1px;}
.kr-nav-item{display:flex;align-items:center;gap:8px;padding:0.56rem 0.75rem;border-radius:var(--radius-md);color:var(--text-secondary);font-size:0.85rem;font-weight:500;transition:background 0.15s,color 0.15s;white-space:nowrap;overflow:hidden;}
.kr-nav-item:hover{background:var(--bg-hover);color:var(--brand-coral);}
.kr-nav-item.is-active{background:rgba(255,96,68,0.09);color:var(--brand-coral);font-weight:600;}
.kr-nav-item svg{flex-shrink:0;opacity:0.6;}
.kr-nav-item.is-active svg{opacity:1;}
.kr-pending-badge{display:none;margin-left:auto;min-width:18px;height:18px;padding:0 5px;background:var(--brand-coral);color:#fff;border-radius:var(--radius-full);font-size:0.65rem;font-weight:700;font-family:'Outfit',sans-serif;align-items:center;justify-content:center;}
.kr-nav-footer{padding-top:0.625rem;border-top:1px solid var(--border-subtle);display:flex;flex-direction:column;gap:1px;}
.kr-nav-btn{display:flex;align-items:center;gap:8px;padding:0.5rem 0.75rem;border-radius:var(--radius-md);background:transparent;border:none;cursor:pointer;color:var(--text-muted);font-family:'DM Sans',sans-serif;font-size:0.8125rem;font-weight:500;width:100%;text-align:left;transition:all 0.15s;white-space:nowrap;}
.kr-nav-btn:hover{background:var(--bg-hover);color:var(--text-primary);}
.kr-nav-btn.is-danger:hover{background:rgba(239,68,68,0.07);color:#EF4444;}

/* Topbar */
.kr-admin-topbar{background:var(--bg-card);border-bottom:1px solid var(--border-subtle);padding:0.7rem 1.125rem;display:flex;align-items:center;gap:0.625rem;position:sticky;top:0;z-index:100;box-shadow:var(--shadow-sm);min-width:0;}
.kr-topbar-title{font-family:'Outfit',sans-serif;font-size:1rem;font-weight:700;color:var(--text-primary);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.kr-mobile-menu-btn{display:none;background:none;border:none;color:var(--text-primary);cursor:pointer;padding:4px;flex-shrink:0;}

/* Main */
.kr-admin-main{padding:1.125rem;min-width:0;overflow-x:hidden;animation:krFUp 0.3s ease both;}

/* Cards */
.kr-card{background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:var(--radius-lg);box-shadow:var(--shadow-sm);overflow:hidden;}
.kr-card-header{padding:0.8125rem 1.0625rem;border-bottom:1px solid var(--border-subtle);display:flex;align-items:center;justify-content:space-between;gap:0.5rem;flex-wrap:wrap;}
.kr-card-title{font-family:'Outfit',sans-serif;font-size:0.875rem;font-weight:700;color:var(--text-primary);}
.kr-card-body{padding:1.0625rem;}

/* Stat grid — responsive, no overflow */
.kr-stat-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:0.75rem;margin-bottom:1.125rem;}
.kr-stat-card{background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:var(--radius-lg);padding:1rem 1.0625rem;box-shadow:var(--shadow-sm);min-width:0;}
.kr-stat-label{font-size:0.68rem;color:var(--text-muted);font-weight:700;text-transform:uppercase;letter-spacing:0.07em;margin-bottom:7px;}
.kr-stat-value{font-family:'Outfit',sans-serif;font-size:1.5rem;font-weight:800;color:var(--text-primary);line-height:1;margin-bottom:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.kr-stat-sub{font-size:0.75rem;color:var(--text-muted);}

/* Table */
.kr-table-wrap{width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch;}
table.kr-table{width:100%;border-collapse:collapse;table-layout:fixed;}
.kr-table th{text-align:left;padding:8px 11px;font-size:0.68rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.07em;border-bottom:1px solid var(--border-subtle);background:var(--bg-body);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.kr-table td{padding:10px 11px;border-bottom:1px solid var(--border-subtle);font-size:0.84rem;vertical-align:middle;overflow:hidden;text-overflow:ellipsis;}
.kr-table tbody tr:last-child td{border-bottom:none;}
.kr-table tbody tr:hover td{background:var(--bg-hover);}

/* Buttons */
.kr-btn{display:inline-flex;align-items:center;justify-content:center;gap:5px;padding:0.475rem 0.875rem;border-radius:var(--radius-md);font-family:'Outfit',sans-serif;font-size:0.855rem;font-weight:600;cursor:pointer;transition:all 0.15s;border:none;text-decoration:none;white-space:nowrap;line-height:1.2;flex-shrink:0;}
.kr-btn-primary{background:var(--brand-coral);color:#fff;box-shadow:var(--shadow-coral);}
.kr-btn-primary:hover:not(:disabled){background:#E8502E;transform:translateY(-1px);}
.kr-btn-ghost{background:transparent;border:1.5px solid var(--border-subtle);color:var(--text-secondary);}
.kr-btn-ghost:hover:not(:disabled){border-color:var(--brand-coral);color:var(--brand-coral);}
.kr-btn-danger{background:rgba(239,68,68,0.07);color:#EF4444;border:1px solid rgba(239,68,68,0.18);}
.kr-btn-danger:hover:not(:disabled){background:rgba(239,68,68,0.14);}
.kr-btn-sm{padding:0.3rem 0.625rem;font-size:0.775rem;border-radius:var(--radius-sm);}
.kr-btn:disabled{opacity:0.45;cursor:not-allowed;transform:none!important;}

/* Inputs */
.kr-input{width:100%;padding:0.58rem 0.8125rem;border:1.5px solid var(--border-input);border-radius:var(--radius-md);background:var(--bg-input);color:var(--text-primary);font-family:'DM Sans',sans-serif;font-size:0.875rem;outline:none;transition:border-color 0.2s,box-shadow 0.2s;}
.kr-input:focus{border-color:var(--border-focus);box-shadow:0 0 0 3px rgba(255,96,68,0.09);}
.kr-input::placeholder{color:var(--text-muted);}
.kr-label{display:block;font-size:0.785rem;font-weight:600;color:var(--text-secondary);margin-bottom:4px;}

/* Custom dropdown */
.kr-dd-trigger{width:100%;display:flex;align-items:center;padding:0.58rem 0.8125rem;border:1.5px solid var(--border-input);border-radius:var(--radius-md);background:var(--bg-input);color:var(--text-primary);font-family:'DM Sans',sans-serif;font-size:0.875rem;cursor:pointer;transition:border-color 0.2s,box-shadow 0.2s;text-align:left;gap:6px;}
.kr-dd-trigger:hover,.kr-dd-trigger:focus{border-color:var(--border-focus);box-shadow:0 0 0 3px rgba(255,96,68,0.09);}
.kr-dd-menu{position:fixed;z-index:8000;background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:var(--radius-lg);box-shadow:0 8px 28px rgba(0,0,0,0.13);overflow:hidden;overflow-y:auto;max-height:280px;padding:3px;}
.kr-dd-item{width:100%;display:flex;align-items:center;gap:8px;padding:8px 10px;background:transparent;border:none;cursor:pointer;font-family:'DM Sans',sans-serif;font-size:0.855rem;color:var(--text-secondary);border-radius:var(--radius-sm);transition:background 0.1s;text-align:left;}
.kr-dd-item:hover{background:var(--bg-hover);color:var(--text-primary);}
.kr-dd-item.is-sel{color:var(--brand-coral);font-weight:600;}
.kr-dd-ico{font-size:0.9rem;flex-shrink:0;width:18px;text-align:center;}
.kr-dd-lbl{flex:1;}
.kr-dd-chk{color:var(--brand-coral);flex-shrink:0;}

/* Modal */
.kr-modal-backdrop{display:none;position:fixed;inset:0;z-index:2000;background:rgba(0,0,0,0.46);backdrop-filter:blur(4px);align-items:center;justify-content:center;padding:max(.5rem,env(safe-area-inset-top)) .65rem max(.5rem,env(safe-area-inset-bottom));overflow:hidden;overscroll-behavior:contain;touch-action:none;}
.kr-modal-backdrop.is-open,.kr-modal-backdrop[style*="flex"]{display:flex;}
.kr-modal-box{background:var(--bg-card);border-radius:var(--radius-xl);border:1px solid var(--border-subtle);padding:1.625rem 1.375rem;width:100%;box-shadow:0 16px 48px rgba(0,0,0,0.2);animation:krMIn 0.22s cubic-bezier(0.34,1.56,0.64,1) both;max-height:min(92dvh,920px);overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;touch-action:pan-y;min-height:0;}
body.kr-admin-modal-open{overflow:hidden!important;touch-action:none;}

/* Skeleton */
.kr-skel{background:linear-gradient(90deg,var(--border-subtle) 25%,var(--bg-hover) 50%,var(--border-subtle) 75%);background-size:200% 100%;animation:krShim 1.4s infinite;border-radius:6px;display:block;}

/* Empty */
.kr-empty{text-align:center;padding:2.5rem 1rem;color:var(--text-muted);font-size:0.875rem;}
.kr-empty-icon{font-size:2rem;margin-bottom:5px;}

/* Overlay */
.kr-sidebar-overlay{display:none;position:fixed;inset:0;z-index:199;background:rgba(0,0,0,0.38);backdrop-filter:blur(2px);}
.kr-sidebar-overlay.is-visible{display:block;}

/* Responsive */
@media(max-width:1024px){.kr-stat-grid{grid-template-columns:repeat(2,1fr);}}
@media(max-width:768px){
  .kr-admin-layout{grid-template-columns:1fr;}
  #krAdminSidebar{position:fixed;left:0;top:0;bottom:0;z-index:200;transform:translateX(-100%);transition:transform 0.26s ease;box-shadow:var(--shadow-lg);}
  #krAdminSidebar.is-open{transform:none;}
  .kr-mobile-menu-btn{display:flex;}
  .kr-admin-main{padding:0.875rem;}
  .kr-stat-grid{grid-template-columns:repeat(2,1fr);gap:0.625rem;}
}
@media(max-width:480px){
  .kr-stat-grid{grid-template-columns:repeat(2,1fr);gap:0.5rem;}
  .kr-stat-value{font-size:1.25rem;}
  .kr-table th,.kr-table td{padding:7px 8px;font-size:0.79rem;}
}
`;
  document.head.appendChild(s);
})();

/* ══ GLOBAL MODAL SCROLL LOCK ══ */
(function(){
  function sync(){const open=[...document.querySelectorAll('.kr-modal-backdrop')].some(m=>m.classList.contains('is-open')||m.style.display==='flex');document.body?.classList.toggle('kr-admin-modal-open',open);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{sync();new MutationObserver(sync).observe(document.body,{subtree:true,attributes:true,attributeFilter:['style','class']});});
  else{sync();new MutationObserver(sync).observe(document.body,{subtree:true,attributes:true,attributeFilter:['style','class']});}
  window.krAdminSyncModalLock=sync;
})();

/* ══ EXPOSE ══ */
window.KR_ADMIN             = KR_ADMIN;
window._SVG                 = _SVG;
window.krAdminCheckSession  = krAdminCheckSession;
window.krAdminGetToken      = krAdminGetToken;
window.krAdminLogout        = krAdminLogout;
window.krAdminFetch         = krAdminFetch;
window.krAdminRenderNav     = krAdminRenderNav;
window.krAdminInitMobileNav = krAdminInitMobileNav;
window.krDropdown           = krDropdown;
window.krDropdownSelect     = krDropdownSelect;
window.krToast              = krToast;
window.krStatusBadge        = krStatusBadge;
window.krFmtDate            = krFmtDate;
window.krFmtDateShort       = krFmtDateShort;
window.krFmtMoney           = krFmtMoney;
window.krNormalizeWaNumber  = krNormalizeWaNumber;
window.krWhatsAppUrl        = krWhatsAppUrl;
window.krTimeAgo            = krTimeAgo;
window.krConfirm            = krConfirm;
window.krShowLoading        = krShowLoading;
