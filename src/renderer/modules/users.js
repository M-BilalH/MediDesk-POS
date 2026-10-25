/**
 * MediDesk POS - User Management & Security PIN Module
 * Provides role-based access control, operator user directory, and cryptographic PIN enforcement (Admin Only).
 */

const BANNED_PINS = ['1234', '5678', '0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999'];

function setupUserManagement() {
  const btnOpenAdd = document.getElementById('btnOpenAddUser');
  const addUserForm = document.getElementById('addUserForm');
  const changePinForm = document.getElementById('changePinForm');

  if (btnOpenAdd) {
    btnOpenAdd.addEventListener('click', openAddUserModal);
  }

  if (addUserForm) {
    addUserForm.addEventListener('submit', handleAddUser);
  }

  if (changePinForm) {
    changePinForm.addEventListener('submit', handleChangePin);
  }

  // Load and display users table
  renderUsersTable();
}

async function renderUsersTable() {
  const tbody = document.getElementById('usersTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const res = await window.api.getUsers();
  if (!res || !res.success || !res.data || res.data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;">No users registered.</td></tr>`;
    return;
  }

  const users = res.data;
  users.forEach(u => {
    const isActive = u.is_active === 1;
    const isCurrent = currentUser && currentUser.id === u.id;
    const isPrimaryAdmin = u.id === 1;

    let statusBadge = isActive
      ? `<span class="badge badge-success">Active</span>`
      : `<span class="badge badge-danger">Deactivated</span>`;

    let actionButtons = `
      <button class="btn btn-primary" style="padding:2px 8px; font-size:0.75rem; margin-right:4px;" onclick="openChangePinModal(${u.id})">🔑 Change PIN</button>
    `;

    if (!isCurrent && !isPrimaryAdmin) {
      if (isActive) {
        actionButtons += `<button class="btn btn-danger" style="padding:2px 8px; font-size:0.75rem;" onclick="toggleUserActive(${u.id})">Deactivate</button>`;
      } else {
        actionButtons += `<button class="btn btn-accent" style="padding:2px 8px; font-size:0.75rem;" onclick="toggleUserActive(${u.id})">Activate</button>`;
      }
    } else {
      actionButtons += `<span style="font-size:0.75rem; color:var(--text-muted);">(Current/Root)</span>`;
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>#${u.id}</td>
      <td><strong>${escapeHtml(u.name)}</strong> ${isCurrent ? '<span class="badge badge-warning" style="font-size:0.65rem;">You</span>' : ''}</td>
      <td><span class="badge badge-info" style="font-weight:700;">${escapeHtml(u.role)}</span></td>
      <td>${statusBadge}</td>
      <td style="white-space:nowrap;">${actionButtons}</td>
    `;
    tbody.appendChild(tr);
  });
}

function openAddUserModal() {
  // Role check: Admin only
  if (typeof requireRole === 'function') {
    if (!requireRole('Admin')) return;
  } else if (currentUser && currentUser.role !== 'Admin') {
    showToast('Unauthorized: Only administrators can create new users.', 'error');
    return;
  }

  const form = document.getElementById('addUserForm');
  if (form) form.reset();
  const modal = document.getElementById('modalAddUser');
  if (modal) modal.classList.add('active');
  restoreActiveFocus(document.getElementById('newUserName'));
}

async function handleAddUser(e) {
  e.preventDefault();

  // Role check: Admin only
  if (typeof requireRole === 'function') {
    if (!requireRole('Admin')) return;
  } else if (currentUser && currentUser.role !== 'Admin') {
    showToast('Unauthorized: Only administrators can create new users.', 'error');
    return;
  }

  const name = document.getElementById('newUserName')?.value.trim();
  const role = document.getElementById('newUserRole')?.value;
  const pin = document.getElementById('newUserPin')?.value.trim();

  if (!name) {
    showToast('User name is required.', 'error');
    return;
  }

  if (!role || !['Admin', 'Manager', 'Cashier'].includes(role)) {
    showToast('Please select a valid user role.', 'error');
    return;
  }

  if (!pin || !/^\d{4,8}$/.test(pin)) {
    showToast('PIN must be 4 to 8 digits.', 'error');
    return;
  }

  if (BANNED_PINS.includes(pin)) {
    showToast('The entered PIN is too common or easily guessable. Please choose a more secure PIN.', 'error');
    return;
  }

  const res = await window.api.addUser({ name, role, pin });
  if (res && res.success) {
    showToast(`User "${name}" created successfully as ${role}!`);
    const modal = document.getElementById('modalAddUser');
    if (modal) modal.classList.remove('active');
    document.getElementById('addUserForm')?.reset();
    renderUsersTable();
  } else {
    showToast('Failed to add user: ' + (res?.error || 'Unknown error'), 'error');
  }
}

window.openChangePinModal = function(userId) {
  const modal = document.getElementById('modalChangePin');
  const userIdInput = document.getElementById('changePinUserId');
  const form = document.getElementById('changePinForm');

  if (userIdInput) userIdInput.value = userId;
  if (form) form.reset();
  if (modal) modal.classList.add('active');
  restoreActiveFocus(document.getElementById('currentPinInput'));
};

async function handleChangePin(e) {
  e.preventDefault();

  const userId = parseInt(document.getElementById('changePinUserId')?.value);
  const oldPin = document.getElementById('currentPinInput')?.value.trim();
  const newPin = document.getElementById('newPinInput')?.value.trim();
  const confirmPin = document.getElementById('confirmPinInput')?.value.trim();

  if (!userId || isNaN(userId)) {
    showToast('Invalid user reference.', 'error');
    return;
  }

  if (!oldPin) {
    showToast('Current PIN is required.', 'error');
    return;
  }

  if (!newPin || !/^\d{4,8}$/.test(newPin)) {
    showToast('New PIN must be 4 to 8 digits.', 'error');
    return;
  }

  if (newPin !== confirmPin) {
    showToast('New PIN and confirmation PIN do not match.', 'error');
    return;
  }

  if (BANNED_PINS.includes(newPin)) {
    showToast('New PIN is too common or easily guessable. Please choose a stronger PIN.', 'error');
    return;
  }

  const res = await window.api.changePin(userId, oldPin, newPin);
  if (res && res.success) {
    showToast('Security PIN changed successfully!');
    const modal = document.getElementById('modalChangePin');
    if (modal) modal.classList.remove('active');
    document.getElementById('changePinForm')?.reset();
    renderUsersTable();
  } else {
    showToast('Failed to change PIN: ' + (res?.error || 'Incorrect old PIN'), 'error');
  }
}

window.toggleUserActive = async function(userId) {
  // Role check: Admin only
  if (typeof requireRole === 'function') {
    if (!requireRole('Admin')) return;
  } else if (currentUser && currentUser.role !== 'Admin') {
    showToast('Unauthorized: Only administrators can modify user status.', 'error');
    return;
  }

  if (currentUser && currentUser.id === userId) {
    showToast('Cannot deactivate your own active session account.', 'error');
    return;
  }

  if (userId === 1) {
    showToast('Primary system administrator account cannot be deactivated.', 'error');
    return;
  }

  if (!confirm('Are you sure you want to toggle the active status of this user?')) {
    return;
  }

  const res = await window.api.deactivateUser(userId);
  if (res && res.success) {
    showToast('User status updated successfully.');
    renderUsersTable();
  } else {
    showToast('Failed to update user status: ' + (res?.error || 'Unknown error'), 'error');
  }
};
