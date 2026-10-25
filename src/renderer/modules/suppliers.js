/**
 * MediDesk POS - Supplier & Category Management Module
 * Handles CRUD operations for suppliers and medicine categories across modals and dedicated pages.
 */

function setupSupplierCategoryEvents() {
  const btnOpen = document.getElementById('btnOpenManageSuppliers');
  if (btnOpen) {
    btnOpen.addEventListener('click', openSupplierCategoryModal);
  }

  // Modal Cancel Edit Buttons
  const btnCancelSup = document.getElementById('btnCancelEditSupplier');
  if (btnCancelSup) btnCancelSup.addEventListener('click', resetSupplierForm);
  const btnCancelCat = document.getElementById('btnCancelEditCategory');
  if (btnCancelCat) btnCancelCat.addEventListener('click', resetCategoryForm);

  // Dedicated Page Cancel Edit Buttons
  const btnPageCancelSup = document.getElementById('btnPageCancelEditSupplier');
  if (btnPageCancelSup) btnPageCancelSup.addEventListener('click', resetPageSupplierForm);
  const btnPageCancelCat = document.getElementById('btnPageCancelEditCategory');
  if (btnPageCancelCat) btnPageCancelCat.addEventListener('click', resetPageCategoryForm);

  // Modal Supplier Form Submit
  const addSupForm = document.getElementById('addSupplierForm');
  if (addSupForm) {
    addSupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const editId = document.getElementById('editSupplierId')?.value;
      const name = document.getElementById('supNameInput')?.value.trim();
      const contact = document.getElementById('supContactInput')?.value.trim() || '';
      const phone = document.getElementById('supPhoneInput')?.value.trim() || '';
      const address = document.getElementById('supAddressInput')?.value.trim() || '';
      if (!name) return;

      const payload = { name, contact_person: contact, phone, address };

      if (editId) {
        const res = await window.api.updateSupplier(parseInt(editId), payload);
        if (res && res.success) {
          showToast(`Supplier "${name}" updated successfully!`);
          resetSupplierForm();
          if (typeof loadMasterData === 'function') await loadMasterData();
          renderSuppliersListModal();
          renderSuppliersPage();
          populateSupplierDropdowns();
          restoreActiveFocus();
        } else {
          showToast('Error updating supplier: ' + (res?.error || 'Unknown error'), 'error');
        }
      } else {
        const res = await window.api.addSupplier(payload);
        if (res && res.success) {
          showToast(`Supplier "${name}" registered successfully!`);
          resetSupplierForm();
          if (typeof loadMasterData === 'function') await loadMasterData();
          renderSuppliersListModal();
          renderSuppliersPage();
          populateSupplierDropdowns();
          restoreActiveFocus();
        } else {
          showToast('Error registering supplier: ' + (res?.error || 'Unknown error'), 'error');
        }
      }
    });
  }

  // Page Supplier Form Submit (Dedicated Page)
  const pageSupForm = document.getElementById('pageSupplierForm');
  if (pageSupForm) {
    pageSupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const editId = document.getElementById('pageEditSupplierId')?.value;
      const name = document.getElementById('pageSupNameInput')?.value.trim();
      const contact = document.getElementById('pageSupContactInput')?.value.trim() || '';
      const phone = document.getElementById('pageSupPhoneInput')?.value.trim() || '';
      const address = document.getElementById('pageSupAddressInput')?.value.trim() || '';
      if (!name) return;

      const payload = { name, contact_person: contact, phone, address };

      if (editId) {
        const res = await window.api.updateSupplier(parseInt(editId), payload);
        if (res && res.success) {
          showToast(`Supplier "${name}" updated successfully!`);
          resetPageSupplierForm();
          if (typeof loadMasterData === 'function') await loadMasterData();
          renderSuppliersPage();
          populateSupplierDropdowns();
          restoreActiveFocus(document.getElementById('pageSupNameInput'));
        } else {
          showToast('Error updating supplier: ' + (res?.error || 'Unknown error'), 'error');
        }
      } else {
        const res = await window.api.addSupplier(payload);
        if (res && res.success) {
          showToast(`Supplier "${name}" registered successfully!`);
          resetPageSupplierForm();
          if (typeof loadMasterData === 'function') await loadMasterData();
          renderSuppliersPage();
          populateSupplierDropdowns();
          restoreActiveFocus(document.getElementById('pageSupNameInput'));
        } else {
          showToast('Error registering supplier: ' + (res?.error || 'Unknown error'), 'error');
        }
      }
    });
  }

  // Modal Category Form Submit
  const addCatForm = document.getElementById('addCategoryForm');
  if (addCatForm) {
    addCatForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const editId = document.getElementById('editCategoryId')?.value;
      const name = document.getElementById('catNameInput')?.value.trim();
      if (!name) return;

      if (editId) {
        const res = await window.api.updateCategory(parseInt(editId), { name });
        if (res && res.success) {
          showToast(`Category "${name}" updated successfully!`);
          resetCategoryForm();
          if (typeof loadMasterData === 'function') await loadMasterData();
          renderCategoriesListModal();
          renderCategoriesPage();
          populateCategoryDropdowns();
          restoreActiveFocus();
        } else {
          showToast('Error updating category: ' + (res?.error || 'Unknown error'), 'error');
        }
      } else {
        const res = await window.api.addCategory({ name, description: 'Medicine Category' });
        if (res && res.success) {
          showToast(`Category "${name}" created successfully!`);
          resetCategoryForm();
          if (typeof loadMasterData === 'function') await loadMasterData();
          renderCategoriesListModal();
          renderCategoriesPage();
          populateCategoryDropdowns();
          restoreActiveFocus();
        } else {
          showToast('Error creating category: ' + (res?.error || 'Unknown error'), 'error');
        }
      }
    });
  }

  // Page Category Form Submit (Dedicated Page)
  const pageCatForm = document.getElementById('pageCategoryForm');
  if (pageCatForm) {
    pageCatForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const editId = document.getElementById('pageEditCategoryId')?.value;
      const name = document.getElementById('pageCatNameInput')?.value.trim();
      if (!name) return;

      if (editId) {
        const res = await window.api.updateCategory(parseInt(editId), { name });
        if (res && res.success) {
          showToast(`Category "${name}" updated successfully!`);
          resetPageCategoryForm();
          if (typeof loadMasterData === 'function') await loadMasterData();
          renderCategoriesPage();
          populateCategoryDropdowns();
          restoreActiveFocus(document.getElementById('pageCatNameInput'));
        } else {
          showToast('Error updating category: ' + (res?.error || 'Unknown error'), 'error');
        }
      } else {
        const res = await window.api.addCategory({ name, description: 'Medicine Category' });
        if (res && res.success) {
          showToast(`Category "${name}" created successfully!`);
          resetPageCategoryForm();
          if (typeof loadMasterData === 'function') await loadMasterData();
          renderCategoriesPage();
          populateCategoryDropdowns();
          restoreActiveFocus(document.getElementById('pageCatNameInput'));
        } else {
          showToast('Error creating category: ' + (res?.error || 'Unknown error'), 'error');
        }
      }
    });
  }
}

function resetSupplierForm() {
  const editId = document.getElementById('editSupplierId');
  if (editId) editId.value = '';
  const form = document.getElementById('addSupplierForm');
  if (form) form.reset();
  const btnSave = document.getElementById('btnSaveSupplier');
  if (btnSave) btnSave.textContent = '💾 Save Supplier';
  const btnCancel = document.getElementById('btnCancelEditSupplier');
  if (btnCancel) btnCancel.style.display = 'none';
}

function resetCategoryForm() {
  const editId = document.getElementById('editCategoryId');
  if (editId) editId.value = '';
  const form = document.getElementById('addCategoryForm');
  if (form) form.reset();
  const btnSave = document.getElementById('btnSaveCategory');
  if (btnSave) btnSave.textContent = '➕ Save Category';
  const btnCancel = document.getElementById('btnCancelEditCategory');
  if (btnCancel) btnCancel.style.display = 'none';
}

function resetPageSupplierForm() {
  const editId = document.getElementById('pageEditSupplierId');
  if (editId) editId.value = '';
  const form = document.getElementById('pageSupplierForm');
  if (form) form.reset();
  const btnSave = document.getElementById('btnPageSaveSupplier');
  if (btnSave) btnSave.textContent = '💾 Save Supplier';
  const btnCancel = document.getElementById('btnPageCancelEditSupplier');
  if (btnCancel) btnCancel.style.display = 'none';
}

function resetPageCategoryForm() {
  const editId = document.getElementById('pageEditCategoryId');
  if (editId) editId.value = '';
  const form = document.getElementById('pageCategoryForm');
  if (form) form.reset();
  const btnSave = document.getElementById('btnPageSaveCategory');
  if (btnSave) btnSave.textContent = '➕ Save Category';
  const btnCancel = document.getElementById('btnPageCancelEditCategory');
  if (btnCancel) btnCancel.style.display = 'none';
}

window.openSupplierCategoryModal = function() {
  resetSupplierForm();
  resetCategoryForm();
  renderSuppliersListModal();
  renderCategoriesListModal();
  const modal = document.getElementById('modalManageSuppliers');
  if (modal) modal.classList.add('active');
};

function renderSuppliersListModal() {
  const tbody = document.getElementById('suppliersListModalBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!suppliersList || suppliersList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;">No suppliers registered yet.</td></tr>`;
    return;
  }

  suppliersList.forEach(s => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>#${s.id}</td>
      <td><strong>${escapeHtml(s.name)}</strong></td>
      <td>${escapeHtml(s.contact_person || 'N/A')}</td>
      <td>${escapeHtml(s.phone || 'N/A')}</td>
      <td>
        <button class="btn btn-primary" style="padding:2px 6px; font-size:0.75rem;" onclick="editSupplierInModal(${s.id})">✏️ Edit</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function renderCategoriesListModal() {
  const tbody = document.getElementById('categoriesListModalBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!categoriesList || categoriesList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;">No categories registered yet.</td></tr>`;
    return;
  }

  categoriesList.forEach(c => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>#${c.id}</td>
      <td><strong>${escapeHtml(c.name)}</strong></td>
      <td>
        <button class="btn btn-primary" style="padding:2px 6px; font-size:0.75rem;" onclick="editCategoryInModal(${c.id})">✏️ Edit</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function renderSuppliersPage() {
  const tbody = document.getElementById('pageSuppliersTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!suppliersList || suppliersList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">No suppliers registered yet.</td></tr>`;
    return;
  }

  suppliersList.forEach(s => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>#${s.id}</td>
      <td><strong>${escapeHtml(s.name)}</strong></td>
      <td>${escapeHtml(s.contact_person || 'N/A')}</td>
      <td>${escapeHtml(s.phone || 'N/A')}</td>
      <td>${escapeHtml(s.address || 'N/A')}</td>
      <td>
        <button class="btn btn-primary" style="padding:2px 6px; font-size:0.75rem;" onclick="editPageSupplier(${s.id})">✏️ Edit</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function renderCategoriesPage() {
  const tbody = document.getElementById('pageCategoriesTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!categoriesList || categoriesList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;">No categories registered yet.</td></tr>`;
    return;
  }

  categoriesList.forEach(c => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>#${c.id}</td>
      <td><strong>${escapeHtml(c.name)}</strong></td>
      <td>
        <button class="btn btn-primary" style="padding:2px 6px; font-size:0.75rem;" onclick="editPageCategory(${c.id})">✏️ Edit</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.editSupplierInModal = function(supId) {
  const sup = (suppliersList || []).find(s => s.id === supId);
  if (sup) {
    document.getElementById('editSupplierId').value = sup.id;
    document.getElementById('supNameInput').value = sup.name;
    document.getElementById('supContactInput').value = sup.contact_person || '';
    document.getElementById('supPhoneInput').value = sup.phone || '';
    document.getElementById('supAddressInput').value = sup.address || '';
    document.getElementById('btnSaveSupplier').textContent = '✏️ Update Supplier';
    document.getElementById('btnCancelEditSupplier').style.display = 'inline-block';
    document.getElementById('supNameInput').focus();
  }
};

window.editCategoryInModal = function(catId) {
  const cat = (categoriesList || []).find(c => c.id === catId);
  if (cat) {
    document.getElementById('editCategoryId').value = cat.id;
    document.getElementById('catNameInput').value = cat.name;
    document.getElementById('btnSaveCategory').textContent = '✏️ Update Category';
    document.getElementById('btnCancelEditCategory').style.display = 'inline-block';
    document.getElementById('catNameInput').focus();
  }
};

window.editPageSupplier = function(supId) {
  const sup = (suppliersList || []).find(s => s.id === supId);
  if (sup) {
    document.getElementById('pageEditSupplierId').value = sup.id;
    document.getElementById('pageSupNameInput').value = sup.name;
    document.getElementById('pageSupContactInput').value = sup.contact_person || '';
    document.getElementById('pageSupPhoneInput').value = sup.phone || '';
    document.getElementById('pageSupAddressInput').value = sup.address || '';
    document.getElementById('btnPageSaveSupplier').textContent = '✏️ Update Supplier';
    document.getElementById('btnPageCancelEditSupplier').style.display = 'inline-block';
    document.getElementById('pageSupNameInput').focus();
  }
};

window.editPageCategory = function(catId) {
  const cat = (categoriesList || []).find(c => c.id === catId);
  if (cat) {
    document.getElementById('pageEditCategoryId').value = cat.id;
    document.getElementById('pageCatNameInput').value = cat.name;
    document.getElementById('btnPageSaveCategory').textContent = '✏️ Update Category';
    document.getElementById('btnPageCancelEditCategory').style.display = 'inline-block';
    document.getElementById('pageCatNameInput').focus();
  }
};

function populateCategoryDropdowns() {
  const posFilter = document.getElementById('posCategoryFilter');
  const modalProdCat = document.getElementById('prodCategory');

  if (posFilter) posFilter.innerHTML = '<option value="ALL">All Categories</option>';
  if (modalProdCat) modalProdCat.innerHTML = '<option value="">-- Select Category --</option>';

  (categoriesList || []).forEach(c => {
    if (posFilter) posFilter.innerHTML += `<option value="${c.id}">${escapeHtml(c.name)}</option>`;
    if (modalProdCat) modalProdCat.innerHTML += `<option value="${c.id}">${escapeHtml(c.name)}</option>`;
  });
}

function populateSupplierDropdowns() {
  const modalSup = document.getElementById('prodSupplier');
  const orderSup = document.getElementById('supplierOrderSelect');
  const posSupFilter = document.getElementById('posSupplierFilter');

  if (modalSup) modalSup.innerHTML = '<option value="">-- Select Supplier --</option>';
  if (orderSup) orderSup.innerHTML = '<option value="">-- Select Supplier --</option>';
  if (posSupFilter) posSupFilter.innerHTML = '<option value="ALL">All Suppliers</option>';

  (suppliersList || []).forEach(s => {
    if (modalSup) modalSup.innerHTML += `<option value="${s.id}">${escapeHtml(s.name)}</option>`;
    if (orderSup) orderSup.innerHTML += `<option value="${s.id}">${escapeHtml(s.name)}</option>`;
    if (posSupFilter) posSupFilter.innerHTML += `<option value="${s.id}">${escapeHtml(s.name)}</option>`;
  });
}

function populateCustomerDropdowns() {
  const cartCust = document.getElementById('cartCustomerSelect');
  if (!cartCust) return;
  cartCust.innerHTML = '';

  (customersList || []).forEach(cust => {
    const isWalkIn = cust.id === 1;
    const debtStr = isWalkIn ? '' : ` (Debt: ${formatCurrency(cust.current_debt_cents)})`;
    cartCust.innerHTML += `<option value="${cust.id}">${escapeHtml(cust.name)}${debtStr}</option>`;
  });

  cartCust.value = "1";
}
