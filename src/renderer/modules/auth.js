/**
 * MediDesk POS - Authentication Module
 * Handles 4-digit security PIN verification, lock/unlock terminal, and PIN dots UI.
 */

function setupPinAuth() {
  const pinKeys = document.querySelectorAll('.pin-key');
  const modal = document.getElementById('modalPinAuth');
  const lockBtn = document.getElementById('lockPinBtn');

  if (lockBtn) {
    lockBtn.addEventListener('click', () => {
      currentUser = null;
      enteredPin = '';
      updatePinDots();
      if (modal) modal.classList.add('active');
      if (typeof applyRolePermissions === 'function') applyRolePermissions(null);
    });
  }

  pinKeys.forEach(key => {
    key.addEventListener('click', async () => {
      const val = key.getAttribute('data-key');
      if (val === 'CLEAR') {
        enteredPin = '';
      } else if (val === 'BACK') {
        enteredPin = enteredPin.slice(0, -1);
      } else if (enteredPin.length < 4) {
        enteredPin += val;
      }
      updatePinDots();

      if (enteredPin.length === 4) {
        await verifyPin(enteredPin);
      }
    });
  });

  // Physical External Keyboard & Numpad PIN Entry
  document.addEventListener('keydown', async (e) => {
    if (!modal || !modal.classList.contains('active')) return;

    if (/^[0-9]$/.test(e.key)) {
      e.preventDefault();
      if (enteredPin.length < 4) {
        enteredPin += e.key;
        updatePinDots();
        if (enteredPin.length === 4) {
          await verifyPin(enteredPin);
        }
      }
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      enteredPin = enteredPin.slice(0, -1);
      updatePinDots();
    } else if (e.key === 'Delete' || e.key === 'c' || e.key === 'C') {
      e.preventDefault();
      enteredPin = '';
      updatePinDots();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (enteredPin.length === 4) {
        await verifyPin(enteredPin);
      }
    }
  });
}

function updatePinDots() {
  const dots = document.querySelectorAll('.pin-dot');
  dots.forEach((dot, index) => {
    if (index < enteredPin.length) {
      dot.classList.add('filled');
    } else {
      dot.classList.remove('filled');
    }
  });
}

async function verifyPin(pin) {
  try {
    const res = await window.api.verifyPin(String(pin));
    if (res.success && res.data) {
      currentUser = res.data;
      applyRolePermissions(currentUser);

      const modal = document.getElementById('modalPinAuth');
      if (modal) modal.classList.remove('active');

      enteredPin = '';
      updatePinDots();
      restoreActiveFocus();
      showToast(`Welcome, ${currentUser.name} (${currentUser.role})!`);
    } else {
      showToast(res.error || 'Invalid Security PIN! Please try again.', 'error');
      enteredPin = '';
      updatePinDots();
    }
  } catch (err) {
    showToast(`Authentication Error: ${err.message}`, 'error');
    enteredPin = '';
    updatePinDots();
  }
}

/**
 * Apply role-based visibility to navigation items and administrative features
 */
function applyRolePermissions(user) {
  const role = user?.role || 'Guest';

  const userNameEl = document.getElementById('userName');
  const userRoleEl = document.getElementById('userRole');
  const userAvatarEl = document.getElementById('userAvatar');
  if (userNameEl) userNameEl.textContent = user ? user.name : 'Terminal Locked';
  if (userRoleEl) userRoleEl.textContent = user ? user.role : 'Locked';
  if (userAvatarEl) userAvatarEl.textContent = user && user.name ? user.name.charAt(0).toUpperCase() : '🔒';

  // Navigation sidebar elements
  const navPos = document.getElementById('navPos');
  const navDashboard = document.getElementById('navDashboard');
  const navInventory = document.getElementById('navInventory');
  const navSuppliers = document.getElementById('navSuppliers');
  const navKhata = document.getElementById('navKhata');
  const navOrders = document.getElementById('navOrders');
  const navExpiry = document.getElementById('navExpiry');
  const navQuotation = document.getElementById('navQuotation');
  const navSales = document.getElementById('navSales');
  const navSettings = document.getElementById('navSettings');

  const isAdmin = role === 'Admin';
  const isManager = role === 'Manager';
  const isCashier = role === 'Cashier';

  if (isAdmin) {
    // Admin has full access to every screen
    [navPos, navDashboard, navInventory, navSuppliers, navKhata, navOrders, navExpiry, navQuotation, navSales, navSettings]
      .forEach(el => { if (el) el.style.display = 'flex'; });
  } else if (isManager) {
    // Manager has access to everything except system settings & user mgmt
    [navPos, navDashboard, navInventory, navSuppliers, navKhata, navOrders, navExpiry, navQuotation, navSales]
      .forEach(el => { if (el) el.style.display = 'flex'; });
    if (navSettings) navSettings.style.display = 'none';
  } else if (isCashier) {
    // Cashier: Only POS, Khata, Expiry, Quotation, Sales
    if (navPos) navPos.style.display = 'flex';
    if (navKhata) navKhata.style.display = 'flex';
    if (navExpiry) navExpiry.style.display = 'flex';
    if (navQuotation) navQuotation.style.display = 'flex';
    if (navSales) navSales.style.display = 'flex';

    // Strictly hide management and admin screens
    if (navDashboard) navDashboard.style.display = 'none';
    if (navInventory) navInventory.style.display = 'none';
    if (navSuppliers) navSuppliers.style.display = 'none';
    if (navOrders) navOrders.style.display = 'none';
    if (navSettings) navSettings.style.display = 'none';
  } else {
    // Locked terminal: Hide management screens
    [navDashboard, navInventory, navSuppliers, navOrders, navSettings]
      .forEach(el => { if (el) el.style.display = 'none'; });
  }

  // Toggle in-page admin controls
  document.querySelectorAll('.admin-only').forEach(el => {
    el.style.display = isAdmin ? '' : 'none';
  });
  document.querySelectorAll('.manager-or-admin').forEach(el => {
    el.style.display = (isAdmin || isManager) ? '' : 'none';
  });

  // Re-render sales table if active to show/hide void buttons
  if (typeof renderSalesTable === 'function' && document.getElementById('salesView')?.classList.contains('active')) {
    renderSalesTable();
  }

  // If current view is not allowed for this role, bounce back to POS view
  if (typeof isViewAllowed === 'function') {
    const activeView = document.querySelector('.view-section.active');
    if (activeView && !isViewAllowed(activeView.id, role)) {
      if (typeof switchView === 'function') switchView('posView');
    }
  }
}

// Global scope bindings
window.setupPinAuth = setupPinAuth;
window.updatePinDots = updatePinDots;
window.verifyPin = verifyPin;
window.applyRolePermissions = applyRolePermissions;
