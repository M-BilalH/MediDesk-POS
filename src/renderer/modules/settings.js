/**
 * MediDesk POS - Settings, Database Maintenance & System Lifecycle Module
 * Handles store profile persistence, offline SQLite backups, restore points, and administrative factory reset.
 */

function setupSettingsEvents() {
  const settingsForm = document.getElementById('settingsForm');
  const btnBackup = document.getElementById('btnBackupDb');
  const btnRestore = document.getElementById('btnRestoreDb');
  const btnOpenReset = document.getElementById('btnOpenFactoryResetModal');
  const btnExecReset = document.getElementById('btnExecuteFactoryReset');

  // Save Store Settings Form
  if (settingsForm) {
    settingsForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const name = document.getElementById('settingStoreName')?.value.trim();
      const phone = document.getElementById('settingStorePhone')?.value.trim();
      const address = document.getElementById('settingStoreAddress')?.value.trim();
      const ntn = document.getElementById('settingNtnFbr')?.value.trim();
      const disclaimer = document.getElementById('settingDisclaimer')?.value.trim();

      const payload = {
        store_name: name,
        store_phone: phone,
        store_address: address,
        ntn_fbr_id: ntn,
        receipt_disclaimer: disclaimer
      };

      const res = await window.api.saveSettings(payload);
      if (res && res.success) {
        showToast('Pharmacy store settings updated successfully!');
        if (typeof loadSettings === 'function') await loadSettings();
      } else {
        showToast('Failed to save settings: ' + (res?.error || 'Unknown error'), 'error');
      }
    });
  }

  // SQLite Backup Database
  if (btnBackup) {
    btnBackup.addEventListener('click', async () => {
      const res = await window.api.backupDatabase();
      if (res && res.success) {
        alert(`Local Backup Created Successfully!\nSaved to: ${res.backupPath}`);
        showToast('Local database backup created successfully!');
      } else {
        showToast('Backup failed: ' + (res?.error || 'Unknown error'), 'error');
      }
    });
  }

  // SQLite Restore Database
  if (btnRestore) {
    btnRestore.addEventListener('click', async () => {
      const res = await window.api.restoreDatabase();
      if (res && res.success) {
        alert(res.message || 'Database restored successfully! Reloading...');
        location.reload();
      } else if (res && res.error && !res.error.includes('cancelled')) {
        showToast('Restore failed: ' + res.error, 'error');
      }
    });
  }

  // Factory Reset Modal Trigger (Admin Role Enforced)
  if (btnOpenReset) {
    btnOpenReset.addEventListener('click', () => {
      // Role check: Admin only
      if (typeof requireRole === 'function') {
        if (!requireRole('Admin')) return;
      } else if (currentUser && currentUser.role !== 'Admin') {
        showToast('Unauthorized: Only administrators can access Factory Reset.', 'error');
        return;
      }

      const confirmInput = document.getElementById('resetConfirmInput');
      if (confirmInput) confirmInput.value = '';

      const modal = document.getElementById('modalFactoryResetConfirm');
      if (modal) {
        modal.classList.add('active');
        restoreActiveFocus(confirmInput);
      }
    });
  }

  // Factory Reset Execution Confirmation (Admin Role Enforced)
  if (btnExecReset) {
    btnExecReset.addEventListener('click', async () => {
      // Role check: Admin only
      if (typeof requireRole === 'function') {
        if (!requireRole('Admin')) return;
      } else if (currentUser && currentUser.role !== 'Admin') {
        showToast('Unauthorized: Only administrators can execute Factory Reset.', 'error');
        return;
      }

      const inputVal = document.getElementById('resetConfirmInput')?.value.trim().toUpperCase();
      if (inputVal !== 'RESET') {
        showToast('Confirmation mismatch! Please type "RESET" in capital letters to proceed.', 'error');
        return;
      }

      const res = await window.api.factoryReset();
      if (res && res.success) {
        alert(res.message || 'Factory Reset completed! System re-initialized with fresh database.');
        location.reload();
      } else {
        showToast('Factory Reset failed: ' + (res?.error || 'Unknown error'), 'error');
      }
    });
  }
}
