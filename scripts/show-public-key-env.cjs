const fs = require('fs');
const path = require('path');

const rootDir = process.cwd();
const publicKeyPath = path.join(rootDir, '.license-keys', 'public.pem');

if (!fs.existsSync(publicKeyPath)) {
  console.error('Public key not found:', publicKeyPath);
  process.exit(1);
}

const publicKeyPem = fs.readFileSync(publicKeyPath, 'utf8').trim();
const escaped = publicKeyPem.replace(/\r?\n/g, '\\n');

console.log('');
console.log('Copy this line into server/.env');
console.log('');
console.log(`RAYYAN_LICENSE_PUBLIC_KEY_PEM="${escaped}"`);
console.log('');