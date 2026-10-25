const { contextBridge, ipcRenderer } = require('electron');

/**
 * Production-Ready Typed Preload API for MediDesk POS
 * Secure ContextBridge exposing strictly parameterized named IPC channels.
 * Zero raw SQL execution pass-throughs.
 */
const api = {
  // =========================================================================
  // 1. AUTHENTICATION
  // =========================================================================
  verifyPin: (pin) => ipcRenderer.invoke('auth:verifyPin', typeof pin === 'object' ? pin : { pin }),
  changePin: (userId, oldPin, newPin) => {
    if (typeof userId === 'object' && userId !== null) {
      return ipcRenderer.invoke('auth:changePin', userId);
    }
    return ipcRenderer.invoke('auth:changePin', { userId, oldPin, newPin });
  },

  // =========================================================================
  // 2. USER MANAGEMENT
  // =========================================================================
  getUsers: () => ipcRenderer.invoke('users:getAll'),
  addUser: (userData) => ipcRenderer.invoke('users:add', userData),
  updateUser: (userData) => ipcRenderer.invoke('users:update', userData),
  deactivateUser: (id) => ipcRenderer.invoke('users:deactivate', typeof id === 'object' ? id : { id }),

  // =========================================================================
  // 3. PRODUCTS & INVENTORY
  // =========================================================================
  getProducts: () => ipcRenderer.invoke('products:getAll'),
  addProduct: (productData) => ipcRenderer.invoke('products:add', productData),
  updateProduct: (productData) => ipcRenderer.invoke('products:update', productData),
  deleteProduct: (id) => ipcRenderer.invoke('products:delete', typeof id === 'object' ? id : { id }),
  getProductStock: (productId) => ipcRenderer.invoke('products:getStock', typeof productId === 'object' ? productId : { productId }),
  getStock: (productId) => ipcRenderer.invoke('products:getStock', typeof productId === 'object' ? productId : { productId }),

  // =========================================================================
  // 4. CATEGORIES
  // =========================================================================
  getCategories: () => ipcRenderer.invoke('categories:getAll'),
  addCategory: (categoryData) => ipcRenderer.invoke('categories:add', categoryData),
  updateCategory: (id, name) => {
    if (typeof id === 'object' && id !== null) {
      return ipcRenderer.invoke('categories:update', id);
    }
    return ipcRenderer.invoke('categories:update', { id, name });
  },

  // =========================================================================
  // 5. SUPPLIERS
  // =========================================================================
  getSuppliers: () => ipcRenderer.invoke('suppliers:getAll'),
  addSupplier: (supplierData) => ipcRenderer.invoke('suppliers:add', supplierData),
  updateSupplier: (supplierData) => ipcRenderer.invoke('suppliers:update', supplierData),

  // =========================================================================
  // 6. CUSTOMERS & KHATA LEDGER
  // =========================================================================
  getCustomers: () => ipcRenderer.invoke('customers:getAll'),
  addCustomer: (customerData) => ipcRenderer.invoke('customers:add', customerData),
  updateCustomer: (customerData) => ipcRenderer.invoke('customers:update', customerData),
  recordCustomerPayment: (paymentData) => ipcRenderer.invoke('customers:recordPayment', paymentData),
  recordPayment: (custId, amountCents, notes) => ipcRenderer.invoke('customers:recordPayment', { custId, amountCents, notes }),
  getCustomerLedger: (custId) => ipcRenderer.invoke('customers:getLedger', { custId }),

  // =========================================================================
  // 7. CHECKOUT & POINT OF SALE
  // =========================================================================
  processCheckout: (checkoutData) => ipcRenderer.invoke('checkout:process', checkoutData),

  // =========================================================================
  // 8. SALES HISTORY & RETURNS
  // =========================================================================
  getSales: (page, pageSize) => {
    if (typeof page === 'object' && page !== null) {
      return ipcRenderer.invoke('sales:getAll', page);
    }
    return ipcRenderer.invoke('sales:getAll', { page, pageSize });
  },
  getSalesCount: () => ipcRenderer.invoke('sales:getCount'),
  getSale: (id) => ipcRenderer.invoke('sales:get', typeof id === 'object' ? id : { id }),
  getSaleItems: (saleId) => ipcRenderer.invoke('sales:getItems', typeof saleId === 'object' ? saleId : { saleId }),
  voidSale: (saleId, reason, userId, userName) => {
    if (typeof saleId === 'object' && saleId !== null) {
      return ipcRenderer.invoke('sales:void', saleId);
    }
    return ipcRenderer.invoke('sales:void', { saleId, reason, userId, userName });
  },
  updateSalePrescription: (saleId, prescriptionPath) => {
    if (typeof saleId === 'object' && saleId !== null) {
      return ipcRenderer.invoke('sales:updatePrescription', saleId);
    }
    return ipcRenderer.invoke('sales:updatePrescription', { saleId, prescriptionPath });
  },

  // =========================================================================
  // 9. PARKED ORDERS
  // =========================================================================
  getParkedOrders: () => ipcRenderer.invoke('parked:getAll'),
  saveParkedOrder: (orderData) => ipcRenderer.invoke('parked:save', orderData),
  parkOrder: (orderData) => ipcRenderer.invoke('parked:save', orderData),
  deleteParkedOrder: (id) => ipcRenderer.invoke('parked:delete', typeof id === 'object' ? id : { id }),

  // =========================================================================
  // 10. EXECUTIVE DASHBOARD & REPORTING
  // =========================================================================
  getDashboardStats: () => ipcRenderer.invoke('dashboard:getStats'),
  getDashboardTrend: () => ipcRenderer.invoke('dashboard:getTrend'),
  getDashboardPaymentDist: () => ipcRenderer.invoke('dashboard:getPaymentDist'),
  getDashboardTopProducts: () => ipcRenderer.invoke('dashboard:getTopProducts'),
  getDashboardSupplySchedule: () => ipcRenderer.invoke('dashboard:getSupplySchedule'),

  // =========================================================================
  // 11. EXPIRY & LOW STOCK ALERTS
  // =========================================================================
  getExpiryProducts: () => ipcRenderer.invoke('expiry:getProducts'),
  getExpiryCount: () => ipcRenderer.invoke('expiry:getCount'),
  getLowStockCount: () => ipcRenderer.invoke('stock:getLowCount'),
  discardStock: (productId) => ipcRenderer.invoke('expiry:discardStock', typeof productId === 'object' ? productId : { productId }),

  // =========================================================================
  // 12. STORE SETTINGS
  // =========================================================================
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settingsData) => ipcRenderer.invoke('settings:save', settingsData),

  // =========================================================================
  // 13. AUDIT LOGGING
  // =========================================================================
  logAudit: (auditData) => ipcRenderer.invoke('audit:log', auditData),

  // =========================================================================
  // 14. FILE STORAGE, BACKUPS & HARDWARE PRINTING
  // =========================================================================
  savePrescription: (fileData) => ipcRenderer.invoke('file:savePrescription', fileData),
  saveLogo: (fileData) => ipcRenderer.invoke('file:saveLogo', fileData),
  backupDatabase: () => ipcRenderer.invoke('db:backup'),
  restoreDatabase: () => ipcRenderer.invoke('db:restore'),
  factoryReset: () => ipcRenderer.invoke('file:factoryReset'),
  print: (options = {}) => ipcRenderer.invoke('app:print', options),

  // =========================================================================
  // 15. DASHBOARD CONVENIENCE ALIASES (for modules that call getPaymentDistribution etc.)
  // =========================================================================
  getPaymentDistribution: () => ipcRenderer.invoke('dashboard:getPaymentDist'),
  getTopProducts: () => ipcRenderer.invoke('dashboard:getTopProducts'),
  getSupplySchedule: () => ipcRenderer.invoke('dashboard:getSupplySchedule'),
  'auth:verifyPin': (args) => ipcRenderer.invoke('auth:verifyPin', args),
  'auth:changePin': (args) => ipcRenderer.invoke('auth:changePin', args),
  'users:getAll': (args) => ipcRenderer.invoke('users:getAll', args),
  'users:add': (args) => ipcRenderer.invoke('users:add', args),
  'users:update': (args) => ipcRenderer.invoke('users:update', args),
  'users:deactivate': (args) => ipcRenderer.invoke('users:deactivate', args),
  'products:getAll': (args) => ipcRenderer.invoke('products:getAll', args),
  'products:add': (args) => ipcRenderer.invoke('products:add', args),
  'products:update': (args) => ipcRenderer.invoke('products:update', args),
  'products:delete': (args) => ipcRenderer.invoke('products:delete', args),
  'products:getStock': (args) => ipcRenderer.invoke('products:getStock', args),
  'categories:getAll': (args) => ipcRenderer.invoke('categories:getAll', args),
  'categories:add': (args) => ipcRenderer.invoke('categories:add', args),
  'categories:update': (args) => ipcRenderer.invoke('categories:update', args),
  'suppliers:getAll': (args) => ipcRenderer.invoke('suppliers:getAll', args),
  'suppliers:add': (args) => ipcRenderer.invoke('suppliers:add', args),
  'suppliers:update': (args) => ipcRenderer.invoke('suppliers:update', args),
  'customers:getAll': (args) => ipcRenderer.invoke('customers:getAll', args),
  'customers:add': (args) => ipcRenderer.invoke('customers:add', args),
  'customers:update': (args) => ipcRenderer.invoke('customers:update', args),
  'customers:recordPayment': (args) => ipcRenderer.invoke('customers:recordPayment', args),
  'checkout:process': (args) => ipcRenderer.invoke('checkout:process', args),
  'sales:getAll': (args) => ipcRenderer.invoke('sales:getAll', args),
  'sales:getCount': (args) => ipcRenderer.invoke('sales:getCount', args),
  'sales:get': (args) => ipcRenderer.invoke('sales:get', args),
  'sales:getItems': (args) => ipcRenderer.invoke('sales:getItems', args),
  'sales:void': (args) => ipcRenderer.invoke('sales:void', args),
  'sales:updatePrescription': (args) => ipcRenderer.invoke('sales:updatePrescription', args),
  'parked:getAll': (args) => ipcRenderer.invoke('parked:getAll', args),
  'parked:save': (args) => ipcRenderer.invoke('parked:save', args),
  'parked:delete': (args) => ipcRenderer.invoke('parked:delete', args),
  'dashboard:getStats': (args) => ipcRenderer.invoke('dashboard:getStats', args),
  'dashboard:getTrend': (args) => ipcRenderer.invoke('dashboard:getTrend', args),
  'dashboard:getPaymentDist': (args) => ipcRenderer.invoke('dashboard:getPaymentDist', args),
  'dashboard:getTopProducts': (args) => ipcRenderer.invoke('dashboard:getTopProducts', args),
  'dashboard:getSupplySchedule': (args) => ipcRenderer.invoke('dashboard:getSupplySchedule', args),
  'expiry:getProducts': (args) => ipcRenderer.invoke('expiry:getProducts', args),
  'expiry:getCount': (args) => ipcRenderer.invoke('expiry:getCount', args),
  'stock:getLowCount': (args) => ipcRenderer.invoke('stock:getLowCount', args),
  'expiry:discardStock': (args) => ipcRenderer.invoke('expiry:discardStock', args),
  'settings:get': (args) => ipcRenderer.invoke('settings:get', args),
  'settings:save': (args) => ipcRenderer.invoke('settings:save', args),
  'audit:log': (args) => ipcRenderer.invoke('audit:log', args),
  'file:savePrescription': (args) => ipcRenderer.invoke('file:savePrescription', args),
  'file:saveLogo': (args) => ipcRenderer.invoke('file:saveLogo', args),
  'db:backup': (args) => ipcRenderer.invoke('db:backup', args),
  'db:restore': (args) => ipcRenderer.invoke('db:restore', args),
  'file:factoryReset': (args) => ipcRenderer.invoke('file:factoryReset', args),
  'app:print': (args) => ipcRenderer.invoke('app:print', args)
};

contextBridge.exposeInMainWorld('api', api);
