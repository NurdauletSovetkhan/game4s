const categories = [
  { id: 'arith', title: 'Базовая арифметика', difficulty: 1, description: '+, -, ×, ÷' },
  { id: 'fractions', title: 'Дроби', difficulty: 2, description: 'Сложение и вычитание дробей' },
  { id: 'percent', title: 'Проценты', difficulty: 3, description: '% от числа и скидки' },
  { id: 'powers', title: 'Степени и корни', difficulty: 4, description: 'Квадраты, кубы, корни' },
  { id: 'equations', title: 'Линейные уравнения', difficulty: 5, description: 'ax + b = c' },
  { id: 'trig', title: 'Тригонометрия', difficulty: 6, description: 'sin / cos / tan' }
];

const menuGridEl = document.getElementById('menuGrid');
const joinRoomBtn = document.getElementById('joinRoom');
const roomCodeEl = document.getElementById('roomCode');
const playerNameEl = document.getElementById('playerName');
const menuStatusEl = document.getElementById('menuStatus');
const singleModeBtn = document.getElementById('singleModeBtn');
const multiModeBtn = document.getElementById('multiModeBtn');
const multiplayerPanelEl = document.querySelector('.multiplayer-panel');

let audioCtx = null;
let selectedMode = 'single';

function ensureAudio() {
  if (audioCtx) return audioCtx;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  audioCtx = new Ctx();
  return audioCtx;
}

function playMenuClick() {
  const ctx = ensureAudio();
  if (!ctx) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'triangle';
  osc.frequency.setValueAtTime(480, now);
  osc.frequency.linearRampToValueAtTime(700, now + 0.08);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.06, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.12);
}

window.addEventListener('pointerdown', ensureAudio, { once: true });
window.addEventListener('keydown', ensureAudio, { once: true });

function getPlayerName() {
  const value = String(playerNameEl?.value || '').trim();
  if (!value) return 'Игрок';
  return value.slice(0, 24);
}

function setStatus(text) {
  if (menuStatusEl) menuStatusEl.textContent = text;
}

function updateModeUi() {
  const single = selectedMode === 'single';
  if (singleModeBtn) {
    singleModeBtn.classList.toggle('is-active', single);
    singleModeBtn.setAttribute('aria-pressed', String(single));
  }
  if (multiModeBtn) {
    multiModeBtn.classList.toggle('is-active', !single);
    multiModeBtn.setAttribute('aria-pressed', String(!single));
  }
  if (multiplayerPanelEl) {
    multiplayerPanelEl.hidden = single;
  }
  setStatus(single ? 'Выбран одиночный режим. Выбери категорию для старта.' : 'Выбран онлайн 1v1. Введи код комнаты или создай новую через категорию.');
}

function selectMode(mode) {
  selectedMode = mode === 'multi' ? 'multi' : 'single';
  updateModeUi();
}

function startSinglePlayer(categoryId) {
  const params = new URLSearchParams({
    mode: 'single',
    category: categoryId
  });
  window.location.href = `./index.html?${params.toString()}`;
}

async function createRoom(categoryId) {
  setStatus('Создаю комнату…');
  const response = await fetch('./api/room/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category: categoryId, name: getPlayerName() })
  });

  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(data.error || 'Не удалось создать комнату');
  }

  const params = new URLSearchParams({
    mode: 'multi',
    room: data.roomCode,
    player: data.playerId,
    category: data.category
  });
  window.location.href = `./index.html?${params.toString()}`;
}

async function joinRoom() {
  const roomCode = String(roomCodeEl?.value || '').trim().toUpperCase();
  if (!roomCode) {
    setStatus('Введи код комнаты.');
    return;
  }

  setStatus('Подключаюсь к комнате…');

  const response = await fetch('./api/room/join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roomCode, name: getPlayerName() })
  });

  const data = await response.json();
  if (!response.ok || !data.ok) {
    setStatus(data.error || 'Не удалось войти в комнату.');
    return;
  }

  const params = new URLSearchParams({
    mode: 'multi',
    room: data.roomCode,
    player: data.playerId,
    category: data.category
  });
  window.location.href = `./index.html?${params.toString()}`;
}

joinRoomBtn?.addEventListener('click', () => {
  playMenuClick();
  setTimeout(() => {
    joinRoom();
  }, 90);
});

singleModeBtn?.addEventListener('click', () => {
  playMenuClick();
  selectMode('single');
});

multiModeBtn?.addEventListener('click', () => {
  playMenuClick();
  selectMode('multi');
});

roomCodeEl?.addEventListener('input', () => {
  roomCodeEl.value = roomCodeEl.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
});

roomCodeEl?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') joinRoom();
});

for (const category of categories) {
  const button = document.createElement('button');
  button.className = 'cat-btn';
  button.innerHTML = `<span class="cat-btn__title">${category.title}</span><span class="cat-btn__meta">Сложность ${category.difficulty} · ${category.description}</span>`;
  button.addEventListener('click', async () => {
    playMenuClick();
    await new Promise((resolve) => setTimeout(resolve, 90));
    if (selectedMode === 'single') {
      startSinglePlayer(category.id);
      return;
    }
    try {
      await createRoom(category.id);
    } catch (error) {
      setStatus(error.message || 'Ошибка при создании комнаты.');
    }
  });
  menuGridEl.appendChild(button);
}

updateModeUi();
