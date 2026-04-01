const fs = require('fs');
const path = require('path');

const modeArg = String(process.argv[2] || '').trim().toLowerCase();
const mode = modeArg === 'trial' ? 'trial' : 'standard';

const rootDir = process.cwd();
const buildDir = path.join(rootDir, 'build');
const outFile = path.join(buildDir, 'distribution.config.json');

fs.mkdirSync(buildDir, { recursive: true });

const payload = {
  mode,
  updatedAt: new Date().toISOString(),
};

fs.writeFileSync(outFile, JSON.stringify(payload, null, 2), 'utf8');

console.log(`distribution config written: ${outFile}`);
console.log(`mode = ${mode}`);