import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const readJsonVersion = (relativePath) => JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8')).version;
const expected = readJsonVersion('package.json');
const versions = {
  backend: readJsonVersion('backend/package.json'),
  frontend: readJsonVersion('frontend/package.json'),
  flutter: fs.readFileSync(path.join(root, 'clients/webcord_native/pubspec.yaml'), 'utf8').match(/^version:\s*([^+\s]+)/m)?.[1],
  server: fs.readFileSync(path.join(root, 'backend/src/server.js'), 'utf8').match(/const APP_VERSION = '([^']+)'/)?.[1],
  web: fs.readFileSync(path.join(root, 'frontend/src/App.jsx'), 'utf8').match(/const APP_VERSION = '([^']+)'/)?.[1],
  native: fs.readFileSync(path.join(root, 'clients/webcord_native/lib/src/app_state.dart'), 'utf8').match(/clientVersion = '([^']+)'/)?.[1]
};

const mismatches = Object.entries(versions).filter(([, version]) => version !== expected);
if (mismatches.length) {
  throw new Error(`Release version mismatch: expected ${expected}; ${mismatches.map(([name, version]) => `${name}=${version || 'missing'}`).join(', ')}`);
}
console.log(`WebCord release versions agree on ${expected}.`);
