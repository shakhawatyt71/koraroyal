'use strict';
(function(){
  if (!krAdminCheckSession()) return;
  krAdminRenderNav('settings');
  krAdminInitMobileNav();

  const $ = id => document.getElementById(id);
  const mb = $('krMobileMenuBtn');
  if (mb) mb.innerHTML = _SVG.menu;

  async function health(){
    const start = Date.now();
    try {
      const r = await krAdminFetch('/api/admin/stats');
      $('setWorker').innerHTML = `<span style="color:#16A34A">Online · ${Date.now()-start}ms</span>`;
      $('setD1').textContent = `${r.totalOrders||0} D1 orders`;
    } catch(e) {
      $('setWorker').innerHTML = '<span style="color:#DC2626">Offline/Error</span>';
      $('setD1').textContent = e.message;
    }
  }

  async function syncStores() {
    const btn = $('setPathaoSyncBtn');
    btn.disabled = true;
    btn.textContent = 'Syncing...';
    try {
      const res = await krAdminFetch('/api/admin/pathao/stores');
      if (!res.ok) throw new Error(res.error || 'Failed to fetch stores');
      const stores = res.stores || [];
      populateStoresDropdown(stores);
      krToast(`Synced ${stores.length} store(s) from Pathao`, 'success');
    } catch (err) {
      krToast(err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Sync Stores';
    }
  }

  function populateStoresDropdown(stores, selectedId = '') {
    const sel = $('setPathaoStore');
    if (stores.length === 0) {
      sel.innerHTML = '<option value="">-- No stores found on Pathao --</option>';
      return;
    }
    sel.innerHTML = stores.map(s => 
      `<option value="${s.store_id}" ${String(s.store_id) === String(selectedId) ? 'selected' : ''}>${s.store_name} (${s.store_address})</option>`
    ).join('');
  }

  async function load(){
    health();
    try {
      const r = await krAdminFetch('/api/admin/operations-settings');
      const s = r.settings || {};
      
      // Request Windows
      $('setReturnDays').value = s.return_request_days || 7;
      $('setRefundDays').value = s.refund_request_days || 7;
      $('setExchangeDays').value = s.exchange_request_days || 7;
      
      // Pathao Settings
      $('setPathaoEnabled').checked = s.pathao_enabled === '1';
      $('setPathaoAutoBook').checked = s.pathao_auto_book === '1';
      $('setPathaoSandbox').checked = s.pathao_mode === 'sandbox';
      $('setPathaoSenderName').value = s.pathao_sender_name || 'Kora Royal';
      $('setPathaoSenderPhone').value = s.pathao_sender_phone || '01935158745';
      $('setPathaoWeight').value = s.pathao_default_weight || '0.5';
      $('setPathaoItemType').value = s.pathao_default_item_type || '2';
      $('setPathaoDeliveryType').value = s.pathao_default_delivery_type || '48';
      $('setPathaoWebhookSecret').value = s.pathao_webhook_secret || '';
      
      // Load and select Pathao store
      if (s.pathao_enabled === '1' || s.pathao_store_id) {
        try {
          const res = await krAdminFetch('/api/admin/pathao/stores');
          if (res.ok) {
            populateStoresDropdown(res.stores || [], s.pathao_store_id);
          }
        } catch {
          populateStoresDropdown([], s.pathao_store_id);
        }
      }
    } catch(err) {
      console.error('[Settings Load]', err);
    }
    
    $('setDark').checked = (localStorage.getItem('kr_admin_theme') || 'light') === 'dark';
    $('setSound').checked = localStorage.getItem('kr_sound') === '1';
    $('setRefresh').checked = localStorage.getItem('kr_autorefresh') === '1';
  }

  $('setPing').onclick = health;
  
  $('setTelegramSend').onclick = async function(){
    this.disabled = true;
    try {
      const r = await krAdminFetch('/api/admin/telegram-test', {
        method: 'POST',
        body: JSON.stringify({ message: $('setTelegramText').value })
      });
      $('setTelegramResult').textContent = r.ok ? '✓ Sent' : '✕ Failed';
      krToast(r.ok ? 'Telegram sent' : 'Telegram failed', r.ok ? 'success' : 'error');
    } finally {
      this.disabled = false;
    }
  };

  $('setRequestSave').onclick = async function(){
    const r = await krAdminFetch('/api/admin/operations-settings', {
      method: 'POST',
      body: JSON.stringify({
        returnDays: Number($('setReturnDays').value),
        refundDays: Number($('setRefundDays').value),
        exchangeDays: Number($('setExchangeDays').value)
      })
    });
    krToast(r.ok ? 'Request windows saved' : r.error, r.ok ? 'success' : 'error');
  };

  $('setPathaoSyncBtn').onclick = syncStores;

  $('setPathaoSaveBtn').onclick = async function() {
    this.disabled = true;
    this.textContent = 'Saving...';
    try {
      const r = await krAdminFetch('/api/admin/operations-settings', {
        method: 'POST',
        body: JSON.stringify({
          pathaoEnabled: $('setPathaoEnabled').checked,
          pathaoAutoBook: $('setPathaoAutoBook').checked,
          pathaoMode: $('setPathaoSandbox').checked ? 'sandbox' : 'live',
          pathaoSenderName: $('setPathaoSenderName').value.trim(),
          pathaoSenderPhone: $('setPathaoSenderPhone').value.trim(),
          pathaoDefaultWeight: $('setPathaoWeight').value,
          pathaoDefaultItemType: $('setPathaoItemType').value,
          pathaoDefaultDeliveryType: $('setPathaoDeliveryType').value,
          pathaoStoreId: $('setPathaoStore').value,
          pathaoWebhookSecret: $('setPathaoWebhookSecret').value.trim()
        })
      });
      krToast(r.ok ? 'Pathao settings saved successfully' : r.error, r.ok ? 'success' : 'error');
    } catch (err) {
      krToast(err.message, 'error');
    } finally {
      this.disabled = false;
      this.textContent = 'Save Pathao Settings';
    }
  };

  $('setDark').onchange = function(){
    const t = this.checked ? 'dark' : 'light';
    localStorage.setItem('kr_admin_theme', t);
    document.documentElement.dataset.theme = t;
    krAdminRenderNav('settings');
  };

  $('setSound').onchange = function(){
    localStorage.setItem('kr_sound', this.checked ? '1' : '0');
  };

  $('setRefresh').onchange = function(){
    localStorage.setItem('kr_autorefresh', this.checked ? '1' : '0');
  };

  load();
})();
