const fs = require('fs');
const path = require('path');
const { generateKeyPairSync } = require('crypto');

const rootDir = process.cwd();
const keysDir = path.join(rootDir, '.license-keys');
const privateKeyPath = path.join(keysDir, 'private.pem');
const publicKeyPath = path.join(keysDir, 'public.pem');

fs.mkdirSync(keysDir, { recursive: true });

if (fs.existsSync(privateKeyPath) || fs.existsSync(publicKeyPath)) {
  console.log('license keys already exist:');
  console.log('private =', privateKeyPath);
  console.log('public  =', publicKeyPath);
  process.exit(0);
}

const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: {
    type: 'spki',
    format: 'pem',
  },
  privateKeyEncoding: {
    type: 'pkcs8',
    format: 'pem',
  },
});

fs.writeFileSync(privateKeyPath, privateKey, 'utf8');
fs.writeFileSync(publicKeyPath, publicKey, 'utf8');

console.log('license keys generated successfully');
console.log('private =', privateKeyPath);
console.log('public  =', publicKeyPath);
console.log('IMPORTANT: keep private.pem only with you and never ship it with the app.');