/**
 * MediDesk POS - Global Utilities Module
 * Provides currency formatting, barcodes, escaping, toast notifications,
 * focus restoration, role-based access checks, and error boundaries.
 */

// Format integer cents to Pakistani Rupee display string
function formatCurrency(cents) {
  if (isNaN(cents) || cents === null || cents === undefined) cents = 0;
  return `Rs ${(cents / 100).toFixed(2)}`;
}

// Parse currency string / float to integer cents
function parseCurrencyToCents(amount) {
  const val = parseFloat(amount);
  if (isNaN(val)) return 0;
  return Math.round(val * 100);
}

// Generate 12-Digit EAN Barcode with '890' prefix
function generateUniqueBarcode() {
  const prefix = '890';
  const randomDigits = Math.floor(100000000 + Math.random() * 900000000).toString();
  return prefix + randomDigits;
}

// XSS-Safe HTML String Escaping
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, function(m) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
  });
}

// Floating Non-Blocking Toast Notification System
function showToast(message, type = 'success') {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast-notification ${type === 'error' ? 'error' : ''}`;
  const icon = type === 'error' ? '❌' : (type === 'warning' ? '⚠️' : '✅');
  toast.innerHTML = `<span>${icon}</span> <span>${escapeHtml(String(message))}</span>`;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'toastOut 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards';
    setTimeout(() => {
      if (toast && toast.parentNode) {
        toast.remove();
      }
    }, 300);
  }, 2500);
}

// Focus Restoration Helper
function restoreActiveFocus(targetInput) {
  try {
    window.focus();
  } catch(e) {}
  setTimeout(() => {
    try {
      window.focus();
      if (targetInput && typeof targetInput.focus === 'function') {
        targetInput.focus();
      } else {
        const activeModal = document.querySelector('.modal-overlay.active');
        if (activeModal) {
          const firstInput = activeModal.querySelector('input:not([type="hidden"]):not([disabled]), select:not([disabled])');
          if (firstInput) firstInput.focus();
        } else {
          const activeView = document.querySelector('.view-section.active');
          if (activeView) {
            const firstInput = activeView.querySelector('input:not([type="hidden"]):not([disabled]), select:not([disabled])');
            if (firstInput) firstInput.focus();
          }
        }
      }
    } catch(err) {}
  }, 100);
}

// Role-Based Authorization Guard
function requireRole(...allowedRoles) {
  if (!currentUser || !currentUser.role) {
    showToast('Access denied: Authentication required.', 'error');
    return false;
  }
  const userRole = String(currentUser.role).toLowerCase();
  const allowed = allowedRoles.map(r => String(r).toLowerCase());
  if (!allowed.includes(userRole)) {
    showToast(`Access denied: Requires ${allowedRoles.join(' or ')} privileges.`, 'error');
    return false;
  }
  return true;
}

// Override blocking window.alert with non-blocking toast
window.alert = function(msg) {
  const str = String(msg).toLowerCase();
  const isErr = str.includes('error') || 
                str.includes('failed') || 
                str.includes('mismatch') || 
                str.includes('invalid') || 
                str.includes('denied') || 
                str.includes('violation') || 
                str.includes('exceeded') || 
                str.includes('insufficient') ||
                str.includes('warning');
  showToast(msg, isErr ? 'error' : 'success');
  restoreActiveFocus();
};

// Global Unhandled Error & Promise Rejection Boundaries
window.addEventListener('error', (event) => {
  console.error('Unhandled Global Error:', event.error || event.message);
  if (typeof showToast === 'function') {
    showToast(`System Notice: ${event.message || 'An unexpected error occurred.'}`, 'error');
  }
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled Promise Rejection:', event.reason);
  if (typeof showToast === 'function') {
    const reasonMsg = event.reason && event.reason.message ? event.reason.message : String(event.reason);
    showToast(`Promise Rejection: ${reasonMsg}`, 'error');
  }
});

// Explicit window bindings
window.formatCurrency = formatCurrency;
window.parseCurrencyToCents = parseCurrencyToCents;
window.generateUniqueBarcode = generateUniqueBarcode;
window.escapeHtml = escapeHtml;
window.showToast = showToast;
window.restoreActiveFocus = restoreActiveFocus;
window.requireRole = requireRole;
