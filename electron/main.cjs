const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const {
  hasDbRuntimeConfig,
  readDbRuntimeConfig,
  saveDbRuntimeConfig,
  clearDbRuntimeConfig,
  maskDbConfig,
  buildServerEnv,
} = require('./db-config.cjs');

let mainWindow = null;
let serverProcess = null;

const isDev = !app.isPackaged;
const DEFAULT_APP_PORT = process.env.APP_PORT || '3200';

const windowIcon = isDev
  ? path.join(app.getAppPath(), 'build', 'icon.ico')
  : path.join(process.resourcesPath, 'build', 'icon.ico');

const logFile = path.join(app.getPath('userData'), 'startup.log');
const connectionConfigFile = path.join(app.getPath('userData'), 'connection.config.json');
const licenseStateFile = path.join(app.getPath('userData'), 'license.state.json');
const activationFile = path.join(app.getPath('userData'), 'activation.lic');

const distributionConfigFile = isDev
  ? path.join(app.getAppPath(), 'build', 'distribution.config.json')
  : path.join(process.resourcesPath, 'build', 'distribution.config.json');

function logLine(...parts) {
  try {
    const line =
      `[${new Date().toISOString()}] ` +
      parts
        .map((p) => {
          if (p instanceof Error) return p.stack || p.message;
          if (typeof p === 'object') return JSON.stringify(p);
          return String(p);
        })
        .join(' ') +
      '\n';

    fs.appendFileSync(logFile, line, 'utf8');
  } catch { }
}

function getServerEnv(appPort) {
  const runtimeConfig = readDbRuntimeConfig();
  const distributionMode = readDistributionMode();
  const deviceFingerprint = buildDeviceFingerprint();

  if (runtimeConfig) {
    logLine('Using runtime DB config:', maskDbConfig(runtimeConfig));
  } else {
    logLine('No runtime DB config found, fallback to .env / process.env');
  }

  logLine('Distribution mode =', distributionMode);
  logLine('License files =', {
    licenseStateFile,
    activationFile,
  });
  logLine('Device fingerprint (short) =', deviceFingerprint.slice(0, 12));

  return buildServerEnv({
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    NODE_ENV: 'production',
    APP_PORT: String(appPort || DEFAULT_APP_PORT),
    PORT: String(appPort || DEFAULT_APP_PORT),
    HOST: 'localhost',
    RAYYAN_DISTRIBUTION: distributionMode,
    RAYYAN_DEVICE_FINGERPRINT: deviceFingerprint,
    RAYYAN_LICENSE_STATE_FILE: licenseStateFile,
    RAYYAN_ACTIVATION_FILE: activationFile,
  });
}
function readDistributionMode() {
  try {
    if (!fs.existsSync(distributionConfigFile)) {
      return 'standard';
    }

    const raw = fs.readFileSync(distributionConfigFile, 'utf8');
    const parsed = JSON.parse(raw);

    return parsed?.mode === 'trial' ? 'trial' : 'standard';
  } catch (error) {
    logLine('failed to read distribution config, fallback to standard', error);
    return 'standard';
  }
}

function readHardwareUuid() {
  try {
    const raw = execFileSync('wmic', ['csproduct', 'get', 'uuid'], {
      encoding: 'utf8',
      windowsHide: true,
    });

    const line = String(raw)
      .split(/\r?\n/)
      .map((v) => v.trim())
      .filter(Boolean)
      .find((v) => v.toLowerCase() !== 'uuid');

    if (line) return line;
  } catch {}

  try {
    const raw = execFileSync(
      'powershell',
      ['-NoProfile', '-Command', '(Get-CimInstance Win32_ComputerSystemProduct).UUID'],
      {
        encoding: 'utf8',
        windowsHide: true,
      }
    );

    const line = String(raw)
      .split(/\r?\n/)
      .map((v) => v.trim())
      .filter(Boolean)[0];

    if (line) return line;
  } catch {}

  return '';
}

function buildDeviceFingerprint() {
  const seed = [
    readHardwareUuid(),
    os.hostname(),
    os.platform(),
    os.arch(),
    process.env.COMPUTERNAME || '',
    process.env.PROCESSOR_IDENTIFIER || '',
  ]
    .map((v) => String(v || '').trim())
    .filter(Boolean)
    .join('|');

  return crypto.createHash('sha256').update(seed).digest('hex');
}
function getDefaultConnectionConfig() {
  return {
    mode: 'main',
    host: 'localhost',
    port: DEFAULT_APP_PORT,
  };
}

function readConnectionConfig() {
  const fallback = getDefaultConnectionConfig();

  try {
    if (!fs.existsSync(connectionConfigFile)) {
      logLine('connection config not found, using default config', fallback);
      return fallback;
    }

    const raw = fs.readFileSync(connectionConfigFile, 'utf8');
    const parsed = JSON.parse(raw);

    const mode = parsed?.mode === 'branch' ? 'branch' : 'main';

    const host =
      typeof parsed?.host === 'string' && parsed.host.trim()
        ? parsed.host.trim()
        : mode === 'branch'
          ? '127.0.0.1'
          : 'localhost';

    const port =
      typeof parsed?.port === 'string' && parsed.port.trim()
        ? parsed.port.trim()
        : typeof parsed?.port === 'number'
          ? String(parsed.port)
          : DEFAULT_APP_PORT;

    const config = { mode, host, port };

    logLine('connection config loaded', config);
    return config;
  } catch (error) {
    logLine('failed to read connection config, using default config', error);
    return fallback;
  }
}
function saveConnectionConfig(input = {}) {
  const mode = input?.mode === 'branch' ? 'branch' : 'main';

  const host =
    typeof input?.host === 'string' && input.host.trim()
      ? input.host.trim()
      : mode === 'branch'
        ? '127.0.0.1'
        : 'localhost';

  const port =
    typeof input?.port === 'string' && input.port.trim()
      ? input.port.trim()
      : typeof input?.port === 'number'
        ? String(input.port)
        : DEFAULT_APP_PORT;

  const payload = {
    mode,
    host,
    port,
    updatedAt: new Date().toISOString(),
  };

  fs.writeFileSync(connectionConfigFile, JSON.stringify(payload, null, 2), 'utf8');
  logLine('connection config saved', payload);

  return payload;
}
function isInitialSetupRequired() {
  const connectionConfigExists = fs.existsSync(connectionConfigFile);
  const runtimeDbExists = hasDbRuntimeConfig();

  if (!connectionConfigExists) return true;
  if (!runtimeDbExists) return true;

  return false;
}
async function testDbConnection(config = {}) {
  let Client;

  try {
    const pgPath = isDev
      ? path.join(app.getAppPath(), 'server', 'node_modules', 'pg')
      : path.join(process.resourcesPath, 'server', 'node_modules', 'pg');

    ({ Client } = require(pgPath));
  } catch {
    try {
      ({ Client } = require('pg'));
    } catch (error) {
      logLine('pg module load failed', error);
      return {
        ok: false,
        message: 'تعذر تحميل مكتبة pg لاختبار الاتصال',
      };
    }
  }

  const host = String(config.host || '').trim();
  const port = Number(config.port || 5432);
  const database = String(config.database || '').trim();
  const user = String(config.user || '').trim();
  const password = String(config.password || '');
  const ssl = !!config.ssl;

  if (!host || !database || !user || !port) {
    return {
      ok: false,
      message: 'بيانات الاتصال ناقصة',
    };
  }

  const client = new Client({
    host,
    port,
    database,
    user,
    password,
    ssl: ssl ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 5000,
  });

  try {
    await client.connect();
    await client.query('SELECT 1');
    await client.end();

    return {
      ok: true,
      message: 'تم الاتصال بقاعدة البيانات بنجاح',
    };
  } catch (error) {
    try {
      await client.end();
    } catch { }

    logLine('testDbConnection failed', error);

    return {
      ok: false,
      message: error?.message || 'فشل الاتصال بقاعدة البيانات',
    };
  }
}
function getServerNodeModule(moduleName) {
  const modulePath = isDev
    ? path.join(app.getAppPath(), 'server', 'node_modules', moduleName)
    : path.join(process.resourcesPath, 'server', 'node_modules', moduleName);

  return require(modulePath);
}

function buildPgClientConfig(config = {}) {
  const host = String(config.host || '').trim();
  const port = Number(config.port || 5432);
  const database = String(config.database || '').trim();
  const user = String(config.user || '').trim();
  const password = String(config.password || '');
  const ssl = !!config.ssl;

  return {
    host,
    port,
    database,
    user,
    password,
    ssl: ssl ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 10000,
  };
}

async function runDatabaseSetup(config = {}) {
  let Client;
  let bcrypt;
  let readdirSync;
  let readFileSync;
  let migrationsDir;

  try {
    ({ Client } = getServerNodeModule('pg'));
    bcrypt = getServerNodeModule('bcryptjs');
    ({ readdirSync, readFileSync } = require('fs'));

    migrationsDir = isDev
      ? path.join(app.getAppPath(), 'migrations')
      : path.join(process.resourcesPath, 'migrations');
  } catch (error) {
    logLine('runDatabaseSetup dependency load failed', error);
    return {
      ok: false,
      message: 'تعذر تحميل ملفات التهيئة المطلوبة',
    };
  }

  const client = new Client(buildPgClientConfig(config));

  try {
    await client.connect();

    const test = await client.query('SELECT 1');
    if (!test) {
      throw new Error('تعذر التحقق من الاتصال');
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        filename TEXT UNIQUE NOT NULL,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    const appliedResult = await client.query('SELECT filename FROM _migrations ORDER BY filename ASC');
    const applied = new Set(appliedResult.rows.map((r) => r.filename));

    const migrationFiles = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    let appliedCount = 0;

    for (const file of migrationFiles) {
      if (applied.has(file)) {
        continue;
      }

      const sql = readFileSync(path.join(migrationsDir, file), 'utf8');
      logLine('Applying migration file =', file);
      logLine('Migration SQL preview =', sql);
      await client.query('BEGIN');
      try {

        await client.query(sql);
        await client.query('INSERT INTO _migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
        appliedCount++;
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`فشل تطبيق الميغراشن ${file}: ${error?.message || error}`);
      }
    }

    const adminCheck = await client.query(
      "SELECT COUNT(*)::int AS count FROM users WHERE username = 'admin'"
    );

    let seeded = false;

    if (Number(adminCheck.rows[0]?.count || 0) === 0) {
      const adminHash = await bcrypt.hash('admin123', 10);
      const cashierHash = await bcrypt.hash('cashier123', 10);
      const warehouseHash = await bcrypt.hash('warehouse123', 10);

      await client.query('BEGIN');
      try {
        await client.query(
          `
          INSERT INTO users (username, password_hash, full_name, role, is_protected)
          VALUES
            ('admin', $1, 'المدير العام', 'admin', TRUE),
            ('cashier1', $2, 'موظف كاشير 1', 'cashier', FALSE),
            ('warehouse1', $3, 'موظف مخزن', 'warehouse', FALSE)
          `,
          [adminHash, cashierHash, warehouseHash]
        );

        await client.query(`
          INSERT INTO categories (name)
          SELECT v.name
          FROM (VALUES
            ('مواد غذائية'),
            ('مشروبات'),
            ('منظفات'),
            ('ألبان وأجبان'),
            ('خضروات وفواكه'),
            ('دخان')
          ) AS v(name)
          WHERE NOT EXISTS (
            SELECT 1 FROM categories c WHERE c.name = v.name
          )
        `);

        await client.query(`
          INSERT INTO pos_terminals (code, name, location)
          SELECT v.code, v.name, v.location
          FROM (VALUES
            ('POS-01', 'كاشير رئيسي', 'المدخل الرئيسي'),
            ('POS-02', 'كاشير احتياطي', 'المدخل الجانبي')
          ) AS v(code, name, location)
          WHERE NOT EXISTS (
            SELECT 1 FROM pos_terminals p WHERE p.code = v.code
          )
        `);

        await client.query(`
          INSERT INTO settings (key, value)
          VALUES
            ('shop_name', 'المتجر الريان'),
            ('shop_phone', '096xxxxxxx'),
            ('shop_address', ''),
            ('currency', 'USD'),
            ('usd_to_syp', '11000'),
            ('usd_to_try', '44'),
            ('usd_to_sar', '3.75'),
            ('usd_to_aed', '3.67'),
            ('receipt_footer', 'شكراً لزيارتكم!'),
            ('low_stock_threshold', '10'),
            ('theme_color', '#059669'),
            ('theme_mode', 'light'),
            ('show_usd', 'true'),
            ('enable_shifts', 'false')
          ON CONFLICT (key) DO NOTHING
        `);

        await client.query(`
          INSERT INTO invoice_sequences (prefix, last_number)
          VALUES
            ('INV', 0),
            ('RET', 0),
            ('PUR', 0)
          ON CONFLICT (prefix) DO NOTHING
        `);

        await client.query('COMMIT');
        seeded = true;
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`فشل تنفيذ السيد الأولي: ${error?.message || error}`);
      }
    }

    await client.end();

    return {
      ok: true,
      message: seeded
        ? `تمت هيكلة البيانات بنجاح. الميغراشن الجديدة: ${appliedCount} — وتم إنشاء الأدمن الافتراضي.`
        : `تمت هيكلة البيانات بنجاح. الميغراشن الجديدة: ${appliedCount} — والبيانات الأساسية موجودة مسبقًا.`,
    };
  } catch (error) {
    try {
      await client.end();
    } catch { }

    logLine('runDatabaseSetup failed', error);

    return {
      ok: false,
      message: error?.message || 'فشل تنفيذ هيكلة البيانات',
    };
  }
}
function hardenProductionWindow(win) {
  if (!win || isDev) return;

  win.webContents.on('before-input-event', (event, input) => {
    const key = String(input.key || '').toUpperCase();
    const ctrlOrCmd = !!input.control || !!input.meta;
    const shift = !!input.shift;
    const alt = !!input.alt;

    const isF12 = key === 'F12';
    const isDevToolsShortcut =
      ctrlOrCmd &&
      (
        (shift && (key === 'I' || key === 'J' || key === 'C')) ||
        (alt && (key === 'I' || key === 'J' || key === 'C'))
      );

    if (isF12 || isDevToolsShortcut) {
      event.preventDefault();
    }
  });

  win.webContents.on('devtools-opened', () => {
    try {
      win.webContents.closeDevTools();
    } catch {}
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    show: true,
    autoHideMenuBar: true,
    icon: windowIcon,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  hardenProductionWindow(mainWindow);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.on('did-start-navigation', (_event, url) => {
    logLine('did-start-navigation =', url);
  });

  mainWindow.webContents.on('did-finish-load', () => {
    logLine('Window finished loading');
    if (mainWindow) mainWindow.show();
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    logLine('Window failed to load:', errorCode, errorDescription, validatedURL);
    if (mainWindow) mainWindow.show();

    const isInternalPage =
      typeof validatedURL === 'string' &&
      (validatedURL.startsWith('data:text/html') || validatedURL.startsWith('file://'));

    if (!isInternalPage) {
      renderConnectionErrorPage({
        title: 'انقطع الاتصال بالتطبيق',
        message: 'تعذر تحميل واجهة Rayyan Pro بسبب فقد الاتصال بالخادم أو عنوان الاتصال المحدد.',
        extra: `العنوان: ${validatedURL || 'غير معروف'} — ${errorDescription || 'خطأ غير معروف'}`,
      });
    }
  });

  mainWindow.webContents.on('console-message', (_event, level, message) => {
    logLine('[renderer console]', level, message);
  });

  mainWindow.loadURL(
    'data:text/html;charset=UTF-8,' +
    encodeURIComponent(`
        <!doctype html>
        <html lang="ar" dir="rtl">
          <head>
            <meta charset="UTF-8" />
            <title>Rayyan Pro</title>
            <style>
              body {
                margin: 0;
                font-family: Arial, sans-serif;
                background: #0f172a;
                color: white;
                display: flex;
                align-items: center;
                justify-content: center;
                height: 100vh;
              }
              .box {
                text-align: center;
                background: rgba(255,255,255,0.06);
                padding: 28px 36px;
                border-radius: 16px;
                box-shadow: 0 10px 30px rgba(0,0,0,0.25);
              }
              .muted {
                opacity: 0.8;
                margin-top: 10px;
                font-size: 14px;
              }
            </style>
          </head>
          <body>
            <div class="box">
              <h2>جاري تشغيل Rayyan Pro...</h2>
              <div class="muted">يرجى الانتظار لحظة</div>
            </div>
          </body>
        </html>
      `)
  );
}
async function loadSetupPage() {
  if (!mainWindow || mainWindow.isDestroyed()) return false;

  try {
    const setupFile = path.join(__dirname, 'setup.html');
    logLine('Loading setup page =', setupFile);
    await mainWindow.loadFile(setupFile);
    return true;
  } catch (error) {
    logLine('Failed to load setup page', error);
    return false;
  }
}

function renderConnectionErrorPage(details = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const title = details.title || 'تعذر تحميل التطبيق';
  const message =
    details.message || 'تعذر الوصول إلى واجهة Rayyan Pro على العنوان المحدد.';
  const extra =
    details.extra || 'تحقق من إعداد الاتصال أو راجع ملف startup.log لمعرفة التفاصيل.';

  mainWindow.loadURL(
    'data:text/html;charset=UTF-8,' +
    encodeURIComponent(`
        <!doctype html>
        <html lang="ar" dir="rtl">
          <head>
            <meta charset="UTF-8" />
            <title>Rayyan Pro - Connection Error</title>
            <style>
              body {
                margin: 0;
                font-family: Arial, sans-serif;
                background: #1f2937;
                color: white;
                display: flex;
                align-items: center;
                justify-content: center;
                height: 100vh;
              }
              .box {
                max-width: 760px;
                width: calc(100% - 48px);
                background: rgba(255,255,255,0.06);
                padding: 28px 36px;
                border-radius: 16px;
                line-height: 1.9;
                box-shadow: 0 10px 30px rgba(0,0,0,0.25);
                text-align: center;
              }
              h2 {
                margin-top: 0;
                margin-bottom: 12px;
              }
              .muted {
                opacity: 0.9;
                font-size: 14px;
              }
              .actions {
                margin-top: 22px;
                display: flex;
                justify-content: center;
                gap: 12px;
                flex-wrap: wrap;
              }
              button {
                border: 0;
                border-radius: 10px;
                padding: 12px 18px;
                font-size: 15px;
                font-weight: bold;
                cursor: pointer;
              }
              .primary {
                background: #10b981;
                color: white;
              }
              .secondary {
                background: rgba(255,255,255,0.12);
                color: white;
              }
            </style>
          </head>
          <body>
            <div class="box">
              <h2>${title}</h2>
              <div>${message}</div>
              <div class="muted">${extra}</div>

              <div class="actions">
                <button class="primary" id="openSetupBtn">الذهاب إلى إعدادات الاتصال</button>
                <button class="secondary" id="reloadBtn">إعادة المحاولة</button>
              </div>
            </div>

            <script>
              const openSetupBtn = document.getElementById('openSetupBtn');
              const reloadBtn = document.getElementById('reloadBtn');

              openSetupBtn?.addEventListener('click', async () => {
                try {
                  if (window.electronAPI?.openConnectionSetup) {
                    await window.electronAPI.openConnectionSetup();
                  } else {
                    alert('تعذر فتح صفحة إعداد الاتصال');
                  }
                } catch (error) {
                  alert('تعذر فتح صفحة إعداد الاتصال');
                }
              });

              reloadBtn?.addEventListener('click', () => {
                window.location.reload();
              });
            </script>
          </body>
        </html>
      `)
  );
}

function startBundledServer(connectionConfig) {
  const serverRoot = isDev
    ? path.join(app.getAppPath(), 'server')
    : path.join(process.resourcesPath, 'server');

  const serverEntry = path.join(serverRoot, 'dist', 'index.js');

  logLine('startBundledServer');
  logLine('isDev =', isDev);
  logLine('process.execPath =', process.execPath);
  logLine('serverRoot =', serverRoot);
  logLine('serverEntry =', serverEntry);
  logLine('serverEntry exists =', fs.existsSync(serverEntry));
  logLine('server package exists =', fs.existsSync(path.join(serverRoot, 'package.json')));
  logLine('server node_modules exists =', fs.existsSync(path.join(serverRoot, 'node_modules')));
  logLine('server connection config =', connectionConfig);
  logLine('Has runtime DB config =', hasDbRuntimeConfig());

  serverProcess = spawn(process.execPath, [serverEntry], {
    cwd: serverRoot,
    env: getServerEnv(connectionConfig.port),
    stdio: 'pipe',
    windowsHide: true,
    shell: false,
  });

  serverProcess.stdout?.on('data', (data) => {
    logLine('[server stdout]', String(data));
  });

  serverProcess.stderr?.on('data', (data) => {
    logLine('[server stderr]', String(data));
  });

  serverProcess.on('spawn', () => {
    logLine('Embedded server started');
  });

  serverProcess.on('error', (error) => {
    logLine('Failed to start embedded server:', error);
  });

  serverProcess.on('exit', (code) => {
    logLine('Embedded server exited with code:', code);
  });
}

async function loadAppWithRetry(connectionConfig, maxAttempts = 60) {
  const targetUrl = `http://${connectionConfig.host}:${connectionConfig.port}`;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      logLine(`load attempt ${attempt} -> ${targetUrl}`);

      if (!mainWindow || mainWindow.isDestroyed()) return false;

      await mainWindow.loadURL(targetUrl);

      logLine(`load success on attempt ${attempt}`);
      return true;
    } catch (error) {
      logLine(`load failed on attempt ${attempt}:`, error);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  return false;
}
ipcMain.handle('app:get-connection-config', async () => {
  return readConnectionConfig();
});

ipcMain.handle('app:save-connection-config', async (_event, payload) => {
  try {
    const saved = saveConnectionConfig(payload);
    return { ok: true, data: saved };
  } catch (error) {
    logLine('save connection config failed', error);
    return { ok: false, message: error?.message || 'فشل حفظ إعداد الاتصال' };
  }
});

ipcMain.handle('app:get-db-runtime-config', async () => {
  const config = readDbRuntimeConfig();
  return {
    ok: true,
    data: config ? maskDbConfig(config) : null,
  };
});
ipcMain.handle('app:open-connection-setup', async () => {
  try {
    const ok = await loadSetupPage();
    return ok
      ? { ok: true }
      : { ok: false, message: 'تعذر فتح صفحة إعداد الاتصال' };
  } catch (error) {
    logLine('open connection setup failed', error);
    return {
      ok: false,
      message: error?.message || 'تعذر فتح صفحة إعداد الاتصال',
    };
  }
});

ipcMain.handle('app:test-current-db-connection', async () => {
  try {
    const config = readDbRuntimeConfig();

    if (!config) {
      return {
        ok: false,
        message: 'لا توجد إعدادات قاعدة بيانات محفوظة',
      };
    }

    return await testDbConnection(config);
  } catch (error) {
    logLine('test current db connection failed', error);
    return {
      ok: false,
      message: error?.message || 'فشل اختبار الاتصال الحالي',
    };
  }
});

ipcMain.handle('app:save-db-runtime-config', async (_event, payload) => {
  try {
    const result = saveDbRuntimeConfig(payload);

    if (!result?.ok) {
      return {
        ok: false,
        message: Array.isArray(result?.errors) ? result.errors.join(' - ') : 'فشل حفظ إعداد قاعدة البيانات',
      };
    }

    return {
      ok: true,
      data: {
        path: result.path,
      },
    };
  } catch (error) {
    logLine('save db runtime config failed', error);
    return { ok: false, message: error?.message || 'فشل حفظ إعداد قاعدة البيانات' };
  }
});

ipcMain.handle('app:clear-db-runtime-config', async () => {
  try {
    clearDbRuntimeConfig();
    return { ok: true };
  } catch (error) {
    logLine('clear db runtime config failed', error);
    return { ok: false, message: error?.message || 'فشل حذف إعداد قاعدة البيانات' };
  }
});

ipcMain.handle('app:is-initial-setup-required', async () => {
  return {
    ok: true,
    required: isInitialSetupRequired(),
  };
});

ipcMain.handle('app:test-db-connection', async (_event, payload) => {
  return await testDbConnection(payload);
});
ipcMain.handle('app:run-database-setup', async (_event, payload) => {
  return await runDatabaseSetup(payload);
});

ipcMain.handle('app:relaunch-app', async () => {
  try {
    app.relaunch();
    app.exit(0);
    return { ok: true };
  } catch (error) {
    logLine('relaunch app failed', error);
    return { ok: false, message: error?.message || 'فشل إعادة تشغيل التطبيق' };
  }
});
ipcMain.handle('app:import-activation-file', async () => {
  try {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return { ok: false, message: 'النافذة الرئيسية غير متاحة' };
    }

    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'اختيار ملف التفعيل',
      properties: ['openFile'],
      filters: [
        { name: 'License Files', extensions: ['lic', 'json'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });

    if (result.canceled || !result.filePaths?.[0]) {
      return { ok: false, canceled: true, message: 'تم إلغاء اختيار الملف' };
    }

    const sourcePath = result.filePaths[0];
    const raw = fs.readFileSync(sourcePath);
    fs.writeFileSync(activationFile, raw);

    logLine('activation file imported', {
      sourcePath,
      targetPath: activationFile,
    });

    return {
      ok: true,
      data: {
        path: activationFile,
      },
      message: 'تم استيراد ملف التفعيل بنجاح',
    };
  } catch (error) {
    logLine('import activation file failed', error);
    return {
      ok: false,
      message: error?.message || 'فشل استيراد ملف التفعيل',
    };
  }
});

app.whenReady().then(async () => {
  logLine('app.whenReady');

  createWindow();

  const setupRequired = isInitialSetupRequired();
  logLine('isInitialSetupRequired =', setupRequired);

  if (setupRequired) {
    const setupLoaded = await loadSetupPage();

    if (!setupLoaded && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.loadURL(
        'data:text/html;charset=UTF-8,' +
        encodeURIComponent(`
            <!doctype html>
            <html lang="ar" dir="rtl">
              <head>
                <meta charset="UTF-8" />
                <title>Rayyan Pro - Setup Error</title>
                <style>
                  body {
                    margin: 0;
                    font-family: Arial, sans-serif;
                    background: #1f2937;
                    color: white;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    height: 100vh;
                  }
                  .box {
                    max-width: 760px;
                    background: rgba(255,255,255,0.06);
                    padding: 28px 36px;
                    border-radius: 16px;
                    line-height: 1.9;
                  }
                </style>
              </head>
              <body>
                <div class="box">
                  <h2>تعذر فتح شاشة الإعداد الأولي</h2>
                  <div>تأكد من وجود الملف setup.html داخل مجلد electron.</div>
                </div>
              </body>
            </html>
          `)
      );
    }

    return;
  }

  const connectionConfig = readConnectionConfig();

  startBundledServer(connectionConfig);

  const ok = await loadAppWithRetry(connectionConfig, 8);

  if (!ok) {
    logLine('All load attempts failed');

    renderConnectionErrorPage({
      title: 'تعذر تحميل التطبيق',
      message: 'تعذر الوصول إلى واجهة Rayyan Pro على العنوان المحدد.',
      extra: 'يمكنك الذهاب مباشرة إلى صفحة إعدادات الاتصال لتعديل الإعدادات ثم إعادة تشغيل التطبيق.',
    });
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (serverProcess) {
    try {
      serverProcess.kill();
    } catch { }
  }
});