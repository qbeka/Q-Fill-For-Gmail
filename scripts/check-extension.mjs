/**
 * Static checks on the extension folder, run in CI:
 * - manifest.json parses and every file it points to exists
 * - no file or folder starts with "_" except _locales (Chrome refuses to load those)
 * - every i18n key used in the code exists in _locales/en/messages.json
 * - the store description fits in 132 characters
 * - nothing in the extension calls a host it has not declared
 *
 * Run with: node scripts/check-extension.mjs
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../extension/', import.meta.url));
const problems = [];
const fail = message => problems.push(message);

async function exists(path) {
  try {
    await stat(join(ROOT, path));
    return true;
  } catch {
    return false;
  }
}

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(full));
    else out.push(relative(ROOT, full));
  }
  return out;
}

const manifest = JSON.parse(await readFile(join(ROOT, 'manifest.json'), 'utf8'));
const messages = JSON.parse(await readFile(join(ROOT, '_locales/en/messages.json'), 'utf8'));
const files = await walk(ROOT);

// Files the manifest points to.
const referenced = [
  manifest.background?.service_worker,
  manifest.action?.default_popup,
  ...Object.values(manifest.icons || {}),
  ...Object.values(manifest.action?.default_icon || {})
].filter(Boolean);
for (const path of referenced) {
  if (!(await exists(path))) fail(`manifest.json points to a missing file: ${path}`);
}

// Reserved names.
for (const path of files) {
  const bad = path.split(/[\\/]/).find(part => part.startsWith('_') && part !== '_locales');
  if (bad) fail(`Chrome will refuse to load a path starting with "_": ${path}`);
}

// i18n keys: every literal lookup must exist, and every string must be used somewhere.
const sources = [];
for (const path of files.filter(p => /\.(js|html|json)$/.test(p) && !p.startsWith('_locales'))) {
  sources.push(await readFile(join(ROOT, path), 'utf8'));
}
const allSource = sources.join('\n');
const used = new Set();
for (const match of allSource.matchAll(/\bt\(\s*'([A-Za-z0-9_]+)'|data-i18n(?:-placeholder)?="([A-Za-z0-9_]+)"|__MSG_([A-Za-z0-9_]+)__/g)) {
  const key = match[1] || match[2] || match[3];
  used.add(key);
  if (!messages[key]) fail(`Missing string in _locales/en/messages.json: ${key}`);
}
for (const key of Object.keys(messages)) {
  if (!used.has(key) && !allSource.includes(`'${key}'`)) fail(`Unused string in _locales/en/messages.json: ${key}`);
}

// Store limits.
if (messages.extensionDescription.message.length > 132) {
  fail(`extensionDescription is ${messages.extensionDescription.message.length} characters, the store allows 132`);
}
if (messages.extensionName.message.length > 75) fail('extensionName is longer than 75 characters');

// Network calls only to declared hosts.
const declared = (manifest.host_permissions || []).map(p => new URL(p.replace('*', 'x')).host);
for (const path of files.filter(p => p.endsWith('.js'))) {
  const text = await readFile(join(ROOT, path), 'utf8');
  for (const match of text.matchAll(/fetch\(\s*[`'"](https:\/\/[^/`'"$]+)/g)) {
    const host = new URL(match[1]).host;
    if (!declared.includes(host)) fail(`${path} calls ${host}, which is not in host_permissions`);
  }
  for (const match of text.matchAll(/const (?:API|\w+_ENDPOINT) = '(https:\/\/[a-z0-9.-]+)[^']*';/g)) {
    const host = new URL(match[1]).host;
    if (!declared.includes(host) && host !== 'accounts.google.com') fail(`${path} names ${host}, which is not in host_permissions`);
  }
}

if (problems.length) {
  console.error(problems.map(p => `  - ${p}`).join('\n'));
  console.error(`\n${problems.length} problem(s) in extension/`);
  process.exit(1);
}
console.log(`extension/ looks good: ${files.length} files, ${Object.keys(messages).length} strings, version ${manifest.version}`);
