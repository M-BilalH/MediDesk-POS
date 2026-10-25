/**
 * MediDesk POS - Electron Main Process
 * Production-Ready Backend Engine for Pharmacy Management
 */

const { app, BrowserWindow, ipcMain, dialog, session } = require('electron');
const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');
const { SCHEMA_SQL, INDEX_SQL, DEFAULT_SEED_DATA } = require('./database');

// Disable GPU Hardware Acceleration for Maximum Stability on Legacy Windows PCs
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');

// Standard Application Storage Directories
const DOCUMENTS_DIR = path.join(app.getPath('documents'), 'MediDeskPOS');
const DB_PATH = path.join(DOCUMENTS_DIR, 'medidesk_pos.db');
const LOGO_DIR = path.join(DOCUMENTS_DIR, 'Logo');
const PRESCRIPTIONS_DIR = path.join(DOCUMENTS_DIR, 'Prescriptions');
const BACKUPS_DIR = path.join(DOCUMENTS_DIR, 'Backups');

// Insecure / Banned PIN list for PIN validation
const BANNED_PINS = ['1234', '5678', '0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999'];

let mainWindow = null;
let db = null;
let saveTimer = null;
let isSaving = false;
let isSavePending = false;

/**
 * Ensure all required local application directories exist
 */
function ensureDirectoriesExist() {
  [DOCUMENTS_DIR, LOGO_DIR, PRESCRIPTIONS_DIR, BACKUPS_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}

/**
 * High-Performance Parameterized SQL Helpers
 */
function queryAll(sql, params = []) {
  if (!db) return [];
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function queryGet(sql, params = []) {
  const rows = queryAll(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

function executeRun(sql, params = []) {
  if (!db) throw new Error('Database connection is not initialized');
  db.run(sql, params);
  scheduleDatabaseSave();
  return { success: true };
}

function getLastInsertId() {
  const row = queryGet("SELECT last_insert_rowid() as id;");
  return row ? row.id : null;
}

/**
 * Atomic Debounced Database Persistence (300ms)
 * Writes to medidesk_pos.db.tmp, then renames to medidesk_pos.db
 */
function scheduleDatabaseSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    performAsyncSave();
  }, 300);
}

function performAsyncSave() {
  if (!db || isSaving) {
    isSavePending = true;
    return;
  }
  isSaving = true;
  isSavePending = false;

  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    const tmpPath = DB_PATH + '.tmp';

    fs.writeFile(tmpPath, buffer, (err) => {
      if (err) {
        isSaving = false;
        console.error('Failed writing temporary database file:', err);
        if (isSavePending) performAsyncSave();
        return;
      }

      fs.rename(tmpPath, DB_PATH, (renameErr) => {
        if (renameErr) {
          // Fallback copy on Windows if file is temporarily locked
          try {
            fs.copyFileSync(tmpPath, DB_PATH);
            try { fs.unlinkSync(tmpPath); } catch (_) {}
          } catch (copyErr) {
            console.error('Atomic rename fallback copy error:', copyErr);
          }
        }
        isSaving = false;
        if (isSavePending) {
          performAsyncSave();
        }
      });
    });
  } catch (err) {
    isSaving = false;
    console.error('Exporting database error:', err);
  }
}

/**
 * Synchronous Flush on Application Quit & Critical Restores
 */
function flushDatabaseSaveSync() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (db) {
    try {
      const data = db.export();
      const buffer = Buffer.from(data);
      const tmpPath = DB_PATH + '.tmp';
      fs.writeFileSync(tmpPath, buffer);
      try {
        fs.renameSync(tmpPath, DB_PATH);
      } catch (rErr) {
        fs.copyFileSync(tmpPath, DB_PATH);
        try { fs.unlinkSync(tmpPath); } catch (_) {}
      }
    } catch (err) {
      console.error('Synchronous DB flush error:', err);
    }
  }
}

/**
 * Additive Schema Migration (NEVER drops tables)
 */
function runAdditiveMigrations() {
  try {
    // Ensure audit_log table exists
    db.run(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        user_name TEXT,
        action TEXT NOT NULL,
        details TEXT DEFAULT '',
        created_at TEXT NOT NULL
      );
    `);

    // Verify products table columns
    const prodCols = queryAll("PRAGMA table_info(products);").map(c => c.name);
    if (!prodCols.includes('cost_price_cents')) {
      db.run("ALTER TABLE products ADD COLUMN cost_price_cents INTEGER NOT NULL DEFAULT 0;");
    }
    if (!prodCols.includes('single_price_cents')) {
      db.run("ALTER TABLE products ADD COLUMN single_price_cents INTEGER NOT NULL DEFAULT 0;");
    }
    if (!prodCols.includes('allow_negative_stock')) {
      db.run("ALTER TABLE products ADD COLUMN allow_negative_stock INTEGER NOT NULL DEFAULT 0;");
    }
    if (!prodCols.includes('is_prescription_required')) {
      db.run("ALTER TABLE products ADD COLUMN is_prescription_required INTEGER NOT NULL DEFAULT 0;");
    }
    if (!prodCols.includes('min_stock_level')) {
      db.run("ALTER TABLE products ADD COLUMN min_stock_level INTEGER NOT NULL DEFAULT 5;");
    }

    // Verify sales table columns
    const salesCols = queryAll("PRAGMA table_info(sales);").map(c => c.name);
    if (!salesCols.includes('prescription_path')) {
      db.run("ALTER TABLE sales ADD COLUMN prescription_path TEXT DEFAULT '';");
    }
    if (!salesCols.includes('status')) {
      db.run("ALTER TABLE sales ADD COLUMN status TEXT NOT NULL DEFAULT 'COMPLETED';");
    }

    // Verify settings table columns
    const settingsCols = queryAll("PRAGMA table_info(settings);").map(c => c.name);
    if (!settingsCols.includes('logo_path')) {
      db.run("ALTER TABLE settings ADD COLUMN logo_path TEXT DEFAULT '';");
    }
  } catch (err) {
    console.error('Additive schema migration notice:', err);
  }
}

/**
 * Seed Initial Data:
 * - Always seed settings, users, customers, categories, suppliers with INSERT OR IGNORE
 * - Only insert seed products if products table has 0 rows
 */
function seedDatabase() {
  try {
    if (DEFAULT_SEED_DATA.settings) {
      db.run(DEFAULT_SEED_DATA.settings);
    }
    if (Array.isArray(DEFAULT_SEED_DATA.users)) {
      DEFAULT_SEED_DATA.users.forEach(sql => db.run(sql));
    }
    if (Array.isArray(DEFAULT_SEED_DATA.customers)) {
      DEFAULT_SEED_DATA.customers.forEach(sql => db.run(sql));
    }
    if (Array.isArray(DEFAULT_SEED_DATA.categories)) {
      DEFAULT_SEED_DATA.categories.forEach(sql => db.run(sql));
    }
    if (Array.isArray(DEFAULT_SEED_DATA.suppliers)) {
      DEFAULT_SEED_DATA.suppliers.forEach(sql => db.run(sql));
    }

    const countRow = queryGet("SELECT COUNT(*) as count FROM products;");
    const count = countRow ? countRow.count : 0;
    if (count === 0) {
      console.log('Products table has 0 rows. Seeding initial products & opening ledger...');
      if (Array.isArray(DEFAULT_SEED_DATA.products)) {
        DEFAULT_SEED_DATA.products.forEach(sql => db.run(sql));
      }
      if (Array.isArray(DEFAULT_SEED_DATA.ledger)) {
        DEFAULT_SEED_DATA.ledger.forEach(sql => db.run(sql));
      }
    }
  } catch (err) {
    console.error('Seeding database error:', err);
  }
}

/**
 * Daily Automatic Backup on Application Startup
 */
function runAutoStartupBackup() {
  try {
    if (!fs.existsSync(DB_PATH)) return;
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    const backupFileName = `auto_${dateStr}.db`;
    const backupFilePath = path.join(BACKUPS_DIR, backupFileName);

    if (!fs.existsSync(backupFilePath)) {
      console.log(`Creating daily auto-backup for ${dateStr}...`);
      fs.copyFileSync(DB_PATH, backupFilePath);
      console.log(`Auto-backup successfully stored at: ${backupFilePath}`);
    }
  } catch (err) {
    console.error('Auto-backup startup error:', err);
  }
}

/**
 * Initialize SQLite WASM Database Engine
 */
async function initDatabase() {
  ensureDirectoriesExist();

  const SQL = await initSqlJs({
    locateFile: file => path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', file)
  });

  if (fs.existsSync(DB_PATH)) {
    try {
      const fileBuffer = fs.readFileSync(DB_PATH);
      db = new SQL.Database(fileBuffer);
      db.exec("SELECT count(*) FROM sqlite_master;");
      console.log('Successfully connected to SQLite database at:', DB_PATH);
    } catch (err) {
      console.error('Corrupt database file detected:', err);
      try {
        const timeStamp = new Date().toISOString().replace(/[:.]/g, '-');
        const corruptPath = path.join(BACKUPS_DIR, `corrupt_${timeStamp}.db`);
        fs.copyFileSync(DB_PATH, corruptPath);
        console.log(`Corrupt database backed up to: ${corruptPath}`);
      } catch (backupErr) {
        console.error('Failed to copy corrupt database:', backupErr);
      }
      db = new SQL.Database();
    }
  } else {
    console.log('Creating fresh SQLite database instance at:', DB_PATH);
    db = new SQL.Database();
  }

  // Robust Production Pragmas
  try {
    db.run("PRAGMA synchronous = FULL;");
    db.run("PRAGMA journal_mode = WAL;");
  } catch (e) {
    console.warn("Pragma setup warning:", e.message);
  }

  // Base Schema Creation
  try {
    db.run(SCHEMA_SQL);
  } catch (err) {
    console.warn("Base schema creation notice:", err.message);
  }

  // Additive Migration & Indices
  runAdditiveMigrations();

  if (INDEX_SQL) {
    try {
      db.run(INDEX_SQL);
    } catch (err) {
      console.warn("Index creation warning:", err.message);
    }
  }

  // Initial Seeding
  seedDatabase();

  // Flush to disk & check daily backup
  flushDatabaseSaveSync();
  runAutoStartupBackup();
}

/**
 * Create Electron Application Window
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 768,
    minWidth: 1024,
    minHeight: 600,
    title: 'MediDesk POS - Offline Pharmacy Management System',
    icon: path.join(__dirname, 'renderer', 'icon.png'),
    show: false,
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
      enableWebSQL: false
    }
  });

  mainWindow.maximize();
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // DevTools strictly disabled unless explicitly launched with DEBUG=1
  if (process.env.DEBUG === '1') {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// App Lifecycle
app.whenReady().then(async () => {
  // Enforce Content-Security-Policy across all sessions
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: file: blob:; connect-src 'self';"
        ]
      }
    });
  });

  await initDatabase();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  flushDatabaseSaveSync();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  flushDatabaseSaveSync();
});

// =============================================================================
// PRODUCTION-READY NAMED IPC HANDLERS (PARAMETERIZED QUERIES ONLY)
// =============================================================================

// -----------------------------------------------------------------------------
// 1. AUTHENTICATION
// -----------------------------------------------------------------------------
ipcMain.handle('auth:verifyPin', async (event, args = {}) => {
  try {
    const pin = (typeof args === 'object' && args !== null && args.pin !== undefined) ? args.pin : args;
    if (!pin) throw new Error('PIN is required');
    const user = queryGet("SELECT id, name, role, is_active FROM users WHERE pin = ? AND is_active = 1;", [String(pin)]);
    if (!user) {
      return { success: false, error: 'Invalid PIN or user is inactive' };
    }
    return { success: true, data: user };
  } catch (err) {
    console.error('Handler error [auth:verifyPin]:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('auth:changePin', async (event, args = {}) => {
  try {
    const { userId, oldPin, newPin } = args;
    if (!userId || !oldPin || !newPin) throw new Error('User ID, current PIN, and new PIN are required');

    const user = queryGet("SELECT id FROM users WHERE id = ? AND pin = ?;", [userId, String(oldPin)]);
    if (!user) {
      throw new Error('Current PIN is incorrect');
    }

    const pinStr = String(newPin).trim();
    if (!/^\d{4,8}$/.test(pinStr)) {
      throw new Error('New PIN must be between 4 and 8 digits');
    }
    if (BANNED_PINS.includes(pinStr)) {
      throw new Error('The selected PIN is too common or insecure. Please choose a stronger PIN.');
    }

    const existing = queryGet("SELECT id FROM users WHERE pin = ? AND id != ?;", [pinStr, userId]);
    if (existing) {
      throw new Error('This PIN is already in use by another user');
    }

    executeRun("UPDATE users SET pin = ? WHERE id = ?;", [pinStr, userId]);
    return { success: true, data: { userId, message: 'PIN updated successfully' } };
  } catch (err) {
    console.error('Handler error [auth:changePin]:', err);
    return { success: false, error: err.message };
  }
});

// -----------------------------------------------------------------------------
// 2. USER MANAGEMENT
// -----------------------------------------------------------------------------
ipcMain.handle('users:getAll', async () => {
  try {
    const users = queryAll("SELECT id, name, role, is_active FROM users ORDER BY id ASC;");
    return { success: true, data: users };
  } catch (err) {
    console.error('Handler error [users:getAll]:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('users:add', async (event, args = {}) => {
  try {
    const { name, role, pin } = args;
    if (!name || !name.trim()) throw new Error('User name is required');
    if (!['Admin', 'Manager', 'Cashier'].includes(role)) {
      throw new Error('Invalid user role. Allowed roles: Admin, Manager, Cashier');
    }
    const pinStr = String(pin || '').trim();
    if (!/^\d{4,8}$/.test(pinStr)) {
      throw new Error('PIN must be 4 to 8 digits');
    }
    if (BANNED_PINS.includes(pinStr)) {
      throw new Error('The selected PIN is too common or insecure.');
    }
    const existing = queryGet("SELECT id FROM users WHERE pin = ?;", [pinStr]);
    if (existing) {
      throw new Error('This PIN is already in use by another user.');
    }

    executeRun("INSERT INTO users (name, role, pin, is_active) VALUES (?, ?, ?, 1);", [name.trim(), role, pinStr]);
    const newId = getLastInsertId();
    return { success: true, data: { id: newId, name: name.trim(), role, is_active: 1 } };
  } catch (err) {
    console.error('Handler error [users:add]:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('users:update', async (event, args = {}) => {
  try {
    const { id, name, role } = args;
    if (!id) throw new Error('User ID is required');
    if (!name || !name.trim()) throw new Error('User name is required');
    if (!['Admin', 'Manager', 'Cashier'].includes(role)) {
      throw new Error('Invalid user role. Allowed roles: Admin, Manager, Cashier');
    }
    executeRun("UPDATE users SET name = ?, role = ? WHERE id = ?;", [name.trim(), role, id]);
    return { success: true, data: { id, name: name.trim(), role } };
  } catch (err) {
    console.error('Handler error [users:update]:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('users:deactivate', async (event, args = {}) => {
  try {
    const id = (typeof args === 'object' && args !== null && args.id !== undefined) ? args.id : args;
    if (!id) throw new Error('User ID is required');
    executeRun("UPDATE users SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END WHERE id = ?;", [id]);
    const updated = queryGet("SELECT id, name, role, is_active FROM users WHERE id = ?;", [id]);
    return { success: true, data: updated };
  } catch (err) {
    console.error('Handler error [users:deactivate]:', err);
    return { success: false, error: err.message };
  }
});

// -----------------------------------------------------------------------------
// 3. PRODUCTS & INVENTORY
// -----------------------------------------------------------------------------
ipcMain.handle('products:getAll', async () => {
  try {
    const products = queryAll(`
      SELECT p.*, c.name as category_name, s.name as supplier_name 
      FROM products p 
      LEFT JOIN categories c ON p.category_id = c.id 
      LEFT JOIN suppliers s ON p.supplier_id = s.id 
      ORDER BY p.title ASC;
    `);
    return { success: true, data: products };
  } catch (err) {
    console.error('Handler error [products:getAll]:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('products:add', async (event, args = {}) => {
  try {
    const {
      barcode,
      title,
      generic_name = '',
      category_id = null,
      supplier_id = null,
      pack_size = 10,
      expiry_date = '2027-12-31',
      min_stock_level = 5,
      quantity_packs = 0,
      quantity_singles = 0,
      cost_price_cents = 0,
      sale_price_cents = 0,
      single_price_cents = 0,
      allow_negative_stock = 0,
      is_prescription_required = 0
    } = args;

    if (!title || !title.trim()) throw new Error('Product title is required');
    const finalBarcode = (barcode && barcode.trim()) ? barcode.trim() : ('890' + Math.floor(100000000 + Math.random() * 900000000));

    const existing = queryGet("SELECT id FROM products WHERE barcode = ?;", [finalBarcode]);
    if (existing) {
      throw new Error(`Product with barcode "${finalBarcode}" already exists.`);
    }

    executeRun(`
      INSERT INTO products (
        barcode, title, generic_name, category_id, supplier_id, pack_size, 
        expiry_date, min_stock_level, quantity_packs, quantity_singles, 
        cost_price_cents, sale_price_cents, single_price_cents, 
        allow_negative_stock, is_prescription_required
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `, [
      finalBarcode,
      title.trim(),
      generic_name || '',
      category_id || null,
      supplier_id || null,
      parseInt(pack_size, 10) || 10,
      expiry_date || '2027-12-31',
      parseInt(min_stock_level, 10) || 5,
      parseInt(quantity_packs, 10) || 0,
      parseInt(quantity_singles, 10) || 0,
      parseInt(cost_price_cents, 10) || 0,
      parseInt(sale_price_cents, 10) || 0,
      parseInt(single_price_cents, 10) || 0,
      allow_negative_stock ? 1 : 0,
      is_prescription_required ? 1 : 0
    ]);

    const newId = getLastInsertId();
    return { success: true, data: { id: newId, barcode: finalBarcode } };
  } catch (err) {
    console.error('Handler error [products:add]:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('products:update', async (event, args = {}) => {
  try {
    const {
      id,
      barcode,
      title,
      generic_name = '',
      category_id = null,
      supplier_id = null,
      pack_size = 10,
      expiry_date = '2027-12-31',
      min_stock_level = 5,
      quantity_packs = 0,
      quantity_singles = 0,
      cost_price_cents = 0,
      sale_price_cents = 0,
      single_price_cents = 0,
      allow_negative_stock = 0,
      is_prescription_required = 0
    } = args;

    if (!id) throw new Error('Product ID is required');
    if (!title || !title.trim()) throw new Error('Product title is required');

    if (barcode && barcode.trim()) {
      const existing = queryGet("SELECT id FROM products WHERE barcode = ? AND id != ?;", [barcode.trim(), id]);
      if (existing) {
        throw new Error(`Barcode "${barcode}" is already assigned to another product.`);
      }
    }

    executeRun(`
      UPDATE products SET 
        barcode = ?, title = ?, generic_name = ?, category_id = ?, supplier_id = ?, 
        pack_size = ?, expiry_date = ?, min_stock_level = ?, quantity_packs = ?, 
        quantity_singles = ?, cost_price_cents = ?, sale_price_cents = ?, 
        single_price_cents = ?, allow_negative_stock = ?, is_prescription_required = ?
      WHERE id = ?;
    `, [
      barcode ? barcode.trim() : '',
      title.trim(),
      generic_name || '',
      category_id || null,
      supplier_id || null,
      parseInt(pack_size, 10) || 10,
      expiry_date || '2027-12-31',
      parseInt(min_stock_level, 10) || 5,
      parseInt(quantity_packs, 10) || 0,
      parseInt(quantity_singles, 10) || 0,
      parseInt(cost_price_cents, 10) || 0,
      parseInt(sale_price_cents, 10) || 0,
      parseInt(single_price_cents, 10) || 0,
      allow_negative_stock ? 1 : 0,
      is_prescription_required ? 1 : 0,
      id
    ]);

    return { success: true, data: { id } };
  } catch (err) {
    console.error('Handler error [products:update]:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('products:delete', async (event, args = {}) => {
  try {
    const id = (typeof args === 'object' && args !== null && args.id !== undefined) ? args.id : args;
    if (!id) throw new Error('Product ID is required');
    executeRun("DELETE FROM products WHERE id = ?;", [id]);
    return { success: true, data: { id } };
  } catch (err) {
    console.error('Handler error [products:delete]:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('products:getStock', async (event, args = {}) => {
  try {
    const productId = (typeof args === 'object' && args !== null && (args.productId !== undefined || args.id !== undefined))
      ? (args.productId !== undefined ? args.productId : args.id)
      : args;
    if (!productId) throw new Error('Product ID is required');
    const stock = queryGet(`
      SELECT id, quantity_packs, quantity_singles, pack_size, allow_negative_stock, expiry_date, is_prescription_required 
      FROM products 
      WHERE id = ?;
    `, [productId]);
    return { success: true, data: stock };
  } catch (err) {
    console.error('Handler error [products:getStock]:', err);
    return { success: false, error: err.message };
  }
});

// -----------------------------------------------------------------------------
// 4. CATEGORIES
// -----------------------------------------------------------------------------
ipcMain.handle('categories:getAll', async () => {
  try {
    const categories = queryAll("SELECT * FROM categories ORDER BY name ASC;");
    return { success: true, data: categories };
  } catch (err) {
    console.error('Handler error [categories:getAll]:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('categories:add', async (event, args = {}) => {
  try {
    const { name, description = '' } = args;
    if (!name || !name.trim()) throw new Error('Category name is required');
    executeRun("INSERT INTO categories (name, description) VALUES (?, ?);", [name.trim(), description || '']);
    const id = getLastInsertId();
    return { success: true, data: { id, name: name.trim(), description } };
  } catch (err) {
    console.error('Handler error [categories:add]:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('categories:update', async (event, args = {}) => {
  try {
    const { id, name } = args;
    if (!id || !name || !name.trim()) throw new Error('ID and Category name are required');
    executeRun("UPDATE categories SET name = ? WHERE id = ?;", [name.trim(), id]);
    return { success: true, data: { id, name: name.trim() } };
  } catch (err) {
    console.error('Handler error [categories:update]:', err);
    return { success: false, error: err.message };
  }
});

// -----------------------------------------------------------------------------
// 5. SUPPLIERS
// -----------------------------------------------------------------------------
ipcMain.handle('suppliers:getAll', async () => {
  try {
    const suppliers = queryAll("SELECT * FROM suppliers ORDER BY name ASC;");
    return { success: true, data: suppliers };
  } catch (err) {
    console.error('Handler error [suppliers:getAll]:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('suppliers:add', async (event, args = {}) => {
  try {
    const { name, contact_person = '', phone = '', address = '' } = args;
    if (!name || !name.trim()) throw new Error('Supplier name is required');
    executeRun("INSERT INTO suppliers (name, contact_person, phone, address) VALUES (?, ?, ?, ?);", [
      name.trim(),
      contact_person || '',
      phone || '',
      address || ''
    ]);
    const id = getLastInsertId();
    return { success: true, data: { id, name: name.trim() } };
  } catch (err) {
    console.error('Handler error [suppliers:add]:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('suppliers:update', async (event, args = {}) => {
  try {
    const { id, name, contact_person = '', phone = '', address = '' } = args;
    if (!id || !name || !name.trim()) throw new Error('ID and Supplier name are required');
    executeRun("UPDATE suppliers SET name = ?, contact_person = ?, phone = ?, address = ? WHERE id = ?;", [
      name.trim(),
      contact_person || '',
      phone || '',
      address || '',
      id
    ]);
    return { success: true, data: { id, name: name.trim() } };
  } catch (err) {
    console.error('Handler error [suppliers:update]:', err);
    return { success: false, error: err.message };
  }
});

// -----------------------------------------------------------------------------
// 6. CUSTOMERS & KHATA LEDGER
// -----------------------------------------------------------------------------
ipcMain.handle('customers:getAll', async () => {
  try {
    const customers = queryAll("SELECT * FROM customers ORDER BY name ASC;");
    return { success: true, data: customers };
  } catch (err) {
    console.error('Handler error [customers:getAll]:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('customers:add', async (event, args = {}) => {
  try {
    const { name, phone = '', address = '', credit_limit_cents = 500000 } = args;
    if (!name || !name.trim()) throw new Error('Customer name is required');
    executeRun("INSERT INTO customers (name, phone, address, credit_limit_cents, current_debt_cents) VALUES (?, ?, ?, ?, 0);", [
      name.trim(),
      phone || '',
      address || '',
      parseInt(credit_limit_cents, 10) || 0
    ]);
    const id = getLastInsertId();
    return { success: true, data: { id, name: name.trim(), current_debt_cents: 0 } };
  } catch (err) {
    console.error('Handler error [customers:add]:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('customers:update', async (event, args = {}) => {
  try {
    const { id, name, phone = '', address = '', credit_limit_cents = 500000 } = args;
    if (!id || !name || !name.trim()) throw new Error('Customer ID and name are required');
    executeRun("UPDATE customers SET name = ?, phone = ?, address = ?, credit_limit_cents = ? WHERE id = ?;", [
      name.trim(),
      phone || '',
      address || '',
      parseInt(credit_limit_cents, 10) || 0,
      id
    ]);
    return { success: true, data: { id, name: name.trim() } };
  } catch (err) {
    console.error('Handler error [customers:update]:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('customers:recordPayment', async (event, args = {}) => {
  try {
    const custId = args.custId || args.customerId || args.id;
    const amountCents = parseInt(args.amountCents, 10) || 0;
    const notes = args.notes || 'Customer Debt Payment';

    if (!custId) throw new Error('Customer ID is required');
    if (amountCents <= 0) throw new Error('Payment amount must be greater than zero');

    db.run("BEGIN TRANSACTION;");
    try {
      const cust = queryGet("SELECT id, name, current_debt_cents FROM customers WHERE id = ?;", [custId]);
      if (!cust) throw new Error(`Customer with ID ${custId} not found`);

      const currentDebt = cust.current_debt_cents || 0;
      const newDebt = Math.max(0, currentDebt - amountCents);
      const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19);

      db.run("UPDATE customers SET current_debt_cents = ? WHERE id = ?;", [newDebt, custId]);
      db.run(`
        INSERT INTO customer_ledger (customer_id, sale_id, type, debit_cents, credit_cents, balance_after_cents, notes, created_at)
        VALUES (?, NULL, 'PAYMENT_RECEIVED', 0, ?, ?, ?, ?);
      `, [custId, amountCents, newDebt, notes, nowStr]);

      db.run("COMMIT;");
      scheduleDatabaseSave();
      return { success: true, data: { newDebt, previousDebt: currentDebt, paymentAmount: amountCents } };
    } catch (tErr) {
      try { db.run("ROLLBACK;"); } catch (_) {}
      throw tErr;
    }
  } catch (err) {
    console.error('Handler error [customers:recordPayment]:', err);
    return { success: false, error: err.message };
  }
});

// 6b. CUSTOMER LEDGER
ipcMain.handle('customers:getLedger', async (event, args = {}) => {
  try {
    const custId = args.custId || args.customerId || args.id;
    if (!custId) throw new Error('Customer ID is required');
    const rows = queryAll("SELECT * FROM customer_ledger WHERE customer_id = ? ORDER BY created_at ASC;", [custId]);
    return { success: true, data: rows };
  } catch (err) {
    console.error('Handler error [customers:getLedger]:', err);
    return { success: false, error: err.message };
  }
});

// -----------------------------------------------------------------------------
// 7. CHECKOUT (CRITICAL ATOMIC TRANSACTION)
// -----------------------------------------------------------------------------
ipcMain.handle('checkout:process', async (event, args = {}) => {
  try {
    const {
      invoiceNo,
      cashierId = 1,
      cashierName = 'Cashier',
      customerId = 1,
      customerName = 'Walk-in Customer',
      items = [],
      subtotalCents = 0,
      taxCents = 0,
      discountCents = 0,
      totalCents = 0,
      paidCents = 0,
      changeCents = 0,
      paymentMethod = 'CASH',
      prescriptionPath = ''
    } = args;

    if (!items || !Array.isArray(items) || items.length === 0) {
      throw new Error('Cannot process checkout with empty cart items');
    }

    const finalInvoiceNo = invoiceNo || ('INV-' + Date.now());
    const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19);

    db.run("BEGIN TRANSACTION;");
    try {
      // Step a & b: Fresh-read stock & validate all items
      const stockUpdates = [];
      for (const item of items) {
        const prodId = item.productId || item.id || item.product_id;
        const prod = queryGet("SELECT id, title, quantity_packs, quantity_singles, pack_size, allow_negative_stock FROM products WHERE id = ?;", [prodId]);
        if (!prod) {
          throw new Error(`Product not found with ID: ${prodId}`);
        }

        const unitType = (item.unitType || item.unit_type || 'PACK').toUpperCase();
        const qty = parseInt(item.quantity, 10) || 1;
        const packSize = Math.max(1, prod.pack_size || 10);
        let newPacks = prod.quantity_packs;
        let newSingles = prod.quantity_singles;

        if (unitType === 'PACK') {
          if (!prod.allow_negative_stock && prod.quantity_packs < qty) {
            throw new Error(`Insufficient stock for "${prod.title}". In stock: ${prod.quantity_packs} pack(s), Requested: ${qty}`);
          }
          newPacks = prod.quantity_packs - qty;
        } else {
          // SINGLE
          const totalAvailableSingles = (prod.quantity_packs * packSize) + prod.quantity_singles;
          if (!prod.allow_negative_stock && totalAvailableSingles < qty) {
            throw new Error(`Insufficient stock for "${prod.title}". In stock: ${totalAvailableSingles} unit(s), Requested: ${qty}`);
          }
          const netSingles = totalAvailableSingles - qty;
          if (netSingles >= 0) {
            newPacks = Math.floor(netSingles / packSize);
            newSingles = netSingles % packSize;
          } else {
            // Negative stock allowed
            newPacks = Math.floor(netSingles / packSize);
            newSingles = ((netSingles % packSize) + packSize) % packSize;
          }
        }

        stockUpdates.push({
          productId: prod.id,
          productTitle: item.title || item.product_title || prod.title,
          unitType,
          quantity: qty,
          priceCents: parseInt(item.priceCents || item.price_cents, 10) || 0,
          totalCents: parseInt(item.totalCents || item.total_cents, 10) || 0,
          newPacks,
          newSingles
        });
      }

      // Step c: INSERT INTO sales
      db.run(`
        INSERT INTO sales (
          invoice_no, cashier_id, cashier_name, customer_id, customer_name,
          subtotal_cents, tax_cents, discount_cents, total_cents,
          paid_cents, change_cents, payment_method, prescription_path, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED', ?);
      `, [
        finalInvoiceNo,
        cashierId,
        cashierName,
        customerId,
        customerName,
        parseInt(subtotalCents, 10) || 0,
        parseInt(taxCents, 10) || 0,
        parseInt(discountCents, 10) || 0,
        parseInt(totalCents, 10) || 0,
        parseInt(paidCents, 10) || 0,
        parseInt(changeCents, 10) || 0,
        paymentMethod.toUpperCase(),
        prescriptionPath || '',
        nowStr
      ]);

      const saleId = getLastInsertId();

      // Step d: For each item: INSERT INTO sale_items & UPDATE products stock
      for (const update of stockUpdates) {
        db.run(`
          INSERT INTO sale_items (sale_id, product_id, product_title, unit_type, quantity, price_cents, total_cents)
          VALUES (?, ?, ?, ?, ?, ?, ?);
        `, [
          saleId,
          update.productId,
          update.productTitle,
          update.unitType,
          update.quantity,
          update.priceCents,
          update.totalCents
        ]);

        db.run("UPDATE products SET quantity_packs = ?, quantity_singles = ? WHERE id = ?;", [
          update.newPacks,
          update.newSingles,
          update.productId
        ]);
      }

      // Step e: If CREDIT: UPDATE customer debt & INSERT ledger entry
      if (paymentMethod.toUpperCase() === 'CREDIT' && customerId) {
        const cust = queryGet("SELECT id, name, current_debt_cents, credit_limit_cents FROM customers WHERE id = ?;", [customerId]);
        if (cust) {
          const currentDebt = cust.current_debt_cents || 0;
          const newDebt = currentDebt + (parseInt(totalCents, 10) || 0);
          db.run("UPDATE customers SET current_debt_cents = ? WHERE id = ?;", [newDebt, customerId]);
          db.run(`
            INSERT INTO customer_ledger (customer_id, sale_id, type, debit_cents, credit_cents, balance_after_cents, notes, created_at)
            VALUES (?, ?, 'SALE_CREDIT', ?, 0, ?, ?, ?);
          `, [
            customerId,
            saleId,
            parseInt(totalCents, 10) || 0,
            newDebt,
            `Credit Sale Invoice #${finalInvoiceNo}`,
            nowStr
          ]);
        }
      }

      // Step f: COMMIT transaction
      db.run("COMMIT;");
      scheduleDatabaseSave();

      // Step g: Return { success, saleId }
      return { success: true, data: { saleId, invoiceNo: finalInvoiceNo } };
    } catch (txErr) {
      try { db.run("ROLLBACK;"); } catch (_) {}
      throw txErr;
    }
  } catch (err) {
    console.error('Handler error [checkout:process]:', err);
    return { success: false, error: err.message };
  }
});

// -----------------------------------------------------------------------------
// 8. SALES HISTORY & RETURNS
// -----------------------------------------------------------------------------
ipcMain.handle('sales:getAll', async (event, args = {}) => {
  try {
    const page = Math.max(1, parseInt(args.page, 10) || 1);
    const pageSize = Math.max(1, parseInt(args.pageSize, 10) || 20);
    const offset = (page - 1) * pageSize;
    const sales = queryAll("SELECT * FROM sales ORDER BY id DESC LIMIT ? OFFSET ?;", [pageSize, offset]);
    return { success: true, data: sales };
  } catch (err) {
    console.error('Handler error [sales:getAll]:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('sales:getCount', async () => {
  try {
    const row = queryGet("SELECT COUNT(*) as count FROM sales;");
    return { success: true, data: { count: row ? row.count : 0 } };
  } catch (err) {
    console.error('Handler error [sales:getCount]:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('sales:get', async (event, args = {}) => {
  try {
    const id = (typeof args === 'object' && args !== null && args.id !== undefined) ? args.id : args;
    if (!id) throw new Error('Sale ID is required');
    const sale = queryGet("SELECT * FROM sales WHERE id = ?;", [id]);
    return { success: true, data: sale };
  } catch (err) {
    console.error('Handler error [sales:get]:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('sales:getItems', async (event, args = {}) => {
  try {
    const saleId = (typeof args === 'object' && args !== null && (args.saleId !== undefined || args.id !== undefined))
      ? (args.saleId !== undefined ? args.saleId : args.id)
      : args;
    if (!saleId) throw new Error('Sale ID is required');
    const items = queryAll("SELECT * FROM sale_items WHERE sale_id = ? ORDER BY id ASC;", [saleId]);
    return { success: true, data: items };
  } catch (err) {
    console.error('Handler error [sales:getItems]:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('sales:void', async (event, args = {}) => {
  try {
    const { saleId, reason = 'Customer Return / Cancellation', userId = 1, userName = 'Admin' } = args;
    if (!saleId) throw new Error('Sale ID is required to void sale');

    db.run("BEGIN TRANSACTION;");
    try {
      const sale = queryGet("SELECT * FROM sales WHERE id = ?;", [saleId]);
      if (!sale) throw new Error(`Sale #${saleId} not found`);
      if (sale.status === 'VOIDED') throw new Error(`Sale #${saleId} is already marked as VOIDED`);

      const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19);
      const items = queryAll("SELECT * FROM sale_items WHERE sale_id = ?;", [saleId]);

      // Fresh-read stock & restore inventory
      for (const item of items) {
        const prod = queryGet("SELECT id, quantity_packs, quantity_singles, pack_size FROM products WHERE id = ?;", [item.product_id]);
        if (prod) {
          const packSize = Math.max(1, prod.pack_size || 10);
          let newPacks = prod.quantity_packs;
          let newSingles = prod.quantity_singles;

          if (item.unit_type === 'PACK') {
            newPacks = prod.quantity_packs + item.quantity;
          } else {
            // Restore singles
            const totalSingles = (prod.quantity_packs * packSize) + prod.quantity_singles + item.quantity;
            newPacks = Math.floor(totalSingles / packSize);
            newSingles = totalSingles % packSize;
          }

          db.run("UPDATE products SET quantity_packs = ?, quantity_singles = ? WHERE id = ?;", [
            newPacks,
            newSingles,
            prod.id
          ]);
        }
      }

      // If credit sale, reverse debt & add ledger record
      if (sale.payment_method === 'CREDIT' && sale.customer_id) {
        const cust = queryGet("SELECT id, current_debt_cents FROM customers WHERE id = ?;", [sale.customer_id]);
        if (cust) {
          const currentDebt = cust.current_debt_cents || 0;
          const newDebt = Math.max(0, currentDebt - sale.total_cents);
          db.run("UPDATE customers SET current_debt_cents = ? WHERE id = ?;", [newDebt, sale.customer_id]);
          db.run(`
            INSERT INTO customer_ledger (customer_id, sale_id, type, debit_cents, credit_cents, balance_after_cents, notes, created_at)
            VALUES (?, ?, 'ADJUSTMENT', 0, ?, ?, ?, ?);
          `, [
            sale.customer_id,
            sale.id,
            sale.total_cents,
            newDebt,
            `Voided Credit Sale Invoice #${sale.invoice_no}: ${reason}`,
            nowStr
          ]);
        }
      }

      // Mark sale VOIDED
      db.run("UPDATE sales SET status = 'VOIDED' WHERE id = ?;", [saleId]);

      // Insert void_sales audit entry
      db.run(`
        INSERT INTO void_sales (sale_id, user_id, user_name, reason, voided_at)
        VALUES (?, ?, ?, ?, ?);
      `, [saleId, userId, userName, reason, nowStr]);

      // Insert audit_log entry
      db.run(`
        INSERT INTO audit_log (user_id, user_name, action, details, created_at)
        VALUES (?, ?, 'VOID_SALE', ?, ?);
      `, [userId, userName, `Voided sale #${sale.invoice_no}. Reason: ${reason}`, nowStr]);

      db.run("COMMIT;");
      scheduleDatabaseSave();
      return { success: true, data: { saleId, status: 'VOIDED' } };
    } catch (txErr) {
      try { db.run("ROLLBACK;"); } catch (_) {}
      throw txErr;
    }
  } catch (err) {
    console.error('Handler error [sales:void]:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('sales:updatePrescription', async (event, args = {}) => {
  try {
    const { saleId, prescriptionPath = '' } = args;
    if (!saleId) throw new Error('Sale ID is required');
    executeRun("UPDATE sales SET prescription_path = ? WHERE id = ?;", [prescriptionPath, saleId]);
    return { success: true, data: { saleId, prescriptionPath } };
  } catch (err) {
    console.error('Handler error [sales:updatePrescription]:', err);
    return { success: false, error: err.message };
  }
});

// -----------------------------------------------------------------------------
// 9. PARKED ORDERS
// -----------------------------------------------------------------------------
ipcMain.handle('parked:getAll', async () => {
  try {
    const orders = queryAll("SELECT * FROM parked_orders ORDER BY id DESC;");
    return { success: true, data: orders };
  } catch (err) {
    console.error('Handler error [parked:getAll]:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('parked:save', async (event, args = {}) => {
  try {
    const {
      tabKey,
      cashierId = 1,
      customerId = 1,
      cartJson = '[]',
      totalCents = 0
    } = args;

    if (!tabKey) throw new Error('Tab Key identifier is required for parked order');
    const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19);

    db.run("DELETE FROM parked_orders WHERE tab_key = ?;", [tabKey]);

    executeRun(`
      INSERT INTO parked_orders (tab_key, cashier_id, customer_id, cart_json, total_cents, created_at)
      VALUES (?, ?, ?, ?, ?, ?);
    `, [
      tabKey,
      cashierId,
      customerId,
      typeof cartJson === 'string' ? cartJson : JSON.stringify(cartJson),
      parseInt(totalCents, 10) || 0,
      nowStr
    ]);

    const id = getLastInsertId();
    return { success: true, data: { id, tabKey } };
  } catch (err) {
    console.error('Handler error [parked:save]:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('parked:delete', async (event, args = {}) => {
  try {
    const id = (typeof args === 'object' && args !== null) ? (args.id || args.tabKey) : args;
    if (!id) throw new Error('Order ID or tabKey is required');
    executeRun("DELETE FROM parked_orders WHERE id = ? OR tab_key = ?;", [id, String(id)]);
    return { success: true, data: { deleted: true } };
  } catch (err) {
    console.error('Handler error [parked:delete]:', err);
    return { success: false, error: err.message };
  }
});

// -----------------------------------------------------------------------------
// 10. EXECUTIVE DASHBOARD & REPORTING
// -----------------------------------------------------------------------------
ipcMain.handle('dashboard:getStats', async () => {
  try {
    const totalRow = queryGet("SELECT COUNT(*) as count, COALESCE(SUM(total_cents), 0) as total FROM sales WHERE status = 'COMPLETED';") || { count: 0, total: 0 };
    const todayRow = queryGet("SELECT COUNT(*) as count, COALESCE(SUM(total_cents), 0) as total FROM sales WHERE status = 'COMPLETED' AND date(created_at) = date('now');") || { count: 0, total: 0 };
    const debtRow = queryGet("SELECT COALESCE(SUM(current_debt_cents), 0) as total FROM customers;") || { total: 0 };
    const riskRow = queryGet("SELECT COUNT(*) as count FROM products WHERE quantity_packs <= min_stock_level OR expiry_date <= date('now', '+180 days');") || { count: 0 };

    return {
      success: true,
      data: {
        totalSales: { count: totalRow.count, total: totalRow.total },
        todaySales: { count: todayRow.count, total: todayRow.total },
        totalDebt: debtRow.total,
        riskCount: riskRow.count
      }
    };
  } catch (err) {
    console.error('Handler error [dashboard:getStats]:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('dashboard:getTrend', async () => {
  try {
    const trend = queryAll(`
      SELECT date(created_at) as day, SUM(total_cents) as total 
      FROM sales 
      WHERE status = 'COMPLETED' 
      GROUP BY date(created_at) 
      ORDER BY day DESC 
      LIMIT 7;
    `);
    return { success: true, data: trend };
  } catch (err) {
    console.error('Handler error [dashboard:getTrend]:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('dashboard:getPaymentDist', async () => {
  try {
    const dist = queryAll(`
      SELECT payment_method, SUM(total_cents) as total 
      FROM sales 
      WHERE status = 'COMPLETED' 
      GROUP BY payment_method;
    `);
    return { success: true, data: dist };
  } catch (err) {
    console.error('Handler error [dashboard:getPaymentDist]:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('dashboard:getTopProducts', async () => {
  try {
    const top = queryAll(`
      SELECT product_title, unit_type, SUM(quantity) as qty, SUM(total_cents) as rev 
      FROM sale_items 
      GROUP BY product_title, unit_type 
      ORDER BY qty DESC 
      LIMIT 5;
    `);
    return { success: true, data: top };
  } catch (err) {
    console.error('Handler error [dashboard:getTopProducts]:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('dashboard:getSupplySchedule', async () => {
  try {
    const schedule = queryAll(`
      SELECT s.name, COUNT(p.id) as count 
      FROM products p 
      JOIN suppliers s ON p.supplier_id = s.id 
      WHERE p.quantity_packs <= p.min_stock_level 
      GROUP BY s.id;
    `);
    return { success: true, data: schedule };
  } catch (err) {
    console.error('Handler error [dashboard:getSupplySchedule]:', err);
    return { success: false, error: err.message };
  }
});

// -----------------------------------------------------------------------------
// 11. EXPIRY & LOW STOCK ALERTS
// -----------------------------------------------------------------------------
ipcMain.handle('expiry:getProducts', async () => {
  try {
    const products = queryAll("SELECT * FROM products ORDER BY expiry_date ASC;");
    return { success: true, data: products };
  } catch (err) {
    console.error('Handler error [expiry:getProducts]:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('expiry:getCount', async () => {
  try {
    const row = queryGet("SELECT COUNT(*) as cnt FROM products WHERE expiry_date <= date('now', '+180 days');");
    return { success: true, data: { count: row ? row.cnt : 0 } };
  } catch (err) {
    console.error('Handler error [expiry:getCount]:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('stock:getLowCount', async () => {
  try {
    const row = queryGet("SELECT COUNT(*) as cnt FROM products WHERE quantity_packs <= min_stock_level;");
    return { success: true, data: { count: row ? row.cnt : 0 } };
  } catch (err) {
    console.error('Handler error [stock:getLowCount]:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('expiry:discardStock', async (event, args = {}) => {
  try {
    const productId = (typeof args === 'object' && args !== null && (args.productId !== undefined || args.id !== undefined))
      ? (args.productId !== undefined ? args.productId : args.id)
      : args;
    if (!productId) throw new Error('Product ID is required');
    executeRun("UPDATE products SET quantity_packs = 0, quantity_singles = 0 WHERE id = ?;", [productId]);
    return { success: true, data: { productId, discarded: true } };
  } catch (err) {
    console.error('Handler error [expiry:discardStock]:', err);
    return { success: false, error: err.message };
  }
});

// -----------------------------------------------------------------------------
// 12. STORE SETTINGS
// -----------------------------------------------------------------------------
ipcMain.handle('settings:get', async () => {
  try {
    const settings = queryGet("SELECT * FROM settings WHERE id = 1;");
    return { success: true, data: settings };
  } catch (err) {
    console.error('Handler error [settings:get]:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('settings:save', async (event, args = {}) => {
  try {
    const {
      store_name = 'Hashmi Medical Store',
      store_phone = '+92 300 1234567',
      store_address = 'Muhammdia Colony St 9 Sargodha',
      ntn_fbr_id = '',
      receipt_disclaimer = ''
    } = args;

    executeRun(`
      UPDATE settings SET 
        store_name = ?, 
        store_phone = ?, 
        store_address = ?, 
        ntn_fbr_id = ?, 
        receipt_disclaimer = ? 
      WHERE id = 1;
    `, [store_name, store_phone, store_address, ntn_fbr_id, receipt_disclaimer]);

    return { success: true, data: { updated: true } };
  } catch (err) {
    console.error('Handler error [settings:save]:', err);
    return { success: false, error: err.message };
  }
});

// -----------------------------------------------------------------------------
// 13. AUDIT LOGGING
// -----------------------------------------------------------------------------
ipcMain.handle('audit:log', async (event, args = {}) => {
  try {
    const { userId = null, userName = 'System', action, details = '' } = args;
    if (!action) throw new Error('Action is required for audit log');
    const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19);

    executeRun("INSERT INTO audit_log (user_id, user_name, action, details, created_at) VALUES (?, ?, ?, ?, ?);", [
      userId,
      userName,
      action,
      details,
      nowStr
    ]);

    const id = getLastInsertId();
    return { success: true, data: { id } };
  } catch (err) {
    console.error('Handler error [audit:log]:', err);
    return { success: false, error: err.message };
  }
});

// -----------------------------------------------------------------------------
// 14. FILE STORAGE, BACKUPS & HARDWARE PRINTING
// -----------------------------------------------------------------------------
const savePrescriptionHandler = async (event, args = {}) => {
  try {
    const { fileName = 'rx.jpg', base64Data } = args;
    if (!base64Data) throw new Error('Base64 image data is required');
    const ext = path.extname(fileName) || '.jpg';
    const targetName = `rx_${Date.now()}_${Math.floor(Math.random() * 1000)}${ext}`;
    const targetPath = path.join(PRESCRIPTIONS_DIR, targetName);
    const buffer = Buffer.from(base64Data, 'base64');
    fs.writeFileSync(targetPath, buffer);
    const relativePath = path.join('Prescriptions', targetName);
    return { success: true, data: { filePath: targetPath, relativePath } };
  } catch (err) {
    console.error('Handler error [file:savePrescription]:', err);
    return { success: false, error: err.message };
  }
};
ipcMain.handle('file:savePrescription', savePrescriptionHandler);
ipcMain.handle('save-prescription', savePrescriptionHandler);

const saveLogoHandler = async (event, args = {}) => {
  try {
    const { fileName = 'logo.png', base64Data } = args;
    if (!base64Data) throw new Error('Base64 image data is required');
    const ext = path.extname(fileName) || '.png';
    const targetName = `logo_store${ext}`;
    const targetPath = path.join(LOGO_DIR, targetName);
    const buffer = Buffer.from(base64Data, 'base64');
    fs.writeFileSync(targetPath, buffer);
    executeRun("UPDATE settings SET logo_path = ? WHERE id = 1;", [targetPath]);
    return { success: true, data: { filePath: targetPath } };
  } catch (err) {
    console.error('Handler error [file:saveLogo]:', err);
    return { success: false, error: err.message };
  }
};
ipcMain.handle('file:saveLogo', saveLogoHandler);
ipcMain.handle('save-logo', saveLogoHandler);

const backupDbHandler = async () => {
  try {
    flushDatabaseSaveSync();
    const timeStamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFileName = `medidesk_pos_backup_${timeStamp}.db`;
    const backupPath = path.join(BACKUPS_DIR, backupFileName);
    fs.copyFileSync(DB_PATH, backupPath);
    return { success: true, data: { backupPath, fileName: backupFileName } };
  } catch (err) {
    console.error('Handler error [db:backup]:', err);
    return { success: false, error: err.message };
  }
};
ipcMain.handle('db:backup', backupDbHandler);
ipcMain.handle('backup-db', backupDbHandler);

const restoreDbHandler = async () => {
  try {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Select MediDesk POS Backup File (.db)',
      defaultPath: BACKUPS_DIR,
      filters: [{ name: 'SQLite Database', extensions: ['db'] }],
      properties: ['openFile']
    });

    if (canceled || filePaths.length === 0) {
      return { success: false, error: 'Restore operation cancelled' };
    }

    const selectedFile = filePaths[0];
    if (db) {
      try { db.close(); } catch (_) {}
      db = null;
    }

    fs.copyFileSync(selectedFile, DB_PATH);
    await initDatabase();
    return { success: true, data: { message: 'Database Restored Successfully! Reloading...' } };
  } catch (err) {
    console.error('Handler error [db:restore]:', err);
    return { success: false, error: err.message };
  }
};
ipcMain.handle('db:restore', restoreDbHandler);
ipcMain.handle('restore-db', restoreDbHandler);

const factoryResetHandler = async () => {
  try {
    if (db) {
      try { db.close(); } catch (_) {}
      db = null;
    }
    if (fs.existsSync(DB_PATH)) {
      fs.unlinkSync(DB_PATH);
    }
    const tmpPath = DB_PATH + '.tmp';
    if (fs.existsSync(tmpPath)) {
      try { fs.unlinkSync(tmpPath); } catch (_) {}
    }
    await initDatabase();
    return { success: true, data: { message: 'Factory Reset Completed! System re-initialized with fresh database.' } };
  } catch (err) {
    console.error('Handler error [file:factoryReset]:', err);
    return { success: false, error: err.message };
  }
};
ipcMain.handle('file:factoryReset', factoryResetHandler);
ipcMain.handle('factory-reset', factoryResetHandler);

const printHandler = async (event, options = {}) => {
  if (!mainWindow) return { success: false, error: 'Window not available' };
  try {
    mainWindow.webContents.print({
      silent: false,
      printBackground: true,
      deviceName: options.deviceName || ''
    }, (success, failureReason) => {
      if (!success) console.error('Print failed:', failureReason);
    });
    return { success: true };
  } catch (err) {
    console.error('Handler error [app:print]:', err);
    return { success: false, error: err.message };
  }
};
ipcMain.handle('app:print', printHandler);
ipcMain.handle('print-document', printHandler);
