export function createBoard(cols, rows) {
  if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 3 || rows < 3) {
    throw new RangeError('Board dimensions must be integers of at least 3.');
  }
  if (!Number.isSafeInteger(cols * rows)) throw new RangeError('Board area is too large.');
  return { cols, rows, cells: new Uint8Array(cols * rows) };
}

export function cellIndex(board, x, y) {
  if (!board || !Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= board.cols || y >= board.rows) {
    throw new RangeError('Cell coordinates are outside the board.');
  }
  return y * board.cols + x;
}

export function paintRect(board, owner, x, y, width, height) {
  if (!board?.cells || !Number.isInteger(owner) || owner < 0 || owner > 255
    || !Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(width) || !Number.isInteger(height)
    || width < 0 || height < 0) {
    throw new RangeError('Rectangle coordinates, size, or owner are invalid.');
  }
  for (let row = y; row < y + height; row += 1) {
    for (let col = x; col < x + width; col += 1) {
      if (col >= 0 && col < board.cols && row >= 0 && row < board.rows) {
        board.cells[cellIndex(board, col, row)] = owner;
      }
    }
  }
}

/**
 * Closes a player's drawn line and captures neutral cells no longer reachable
 * from the outside. Existing territory remains owned by its current player.
 */
export function captureRegion(board, owner, trail) {
  if (!board?.cells || !Number.isInteger(owner) || owner < 1 || owner > 255 || !Array.isArray(trail)) {
    throw new TypeError('A valid board, non-neutral owner, and trail are required.');
  }
  if (trail.length === 0) return 0;
  const { cols, rows, cells } = board;
  const trailMask = new Uint8Array(cells.length);
  for (const index of trail) {
    if (Number.isInteger(index) && index >= 0 && index < cells.length) trailMask[index] = 1;
  }
  const visited = new Uint8Array(cells.length);
  const queue = new Int32Array(cells.length);
  let head = 0;
  let tail = 0;

  const enqueueIfOpen = (index) => {
    if (!visited[index] && !trailMask[index] && cells[index] === 0) {
      visited[index] = 1;
      queue[tail] = index;
      tail += 1;
    }
  };

  for (let x = 0; x < cols; x += 1) {
    enqueueIfOpen(x);
    enqueueIfOpen((rows - 1) * cols + x);
  }
  for (let y = 1; y < rows - 1; y += 1) {
    enqueueIfOpen(y * cols);
    enqueueIfOpen(y * cols + cols - 1);
  }

  while (head < tail) {
    const index = queue[head];
    head += 1;
    const x = index % cols;
    const y = Math.floor(index / cols);
    if (x > 0) enqueueIfOpen(index - 1);
    if (x < cols - 1) enqueueIfOpen(index + 1);
    if (y > 0) enqueueIfOpen(index - cols);
    if (y < rows - 1) enqueueIfOpen(index + cols);
  }

  let captured = 0;
  for (let index = 0; index < cells.length; index += 1) {
    if (trailMask[index]) {
      if (cells[index] === 0) captured += 1;
      cells[index] = owner;
    } else if (cells[index] === 0 && !visited[index]) {
      cells[index] = owner;
      captured += 1;
    }
  }
  return captured;
}

export function areaStats(board, owner) {
  if (!board?.cells || !board.cells.length || !Number.isInteger(owner) || owner < 0 || owner > 255) {
    throw new TypeError('A valid board and owner are required.');
  }
  let owned = 0;
  for (const cell of board.cells) if (cell === owner) owned += 1;
  return { owned, percent: Math.round((owned / board.cells.length) * 100) };
}
