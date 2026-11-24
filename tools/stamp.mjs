// Cache-busting without a build step.   npm run stamp   (check only: npm run stamp -- --check)
//
// GitHub Pages serves every file with max-age=600, so right after a deploy a
// browser could load the new main.js with old copies of the modules it imports.
// This writes an import map into index.html that gives every module (and the
// stylesheets and main.js) a ?v=<content hash> URL. Relative imports inside the
// modules are remapped by the browser too, so a deploy is all-new or all-old.
//
// index.html itself is cached for 10 minutes too. So the stamp also writes a
// build id into index.html and build.txt, and a tiny loader that fetches
// build.txt (never cached) before starting the game: an old cached page sees a
// different id and loads the new page once instead of starting.
//
// tools/stamp.ps1 does exactly the same for Windows without Node. Keep them in step.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');

// Must match the loader in tools/stamp.ps1 character for character.
const LOADER = "<script>(function () { var B = '__BUILD__', M = '__MAIN__'; function go() { if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', go); return; } var s = document.createElement('script'); s.type = 'module'; s.src = M; document.head.appendChild(s); } fetch('build.txt?t=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.ok ? r.text() : B; }).then(function (b) { b = b.trim(); var k = 'blockade.reloadedFor'; if (b && b !== B && sessionStorage.getItem(k) !== b) { sessionStorage.setItem(k, b); location.replace(location.pathname + '?b=' + b); } else go(); }, go); })();</script>";

/** First 8 hex chars of the SHA-1 of the file's text (BOM dropped, CRLF -> LF, so Windows and CI agree). */
function hash(rel) {
  let s = fs.readFileSync(path.join(root, rel), 'utf8');
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  s = s.replace(/\r\n/g, '\n');
  return crypto.createHash('sha1').update(s, 'utf8').digest('hex').slice(0, 8);
}

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) out.push(...walk(rel));
    else if (e.name.endsWith('.js')) out.push(rel);
  }
  return out;
}

const modules = [...walk('src'), ...walk('vendor')].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
const v = (rel) => `${rel}?v=${hash(rel)}`;
const lines = [
  `<link rel="stylesheet" href="${v('css/fonts.css')}">`,
  `<link rel="stylesheet" href="${v('css/style.css')}">`,
  '<script type="importmap">',
  '{ "imports": {',
  [`  "three": "./${v('vendor/three.module.js')}"`, ...modules.map((m) => `  "./${m}": "./${v(m)}"`)].join(',\n'),
  '} }',
  '</script>',
];
// The build id covers every stamped file, so any change gives a new id.
const build = crypto.createHash('sha1').update(lines.join('\n'), 'utf8').digest('hex').slice(0, 8);
lines.push(LOADER.replace('__BUILD__', build).replace('__MAIN__', v('src/main.js')));

const file = path.join(root, 'index.html');
const html = fs.readFileSync(file, 'utf8');
const eol = html.includes('\r\n') ? '\r\n' : '\n';
const src = html.replace(/\r\n/g, '\n').split('\n');
const start = src.findIndex((l) => l.startsWith('<!-- stamp:start'));
const end = src.findIndex((l) => l.startsWith('<!-- stamp:end'));
if (start < 0 || end < start) { console.error('index.html: stamp markers not found'); process.exit(1); }
const block = lines.join('\n').split('\n');
const next = [...src.slice(0, start + 1), ...block, ...src.slice(end)];
const buildFile = path.join(root, 'build.txt');
const oldBuild = fs.existsSync(buildFile) ? fs.readFileSync(buildFile, 'utf8').trim() : '';
const same = next.join('\n') === src.join('\n') && oldBuild === build;

if (check) {
  if (same) { console.log('✓ index.html stamps are up to date'); process.exit(0); }
  console.error('✗ index.html / build.txt stamps are out of date: run `npm run stamp` (or tools\\stamp.ps1) and commit the result.');
  process.exit(1);
}
if (same) console.log('index.html stamps already up to date');
else {
  fs.writeFileSync(file, next.join(eol));
  fs.writeFileSync(buildFile, build);
  console.log(`stamped ${modules.length} modules in index.html (build ${build})`);
}
