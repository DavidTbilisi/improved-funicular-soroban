// ============================================================================
// Transfer — every saved key as one versioned JSON blob, out and back in.
//
// Until now all progress lived in eleven separate localStorage keys and died
// with the browser profile: no export, no import, no way to move to another
// machine. This is the durability story, and it is deliberately dumb — a flat
// snapshot of the keys as they are, not a normalized save format. A format that
// re-derives state would rot every time a store's blob shape changes; a
// snapshot never can.
//
// VALIDATION IS SHALLOW ON PURPOSE. Every store already heals what it loads:
// GameSave._fix() repairs a village, TutorialProgress._data() migrates and
// defaults, and every LocalStorage*Store parse is wrapped in try/catch. So the
// import only has to check that this is one of OUR files at a version we know;
// anything malformed inside a key is the owning store's problem, and it is
// already equipped for it.
//
// IMPORT IS NON-DESTRUCTIVE: keys absent from the file are left alone, so a
// partial or older export merges rather than wiping what it doesn't mention.
//
// `storage` is injected ({ getItem, setItem }) — the same seam every store in
// the app already uses — so this module is DOM-free and testable with a plain
// object. Unit-tested in test/todayTransfer.test.js.
// ============================================================================

export const APP_TAG = 'npv-soroban';
export const EXPORT_VERSION = 1;

// Every key the app writes. Order is cosmetic (it fixes the order in the file).
export const SAVE_KEYS = Object.freeze([
  'npv-drill-stats',        // drill sessions / bests / per-fact tallies
  'npv-tutorial-progress',  // the guided-practice unlock ladder
  'npv-practice-history',   // per-level solve records
  'npv-trainer-progress',   // per-mode solve records
  'npv-fault-log',          // rejected moves by complement pair
  'npv-game-save',          // the village
  'npv-achievements',       // badges + lifetime counters
  'npv-days',               // the day axis (streak)
  'npv-today',              // today's plan checklist
  'npv-support',            // mnemonic-mental fade level
  'npv-sound',              // sound on/off
  'npv-bpm',                // metronome tempo
]);

// These three hold PLAIN STRINGS, not JSON ('0', 'off', '60'). Parsing them as
// JSON would half-work ('0' and '60' parse, 'off' throws) — so they are carried
// verbatim, and this list is what keeps a round trip from double-encoding them.
export const RAW_KEYS = Object.freeze(['npv-support', 'npv-sound', 'npv-bpm']);

const KEY_SET = new Set(SAVE_KEYS);

/**
 * Snapshot every present key. A key holding invalid JSON is exported as its raw
 * string rather than aborting the export — a broken key must not cost the user
 * the other eleven.
 * @returns { app, v, exportedAt, keys: { [key]: parsed | string } }
 */
export function exportSave(storage, { now = () => new Date().toISOString() } = {}) {
  const keys = {};
  for (const k of SAVE_KEYS) {
    let raw = null;
    try { raw = storage.getItem(k); } catch { /* disabled storage */ }
    if (raw == null) continue;
    if (RAW_KEYS.includes(k)) { keys[k] = raw; continue; }
    try { keys[k] = JSON.parse(raw); } catch { keys[k] = raw; }
  }
  return { app: APP_TAG, v: EXPORT_VERSION, exportedAt: now(), keys };
}

/**
 * @returns { ok, version, keys, errors, skipped }
 *   keys    — recognised keys the file will write
 *   skipped — keys in the file we don't know (a newer export; not fatal)
 */
export function validateSave(obj) {
  const out = { ok: false, version: null, keys: [], errors: [], skipped: [] };
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    out.errors.push('Not a save file — expected a JSON object.');
    return out;
  }
  if (obj.app !== APP_TAG) {
    out.errors.push(`Not a ${APP_TAG} save file.`);
    return out;
  }
  out.version = obj.v;
  if (obj.v !== EXPORT_VERSION) {
    out.errors.push(`Save version ${obj.v} — this app reads version ${EXPORT_VERSION}.`);
    return out;
  }
  if (!obj.keys || typeof obj.keys !== 'object' || Array.isArray(obj.keys)) {
    out.errors.push('Save file has no keys block.');
    return out;
  }
  for (const k of Object.keys(obj.keys)) (KEY_SET.has(k) ? out.keys : out.skipped).push(k);
  if (!out.keys.length) {
    out.errors.push('Save file contains nothing this app can restore.');
    return out;
  }
  out.ok = true;
  return out;
}

/**
 * Write every recognised key present in the file. Keys NOT in the file are left
 * untouched — a partial export merges, and nothing is silently wiped.
 * @returns { ok, written, skipped, errors }
 */
export function importSave(storage, obj) {
  const check = validateSave(obj);
  if (!check.ok) return { ok: false, written: [], skipped: check.skipped, errors: check.errors };

  const written = [], errors = [];
  for (const k of check.keys) {
    const v = obj.keys[k];
    const raw = RAW_KEYS.includes(k) || typeof v === 'string' ? String(v) : JSON.stringify(v);
    try { storage.setItem(k, raw); written.push(k); }
    catch { errors.push(`Could not write ${k} (storage full or disabled).`); }
  }
  return { ok: !!written.length, written, skipped: check.skipped, errors };
}
