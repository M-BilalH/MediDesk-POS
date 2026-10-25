/**
 * MediDesk POS - Inventory & Product Management Module
 * Handles product creation, editing, barcode generation, stock tracking, and inventory table rendering.
 */

function setupInventoryEvents() {
  const modalAddProd = document.getElementById('modalAddProduct');
  const addProdForm = document.getElementById('addProductForm');
  const btnAutoBarcode = document.getElementById('btnAutoGenerateBarcode');
  const btnOpenAdd = document.getElementById('btnOpenAddProduct');
  const salePriceInput = document.getElementById('prodSalePrice');
  const packSizeInput = document.getElementById('prodPackSize');
  const singlePriceInput = document.getElementById('prodSinglePrice');

  // Auto Barcode Generator Button
  if (btnAutoBarcode) {
    btnAutoBarcode.addEventListener('click', () => {
      const barcodeInput = document.getElementById('prodBarcode');
      if (barcodeInput) barcodeInput.value = generateUniqueBarcode();
    });
  }

  // Open Add Product Modal
  if (btnOpenAdd && modalAddProd) {
    btnOpenAdd.addEventListener('click', () => {
      const titleText = document.getElementById('modalProductTitleText');
      if (titleText) titleText.textContent = '➕ Add New Product';

      const editIdInput = document.getElementById('editProductId');
      if (editIdInput) editIdInput.value = '';

      if (addProdForm) addProdForm.reset();

      const barcodeInput = document.getElementById('prodBarcode');
      if (barcodeInput) barcodeInput.value = generateUniqueBarcode();

      // Default expiry date: 1 year in the future
      const expiryInput = document.getElementById('prodExpiryDate');
      if (expiryInput) {
        const nextYear = new Date();
        nextYear.setFullYear(nextYear.getFullYear() + 1);
        expiryInput.value = nextYear.toISOString().split('T')[0];
      }

      modalAddProd.classList.add('active');
    });
  }

  // Live Auto-Calculation of Single Unit Price
  function autoCalcSinglePrice() {
    if (!salePriceInput || !packSizeInput || !singlePriceInput) return;
    const salePrice = parseFloat(salePriceInput.value) || 0;
    const packSize = parseInt(packSizeInput.value) || 10;

    if (salePrice > 0 && packSize > 0) {
      const calculatedSinglePrice = (salePrice / packSize).toFixed(2);
      singlePriceInput.value = calculatedSinglePrice;
    }
  }

  if (salePriceInput) salePriceInput.addEventListener('input', autoCalcSinglePrice);
  if (packSizeInput) packSizeInput.addEventListener('input', autoCalcSinglePrice);

  // Form Submit (Add or Update Product via Named IPC)
  if (addProdForm) {
    addProdForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const editId = document.getElementById('editProductId')?.value;
      const barcode = document.getElementById('prodBarcode')?.value.trim() || generateUniqueBarcode();
      const title = document.getElementById('prodTitle')?.value.trim();
      const generic = document.getElementById('prodGeneric')?.value.trim() || '';
      const catId = parseInt(document.getElementById('prodCategory')?.value) || null;
      const supId = parseInt(document.getElementById('prodSupplier')?.value) || null;
      const packSize = parseInt(document.getElementById('prodPackSize')?.value) || 10;
      const expiryDate = document.getElementById('prodExpiryDate')?.value || '2027-12-31';
      const minStock = parseInt(document.getElementById('prodMinStock')?.value) || 5;
      const rawPackQty = parseInt(document.getElementById('prodPackQty')?.value) || 0;
      const rawSingleQty = parseInt(document.getElementById('prodSingleQty')?.value) || 0;
      const saleCents = parseCurrencyToCents(document.getElementById('prodSalePrice')?.value);
      const singleCents = parseCurrencyToCents(document.getElementById('prodSinglePrice')?.value);
      const allowNegative = document.getElementById('prodAllowNegative')?.checked ? 1 : 0;
      const prescriptionReq = document.getElementById('prodPrescriptionReq')?.checked ? 1 : 0;

      if (!title) {
        showToast('Product title is required.', 'error');
        return;
      }

      // Auto-normalize stock units into packs and loose singles
      const totalInputUnits = (rawPackQty * packSize) + rawSingleQty;
      let packQty = rawPackQty;
      let singleQty = rawSingleQty;
      if (totalInputUnits >= 0) {
        packQty = Math.floor(totalInputUnits / packSize);
        singleQty = totalInputUnits % packSize;
      }

      const productPayload = {
        barcode,
        title,
        generic_name: generic,
        category_id: catId,
        supplier_id: supId,
        pack_size: packSize,
        expiry_date: expiryDate,
        min_stock_level: minStock,
        quantity_packs: packQty,
        quantity_singles: singleQty,
        cost_price_cents: 0,
        sale_price_cents: saleCents,
        single_price_cents: singleCents,
        allow_negative_stock: allowNegative,
        is_prescription_required: prescriptionReq
      };

      if (editId) {
        // Update existing product
        const res = await window.api.updateProduct(parseInt(editId), productPayload);
        if (res && res.success) {
          showToast(`Product "${title}" updated successfully!`);
          if (modalAddProd) modalAddProd.classList.remove('active');
          if (typeof reloadProducts === 'function') await reloadProducts();
          if (typeof loadMasterData === 'function') await loadMasterData();
          renderInventoryTable();
          restoreActiveFocus();
        } else {
          showToast('Error updating product: ' + (res?.error || 'Unknown error'), 'error');
          restoreActiveFocus();
        }
      } else {
        // Add new product
        const res = await window.api.addProduct(productPayload);
        if (res && res.success) {
          showToast(`Product "${title}" created successfully with Barcode: ${barcode}`);
          if (modalAddProd) modalAddProd.classList.remove('active');
          addProdForm.reset();
          if (typeof reloadProducts === 'function') await reloadProducts();
          if (typeof loadMasterData === 'function') await loadMasterData();
          renderInventoryTable();
          restoreActiveFocus();
        } else {
          showToast('Error adding product: ' + (res?.error || 'Unknown error'), 'error');
          restoreActiveFocus();
        }
      }
    });
  }
}

async function renderInventoryTable() {
  const tbody = document.getElementById('inventoryTableBody');
  if (!tbody) return;

  const infoEl = document.getElementById('inventoryPaginationInfo');
  const pageNumEl = document.getElementById('inventoryPageNum');
  const btnPrev = document.getElementById('btnInvPrevPage');
  const btnNext = document.getElementById('btnInvNextPage');
  tbody.innerHTML = '';

  const totalCount = productsList ? productsList.length : 0;
  if (totalCount === 0) {
    tbody.innerHTML = `<tr><td colspan="11" style="text-align:center;">No products found in inventory master.</td></tr>`;
    if (infoEl) infoEl.textContent = 'Showing 0-0 of 0 products';
    if (pageNumEl) pageNumEl.textContent = 'Page 1';
    if (btnPrev) btnPrev.disabled = true;
    if (btnNext) btnNext.disabled = true;
    return;
  }

  const maxPage = Math.ceil(totalCount / INV_PAGE_SIZE) || 1;
  if (invCurrentPage > maxPage) invCurrentPage = maxPage;
  if (invCurrentPage < 1) invCurrentPage = 1;

  const startIndex = (invCurrentPage - 1) * INV_PAGE_SIZE;
  const pageProducts = productsList.slice(startIndex, startIndex + INV_PAGE_SIZE);

  if (infoEl) infoEl.textContent = `Showing ${startIndex + 1}-${Math.min(startIndex + INV_PAGE_SIZE, totalCount)} of ${totalCount} products`;
  if (pageNumEl) pageNumEl.textContent = `Page ${invCurrentPage} of ${maxPage}`;
  if (btnPrev) btnPrev.disabled = invCurrentPage <= 1;
  if (btnNext) btnNext.disabled = invCurrentPage >= maxPage;

  const today = new Date();

  pageProducts.forEach(p => {
    const expDate = new Date(p.expiry_date);
    const diffDays = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));

    let expiryBadge = `<span class="badge badge-success">${escapeHtml(p.expiry_date)}</span>`;
    if (diffDays < 0) {
      expiryBadge = `<span class="badge badge-danger">Expired (${escapeHtml(p.expiry_date)})</span>`;
    } else if (diffDays <= 180) {
      expiryBadge = `<span class="badge badge-warning">⚠️ 6-Mo Warning (${escapeHtml(p.expiry_date)})</span>`;
    }

    let stockBadgeHtml = `<strong>${p.quantity_packs}</strong>`;
    let rowStyle = '';

    if (p.quantity_packs <= 0) {
      stockBadgeHtml = `<span class="badge badge-danger">OUT OF STOCK (0)</span>`;
      rowStyle = 'background:hsla(354, 85%, 54%, 0.12);';
    } else if (p.quantity_packs <= (p.min_stock_level || 5)) {
      stockBadgeHtml = `<span class="badge badge-warning" style="color:black; font-weight:bold;">⚠️ LOW STOCK (${p.quantity_packs})</span>`;
      rowStyle = 'background:hsla(38, 92%, 50%, 0.12);';
    }

    const tr = document.createElement('tr');
    if (rowStyle) tr.setAttribute('style', rowStyle);

    tr.innerHTML = `
      <td><span class="badge badge-warning">${escapeHtml(p.barcode)}</span></td>
      <td><strong>${escapeHtml(p.title)}</strong></td>
      <td>${escapeHtml(p.generic_name || '')}</td>
      <td>${escapeHtml(p.category_name || '')}</td>
      <td>${p.pack_size}</td>
      <td>${expiryBadge}</td>
      <td>${stockBadgeHtml}</td>
      <td>${p.quantity_singles}</td>
      <td>${formatCurrency(p.sale_price_cents)}</td>
      <td>${formatCurrency(p.single_price_cents)}</td>
      <td>
        <button class="btn btn-primary" style="padding:2px 6px; font-size:0.75rem;" onclick="editProduct(${p.id})">✏️ Edit</button>
        ${(currentUser && currentUser.role === 'Admin') ? `<button class="btn btn-secondary" style="padding:2px 6px; font-size:0.75rem;" onclick="deleteProduct(${p.id})">🗑️ Delete</button>` : ''}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.editProduct = function(productId) {
  const p = productsList.find(item => item.id === productId);
  if (!p) return;

  const titleText = document.getElementById('modalProductTitleText');
  if (titleText) titleText.textContent = '✏️ Edit Product Details';

  const editIdInput = document.getElementById('editProductId');
  if (editIdInput) editIdInput.value = p.id;

  const barcodeInput = document.getElementById('prodBarcode');
  if (barcodeInput) barcodeInput.value = p.barcode || '';

  const titleInput = document.getElementById('prodTitle');
  if (titleInput) titleInput.value = p.title || '';

  const genericInput = document.getElementById('prodGeneric');
  if (genericInput) genericInput.value = p.generic_name || '';

  const catSelect = document.getElementById('prodCategory');
  if (catSelect) catSelect.value = p.category_id || '';

  const supSelect = document.getElementById('prodSupplier');
  if (supSelect) supSelect.value = p.supplier_id || '';

  const packSizeInput = document.getElementById('prodPackSize');
  if (packSizeInput) packSizeInput.value = p.pack_size || 10;

  const expiryInput = document.getElementById('prodExpiryDate');
  if (expiryInput) expiryInput.value = p.expiry_date || '';

  const minStockInput = document.getElementById('prodMinStock');
  if (minStockInput) minStockInput.value = p.min_stock_level || 5;

  const packQtyInput = document.getElementById('prodPackQty');
  if (packQtyInput) packQtyInput.value = p.quantity_packs ?? 0;

  const singleQtyInput = document.getElementById('prodSingleQty');
  if (singleQtyInput) singleQtyInput.value = p.quantity_singles ?? 0;

  const salePriceInput = document.getElementById('prodSalePrice');
  if (salePriceInput) salePriceInput.value = ((p.sale_price_cents || 0) / 100).toFixed(2);

  const singlePriceInput = document.getElementById('prodSinglePrice');
  if (singlePriceInput) singlePriceInput.value = ((p.single_price_cents || 0) / 100).toFixed(2);

  const allowNegCheck = document.getElementById('prodAllowNegative');
  if (allowNegCheck) allowNegCheck.checked = p.allow_negative_stock === 1;

  const rxCheck = document.getElementById('prodPrescriptionReq');
  if (rxCheck) rxCheck.checked = p.is_prescription_required === 1;

  const modal = document.getElementById('modalAddProduct');
  if (modal) modal.classList.add('active');
};

window.deleteProduct = async function(productId) {
  // Role check: Admin or Manager only
  if (typeof requireRole === 'function') {
    if (!requireRole('Admin', 'Manager')) return;
  } else if (currentUser && !['Admin', 'Manager'].includes(currentUser.role)) {
    showToast('Unauthorized: Admin or Manager role required to delete products.', 'error');
    return;
  }

  if (confirm('Are you sure you want to delete this product from inventory?')) {
    const res = await window.api.deleteProduct(productId);
    if (res && res.success) {
      showToast('Product deleted successfully.');
      if (typeof reloadProducts === 'function') await reloadProducts();
      if (typeof loadMasterData === 'function') await loadMasterData();
      renderInventoryTable();
    } else {
      showToast('Error deleting product: ' + (res?.error || 'Unknown error'), 'error');
    }
  }
};
