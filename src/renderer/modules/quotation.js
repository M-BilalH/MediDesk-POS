/**
 * MediDesk POS - Price Quotation Builder Module
 * Creates formal medicine cost estimates and generates branded A4 printable quotation documents.
 */

function setupQuotationEvents() {
  const btnAdd = document.getElementById('btnAddQuoteRow');
  if (btnAdd) {
    btnAdd.addEventListener('click', addQuoteRow);
  }

  const btnPrint = document.getElementById('btnPrintQuote');
  if (btnPrint) {
    btnPrint.addEventListener('click', renderPrintableQuote);
  }

  const tbody = document.getElementById('quoteItemsBody');
  if (tbody && tbody.children.length === 0) {
    addQuoteRow();
  }
}

function addQuoteRow() {
  const tbody = document.getElementById('quoteItemsBody');
  if (!tbody) return;

  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td>
      <select class="form-control quote-prod-select" style="font-weight:bold;"></select>
    </td>
    <td>
      <select class="form-control quote-unit-select">
        <option value="PACK">PACK</option>
        <option value="SINGLE" selected>SINGLE</option>
      </select>
    </td>
    <td>
      <input type="number" class="form-control quote-qty-input" value="1" min="1" style="width:70px;">
    </td>
    <td>
      <input type="number" class="form-control quote-price-input" placeholder="0.00" step="0.01" style="width:100px;">
    </td>
    <td class="quote-row-total" style="font-weight:bold;">Rs 0.00</td>
    <td>
      <button class="btn btn-secondary" style="padding:2px 6px; color:var(--danger);" onclick="this.closest('tr').remove(); calculateQuoteTotals();">✕</button>
    </td>
  `;
  tbody.appendChild(tr);

  const sel = tr.querySelector('.quote-prod-select');
  if (sel) {
    sel.innerHTML = '<option value="">-- Select Product --</option>';
    (productsList || []).forEach(p => {
      sel.innerHTML += `<option value="${p.id}" data-packprice="${p.sale_price_cents || 0}" data-singleprice="${p.single_price_cents || 0}">${escapeHtml(p.title)}</option>`;
    });

    sel.addEventListener('change', () => {
      const opt = sel.options[sel.selectedIndex];
      if (opt && opt.value) {
        const unitType = tr.querySelector('.quote-unit-select')?.value;
        const priceCents = unitType === 'PACK'
          ? parseFloat(opt.getAttribute('data-packprice') || '0')
          : parseFloat(opt.getAttribute('data-singleprice') || '0');
        const priceInput = tr.querySelector('.quote-price-input');
        if (priceInput) priceInput.value = (priceCents / 100).toFixed(2);
        calculateQuoteTotals();
      }
    });
  }

  const unitSelect = tr.querySelector('.quote-unit-select');
  if (unitSelect) {
    unitSelect.addEventListener('change', () => {
      if (sel && sel.selectedIndex >= 0) {
        const opt = sel.options[sel.selectedIndex];
        if (opt && opt.value) {
          const unitType = unitSelect.value;
          const priceCents = unitType === 'PACK'
            ? parseFloat(opt.getAttribute('data-packprice') || '0')
            : parseFloat(opt.getAttribute('data-singleprice') || '0');
          const priceInput = tr.querySelector('.quote-price-input');
          if (priceInput) priceInput.value = (priceCents / 100).toFixed(2);
          calculateQuoteTotals();
        }
      }
    });
  }

  const qtyInput = tr.querySelector('.quote-qty-input');
  if (qtyInput) qtyInput.addEventListener('input', calculateQuoteTotals);

  const priceInput = tr.querySelector('.quote-price-input');
  if (priceInput) priceInput.addEventListener('input', calculateQuoteTotals);
}

function calculateQuoteTotals() {
  document.querySelectorAll('#quoteItemsBody tr').forEach(tr => {
    const qty = parseInt(tr.querySelector('.quote-qty-input')?.value) || 0;
    const price = parseFloat(tr.querySelector('.quote-price-input')?.value) || 0;
    const total = qty * price;
    const totalEl = tr.querySelector('.quote-row-total');
    if (totalEl) totalEl.textContent = `Rs ${total.toFixed(2)}`;
  });
}

function renderPrintableQuote() {
  const custName = document.getElementById('quoteCustomerName')?.value.trim() || 'Valued Client';
  const custPhone = document.getElementById('quoteCustomerPhone')?.value.trim() || 'N/A';

  let grandTotal = 0;
  let rowsHtml = '';

  document.querySelectorAll('#quoteItemsBody tr').forEach(tr => {
    const sel = tr.querySelector('.quote-prod-select');
    const prodName = sel && sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].text : '';
    const unitType = tr.querySelector('.quote-unit-select')?.value || 'SINGLE';
    const qty = parseInt(tr.querySelector('.quote-qty-input')?.value) || 0;
    const price = parseFloat(tr.querySelector('.quote-price-input')?.value) || 0;
    const lineTotal = qty * price;
    grandTotal += lineTotal;

    if (prodName && !prodName.includes('-- Select Product --') && qty > 0) {
      rowsHtml += `
        <tr>
          <td style="padding:8px; border-bottom:1px solid #ccc;">${escapeHtml(prodName)}</td>
          <td style="padding:8px; border-bottom:1px solid #ccc; text-align:center;">${escapeHtml(unitType)}</td>
          <td style="padding:8px; border-bottom:1px solid #ccc; text-align:center;">${qty}</td>
          <td style="padding:8px; border-bottom:1px solid #ccc; text-align:right;">Rs ${price.toFixed(2)}</td>
          <td style="padding:8px; border-bottom:1px solid #ccc; text-align:right; font-weight:bold;">Rs ${lineTotal.toFixed(2)}</td>
        </tr>
      `;
    }
  });

  const docHtml = `
    <div style="display:flex; justify-content:space-between; border-bottom:2px solid #333; padding-bottom:10px; margin-bottom:15px;">
      <div>
        <h2 style="margin:0; color:#1a365d;">${escapeHtml(settings?.store_name || 'MediDesk Pharmacy')}</h2>
        <div>${escapeHtml(settings?.store_address || '')} | Tel: ${escapeHtml(settings?.store_phone || '')}</div>
      </div>
      <div style="text-align:right;">
        <h3 style="margin:0; color:#2b6cb0;">FORMAL PRICE QUOTATION</h3>
        <div>Quote Ref: <strong>QT-${Date.now().toString().slice(-6)}</strong></div>
        <div>Valid Until: ${new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toLocaleDateString()}</div>
      </div>
    </div>

    <div style="background:#f7fafc; padding:12px; border-radius:6px; margin-bottom:15px;">
      <div><strong>Prepared For:</strong> ${escapeHtml(custName)}</div>
      <div><strong>Contact Phone:</strong> ${escapeHtml(custPhone)}</div>
    </div>

    <table style="width:100%; border-collapse:collapse; font-size:12px;">
      <thead>
        <tr style="background:#edf2f7;">
          <th style="padding:8px; text-align:left;">Product</th>
          <th style="padding:8px; text-align:center;">Unit Type</th>
          <th style="padding:8px; text-align:center;">Quantity</th>
          <th style="padding:8px; text-align:right;">Unit Price</th>
          <th style="padding:8px; text-align:right;">Total Amount</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml || '<tr><td colspan="5" style="text-align:center; padding:15px;">No quote items added.</td></tr>'}
      </tbody>
    </table>

    <div style="text-align:right; font-size:16px; font-weight:bold; margin-top:15px; color:#1a365d;">
      ESTIMATED GRAND TOTAL: Rs ${grandTotal.toFixed(2)}
    </div>

    <div style="margin-top:30px; font-size:11px; color:#555;">
      <em>Note: This quotation is generated based on current shelf prices and stock availability. Prices subject to change without prior notice.</em>
    </div>
  `;

  const modalTitle = document.getElementById('a4ModalTitle');
  if (modalTitle) modalTitle.textContent = `A4 Price Quotation - ${custName}`;

  const container = document.getElementById('a4DocumentContainer');
  if (container) container.innerHTML = docHtml;

  const modal = document.getElementById('modalA4Preview');
  if (modal) modal.classList.add('active');

  const btnPrint = document.getElementById('btnPrintA4Now');
  if (btnPrint) {
    btnPrint.onclick = () => window.api.print();
  }
}
