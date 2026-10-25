/**
 * MediDesk POS - Sales History & Void Transactions Module
 * Handles sales journal listing, pagination via real count IPC, invoice reprinting, voiding, and prescription file attachments.
 */

function setupSalesEvents() {
  const voidForm = document.getElementById('voidForm');
  const rxFileInput = document.getElementById('invoiceRxFileInput');

  if (voidForm) {
    voidForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const saleId = parseInt(document.getElementById('voidSaleId')?.value);
      const reason = document.getElementById('voidReasonInput')?.value.trim();

      if (!reason) {
        showToast('Please enter a reason for voiding this invoice.', 'error');
        return;
      }

      await performVoidSale(saleId, reason);
      const modal = document.getElementById('modalVoidSale');
      if (modal) modal.classList.remove('active');
    });
  }

  // Attach prescription to historical invoice file listener
  if (rxFileInput) {
    rxFileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (file && activeRxSaleId) {
        const reader = new FileReader();
        reader.onload = async () => {
          const base64Data = reader.result.split(',')[1];
          const saveRes = await window.api.savePrescription({ fileName: file.name, base64Data });
          if (saveRes && saveRes.success) {
            const path = saveRes.filePath || saveRes.relativePath;
            const dbRes = await window.api.updateSalePrescription(activeRxSaleId, path);
            if (dbRes && dbRes.success) {
              showToast('Prescription image attached successfully to invoice!');
              activeRxSaleId = null;
              renderSalesTable();
            } else {
              showToast('Failed to update prescription link: ' + (dbRes?.error || 'Database error'), 'error');
            }
          } else {
            showToast('Failed to save prescription file: ' + (saveRes?.error || 'File write error'), 'error');
          }
        };
        reader.readAsDataURL(file);
      }
    });
  }
}

function setupPaginationListeners() {
  // Inventory pagination
  document.getElementById('btnInvPrevPage')?.addEventListener('click', () => {
    if (invCurrentPage > 1) {
      invCurrentPage--;
      if (typeof renderInventoryTable === 'function') renderInventoryTable();
    }
  });

  document.getElementById('btnInvNextPage')?.addEventListener('click', () => {
    const totalCount = productsList ? productsList.length : 0;
    const maxPage = Math.ceil(totalCount / INV_PAGE_SIZE) || 1;
    if (invCurrentPage < maxPage) {
      invCurrentPage++;
      if (typeof renderInventoryTable === 'function') renderInventoryTable();
    }
  });

  // Khata pagination
  document.getElementById('btnKhataPrevPage')?.addEventListener('click', () => {
    if (khataCurrentPage > 1) {
      khataCurrentPage--;
      if (typeof renderCustomerTable === 'function') renderCustomerTable();
    }
  });

  document.getElementById('btnKhataNextPage')?.addEventListener('click', () => {
    const totalCount = customersList ? customersList.length : 0;
    const maxPage = Math.ceil(totalCount / KHATA_PAGE_SIZE) || 1;
    if (khataCurrentPage < maxPage) {
      khataCurrentPage++;
      if (typeof renderCustomerTable === 'function') renderCustomerTable();
    }
  });

  // Sales pagination (Uses real totalCount from api.getSalesCount() instead of hardcoded 100)
  document.getElementById('btnSalesPrevPage')?.addEventListener('click', () => {
    if (salesCurrentPage > 1) {
      salesCurrentPage--;
      renderSalesTable();
    }
  });

  document.getElementById('btnSalesNextPage')?.addEventListener('click', async () => {
    const countRes = await window.api.getSalesCount();
    const totalCount = (countRes && countRes.success && typeof countRes.data === 'number') ? countRes.data : 0;
    const maxPage = Math.ceil(totalCount / SALES_PAGE_SIZE) || 1;
    if (salesCurrentPage < maxPage) {
      salesCurrentPage++;
      renderSalesTable();
    }
  });
}

async function renderSalesTable() {
  const tbody = document.getElementById('salesTableBody');
  if (!tbody) return;

  const infoEl = document.getElementById('salesPaginationInfo');
  const pageNumEl = document.getElementById('salesPageNum');
  const btnPrev = document.getElementById('btnSalesPrevPage');
  const btnNext = document.getElementById('btnSalesNextPage');
  tbody.innerHTML = '';

  // Get total sales count and current page records from Named IPC
  const [salesRes, countRes] = await Promise.all([
    window.api.getSales(salesCurrentPage, SALES_PAGE_SIZE),
    window.api.getSalesCount()
  ]);

  const totalCount = (countRes && countRes.success && typeof countRes.data === 'number') ? countRes.data : 0;
  const salesList = (salesRes && salesRes.success && Array.isArray(salesRes.data)) ? salesRes.data : [];

  if (totalCount === 0 || salesList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;">No sales invoices recorded yet.</td></tr>`;
    if (infoEl) infoEl.textContent = 'Showing 0-0 of 0 sales';
    if (pageNumEl) pageNumEl.textContent = 'Page 1';
    if (btnPrev) btnPrev.disabled = true;
    if (btnNext) btnNext.disabled = true;
    return;
  }

  const maxPage = Math.ceil(totalCount / SALES_PAGE_SIZE) || 1;
  if (salesCurrentPage > maxPage) salesCurrentPage = maxPage;
  if (salesCurrentPage < 1) salesCurrentPage = 1;

  const startIndex = (salesCurrentPage - 1) * SALES_PAGE_SIZE;

  if (infoEl) infoEl.textContent = `Showing ${startIndex + 1}-${Math.min(startIndex + SALES_PAGE_SIZE, totalCount)} of ${totalCount} sales`;
  if (pageNumEl) pageNumEl.textContent = `Page ${salesCurrentPage} of ${maxPage}`;
  if (btnPrev) btnPrev.disabled = salesCurrentPage <= 1;
  if (btnNext) btnNext.disabled = salesCurrentPage >= maxPage;

  salesList.forEach(s => {
    const isVoid = s.status === 'VOIDED';
    const hasRx = s.prescription_path && s.prescription_path.trim() !== '';

    let rxCellHtml = '';
    if (hasRx) {
      rxCellHtml = `
        <div style="display:flex; gap:4px; align-items:center;">
          <span class="badge badge-success" style="font-size:0.7rem;">✓ Attached</span>
          <button class="btn btn-secondary" style="padding:2px 6px; font-size:0.75rem; color:var(--accent);" onclick="viewInvoicePrescription(${s.id})">👁️ View</button>
          <button class="btn btn-secondary" style="padding:2px 6px; font-size:0.75rem;" onclick="triggerAttachPrescription(${s.id})">🔄 Change</button>
        </div>
      `;
    } else {
      rxCellHtml = `
        <button class="btn btn-secondary" style="padding:2px 6px; font-size:0.75rem;" onclick="triggerAttachPrescription(${s.id})">📷 Attach Rx</button>
      `;
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${escapeHtml(s.invoice_no)}</strong></td>
      <td>${new Date(s.created_at).toLocaleString()}</td>
      <td>${escapeHtml(s.cashier_name)}</td>
      <td>${escapeHtml(s.customer_name)}</td>
      <td>${escapeHtml(s.payment_method)}</td>
      <td><strong>${formatCurrency(s.total_cents)}</strong></td>
      <td>${isVoid ? '<span class="badge badge-danger">VOIDED</span>' : '<span class="badge badge-success">COMPLETED</span>'}</td>
      <td>${rxCellHtml}</td>
      <td style="white-space:nowrap;">
        <button class="btn btn-secondary" style="padding:2px 6px; font-size:0.75rem; margin-right:4px;" onclick="reprintSaleReceipt(${s.id})" title="Print Thermal Receipt">🖨️ Reprint</button>
        <button class="btn btn-primary" style="padding:2px 6px; font-size:0.75rem; margin-right:4px;" onclick="copySaleToCart(${s.id})" title="Load exact items into active POS cart">🛒 Re-order</button>
        ${!isVoid && (currentUser && ['Admin', 'Manager'].includes(currentUser.role)) ? `<button class="btn btn-danger" style="padding:2px 6px; font-size:0.75rem;" onclick="openVoidModal(${s.id}, '${escapeHtml(s.invoice_no)}')">🚫 Void Sale</button>` : (!isVoid ? '' : '<em>Voided</em>')}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.reprintSaleReceipt = async function(saleId) {
  const saleRes = await window.api.getSale(saleId);
  if (!saleRes || !saleRes.success || !saleRes.data) {
    showToast("Invoice details could not be retrieved.", "error");
    return;
  }
  const sale = saleRes.data;

  const itemsRes = await window.api.getSaleItems(saleId);
  const rawItems = (itemsRes && itemsRes.success && Array.isArray(itemsRes.data)) ? itemsRes.data : [];

  const items = rawItems.map(i => ({
    product: { title: i.product_title },
    unitType: i.unit_type,
    priceCents: i.price_cents,
    quantity: i.quantity
  }));

  const receiptData = {
    invoiceNo: sale.invoice_no,
    createdAt: sale.created_at,
    cashierName: sale.cashier_name,
    customerName: sale.customer_name,
    subtotalCents: sale.subtotal_cents,
    taxCents: sale.tax_cents,
    discountCents: sale.discount_cents,
    totalCents: sale.total_cents,
    paidCents: sale.paid_cents,
    changeCents: sale.change_cents,
    paymentMethod: sale.payment_method + (sale.status === 'VOIDED' ? ' [VOIDED]' : ''),
    prescriptionPath: sale.prescription_path,
    items: items
  };

  if (typeof renderThermalReceipt === 'function') {
    renderThermalReceipt(receiptData);
  } else {
    // Standalone thermal receipt renderer fallback
    const container = document.getElementById('receiptContainer');
    if (container) {
      let itemsListHtml = items.map(item => `
        <div style="display:flex; justify-content:space-between; margin-bottom:3px; font-size:12px;">
          <span>${escapeHtml(item.product.title)} (${item.unitType}) x ${item.quantity}</span>
          <span>${formatCurrency(item.priceCents * item.quantity)}</span>
        </div>
      `).join('');

      container.innerHTML = `
        <div style="font-family:monospace; padding:10px; max-width:320px; margin:0 auto; font-size:12px;">
          <div style="text-align:center; margin-bottom:8px;">
            <div style="font-weight:bold; font-size:16px;">${escapeHtml(settings?.store_name || 'MediDesk Pharmacy')}</div>
            <div>${escapeHtml(settings?.store_address || '')}</div>
            <div>Tel: ${escapeHtml(settings?.store_phone || '')}</div>
          </div>
          <hr style="border:0; border-top:1px dashed #666; margin:6px 0;">
          <div style="display:flex; justify-content:space-between;"><span>Inv: #${escapeHtml(receiptData.invoiceNo)}</span><span>${new Date(receiptData.createdAt).toLocaleDateString()}</span></div>
          <div style="display:flex; justify-content:space-between;"><span>Cashier: ${escapeHtml(receiptData.cashierName)}</span><span>Method: ${escapeHtml(receiptData.paymentMethod)}</span></div>
          <hr style="border:0; border-top:1px dashed #666; margin:6px 0;">
          ${itemsListHtml}
          <hr style="border:0; border-top:1px dashed #666; margin:6px 0;">
          <div style="display:flex; justify-content:space-between;"><span>Subtotal:</span><span>${formatCurrency(receiptData.subtotalCents)}</span></div>
          <div style="display:flex; justify-content:space-between;"><span>Tax (FBR):</span><span>${formatCurrency(receiptData.taxCents)}</span></div>
          <div style="display:flex; justify-content:space-between;"><span>Discount:</span><span>-${formatCurrency(receiptData.discountCents)}</span></div>
          <div style="display:flex; justify-content:space-between; font-weight:bold; font-size:14px; margin-top:4px;"><span>Total:</span><span>${formatCurrency(receiptData.totalCents)}</span></div>
          <div style="display:flex; justify-content:space-between;"><span>Paid:</span><span>${formatCurrency(receiptData.paidCents)}</span></div>
          <div style="display:flex; justify-content:space-between;"><span>Change:</span><span>${formatCurrency(receiptData.changeCents)}</span></div>
          <div style="text-align:center; margin-top:10px; font-size:11px;">${escapeHtml(settings?.receipt_disclaimer || 'Thank you for your visit!')}</div>
          <div style="margin-top:6px; font-weight:bold; font-size:11px; text-align:center;">MediDesk by Syed Bilal</div>
          <div style="font-size:10px; text-align:center;">Software developed by Syed Bilal (contact : 0330-449560)</div>
        </div>
      `;
    }
  }

  const modal = document.getElementById('modalReceiptPreview');
  if (modal) modal.classList.add('active');

  const btnPrint = document.getElementById('btnPrintReceiptNow');
  if (btnPrint) {
    btnPrint.onclick = () => window.api.print();
  }
};

window.copySaleToCart = async function(saleId) {
  if (!saleId) return;

  const saleRes = await window.api.getSale(saleId);
  if (!saleRes || !saleRes.success || !saleRes.data) {
    showToast("Invoice details could not be retrieved.", "error");
    return;
  }
  const sale = saleRes.data;

  const itemsRes = await window.api.getSaleItems(saleId);
  if (!itemsRes || !itemsRes.success || !Array.isArray(itemsRes.data) || itemsRes.data.length === 0) {
    showToast("No items found in this invoice.", "error");
    return;
  }

  let addedCount = 0;
  let skippedCount = 0;

  for (const item of itemsRes.data) {
    const product = (productsList || []).find(p => p.id === item.product_id);
    if (!product) {
      skippedCount++;
      continue;
    }

    const unitType = item.unit_type === 'PACK' ? 'PACK' : 'SINGLE';
    const priceCents = unitType === 'PACK' ? (product.sale_price_cents || 0) : (product.single_price_cents || 0);

    const existingIndex = (cart || []).findIndex(ci => ci.product.id === product.id && ci.unitType === unitType);
    if (existingIndex > -1) {
      cart[existingIndex].quantity += item.quantity;
    } else {
      if (!Array.isArray(cart)) cart = [];
      cart.push({
        product: product,
        unitType: unitType,
        quantity: item.quantity,
        priceCents: priceCents
      });
    }
    addedCount++;
  }

  if (sale.customer_id) {
    const custSelect = document.getElementById('cartCustomerSelect');
    if (custSelect) {
      custSelect.value = sale.customer_id;
      if (typeof updateCartCustomerStatus === 'function') updateCartCustomerStatus();
    }
  }

  if (typeof renderCart === 'function') renderCart();

  const modal = document.getElementById('modalReceiptPreview');
  if (modal) modal.classList.remove('active');

  if (typeof switchView === 'function') switchView('posView');

  if (addedCount > 0) {
    showToast(`Loaded ${addedCount} item(s) from Invoice #${sale.invoice_no} into cart!`);
  }
  if (skippedCount > 0) {
    showToast(`${skippedCount} item(s) skipped as they no longer exist in inventory master.`, "error");
  }
};

window.triggerAttachPrescription = function(saleId) {
  activeRxSaleId = saleId;
  const fileInput = document.getElementById('invoiceRxFileInput');
  if (fileInput) fileInput.click();
};

window.viewInvoicePrescription = async function(saleId) {
  const res = await window.api.getSale(saleId);
  if (res && res.success && res.data && res.data.prescription_path) {
    const rxPath = res.data.prescription_path;
    const formattedUrl = rxPath.startsWith('http') || rxPath.startsWith('file://') ? rxPath : `file:///${rxPath.replace(/\\/g, '/')}`;

    const titleEl = document.getElementById('rxModalInvoiceTitle');
    if (titleEl) titleEl.textContent = `📷 Prescription Copy - Invoice #${res.data.invoice_no}`;

    const imgEl = document.getElementById('prescriptionImageElement');
    if (imgEl) imgEl.src = formattedUrl;

    const modal = document.getElementById('modalPrescriptionViewer');
    if (modal) modal.classList.add('active');
  } else {
    showToast('No prescription image attached to this invoice.', 'error');
  }
};

window.openVoidModal = function(saleId, invoiceNo) {
  const idInput = document.getElementById('voidSaleId');
  const invInput = document.getElementById('voidInvoiceNo');
  const reasonInput = document.getElementById('voidReasonInput');

  if (idInput) idInput.value = saleId;
  if (invInput) invInput.value = invoiceNo;
  if (reasonInput) reasonInput.value = '';

  const modal = document.getElementById('modalVoidSale');
  if (modal) modal.classList.add('active');
  restoreActiveFocus(reasonInput);
};

window.performVoidSale = async function(saleId, reason) {
  // Role check: Admin or Manager only
  if (typeof requireRole === 'function') {
    if (!requireRole('Admin', 'Manager')) return;
  } else if (currentUser && !['Admin', 'Manager'].includes(currentUser.role)) {
    showToast('Unauthorized: Admin or Manager role required to void sales.', 'error');
    return;
  }

  const userId = currentUser ? currentUser.id : 1;
  const userName = currentUser ? currentUser.name : 'Administrator';

  const res = await window.api.voidSale(saleId, reason, userId, userName);
  if (res && res.success) {
    showToast(`Invoice #${saleId} voided successfully! Stock restored.`);
    if (typeof loadMasterData === 'function') await loadMasterData();
    renderSalesTable();
  } else {
    showToast('Failed to void invoice: ' + (res?.error || 'Unknown error'), 'error');
  }
};
