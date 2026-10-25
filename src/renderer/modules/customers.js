/**
 * MediDesk POS - Customer & Khata (Store Credit) Ledger Module
 * Handles customer registration, credit tracking, payment recording, and A4 ledger statement generation.
 */

function setupKhataEvents() {
  const btnOpenAdd = document.getElementById('btnOpenAddCustomer');
  const modalAddCust = document.getElementById('modalAddCustomer');

  // Open Add Customer Modal (replaces legacy prompt() calls)
  if (btnOpenAdd && modalAddCust) {
    btnOpenAdd.addEventListener('click', () => {
      const form = document.getElementById('addCustomerForm');
      if (form) form.reset();
      modalAddCust.classList.add('active');
      restoreActiveFocus(document.getElementById('custNameInput'));
    });
  }

  // Payment Form Submit Handler
  const paymentForm = document.getElementById('paymentForm');
  if (paymentForm) {
    paymentForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const custId = parseInt(document.getElementById('payCustomerId')?.value);
      const cust = (customersList || []).find(c => c.id === custId);
      const payRs = parseFloat(document.getElementById('payAmountInput')?.value) || 0;
      const payCents = Math.round(payRs * 100);
      const notes = document.getElementById('payNotesInput')?.value.trim() || 'Cash received at counter';

      if (!custId || isNaN(custId)) {
        showToast('Invalid customer ID.', 'error');
        return;
      }

      if (payCents <= 0) {
        showToast('Please enter a valid payment amount greater than zero.', 'error');
        return;
      }

      const res = await window.api.recordPayment(custId, payCents, notes);
      if (res && res.success) {
        const custName = cust ? cust.name : 'Customer';
        showToast(`Payment of ${formatCurrency(payCents)} recorded for ${custName}!`);
        const modal = document.getElementById('modalRecordPayment');
        if (modal) modal.classList.remove('active');
        if (typeof loadMasterData === 'function') await loadMasterData();
        renderCustomerTable();
        if (typeof populateCustomerDropdowns === 'function') populateCustomerDropdowns();
      } else {
        showToast('Failed to record payment: ' + (res?.error || 'Unknown error'), 'error');
      }
    });
  }
}

function setupAddCustomerModal() {
  const form = document.getElementById('addCustomerForm');
  const modal = document.getElementById('modalAddCustomer');

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const name = document.getElementById('custNameInput')?.value.trim();
      const phone = document.getElementById('custPhoneInput')?.value.trim() || '';
      const address = document.getElementById('custAddressInput')?.value.trim() || '';
      const limitInput = document.getElementById('custCreditLimitInput')?.value || '5000';
      const creditLimitCents = parseCurrencyToCents(limitInput);

      if (!name) {
        showToast('Customer name is required.', 'error');
        return;
      }

      const payload = {
        name,
        phone,
        address,
        credit_limit_cents: creditLimitCents
      };

      const res = await window.api.addCustomer(payload);
      if (res && res.success) {
        showToast(`Customer "${name}" created with Credit Limit ${formatCurrency(creditLimitCents)}`);
        if (modal) modal.classList.remove('active');
        form.reset();
        if (typeof loadMasterData === 'function') await loadMasterData();
        renderCustomerTable();
        if (typeof populateCustomerDropdowns === 'function') populateCustomerDropdowns();
        restoreActiveFocus();
      } else {
        showToast('Failed to create customer: ' + (res?.error || 'Unknown error'), 'error');
      }
    });
  }
}

function renderCustomerTable() {
  const tbody = document.getElementById('customerTableBody');
  if (!tbody) return;

  const infoEl = document.getElementById('khataPaginationInfo');
  const pageNumEl = document.getElementById('khataPageNum');
  const btnPrev = document.getElementById('btnKhataPrevPage');
  const btnNext = document.getElementById('btnKhataNextPage');
  tbody.innerHTML = '';

  const totalCount = customersList ? customersList.length : 0;
  if (totalCount === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;">No customer accounts registered.</td></tr>`;
    if (infoEl) infoEl.textContent = 'Showing 0-0 of 0 customers';
    if (pageNumEl) pageNumEl.textContent = 'Page 1';
    if (btnPrev) btnPrev.disabled = true;
    if (btnNext) btnNext.disabled = true;
    return;
  }

  const maxPage = Math.ceil(totalCount / KHATA_PAGE_SIZE) || 1;
  if (khataCurrentPage > maxPage) khataCurrentPage = maxPage;
  if (khataCurrentPage < 1) khataCurrentPage = 1;

  const startIndex = (khataCurrentPage - 1) * KHATA_PAGE_SIZE;
  const pageCustomers = customersList.slice(startIndex, startIndex + KHATA_PAGE_SIZE);

  if (infoEl) infoEl.textContent = `Showing ${startIndex + 1}-${Math.min(startIndex + KHATA_PAGE_SIZE, totalCount)} of ${totalCount} customers`;
  if (pageNumEl) pageNumEl.textContent = `Page ${khataCurrentPage} of ${maxPage}`;
  if (btnPrev) btnPrev.disabled = khataCurrentPage <= 1;
  if (btnNext) btnNext.disabled = khataCurrentPage >= maxPage;

  pageCustomers.forEach(c => {
    const isWalkIn = c.id === 1;
    const availCredit = c.credit_limit_cents - c.current_debt_cents;
    const isOverLimit = c.current_debt_cents > c.credit_limit_cents;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>#${c.id}</td>
      <td><strong>${escapeHtml(c.name)}</strong> ${isWalkIn ? '<span class="badge badge-danger">Walk-in</span>' : ''}</td>
      <td>${escapeHtml(c.phone || 'N/A')}</td>
      <td>${escapeHtml(c.address || '')}</td>
      <td>${formatCurrency(c.credit_limit_cents)}</td>
      <td style="color:${c.current_debt_cents > 0 ? 'var(--danger)' : 'var(--accent)'}; font-weight:700;">
        ${formatCurrency(c.current_debt_cents)}
      </td>
      <td>${isWalkIn ? 'N/A' : formatCurrency(availCredit)}</td>
      <td>${isOverLimit ? '<span class="badge badge-danger">Over Limit</span>' : '<span class="badge badge-success">Good</span>'}</td>
      <td>
        ${!isWalkIn ? `
          <button class="btn btn-primary" style="padding:2px 6px; font-size:0.75rem;" onclick="openPaymentModal(${c.id})">💵 Record Payment</button>
          <button class="btn btn-secondary" style="padding:2px 6px; font-size:0.75rem;" onclick="generateA4LedgerStatement(${c.id})">📄 A4 Ledger PDF</button>
        ` : '<em>Prohibited</em>'}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.openPaymentModal = function(custId) {
  const cust = (customersList || []).find(c => c.id === custId);
  if (cust) {
    document.getElementById('payCustomerId').value = cust.id;
    document.getElementById('payCustomerName').value = cust.name;
    document.getElementById('payCurrentDebt').value = formatCurrency(cust.current_debt_cents);
    document.getElementById('payAmountInput').value = '';
    const modal = document.getElementById('modalRecordPayment');
    if (modal) modal.classList.add('active');
    restoreActiveFocus(document.getElementById('payAmountInput'));
  }
};

window.generateA4LedgerStatement = async function(custId) {
  const cust = (customersList || []).find(c => c.id === custId);
  if (!cust) return;

  // Retrieve ledger entries via named API or fallback query
  let ledgerRows = [];
  if (typeof window.api.getCustomerLedger === 'function') {
    const res = await window.api.getCustomerLedger(custId);
    if (res && res.success && res.data) ledgerRows = res.data;
  } else if (typeof window.api.query === 'function') {
    const res = await window.api.query(
      "SELECT * FROM customer_ledger WHERE customer_id = ? ORDER BY created_at ASC;",
      [custId]
    );
    if (res && res.success && res.data) ledgerRows = res.data;
  }

  const rowsHtml = ledgerRows.map(l => `
    <tr>
      <td style="padding:8px; border-bottom:1px solid #ccc;">${new Date(l.created_at).toLocaleString()}</td>
      <td style="padding:8px; border-bottom:1px solid #ccc;"><strong>${escapeHtml(l.type)}</strong></td>
      <td style="padding:8px; border-bottom:1px solid #ccc;">${escapeHtml(l.notes || '')}</td>
      <td style="padding:8px; border-bottom:1px solid #ccc; color:red; text-align:right;">${l.debit_cents ? formatCurrency(l.debit_cents) : '-'}</td>
      <td style="padding:8px; border-bottom:1px solid #ccc; color:green; text-align:right;">${l.credit_cents ? formatCurrency(l.credit_cents) : '-'}</td>
      <td style="padding:8px; border-bottom:1px solid #ccc; text-align:right; font-weight:bold;">${formatCurrency(l.balance_after_cents)}</td>
    </tr>
  `).join('');

  const documentHtml = `
    <div style="display:flex; justify-content:space-between; border-bottom:2px solid #333; padding-bottom:10px; margin-bottom:15px;">
      <div>
        <h2 style="margin:0; font-size:20px; color:#1a365d;">${escapeHtml(settings?.store_name || 'MediDesk Pharmacy')}</h2>
        <div>${escapeHtml(settings?.store_address || '')} | Tel: ${escapeHtml(settings?.store_phone || '')}</div>
      </div>
      <div style="text-align:right;">
        <h3 style="margin:0; color:#2b6cb0;">CUSTOMER LEDGER STATEMENT</h3>
        <div>Date: ${new Date().toLocaleDateString()}</div>
      </div>
    </div>

    <div style="background:#f7fafc; padding:12px; border-radius:6px; margin-bottom:15px; display:flex; justify-content:space-between;">
      <div>
        <div><strong>Customer Name:</strong> ${escapeHtml(cust.name)}</div>
        <div><strong>Phone:</strong> ${escapeHtml(cust.phone || 'N/A')}</div>
        <div><strong>Address:</strong> ${escapeHtml(cust.address || 'N/A')}</div>
      </div>
      <div style="text-align:right;">
        <div><strong>Credit Limit:</strong> ${formatCurrency(cust.credit_limit_cents)}</div>
        <div><strong>Current Debt Balance:</strong> <span style="color:red; font-weight:bold;">${formatCurrency(cust.current_debt_cents)}</span></div>
      </div>
    </div>

    <table style="width:100%; border-collapse:collapse; font-size:12px;">
      <thead>
        <tr style="background:#edf2f7;">
          <th style="padding:8px; text-align:left;">Date & Time</th>
          <th style="padding:8px; text-align:left;">Type</th>
          <th style="padding:8px; text-align:left;">Reference / Notes</th>
          <th style="padding:8px; text-align:right;">Debit (Debt+)</th>
          <th style="padding:8px; text-align:right;">Credit (Paid-)</th>
          <th style="padding:8px; text-align:right;">Running Balance</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml || '<tr><td colspan="6" style="text-align:center; padding:15px;">No ledger transactions recorded.</td></tr>'}
      </tbody>
    </table>
  `;

  const modalTitle = document.getElementById('a4ModalTitle');
  if (modalTitle) modalTitle.textContent = `A4 Ledger Statement - ${cust.name}`;

  const container = document.getElementById('a4DocumentContainer');
  if (container) container.innerHTML = documentHtml;

  const modal = document.getElementById('modalA4Preview');
  if (modal) modal.classList.add('active');

  const btnPrint = document.getElementById('btnPrintA4Now');
  if (btnPrint) {
    btnPrint.onclick = () => window.api.print();
  }
};
