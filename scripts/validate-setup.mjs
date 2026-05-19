#!/usr/bin/env node
/**
 * Validates local extension setup before loading in the browser.
 * Usage: node scripts/validate-setup.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(root, 'manifest.json');
const configPath = path.join(root, 'config', 'config.js');

let failed = false;

function fail(msg) {
  console.error('✗', msg);
  failed = true;
}

function ok(msg) {
  console.log('✓', msg);
}

if (!fs.existsSync(manifestPath)) {
  fail('manifest.json is missing. Run: cp manifest_template.json manifest.json');
} else {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const clientId = manifest.oauth2?.client_id?.trim() ?? '';

  if (!clientId) {
    fail('manifest.json oauth2.client_id is empty');
  } else if (/YOUR_|PLACEHOLDER/i.test(clientId)) {
    fail(`manifest.json still has placeholder client_id: ${clientId}`);
  } else if (!/\.apps\.googleusercontent\.com$/i.test(clientId)) {
    fail(`manifest.json client_id must end with .apps.googleusercontent.com (got: ${clientId})`);
  } else {
    ok(`manifest.json client_id format looks valid`);
  }
}

if (!fs.existsSync(configPath)) {
  fail('config/config.js is missing. Run: cp config/config.template.js config/config.js');
} else {
  ok('config/config.js exists');
}

if (failed) {
  console.log('\nSetup steps:');
  console.log('  1. cp manifest_template.json manifest.json');
  console.log('  2. cp config/config.template.js config/config.js');
  console.log('  3. Load unpacked at chrome://extensions and copy Extension ID');
  console.log('  4. Google Cloud → Credentials → Create OAuth client ID → Chrome extension');
  console.log('  5. Paste Extension ID, copy Client ID into manifest.json oauth2.client_id');
  console.log('  6. Reload extension at chrome://extensions\n');
  process.exit(1);
}

console.log('\nLocal files look configured. Reload the extension and try Connect again.\n');
