const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');

const levelEl = document.getElementById('level');
const parEl = document.getElementById('par');
const strokesEl = document.getElementById('strokes');
const scoreEl = document.getElementById('score');
const categoryEl = document.getElementById('category');
const messageEl = document.getElementById('message');
const nextButton = document.getElementById('next');
const restartButton = document.getElementById('restart');
const multiMetaEl = document.getElementById('multiMeta');
const roomCodeHudEl = document.getElementById('roomCode');
const youNameEl = document.getElementById('youName');
const opponentNameEl = document.getElementById('opponentName');
const turnNameEl = document.getElementById('turnName');

const quizModalEl = document.getElementById('quizModal');
const questionLabelEl = document.getElementById('questionLabel');
const answerInputEl = document.getElementById('answerInput');
const submitAnswerBtn = document.getElementById('submitAnswer');
const newQuestionBtn = document.getElementById('newQuestion');

const WORLD_WIDTH = 2550;
const WORLD_HEIGHT = 1750;

const DESKTOP_VIEW = { width: 1180, height: 640 };
const MOBILE_PORTRAIT_VIEW = { width: 900, height: 1280 };
const MOBILE_LANDSCAPE_VIEW = { width: 1140, height: 760 };
const TABLET_PORTRAIT_VIEW = { width: 1040, height: 1380 };
const TABLET_LANDSCAPE_VIEW = { width: 1320, height: 900 };

const MAX_DRAG = 190;
const MIN_DRAG_TO_SHOT = 10;
const STOP_SPEED = 32;
const ROLL_DAMPING = 0.985;
const AIR_DAMPING = 0.999;
const SPIKE_STEP = 28;
const MULTI_POLL_MS = 1100;

function updateCanvasViewport() {
  const isPhone = window.innerWidth <= 768;
  const isTablet = window.innerWidth > 768 && window.innerWidth <= 1200;
  const isPortrait = window.innerHeight > window.innerWidth;

  let target = DESKTOP_VIEW;
  if (isPhone && isPortrait) {
    target = MOBILE_PORTRAIT_VIEW;
  } else if (isPhone) {
    target = MOBILE_LANDSCAPE_VIEW;
  } else if (isTablet && isPortrait) {
    target = TABLET_PORTRAIT_VIEW;
  } else if (isTablet) {
    target = TABLET_LANDSCAPE_VIEW;
  }

  if (canvas.width !== target.width || canvas.height !== target.height) {
    canvas.width = target.width;
    canvas.height = target.height;
    if (typeof alignCameraToBall === 'function') {
      alignCameraToBall();
    }
  }
}

const audioState = {
  ctx: null,
  enabled: false
};

function initAudio() {
  if (audioState.enabled) return;

  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;

  audioState.ctx = new Ctx();
  audioState.enabled = true;
}

function playTone({ freq = 440, duration = 0.12, type = 'sine', gain = 0.05, sweep = 0 }) {
  const ctx = audioState.ctx;
  if (!audioState.enabled || !ctx) return;

  const t0 = ctx.currentTime;
  const t1 = t0 + duration;

  const osc = ctx.createOscillator();
  const amp = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (sweep !== 0) {
    osc.frequency.linearRampToValueAtTime(Math.max(40, freq + sweep), t1);
  }

  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.015);
  amp.gain.exponentialRampToValueAtTime(0.0001, t1);

  osc.connect(amp);
  amp.connect(ctx.destination);

  osc.start(t0);
  osc.stop(t1 + 0.01);
}

function playShotSound(power) {
  const p = clamp(power, 0, 1);
  playTone({ freq: 180 + 160 * p, duration: 0.11, type: 'triangle', gain: 0.06 + 0.03 * p, sweep: 110 });
  playTone({ freq: 120 + 90 * p, duration: 0.17, type: 'sine', gain: 0.03, sweep: -30 });
}

function playCorrectSound() {
  playTone({ freq: 520, duration: 0.08, type: 'sine', gain: 0.05 });
  playTone({ freq: 660, duration: 0.1, type: 'sine', gain: 0.05 });
}

function playWrongSound() {
  playTone({ freq: 260, duration: 0.12, type: 'sawtooth', gain: 0.05, sweep: -90 });
}

function playCheckpointSound() {
  playTone({ freq: 360, duration: 0.07, type: 'triangle', gain: 0.04 });
  playTone({ freq: 450, duration: 0.1, type: 'triangle', gain: 0.04 });
}

function playHazardSound() {
  playTone({ freq: 170, duration: 0.16, type: 'square', gain: 0.06, sweep: -70 });
}

function playHoleCompleteSound() {
  playTone({ freq: 392, duration: 0.1, type: 'sine', gain: 0.05 });
  playTone({ freq: 494, duration: 0.1, type: 'sine', gain: 0.05 });
  playTone({ freq: 587, duration: 0.14, type: 'sine', gain: 0.06 });
}

const trigBank = [
  { expr: 'sin(30°)', answer: 0.5, tolerance: 0.02 },
  { expr: 'sin(45°)', answer: 0.707, tolerance: 0.03 },
  { expr: 'sin(60°)', answer: 0.866, tolerance: 0.03 },
  { expr: 'cos(30°)', answer: 0.866, tolerance: 0.03 },
  { expr: 'cos(45°)', answer: 0.707, tolerance: 0.03 },
  { expr: 'cos(60°)', answer: 0.5, tolerance: 0.02 },
  { expr: 'tan(45°)', answer: 1, tolerance: 0.02 },
  { expr: 'tan(60°)', answer: 1.732, tolerance: 0.04 }
];

const CATEGORY_DEFS = [
  {
    id: 'arith',
    title: 'Базовая арифметика',
    difficulty: 1,
    createQuestion() {
      const mode = randInt(0, 2);
      if (mode === 0) {
        const a = randInt(14, 99);
        const b = randInt(11, 88);
        return { text: `${a} + ${b} = ?`, answer: a + b, tolerance: 0.001 };
      }
      if (mode === 1) {
        const a = randInt(90, 180);
        const b = randInt(16, 70);
        return { text: `${a} - ${b} = ?`, answer: a - b, tolerance: 0.001 };
      }
      const b = randInt(4, 12);
      const ans = randInt(3, 14);
      return { text: `${b * ans} ÷ ${b} = ?`, answer: ans, tolerance: 0.001 };
    }
  },
  {
    id: 'fractions',
    title: 'Дроби',
    difficulty: 2,
    createQuestion() {
      const den = [4, 5, 6, 8, 10][randInt(0, 4)];
      const a = randInt(1, den - 1);
      const b = randInt(1, den - 1);
      return {
        text: `${a}/${den} + ${b}/${den} = ? (десятичное)`,
        answer: (a + b) / den,
        tolerance: 0.03
      };
    }
  },
  {
    id: 'percent',
    title: 'Проценты',
    difficulty: 3,
    createQuestion() {
      const p = [10, 15, 20, 25, 30, 40][randInt(0, 5)];
      const n = randInt(80, 300);
      return { text: `${p}% от ${n} = ?`, answer: (n * p) / 100, tolerance: 0.03 };
    }
  },
  {
    id: 'powers',
    title: 'Степени и корни',
    difficulty: 4,
    createQuestion() {
      if (randInt(0, 1) === 0) {
        const b = randInt(3, 11);
        const e = randInt(2, 3);
        return { text: `${b}^${e} = ?`, answer: b ** e, tolerance: 0.001 };
      }
      const root = randInt(4, 18);
      return { text: `√${root * root} = ?`, answer: root, tolerance: 0.001 };
    }
  },
  {
    id: 'equations',
    title: 'Линейные уравнения',
    difficulty: 5,
    createQuestion() {
      const x = randInt(2, 14);
      const a = randInt(2, 8);
      const b = randInt(4, 32);
      return { text: `${a}x + ${b} = ${a * x + b}. Найди x`, answer: x, tolerance: 0.001 };
    }
  },
  {
    id: 'trig',
    title: 'Тригонометрия',
    difficulty: 6,
    createQuestion() {
      const q = trigBank[randInt(0, trigBank.length - 1)];
      return { text: `${q.expr} = ?`, answer: q.answer, tolerance: q.tolerance };
    }
  }
];

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function buildDiagonalLevel({
  startX,
  startY,
  holeX,
  holeY,
  segments,
  zigzag,
  phase,
  widthBase,
  waterEvery,
  waterShift,
  par
}) {
  const platforms = [];

  for (let index = 0; index < segments; index += 1) {
    const t = segments === 1 ? 0 : index / (segments - 1);
    const centerX =
      lerp(startX + 50, holeX - 70, t) + Math.sin(index * 1.14 + phase) * zigzag * (1 - t * 0.35);
    const centerY = lerp(startY + 65, holeY + 170, t) + Math.cos(index * 0.9 + phase) * 36;
    const width = clamp(widthBase + ((index % 4) - 1.5) * 24, 160, 370);
    const x = clamp(centerX - width * 0.5, 20, WORLD_WIDTH - width - 20);
    const y = clamp(centerY, 110, WORLD_HEIGHT - 120);

    platforms.push({ x: Math.round(x), y: Math.round(y), w: Math.round(width), h: 20 });

    if (index % 4 === 1) {
      const side = index % 8 === 1 ? 1 : -1;
      const assistX = clamp(x + side * (width + 34), 20, WORLD_WIDTH - 150);
      const assistY = clamp(y - 92, 90, WORLD_HEIGHT - 130);
      platforms.push({ x: Math.round(assistX), y: Math.round(assistY), w: 140, h: 18 });
    }
  }

  platforms.push({ x: clamp(holeX - 130, 30, WORLD_WIDTH - 260), y: clamp(holeY + 120, 100, WORLD_HEIGHT - 120), w: 260, h: 20 });

  const water = [];
  for (let index = waterShift; index < segments; index += waterEvery) {
    const source = platforms[Math.min(index, platforms.length - 1)];
    const side = index % 2 === 0 ? -1 : 1;
    const w = 112;
    const h = 82;
    const x = clamp(source.x + (side < 0 ? -w - 22 : source.w + 22), 0, WORLD_WIDTH - w);
    const y = clamp(source.y + 18, 90, WORLD_HEIGHT - h - 50);
    water.push({ x: Math.round(x), y: Math.round(y), w, h });
  }

  return {
    par,
    start: { x: startX, y: startY },
    hole: { x: holeX, y: holeY, r: 20 },
    platforms,
    water
  };
}

const COURSES = {
  arith: [
    buildDiagonalLevel({ startX: 120, startY: 1470, holeX: 2320, holeY: 240, segments: 8, zigzag: 75, phase: 0.2, widthBase: 344, waterEvery: 7, waterShift: 4, par: 3 }),
    buildDiagonalLevel({ startX: 150, startY: 1470, holeX: 2280, holeY: 250, segments: 8, zigzag: 85, phase: 1.1, widthBase: 332, waterEvery: 6, waterShift: 3, par: 3 }),
    buildDiagonalLevel({ startX: 180, startY: 1460, holeX: 2300, holeY: 230, segments: 9, zigzag: 95, phase: 2.1, widthBase: 320, waterEvery: 6, waterShift: 4, par: 4 })
  ],
  fractions: [
    buildDiagonalLevel({ startX: 120, startY: 1470, holeX: 2350, holeY: 240, segments: 9, zigzag: 110, phase: 0.5, widthBase: 310, waterEvery: 6, waterShift: 3, par: 4 }),
    buildDiagonalLevel({ startX: 150, startY: 1460, holeX: 2290, holeY: 240, segments: 9, zigzag: 120, phase: 1.4, widthBase: 302, waterEvery: 6, waterShift: 2, par: 4 }),
    buildDiagonalLevel({ startX: 200, startY: 1460, holeX: 2310, holeY: 220, segments: 10, zigzag: 130, phase: 2.6, widthBase: 295, waterEvery: 5, waterShift: 3, par: 4 })
  ],
  percent: [
    buildDiagonalLevel({ startX: 130, startY: 1470, holeX: 2320, holeY: 230, segments: 10, zigzag: 145, phase: 0.3, widthBase: 288, waterEvery: 5, waterShift: 2, par: 4 }),
    buildDiagonalLevel({ startX: 170, startY: 1460, holeX: 2300, holeY: 220, segments: 10, zigzag: 155, phase: 1.7, widthBase: 282, waterEvery: 5, waterShift: 3, par: 5 }),
    buildDiagonalLevel({ startX: 210, startY: 1460, holeX: 2320, holeY: 205, segments: 10, zigzag: 165, phase: 2.4, widthBase: 275, waterEvery: 5, waterShift: 2, par: 5 })
  ],
  powers: [
    buildDiagonalLevel({ startX: 130, startY: 1470, holeX: 2330, holeY: 215, segments: 10, zigzag: 180, phase: 0.8, widthBase: 268, waterEvery: 5, waterShift: 2, par: 5 }),
    buildDiagonalLevel({ startX: 170, startY: 1460, holeX: 2300, holeY: 210, segments: 10, zigzag: 192, phase: 1.9, widthBase: 262, waterEvery: 4, waterShift: 2, par: 5 }),
    buildDiagonalLevel({ startX: 210, startY: 1460, holeX: 2320, holeY: 195, segments: 11, zigzag: 200, phase: 2.7, widthBase: 255, waterEvery: 4, waterShift: 3, par: 5 })
  ],
  equations: [
    buildDiagonalLevel({ startX: 120, startY: 1470, holeX: 2320, holeY: 205, segments: 11, zigzag: 215, phase: 0.4, widthBase: 248, waterEvery: 4, waterShift: 2, par: 5 }),
    buildDiagonalLevel({ startX: 160, startY: 1460, holeX: 2300, holeY: 198, segments: 11, zigzag: 225, phase: 1.5, widthBase: 242, waterEvery: 4, waterShift: 1, par: 6 }),
    buildDiagonalLevel({ startX: 210, startY: 1460, holeX: 2320, holeY: 188, segments: 11, zigzag: 235, phase: 2.2, widthBase: 238, waterEvery: 4, waterShift: 2, par: 6 })
  ],
  trig: [
    buildDiagonalLevel({ startX: 120, startY: 1470, holeX: 2340, holeY: 198, segments: 11, zigzag: 248, phase: 0.7, widthBase: 230, waterEvery: 4, waterShift: 1, par: 6 }),
    buildDiagonalLevel({ startX: 160, startY: 1460, holeX: 2310, holeY: 188, segments: 11, zigzag: 260, phase: 1.8, widthBase: 225, waterEvery: 3, waterShift: 1, par: 6 }),
    buildDiagonalLevel({ startX: 210, startY: 1460, holeX: 2325, holeY: 180, segments: 12, zigzag: 272, phase: 2.9, widthBase: 220, waterEvery: 3, waterShift: 2, par: 7 })
  ]
};

const game = {
  selectedCategory: null,
  levels: [],
  levelIndex: 0,
  currentPar: 4,
  strokes: 0,
  score: 0,
  lives: 0,
  won: false,
  dragging: false,
  shotUnlocked: false,
  swingTime: 0,
  lastShotAngle: 0,
  pointerId: null,
  dragPos: null,
  justStopped: false,
  currentQuestion: null,
  settings: {
    gravity: 1150,
    shotSpeed: 1380,
    restitution: 0.58,
    spikeHeight: 24,
    waterScale: 0.75
  },
  ball: { x: 0, y: 0, r: 11, vx: 0, vy: 0, grounded: false },
  camera: { x: 0, y: 0 },
  checkpoint: { x: 0, y: 0 },
  start: { x: 0, y: 0 },
  multiplayer: {
    enabled: false,
    roomCode: '',
    playerId: '',
    players: [],
    turnPlayerId: '',
    statsByPlayer: {},
    revision: 0,
    pollTimer: null,
    initializing: false
  },
  lastTime: performance.now()
};

function randInt(min, max) {
  return Math.floor(Math.random() * (max + 1 - min) + min);
}

function setMessage(text) {
  messageEl.textContent = text;
}

function isMultiplayer() {
  return game.multiplayer.enabled;
}

function getPlayerById(playerId) {
  return game.multiplayer.players.find((player) => player.id === playerId) || null;
}

function localPlayer() {
  return getPlayerById(game.multiplayer.playerId);
}

function opponentPlayer() {
  return game.multiplayer.players.find((player) => player.id !== game.multiplayer.playerId) || null;
}

function currentTurnPlayer() {
  return getPlayerById(game.multiplayer.turnPlayerId);
}

function isMyTurn() {
  return !isMultiplayer() || game.multiplayer.turnPlayerId === game.multiplayer.playerId;
}

function getPlayerStats(playerId) {
  if (!playerId) return { score: 0, lives: 0 };
  if (!game.multiplayer.statsByPlayer[playerId]) {
    game.multiplayer.statsByPlayer[playerId] = { score: 0, lives: 0 };
  }
  return game.multiplayer.statsByPlayer[playerId];
}

function refreshScoreHud() {
  if (!isMultiplayer()) {
    scoreEl.textContent = String(game.score);
    return;
  }

  const mine = getPlayerStats(game.multiplayer.playerId).score;
  const rival = getPlayerStats(opponentPlayer()?.id).score;
  scoreEl.textContent = `${mine}:${rival}`;
}

function applyTurnStatsToGame() {
  if (!isMultiplayer()) return;
  const stats = getPlayerStats(game.multiplayer.turnPlayerId);
  game.score = Math.max(0, Math.round(stats.score));
  game.lives = Math.max(0, Math.round(stats.lives));
  refreshScoreHud();
}

function updateMultiplayerHud() {
  if (!isMultiplayer()) {
    if (multiMetaEl) multiMetaEl.hidden = true;
    return;
  }

  if (multiMetaEl) multiMetaEl.hidden = false;

  const me = localPlayer();
  const rival = opponentPlayer();
  const turn = currentTurnPlayer();

  if (roomCodeHudEl) roomCodeHudEl.textContent = game.multiplayer.roomCode || '—';
  if (youNameEl) youNameEl.textContent = me?.name || '—';
  if (opponentNameEl) opponentNameEl.textContent = rival?.name || 'ожидание';
  if (turnNameEl) turnNameEl.textContent = turn?.name || '—';
}

function serializeSnapshot() {
  if (!isMultiplayer()) return null;
  return {
    levelIndex: game.levelIndex,
    currentPar: game.currentPar,
    strokes: game.strokes,
    score: game.score,
    lives: game.lives,
    won: game.won,
    dragging: false,
    shotUnlocked: game.shotUnlocked,
    justStopped: game.justStopped,
    ball: { ...game.ball },
    checkpoint: { ...game.checkpoint },
    start: { ...game.start },
    turnPlayerId: game.multiplayer.turnPlayerId,
    statsByPlayer: game.multiplayer.statsByPlayer
  };
}

function applySnapshot(snapshot) {
  if (!snapshot) return;

  if (typeof snapshot.levelIndex === 'number' && snapshot.levelIndex !== game.levelIndex) {
    game.levelIndex = clamp(snapshot.levelIndex, 0, game.levels.length - 1);
    const level = game.levels[game.levelIndex];
    game.start = { ...level.start };
    levelEl.textContent = String(game.levelIndex + 1);
  }

  if (typeof snapshot.currentPar === 'number') {
    game.currentPar = snapshot.currentPar;
    parEl.textContent = String(game.currentPar);
  }

  if (typeof snapshot.strokes === 'number') {
    game.strokes = snapshot.strokes;
    strokesEl.textContent = String(game.strokes);
  }

  if (typeof snapshot.won === 'boolean') {
    game.won = snapshot.won;
  }

  if (typeof snapshot.shotUnlocked === 'boolean') {
    game.shotUnlocked = snapshot.shotUnlocked;
  }

  if (typeof snapshot.justStopped === 'boolean') {
    game.justStopped = snapshot.justStopped;
  }

  if (snapshot.ball) {
    game.ball.x = snapshot.ball.x;
    game.ball.y = snapshot.ball.y;
    game.ball.vx = snapshot.ball.vx;
    game.ball.vy = snapshot.ball.vy;
    game.ball.grounded = Boolean(snapshot.ball.grounded);
  }

  if (snapshot.checkpoint) {
    game.checkpoint = { ...snapshot.checkpoint };
  }

  if (snapshot.start) {
    game.start = { ...snapshot.start };
  }

  if (snapshot.turnPlayerId) {
    game.multiplayer.turnPlayerId = snapshot.turnPlayerId;
  }

  if (snapshot.statsByPlayer && typeof snapshot.statsByPlayer === 'object') {
    game.multiplayer.statsByPlayer = snapshot.statsByPlayer;
  }

  applyTurnStatsToGame();
  updateMultiplayerHud();
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (!response.ok || !data?.ok) {
    throw new Error(data?.error || 'Network error');
  }
  return data;
}

function setTurnPlayer(turnPlayerId) {
  if (!isMultiplayer()) return;
  if (!turnPlayerId) return;
  game.multiplayer.turnPlayerId = turnPlayerId;
  applyTurnStatsToGame();
  updateMultiplayerHud();
}

async function syncRoom({ passTurn = false, allowAnyPlayer = false } = {}) {
  if (!isMultiplayer()) return;

  const payload = {
    roomCode: game.multiplayer.roomCode,
    playerId: game.multiplayer.playerId,
    passTurn,
    allowAnyPlayer,
    snapshot: serializeSnapshot()
  };

  const data = await fetchJson('./api/room/update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  game.multiplayer.revision = data.room.revision || game.multiplayer.revision;
  game.multiplayer.players = data.room.players || game.multiplayer.players;
  setTurnPlayer(data.room.turnPlayerId || game.multiplayer.turnPlayerId);
  updateMultiplayerHud();

  if (!isMyTurn()) {
    closeQuizModal();
    const turn = currentTurnPlayer();
    setMessage(`Ход соперника: ${turn?.name || 'ожидание'}...`);
  } else if (!game.shotUnlocked) {
    openQuizModal('Твой ход. Реши задачу для удара.');
  }
}

async function pollRoomState() {
  if (!isMultiplayer() || game.multiplayer.initializing) return;

  try {
    const data = await fetchJson(
      `./api/room/state?room=${encodeURIComponent(game.multiplayer.roomCode)}&player=${encodeURIComponent(game.multiplayer.playerId)}`
    );
    const room = data.room;

    game.multiplayer.players = room.players || game.multiplayer.players;
    game.multiplayer.revision = room.revision || game.multiplayer.revision;
    if (room.turnPlayerId) {
      game.multiplayer.turnPlayerId = room.turnPlayerId;
    }

    if (room.snapshot) {
      applySnapshot(room.snapshot);
    } else {
      updateMultiplayerHud();
      applyTurnStatsToGame();
    }

    if (!isMyTurn()) {
      closeQuizModal();
      const turn = currentTurnPlayer();
      setMessage(`Ход соперника: ${turn?.name || 'ожидание'}...`);
    } else if (!game.shotUnlocked && !quizModalEl.hidden) {
      setMessage('Твой ход. Реши задачу и сделай удар.');
    }
  } catch (error) {
    setMessage(`Сеть: ${error.message}`);
  }
}

function startMultiplayerPolling() {
  if (!isMultiplayer()) return;
  if (game.multiplayer.pollTimer) {
    clearInterval(game.multiplayer.pollTimer);
  }
  game.multiplayer.pollTimer = setInterval(pollRoomState, MULTI_POLL_MS);
}

function endTurnAndSync(reasonText) {
  if (!isMultiplayer()) return;
  closeQuizModal();
  game.shotUnlocked = false;
  setMessage(reasonText);
  syncRoom({ passTurn: true }).catch((error) => {
    setMessage(`Сеть: ${error.message}`);
  });
}

function setScore(value) {
  game.score = Math.max(0, Math.round(value));
  if (isMultiplayer()) {
    const turnStats = getPlayerStats(game.multiplayer.turnPlayerId);
    turnStats.score = game.score;
  }
  refreshScoreHud();
}

function setLives(value) {
  game.lives = Math.max(0, Math.round(value));
  if (isMultiplayer()) {
    const turnStats = getPlayerStats(game.multiplayer.turnPlayerId);
    turnStats.lives = game.lives;
  }
}

function addLives(value) {
  setLives(game.lives + value);
}

function adjustScore(delta) {
  setScore(game.score + delta);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function scaledRect(rect, scale) {
  const cx = rect.x + rect.w * 0.5;
  const cy = rect.y + rect.h * 0.5;
  const nw = rect.w * scale;
  const nh = rect.h * scale;
  return { x: cx - nw * 0.5, y: cy - nh * 0.5, w: nw, h: nh };
}

function ballSpeed() {
  return Math.hypot(game.ball.vx, game.ball.vy);
}

function worldToScreenX(x) {
  return x - game.camera.x;
}

function worldToScreenY(y) {
  return y - game.camera.y;
}

function getPointerPos(ev) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (ev.clientX - rect.left) * scaleX + game.camera.x,
    y: (ev.clientY - rect.top) * scaleY + game.camera.y
  };
}

function parseAnswerInput(text) {
  const clean = text.trim().replace(',', '.');
  if (!clean) return NaN;

  if (/^-?\d+\/-?\d+$/.test(clean)) {
    const [left, right] = clean.split('/').map(Number);
    if (right === 0) return NaN;
    return left / right;
  }

  return Number(clean);
}

function getDragVector() {
  if (!game.dragPos) return { dx: 0, dy: 0, dist: 0 };

  const rawDx = game.dragPos.x - game.ball.x;
  const rawDy = game.dragPos.y - game.ball.y;
  const rawDist = Math.hypot(rawDx, rawDy);

  if (rawDist === 0) return { dx: 0, dy: 0, dist: 0 };

  const dist = Math.min(rawDist, MAX_DRAG);
  const scale = dist / rawDist;
  return { dx: rawDx * scale, dy: rawDy * scale, dist };
}

function updateSettingsByDifficulty() {
  const d = game.selectedCategory.difficulty;
  game.settings.gravity = 960 + d * 85;
  game.settings.shotSpeed = 1480 - d * 55;
  game.settings.restitution = clamp(0.66 - d * 0.035, 0.42, 0.66);
  game.settings.spikeHeight = 20 + d * 3;
  game.settings.waterScale = 0.72 + d * 0.05;
}

function createQuestion() {
  if (!game.selectedCategory) return null;
  return game.selectedCategory.createQuestion();
}

function openQuizModal(reasonText) {
  if (isMultiplayer() && !isMyTurn()) {
    closeQuizModal();
    return;
  }

  game.shotUnlocked = false;
  game.currentQuestion = createQuestion();

  if (!game.currentQuestion) {
    questionLabelEl.textContent = 'Сначала выбери категорию в меню.';
    quizModalEl.hidden = false;
    setMessage(reasonText);
    return;
  }

  questionLabelEl.textContent = game.currentQuestion.text;
  answerInputEl.value = '';
  quizModalEl.hidden = false;
  setMessage(reasonText);
  setTimeout(() => answerInputEl.focus(), 0);
}

function closeQuizModal() {
  quizModalEl.hidden = true;
}

function onCorrectAnswer() {
  const reward = 8 * game.selectedCategory.difficulty;
  adjustScore(reward);
  addLives(2);
  game.shotUnlocked = true;
  closeQuizModal();
  playCorrectSound();
  setMessage(`Верно! Удар открыт (+${reward} очков, +2 жизни).`);
}

function handleAnswerSubmit() {
  initAudio();

  if (isMultiplayer() && !isMyTurn()) {
    setMessage('Сейчас ход соперника.');
    return;
  }

  if (!game.currentQuestion) return;

  const value = parseAnswerInput(answerInputEl.value);
  if (Number.isNaN(value)) {
    setMessage('Введи число (можно десятичное или дробь).');
    return;
  }

  const diff = Math.abs(value - game.currentQuestion.answer);
  const tolerance = game.currentQuestion.tolerance ?? 0.02;

  if (diff <= tolerance) {
    onCorrectAnswer();
    return;
  }

  adjustScore(-2 * game.selectedCategory.difficulty);
  playWrongSound();
  setMessage('Неверно. Попробуй снова.');
}

function alignCameraToBall() {
  const targetX = clamp(game.ball.x - canvas.width * 0.5, 0, WORLD_WIDTH - canvas.width);
  const targetY = clamp(game.ball.y - canvas.height * 0.68, 0, WORLD_HEIGHT - canvas.height);
  game.camera.x = targetX;
  game.camera.y = targetY;
}

function updateCamera(dt) {
  const targetX = clamp(game.ball.x - canvas.width * 0.5, 0, WORLD_WIDTH - canvas.width);
  const targetY = clamp(game.ball.y - canvas.height * 0.68, 0, WORLD_HEIGHT - canvas.height);
  const follow = 1 - Math.exp(-7 * dt);
  game.camera.x += (targetX - game.camera.x) * follow;
  game.camera.y += (targetY - game.camera.y) * follow;
}

function resetBallToCheckpoint() {
  game.ball.x = game.checkpoint.x;
  game.ball.y = game.checkpoint.y;
  game.ball.vx = 0;
  game.ball.vy = 0;
  game.ball.grounded = false;
  game.dragging = false;
  game.pointerId = null;
  game.dragPos = null;
  game.justStopped = false;
  alignCameraToBall();
}

function loadLevel(index) {
  game.levelIndex = clamp(index, 0, game.levels.length - 1);
  game.strokes = 0;
  game.won = false;

  const level = game.levels[game.levelIndex];
  game.start = { ...level.start };
  game.checkpoint = { ...level.start };

  resetBallToCheckpoint();

  game.currentPar = Math.max(3, level.par + (game.selectedCategory.difficulty >= 5 ? -1 : 0));

  levelEl.textContent = String(game.levelIndex + 1);
  parEl.textContent = String(game.currentPar);
  strokesEl.textContent = '0';
  nextButton.disabled = true;

  openQuizModal('Реши задачу, чтобы сделать удар.');
}

function handleHazardDeath(textWithLife, textNoLife) {
  if (game.lives > 0) {
    addLives(-1);
    resetBallToCheckpoint();
    game.shotUnlocked = !isMultiplayer();
    playHazardSound();
    setMessage(`${textWithLife} Осталось жизней: ${game.lives}.`);
    if (isMultiplayer()) {
      endTurnAndSync('Ход завершён после препятствия.');
    }
    return;
  }

  resetBallToCheckpoint();
  playHazardSound();
  if (isMultiplayer()) {
    endTurnAndSync('Жизни закончились. Ход передан сопернику.');
    return;
  }
  openQuizModal(textNoLife);
}

function resolveBoundaryCollision() {
  const b = game.ball;

  if (b.x < b.r) {
    b.x = b.r;
    if (b.vx < 0) b.vx *= -game.settings.restitution;
  }

  if (b.x > WORLD_WIDTH - b.r) {
    b.x = WORLD_WIDTH - b.r;
    if (b.vx > 0) b.vx *= -game.settings.restitution;
  }

  if (b.y < b.r) {
    b.y = b.r;
    if (b.vy < 0) b.vy *= -game.settings.restitution;
  }

  if (b.y > WORLD_HEIGHT - b.r) {
    b.y = WORLD_HEIGHT - b.r;
    if (b.vy > 0) {
      b.vy *= -game.settings.restitution;
      if (Math.abs(b.vy) < 70) b.vy = 0;
      b.grounded = true;
    }
  }
}

function resolveRectCollision(rect) {
  const b = game.ball;

  const nearestX = clamp(b.x, rect.x, rect.x + rect.w);
  const nearestY = clamp(b.y, rect.y, rect.y + rect.h);
  const dx = b.x - nearestX;
  const dy = b.y - nearestY;
  const distSq = dx * dx + dy * dy;
  const rr = b.r * b.r;

  if (distSq > rr) return false;

  let normalX = 0;
  let normalY = -1;
  let distance = Math.sqrt(distSq);

  if (distance > 0.0001) {
    normalX = dx / distance;
    normalY = dy / distance;
  } else {
    const fromLeft = Math.abs(b.x - rect.x);
    const fromRight = Math.abs(rect.x + rect.w - b.x);
    const fromTop = Math.abs(b.y - rect.y);
    const fromBottom = Math.abs(rect.y + rect.h - b.y);
    const minSide = Math.min(fromLeft, fromRight, fromTop, fromBottom);

    if (minSide === fromLeft) {
      normalX = -1;
      normalY = 0;
    } else if (minSide === fromRight) {
      normalX = 1;
      normalY = 0;
    } else if (minSide === fromTop) {
      normalX = 0;
      normalY = -1;
    } else {
      normalX = 0;
      normalY = 1;
    }
    distance = 0;
  }

  const penetration = b.r - distance;
  b.x += normalX * penetration;
  b.y += normalY * penetration;

  const vn = b.vx * normalX + b.vy * normalY;
  if (vn < 0) {
    b.vx -= (1 + game.settings.restitution) * vn * normalX;
    b.vy -= (1 + game.settings.restitution) * vn * normalY;
  }

  if (normalY < -0.5 && b.vy >= -24) {
    b.grounded = true;
    if (Math.abs(b.vy) < 35) b.vy = 0;
  }

  return true;
}

function finishLevel() {
  game.ball.vx = 0;
  game.ball.vy = 0;
  const delta = game.strokes - game.currentPar;
  const scoreText =
    delta === 0 ? 'в пар' : delta < 0 ? `${Math.abs(delta)} лучше пара` : `${delta} хуже пара`;

  const bonus = 100 + game.selectedCategory.difficulty * 20 + Math.max(0, (game.currentPar - game.strokes) * 25);
  adjustScore(bonus);
  playHoleCompleteSound();

  if (isMultiplayer()) {
    const hasNextLevel = game.levelIndex < game.levels.length - 1;
    if (hasNextLevel) {
      loadLevel(game.levelIndex + 1);
      endTurnAndSync(`Лунка пройдена (${scoreText}). Бонус +${bonus}. Ход сопернику.`);
      return;
    }

    game.won = true;
    setMessage(`Матч завершён! Последняя лунка: ${scoreText}. Бонус +${bonus}.`);
    syncRoom({ passTurn: false, allowAnyPlayer: true }).catch((error) => {
      setMessage(`Сеть: ${error.message}`);
    });
    return;
  }

  game.won = true;
  nextButton.disabled = game.levelIndex >= game.levels.length - 1;

  setMessage(`Лунка пройдена: ${scoreText}. Бонус +${bonus}.`);
}

function update(dt) {
  if (!game.selectedCategory || game.won || game.dragging) return;
  if (isMultiplayer() && !isMyTurn()) return;

  const moving = ballSpeed() > STOP_SPEED;
  if (!moving && !game.ball.grounded) return;

  const level = game.levels[game.levelIndex];
  const b = game.ball;

  const subStep = 1 / 120;
  let remaining = dt;

  while (remaining > 0) {
    const step = Math.min(subStep, remaining);
    remaining -= step;

    b.grounded = false;
    b.vy += game.settings.gravity * step;

    b.x += b.vx * step;
    b.y += b.vy * step;

    resolveBoundaryCollision();

    for (const platform of level.platforms) {
      resolveRectCollision(platform);
    }

    if (b.grounded) {
      b.vx *= ROLL_DAMPING;
    } else {
      b.vx *= AIR_DAMPING;
      b.vy *= AIR_DAMPING;
    }
  }

  for (const pond of level.water) {
    const scaled = scaledRect(pond, game.settings.waterScale);
    if (
      b.x + b.r > scaled.x &&
      b.x - b.r < scaled.x + scaled.w &&
      b.y + b.r > scaled.y &&
      b.y - b.r < scaled.y + scaled.h
    ) {
      handleHazardDeath(
        'Плюх! Вода: потрачена 1 жизнь, респавн с чекпоинта.',
        'Плюх! Возрождение с чекпоинта. Жизни закончились — реши задачу заново.'
      );
      return;
    }
  }

  if (b.y + b.r >= WORLD_HEIGHT - game.settings.spikeHeight) {
    handleHazardDeath(
      'Шипы! Потрачена 1 жизнь, респавн с чекпоинта.',
      'Шипы! Возрождение с чекпоинта. Жизни закончились — реши задачу.'
    );
    return;
  }

  const hole = level.hole;
  const holeDist = Math.hypot(b.x - hole.x, b.y - hole.y);
  if (holeDist < hole.r - 2 && ballSpeed() < 220) {
    finishLevel();
    return;
  }

  if (ballSpeed() <= STOP_SPEED) {
    b.vx = 0;
    b.vy = 0;

    if (Math.hypot(b.x - game.checkpoint.x, b.y - game.checkpoint.y) > 18) {
      game.checkpoint.x = b.x;
      game.checkpoint.y = b.y;
    }

    if (!game.justStopped) {
      playCheckpointSound();
      if (isMultiplayer()) {
        endTurnAndSync('Чекпоинт сохранён. Ход передан сопернику.');
      } else {
        openQuizModal('Чекпоинт сохранён. Реши новую задачу для следующего удара.');
      }
      game.justStopped = true;
    }
  } else {
    game.justStopped = false;
  }
}

function drawPaperBackground() {
  ctx.fillStyle = '#fefcf4';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = 'rgba(0, 0, 0, 0.05)';
  ctx.lineWidth = 1;
  for (let y = 18; y < canvas.height; y += 30) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y + (y % 2 === 0 ? 1 : 0));
    ctx.stroke();
  }
}

function drawRoundedRect(rect, fill, stroke, radius = 10, lineWidth = 2.2) {
  const x = worldToScreenX(rect.x);
  const y = worldToScreenY(rect.y);

  if (x > canvas.width || y > canvas.height || x + rect.w < 0 || y + rect.h < 0) return;

  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + rect.w - radius, y);
  ctx.quadraticCurveTo(x + rect.w, y, x + rect.w, y + radius);
  ctx.lineTo(x + rect.w, y + rect.h - radius);
  ctx.quadraticCurveTo(x + rect.w, y + rect.h, x + rect.w - radius, y + rect.h);
  ctx.lineTo(x + radius, y + rect.h);
  ctx.quadraticCurveTo(x, y + rect.h, x, y + rect.h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();

  ctx.fillStyle = fill;
  ctx.fill();

  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = stroke;
  ctx.stroke();
}

function drawBottomSpikes() {
  const topY = worldToScreenY(WORLD_HEIGHT - game.settings.spikeHeight);
  const bottomY = worldToScreenY(WORLD_HEIGHT);

  if (bottomY < 0 || topY > canvas.height) return;

  ctx.fillStyle = '#8f2020';
  ctx.beginPath();
  ctx.moveTo(worldToScreenX(0), bottomY);

  for (let x = 0; x <= WORLD_WIDTH; x += SPIKE_STEP) {
    const sx = worldToScreenX(x);
    const mid = worldToScreenX(x + SPIKE_STEP * 0.5);
    const nx = worldToScreenX(x + SPIKE_STEP);
    ctx.lineTo(sx, bottomY);
    ctx.lineTo(mid, topY);
    ctx.lineTo(nx, bottomY);
  }

  ctx.closePath();
  ctx.fill();
}

function drawLivesHud() {
  const isTouchLayout = window.innerWidth <= 1200;
  const heartSize = isTouchLayout ? 34 : 24;
  const spacing = Math.round(heartSize * 0.76);
  const maxDraw = isTouchLayout ? 7 : 8;
  const displayedLives = isMultiplayer() ? getPlayerStats(game.multiplayer.playerId).lives : game.lives;
  const heartsToDraw = Math.min(displayedLives, maxDraw);
  const extra = Math.max(0, displayedLives - maxDraw);
  const startX = canvas.width - 14;
  const y = 12 + heartSize * 0.52;

  ctx.save();
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.font = `${heartSize}px system-ui, sans-serif`;

  for (let index = 0; index < heartsToDraw; index += 1) {
    ctx.fillStyle = '#d94a4a';
    ctx.fillText('❤', startX - index * spacing, y);
  }

  if (extra > 0) {
    ctx.fillStyle = '#1f1f1f';
    ctx.font = `${Math.round(heartSize * 0.63)}px Handlee, sans-serif`;
    ctx.fillText(`+${extra}`, startX - heartsToDraw * spacing - 6, y + 1);
  }

  if (displayedLives === 0) {
    ctx.fillStyle = '#555';
    ctx.font = `${Math.round(heartSize * 0.58)}px Handlee, sans-serif`;
    ctx.fillText('0 ❤', startX, y);
  }
  ctx.restore();
}

function drawCourse() {
  const level = game.levels[game.levelIndex];

  drawPaperBackground();

  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, '#e9f7ff');
  gradient.addColorStop(1, '#d4efc8');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (const platform of level.platforms) {
    drawRoundedRect(platform, '#f4ead6', '#2c2c2c', 10, 2.2);
  }

  for (const pond of level.water) {
    drawRoundedRect(scaledRect(pond, game.settings.waterScale), '#9fdbff', '#14568c', 10, 2.2);
  }

  drawBottomSpikes();

  const holeX = worldToScreenX(level.hole.x);
  const holeY = worldToScreenY(level.hole.y);
  if (holeX > -80 && holeX < canvas.width + 80 && holeY > -100 && holeY < canvas.height + 100) {
    ctx.fillStyle = '#1f1d1a';
    ctx.beginPath();
    ctx.arc(holeX, holeY, level.hole.r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#1f1d1a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(holeX, holeY);
    ctx.lineTo(holeX, holeY - 46);
    ctx.stroke();

    ctx.fillStyle = '#d74f4f';
    ctx.beginPath();
    ctx.moveTo(holeX, holeY - 46);
    ctx.lineTo(holeX + 28, holeY - 34);
    ctx.lineTo(holeX, holeY - 24);
    ctx.closePath();
    ctx.fill();
  }

  drawLivesHud();

  ctx.strokeStyle = '#212121';
  ctx.lineWidth = 2.2;
  ctx.strokeRect(1.5, 1.5, canvas.width - 3, canvas.height - 3);
}

function drawAimGuide() {
  if (!game.dragging || !game.dragPos) return;

  const { dx, dy, dist } = getDragVector();
  if (dist <= 0) return;

  const power = dist / MAX_DRAG;
  const startX = worldToScreenX(game.ball.x);
  const startY = worldToScreenY(game.ball.y);
  const endX = worldToScreenX(game.ball.x - dx * 1.8);
  const endY = worldToScreenY(game.ball.y - dy * 1.8);

  ctx.strokeStyle = power > 0.72 ? '#d64949' : '#262626';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineTo(endX, endY);
  ctx.stroke();

  const arrowHead = 12;
  const angle = Math.atan2(endY - startY, endX - startX);

  ctx.beginPath();
  ctx.moveTo(endX, endY);
  ctx.lineTo(
    endX - arrowHead * Math.cos(angle - Math.PI / 6),
    endY - arrowHead * Math.sin(angle - Math.PI / 6)
  );
  ctx.moveTo(endX, endY);
  ctx.lineTo(
    endX - arrowHead * Math.cos(angle + Math.PI / 6),
    endY - arrowHead * Math.sin(angle + Math.PI / 6)
  );
  ctx.stroke();
}

function drawClub() {
  const ballX = worldToScreenX(game.ball.x);
  const ballY = worldToScreenY(game.ball.y);

  let angle = null;
  let distance = 0;

  if (game.dragging && game.dragPos) {
    const { dx, dy, dist } = getDragVector();
    angle = Math.atan2(dy, dx);
    distance = 28 + dist * 0.12;
  } else if (game.swingTime > 0) {
    const progress = 1 - game.swingTime / 0.12;
    angle = game.lastShotAngle + 1.1 - progress * 2.2;
    distance = 28;
  }

  if (angle === null) return;

  const pivotX = ballX + Math.cos(angle) * distance;
  const pivotY = ballY + Math.sin(angle) * distance;
  const shaftLen = 52;

  const tipX = pivotX + Math.cos(angle) * shaftLen;
  const tipY = pivotY + Math.sin(angle) * shaftLen;

  ctx.strokeStyle = '#9c6b30';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(pivotX, pivotY);
  ctx.lineTo(tipX, tipY);
  ctx.stroke();

  ctx.save();
  ctx.translate(tipX, tipY);
  ctx.rotate(angle);
  ctx.fillStyle = '#2b2b2b';
  ctx.fillRect(-7, -6, 16, 12);
  ctx.restore();
}

function drawBall() {
  const b = game.ball;
  const sx = worldToScreenX(b.x);
  const sy = worldToScreenY(b.y);

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(sx, sy, b.r, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#1f1f1f';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(sx, sy, b.r, 0, Math.PI * 2);
  ctx.stroke();
}

function frame(now) {
  const dt = Math.min((now - game.lastTime) / 1000, 0.033);
  game.lastTime = now;

  game.swingTime = Math.max(0, game.swingTime - dt);

  update(dt);
  updateCamera(dt);
  drawCourse();
  drawAimGuide();
  drawClub();
  drawBall();

  requestAnimationFrame(frame);
}

function startDrag(ev) {
  initAudio();

  if (!game.selectedCategory || game.won || !game.shotUnlocked || ballSpeed() > STOP_SPEED) return;
  if (isMultiplayer() && !isMyTurn()) return;

  const pointer = getPointerPos(ev);
  const dx = pointer.x - game.ball.x;
  const dy = pointer.y - game.ball.y;
  if (Math.hypot(dx, dy) > 34) {
    setMessage('Начни натяжку прямо от мячика.');
    return;
  }

  game.dragging = true;
  game.pointerId = ev.pointerId;
  game.dragPos = pointer;
  canvas.setPointerCapture(ev.pointerId);
}

function moveDrag(ev) {
  if (!game.dragging || game.pointerId !== ev.pointerId) return;
  game.dragPos = getPointerPos(ev);
}

function endDrag(ev) {
  if (!game.dragging || game.pointerId !== ev.pointerId) return;

  game.dragging = false;
  game.pointerId = null;
  canvas.releasePointerCapture(ev.pointerId);

  const { dx, dy, dist } = getDragVector();
  game.dragPos = null;

  if (dist < MIN_DRAG_TO_SHOT) {
    setMessage('Слишком слабый удар.');
    return;
  }

  const power = dist / MAX_DRAG;
  game.ball.vx = -(dx / dist) * game.settings.shotSpeed * power;
  game.ball.vy = -(dy / dist) * game.settings.shotSpeed * power;
  game.lastShotAngle = Math.atan2(-dy, -dx);
  game.swingTime = 0.12;
  game.ball.grounded = false;
  game.justStopped = false;
  game.shotUnlocked = false;

  game.strokes += 1;
  strokesEl.textContent = String(game.strokes);
  playShotSound(power);
  setMessage('Удар!');
}

function restartHole() {
  if (!game.selectedCategory) return;
  if (isMultiplayer()) {
    setMessage('В 1v1 рестарт лунки отключён.');
    return;
  }
  loadLevel(game.levelIndex);
}

function nextHole() {
  if (!game.selectedCategory) return;
  if (isMultiplayer()) {
    setMessage('В 1v1 переход вручную отключён.');
    return;
  }
  const nextLevel = clamp(game.levelIndex + 1, 0, game.levels.length - 1);
  loadLevel(nextLevel);
}

async function initCategoryFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const mode = params.get('mode');
  const roomCode = String(params.get('room') || '').trim().toUpperCase();
  const playerId = String(params.get('player') || '').trim();
  const categoryId = params.get('category');
  const category = CATEGORY_DEFS.find((item) => item.id === categoryId);

  if (!category) {
    window.location.replace('./menu.html');
    return false;
  }

  if (mode === 'multi') {
    if (!roomCode || !playerId) {
      window.location.replace('./menu.html');
      return false;
    }
    game.multiplayer.enabled = true;
    game.multiplayer.roomCode = roomCode;
    game.multiplayer.playerId = playerId;
    game.multiplayer.initializing = true;
  }

  game.selectedCategory = category;
  game.levels = COURSES[category.id];
  categoryEl.textContent = category.title;
  restartButton.disabled = isMultiplayer();
  nextButton.disabled = true;

  updateSettingsByDifficulty();
  setScore(0);
  setLives(0);
  loadLevel(0);

  if (!isMultiplayer()) {
    updateMultiplayerHud();
    return true;
  }

  try {
    const data = await fetchJson(`./api/room/state?room=${encodeURIComponent(roomCode)}&player=${encodeURIComponent(playerId)}`);
    const room = data.room;

    game.multiplayer.players = room.players || [];
    game.multiplayer.turnPlayerId = room.turnPlayerId || playerId;
    game.multiplayer.revision = room.revision || 0;

    for (const player of game.multiplayer.players) {
      getPlayerStats(player.id);
    }

    if (room.snapshot) {
      applySnapshot(room.snapshot);
    } else {
      applyTurnStatsToGame();
      await syncRoom({ passTurn: false, allowAnyPlayer: true });
    }

    updateMultiplayerHud();
    startMultiplayerPolling();

    if (!isMyTurn()) {
      closeQuizModal();
      setMessage('Ожидаем ход соперника...');
    } else if (!game.shotUnlocked) {
      openQuizModal('Твой ход. Реши задачу для удара.');
    }
  } catch (error) {
    setMessage(`Ошибка комнаты: ${error.message}`);
    return false;
  } finally {
    game.multiplayer.initializing = false;
  }

  return true;
}

submitAnswerBtn.addEventListener('click', handleAnswerSubmit);
newQuestionBtn.addEventListener('click', () => {
  initAudio();

  if (!game.selectedCategory) return;
  if (isMultiplayer() && !isMyTurn()) {
    setMessage('Сейчас ход соперника.');
    return;
  }
  adjustScore(-1 * game.selectedCategory.difficulty);
  playTone({ freq: 310, duration: 0.08, type: 'triangle', gain: 0.04 });
  openQuizModal('Новый вопрос.');
});

answerInputEl.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') handleAnswerSubmit();
});

restartButton.addEventListener('click', restartHole);
nextButton.addEventListener('click', nextHole);

canvas.addEventListener('pointerdown', startDrag);
canvas.addEventListener('pointermove', moveDrag);
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

window.addEventListener('pointerdown', initAudio, { once: true });
window.addEventListener('keydown', initAudio, { once: true });
window.addEventListener('resize', updateCanvasViewport);
window.addEventListener('orientationchange', updateCanvasViewport);

async function initGame() {
  updateCanvasViewport();
  const ok = await initCategoryFromUrl();
  if (ok) {
    requestAnimationFrame(frame);
  }
}

initGame();
