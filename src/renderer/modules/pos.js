/**
 * MediDesk POS - POS Terminal Module
 * Product grid, cart operations, pricing calculations, parked orders, and quick cash.
 */

function setupPosEvents() {
  const searchInput = document.getElementById('posSearchInput');
  const categoryFilter = document.getElementById('posCategoryFilter');
  const supplierFilter = document.getElementById('posSupplierFilter');

  let searchDebounceTimer = null;
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => {
        renderProductGrid();
      }, 80);
    });

    // External Keyboard & Barcode Scanner Enter Key on Search Input
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const val = searchInput.value.trim().toLowerCase();
        if (!val) return;

        const exactMatch = productsList.find(p => 
          (p.barcode && p.barcode.toLowerCase() === val) || 
          (p.title && p.title.toLowerCase() === val)
        );
        if (exactMatch) {
          addProductToCart(exactMatch);
          searchInput.value = '';
          renderProductGrid();
        } else {
          const filtered = productsList.filter(p => 
            (p.title && p.title.toLowerCase().includes(val)) || 
            (p.generic_name && p.generic_name.toLowerCase().includes(val)) || 
            (p.barcode && p.barcode.toLowerCase().includes(val))
          );
          if (filtered.length === 1) {
            addProductToCart(filtered[0]);
            searchInput.value = '';
            renderProductGrid();
          }
        }
      }
    });
  }

  if (categoryFilter) {
    categoryFilter.addEventListener('change', renderProductGrid);
  }
  if (supplierFilter) {
    supplierFilter.addEventListener('change', renderProductGrid);
  }

  // Cart actions
  const custSelect = document.getElementById('cartCustomerSelect');
  if (custSelect) {
    custSelect.addEventListener('change', updateCartCustomerStatus);
  }

  const discountInput = document.getElementById('cartDiscountInput');
  const discountType = document.getElementById('cartDiscountType');

  if (discountInput) {
    discountInput.addEventListener('input', updateCartTotals);
    discountInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        updateCartTotals();
        if (discountType) discountType.focus();
      }
    });
  }

  if (discountType) {
    discountType.addEventListener('change', updateCartTotals);
    discountType.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        updateCartTotals();
        const btnCheckout = document.getElementById('btnOpenCheckoutModal');
        if (btnCheckout) btnCheckout.focus();
      }
    });
  }

  // Checkout Modal triggers
  const btnOpenCheckout = document.getElementById('btnOpenCheckoutModal');
  if (btnOpenCheckout) {
    btnOpenCheckout.addEventListener('click', () => {
      if (typeof openCheckoutModal === 'function') {
        openCheckoutModal();
      }
    });
  }

  const cancelCheckout = document.getElementById('cancelCheckoutModal');
  if (cancelCheckout) {
    cancelCheckout.addEventListener('click', () => {
      const modal = document.getElementById('modalCheckoutPayment');
      if (modal) modal.classList.remove('active');
    });
  }

  const paidInput = document.getElementById('cartPaidInput');
  if (paidInput) {
    paidInput.addEventListener('input', () => {
      if (typeof updateCheckoutModalCalculations === 'function') {
        updateCheckoutModalCalculations();
      }
    });
  }

  const pmSelect = document.getElementById('cartPaymentMethod');
  if (pmSelect) {
    pmSelect.addEventListener('change', () => {
      const pm = pmSelect.value;
      const tenderGroup = document.getElementById('tenderCashGroup');
      const changeRow = document.getElementById('changeReturnRow');

      if (tenderGroup && changeRow) {
        if (pm === 'CREDIT') {
          tenderGroup.style.opacity = '0.3';
          tenderGroup.style.pointerEvents = 'none';
          changeRow.style.opacity = '0.3';
        } else {
          tenderGroup.style.opacity = '1';
          tenderGroup.style.pointerEvents = 'auto';
          changeRow.style.opacity = '1';
        }
      }
      if (typeof updateCheckoutModalCalculations === 'function') {
        updateCheckoutModalCalculations();
      }
    });
  }

  // Exact Cash Button
  const btnExact = document.getElementById('btnCashExact');
  if (btnExact) {
    btnExact.addEventListener('click', () => {
      const totals = calculateCurrentTotals();
      const totalRs = (totals.totalCents / 100).toFixed(2);
      const cartPaid = document.getElementById('cartPaidInput');
      if (cartPaid) cartPaid.value = totalRs;
      if (typeof updateCheckoutModalCalculations === 'function') {
        updateCheckoutModalCalculations();
      }
    });
  }

  // Clear Cart
  const btnClear = document.getElementById('btnClearCart');
  if (btnClear) {
    btnClear.addEventListener('click', () => {
      cart = [];
      cartPrescriptionPath = '';
      const rxTag = document.getElementById('prescriptionStatusTag');
      if (rxTag) rxTag.textContent = '';
      const pInput = document.getElementById('cartPaidInput');
      if (pInput) pInput.value = '';
      const dInput = document.getElementById('cartDiscountInput');
      if (dInput) dInput.value = '0';
      const dType = document.getElementById('cartDiscountType');
      if (dType) dType.value = 'FLAT';
      const cSelect = document.getElementById('cartCustomerSelect');
      if (cSelect) cSelect.value = '1';
      updateCartCustomerStatus();
      renderCart();
    });
  }

  // Prescription image upload picker
  const btnAttachRx = document.getElementById('btnAttachPrescription');
  const rxFileInput = document.getElementById('prescriptionFileInput');

  if (btnAttachRx && rxFileInput) {
    btnAttachRx.addEventListener('click', () => {
      rxFileInput.click();
    });

    rxFileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const base64Data = reader.result.split(',')[1];
            const res = await window.api.savePrescription({ fileName: file.name, base64Data });
            if (res.success) {
              cartPrescriptionPath = res.filePath;
              const rxTag = document.getElementById('prescriptionStatusTag');
              if (rxTag) rxTag.textContent = `✓ Attached (${res.relativePath || 'Rx Saved'})`;
              showToast('Prescription attached successfully!');
            } else {
              showToast('Failed to attach prescription: ' + res.error, 'error');
            }
          } catch (err) {
            showToast('Error attaching prescription: ' + err.message, 'error');
          }
        };
        reader.readAsDataURL(file);
      }
    });
  }

  // Hold / Park Cart
  const btnPark = document.getElementById('btnParkOrder');
  if (btnPark) {
    btnPark.addEventListener('click', parkActiveCart);
  }

  const btnViewParked = document.getElementById('btnViewParked');
  if (btnViewParked) {
    btnViewParked.addEventListener('click', showParkedTabsModal);
  }

  // Receipt Modal Print Trigger
  const btnPrintReceipt = document.getElementById('btnPrintReceiptNow');
  if (btnPrintReceipt) {
    btnPrintReceipt.addEventListener('click', async () => {
      if (window.api && typeof window.api.print === 'function') {
        await window.api.print();
      }
    });
  }
}

// Quick Cash Shortcut Button
window.setQuickCash = function(amount) {
  const paidInput = document.getElementById('cartPaidInput');
  if (paidInput) {
    paidInput.value = Number(amount).toFixed(2);
    if (typeof updateCheckoutModalCalculations === 'function') {
      updateCheckoutModalCalculations();
    }
  }
};

function calculateCurrentTotals() {
  let subtotalCents = 0;
  cart.forEach(item => {
    subtotalCents += item.quantity * item.priceCents;
  });

  const discountEl = document.getElementById('cartDiscountInput');
  const rawDiscount = discountEl ? (parseFloat(discountEl.value) || 0) : 0;

  // FIX: Clamp discountVal to Math.max(0, discountVal) - block negative discounts with toast warning
  if (rawDiscount < 0) {
    showToast('⚠️ Discount cannot be negative! Clamped to 0.', 'error');
    if (discountEl) discountEl.value = '0';
  }
  const discountVal = Math.max(0, rawDiscount);

  const discountTypeEl = document.getElementById('cartDiscountType');
  const discountType = discountTypeEl ? discountTypeEl.value : 'FLAT';
  let discountCents = discountType === 'FLAT' 
    ? Math.round(discountVal * 100) 
    : Math.round((subtotalCents * discountVal) / 100);

  if (discountCents > subtotalCents) discountCents = subtotalCents;

  const afterDiscountCents = subtotalCents - discountCents;

  // Fixed flat Rs 1.00 (100 cents) FBR tax per receipt when cart has items
  const taxCents = cart.length > 0 ? 100 : 0;
  const totalCents = afterDiscountCents + taxCents;

  return { subtotalCents, discountCents, taxCents, totalCents };
}

function updateCartTotals() {
  const { subtotalCents, taxCents, totalCents } = calculateCurrentTotals();

  const subDisplay = document.getElementById('summarySubtotal');
  if (subDisplay) subDisplay.textContent = formatCurrency(subtotalCents);

  const taxDisplay = document.getElementById('summaryTax');
  if (taxDisplay) taxDisplay.textContent = cart.length > 0 ? 'Rs 1.00' : 'Rs 0.00';

  const totalDisplay = document.getElementById('summaryTotal');
  if (totalDisplay) totalDisplay.textContent = formatCurrency(totalCents);
}

function renderProductGrid() {
  const grid = document.getElementById('productGrid');
  if (!grid) return;

  const searchInput = document.getElementById('posSearchInput');
  const searchText = searchInput ? searchInput.value.toLowerCase().trim() : '';

  const catFilter = document.getElementById('posCategoryFilter');
  const selectedCat = catFilter ? catFilter.value : 'ALL';

  const supFilter = document.getElementById('posSupplierFilter');
  const selectedSup = supFilter ? supFilter.value : 'ALL';

  grid.innerHTML = '';

  const filtered = productsList.filter(p => {
    const matchesSearch = !searchText || 
      (p.title && p.title.toLowerCase().includes(searchText)) ||
      (p.generic_name && p.generic_name.toLowerCase().includes(searchText)) ||
      (p.supplier_name && p.supplier_name.toLowerCase().includes(searchText)) ||
      (p.barcode && p.barcode.toLowerCase().includes(searchText));
    const matchesCat = selectedCat === 'ALL' || (p.category_id && p.category_id.toString() === selectedCat);
    const matchesSup = selectedSup === 'ALL' || (p.supplier_id && p.supplier_id.toString() === selectedSup);
    return matchesSearch && matchesCat && matchesSup;
  });

  if (filtered.length === 0) {
    grid.innerHTML = `<div style="grid-column: 1/-1; text-align:center; color:var(--text-muted); padding:40px;">No matching pharmacy products found.</div>`;
    return;
  }

  const today = new Date();

  filtered.forEach(p => {
    const card = document.createElement('div');
    card.className = 'product-card';

    const packPrice = p.sale_price_cents ? formatCurrency(p.sale_price_cents) : 'N/A';
    const singlePrice = p.single_price_cents ? formatCurrency(p.single_price_cents) : 'N/A';
    
    let expiryStr = 'No Expiry Set';
    let is6MonthWarning = false;
    let isExpired = false;

    if (p.expiry_date) {
      const expDate = new Date(p.expiry_date);
      const diffDays = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));
      if (diffDays < 0) {
        isExpired = true;
        expiryStr = `Expired (${p.expiry_date})`;
      } else if (diffDays <= 180) {
        is6MonthWarning = true;
        expiryStr = `⚠️ 6-Mo Warning (${p.expiry_date})`;
      } else {
        expiryStr = `Exp: ${p.expiry_date}`;
      }
    }

    const totalPacks = p.quantity_packs || 0;
    const totalSingles = p.quantity_singles || 0;
    const isLowStock = totalPacks <= (p.min_stock_level || 5);
    const isOutOfStock = totalPacks <= 0;

    let badgeClass = 'product-batch-tag';
    if (isExpired) badgeClass = 'badge badge-danger';
    else if (is6MonthWarning) badgeClass = 'badge badge-warning';

    if (isOutOfStock) {
      card.style.border = '2px solid var(--danger)';
      card.style.background = 'hsla(354, 85%, 54%, 0.12)';
    } else if (isLowStock) {
      card.style.border = '2px solid var(--warning)';
      card.style.background = 'hsla(38, 92%, 50%, 0.12)';
    }

    card.innerHTML = `
      <div>
        <div class="product-title" style="display:flex; justify-content:space-between; align-items:flex-start;">
          <span>${escapeHtml(p.title)}</span>
          ${isOutOfStock ? '<span class="badge badge-danger" style="font-size:0.65rem;">OUT OF STOCK</span>' : 
            (isLowStock ? `<span class="badge badge-warning" style="font-size:0.65rem; color:black; font-weight:800;">⚠️ LOW STOCK</span>` : '')}
        </div>
        <div class="product-generic">${escapeHtml(p.generic_name || '')}</div>
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span class="${badgeClass}">${expiryStr}</span>
        ${p.is_prescription_required ? '<span style="font-size:0.65rem; background:var(--warning); color:black; padding:1px 4px; border-radius:3px; font-weight:700;">Rx Req</span>' : ''}
      </div>
      <div class="product-card-bottom">
        <div>
          <div class="product-price">${singlePrice} <span style="font-size:0.7rem; font-weight:normal;">/unit</span></div>
          <div style="font-size:0.75rem; color:var(--text-muted);">Pack: ${packPrice}</div>
        </div>
        <div class="product-stock" style="${isLowStock ? 'color:var(--warning); font-weight:bold;' : ''}">${totalPacks} pks (${totalSingles} loose)</div>
      </div>
    `;

    card.addEventListener('click', () => addProductToCart(p));
    grid.appendChild(card);
  });
}

/**
 * Add Product to Cart - DEFAULTS TO SINGLE TABLET / UNIT
 */
function addProductToCart(product) {
  const packSize = Math.max(1, product.pack_size || 1);
  const totalAvailableUnits = ((product.quantity_packs || 0) * packSize) + (product.quantity_singles || 0);

  // Calculate total units of this product already in cart
  let currentCartUnits = 0;
  cart.forEach(item => {
    if (item.product.id === product.id) {
      currentCartUnits += item.unitType === 'PACK' ? (item.quantity * packSize) : item.quantity;
    }
  });

  const requestedUnits = 1;

  if (currentCartUnits + requestedUnits > totalAvailableUnits && !product.allow_negative_stock) {
    showToast(`Out of Stock! Product "${product.title}" has ${totalAvailableUnits} total units in stock (${product.quantity_packs} packs, ${product.quantity_singles} loose).`, 'error');
    return;
  }

  // Find existing SINGLE unit item in cart
  const cartIndex = cart.findIndex(ci => ci.product.id === product.id && ci.unitType === 'SINGLE');

  if (cartIndex > -1) {
    cart[cartIndex].quantity += 1;
  } else {
    cart.push({
      product: product,
      unitType: 'SINGLE',
      quantity: 1,
      priceCents: product.single_price_cents
    });
  }

  renderCart();
}

function renderCart() {
  const container = document.getElementById('cartItemsList');
  const countBadge = document.getElementById('cartItemCountBadge');
  if (!container) return;

  if (countBadge) {
    countBadge.textContent = `${cart.length} Items`;
  }
  container.innerHTML = '';

  if (cart.length === 0) {
    container.innerHTML = `<div style="text-align:center; color:var(--text-muted); margin-top:40px;">Cart is empty.<br>Scan barcode or click a product to add single unit by default.</div>`;
    updateCartTotals();
    return;
  }

  cart.forEach((item, index) => {
    const isPack = item.unitType === 'PACK';
    const unitPriceCents = isPack ? item.product.sale_price_cents : item.product.single_price_cents;
    item.priceCents = unitPriceCents;
    const lineTotalCents = item.quantity * unitPriceCents;

    const cartItemEl = document.createElement('div');
    cartItemEl.className = 'cart-item';
    cartItemEl.innerHTML = `
      <div class="cart-item-header">
        <span>${escapeHtml(item.product.title)}</span>
        <button style="background:none; border:none; color:var(--danger); cursor:pointer; font-weight:bold;" onclick="removeCartItem(${index})">✕</button>
      </div>
      <div class="cart-item-meta">
        <span>Code: ${escapeHtml(item.product.barcode || '')}</span>
        <span>Exp: ${item.product.expiry_date || 'N/A'}</span>
        <button class="unit-toggle-btn" onclick="toggleCartUnitType(${index})">
          ${isPack ? '📦 FULL PACK' : '💊 SINGLE UNIT'} (Switch)
        </button>
      </div>
      <div class="cart-item-controls">
        <div class="qty-controls">
          <button class="qty-btn" onclick="updateCartQty(${index}, -1)">-</button>
          <span class="qty-val">${item.quantity}</span>
          <button class="qty-btn" onclick="updateCartQty(${index}, 1)">+</button>
        </div>
        <div class="item-total-price">${formatCurrency(lineTotalCents)}</div>
      </div>
    `;
    container.appendChild(cartItemEl);
  });

  updateCartTotals();
}

window.toggleCartUnitType = function(index) {
  if (cart[index]) {
    const item = cart[index];
    const newUnitType = item.unitType === 'PACK' ? 'SINGLE' : 'PACK';
    const product = item.product;
    const packSize = Math.max(1, product.pack_size || 1);
    const totalAvailableUnits = ((product.quantity_packs || 0) * packSize) + (product.quantity_singles || 0);

    let currentCartUnits = 0;
    cart.forEach((ci, i) => {
      if (ci.product.id === product.id) {
        const uType = i === index ? newUnitType : ci.unitType;
        const itemUnits = uType === 'PACK' ? (ci.quantity * packSize) : ci.quantity;
        currentCartUnits += itemUnits;
      }
    });

    if (currentCartUnits > totalAvailableUnits && !product.allow_negative_stock) {
      showToast(`Cannot switch unit type! Product "${product.title}" has ${totalAvailableUnits} total units in stock.`, 'error');
      return;
    }

    item.unitType = newUnitType;
    renderCart();
  }
};

window.updateCartQty = function(index, delta) {
  if (cart[index]) {
    if (delta > 0) {
      const item = cart[index];
      const product = item.product;
      const packSize = Math.max(1, product.pack_size || 1);
      const totalAvailableUnits = ((product.quantity_packs || 0) * packSize) + (product.quantity_singles || 0);

      let currentCartUnits = 0;
      cart.forEach(ci => {
        if (ci.product.id === product.id) {
          const itemUnits = ci.unitType === 'PACK' ? (ci.quantity * packSize) : ci.quantity;
          currentCartUnits += itemUnits;
        }
      });

      const additionalUnits = item.unitType === 'PACK' ? packSize : 1;

      if (currentCartUnits + additionalUnits > totalAvailableUnits && !product.allow_negative_stock) {
        showToast(`Insufficient Stock! Product "${product.title}" has ${totalAvailableUnits} total units available in stock.`, 'error');
        return;
      }
    }

    cart[index].quantity += delta;
    if (cart[index].quantity <= 0) {
      cart.splice(index, 1);
    }
    renderCart();
  }
};

window.removeCartItem = function(index) {
  if (cart[index]) {
    cart.splice(index, 1);
    renderCart();
  }
};

function updateCartCustomerStatus() {
  const custSelect = document.getElementById('cartCustomerSelect');
  if (!custSelect) return;

  const custId = parseInt(custSelect.value) || 1;
  const alertBox = document.getElementById('customerCreditAlert');
  if (!alertBox) return;

  const cust = customersList.find(c => c.id === custId);
  if (cust) {
    if (cust.id === 1) {
      alertBox.style.display = 'block';
      alertBox.style.color = 'var(--warning)';
      alertBox.textContent = 'ℹ️ Walk-in Customer: Cash / Card / Mobile Wallet payments only. Store Credit (Khata) strictly prohibited.';
    } else {
      const availCredit = (cust.credit_limit_cents || 0) - (cust.current_debt_cents || 0);
      alertBox.style.display = 'block';
      alertBox.style.color = availCredit < 0 ? 'var(--danger)' : 'var(--accent)';
      alertBox.textContent = `Credit Limit: ${formatCurrency(cust.credit_limit_cents)} | Current Debt: ${formatCurrency(cust.current_debt_cents)} | Available: ${formatCurrency(availCredit)}`;
    }
  }
}

// Order Hold / Park System
async function parkActiveCart() {
  if (cart.length === 0) {
    showToast('Cart is empty. Nothing to hold/park.', 'error');
    return;
  }

  const tabKey = `TAB-${Date.now().toString().slice(-6)}`;
  const custSelect = document.getElementById('cartCustomerSelect');
  const custId = custSelect ? (parseInt(custSelect.value) || 1) : 1;
  let totalCents = 0;
  cart.forEach(i => totalCents += i.quantity * i.priceCents);

  try {
    const res = await window.api.parkOrder({
      tabKey,
      cashierId: currentUser ? currentUser.id : 1,
      customerId: custId,
      cartJson: JSON.stringify(cart),
      totalCents
    });

    if (res.success) {
      showToast(`Order Parked Successfully under reference: ${tabKey}`);
      cart = [];
      cartPrescriptionPath = '';
      const rxTag = document.getElementById('prescriptionStatusTag');
      if (rxTag) rxTag.textContent = '';
      renderCart();
    } else {
      showToast('Error parking order: ' + (res.error || 'Failed to park order'), 'error');
    }
  } catch(err) {
    showToast('Error parking order: ' + err.message, 'error');
  }
}

async function showParkedTabsModal() {
  try {
    const res = await window.api.getParkedOrders();
    if (!res.success) {
      showToast('Failed to load parked orders: ' + (res.error || 'Unknown error'), 'error');
      return;
    }

    parkedOrders = res.data || [];
    if (parkedOrders.length === 0) {
      showToast('No parked orders currently on hold.', 'error');
      return;
    }

    const listHtml = parkedOrders.map(p => `
      <div style="display:flex; justify-content:space-between; align-items:center; background:var(--input-bg); padding:10px; border-radius:6px; margin-bottom:8px;">
        <div>
          <strong style="color:var(--primary);">${escapeHtml(p.tab_key)}</strong> - Total: ${formatCurrency(p.total_cents)}
          <div style="font-size:0.75rem; color:var(--text-muted);">Parked at: ${new Date(p.created_at).toLocaleTimeString()}</div>
        </div>
        <button class="btn btn-accent" style="padding:4px 8px; font-size:0.8rem;" onclick="resumeParkedOrder(${p.id})">Resume</button>
      </div>
    `).join('');

    const existingModal = document.getElementById('modalParkedTabs');
    if (existingModal) existingModal.remove();

    const modalHtml = `
      <div class="modal-overlay active" id="modalParkedTabs">
        <div class="modal-content" style="max-width:420px;">
          <div class="modal-header">
            <h3>📂 Parked Order Tabs</h3>
            <button type="button" class="modal-close" onclick="document.getElementById('modalParkedTabs').remove()">✕</button>
          </div>
          <div>${listHtml}</div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
  } catch (err) {
    showToast('Error viewing parked orders: ' + err.message, 'error');
  }
}

window.resumeParkedOrder = async function(parkedId) {
  const item = parkedOrders.find(p => p.id === parkedId);
  if (item) {
    try {
      cart = JSON.parse(item.cart_json);
      const custSelect = document.getElementById('cartCustomerSelect');
      if (custSelect) custSelect.value = item.customer_id;
      await window.api.deleteParkedOrder(parkedId);
      renderCart();
      const modal = document.getElementById('modalParkedTabs');
      if (modal) modal.remove();
      showToast(`Resumed parked order ${item.tab_key}`);
    } catch (err) {
      showToast('Error resuming parked order: ' + err.message, 'error');
    }
  }
};

// Global bindings
window.setupPosEvents = setupPosEvents;
window.renderProductGrid = renderProductGrid;
window.addProductToCart = addProductToCart;
window.renderCart = renderCart;
window.updateCartCustomerStatus = updateCartCustomerStatus;
window.updateCartTotals = updateCartTotals;
window.calculateCurrentTotals = calculateCurrentTotals;
window.parkActiveCart = parkActiveCart;
window.showParkedTabsModal = showParkedTabsModal;
