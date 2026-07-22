// The offline shell's one failure mode is silence: a page added without
// regenerating the precache list keeps working online and only breaks with no
// network, which is the one place nobody is testing. So the list is checked
// here — recomputed from the real import graph and compared to the file that
// ships. This is a repo-integrity test rather than a unit test, and the only
// one in the suite that touches the filesystem.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectAssets, pages, MANIFEST_PATH } from '../scripts/offline-manifest.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
const FIX = 'run `npm run offline:manifest` and commit offline-manifest.json';

test('the shipped precache list matches the real import graph', () => {
  const computed = collectAssets();
  const shipped = manifest.assets;
  const missing = computed.filter(a => !shipped.includes(a));
  const extra = shipped.filter(a => !computed.includes(a));
  assert.deepEqual(missing, [], `offline-manifest.json is missing files — ${FIX}`);
  assert.deepEqual(extra, [], `offline-manifest.json lists files nothing imports — ${FIX}`);
});

test('every listed file actually exists', () => {
  for (const a of manifest.assets) {
    assert.ok(existsSync(join(ROOT, a)), `${a} is listed but not in the repo — ${FIX}`);
  }
});

test('every page of the app is in it — offline means the whole app', () => {
  for (const page of pages()) {
    assert.ok(manifest.assets.includes(page), `${page} would 404 offline — ${FIX}`);
  }
  assert.ok(manifest.assets.includes('styles.css'));
  assert.ok(manifest.assets.includes('src/nav.js'));
  assert.ok(manifest.assets.includes('vendor/phaser.esm.js'), 'the village is part of the app too');
});

test('the paths are relative, so the same list works under a GitHub Pages subpath', () => {
  for (const a of manifest.assets) {
    assert.ok(!a.startsWith('/'), `${a} is absolute and would cache the wrong path on Pages`);
    assert.ok(!a.startsWith('..'), `${a} escapes the repo`);
    assert.ok(!/^[a-z]+:/i.test(a), `${a} is external and cannot be precached`);
  }
});

test('the install cost is worth knowing about, and bounded', () => {
  const bytes = manifest.assets.reduce((n, a) => n + readFileSync(join(ROOT, a)).length, 0);
  // Not a style rule — a tripwire. The shell is ~2 MB, most of it the vendored
  // Phaser build; if it ever doubles, that is a decision someone should make on
  // purpose rather than discover on a phone tethered to a train.
  assert.ok(bytes < 6 * 1024 * 1024, `the offline shell is ${(bytes / 1048576).toFixed(1)} MB`);
});

test('the web app manifest points at icons that are cached', () => {
  const web = JSON.parse(readFileSync(join(ROOT, 'manifest.webmanifest'), 'utf8'));
  for (const icon of web.icons) {
    assert.ok(existsSync(join(ROOT, icon.src)), `${icon.src} is declared but missing`);
    assert.ok(manifest.assets.includes(icon.src), `${icon.src} is not precached`);
  }
  // Relative for the same reason as everything else: the app lives under a
  // subpath on Pages.
  assert.equal(web.start_url, '.');
  assert.equal(web.scope, '.');
});

test('every page links the web app manifest and the icon', () => {
  for (const page of pages()) {
    const html = readFileSync(join(ROOT, page), 'utf8');
    assert.match(html, /<link rel="manifest" href="manifest\.webmanifest">/, `${page} is not installable`);
    assert.match(html, /<meta name="theme-color"/, `${page} has no theme colour`);
  }
});

test('the service worker caches under one name and cleans up the rest', () => {
  // Comments stripped: the header explains why addAll is not used, and a check
  // that reads prose would fail on the explanation for the thing it wants.
  const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  assert.match(sw, /const CACHE = '[^']+'/);
  assert.match(sw, /caches\.delete/, 'an activate that does not evict old caches leaks them for ever');
  assert.ok(!/cache\.addAll/.test(sw), 'addAll voids the whole install on one 404 — see the header of sw.js');
});
