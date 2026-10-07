import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const readProjectFile = (relativePath) => readFile(path.join(ROOT, relativePath), 'utf8');

test('static page asset URLs remain relative for GitHub Pages repository subpaths', async () => {
  const html = await readProjectFile('public/index.html');
  const manifest = JSON.parse(await readProjectFile('public/manifest.webmanifest'));
  const serviceWorker = await readProjectFile('public/service-worker.js');
  const app = await readProjectFile('public/app.js');

  assert.doesNotMatch(html, /\b(?:src|href)="\//);
  assert.equal(manifest.start_url.startsWith('/'), false);
  assert.equal(manifest.scope.startsWith('/'), false);
  assert.ok(manifest.icons.every((icon) => !icon.src.startsWith('/')));
  assert.match(serviceWorker, /new URL\('\.\/', self\.location\.href\)/);
  assert.match(app, /localStorage\.setItem\(LEADERBOARD_KEY/);
  assert.doesNotMatch(app, /fetch\(['"]\/api\//);
});
