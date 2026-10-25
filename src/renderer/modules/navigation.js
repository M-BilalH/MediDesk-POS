/**
 * MediDesk POS - Navigation & Keyboard Shortcuts Module
 * Handles view switching, theme toggle, sidebar collapse, modal delegation,
 * and universal keyboard shortcuts (F1-F12, Enter, Escape).
 */

function setupThemeToggle() {
  const btn = document.getElementById('themeToggleBtn');
  if (!btn) return;

  btn.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    const themeIcon = document.getElementById('themeIcon');
    if (themeIcon) themeIcon.textContent = newTheme === 'dark' ? '🌙' : '☀️';
    const themeLabel = document.getElementById('themeLabel');
    if (themeLabel) themeLabel.textContent = newTheme === 'dark' ? 'Dark Mode' : 'Light Mode';
    try {
      localStorage.setItem('medidesk_theme', newTheme);
    } catch (e) {}
  });

  // Restore saved theme if available
  try {
    const savedTheme = localStorage.getItem('medidesk_theme');
    if (savedTheme) {
      document.documentElement.setAttribute('data-theme', savedTheme);
      const themeIcon = document.getElementById('themeIcon');
      if (themeIcon) themeIcon.textContent = savedTheme === 'dark' ? '🌙' : '☀️';
      const themeLabel = document.getElementById('themeLabel');
      if (themeLabel) themeLabel.textContent = savedTheme === 'dark' ? 'Dark Mode' : 'Light Mode';
    }
  } catch (e) {}
}

function setupNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const targetId = item.getAttribute('data-target');
      switchView(targetId, item);
    });
  });

  // Sidebar Collapse Minimizer
  const sidebar = document.getElementById('appSidebar');
  const btnToggle = document.getElementById('btnToggleSidebar');
  const toggleIcon = document.getElementById('sidebarToggleIcon');

  if (btnToggle && sidebar) {
    try {
      const isCollapsed = localStorage.getItem('medidesk_sidebar_collapsed') === 'true';
      if (isCollapsed) {
        sidebar.classList.add('collapsed');
        if (toggleIcon) toggleIcon.textContent = '▶';
      }
    } catch(e) {}

    btnToggle.addEventListener('click', () => {
      sidebar.classList.toggle('collapsed');
      const nowCollapsed = sidebar.classList.contains('collapsed');
      try {
        localStorage.setItem('medidesk_sidebar_collapsed', nowCollapsed ? 'true' : 'false');
      } catch(e) {}
      if (toggleIcon) toggleIcon.textContent = nowCollapsed ? '▶' : '◀';
    });
  }
}

const ROLE_PERMISSIONS = {
  'Admin': ['posView', 'dashboardView', 'inventoryView', 'suppliersView', 'khataView', 'ordersView', 'expiryView', 'quotationView', 'salesView', 'settingsView'],
  'Manager': ['posView', 'dashboardView', 'inventoryView', 'suppliersView', 'khataView', 'ordersView', 'expiryView', 'quotationView', 'salesView'],
  'Cashier': ['posView', 'khataView', 'expiryView', 'quotationView', 'salesView'],
  'Guest': ['posView']
};

function isViewAllowed(viewId, role) {
  const allowed = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS['Cashier'];
  return allowed.includes(viewId);
}

function switchView(viewId, activeNavItem) {
  const currentRole = (currentUser && currentUser.role) ? currentUser.role : 'Guest';
  if (!isViewAllowed(viewId, currentRole)) {
    showToast(`Access Denied: ${currentRole}s cannot access the ${viewId.replace('View', '')} screen.`, 'error');
    if (viewId !== 'posView') switchView('posView');
    return;
  }

  document.querySelectorAll('.view-section').forEach(view => view.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));

  const targetView = document.getElementById(viewId);
  if (targetView) targetView.classList.add('active');

  if (activeNavItem) {
    activeNavItem.classList.add('active');
  } else {
    const matchedNav = document.querySelector(`.nav-item[data-target="${viewId}"]`);
    if (matchedNav) matchedNav.classList.add('active');
  }

  // Reload data for specific view & auto-activate primary textfield
  if (viewId === 'posView') {
    if (typeof renderProductGrid === 'function') renderProductGrid();
    restoreActiveFocus(document.getElementById('posSearchInput'));
  } else if (viewId === 'dashboardView') {
    if (typeof renderDashboard === 'function') renderDashboard();
    restoreActiveFocus();
  } else if (viewId === 'inventoryView') {
    if (typeof renderInventoryTable === 'function') renderInventoryTable();
    restoreActiveFocus();
  } else if (viewId === 'suppliersView') {
    if (typeof renderSuppliersPage === 'function') renderSuppliersPage();
    if (typeof renderCategoriesPage === 'function') renderCategoriesPage();
    restoreActiveFocus(document.getElementById('pageSupNameInput'));
  } else if (viewId === 'khataView') {
    if (typeof renderCustomerTable === 'function') renderCustomerTable();
    restoreActiveFocus();
  } else if (viewId === 'ordersView') {
    if (typeof renderRestockTable === 'function') renderRestockTable();
    restoreActiveFocus();
  } else if (viewId === 'expiryView') {
    if (typeof renderExpiryCenter === 'function') renderExpiryCenter();
    restoreActiveFocus();
  } else if (viewId === 'quotationView') {
    if (typeof renderQuotationTable === 'function') renderQuotationTable();
    restoreActiveFocus();
  } else if (viewId === 'salesView') {
    if (typeof renderSalesTable === 'function') renderSalesTable();
    restoreActiveFocus();
  } else if (viewId === 'settingsView') {
    restoreActiveFocus(document.getElementById('settingStoreName'));
  } else {
    restoreActiveFocus();
  }
}

function setupUniversalModalHandlers() {
  document.addEventListener('click', (e) => {
    // Check if clicked element is a cross button, close button, or modal backdrop
    const closeBtn = e.target.closest('.modal-close, .closeReceiptModal, .closeA4Modal');
    if (closeBtn) {
      const modal = closeBtn.closest('.modal-overlay');
      if (modal) {
        modal.classList.remove('active');
        restoreActiveFocus();
      }
    }
  });
}

function setupKeyboardShortcuts() {
  // 1. Universal Form Field Enter Key Navigation (Skip search input and discount input custom enter listeners)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target && e.target.tagName === 'INPUT') {
      if (e.target.id === 'posSearchInput' || e.target.id === 'cartDiscountInput') {
        return;
      }

      const type = e.target.type;
      if (type !== 'submit' && type !== 'button' && type !== 'file') {
        const form = e.target.form;
        if (form) {
          e.preventDefault();
          const inputs = Array.from(form.querySelectorAll('input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])'));
          const index = inputs.indexOf(e.target);
          if (index > -1 && index < inputs.length - 1) {
            inputs[index + 1].focus();
          } else {
            // Last field -> submit form
            const submitBtn = form.querySelector('button[type="submit"]');
            if (submitBtn) {
              submitBtn.click();
            } else if (form.id === 'checkoutPaymentForm') {
              if (!isCheckoutInProgress && typeof processCheckout === 'function') {
                processCheckout();
              }
            }
          }
        }
      }
    }
  });

  // 2. Global Function Keys & Navigation Shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'F1' || e.key === 'F5') {
      e.preventDefault();
      switchView('posView');
      const searchInput = document.getElementById('posSearchInput');
      if (searchInput) searchInput.focus();
    }
    if (e.key === 'F2') {
      e.preventDefault();
      const checkoutModal = document.getElementById('modalCheckoutPayment');
      if (checkoutModal && checkoutModal.classList.contains('active')) {
        // FIX: F2 should NOT call processCheckout if isCheckoutInProgress is true
        if (!isCheckoutInProgress && typeof processCheckout === 'function') {
          processCheckout();
        }
      } else {
        if (typeof openCheckoutModal === 'function') {
          openCheckoutModal();
        }
      }
    }
    if (e.key === 'F3') {
      e.preventDefault();
      switchView('posView');
      const discountInput = document.getElementById('cartDiscountInput');
      if (discountInput) discountInput.focus();
    }
    if (e.key === 'F4') {
      e.preventDefault();
      switchView('posView');
      const customerSelect = document.getElementById('cartCustomerSelect');
      if (customerSelect) customerSelect.focus();
    }
    if (e.key === 'F12') {
      e.preventDefault();
      const lockBtn = document.getElementById('lockPinBtn');
      if (lockBtn) lockBtn.click();
    }
    if (e.key === 'Escape') {
      const activeModal = document.querySelector('.modal-overlay.active');
      if (activeModal && activeModal.id !== 'modalPinAuth') {
        activeModal.classList.remove('active');
        restoreActiveFocus();
      }
    }
  });

  // 3. Automatic Modal Focus Trapping on Modal Open
  const modalObserver = new MutationObserver((mutations) => {
    mutations.forEach(mutation => {
      if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
        const target = mutation.target;
        if (target.classList.contains('modal-overlay') && target.classList.contains('active')) {
          setTimeout(() => {
            const firstInput = target.querySelector('input:not([type="hidden"]):not([disabled]), select:not([disabled]), button:not(.modal-close)');
            if (firstInput) {
              firstInput.focus();
            }
          }, 80);
        }
      }
    });
  });

  document.querySelectorAll('.modal-overlay').forEach(modal => {
    modalObserver.observe(modal, { attributes: true });
  });
}

// Global scope bindings
window.setupThemeToggle = setupThemeToggle;
window.setupNavigation = setupNavigation;
window.switchView = switchView;
window.setupUniversalModalHandlers = setupUniversalModalHandlers;
window.setupKeyboardShortcuts = setupKeyboardShortcuts;
window.isViewAllowed = isViewAllowed;
