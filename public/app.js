import { areaStats, captureRegion, cellIndex, createBoard, paintRect } from './game-engine.js';

const canvas = document.querySelector('#game-canvas');
const ctx = canvas?.getContext('2d');
const ui = {
  score: document.querySelector('#score-value'),
  percent: document.querySelector('#territory-value'),
  progress: document.querySelector('#territory-progress'),
  progressTrack: document.querySelector('.progress-track'),
  captures: document.querySelector('#captures-value'),
  eliminations: document.querySelector('#eliminations-value'),
  best: document.querySelector('#best-value'),
  cells: document.querySelector('#cells-value'),
  rook: document.querySelector('#rook-value'),
  kit: document.querySelector('#kit-value'),
  status: document.querySelector('#game-status'),
  roundPill: document.querySelector('#round-pill'),
  startOverlay: document.querySelector('#start-overlay'),
  startButton: document.querySelector('#start-button'),
  pauseOverlay: document.querySelector('#pause-overlay'),
  roundOverlay: document.querySelector('#round-overlay'),
  roundKicker: document.querySelector('#round-kicker'),
  roundTitle: document.querySelector('#round-title'),
  roundResult: document.querySelector('#round-result'),
  playerName: document.querySelector('#player-name'),
  save: document.querySelector('#save-score'),
  feedback: document.querySelector('#save-feedback'),
  leaderboard: document.querySelector('#leaderboard-panel'),
  leaderboardList: document.querySelector('#leaderboard-list'),
  pauseButton: document.querySelector('#pause-button'),
};

const COLS = 32;
const ROWS = 21;
const WIN_PERCENT = 50;
const KILL_BOUNTY = 100;
const DIRS = {
  up: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
};
const OWNERS = {
  0: { fill: '#192832', edge: '#263943' },
  1: { fill: '#43bd82', edge: '#a7f2c0' },
  2: { fill: '#fa7476', edge: '#ffb0a2' },
  3: { fill: '#eab45e', edge: '#ffdb8f' },
};
const BEST_KEY = 'territory-trail-best-v1';
const LEADERBOARD_KEY = 'territory-trail-scores-v1';

function readLocalScores() {
  try {
    const scores = JSON.parse(localStorage.getItem(LEADERBOARD_KEY) || '[]');
    if (!Array.isArray(scores)) return [];
    return scores
      .filter((entry) => entry && typeof entry.name === 'string' && Number.isSafeInteger(entry.score))
      .sort((a, b) => b.score - a.score || b.territory - a.territory || String(a.createdAt).localeCompare(String(b.createdAt)))
      .slice(0, 50);
  } catch {
    return [];
  }
}

function readBestScore() {
  try {
    const value = Number(localStorage.getItem(BEST_KEY));
    return Number.isSafeInteger(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

const state = {
  board: null,
  player: null,
  bots: [],
  captures: 0,
  eliminations: 0,
  best: readBestScore(),
  started: false,
  gameOver: false,
  paused: false,
  scoreSaved: false,
  resumeAfterLeaderboard: false,
  accumulator: 0,
  lastFrame: 0,
  touchStart: null,
  dpr: 1,
  width: 0,
  height: 0,
};

function makeActor(owner, x, y, dir, stepMs) {
  return { owner, x, y, dir, stepMs, elapsed: 0, trail: [] };
}

function currentScore() {
  return state.captures * 10 + state.eliminations * KILL_BOUNTY;
}

function startRound() {
  state.board = createBoard(COLS, ROWS);
  const playerX = 4;
  const playerY = 9;
  paintRect(state.board, 1, playerX, playerY, 4, 4);
  paintRect(state.board, 2, 23, 3, 4, 4);
  paintRect(state.board, 3, 23, 14, 4, 4);
  state.player = makeActor(1, playerX + 2, playerY + 2, 'right', 125);
  state.bots = [
    makeActor(2, 25, 5, 'left', 205),
    makeActor(3, 25, 16, 'left', 225),
  ];
  state.captures = 0;
  state.eliminations = 0;
  state.started = false;
  state.gameOver = false;
  state.paused = false;
  state.scoreSaved = false;
  state.resumeAfterLeaderboard = false;
  state.accumulator = 0;
  ui.roundOverlay.classList.add('hidden');
  ui.startOverlay.classList.remove('hidden');
  ui.pauseOverlay.classList.add('hidden');
  ui.leaderboard.classList.add('hidden');
  ui.pauseButton.textContent = 'Pause';
  ui.roundPill.textContent = 'READY';
  ui.roundPill.classList.remove('is-live', 'is-paused');
  ui.feedback.textContent = '';
  ui.save.disabled = false;
  ui.save.textContent = 'Save score';
  ui.status.textContent = 'Choose a direction to begin.';
  refreshStats();
  draw();
}

function refreshStats() {
  if (!state.board) return;
  const stats = areaStats(state.board, 1);
  ui.score.textContent = String(currentScore()).padStart(5, '0');
  ui.percent.textContent = `${stats.percent}%`;
  ui.progress.style.width = `${stats.percent}%`;
  ui.progressTrack.setAttribute('aria-valuenow', String(stats.percent));
  ui.captures.textContent = String(state.captures);
  ui.eliminations.textContent = String(state.eliminations);
  ui.best.textContent = state.best.toLocaleString();
  ui.cells.textContent = String(stats.owned);
  ui.rook.textContent = `${areaStats(state.board, 2).percent}%`;
  ui.kit.textContent = `${areaStats(state.board, 3).percent}%`;
}

function opposite(a, b) {
  return DIRS[a].x + DIRS[b].x === 0 && DIRS[a].y + DIRS[b].y === 0;
}

function changeDirection(direction) {
  if (state.gameOver || state.paused || !DIRS[direction]) return;
  if (!state.started) {
    state.player.dir = direction;
    state.started = true;
    ui.startOverlay.classList.add('hidden');
    ui.roundPill.textContent = 'LIVE';
    ui.roundPill.classList.add('is-live');
    ui.status.textContent = 'Go! Close a loop to claim ground.';
    return;
  }
  if (!opposite(state.player.dir, direction)) state.player.dir = direction;
}

function getNext(actor) {
  const delta = DIRS[actor.dir];
  return { x: actor.x + delta.x, y: actor.y + delta.y };
}

function endRound(message, won = false) {
  if (state.gameOver) return;
  state.gameOver = true;
  state.paused = false;
  ui.startOverlay.classList.add('hidden');
  ui.pauseOverlay.classList.add('hidden');
  ui.roundPill.textContent = won ? 'CLAIMED' : 'FINISHED';
  ui.roundPill.classList.remove('is-live', 'is-paused');
  const stats = areaStats(state.board, 1);
  const score = currentScore();
  const newBest = score > state.best;
  if (newBest) {
    state.best = score;
    try { localStorage.setItem(BEST_KEY, String(score)); } catch { /* Local score is optional. */ }
  }
  refreshStats();
  ui.roundKicker.textContent = won ? 'ARENA DOMINATED' : 'RUN COMPLETE';
  ui.roundTitle.textContent = message;
  ui.roundResult.textContent = `${score.toLocaleString()} points · ${stats.percent}% of the field · ${state.captures} cells claimed · ${state.eliminations} rival${state.eliminations === 1 ? '' : 's'} tagged${newBest ? ' · NEW PERSONAL BEST' : ''}`;
  ui.roundOverlay.classList.remove('hidden');
  ui.pauseButton.textContent = 'Pause';
  ui.status.textContent = won ? 'Arena claimed! You own the field.' : 'Run complete. Ready for another?';
  ui.feedback.textContent = '';
}

function checkForVictory() {
  const percent = areaStats(state.board, 1).percent;
  if (percent >= WIN_PERCENT) {
    endRound('You own the arena!', true);
    return true;
  }
  return false;
}

function respawnBot(bot) {
  bot.trail.length = 0;
  const owned = [];
  for (let i = 0; i < state.board.cells.length; i += 1) {
    if (state.board.cells[i] === bot.owner) owned.push(i);
  }
  if (!owned.length) {
    const x = bot.owner === 2 ? 23 : 23;
    const y = bot.owner === 2 ? 3 : 14;
    paintRect(state.board, bot.owner, x, y, 4, 4);
    for (let row = y; row < y + 4; row += 1) {
      for (let col = x; col < x + 4; col += 1) owned.push(cellIndex(state.board, col, row));
    }
  }
  const index = owned[Math.floor(Math.random() * owned.length)];
  bot.x = index % COLS;
  bot.y = Math.floor(index / COLS);
  bot.dir = ['up', 'right', 'down', 'left'][Math.floor(Math.random() * 4)];
}

function chooseBotDirection(bot) {
  const order = ['up', 'right', 'down', 'left'].filter((direction) => !opposite(bot.dir, direction));
  const scored = [];
  for (const direction of order) {
    const delta = DIRS[direction];
    const x = bot.x + delta.x;
    const y = bot.y + delta.y;
    if (x < 0 || x >= COLS || y < 0 || y >= ROWS) continue;
    const index = cellIndex(state.board, x, y);
    const owner = state.board.cells[index];
    let score = Math.random() * 0.7;
    if (owner === bot.owner) score += bot.trail.length >= 3 ? 13 : -5;
    else if (owner !== 0) score -= 24;
    else score += bot.trail.length >= 3 ? 2 : 4.2;
    if (state.player.trail.includes(index)) score -= 100;
    if (bot.trail.includes(index)) score -= 100;
    if (direction === bot.dir) score += Math.random() < 0.72 ? 2 : -0.35;
    scored.push({ direction, score });
  }
  if (!scored.length) return null;
  scored.sort((a, b) => b.score - a.score);
  return scored[0].direction;
}

function stepBot(bot) {
  const chosen = chooseBotDirection(bot);
  if (!chosen) {
    respawnBot(bot);
    return;
  }
  bot.dir = chosen;
  const next = getNext(bot);
  const index = cellIndex(state.board, next.x, next.y);
  if (state.player.trail.includes(index)) {
    endRound('A rival crossed your trail.');
    return;
  }
  const owner = state.board.cells[index];
  if (owner === bot.owner && bot.trail.length >= 3) {
    bot.x = next.x;
    bot.y = next.y;
    const amount = captureRegion(state.board, bot.owner, bot.trail);
    bot.trail.length = 0;
    ui.status.textContent = amount > 0 ? 'A rival just claimed new ground.' : 'A rival closed a loop.';
    return;
  }
  if (owner !== 0) {
    respawnBot(bot);
    return;
  }
  if (bot.trail.includes(index)) {
    respawnBot(bot);
    return;
  }
  bot.trail.push(index);
  bot.x = next.x;
  bot.y = next.y;
}

function stepPlayer() {
  const next = getNext(state.player);
  if (next.x < 0 || next.x >= COLS || next.y < 0 || next.y >= ROWS) {
    endRound('You ran out of room.');
    return;
  }
  const index = cellIndex(state.board, next.x, next.y);
  let recovered = 0;
  let eliminated = 0;
  for (const bot of state.bots) {
    if (!bot.trail.includes(index)) continue;
    for (const trailCell of bot.trail) {
      if (state.board.cells[trailCell] === 0) {
        state.board.cells[trailCell] = 1;
        recovered += 1;
      }
    }
    bot.trail.length = 0;
    eliminated += 1;
    respawnBot(bot);
  }
  if (eliminated) {
    state.captures += recovered;
    state.eliminations += eliminated;
    ui.status.textContent = `Trail clipped! +${recovered} cells · +${eliminated * KILL_BOUNTY} bounty.`;
  }

  const owner = state.board.cells[index];
  if (owner !== 0 && owner !== 1) {
    endRound('You wandered into rival turf.');
    return;
  }
  if (state.player.trail.includes(index)) {
    endRound('You crossed your own open trail.');
    return;
  }
  state.player.x = next.x;
  state.player.y = next.y;
  if (owner === 1) {
    if (state.player.trail.length) {
      const amount = captureRegion(state.board, 1, state.player.trail);
      state.captures += amount;
      state.player.trail.length = 0;
      if (!eliminated) ui.status.textContent = amount > 0 ? `Loop closed. +${amount} cells claimed.` : 'Loop closed. Make a wider one next time.';
      refreshStats();
      if (checkForVictory()) return;
    } else if (eliminated) {
      refreshStats();
      if (checkForVictory()) return;
    }
  } else {
    state.player.trail.push(index);
    if (eliminated) refreshStats();
  }
}

function update(delta) {
  if (state.gameOver || state.paused || !state.started) return;
  state.player.elapsed += delta;
  if (state.player.elapsed >= state.player.stepMs) {
    state.player.elapsed %= state.player.stepMs;
    stepPlayer();
  }
  if (state.gameOver) return;
  for (const bot of state.bots) {
    bot.elapsed += delta;
    if (bot.elapsed >= bot.stepMs) {
      bot.elapsed %= bot.stepMs;
      stepBot(bot);
      if (state.gameOver) return;
    }
  }
}

function roundedRect(x, y, width, height, radius) {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, width, height, radius);
  else ctx.rect(x, y, width, height);
  ctx.fill();
}

function drawActor(actor, cellW, cellH, isPlayer) {
  const centerX = (actor.x + 0.5) * cellW;
  const centerY = (actor.y + 0.5) * cellH;
  const radius = Math.min(cellW, cellH) * 0.34;
  ctx.save();
  ctx.fillStyle = isPlayer ? '#f3fff5' : '#fff8ef';
  ctx.strokeStyle = OWNERS[actor.owner].edge;
  ctx.lineWidth = Math.max(1.5, Math.min(cellW, cellH) * 0.1);
  ctx.shadowColor = OWNERS[actor.owner].fill;
  ctx.shadowBlur = isPlayer ? 12 : 7;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = OWNERS[actor.owner].fill;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius * 0.38, 0, Math.PI * 2);
  ctx.fill();
  const direction = DIRS[actor.dir];
  const tipX = centerX + direction.x * radius * 1.45;
  const tipY = centerY + direction.y * radius * 1.45;
  ctx.fillStyle = '#f3fff5';
  ctx.beginPath();
  ctx.arc(tipX, tipY, Math.max(1.1, radius * 0.16), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function draw() {
  if (!ctx || !state.board || !state.width || !state.height) return;
  const ratio = state.dpr;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, state.width, state.height);
  const backdrop = ctx.createLinearGradient(0, 0, state.width, state.height);
  backdrop.addColorStop(0, '#14232c');
  backdrop.addColorStop(1, '#101b23');
  ctx.fillStyle = backdrop;
  ctx.fillRect(0, 0, state.width, state.height);
  const cellW = state.width / COLS;
  const cellH = state.height / ROWS;
  const gap = Math.max(0.75, Math.min(cellW, cellH) * 0.075);
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      const index = cellIndex(state.board, x, y);
      const owner = state.board.cells[index];
      const palette = OWNERS[owner];
      ctx.fillStyle = owner === 0 && (x + y) % 2 === 0 ? '#1b2b34' : palette.fill;
      roundedRect(x * cellW + gap / 2, y * cellH + gap / 2, cellW - gap, cellH - gap, Math.min(cellW, cellH) * 0.16);
      if (owner !== 0 && ((x * 3 + y) % 9 === 0)) {
        ctx.fillStyle = 'rgba(255,255,255,.11)';
        roundedRect(x * cellW + cellW * 0.2, y * cellH + cellH * 0.19, cellW * 0.16, cellH * 0.16, 2);
      }
    }
  }
  for (const actor of [...state.bots, state.player]) {
    if (!actor.trail.length) continue;
    ctx.save();
    ctx.shadowColor = OWNERS[actor.owner].edge;
    ctx.shadowBlur = 8;
    ctx.fillStyle = actor.owner === 1 ? '#effff2' : OWNERS[actor.owner].edge;
    for (const index of actor.trail) {
      const x = index % COLS;
      const y = Math.floor(index / COLS);
      roundedRect(x * cellW + cellW * 0.23, y * cellH + cellH * 0.23, cellW * 0.54, cellH * 0.54, Math.min(cellW, cellH) * 0.23);
    }
    ctx.restore();
  }
  for (const bot of state.bots) drawActor(bot, cellW, cellH, false);
  drawActor(state.player, cellW, cellH, true);
}

function frame(now) {
  if (!state.lastFrame) state.lastFrame = now;
  const delta = Math.min(80, now - state.lastFrame);
  state.lastFrame = now;
  state.accumulator += delta;
  const quantum = 40;
  while (state.accumulator >= quantum) {
    update(quantum);
    state.accumulator -= quantum;
  }
  draw();
  requestAnimationFrame(frame);
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  state.dpr = Math.min(window.devicePixelRatio || 1, 2);
  state.width = rect.width;
  state.height = rect.height;
  canvas.width = Math.round(rect.width * state.dpr);
  canvas.height = Math.round(rect.height * state.dpr);
  draw();
}

async function loadLeaderboard() {
  const entries = readLocalScores().slice(0, 10);
  ui.leaderboardList.replaceChildren();
  if (!entries.length) {
    const empty = document.createElement('li');
    empty.className = 'leaderboard-empty';
    empty.textContent = 'No scores yet. Make the first big loop.';
    ui.leaderboardList.append(empty);
    return;
  }
  entries.forEach((entry, index) => {
    const item = document.createElement('li');
    const rank = document.createElement('span');
    rank.className = 'leaderboard-rank';
    rank.textContent = String(index + 1).padStart(2, '0');
    const name = document.createElement('span');
    name.className = 'leaderboard-name';
    name.textContent = entry.name;
    const score = document.createElement('span');
    score.className = 'leaderboard-score';
    score.textContent = Number(entry.score).toLocaleString();
    item.append(rank, name, score);
    ui.leaderboardList.append(item);
  });
}

async function saveScore() {
  if (!state.gameOver) return;
  if (state.scoreSaved) {
    ui.feedback.textContent = 'This run is already on the board.';
    return;
  }
  const name = ui.playerName.value.trim().slice(0, 18) || 'Trailblazer';
  const score = currentScore();
  const territory = areaStats(state.board, 1).percent;
  ui.save.disabled = true;
  ui.feedback.textContent = 'Saving run on this device…';
  try {
    const entry = {
      id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
      name,
      score,
      territory,
      captures: state.captures,
      createdAt: new Date().toISOString(),
    };
    const scores = [...readLocalScores(), entry]
      .sort((a, b) => b.score - a.score || b.territory - a.territory || a.createdAt.localeCompare(b.createdAt))
      .slice(0, 50);
    localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(scores));
    state.scoreSaved = true;
    ui.feedback.textContent = 'Saved on this device.';
    ui.save.textContent = 'Score saved';
    await loadLeaderboard();
  } catch {
    ui.feedback.textContent = 'Could not save this score. Check browser storage settings.';
    ui.save.disabled = false;
  }
}

function togglePause() {
  if (state.gameOver || !state.started || !ui.leaderboard.classList.contains('hidden')) return;
  state.paused = !state.paused;
  ui.pauseOverlay.classList.toggle('hidden', !state.paused);
  ui.pauseButton.textContent = state.paused ? 'Resume' : 'Pause';
  ui.roundPill.textContent = state.paused ? 'PAUSED' : 'LIVE';
  ui.roundPill.classList.toggle('is-paused', state.paused);
  ui.roundPill.classList.toggle('is-live', !state.paused);
  ui.status.textContent = state.paused ? 'Round paused.' : 'Round resumed.';
}

function openLeaderboard() {
  state.resumeAfterLeaderboard = state.started && !state.gameOver && !state.paused;
  if (state.resumeAfterLeaderboard) {
    state.paused = true;
    ui.pauseOverlay.classList.add('hidden');
    ui.pauseButton.textContent = 'Resume';
    ui.roundPill.textContent = 'PAUSED';
    ui.roundPill.classList.remove('is-live');
    ui.roundPill.classList.add('is-paused');
  }
  ui.leaderboard.classList.remove('hidden');
  loadLeaderboard();
}

function closeLeaderboard() {
  ui.leaderboard.classList.add('hidden');
  if (state.resumeAfterLeaderboard && !state.gameOver) {
    state.paused = false;
    ui.pauseButton.textContent = 'Pause';
    ui.roundPill.textContent = 'LIVE';
    ui.roundPill.classList.remove('is-paused');
    ui.roundPill.classList.add('is-live');
    ui.status.textContent = 'Round resumed.';
  }
  state.resumeAfterLeaderboard = false;
}

document.querySelector('#restart-button').addEventListener('click', startRound);
document.querySelector('#play-again').addEventListener('click', startRound);
ui.startButton.addEventListener('click', () => changeDirection('right'));
ui.pauseButton.addEventListener('click', togglePause);
ui.save.addEventListener('click', saveScore);
document.querySelector('#leaderboard-open').addEventListener('click', openLeaderboard);
document.querySelector('#leaderboard-close').addEventListener('click', closeLeaderboard);

document.querySelectorAll('[data-direction]').forEach((button) => {
  const steer = (event) => {
    event.preventDefault();
    changeDirection(button.dataset.direction);
  };
  button.addEventListener('pointerdown', steer);
  button.addEventListener('click', (event) => {
    if (event.detail === 0) steer(event);
  });
});

window.addEventListener('keydown', (event) => {
  if (event.target instanceof HTMLInputElement) return;
  if (event.key === 'Escape' && !ui.leaderboard.classList.contains('hidden')) {
    closeLeaderboard();
    return;
  }
  const keyMap = { ArrowUp: 'up', w: 'up', W: 'up', ArrowRight: 'right', d: 'right', D: 'right', ArrowDown: 'down', s: 'down', S: 'down', ArrowLeft: 'left', a: 'left', A: 'left' };
  if (keyMap[event.key]) {
    event.preventDefault();
    changeDirection(keyMap[event.key]);
  } else if (event.key === ' ' || event.key === 'Escape') {
    event.preventDefault();
    togglePause();
  } else if (event.key.toLowerCase() === 'r' && !event.ctrlKey && !event.metaKey) {
    startRound();
  } else if (event.key === 'Enter' && !state.started && !state.gameOver) {
    event.preventDefault();
    changeDirection('right');
  }
});

canvas.addEventListener('pointerdown', (event) => {
  state.touchStart = { x: event.clientX, y: event.clientY };
  canvas.setPointerCapture?.(event.pointerId);
});
canvas.addEventListener('pointerup', (event) => {
  if (!state.touchStart) return;
  const dx = event.clientX - state.touchStart.x;
  const dy = event.clientY - state.touchStart.y;
  state.touchStart = null;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 14) return;
  if (Math.abs(dx) > Math.abs(dy)) changeDirection(dx > 0 ? 'right' : 'left');
  else changeDirection(dy > 0 ? 'down' : 'up');
});
canvas.addEventListener('pointercancel', () => { state.touchStart = null; });
window.addEventListener('resize', resizeCanvas);
window.addEventListener('blur', () => {
  if (state.started && !state.gameOver && !state.paused) togglePause();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.started && !state.gameOver && !state.paused) togglePause();
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register(new URL('./service-worker.js', import.meta.url)).catch(() => {}));
}

startRound();
if ('ResizeObserver' in window) new ResizeObserver(resizeCanvas).observe(canvas);
else resizeCanvas();
loadLeaderboard();
requestAnimationFrame(frame);
