import http from 'node:http';
import { readFile, mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, 'public');
const DEFAULT_DATA_FILE = path.join(ROOT, 'data', 'leaderboard.json');
const MAX_BODY_BYTES = 4096;
const MAX_ENTRIES = 50;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
};

function json(res, status, payload) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  res.end(JSON.stringify(payload));
}

async function loadEntries(dataFile) {
  try {
    const parsed = JSON.parse(await readFile(dataFile, 'utf8'));
    return Array.isArray(parsed) ? parsed.filter((entry) => entry && Number.isInteger(entry.score)) : [];
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function saveEntries(dataFile, entries) {
  await mkdir(path.dirname(dataFile), { recursive: true });
  const tempFile = `${dataFile}.tmp`;
  await writeFile(tempFile, `${JSON.stringify(entries, null, 2)}\n`, 'utf8');
  await rename(tempFile, dataFile);
}

function sortEntries(entries) {
  return [...entries].sort((a, b) => b.score - a.score || b.territory - a.territory || a.createdAt.localeCompare(b.createdAt));
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error('Request body is too large.'), { status: 413 });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw Object.assign(new Error('Send a valid JSON object.'), { status: 400 });
  }
}

export function createAppServer({ dataFile = DEFAULT_DATA_FILE, publicDir = PUBLIC_DIR } = {}) {
  const pendingWrites = new Map();
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (url.pathname === '/api/health' && req.method === 'GET') {
        return json(res, 200, { ok: true, service: 'territory-trail-api' });
      }
      if (url.pathname === '/api/leaderboard' && req.method === 'GET') {
        const entries = sortEntries(await loadEntries(dataFile)).slice(0, 10);
        return json(res, 200, { entries });
      }
      if (url.pathname === '/api/scores' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const name = typeof body.name === 'string'
          ? body.name.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 18)
          : '';
        const score = body.score;
        const territory = body.territory;
        const captures = body.captures;
        if (!name || !Number.isSafeInteger(score) || score < 0 || score > 10_000_000
          || !Number.isInteger(territory) || territory < 0 || territory > 100
          || !Number.isSafeInteger(captures) || captures < 0 || captures > 1_000_000) {
          return json(res, 400, { error: 'Name, score, territory, or capture total is invalid.' });
        }
        const previous = pendingWrites.get(dataFile) ?? Promise.resolve();
        const saving = previous.catch(() => {}).then(async () => {
          const entries = await loadEntries(dataFile);
          const entry = {
            id: globalThis.crypto.randomUUID(),
            name,
            score,
            territory,
            captures,
            createdAt: new Date().toISOString(),
          };
          const updated = sortEntries([...entries, entry]).slice(0, MAX_ENTRIES);
          await saveEntries(dataFile, updated);
          return { entry, entries: updated.slice(0, 10) };
        });
        pendingWrites.set(dataFile, saving);
        try {
          return json(res, 201, await saving);
        } finally {
          if (pendingWrites.get(dataFile) === saving) pendingWrites.delete(dataFile);
        }
      }
      if (url.pathname.startsWith('/api/')) {
        return json(res, 404, { error: 'API route not found.' });
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        return json(res, 405, { error: 'Method not allowed.' });
      }

      let requested;
      try {
        requested = decodeURIComponent(url.pathname);
      } catch {
        return json(res, 400, { error: 'Invalid URL path.' });
      }
      if (requested === '/') requested = '/index.html';
      const filePath = path.resolve(publicDir, `.${requested}`);
      if (filePath !== publicDir && !filePath.startsWith(`${path.resolve(publicDir)}${path.sep}`)) {
        return json(res, 403, { error: 'Forbidden.' });
      }
      let content;
      try {
        content = await readFile(filePath);
      } catch (error) {
        if (error.code === 'ENOENT' || error.code === 'EISDIR') return json(res, 404, { error: 'Not found.' });
        throw error;
      }
      res.writeHead(200, {
        'content-type': TYPES[path.extname(filePath)] ?? 'application/octet-stream',
        'cache-control': path.basename(filePath) === 'service-worker.js' ? 'no-cache' : 'public, max-age=300',
        'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; manifest-src 'self'; worker-src 'self'",
      });
      res.end(req.method === 'HEAD' ? undefined : content);
    } catch (error) {
      if (error.status) return json(res, error.status, { error: error.message });
      console.error(error);
      return json(res, 500, { error: 'Server error.' });
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 4173);
  const host = process.env.HOST || '0.0.0.0';
  const server = createAppServer();
  server.listen(port, host, () => console.log(`Territory Trail listening on http://${host}:${port}`));
}
