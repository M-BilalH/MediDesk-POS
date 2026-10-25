/**
 * MediDesk POS - Expiry Center & Stock Depletion Module
 * Provides 6-month expiry warning board, stock discarding, and badge telemetry.
 */

async function renderExpiryCenter() {
  const tbody = document.getElementById('expiryTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const res = await window.api.getExpiryProducts();
  const products = (res && res.success && Array.isArray(res.data)) ? res.data : (productsList || []);

  const today = new Date();
  let expiredCount = 0;
  let exp30Count = 0;
  let exp90Count = 0;
  let exp180Count = 0;

  products.forEach(p => {
    const expDate = new Date(p.expiry_date);
    const diffDays = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));

    let statusTag = '';
    if (diffDays < 0) {
      expiredCount++;
      statusTag = '<span class="badge badge-danger">EXPIRED</span>';
    } else if (diffDays <= 30) {
      exp30Count++;
      statusTag = '<span class="badge badge-danger">Expiring &lt; 30 Days</span>';
    } else if (diffDays <= 90) {
      exp90Count++;
      statusTag = '<span class="badge badge-warning">Expiring &lt; 90 Days (3 Mo)</span>';
    } else if (diffDays <= 180) {
      exp180Count++;
      statusTag = '<span class="badge badge-warning" style="background:hsla(38, 92%, 50%, 0.25); color:var(--warning);">⚠️ 6-Month Warning (&lt; 180 Days)</span>';
    } else {
      return;
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${escapeHtml(p.title)}</strong></td>
      <td>${escapeHtml(p.barcode)}</td>
      <td>${escapeHtml(p.expiry_date)}</td>
      <td>${statusTag}</td>
      <td>${p.quantity_packs}</td>
      <td>${p.quantity_singles}</td>
      <td>
        ${(currentUser && ['Admin', 'Manager'].includes(currentUser.role)) ? `<button class="btn btn-danger" style="padding:2px 6px; font-size:0.75rem;" onclick="discardExpiredStock(${p.id})">🗑️ Discard Stock</button>` : '<span style="color:var(--text-muted); font-size:0.75rem;">View Only</span>'}
      </td>
    `;
    tbody.appendChild(tr);
  });

  const statExpired = document.getElementById('statExpired');
  if (statExpired) statExpired.textContent = expiredCount;

  const statExp30 = document.getElementById('statExp30');
  if (statExp30) statExp30.textContent = exp30Count;

  const statExp90 = document.getElementById('statExp90');
  if (statExp90) statExp90.textContent = exp90Count;

  const statExp180 = document.getElementById('statExp180');
  if (statExp180) statExp180.textContent = exp180Count;

  if (tbody.children.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:15px; color:var(--accent);">🎉 All inventory products have valid expiries (> 180 days).</td></tr>`;
  }
}

async function updateExpiryBadge() {
  const badge = document.getElementById('expiryCountBadge');
  if (!badge) return;

  const res = await window.api.getExpiryCount();
  const cnt = (res && res.success && typeof res.data === 'number') ? res.data : 0;

  if (cnt > 0) {
    badge.textContent = `${cnt} (6-Mo Warning)`;
    badge.style.display = 'inline-block';
  } else {
    badge.style.display = 'none';
  }
}

async function updateLowStockBadge() {
  const badge = document.getElementById('lowStockCountBadge');
  if (!badge) return;

  const res = await window.api.getLowStockCount();
  const cnt = (res && res.success && typeof res.data === 'number') ? res.data : 0;

  if (cnt > 0) {
    badge.textContent = `${cnt} Low Stock`;
    badge.style.display = 'inline-block';
  } else {
    badge.style.display = 'none';
  }
}

window.discardExpiredStock = async function(productId) {
  if (confirm('Zero out expired stock for this product?')) {
    const res = await window.api.discardStock(productId);
    if (res && res.success) {
      showToast('Expired stock discarded and zeroed out.');
      if (typeof loadMasterData === 'function') await loadMasterData();
      renderExpiryCenter();
      updateExpiryBadge();
      updateLowStockBadge();
    } else {
      showToast('Failed to discard stock: ' + (res?.error || 'Unknown error'), 'error');
    }
  }
};
