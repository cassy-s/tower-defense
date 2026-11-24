// Cache-busting without a build step.   npm run stamp   (check only: npm run stamp -- --check)
//
// GitHub Pages serves every file with max-age=600, so right after a deploy a
// browser could load the new main.js with old copies of the modules it imports.
// This writes an import map into index.html that gives every module (and the
// stylesheets and main.js) a ?v=<content hash> URL. Relative imports inside the
// modules are remapped by the browser too, so a deploy is all-new or all-old.
//
// tools/stamp.ps1 does exactly the same for Windows without Node. Keep them in step.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');

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
  `<script type="module" src="${v('src/main.js')}"></script>`,
];

const file = path.join(root, 'index.html');
const html = fs.readFileSync(file, 'utf8');
const eol = html.includes('\r\n') ? '\r\n' : '\n';
const src = html.replace(/\r\n/g, '\n').split('\n');
const start = src.findIndex((l) => l.startsWith('<!-- stamp:start'));
const end = src.findIndex((l) => l.startsWith('<!-- stamp:end'));
if (start < 0 || end < start) { console.error('index.html: stamp markers not found'); process.exit(1); }
const block = lines.join('\n').split('\n');
const next = [...src.slice(0, start + 1), ...block, ...src.slice(end)];
const same = next.join('\n') === src.join('\n');

if (check) {
  if (same) { console.log('✓ index.html stamps are up to date'); process.exit(0); }
  console.error('✗ index.html stamps are out of date: run `npm run stamp` (or tools\\stamp.ps1) and commit the result.');
  process.exit(1);
}
if (same) console.log('index.html stamps already up to date');
else { fs.writeFileSync(file, next.join(eol)); console.log(`stamped ${modules.length} modules in index.html`); }
