/**
 * MediDesk POS - Application Entry Point
 * Initializes all modules and loads master data
 */

// Data Loading Functions
async function loadSettings() {
  const res = await window.api.getSettings();
  if (res.success && res.data) {
    settings = res.data;
    document.getElementById('displayStoreName').textContent = settings.store_name || 'MediDesk Pharmacy';
    document.getElementById('displayStoreSub').textContent = settings.store_address || '';
    // Populate settings form
    document.getElementById('settingStoreName').value = settings.store_name || '';
    document.getElementById('settingStorePhone').value = settings.store_phone || '';
    document.getElementById('settingStoreAddress').value = settings.store_address || '';
    document.getElementById('settingNtnFbr').value = settings.ntn_fbr_id || '';
    document.getElementById('settingDisclaimer').value = settings.receipt_disclaimer || '';
  }
}

async function loadMasterData() {
  // Categories
  const catRes = await window.api.getCategories();
  if (catRes.success) {
    categoriesList = catRes.data;
    populateCategoryDropdowns();
  }
  // Suppliers
  const supRes = await window.api.getSuppliers();
  if (supRes.success) {
    suppliersList = supRes.data;
    populateSupplierDropdowns();
  }
  // Customers
  const custRes = await window.api.getCustomers();
  if (custRes.success) {
    customersList = custRes.data;
    populateCustomerDropdowns();
  }
  // Products
  await reloadProducts();
  renderProductGrid();
  updateExpiryBadge();
  updateLowStockBadge();
  renderSuppliersPage();
  renderCategoriesPage();
}

async function reloadProducts() {
  const res = await window.api.getProducts();
  if (res.success) {
    productsList = res.data;
  }
}

// DOM Ready Initialization
document.addEventListener('DOMContentLoaded', async () => {
  // Setup all module event handlers
  setupNavigation();
  setupPinAuth();
  setupThemeToggle();
  setupUniversalModalHandlers();
  await loadSettings();
  await loadMasterData();
  setupPosEvents();
  setupInventoryEvents();
  setupKhataEvents();
  setupAddCustomerModal();
  setupRestockEvents();
  setupQuotationEvents();
  setupSalesEvents();
  setupSettingsEvents();
  setupDashboardEvents();
  setupSupplierCategoryEvents();
  setupPaginationListeners();
  setupKeyboardShortcuts();
  setupUserManagement();
  if (typeof applyRolePermissions === 'function') applyRolePermissions(currentUser);
});
