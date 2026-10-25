/**
 * MediDesk POS - Restock Order Builder & Purchase Order Generator
 * Identifies low-stock and depleted products and generates printable A4 supplier purchase orders.
 */

function setupRestockEvents() {
  document.querySelectorAll('input[name="stockFilter"]').forEach(r => {
    r.addEventListener('change', renderRestockTable);
  });

  const supSelect = document.getElementById('supplierOrderSelect');
  if (supSelect) {
    supSelect.addEventListener('change', renderRestockTable);
  }

  const btnPO = document.getElementById('btnGeneratePO');
  if (btnPO) {
    btnPO.addEventListener('click', generateSupplierPO);
  }
}

function renderRestockTable() {
  const checkedFilter = document.querySelector('input[name="stockFilter"]:checked');
  const filter = checkedFilter ? checkedFilter.value : 'LOW';
  const supplierId = document.getElementById('supplierOrderSelect')?.value || '';
  const tbody = document.getElementById('restockTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const filtered = (productsList || []).filter(p => {
    const isLow = p.quantity_packs <= (p.min_stock_level || 5);
    const isOut = p.quantity_packs === 0;

    let matchesType = true;
    if (filter === 'LOW') matchesType = isLow;
    if (filter === 'OUT') matchesType = isOut;

    const matchesSup = !supplierId || (p.supplier_id && p.supplier_id.toString() === supplierId);
    return matchesType && matchesSup;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;">No products matching restock criteria.</td></tr>`;
    return;
  }

  filtered.forEach(p => {
    const tr = document.createElement('tr');
    const reqPacks = Math.max(10, ((p.min_stock_level || 5) * 2) - (p.quantity_packs || 0));
    const estAmount = (p.sale_price_cents || 0) * reqPacks;

    tr.innerHTML = `
      <td><strong>${escapeHtml(p.title)}</strong></td>
      <td>${escapeHtml(p.supplier_name || 'N/A')}</td>
      <td style="color:${p.quantity_packs === 0 ? 'var(--danger)' : 'var(--warning)'}; font-weight:bold;">${p.quantity_packs}</td>
      <td>${p.min_stock_level || 5}</td>
      <td>${p.pack_size || 10}</td>
      <td><input type="number" class="form-control po-qty-input" data-prodid="${p.id}" value="${reqPacks}" min="1" style="width:80px; padding:2px 6px;"></td>
      <td>${formatCurrency(estAmount)}</td>
    `;
    tbody.appendChild(tr);
  });
}

function generateSupplierPO() {
  const supId = document.getElementById('supplierOrderSelect')?.value;
  const sup = (suppliersList || []).find(s => s.id.toString() === supId) || {
    name: 'General Distributor / All Suppliers',
    contact_person: 'Sales Department',
    phone: 'N/A'
  };

  const inputs = document.querySelectorAll('.po-qty-input');
  let poItems = [];

  inputs.forEach(input => {
    const prodId = parseInt(input.getAttribute('data-prodid'));
    const qty = parseInt(input.value) || 0;
    const prod = (productsList || []).find(p => p.id === prodId);
    if (prod && qty > 0) {
      poItems.push({ prod, qty });
    }
  });

  if (poItems.length === 0) {
    showToast('No restock items selected for Purchase Order.', 'error');
    return;
  }

  let grandEstimatedCents = 0;
  let itemsHtml = poItems.map(item => {
    const lineCents = (item.prod.sale_price_cents || 0) * item.qty;
    grandEstimatedCents += lineCents;
    return `
      <tr>
        <td style="padding:8px; border-bottom:1px solid #ccc;">${escapeHtml(item.prod.title)}</td>
        <td style="padding:8px; border-bottom:1px solid #ccc;">${escapeHtml(item.prod.generic_name || '')}</td>
        <td style="padding:8px; border-bottom:1px solid #ccc; text-align:center;">${item.prod.pack_size || 10} singles</td>
        <td style="padding:8px; border-bottom:1px solid #ccc; text-align:center; font-weight:bold;">${item.qty} Packs</td>
        <td style="padding:8px; border-bottom:1px solid #ccc; text-align:right;">${formatCurrency(item.prod.sale_price_cents || 0)}</td>
        <td style="padding:8px; border-bottom:1px solid #ccc; text-align:right; font-weight:bold;">${formatCurrency(lineCents)}</td>
      </tr>
    `;
  }).join('');

  const docHtml = `
    <div style="display:flex; justify-content:space-between; border-bottom:2px solid #333; padding-bottom:10px; margin-bottom:15px;">
      <div>
        <h2 style="margin:0; color:#1a365d;">${escapeHtml(settings?.store_name || 'MediDesk Pharmacy')}</h2>
        <div>${escapeHtml(settings?.store_address || '')} | Tel: ${escapeHtml(settings?.store_phone || '')}</div>
      </div>
      <div style="text-align:right;">
        <h3 style="margin:0; color:#2b6cb0;">SUPPLIER PURCHASE ORDER (PO)</h3>
        <div>PO Ref: <strong>PO-${Date.now().toString().slice(-6)}</strong></div>
        <div>Date: ${new Date().toLocaleDateString()}</div>
      </div>
    </div>

    <div style="background:#f7fafc; padding:12px; border-radius:6px; margin-bottom:15px;">
      <div><strong>To Supplier:</strong> ${escapeHtml(sup.name)}</div>
      <div><strong>Contact Rep:</strong> ${escapeHtml(sup.contact_person || 'N/A')} | Tel: ${escapeHtml(sup.phone || 'N/A')}</div>
    </div>

    <table style="width:100%; border-collapse:collapse; font-size:12px;">
      <thead>
        <tr style="background:#edf2f7;">
          <th style="padding:8px; text-align:left;">Product Title</th>
          <th style="padding:8px; text-align:left;">Generic</th>
          <th style="padding:8px; text-align:center;">Pack Size</th>
          <th style="padding:8px; text-align:center;">Requested Qty</th>
          <th style="padding:8px; text-align:right;">Est. Cost/Pack</th>
          <th style="padding:8px; text-align:right;">Line Total</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHtml}
      </tbody>
    </table>

    <div style="text-align:right; margin-top:15px; font-size:14px; font-weight:bold; color:#1a365d;">
      Estimated Total PO Value: ${formatCurrency(grandEstimatedCents)}
    </div>

    <div style="margin-top:40px; display:flex; justify-content:space-between; font-size:12px;">
      <div>
        <div>___________________________</div>
        <div>Authorized Pharmacist Signature</div>
      </div>
      <div style="text-align:right;">
        <div>___________________________</div>
        <div>Supplier Receiver Stamp / Sign</div>
      </div>
    </div>
  `;

  const modalTitle = document.getElementById('a4ModalTitle');
  if (modalTitle) modalTitle.textContent = `A4 Supplier Purchase Order - ${sup.name}`;

  const container = document.getElementById('a4DocumentContainer');
  if (container) container.innerHTML = docHtml;

  const modal = document.getElementById('modalA4Preview');
  if (modal) modal.classList.add('active');

  const btnPrint = document.getElementById('btnPrintA4Now');
  if (btnPrint) {
    btnPrint.onclick = () => window.api.print();
  }
}
