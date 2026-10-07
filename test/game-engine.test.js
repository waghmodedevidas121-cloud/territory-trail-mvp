import test from 'node:test';
import assert from 'node:assert/strict';
import { areaStats, captureRegion, cellIndex, createBoard, paintRect } from '../public/game-engine.js';

test('closed trail captures only neutral cells sealed away from the boundary', () => {
  const board = createBoard(11, 9);
  const trail = [];
  for (let x = 3; x <= 7; x += 1) {
    trail.push(cellIndex(board, x, 2), cellIndex(board, x, 6));
  }
  for (let y = 3; y <= 5; y += 1) {
    trail.push(cellIndex(board, 3, y), cellIndex(board, 7, y));
  }
  const captured = captureRegion(board, 1, trail);
  assert.equal(captured, 25);
  assert.equal(board.cells[cellIndex(board, 5, 4)], 1);
  assert.equal(board.cells[cellIndex(board, 1, 4)], 0);
  assert.equal(areaStats(board, 1).owned, 25);
});

test('existing territory stays owned and neutral boundary remains reachable', () => {
  const board = createBoard(7, 7);
  paintRect(board, 1, 2, 2, 2, 2);
  const captured = captureRegion(board, 1, [cellIndex(board, 1, 2), cellIndex(board, 1, 3)]);
  assert.equal(captured, 2);
  assert.equal(board.cells[cellIndex(board, 2, 2)], 1);
  assert.equal(board.cells[cellIndex(board, 6, 6)], 0);
});

test('closed trail does not steal existing rival territory', () => {
  const board = createBoard(9, 9);
  const trail = [];
  for (let x = 2; x <= 6; x += 1) trail.push(cellIndex(board, x, 2), cellIndex(board, x, 6));
  for (let y = 3; y <= 5; y += 1) trail.push(cellIndex(board, 2, y), cellIndex(board, 6, y));
  paintRect(board, 2, 4, 4, 1, 1);
  const captured = captureRegion(board, 1, trail);
  assert.equal(captured, 24);
  assert.equal(board.cells[cellIndex(board, 4, 4)], 2);
  assert.equal(board.cells[cellIndex(board, 3, 3)], 1);
});

test('board rejects unusable dimensions and cell lookup rejects out-of-range coordinates', () => {
  assert.throws(() => createBoard(2, 5), RangeError);
  assert.throws(() => createBoard(5.5, 5), RangeError);
  const board = createBoard(5, 5);
  assert.throws(() => cellIndex(board, -1, 0), RangeError);
  assert.throws(() => cellIndex(board, 0, 5), RangeError);
});

test('paintRect validates inputs while safely clipping valid rectangles to the board', () => {
  const board = createBoard(5, 4);
  paintRect(board, 2, 0, 0, 7, 1);
  assert.deepEqual(areaStats(board, 2), { owned: 5, percent: 25 });
  assert.throws(() => paintRect(board, -1, 0, 0, 1, 1), RangeError);
  assert.throws(() => paintRect(board, 1, 0, 0, -1, 1), RangeError);
});

test('capture ignores invalid trail indexes and an empty trail changes no territory', () => {
  const board = createBoard(5, 5);
  assert.equal(captureRegion(board, 1, []), 0);
  assert.equal(captureRegion(board, 1, [-3, 500]), 0);
  assert.equal(areaStats(board, 1).owned, 0);
});
