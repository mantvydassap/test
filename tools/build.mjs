// Bundles src/ into a single self-contained HTML page.
//   dist/index.html     full HTML document (open directly or serve)
//   dist/artifact.html  body-only variant for hosts that supply their own <head>
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const res = await build({
  entryPoints: ['src/main.js'],
  bundle: true,
  format: 'esm',
  minify: true,
  write: false,
  external: ['three'],
  target: 'es2020',
  legalComments: 'none',
});
const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = readFileSync('src/ui/style.css', 'utf8');
const body = readFileSync('src/body.html', 'utf8')
  .replace('/*CSS*/', () => css)
  .replace('/*JS*/', () => js);
const doc = readFileSync('src/index.html', 'utf8').replace('<!--BODY-->', () => body.replace(/^<title>.*<\/title>\n/, ''));
mkdirSync('dist', { recursive: true });
writeFileSync('dist/index.html', doc);
writeFileSync('dist/artifact.html', body);
console.log(`built dist/index.html (${(doc.length / 1024).toFixed(0)} KB)`);

// Offline build: Three.js bundled in, no CDN needed. Opens straight from disk.
const off = await build({
  entryPoints: ['src/main.js'], bundle: true, format: 'esm', minify: true, write: false,
  target: 'es2020', legalComments: 'none',
});
const offJs = off.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const offBody = readFileSync('src/body.html', 'utf8')
  .replace(/<script type="importmap">.*<\/script>\n/, '')
  .replace('/*CSS*/', () => css)
  .replace('/*JS*/', () => offJs);
const offDoc = readFileSync('src/index.html', 'utf8').replace('<!--BODY-->', () => offBody.replace(/^<title>.*<\/title>\n/, ''));
writeFileSync('dist/MidsummerMotors-offline.html', offDoc);
console.log(`built dist/MidsummerMotors-offline.html (${(offDoc.length / 1024).toFixed(0)} KB)`);
