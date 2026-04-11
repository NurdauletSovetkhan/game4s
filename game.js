import { createAudioController } from './game-audio.js';
import { COURSES, WORLD_HEIGHT, WORLD_WIDTH, createCategoryDefs } from './game-data.js';
import { MultiplayerController } from './game/multiplayer-controller.js';
import {
  AIR_DAMPING,
  clamp,
  DESKTOP_VIEW,
  MAX_DRAG,
  MIN_DRAG_TO_SHOT,
  MOBILE_LANDSCAPE_VIEW,
  MOBILE_PORTRAIT_VIEW,
  MULTI_LIVE_SYNC_MS,
  MULTI_POLL_MS,
  parseAnswerInput,
  randInt,
  ROLL_DAMPING,
  scaledRect,
  SPIKE_STEP,
  STOP_SPEED,
  TABLET_LANDSCAPE_VIEW,
  TABLET_PORTRAIT_VIEW
} from './game/constants.js';
import { createBackgroundRenderer } from './game/render/background.js';
import { createHudRenderer } from './game/render/hud.js';
import { createPlayerAnimationRenderer } from './game/render/player-animation.js';
import { createBootstrapController } from './game/bootstrap.js';
import { createCameraViewportController } from './game/camera-viewport.js';
import { createInputController } from './game/input-controller.js';
import { createPhysicsController } from './game/physics-controller.js';
import { createQuizController } from './game/quiz-controller.js';

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

const gameBackgroundImage = new Image();
let isGameBackgroundLoaded = false;
gameBackgroundImage.src = './background.png';
gameBackgroundImage.addEventListener('load', () => {
  isGameBackgroundLoaded = true;
});

const {
  initAudio,
  playTone,
  playShotSound,
  playCorrectSound,
  playWrongSound,
  playCheckpointSound,
  playHazardSound,
  playHoleCompleteSound
} = createAudioController();

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
  awaitingStopResolution: false,
  shotsRemaining: 0,
  currentQuestion: null,
  settings: {
    gravity: 1150,
    shotSpeed: 1050,  // lower speed = easier to control
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
    stateByPlayer: {},
    revision: 0,
    pollTimer: null,
    initializing: false,
    syncInFlight: false,
    pollInFlight: false,
    lastLiveSyncAt: 0,
    pendingSync: null,
    lastNetworkErrorAt: 0,
    turnPassPending: false
  },
  backgroundStartTime: performance.now(),
  birds: [],
  lastTime: performance.now()
};

const { alignCameraToBall, updateCamera, updateCanvasViewport } = createCameraViewportController({
  game,
  canvas,
  worldWidth: WORLD_WIDTH,
  worldHeight: WORLD_HEIGHT,
  clamp,
  desktopView: DESKTOP_VIEW,
  mobilePortraitView: MOBILE_PORTRAIT_VIEW,
  mobileLandscapeView: MOBILE_LANDSCAPE_VIEW,
  tabletPortraitView: TABLET_PORTRAIT_VIEW,
  tabletLandscapeView: TABLET_LANDSCAPE_VIEW
});

const CATEGORY_DEFS = createCategoryDefs(randInt);

const { drawLiveBackground } = createBackgroundRenderer({
  ctx,
  canvas,
  game,
  gameBackgroundImage,
  isGameBackgroundLoaded: () => isGameBackgroundLoaded
});

const { drawLivesHud } = createHudRenderer({
  ctx,
  canvas,
  game,
  isMultiplayer,
  opponentPlayer,
  getTurnState
});

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

function createTurnState() {
  return {
    ball: { x: game.start.x || 0, y: game.start.y || 0, r: game.ball.r, vx: 0, vy: 0, grounded: false },
    prevBall: { x: game.start.x || 0, y: game.start.y || 0, r: game.ball.r, vx: 0, vy: 0, grounded: false },
    checkpoint: { x: game.start.x || 0, y: game.start.y || 0 },
    shotUnlocked: false,
    shotsRemaining: 0,
    justStopped: false,
    awaitingStopResolution: false,
    lastSyncTime: 0
  };
}

function getTurnState(playerId) {
  if (!playerId) return createTurnState();
  if (!game.multiplayer.stateByPlayer[playerId]) {
    game.multiplayer.stateByPlayer[playerId] = createTurnState();
  }
  return game.multiplayer.stateByPlayer[playerId];
}

function saveActiveTurnState() {
  if (!isMultiplayer()) return;
  const turnId = game.multiplayer.turnPlayerId;
  if (!turnId) return;
  const state = getTurnState(turnId);
  state.ball = { ...game.ball };
  state.checkpoint = { ...game.checkpoint };
  state.shotUnlocked = Boolean(game.shotUnlocked);
  state.shotsRemaining = Math.max(0, Math.round(game.shotsRemaining || 0));
  state.justStopped = Boolean(game.justStopped);
  state.awaitingStopResolution = Boolean(game.awaitingStopResolution);
}

function loadTurnState(playerId) {
  if (!isMultiplayer()) return;
  const state = getTurnState(playerId);
  game.ball.x = state.ball.x;
  game.ball.y = state.ball.y;
  game.ball.vx = state.ball.vx;
  game.ball.vy = state.ball.vy;
  game.ball.grounded = Boolean(state.ball.grounded);
  game.checkpoint = { ...state.checkpoint };
  game.shotUnlocked = Boolean(state.shotUnlocked);
  game.shotsRemaining = Math.max(0, Math.round(state.shotsRemaining || 0));
  game.justStopped = Boolean(state.justStopped);
  game.awaitingStopResolution = Boolean(state.awaitingStopResolution);
  alignCameraToBall();
}

function getPlayerColor(playerId) {
  if (!isMultiplayer()) return '#ffffff';
  if (!playerId) return '#ffffff';
  const index = game.multiplayer.players.findIndex((player) => player.id === playerId);
  if (index === 0) return '#fce56a';
  if (index === 1) return '#6ac7ff';
  return '#ffffff';
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
  saveActiveTurnState();
  return {
    levelIndex: game.levelIndex,
    currentPar: game.currentPar,
    strokes: game.strokes,
    score: game.score,
    lives: game.lives,
    won: game.won,
    dragging: false,
    shotUnlocked: game.shotUnlocked,
    shotsRemaining: game.shotsRemaining,
    justStopped: game.justStopped,
    start: { ...game.start },
    statsByPlayer: game.multiplayer.statsByPlayer,
    stateByPlayer: game.multiplayer.stateByPlayer
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

  if (snapshot.start) {
    game.start = { ...snapshot.start };
  }

  if (snapshot.statsByPlayer && typeof snapshot.statsByPlayer === 'object') {
    game.multiplayer.statsByPlayer = snapshot.statsByPlayer;
  }

  const now = performance.now();
  if (snapshot.stateByPlayer && typeof snapshot.stateByPlayer === 'object') {
    for (const playerId in snapshot.stateByPlayer) {
      const newState = snapshot.stateByPlayer[playerId];
      const oldState = game.multiplayer.stateByPlayer[playerId];
      if (oldState && oldState.ball) {
        newState.prevBall = { ...oldState.ball };
      }
      newState.lastSyncTime = now;
    }
    game.multiplayer.stateByPlayer = snapshot.stateByPlayer;
  }

  if (isMultiplayer() && game.multiplayer.turnPlayerId) {
    loadTurnState(game.multiplayer.turnPlayerId);
  }

  applyTurnStatsToGame();
  updateMultiplayerHud();
}

let multiplayerController = null;

function initMultiplayerController() {
  multiplayerController = new MultiplayerController({
    game,
    pollMs: MULTI_POLL_MS,
    liveSyncMs: MULTI_LIVE_SYNC_MS,
    stopSpeed: STOP_SPEED,
    hooks: {
      serializeSnapshot,
      applySnapshot,
      saveActiveTurnState,
      loadTurnState,
      applyTurnStatsToGame,
      updateMultiplayerHud,
      isMyTurn,
      closeQuizModal,
      currentTurnPlayer,
      setMessage,
      openQuizModal,
      ballSpeed,
      isQuizModalHidden: () => Boolean(quizModalEl.hidden)
    }
  });
}

async function fetchJson(url, options) {
  return multiplayerController.fetchJson(url, options);
}

async function syncRoom(options = {}) {
  return multiplayerController.syncRoom(options);
}

function startMultiplayerPolling() {
  multiplayerController.startMultiplayerPolling();
}

function endTurnAndSync(reasonText) {
  multiplayerController.endTurnAndSync(reasonText);
}

function maybeSyncLive(nowMs) {
  multiplayerController.maybeSyncLive(nowMs);
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

function ballSpeed() {
  return Math.hypot(game.ball.vx, game.ball.vy);
}

function worldToScreenX(x) {
  return x - game.camera.x;
}

function worldToScreenY(y) {
  return y - game.camera.y;
}

function updateSettingsByDifficulty() {
  const d = game.selectedCategory.difficulty;
  game.settings.gravity = 960 + d * 85;
  game.settings.shotSpeed = 1150 - d * 45;  // easier difficulty = slower shots
  game.settings.restitution = clamp(0.66 - d * 0.035, 0.42, 0.66);
  game.settings.spikeHeight = 20 + d * 3;
  game.settings.waterScale = 0.72 + d * 0.05;
}

const { openQuizModal, closeQuizModal, handleAnswerSubmit } = createQuizController({
  game,
  quizModalEl,
  questionLabelEl,
  answerInputEl,
  initAudio,
  parseAnswerInput,
  setMessage,
  isMultiplayer,
  isMyTurn,
  adjustScore,
  addLives,
  playCorrectSound,
  playWrongSound,
  saveActiveTurnState,
  syncRoom
});

const { getDragVector, startDrag, moveDrag, endDrag } = createInputController({
  game,
  canvas,
  maxDrag: MAX_DRAG,
  minDragToShot: MIN_DRAG_TO_SHOT,
  stopSpeed: STOP_SPEED,
  initAudio,
  setMessage,
  isMultiplayer,
  isMyTurn,
  ballSpeed,
  playShotSound,
  saveActiveTurnState,
  syncRoom,
  strokesEl
});

const { resetBallToCheckpoint, loadLevel, finishLevel, update } = createPhysicsController({
  game,
  canvas,
  worldWidth: WORLD_WIDTH,
  worldHeight: WORLD_HEIGHT,
  stopSpeed: STOP_SPEED,
  rollDamping: ROLL_DAMPING,
  airDamping: AIR_DAMPING,
  clamp,
  scaledRect,
  isMultiplayer,
  isMyTurn,
  loadTurnState,
  saveActiveTurnState,
  playHazardSound,
  playCheckpointSound,
  playHoleCompleteSound,
  setMessage,
  syncRoom,
  endTurnAndSync,
  openQuizModal,
  addLives,
  adjustScore,
  nextButton,
  levelEl,
  parEl,
  strokesEl,
  ballSpeed,
  alignCameraToBall
});

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

function drawCourse() {
  const level = game.levels[game.levelIndex];

  drawLiveBackground();

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

const { frame } = createPlayerAnimationRenderer({
  ctx,
  game,
  maxDrag: MAX_DRAG,
  multiPollMs: MULTI_POLL_MS,
  worldToScreenX,
  worldToScreenY,
  getDragVector,
  getTurnState,
  getPlayerColor,
  isMultiplayer,
  isMyTurn,
  maybeSyncLive,
  update,
  updateCamera,
  drawCourse
});

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
    game.multiplayer.pollInFlight = false;
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
      getTurnState(player.id);
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

const { bindUiEvents, initGame } = createBootstrapController({
  initAudio,
  submitAnswerBtn,
  handleAnswerSubmit,
  newQuestionBtn,
  game,
  isMultiplayer,
  isMyTurn,
  setMessage,
  adjustScore,
  playTone,
  openQuizModal,
  answerInputEl,
  restartButton,
  restartHole,
  nextButton,
  nextHole,
  canvas,
  startDrag,
  moveDrag,
  endDrag,
  updateCanvasViewport,
  initMultiplayerController,
  initCategoryFromUrl,
  frame
});

bindUiEvents();
initGame();
