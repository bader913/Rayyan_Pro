const fs = require('fs');
const path = require('path');
const { createSign } = require('crypto');

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const part = String(argv[i] || '').trim();
    if (!part.startsWith('--')) continue;

    const key = part.slice(2);
    const next = argv[i + 1];

    if (!next || String(next).startsWith('--')) {
      out[key] = true;
      continue;
    }

    out[key] = String(next);
    i += 1;
  }
  return out;
}

function ensureIsoOrNull(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid date: ${value}`);
  }
  return d.toISOString();
}

const args = parseArgs(process.argv.slice(2));

const rootDir = process.cwd();
const defaultPrivateKeyPath = path.join(rootDir, '.license-keys', 'private.pem');

const privateKeyPath = path.resolve(args.privateKey || defaultPrivateKeyPath);
const outPath = path.resolve(args.out || path.join(rootDir, 'activation.lic'));
const customerName = String(args.customer || '').trim() || null;
const deviceFingerprint = String(args.fingerprint || '').trim();
const expiresAt = ensureIsoOrNull(args.expires || null);

if (!deviceFingerprint) {
  console.error('Missing required argument: --fingerprint');
  process.exit(1);
}

if (!fs.existsSync(privateKeyPath)) {
  console.error('Private key not found:', privateKeyPath);
  process.exit(1);
}

const privateKeyPem = fs.readFileSync(privateKeyPath, 'utf8');

const payload = {
  customer_name: customerName,
  device_fingerprint: deviceFingerprint,
  issued_at: new Date().toISOString(),
  expires_at: expiresAt,
};

const serializedPayload = JSON.stringify(payload);

const signer = createSign('RSA-SHA256');
signer.update(serializedPayload);
signer.end();

const signature = signer.sign(privateKeyPem).toString('base64');

const envelope = {
  payload,
  signature,
};

fs.writeFileSync(outPath, JSON.stringify(envelope, null, 2), 'utf8');

console.log('activation file created successfully');
console.log('out =', outPath);
console.log('customer =', customerName || '(none)');
console.log('fingerprint =', deviceFingerprint);
console.log('expires_at =', expiresAt || '(no expiry)');