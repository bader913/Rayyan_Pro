const fs = require('fs');
const path = require('path');
const { app, safeStorage } = require('electron');

const CONFIG_DIR_NAME = 'runtime';
const CONFIG_FILE_NAME = 'db.runtime.json';

function getConfigDir() {
  return path.join(app.getPath('userData'), CONFIG_DIR_NAME);
}

function getConfigPath() {
  return path.join(getConfigDir(), CONFIG_FILE_NAME);
}

function ensureConfigDir() {
  fs.mkdirSync(getConfigDir(), { recursive: true });
}

function encodeBase64(buffer) {
  return Buffer.from(buffer).toString('base64');
}

function decodeBase64(value) {
  return Buffer.from(String(value || ''), 'base64');
}

function normalizeBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  const text = String(value || '').trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(text);
}

function normalizeDbConfig(input = {}) {
  const mode = String(input.mode || 'primary').trim().toLowerCase() === 'secondary'
    ? 'secondary'
    : 'primary';

  const host = String(input.host || '').trim() || (mode === 'primary' ? '127.0.0.1' : '');
  const port = Number(input.port || 5432);
  const database = String(input.database || input.dbName || '').trim();
  const user = String(input.user || input.username || '').trim();
  const password = String(input.password || '');
  const ssl = normalizeBoolean(input.ssl);

  return {
    mode,
    host,
    port: Number.isFinite(port) && port > 0 ? port : 5432,
    database,
    user,
    password,
    ssl,
    updatedAt: new Date().toISOString(),
  };
}

function validateDbConfig(config) {
  const errors = [];

  if (!config.host) errors.push('host مطلوب');
  if (!config.port || Number.isNaN(Number(config.port))) errors.push('port غير صالح');
  if (!config.database) errors.push('database مطلوبة');
  if (!config.user) errors.push('user مطلوب');

  return {
    ok: errors.length === 0,
    errors,
  };
}

function encryptPassword(password) {
  const text = String(password || '');

  if (!text) return '';

  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(text);
    return `enc:${encodeBase64(encrypted)}`;
  }

  return `plain:${encodeBase64(Buffer.from(text, 'utf8'))}`;
}

function decryptPassword(value) {
  const text = String(value || '');

  if (!text) return '';

  if (text.startsWith('enc:')) {
    const encoded = text.slice(4);

    if (!safeStorage.isEncryptionAvailable()) {
      return '';
    }

    try {
      return safeStorage.decryptString(decodeBase64(encoded));
    } catch {
      return '';
    }
  }

  if (text.startsWith('plain:')) {
    const encoded = text.slice(6);
    return decodeBase64(encoded).toString('utf8');
  }

  return text;
}

function saveDbRuntimeConfig(input = {}) {
  const normalized = normalizeDbConfig(input);
  const validation = validateDbConfig(normalized);

  if (!validation.ok) {
    return {
      ok: false,
      errors: validation.errors,
    };
  }

  ensureConfigDir();

  const payload = {
    ...normalized,
    password: encryptPassword(normalized.password),
  };

  fs.writeFileSync(getConfigPath(), JSON.stringify(payload, null, 2), 'utf8');

  return {
    ok: true,
    path: getConfigPath(),
  };
}

function readDbRuntimeConfig() {
  const filePath = getConfigPath();

  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);

    return normalizeDbConfig({
      ...parsed,
      password: decryptPassword(parsed.password),
    });
  } catch {
    return null;
  }
}

function hasDbRuntimeConfig() {
  return fs.existsSync(getConfigPath());
}

function clearDbRuntimeConfig() {
  const filePath = getConfigPath();

  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

function maskDbConfig(config) {
  if (!config) return null;

  return {
    ...config,
    password: config.password ? '********' : '',
  };
}

function buildDatabaseUrl(config) {
  const user = encodeURIComponent(String(config.user || ''));
  const password = encodeURIComponent(String(config.password || ''));
  const host = String(config.host || '127.0.0.1');
  const port = Number(config.port || 5432);
  const database = encodeURIComponent(String(config.database || ''));

  let url = `postgresql://${user}:${password}@${host}:${port}/${database}`;

  if (config.ssl) {
    url += '?sslmode=require';
  }

  return url;
}

function buildServerEnv(baseEnv = process.env) {
  const config = readDbRuntimeConfig();

  if (!config) {
    return { ...baseEnv };
  }

  const nextEnv = {
    ...baseEnv,
    PGHOST: config.host,
    PGPORT: String(config.port),
    PGDATABASE: config.database,
    PGUSER: config.user,
    PGPASSWORD: config.password,
    DATABASE_URL: buildDatabaseUrl(config),
  };

  if (config.ssl) {
    nextEnv.PGSSLMODE = 'require';
  }

  return nextEnv;
}

module.exports = {
  getConfigPath,
  hasDbRuntimeConfig,
  readDbRuntimeConfig,
  saveDbRuntimeConfig,
  clearDbRuntimeConfig,
  maskDbConfig,
  buildServerEnv,
};