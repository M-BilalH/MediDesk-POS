/**
 * MediDesk POS - Checkout & Receipt Module
 * Streamlined Checkout Modal, atomic checkout execution with double-submit guard,
 * expired / Rx validation warnings, and 80mm thermal receipt generation.
 */

function openCheckoutModal() {
  if (!cart || cart.length === 0) {
    showToast('Cart is empty! Add products before proceeding to checkout.', 'error');
    return;
  }

  const totals = calculateCurrentTotals();
  const totalDisplay = document.getElementById('modalPayableTotalDisplay');
  if (totalDisplay) {
    totalDisplay.textContent = formatCurrency(totals.totalCents);
  }
  
  // Default paid input to exact total
  const paidInput = document.getElementById('cartPaidInput');
  if (paidInput) {
    paidInput.value = (totals.totalCents / 100).toFixed(2);
  }
  updateCheckoutModalCalculations();

  const modal = document.getElementById('modalCheckoutPayment');
  if (modal) {
    modal.classList.add('active');
    setTimeout(() => {
      if (paidInput) {
        paidInput.focus();
        paidInput.select();
      }
    }, 150);
  }
}

function updateCheckoutModalCalculations() {
  const totals = calculateCurrentTotals();
  const paidInput = document.getElementById('cartPaidInput');
  const paidVal = paidInput ? (parseFloat(paidInput.value) || 0) : 0;
  const paidCents = Math.round(paidVal * 100);
  const changeCents = paidCents > totals.totalCents ? paidCents - totals.totalCents : 0;

  const summaryChange = document.getElementById('summaryChange');
  if (summaryChange) {
    summaryChange.textContent = formatCurrency(changeCents);
  }
}

async function processCheckout() {
  // 1. Double submit guard
  if (isCheckoutInProgress) {
    console.warn('Checkout is already in progress. Ignoring duplicate trigger.');
    return;
  }

  if (!cart || cart.length === 0) {
    showToast('Cart is empty! Add products before checkout.', 'error');
    return;
  }

  const custSelect = document.getElementById('cartCustomerSelect');
  const custId = custSelect ? (parseInt(custSelect.value) || 1) : 1;
  const cust = customersList.find(c => c.id === custId) || { id: 1, name: 'Walk-in Customer', current_debt_cents: 0, credit_limit_cents: 0 };
  const pmSelect = document.getElementById('cartPaymentMethod');
  const paymentMethod = pmSelect ? pmSelect.value : 'CASH';

  // Rule: Walk-in Customer (ID 1) strictly prohibited from Credit purchases
  if (custId === 1 && paymentMethod === 'CREDIT') {
    showToast('STRICT RULE VIOLATION: Walk-in Customer (ID 1) is strictly prohibited from Credit (Khata) purchases! Please select CASH, CARD, or MOBILE WALLET.', 'error');
    return;
  }

  const { subtotalCents, discountCents, taxCents, totalCents } = calculateCurrentTotals();

  // Rule: Credit Limit Check
  if (paymentMethod === 'CREDIT') {
    const existingDebt = cust.current_debt_cents || 0;
    const newTotalDebt = existingDebt + totalCents;
    if (newTotalDebt > (cust.credit_limit_cents || 0)) {
      showToast(`CREDIT LIMIT EXCEEDED! Customer "${cust.name}" has Credit Limit of ${formatCurrency(cust.credit_limit_cents)}, existing debt of ${formatCurrency(existingDebt)}. New total debt would be ${formatCurrency(newTotalDebt)}. Transaction Blocked.`, 'error');
      return;
    }
  }

  // Calculate Tendered Cash & Change
  let paidCents = 0;
  let changeCents = 0;

  if (paymentMethod === 'CREDIT') {
    paidCents = 0;
    changeCents = 0;
  } else {
    const paidInput = document.getElementById('cartPaidInput');
    const rawPaid = paidInput ? paidInput.value.trim() : '';
    if (rawPaid === '' || parseFloat(rawPaid) === 0) {
      paidCents = totalCents;
      if (paidInput) paidInput.value = (totalCents / 100).toFixed(2);
    } else {
      paidCents = parseCurrencyToCents(rawPaid);
    }

    if (paidCents < totalCents) {
      showToast(`INSUFFICIENT CASH RECEIVED!\nPayable: ${formatCurrency(totalCents)} | Tendered: ${formatCurrency(paidCents)}\nShortage: ${formatCurrency(totalCents - paidCents)}`, 'error');
      return;
    }

    changeCents = paidCents - totalCents;
  }

  // 2. Set isCheckoutInProgress = true
  isCheckoutInProgress = true;

  try {
    // 3. Unique invoice generator: INV-YYYYMMDD-HHMMSS-XXXX
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    const rand4 = Math.floor(1000 + Math.random() * 9000).toString();
    const invoiceNo = `INV-${y}${m}${d}-${hh}${mm}${ss}-${rand4}`;

    // 4. Expired medicine warning
    const todayStr = now.toISOString().split('T')[0];
    const hasExpired = cart.some(item => item.product && item.product.expiry_date && item.product.expiry_date < todayStr);
    if (hasExpired) {
      const proceed = window.confirm('⚠️ WARNING: Cart contains expired medicines. Continue?');
      if (!proceed) {
        return;
      }
    }

    // 5. Rx warning
    const hasRxReq = cart.some(item => item.product && item.product.is_prescription_required);
    if (hasRxReq && !cartPrescriptionPath) {
      const proceedRx = window.confirm('⚠️ WARNING: Prescription-required items without attached Rx. Continue?');
      if (!proceedRx) {
        return;
      }
    }

    // 6. Build payload and invoke named IPC handler
    const itemsPayload = cart.map(item => ({
      productId: item.product.id,
      productTitle: item.product.title,
      unitType: item.unitType,
      quantity: item.quantity,
      priceCents: item.priceCents,
      totalCents: item.quantity * item.priceCents
    }));

    const payload = {
      invoiceNo,
      cashierId: currentUser ? currentUser.id : 1,
      cashierName: currentUser ? currentUser.name : 'Cashier',
      customerId: custId,
      customerName: cust.name,
      items: itemsPayload,
      subtotalCents,
      taxCents,
      discountCents,
      totalCents,
      paidCents,
      changeCents,
      paymentMethod,
      prescriptionPath: cartPrescriptionPath || ''
    };

    const res = await window.api.processCheckout(payload);

    // 7. Handle Response
    if (res && res.success) {
      // Hide Checkout Modal
      const checkoutModal = document.getElementById('modalCheckoutPayment');
      if (checkoutModal) checkoutModal.classList.remove('active');

      // Render 80mm Thermal Receipt Preview & Open Modal
      renderThermalReceipt({
        invoiceNo,
        createdAt: new Date().toISOString(),
        cashierName: currentUser ? currentUser.name : 'Cashier',
        customerName: cust.name,
        subtotalCents,
        taxCents,
        discountCents,
        totalCents,
        paidCents,
        changeCents,
        paymentMethod,
        prescriptionPath: cartPrescriptionPath,
        items: [...cart]
      });

      const receiptModal = document.getElementById('modalReceiptPreview');
      if (receiptModal) receiptModal.classList.add('active');

      // Reset Cart & State
      cart = [];
      cartPrescriptionPath = '';
      const rxTag = document.getElementById('prescriptionStatusTag');
      if (rxTag) rxTag.textContent = '';
      const paidInput = document.getElementById('cartPaidInput');
      if (paidInput) paidInput.value = '';
      const discountInput = document.getElementById('cartDiscountInput');
      if (discountInput) discountInput.value = '0';
      const discountType = document.getElementById('cartDiscountType');
      if (discountType) discountType.value = 'FLAT';
      const custSelectElem = document.getElementById('cartCustomerSelect');
      if (custSelectElem) custSelectElem.value = '1';

      if (typeof updateCartCustomerStatus === 'function') updateCartCustomerStatus();
      if (typeof renderCart === 'function') renderCart();
      if (typeof loadMasterData === 'function') await loadMasterData();
      showToast(`Sale completed successfully! Invoice: ${invoiceNo}`);
    } else {
      // 8. Show error toast
      showToast('Checkout failed: ' + ((res && res.error) ? res.error : 'Unknown server error'), 'error');
    }
  } catch (err) {
    showToast('Checkout transaction error: ' + err.message, 'error');
  } finally {
    // 9. Always reset progress flag
    isCheckoutInProgress = false;
  }
}

function renderThermalReceipt(data) {
  const container = document.getElementById('receiptContainer');
  if (!container) return;

  const itemsHtml = data.items.map(item => `
    <tr>
      <td style="width:40%;">${escapeHtml(item.product.title)} (${escapeHtml(item.unitType)})</td>
      <td style="width:22%; text-align:right;">${formatCurrency(item.priceCents)}</td>
      <td style="width:15%; text-align:center;">${item.quantity}</td>
      <td style="width:23%; text-align:right;">${formatCurrency(item.quantity * item.priceCents)}</td>
    </tr>
  `).join('');

  container.innerHTML = `
    <div class="receipt-header">
      <div class="receipt-title">${escapeHtml(settings.store_name || 'MediDesk Pharmacy')}</div>
      <div>${escapeHtml(settings.store_address || '')}</div>
      <div>Tel: ${escapeHtml(settings.store_phone || '')}</div>
    </div>
    <div style="margin:6px 0; font-size:11px;">
      <div>Invoice: <strong>${escapeHtml(data.invoiceNo)}</strong></div>
      <div>Date: ${new Date(data.createdAt).toLocaleString()}</div>
      <div>Cashier: ${escapeHtml(data.cashierName)}</div>
      <div>Customer: ${escapeHtml(data.customerName)}</div>
      <div>Pay Method: <strong>${escapeHtml(data.paymentMethod)}</strong></div>
      ${data.prescriptionPath ? '<div style="color:green; font-weight:bold;">[Prescription Attached]</div>' : ''}
    </div>
    <div class="receipt-divider"></div>
    <table class="receipt-table">
      <thead>
        <tr>
          <th>Item</th>
          <th style="text-align:right;">Price</th>
          <th style="text-align:center;">Qty</th>
          <th style="text-align:right;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHtml}
      </tbody>
    </table>
    <div class="receipt-divider"></div>
    <div style="display:flex; justify-content:space-between; font-size:11px;">
      <span>Subtotal:</span> <span>${formatCurrency(data.subtotalCents)}</span>
    </div>
    <div style="display:flex; justify-content:space-between; font-size:11px;">
      <span>Discount:</span> <span>-${formatCurrency(data.discountCents)}</span>
    </div>
    <div style="display:flex; justify-content:space-between; font-size:11px;">
      <span>FBR POS Fee / Tax:</span> <span>${formatCurrency(data.taxCents)}</span>
    </div>
    <div class="receipt-divider"></div>
    <div style="display:flex; justify-content:space-between; font-size:13px; font-weight:bold;">
      <span>TOTAL PAYABLE:</span> <span>${formatCurrency(data.totalCents)}</span>
    </div>
    <div style="display:flex; justify-content:space-between; font-size:11px; margin-top:2px;">
      <span>Paid Amount:</span> <span>${formatCurrency(data.paidCents)}</span>
    </div>
    <div style="display:flex; justify-content:space-between; font-size:11px;">
      <span>Change Return:</span> <span>${formatCurrency(data.changeCents)}</span>
    </div>
    <div class="receipt-footer">
      <div class="receipt-divider"></div>
      <div>${escapeHtml(settings.receipt_disclaimer || '')}</div>
      <div style="margin-top:6px; font-weight:bold; font-size:11px; text-align:center;">MediDesk by Syed Bilal</div>
      <div style="font-size:10px; text-align:center;">Software developed by Syed Bilal (contact : 0330-449560)</div>
    </div>
  `;
}

// Attach checkout form submit listener
function setupCheckoutEvents() {
  const form = document.getElementById('checkoutPaymentForm');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      processCheckout();
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupCheckoutEvents);
} else {
  setupCheckoutEvents();
}

// Global scope bindings
window.openCheckoutModal = openCheckoutModal;
window.updateCheckoutModalCalculations = updateCheckoutModalCalculations;
window.processCheckout = processCheckout;
window.renderThermalReceipt = renderThermalReceipt;
window.setupCheckoutEvents = setupCheckoutEvents;
