// ============================================================================
// build.mjs — zero-dependency single-file bundler.
//
// Browsers block ES-module imports over file://, so this inlines the whole
// module graph plus styles.css into a self-contained dist/index.html that opens
// by double-click. It relies on a disciplined module dialect used throughout
// src/: only `import { ... } from './rel.js'` and `export function|class|const`
// / `export { ... }`. Each module is rewritten into a tiny CommonJS-style
// registry entry and run through a minimal require() shim. No transpiler, no
// dependencies — just string rewriting of a syntax we fully control.
// ============================================================================
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const srcRoot = resolve(root, 'src');
const entry = resolve(srcRoot, 'app.js');

const modules = new Map();
const idOf = abs => relative(srcRoot, abs).replace(/\\/g, '/');

function rewriteImports(code, absPath) {
  const dir = dirname(absPath);
  const deps = [];
  const rewritten = code.replace(
    /import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]\s*;?/g,
    (_m, names, spec) => {
      const depAbs = resolve(dir, spec);
      deps.push(depAbs);
      return `const {${names.trim().replace(/,\s*$/, '')}} = __require(${JSON.stringify(idOf(depAbs))});`;
    },
  );
  return { rewritten, deps };
}

function rewriteExports(code) {
  const names = new Set();
  code = code.replace(/export\s+(function|class)\s+([A-Za-z0-9_$]+)/g, (_m, kw, name) => { names.add(name); return `${kw} ${name}`; });
  code = code.replace(/export\s+(const|let|var)\s+([A-Za-z0-9_$]+)/g, (_m, kw, name) => { names.add(name); return `${kw} ${name}`; });
  code = code.replace(/export\s*\{([^}]*)\}\s*;?/g, (_m, inner) => {
    inner.split(',').map(s => s.trim()).filter(Boolean).forEach(n => names.add(n.split(/\s+as\s+/)[0].trim()));
    return '';
  });
  return { code, names: [...names] };
}

function load(absPath) {
  const id = idOf(absPath);
  if (modules.has(id)) return;
  modules.set(id, '');                              // reserve (breaks cycles)
  const src = readFileSync(absPath, 'utf8');
  const { rewritten, deps } = rewriteImports(src, absPath);
  deps.forEach(load);
  const { code, names } = rewriteExports(rewritten);
  const exportLine = names.length ? `\n__export(module, {${names.join(', ')}});` : '';
  modules.set(id, `__modules[${JSON.stringify(id)}] = function(module){\nconst exports = module.exports;\n${code}${exportLine}\n};`);
}

load(entry);

const bundle = `(function(){
const __modules = {};
const __cache = {};
function __export(module, obj){ for (const k in obj) module.exports[k] = obj[k]; }
function __require(id){
  if (__cache[id]) return __cache[id].exports;
  const module = { exports: {} };
  __cache[id] = module;
  __modules[id](module);
  return module.exports;
}
${[...modules.values()].join('\n')}
__require(${JSON.stringify(idOf(entry))});
})();`;

const css = readFileSync(resolve(root, 'styles.css'), 'utf8');
const html = readFileSync(resolve(root, 'index.html'), 'utf8')
  .replace('<link rel="stylesheet" href="styles.css">', `<style>\n${css}\n</style>`)
  .replace('<script type="module" src="src/app.js"></script>', `<script>\n${bundle}\n</script>`);

mkdirSync(resolve(root, 'dist'), { recursive: true });
writeFileSync(resolve(root, 'dist/index.html'), html);
console.log(`dist/index.html written — ${modules.size} modules, ${(html.length / 1024).toFixed(1)} KB`);
