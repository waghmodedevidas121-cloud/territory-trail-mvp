import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createAppServer } from '../server.js';

let server;
let base;
let tempDir;

before(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), 'territory-trail-'));
  server = createAppServer({ dataFile: path.join(tempDir, 'scores.json') });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server?.listening) await new Promise((resolve) => server.close(resolve));
  if (tempDir) await rm(tempDir, { recursive: true, force: true });
});

test('health check and static app shell respond', async () => {
  const health = await fetch(`${base}/api/health`).then((response) => response.json());
  assert.equal(health.ok, true);
  const app = await fetch(base);
  assert.equal(app.status, 200);
  assert.match(await app.text(), /Territory Trail/);
});

test('scores validate input, sanitize names, persist, and sort', async () => {
  const invalid = await fetch(`${base}/api/scores`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Bad', score: -1, territory: 30, captures: 2 }),
  });
  assert.equal(invalid.status, 400);

  const first = await fetch(`${base}/api/scores`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: '  Ace\nRunner  ', score: 30, territory: 25, captures: 3 }),
  });
  assert.equal(first.status, 201);
  const firstEntry = (await first.json()).entry;
  assert.equal(firstEntry.name, 'AceRunner');

  const second = await fetch(`${base}/api/scores`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Loop Hero', score: 90, territory: 40, captures: 9 }),
  });
  assert.equal(second.status, 201);

  const board = await fetch(`${base}/api/leaderboard`).then((response) => response.json());
  assert.deepEqual(board.entries.map((entry) => entry.name), ['Loop Hero', 'AceRunner']);
  assert.equal(board.entries[1].id, firstEntry.id);
});

test('simultaneous score submissions are serialized without dropping entries', async () => {
  const responses = await Promise.all(Array.from({ length: 8 }, (_, index) => fetch(`${base}/api/scores`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: `Runner ${index}`, score: 100 + index, territory: 30, captures: 10 }),
  })));
  assert.ok(responses.every((response) => response.status === 201));
  const board = await fetch(`${base}/api/leaderboard`).then((response) => response.json());
  assert.equal(board.entries.length, 10);
  assert.equal(new Set(board.entries.map((entry) => entry.id)).size, 10);
  assert.deepEqual(board.entries.map((entry) => entry.score), [107, 106, 105, 104, 103, 102, 101, 100, 90, 30]);
});

test('unknown API routes return JSON 404', async () => {
  const response = await fetch(`${base}/api/nope`);
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error, 'API route not found.');
});
